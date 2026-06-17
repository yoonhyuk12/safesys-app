'use client'

// 작업일보 미생성 구간 자동 채우기 카드 (2단계 좌측 캘린더 하단)
// 최근 일보를 기준으로, TBM이 제출된 미생성 날짜(어제까지)를 일괄 생성한다.
// 기준 일보가 없으면 1단계(TBM 전체 일보 생성)를 먼저 하도록 안내한다.

import React, { useState } from 'react'
import { AlertTriangle, ArrowRight, CalendarClock, Save, X } from 'lucide-react'
import {
  saveGeneratedReports,
  GenerateProgress,
} from '@/lib/work-daily-report/generate-from-tbm'
import {
  prepareMissingRangeFill,
  MissingRangePrep,
} from '@/lib/work-daily-report/fill-missing-range'

interface MissingRangeFillCardProps {
  projectId: string
  projectName: string
  managingHq?: string
  managingBranch?: string
  latitude?: number | null
  longitude?: number | null
  userId: string
  ownerName?: string
  onFilled: () => void        // 생성 완료 후 캘린더 갱신
  onGoStage1: () => void      // 1단계 탭으로 이동
}

type Phase = 'idle' | 'preparing' | 'needsStage1' | 'review' | 'saving'

const getErrorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : '알 수 없는 오류'

export default function MissingRangeFillCard({
  projectId,
  projectName,
  managingHq,
  managingBranch,
  latitude,
  longitude,
  userId,
  ownerName,
  onFilled,
  onGoStage1,
}: MissingRangeFillCardProps) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [prep, setPrep] = useState<MissingRangePrep | null>(null)
  const [progress, setProgress] = useState<GenerateProgress | null>(null)

  const reset = () => {
    setPhase('idle')
    setPrep(null)
    setProgress(null)
  }

  // 1) 기준 일보 로드 + 미생성 TBM 날짜 분류 준비
  const handlePrepare = async () => {
    try {
      setPhase('preparing')
      setProgress(null)
      const result = await prepareMissingRangeFill({
        projectId, projectName, managingHq, managingBranch, latitude, longitude,
        today: new Date(),
        onProgress: setProgress,
      })

      if (result.needsStage1) {
        setPrep(result)
        setPhase('needsStage1')
        return
      }
      if (!result.result || result.result.days.length === 0) {
        alert('채울 미생성 구간이 없습니다. (어제까지의 TBM 날짜에 이미 작업일보가 있습니다)')
        reset()
        return
      }
      setPrep(result)
      setPhase('review')
    } catch (err: unknown) {
      console.error('미생성 구간 준비 오류:', err)
      alert(`구간을 준비하는 중 오류가 발생했습니다: ${getErrorMessage(err)}`)
      reset()
    } finally {
      setProgress(null)
    }
  }

  // 2) 검토 후 일괄 생성 + 누계 재계산
  const handleSave = async () => {
    const days = prep?.result?.days
    if (!days || days.length === 0) return
    if (!confirm(`${days.length}일의 작업일보를 생성합니다.\n저장 후 전체 누계가 자동 재계산됩니다. 진행할까요?`)) return

    try {
      setPhase('saving')
      setProgress(null)
      const saved = await saveGeneratedReports({
        projectId,
        userId,
        ownerName: prep?.baselineAuthor || ownerName,
        days,
        onProgress: setProgress,
      })

      const failMsg = saved.failedDates.length > 0
        ? `\n실패 ${saved.failedDates.length}건: ${saved.failedDates.join(', ')}`
        : ''
      alert(`미생성 구간 채우기 완료: ${saved.created}건${failMsg}`)
      reset()
      onFilled()
    } catch (err: unknown) {
      console.error('미생성 구간 생성 오류:', err)
      alert(`생성 중 오류가 발생했습니다: ${getErrorMessage(err)}`)
      setPhase('review')
    } finally {
      setProgress(null)
    }
  }

  const days = prep?.result?.days ?? []
  const firstDate = days[0]?.date
  const lastDate = days[days.length - 1]?.date
  const failedCount = prep?.result?.failedDates.length ?? 0
  const anchorFillCount = days.filter(d => d.existingId).length

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center gap-2 mb-1">
        <CalendarClock className="h-4 w-4 text-blue-600" />
        <h3 className="text-sm font-bold text-gray-900">미생성 구간 자동 채우기</h3>
      </div>
      <p className="text-xs text-gray-500 mb-3">
        최근 작업일보를 기준으로, TBM이 제출된 미생성 날짜(어제까지)를 일괄 생성합니다.
      </p>

      {phase === 'idle' && (
        <button
          onClick={handlePrepare}
          className="w-full inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors"
        >
          <CalendarClock className="h-3.5 w-3.5" />
          미생성 구간 채우기
        </button>
      )}

      {/* 진행 상황 (준비/저장) */}
      {(phase === 'preparing' || phase === 'saving') && (
        <div className="text-xs text-blue-800 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
          <div className="flex items-center justify-between mb-1">
            <span>
              {progress
                ? `${progress.date} ${phase === 'preparing' ? 'AI 분류' : '저장'} 중...`
                : phase === 'preparing' ? 'TBM 데이터 조회 중...' : '저장 준비 중...'}
            </span>
            {progress && <span className="font-semibold">{progress.current}/{progress.total}</span>}
          </div>
          <div className="h-1.5 w-full rounded-full bg-blue-100 overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-200"
              style={{ width: progress ? `${Math.round((progress.current / progress.total) * 100)}%` : '0%' }}
            />
          </div>
        </div>
      )}

      {/* 기준 일보 없음 — 1단계 안내 */}
      {phase === 'needsStage1' && (
        <div className="space-y-2">
          <div className="flex items-start gap-1.5 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>기준이 될 작업일보가 없습니다. 먼저 1단계에서 &quot;TBM 전체 일보 생성&quot;으로 초안을 만들어 주세요.</span>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={reset}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-medium transition-colors"
            >
              <X className="h-3.5 w-3.5" />
              닫기
            </button>
            <button
              onClick={() => { reset(); onGoStage1() }}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors"
            >
              1단계로 이동
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* 요약 확인 */}
      {phase === 'review' && (
        <div className="space-y-2">
          <div className="text-xs text-gray-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 space-y-0.5">
            <div>기준 일보: <span className="font-semibold">{prep?.baselineDate}</span></div>
            <div>
              생성 대상: <span className="font-bold text-blue-700">{days.length}일</span>
              {firstDate && <> ({firstDate}{lastDate && lastDate !== firstDate ? ` ~ ${lastDate}` : ''})</>}
            </div>
            {anchorFillCount > 0 && (
              <div className="text-gray-600">· 공정률 전용 행 보완 {anchorFillCount}일 포함 (입력된 공정률은 보존)</div>
            )}
            {failedCount > 0 && (
              <div className="text-red-600">분류 실패 {failedCount}일 제외</div>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={reset}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-medium transition-colors"
            >
              <X className="h-3.5 w-3.5" />
              취소
            </button>
            <button
              onClick={handleSave}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors"
            >
              <Save className="h-3.5 w-3.5" />
              생성 ({days.length}일)
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
