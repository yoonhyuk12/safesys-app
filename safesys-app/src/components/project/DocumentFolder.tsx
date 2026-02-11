'use client'

import React from 'react'
import { useRouter } from 'next/navigation'

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
  badgeCount
}) => {
  const router = useRouter()

  const handleClick = () => {
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

  // 지사 안전점검과 본부 안전점검 문서철의 특별한 색상 정의
  const isManagerInspection = title === '︵지사︶ 안전점검'
  const isHeadquartersInspection = title === '︵본부︶ 안전점검'
  const isSpecialInspection = isManagerInspection || isHeadquartersInspection
  // TBM안전활동 점검표만 분홍색으로 표시 (일일안전교육 TBM일지는 제외)
  const isTBMInspectionFolder = title.includes('TBM안전활동') || title.includes('TBM 안전활동')
  const isDisabled = (title === '폭염대비점검' || title.includes('TBM')) && !isProjectActive

  let folderBgColor, folderTabColor
  if (isPending || isDisabled) {
    // 준비중이거나 비활성화된 경우 회색으로 표시
    folderBgColor = 'bg-gray-200'
    folderTabColor = 'bg-gray-300'
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
        className={`
          relative w-[72px] h-56 sm:w-20 lg:w-25 lg:h-96 transition-all duration-200 
          cursor-pointer hover:scale-105
          ${isActive ? 'z-10' : 'z-0'}
        `}
        onClick={handleClick}
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
          <div className="absolute -top-4 -right-2 lg:-top-5 lg:-right-3 z-20 flex items-center justify-center min-w-5 h-5 lg:min-w-6 lg:h-6 px-1 bg-red-500 text-white text-xs lg:text-sm font-bold rounded-full shadow-lg border-2 border-white">
            {badgeCount}
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      className={`
        relative w-[72px] h-56 sm:w-20 lg:w-25 lg:h-96 transition-all duration-200 
        ${isGrayedOut ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:scale-105'}
        ${isActive ? 'z-10' : 'z-0'}
      `}
      onClick={handleClick}
    >
      {/* 문서철 본체 */}
      <div className={`
        w-full h-full border-2 ${isGrayedOut ? 'border-gray-300' : 'border-gray-400'} ${folderBgColor} relative
        ${isActive ? 'shadow-lg border-blue-500' : isGrayedOut ? 'shadow-sm' : 'shadow-md hover:shadow-lg'}
      `}
        style={isSpecialInspection && !isGrayedOut ? { backgroundColor: 'rgb(88, 190, 213)' } : {}}
      >
        {/* 문서철 상단 탭 */}
        <div
          className={`absolute -top-2 lg:-top-3 left-0 right-0 h-4 lg:h-6 ${folderTabColor} border-2 ${isGrayedOut ? 'border-gray-300' : 'border-gray-400'} border-b-0 rounded-t-sm`}
          style={isSpecialInspection && !isGrayedOut ? { backgroundColor: 'rgb(68, 170, 193)' } : {}}
        ></div>

        {/* 문서철 내용 */}
        <div className="flex flex-col h-full p-2 lg:p-4 justify-between">
          {/* 제목 */}
          <div className="flex-1 flex items-center justify-center overflow-hidden">
            <div className="bg-white border border-gray-200 rounded-sm p-1 m-1 w-full h-full flex items-center justify-center">
              <div className="flex justify-center items-center h-full w-full">
                {title && (() => {
                  // 줄바꿈이 있는 경우 처리
                  const lines = title.split('\n')

                  // 줄바꿈이 있는 경우 각 줄을 단어 단위로 처리
                  if (lines.length > 1) {
                    return (
                      <div className="flex flex-col items-center justify-center space-y-0 h-full w-full px-1">
                        {lines.map((line, lineIndex) => {
                          // 전각 괄호 ︵︶ 안의 텍스트인지 확인
                          const isSmallText = line.startsWith('︵') && line.endsWith('︶')

                          // 각 줄을 단어 단위로 분리 (공백 기준)
                          const words = line.split(/\s+/).filter(word => word.length > 0)

                          return (
                            <div key={lineIndex} className={`flex flex-col items-center justify-center w-full ${lineIndex < lines.length - 1 ? '-mb-1' : ''}`}>
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
                                        className={`${isSmallText ? 'text-[10px] lg:text-xs' : 'text-xs lg:text-sm'} font-medium ${isGrayedOut ? 'text-gray-500' : 'text-gray-800'} ${isSmallText ? 'h-2.5 lg:h-3' : 'h-3 lg:h-4'} flex items-center justify-center mb-0.5 lg:mb-1`}
                                      >
                                        {char}
                                      </div>
                                    ))}
                                  </div>
                                )
                              })}
                            </div>
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
                                    className={`text-xs lg:text-sm font-medium ${isGrayedOut ? 'text-gray-500' : 'text-gray-800'} h-3 lg:h-4 flex items-center justify-center mb-0.5 lg:mb-1`}
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
                                    className={`text-xs lg:text-sm font-medium ${isGrayedOut ? 'text-gray-500' : 'text-gray-800'} h-3 lg:h-4 flex items-center justify-center mb-0.5 lg:mb-1`}
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
            </div>
          </div>

          {/* 하단 년도 */}
          <div className="border-t border-gray-300 pt-2 lg:pt-3 mt-2 lg:mt-3">
            <div className="text-center text-xs lg:text-sm text-gray-600 font-medium">
              {year}
            </div>
            <div className="text-center text-xs lg:text-sm text-gray-400 mt-1 lg:mt-2">
              안전관리
            </div>
          </div>
        </div>

        {/* 문서철 측면 효과 */}
        <div className={`absolute -right-1 lg:-right-2 top-1 lg:top-2 bottom-1 lg:bottom-2 w-2 lg:w-3 bg-gray-200 border-r ${isGrayedOut ? 'border-gray-300' : 'border-gray-400'}`}></div>

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
        <div className="absolute -top-4 -right-2 lg:-top-5 lg:-right-3 z-20 flex items-center justify-center min-w-5 h-5 lg:min-w-6 lg:h-6 px-1 bg-red-500 text-white text-xs lg:text-sm font-bold rounded-full shadow-lg border-2 border-white">
          {badgeCount}
        </div>
      )}
    </div>
  )
}

export default DocumentFolder 