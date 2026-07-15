'use client'
// 프로젝트 문서철의 표시와 클릭 동작을 관리하는 컴포넌트.

import React, { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { HoradricCubeOpeningEffect } from './HoradricCubeOpeningEffect'
import { prefetchMaterialLedgerSnapshot } from '@/lib/material-ledger-prefetch'

// 모든 서류철이 공유하는 마우스 오버 효과음 — 인스턴스마다 새로 디코딩하지 않도록 모듈 레벨에서 1회 생성·프리로드
const boxHoverSound = typeof window !== 'undefined' ? new Audio('/kave_msri-box-sfx-323776.mp3') : null
if (boxHoverSound) boxHoverSound.preload = 'auto'

const HORADRIC_OPENING_MS = 1950
const REDUCED_MOTION_OPENING_MS = 220
const CINEMATIC_FALLBACK_MS = 1200

const resetMaterialLedgerCinematic = () => {
  if (typeof document === 'undefined') return
  document.body.classList.remove('material-ledger-cinematic-active')
  document.body.style.removeProperty('--material-ledger-origin-x')
  document.body.style.removeProperty('--material-ledger-origin-y')
}

interface DocumentFolderProps {
  title: string
  year?: string
  isActive?: boolean
  onClick?: () => void
  projectId?: string
  externalUrl?: string
  projectName?: string
  managingBranch?: string
  isProjectActive?: boolean
  isPending?: boolean // 준비중 상태
  isAncientDocument?: boolean // 고대 문서 스타일 (디아블로 테마)
  badgeCount?: number // 우측 상단 뱃지 숫자
  badgeVariant?: 'red' | 'blue' // 뱃지 색상 (기본값은 기존 빨간색)
  docCount?: number // 서류명 하단 건수 표시 (예: (2))
  pdcaCategory?: 'P' | 'D' | 'C' | 'A' // PDCA 그룹 색상
  bottomLabel?: string // 하단 라벨 커스텀 (기본: "안전")
}

const DocumentFolder: React.FC<DocumentFolderProps> = ({
  title,
  year = new Date().getFullYear().toString(),
  isActive = false,
  onClick,
  projectId,
  externalUrl,
  projectName,
  managingBranch,
  isProjectActive = true,
  isPending = false,
  isAncientDocument = false,
  badgeCount,
  badgeVariant = 'red',
  docCount,
  pdcaCategory,
  bottomLabel
}) => {
  const router = useRouter()
  const [isMaterialLedgerOpening, setIsMaterialLedgerOpening] = useState(false)
  const openingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const openingLockRef = useRef(false)
  const openingCancelledRef = useRef(false)
  const isMaterialLedger = title.replace(/\s/g, '') === '자재수불부'

  useEffect(() => {
    return () => {
      openingCancelledRef.current = true
      if (openingTimerRef.current) clearTimeout(openingTimerRef.current)
      if (openingLockRef.current) resetMaterialLedgerCinematic()
    }
  }, [])

  const playHoverSound = () => {
    if (!boxHoverSound) return
    boxHoverSound.currentTime = 0
    boxHoverSound.play().catch(() => {})
  }

  const runClickAction = () => {
    if (title === '폭염대비점검' && projectId) {
      router.push(`/project/${projectId}/heatwave`)
    } else if (title === '관리자 일상점검') {
      // 관리자 일상점검은 onClick 핸들러를 통해 처리
      if (onClick) {
        onClick()
      }
    } else if (externalUrl) {
      window.open(externalUrl, '_blank', 'noopener,noreferrer')
    } else if (onClick) {
      onClick()
    }
  }

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (openingLockRef.current) return

    // 준비중 상태인 경우
    if (isPending) {
      alert('준비중입니다.')
      return
    }

    // 폭염대비점검이나 TBM 관련 문서철이고 프로젝트가 비활성 상태인 경우
    if ((title === '폭염대비점검' || title.includes('TBM')) && !isProjectActive) {
      alert('공사중지 상태에서는 사용할 수 없습니다.')
      return
    }

    if (!isMaterialLedger) {
      runClickAction()
      return
    }

    openingLockRef.current = true
    openingCancelledRef.current = false
    const folderBounds = event.currentTarget.getBoundingClientRect()
    document.body.style.setProperty('--material-ledger-origin-x', `${folderBounds.left + folderBounds.width / 2}px`)
    document.body.style.setProperty('--material-ledger-origin-y', `${folderBounds.top + folderBounds.height / 2}px`)
    document.body.classList.add('material-ledger-cinematic-active')
    setIsMaterialLedgerOpening(true)

    const prefersReducedMotion = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const openingDuration = prefersReducedMotion ? REDUCED_MOTION_OPENING_MS : HORADRIC_OPENING_MS
    const materialLedgerPath = projectId ? `/project/${projectId}/material-ledger` : null
    if (materialLedgerPath) router.prefetch(materialLedgerPath)
    const snapshotPromise = projectId
      ? prefetchMaterialLedgerSnapshot(projectId)
      : Promise.resolve(null)

    openingTimerRef.current = setTimeout(() => {
      openingTimerRef.current = null
      void snapshotPromise
        .catch((prefetchError: unknown) => {
          console.error('자재 수불부 사전 로드 실패:', prefetchError)
        })
        .then(() => {
          if (openingCancelledRef.current) return
          openingTimerRef.current = setTimeout(() => {
            openingTimerRef.current = null
            openingLockRef.current = false
            resetMaterialLedgerCinematic()
            setIsMaterialLedgerOpening(false)
          }, CINEMATIC_FALLBACK_MS)
          runClickAction()
        })
    }, openingDuration)
  }

  // 지사 안전점검과 본부 안전점검 문서철의 특별한 색상 정의
  const isManagerInspection = title === '︵지사︶ 안전점검'
  const isHeadquartersInspection = title === '︵본부︶ 안전점검'
  const isSafetyInspectionLedger = title.includes('안전점검') && title.includes('관리대장')
  const isSpecialInspection = isManagerInspection || isHeadquartersInspection || isSafetyInspectionLedger
  // TBM안전활동 점검표만 분홍색으로 표시 (일일안전교육 TBM일지는 제외)
  const isTBMInspectionFolder = title.includes('TBM안전활동') || title.includes('TBM 안전활동')
  const isDisabled = (title === '폭염대비점검' || title.includes('TBM')) && !isProjectActive

  let folderBgColor, folderTabColor
  if (isPending || isDisabled) {
    // 준비중이거나 비활성화된 경우 회색으로 표시
    folderBgColor = 'bg-gray-200'
    folderTabColor = 'bg-gray-300'
  } else if (pdcaCategory === 'P') {
    folderBgColor = 'bg-pink-200'
    folderTabColor = 'bg-pink-300'
  } else if (pdcaCategory === 'C') {
    folderBgColor = 'bg-sky-300'
    folderTabColor = 'bg-sky-400'
  } else if (pdcaCategory === 'A') {
    folderBgColor = 'bg-lime-300'
    folderTabColor = 'bg-lime-400'
  } else if (isTBMInspectionFolder) {
    folderBgColor = 'bg-pink-200'
    folderTabColor = 'bg-pink-300'
  } else if (isSpecialInspection) {
    folderBgColor = 'bg-sky-300'
    folderTabColor = 'bg-sky-400'
  } else {
    folderBgColor = 'bg-yellow-100'
    folderTabColor = 'bg-yellow-200'
  }

  const isGrayedOut = isPending || isDisabled

  // 고대 문서 스타일 (디아블로 테마) - 특별한 렌더링
  if (isAncientDocument) {
    return (
      <div
        data-folder
        className={`
          relative w-[60px] h-56 sm:w-[68px] lg:w-[80px] lg:h-96 transition-all duration-200
          cursor-pointer hover:scale-105
          ${isActive ? 'z-10' : 'z-0'}
        `}
        onClick={handleClick}
        onMouseEnter={playHoverSound}
      >
        {/* 고대 두루마리/문서 본체 */}
        <div
          className="w-full h-full relative rounded-sm overflow-hidden"
          style={{
            background: 'linear-gradient(180deg, #3a2a1a 0%, #2a1a0a 50%, #1a0a00 100%)',
            border: '3px solid #8b6914',
            boxShadow: 'inset 0 0 20px rgba(0,0,0,0.8), 0 8px 20px rgba(0,0,0,0.6), 0 0 12px rgba(139,105,20,0.3)'
          }}
        >
          {/* 상단 골드 장식 */}
          <div
            className="absolute top-0 left-0 right-0 h-3"
            style={{
              background: 'linear-gradient(90deg, #5a4510 0%, #d4a520 25%, #f5d78e 50%, #d4a520 75%, #5a4510 100%)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3), 0 2px 4px rgba(0,0,0,0.5)'
            }}
          />

          {/* 고대 문양 장식 (좌우) */}
          <div
            className="absolute left-0 top-3 bottom-3 w-2"
            style={{
              background: 'linear-gradient(180deg, #8b6914 0%, #5a4510 50%, #8b6914 100%)',
              boxShadow: 'inset -1px 0 2px rgba(0,0,0,0.3)'
            }}
          />
          <div
            className="absolute right-0 top-3 bottom-3 w-2"
            style={{
              background: 'linear-gradient(180deg, #8b6914 0%, #5a4510 50%, #8b6914 100%)',
              boxShadow: 'inset 1px 0 2px rgba(0,0,0,0.3)'
            }}
          />

          {/* 문서 내용 영역 */}
          <div
            className="flex flex-col h-full p-2 lg:p-3 justify-between mx-2"
            style={{ marginTop: '12px', marginBottom: '12px' }}
          >
            {/* 제목 */}
            <div className="flex-1 flex items-center justify-center overflow-hidden">
              <div
                className="rounded-sm p-1 m-1 w-full h-full flex items-center justify-center"
                style={{
                  background: 'linear-gradient(180deg, #2a1a08 0%, rgba(42,26,8,0.8) 100%)',
                  border: '1px solid #8b6914',
                  boxShadow: 'inset 0 0 10px rgba(0,0,0,0.5)'
                }}
              >
                <div className="flex justify-center items-center h-full w-full">
                  {/* 세로 텍스트 렌더링 */}
                  <div className="flex flex-col items-center justify-center space-y-0 h-full w-full px-1">
                    {title.split('\n').map((line, lineIndex) => (
                      <div key={lineIndex} className="flex flex-col items-center justify-center w-full">
                        {line.split('').map((char, charIndex) => (
                          <div
                            key={charIndex}
                            className="text-xs lg:text-sm font-bold h-3 lg:h-4 flex items-center justify-center mb-0.5 lg:mb-1"
                            style={{
                              color: '#f5d78e',
                              textShadow: '0 1px 2px rgba(0,0,0,0.8), 0 0 8px rgba(245,215,142,0.3)',
                              fontFamily: 'serif'
                            }}
                          >
                            {char}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* 하단 년도 */}
            <div
              className="pt-1 lg:pt-2 mt-1 lg:mt-2"
              style={{ borderTop: '1px solid #8b6914' }}
            >
              <div
                className="text-center text-xs lg:text-sm font-bold"
                style={{ color: '#d4a520', fontFamily: 'serif', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}
              >
                {year}
              </div>
              <div
                className="text-center text-xs lg:text-sm mt-0.5 lg:mt-1"
                style={{ color: '#8b6914', fontFamily: 'serif' }}
              >
                ⚔ 관리 ⚔
              </div>
            </div>
          </div>

          {/* 하단 골드 장식 */}
          <div
            className="absolute bottom-0 left-0 right-0 h-3"
            style={{
              background: 'linear-gradient(90deg, #5a4510 0%, #d4a520 25%, #f5d78e 50%, #d4a520 75%, #5a4510 100%)',
              boxShadow: 'inset 0 -1px 0 rgba(255,255,255,0.3), 0 -2px 4px rgba(0,0,0,0.5)'
            }}
          />

          {/* 코너 장식 (보석 스타일) */}
          <div
            className="absolute top-1 left-1 w-2 h-2 rounded-full"
            style={{
              background: 'radial-gradient(circle at 30% 30%, #ff6b6b 0%, #8b0000 70%, #5a0000 100%)',
              boxShadow: '0 0 4px rgba(255,107,107,0.5)'
            }}
          />
          <div
            className="absolute top-1 right-1 w-2 h-2 rounded-full"
            style={{
              background: 'radial-gradient(circle at 30% 30%, #ff6b6b 0%, #8b0000 70%, #5a0000 100%)',
              boxShadow: '0 0 4px rgba(255,107,107,0.5)'
            }}
          />
          <div
            className="absolute bottom-1 left-1 w-2 h-2 rounded-full"
            style={{
              background: 'radial-gradient(circle at 30% 30%, #ff6b6b 0%, #8b0000 70%, #5a0000 100%)',
              boxShadow: '0 0 4px rgba(255,107,107,0.5)'
            }}
          />
          <div
            className="absolute bottom-1 right-1 w-2 h-2 rounded-full"
            style={{
              background: 'radial-gradient(circle at 30% 30%, #ff6b6b 0%, #8b0000 70%, #5a0000 100%)',
              boxShadow: '0 0 4px rgba(255,107,107,0.5)'
            }}
          />
        </div>

        {/* 뱃지 */}
        {badgeCount != null && badgeCount > 0 && (
          <div className={`absolute -top-4 -right-2 lg:-top-5 lg:-right-3 z-20 flex items-center justify-center min-w-5 h-5 lg:min-w-6 lg:h-6 px-1 text-white text-xs lg:text-sm font-bold rounded-full shadow-lg border-2 border-white ${badgeVariant === 'blue' ? 'bg-blue-500' : 'bg-red-500'}`}>
            {badgeCount}
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      data-folder
      className={`
        relative w-[60px] h-56 sm:w-[68px] lg:w-[80px] lg:h-96 transition-all duration-200
        ${isGrayedOut ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:scale-105'}
        ${isMaterialLedgerOpening ? 'z-50' : isActive ? 'z-10' : 'z-0'}
      `}
      onClick={handleClick}
      onMouseEnter={playHoverSound}
      aria-busy={isMaterialLedgerOpening || undefined}
    >
      {/* 문서철 본체 */}
      <div className={`
        w-full h-full border-2 ${isGrayedOut ? 'border-gray-300' : 'border-gray-400'} ${folderBgColor} relative
        ${isActive ? 'shadow-lg border-blue-500' : isGrayedOut ? 'shadow-sm' : 'shadow-md hover:shadow-lg'}
      `}
        style={!isGrayedOut && pdcaCategory === 'P' ? { backgroundColor: 'rgb(215, 170, 175)' } : !isGrayedOut && pdcaCategory === 'A' ? { backgroundColor: 'rgb(180, 205, 100)' } : !isGrayedOut && (pdcaCategory === 'C' || isSpecialInspection) ? { backgroundColor: 'rgb(88, 190, 213)' } : {}}
      >
        {/* 문서철 상단 - 종이 묶음이 보이는 윗면 */}
        <div
          className="absolute -top-3 lg:-top-4 left-0 right-0 h-5 lg:h-7 overflow-hidden"
          style={{
            clipPath: 'polygon(10% 0%, 90% 0%, 98% 100%, 2% 100%)',
          }}
        >
          {/* 배경 - 폴더 색상 그라데이션 */}
          <div
            className={`absolute inset-0 ${folderTabColor}`}
            style={{
              background: (() => {
                if (isGrayedOut) return 'linear-gradient(180deg, rgb(180,180,180) 0%, rgb(200,200,200) 100%)'
                if (pdcaCategory === 'P') return 'linear-gradient(180deg, rgb(175,130,135) 0%, rgb(195,150,155) 100%)'
                if (pdcaCategory === 'A') return 'linear-gradient(180deg, rgb(140,165,60) 0%, rgb(160,185,80) 100%)'
                if (pdcaCategory === 'C' || isSpecialInspection) return 'linear-gradient(180deg, rgb(48,150,173) 0%, rgb(68,170,193) 100%)'
                return 'linear-gradient(180deg, rgb(200,185,130) 0%, rgb(220,205,150) 100%)'
              })(),
            }}
          />
          {/* 종이 장들 - 불규칙한 두께와 높이로 리얼하게 */}
          <div className="absolute inset-0">
            {(() => {
              const pages = [
                { pos: 14, rot: 5.5, h: 75, w: 1.5, color: 'rgba(255,255,255,0.95)' },
                { pos: 18, rot: 4.8, h: 85, w: 1, color: 'rgba(250,248,240,0.9)' },
                { pos: 21, rot: 4.2, h: 70, w: 1.5, color: 'rgba(255,255,255,0.85)' },
                { pos: 24, rot: 3.6, h: 90, w: 1, color: 'rgba(245,243,235,0.9)' },
                { pos: 27, rot: 3.1, h: 65, w: 1.5, color: 'rgba(255,255,255,0.95)' },
                { pos: 30, rot: 2.5, h: 80, w: 1, color: 'rgba(252,250,242,0.85)' },
                { pos: 33, rot: 2.0, h: 88, w: 1.5, color: 'rgba(255,255,255,0.9)' },
                { pos: 36, rot: 1.5, h: 72, w: 1, color: 'rgba(248,246,238,0.9)' },
                { pos: 39, rot: 1.0, h: 85, w: 1.5, color: 'rgba(255,255,255,0.95)' },
                { pos: 42, rot: 0.5, h: 78, w: 1, color: 'rgba(250,248,240,0.85)' },
                { pos: 45, rot: 0.2, h: 90, w: 1.5, color: 'rgba(255,255,255,0.9)' },
                { pos: 48, rot: 0, h: 82, w: 1, color: 'rgba(245,243,235,0.9)' },
                { pos: 51, rot: -0.2, h: 88, w: 1.5, color: 'rgba(255,255,255,0.95)' },
                { pos: 54, rot: -0.5, h: 70, w: 1, color: 'rgba(252,250,242,0.85)' },
                { pos: 57, rot: -1.0, h: 85, w: 1.5, color: 'rgba(255,255,255,0.9)' },
                { pos: 60, rot: -1.5, h: 78, w: 1, color: 'rgba(248,246,238,0.9)' },
                { pos: 63, rot: -2.0, h: 90, w: 1.5, color: 'rgba(255,255,255,0.95)' },
                { pos: 66, rot: -2.5, h: 68, w: 1, color: 'rgba(250,248,240,0.85)' },
                { pos: 69, rot: -3.1, h: 82, w: 1.5, color: 'rgba(255,255,255,0.9)' },
                { pos: 72, rot: -3.6, h: 88, w: 1, color: 'rgba(245,243,235,0.9)' },
                { pos: 75, rot: -4.2, h: 74, w: 1.5, color: 'rgba(255,255,255,0.95)' },
                { pos: 78, rot: -4.8, h: 85, w: 1, color: 'rgba(252,250,242,0.85)' },
                { pos: 82, rot: -5.5, h: 80, w: 1.5, color: 'rgba(255,255,255,0.9)' },
              ]
              return pages.map((p, i) => (
                <React.Fragment key={i}>
                  {/* 종이 그림자 */}
                  <div
                    className="absolute"
                    style={{
                      left: `${p.pos + 0.3}%`,
                      bottom: 0,
                      height: `${p.h}%`,
                      width: `${p.w + 0.5}px`,
                      backgroundColor: 'rgba(0,0,0,0.15)',
                      transform: `rotate(${p.rot}deg)`,
                      transformOrigin: 'bottom center',
                    }}
                  />
                  {/* 종이 */}
                  <div
                    className="absolute"
                    style={{
                      left: `${p.pos}%`,
                      bottom: 0,
                      height: `${p.h}%`,
                      width: `${p.w}px`,
                      backgroundColor: p.color,
                      transform: `rotate(${p.rot}deg)`,
                      transformOrigin: 'bottom center',
                      boxShadow: '0 0 1px rgba(0,0,0,0.1)',
                    }}
                  />
                </React.Fragment>
              ))
            })()}
          </div>
          {/* 상단 가장자리 하이라이트 */}
          <div
            className="absolute top-0 left-[10%] right-[10%] h-[1px]"
            style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 30%, rgba(255,255,255,0.5) 50%, rgba(255,255,255,0.4) 70%, transparent 100%)' }}
          />
          {/* 하단 그림자 (폴더 본체와의 경계) */}
          <div
            className="absolute bottom-0 left-0 right-0 h-[2px]"
            style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.05) 100%)' }}
          />
        </div>

        {/* 문서철 내용 */}
        <div className="flex flex-col h-full p-2 lg:p-4 justify-between">
          {/* 제목 */}
          <div className="flex-1 flex items-center justify-center overflow-hidden">
            <div className="bg-white border border-gray-200 rounded-sm p-1 m-1 w-full h-full flex flex-col items-center justify-center" style={{ fontFamily: 'ChosunBg, serif' }}>
              <div className="flex justify-center items-center w-full flex-1 min-h-0">
                {title && (() => {
                  // 줄바꿈이 있는 경우 처리
                  const lines = title.split('\n')

                  // 글자 수 기반 장평/높이 계산 함수
                  const getCompactStyle = (count: number) => {
                    const compact = count > 8
                    const veryCompact = count > 12
                    return {
                      charScale: veryCompact ? 'scaleY(0.75)' : compact ? 'scaleY(0.85)' : undefined,
                      charHeight: veryCompact ? 'h-2 lg:h-3.5' : compact ? 'h-2.5 lg:h-3.5' : 'h-3 lg:h-4',
                      smallCharHeight: veryCompact ? 'h-1.5 lg:h-2.5' : compact ? 'h-2 lg:h-2.5' : 'h-2.5 lg:h-3',
                      // 글자 수가 많으면 모바일에서 세로 간격을 없애 잘림 방지 (데스크톱 lg는 유지)
                      charMargin: (compact || veryCompact) ? 'mb-0 lg:mb-1' : 'mb-0.5 lg:mb-1',
                    }
                  }

                  // 전체 글자 수 (멀티라인용)
                  const totalCharCount = lines.reduce((sum, line) => {
                    const cleaned = line.replace(/[︵︶\s]/g, '')
                    return sum + cleaned.length
                  }, 0)
                  const multiLineStyle = getCompactStyle(totalCharCount)

                  // 줄바꿈이 있는 경우 각 줄을 단어 단위로 처리
                  if (lines.length > 1) {
                    // 한 줄이 길어 세로로 쌓으면 넘치는 2줄 제목(예: ︵공사·용역︶ 7자)은
                    // 두 열로 나눠 글씨 포인트를 줄여 표시 — 모바일 세로 잘림 방지
                    const maxLineLen = Math.max(...lines.map(l => l.replace(/\s+/g, '').length))
                    if (lines.length === 2 && maxLineLen >= 7) {
                      return (
                        <div className="flex space-x-1 justify-center h-full w-full px-1">
                          {lines.map((line, lineIndex) => {
                            const isSmallText = line.startsWith('︵') && line.endsWith('︶')
                            const chars = line.replace(/\s+/g, '').split('')
                            return (
                              // 세로 여백이 남지 않도록 열이 박스 높이를 채우고 글자 사이에 공간을 고르게 분배
                              <div key={lineIndex} className="flex flex-col items-center justify-evenly h-full">
                                {chars.map((char, charIndex) => (
                                  <div
                                    key={charIndex}
                                    className={`${isSmallText ? 'text-[10px] lg:text-sm' : 'text-xs lg:text-base'} leading-none font-medium ${isGrayedOut ? 'text-gray-500' : 'text-gray-800'} flex items-center justify-center`}
                                  >
                                    {char}
                                  </div>
                                ))}
                              </div>
                            )
                          })}
                        </div>
                      )
                    }
                    return (
                      <div className="flex flex-col items-center justify-center space-y-0 h-full w-full px-1">
                        {lines.map((line, lineIndex) => {
                          // 전각 괄호 ︵︶ 안의 텍스트인지 확인
                          const isSmallText = line.startsWith('︵') && line.endsWith('︶')

                          // 각 줄을 단어 단위로 분리 (공백 기준)
                          const words = line.split(/\s+/).filter(word => word.length > 0)

                          return (
                            <React.Fragment key={lineIndex}>
                              {lineIndex > 0 && !isSmallText && (
                                <div className="w-3/4 border-t border-gray-300 my-1" />
                              )}
                              <div className="flex flex-col items-center justify-center w-full">
                              {words.map((word, wordIndex) => {
                                const chars = word.split('')
                                // 긴 단어(4글자 이상)는 자간을 줄여서 표시
                                const isLongWord = chars.length >= 4

                                return (
                                  <div
                                    key={wordIndex}
                                    className={`flex flex-col items-center justify-center ${wordIndex < words.length - 1 ? 'mb-0.5' : ''}`}
                                    style={isLongWord ? { letterSpacing: '-0.5px' } : {}}
                                  >
                                    {chars.map((char, charIndex) => (
                                      <div
                                        key={charIndex}
                                        className={`${isSmallText ? 'text-[10px] lg:text-xs' : 'text-xs lg:text-sm'} font-medium ${isGrayedOut ? 'text-gray-500' : 'text-gray-800'} ${isSmallText ? multiLineStyle.smallCharHeight : multiLineStyle.charHeight} flex items-center justify-center ${multiLineStyle.charMargin}`}
                                        style={multiLineStyle.charScale ? { transform: multiLineStyle.charScale } : undefined}
                                      >
                                        {char}
                                      </div>
                                    ))}
                                  </div>
                                )
                              })}
                              </div>
                            </React.Fragment>
                          )
                        })}
                      </div>
                    )
                  }

                  // 줄바꿈이 없는 경우 단어 단위로 처리
                  const words = title.split(/\s+/).filter(word => word.length > 0)

                  // 모든 단어의 총 글자 수 계산
                  const totalChars = words.reduce((sum, word) => sum + word.length, 0)
                  const maxSingleColumnChars = 12

                  // 글자 수가 적으면 1열로, 많으면 2열로 표시
                  if (totalChars <= maxSingleColumnChars) {
                    // 1열 표시 - 단어 단위로 세로 나열
                    return (
                      <div className="flex flex-col items-center justify-center h-full w-full px-1">
                        {words.map((word, wordIndex) => {
                          const chars = word.split('')
                          const isLongWord = chars.length >= 4

                          return (
                            <div
                              key={wordIndex}
                              className={`flex flex-col items-center justify-center ${wordIndex < words.length - 1 ? 'mb-0.5' : ''}`}
                              style={isLongWord ? { letterSpacing: '-0.5px' } : {}}
                            >
                              {chars.map((char, charIndex) => (
                                <div
                                  key={charIndex}
                                  className={`text-xs lg:text-sm font-medium ${isGrayedOut ? 'text-gray-500' : 'text-gray-800'} h-3 lg:h-4 flex items-center justify-center mb-0.5 lg:mb-1`}
                                >
                                  {char}
                                </div>
                              ))}
                            </div>
                          )
                        })}
                      </div>
                    )
                  } else {
                    // 2열 표시 - 단어를 두 그룹으로 나눔
                    let firstColumnChars = 0
                    const midPoint = Math.ceil(totalChars / 2)
                    let splitIndex = 0

                    for (let i = 0; i < words.length; i++) {
                      if (firstColumnChars + words[i].length >= midPoint) {
                        splitIndex = i
                        break
                      }
                      firstColumnChars += words[i].length
                    }

                    const firstColumnWords = words.slice(0, splitIndex || Math.ceil(words.length / 2))
                    const secondColumnWords = words.slice(splitIndex || Math.ceil(words.length / 2))

                    // 각 열의 글자 수로 개별 장평 계산
                    const col1Chars = firstColumnWords.reduce((s, w) => s + w.length, 0)
                    const col2Chars = secondColumnWords.reduce((s, w) => s + w.length, 0)
                    const col1Style = getCompactStyle(col1Chars)
                    const col2Style = getCompactStyle(col2Chars)

                    return (
                      <div className="flex space-x-1 items-center justify-center h-full w-full px-1">
                        {/* 첫 번째 열 */}
                        <div className="flex flex-col items-center justify-center">
                          {firstColumnWords.map((word, wordIndex) => {
                            const chars = word.split('')
                            const isLongWord = chars.length >= 4

                            return (
                              <div
                                key={wordIndex}
                                className={`flex flex-col items-center justify-center ${wordIndex < firstColumnWords.length - 1 ? 'mb-0.5' : ''}`}
                                style={isLongWord ? { letterSpacing: '-0.5px' } : {}}
                              >
                                {chars.map((char, charIndex) => (
                                  <div
                                    key={charIndex}
                                    className={`text-xs lg:text-sm font-medium ${isGrayedOut ? 'text-gray-500' : 'text-gray-800'} ${col1Style.charHeight} flex items-center justify-center mb-0.5 lg:mb-1`}
                                    style={col1Style.charScale ? { transform: col1Style.charScale } : undefined}
                                  >
                                    {char}
                                  </div>
                                ))}
                              </div>
                            )
                          })}
                        </div>
                        {/* 두 번째 열 */}
                        <div className="flex flex-col items-center justify-center">
                          {secondColumnWords.map((word, wordIndex) => {
                            const chars = word.split('')
                            const isLongWord = chars.length >= 4

                            return (
                              <div
                                key={wordIndex}
                                className={`flex flex-col items-center justify-center ${wordIndex < secondColumnWords.length - 1 ? 'mb-0.5' : ''}`}
                                style={isLongWord ? { letterSpacing: '-0.5px' } : {}}
                              >
                                {chars.map((char, charIndex) => (
                                  <div
                                    key={charIndex}
                                    className={`text-xs lg:text-sm font-medium ${isGrayedOut ? 'text-gray-500' : 'text-gray-800'} ${col2Style.charHeight} flex items-center justify-center mb-0.5 lg:mb-1`}
                                    style={col2Style.charScale ? { transform: col2Style.charScale } : undefined}
                                  >
                                    {char}
                                  </div>
                                ))}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  }
                })()}
              </div>
              {/* 서류명 하단 건수 */}
              {docCount != null && (
                <div className={`text-[10px] lg:text-xs font-medium ${isGrayedOut ? 'text-gray-400' : 'text-blue-700'} pb-0.5 shrink-0`}>
                  ({docCount})
                </div>
              )}
            </div>
          </div>

          {/* 하단 년도 */}
          <div className="border-t border-gray-300 pt-2 lg:pt-3 mt-2 lg:mt-3" style={{ fontFamily: 'ChosunBg, serif' }}>
            <div className="text-center text-xs lg:text-sm text-gray-600 font-medium">
              {year.slice(-2)}년
            </div>
            <div className="text-center text-xs lg:text-sm text-gray-800 mt-1 lg:mt-2">
              {bottomLabel || '안전'}
            </div>
          </div>
        </div>

        {/* 비활성화 라벨 */}
        {isDisabled && (
          <div className="absolute bottom-2 left-0 right-0 flex justify-center">
            <div className="bg-red-500 text-white text-xs px-2 py-1 rounded-sm font-medium">
              사용불가
            </div>
          </div>
        )}

        {/* 준비중 라벨 */}
        {isPending && !isDisabled && (
          <div className="absolute bottom-2 left-0 right-0 flex justify-center">
            <div className="bg-gray-500 text-white text-xs px-2 py-1 rounded-sm font-medium">
              준비중
            </div>
          </div>
        )}
      </div>

      {/* 뱃지 */}
      {badgeCount != null && badgeCount > 0 && (
        <div className={`absolute -top-4 -right-2 lg:-top-5 lg:-right-3 z-20 flex items-center justify-center min-w-5 h-5 lg:min-w-6 lg:h-6 px-1 text-white text-xs lg:text-sm font-bold rounded-full shadow-lg border-2 border-white ${badgeVariant === 'blue' ? 'bg-blue-500' : 'bg-red-500'}`}>
          {badgeCount}
        </div>
      )}

      {isMaterialLedgerOpening && <HoradricCubeOpeningEffect />}
    </div>
  )
}

export default DocumentFolder
