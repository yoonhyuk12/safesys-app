'use client'

// 수시 위험성평가 3단계 — 평가 사유 입력, DB 위험요인 로드, AI 선별·판정으로 표 행 생성

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Loader2, Sparkles } from 'lucide-react'
import type { RiskAssessmentRow, RiskHazard } from '@/lib/risk-assessment/types'
import { fetchHazards, requestAiJudgement } from './api'
import { BUSINESS_TYPE_ALL, createRowFromHazard } from './record'
import type { TaxonomySelection } from './TaxonomyStep'

interface TriggerStepProps {
  projectId: string
  businessType: string
  selection: TaxonomySelection
  trigger: string
  siteContext: string
  onTriggerChange: (value: string) => void
  onSiteContextChange: (value: string) => void
  onRowsReady: (rows: RiskAssessmentRow[]) => void
}

function hazardFlagLabels(hazard: RiskHazard): string[] {
  const labels: string[] = []
  if (hazard.flagSif) labels.push('SIF')
  if (hazard.flagSerious) labels.push('중대재해')
  if (hazard.flagAccidentCase) labels.push('재해사례')
  if (hazard.flagNearMiss) labels.push('아차사고')
  return labels
}

export default function TriggerStep({
  projectId,
  businessType,
  selection,
  trigger,
  siteContext,
  onTriggerChange,
  onSiteContextChange,
  onRowsReady,
}: TriggerStepProps) {
  const [hazards, setHazards] = useState<RiskHazard[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')

  const loadHazards = useCallback(async () => {
    if (!selection.construction || !selection.unitWork || !selection.detailWork) return
    setLoading(true)
    setError('')
    try {
      setHazards(await fetchHazards({
        businessType: businessType === BUSINESS_TYPE_ALL ? undefined : businessType,
        construction: selection.construction,
        unitWork: selection.unitWork,
        detailWork: selection.detailWork,
      }))
    } catch (loadError: unknown) {
      setHazards([])
      setError(loadError instanceof Error ? loadError.message : '위험요인을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [businessType, selection.construction, selection.unitWork, selection.detailWork])

  useEffect(() => {
    loadHazards()
  }, [loadHazards])

  const handleAiJudge = async () => {
    if (!trigger.trim()) {
      setAiError('수시평가 사유를 먼저 입력해주세요.')
      return
    }
    setAiLoading(true)
    setAiError('')
    try {
      const judgements = await requestAiJudgement({
        projectId,
        trigger: trigger.trim(),
        hazards,
        siteContext: siteContext.trim() || undefined,
      })
      const byHazardId = new Map(judgements.map((judgement) => [judgement.hazardId, judgement]))
      const rows = hazards
        .filter((hazard) => byHazardId.get(hazard.id)?.selected)
        .map((hazard) => createRowFromHazard(hazard, byHazardId.get(hazard.id), selection.detailWork))

      if (rows.length === 0) {
        setAiError('AI가 이번 사유와 관련된 위험요인을 고르지 못했습니다. 사유를 더 구체적으로 적거나 아래 전체 담기를 눌러주세요.')
        return
      }
      onRowsReady(rows)
    } catch (judgeError: unknown) {
      setAiError(judgeError instanceof Error ? judgeError.message : 'AI 판정에 실패했습니다.')
    } finally {
      setAiLoading(false)
    }
  }

  const handleTakeAll = () => {
    onRowsReady(hazards.map((hazard) => createRowFromHazard(hazard, undefined, selection.detailWork)))
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-2">
        <label className="block">
          <span className="text-sm font-semibold text-gray-800">수시평가 사유<span className="ml-1 text-red-500">*</span></span>
          <textarea
            value={trigger}
            onChange={(event) => onTriggerChange(event.target.value)}
            rows={4}
            placeholder="예) 우기 대비 절토부 상단 배수로 추가 굴착 작업이 새로 반영되어 수시평가 실시"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-gray-800">현장 부가 정보</span>
          <textarea
            value={siteContext}
            onChange={(event) => onSiteContextChange(event.target.value)}
            rows={4}
            placeholder="예) 굴착기 0.8㎥ 1대, 덤프 15t 2대, 작업인원 6명, 인접 도로 통행"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
          />
        </label>
      </div>

      <div className="rounded-lg border border-gray-200">
        <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-3 py-2">
          <p className="text-sm font-semibold text-gray-800">
            {selection.detailWork} 위험요인
            <span className="ml-2 text-xs font-normal text-gray-500">DB 원문 {hazards.length}건</span>
          </p>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
        </div>

        {error ? (
          <div className="flex items-start justify-between gap-3 p-3 text-sm text-red-700">
            <p>{error}</p>
            <button type="button" onClick={loadHazards} className="shrink-0 font-semibold underline">다시 조회</button>
          </div>
        ) : (
          <ul className="max-h-64 divide-y divide-gray-100 overflow-y-auto">
            {hazards.map((hazard) => (
              <li key={hazard.id} className="flex items-start gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 text-gray-800">{hazard.hazard}</span>
                {hazard.disasterType && (
                  <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">{hazard.disasterType}</span>
                )}
                {hazardFlagLabels(hazard).map((label) => (
                  <span key={label} className="shrink-0 rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">{label}</span>
                ))}
              </li>
            ))}
            {!loading && hazards.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-gray-500">해당 세부단위작업의 위험요인이 없습니다.</li>
            )}
          </ul>
        )}
      </div>

      {aiError && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{aiError}</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleAiJudge}
          disabled={aiLoading || loading || hazards.length === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {aiLoading ? 'AI 판정 중' : 'AI 판정으로 표 만들기'}
        </button>
        <button
          type="button"
          onClick={handleTakeAll}
          disabled={aiLoading || loading || hazards.length === 0}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          AI 없이 전체 담기
        </button>
        <p className="text-xs text-gray-500">AI는 선별·빈도·강도·장비만 판정하고, 위험요인·대책 문구는 DB 원문을 그대로 씁니다.</p>
      </div>
    </div>
  )
}
