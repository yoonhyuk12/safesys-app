'use client'

// 수시 위험성평가 2단계 — 작업내용·인원·장비를 쓰면 AI가 분류 매칭→위험요인 로드→판정까지 한 번에 실행한다

import { useState } from 'react'
import { AlertTriangle, Check, ChevronDown, ChevronRight, Loader2, Plus, Sparkles, X } from 'lucide-react'
import type { RiskAssessmentRow, RiskClassifyMatch, RiskHazard } from '@/lib/risk-assessment/types'
import { classifyWork, fetchHazards, MAX_JUDGE_HAZARDS, requestAiJudgement } from './api'
import { BUSINESS_TYPE_ALL, createRowFromHazard } from './record'
import TaxonomyStep, { type TaxonomySelection } from './TaxonomyStep'

interface WorkInputStepProps {
  projectId: string
  businessType: string
  workDescription: string
  personnel: string
  equipment: string
  onWorkDescriptionChange: (value: string) => void
  onPersonnelChange: (value: string) => void
  onEquipmentChange: (value: string) => void
  onRowsReady: (rows: RiskAssessmentRow[]) => void
}

/** 조합을 식별하는 키 — 제외 표시와 중복 추가 방지에 쓴다. */
const matchKey = (match: RiskClassifyMatch) => `${match.construction}|${match.unitWork}|${match.detailWork}`

type Phase = 'idle' | 'classifying' | 'loading' | 'judging'

const PHASE_STEPS: Array<{ phase: Exclude<Phase, 'idle'>; label: string }> = [
  { phase: 'classifying', label: '분류 매칭' },
  { phase: 'loading', label: '위험요인 로드' },
  { phase: 'judging', label: 'AI 판정' },
]

interface HazardPick {
  hazard: RiskHazard
  detailWork: string
}

export default function WorkInputStep({
  projectId,
  businessType,
  workDescription,
  personnel,
  equipment,
  onWorkDescriptionChange,
  onPersonnelChange,
  onEquipmentChange,
  onRowsReady,
}: WorkInputStepProps) {
  const [matches, setMatches] = useState<RiskClassifyMatch[]>([])
  const [excludedKeys, setExcludedKeys] = useState<string[]>([])
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [manualOpen, setManualOpen] = useState(false)
  const [selection, setSelection] = useState<TaxonomySelection>({ construction: '', unitWork: '', detailWork: '' })

  const filterBusinessType = businessType === BUSINESS_TYPE_ALL ? undefined : businessType
  const activeMatches = matches.filter((match) => !excludedKeys.includes(matchKey(match)))
  const running = phase !== 'idle'

  const siteContext = [
    personnel.trim() ? `인원: ${personnel.trim()}` : '',
    equipment.trim() ? `장비: ${equipment.trim()}` : '',
  ].filter(Boolean).join(' / ')

  const toggleExclude = (match: RiskClassifyMatch) => {
    const key = matchKey(match)
    setExcludedKeys((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key])
  }

  const addManualMatch = () => {
    if (!selection.detailWork) return
    const manual: RiskClassifyMatch = { ...selection, reason: '직접 선택' }
    const key = matchKey(manual)
    setMatches((current) => current.some((match) => matchKey(match) === key) ? current : [...current, manual])
    setExcludedKeys((current) => current.filter((item) => item !== key))
    setError('')
  }

  /** 선택된 조합들의 위험요인을 모아 중복을 걷어낸다. 순서는 조합 순서를 지킨다. */
  const collectHazards = async (targets: RiskClassifyMatch[]): Promise<HazardPick[]> => {
    const lists = await Promise.all(targets.map((match) => fetchHazards({
      businessType: filterBusinessType,
      construction: match.construction,
      unitWork: match.unitWork,
      detailWork: match.detailWork,
    })))

    const seenIds = new Set<number>()
    const seenTexts = new Set<string>()
    const picks: HazardPick[] = []
    lists.forEach((hazards, index) => {
      const detailWork = targets[index].detailWork
      for (const hazard of hazards) {
        // 사업별 무관 모드는 같은 위험요인이 사업마다 다른 id로 들어와 문구까지 본다
        const textKey = `${detailWork}|${hazard.hazard}`
        if (seenIds.has(hazard.id) || seenTexts.has(textKey)) continue
        seenIds.add(hazard.id)
        seenTexts.add(textKey)
        picks.push({ hazard, detailWork })
      }
    })
    return picks
  }

  /** 장비 제안이 비면 사용자가 적은 장비 텍스트로 채운다. */
  const withEquipmentFallback = (row: RiskAssessmentRow): RiskAssessmentRow =>
    row.equipment ? row : { ...row, equipment: equipment.trim() }

  const runPipeline = async (targets: RiskClassifyMatch[], options: { skipAi: boolean }) => {
    if (targets.length === 0) {
      setError('판정할 분류 조합이 없습니다. AI 자동 분류를 실행하거나 직접 선택으로 작업을 추가해주세요.')
      setPhase('idle')
      return
    }

    setError('')
    setNotice('')
    setPhase('loading')
    try {
      let picks = await collectHazards(targets)
      if (picks.length === 0) {
        setError('선택한 조합에 등록된 위험요인이 없습니다. 다른 작업을 선택해주세요.')
        return
      }

      if (picks.length > MAX_JUDGE_HAZARDS) {
        setNotice(`위험요인이 ${picks.length}건이라 한 번에 판정하는 상한(${MAX_JUDGE_HAZARDS}건)까지만 조합 순서대로 담았습니다. 남은 항목은 평가서를 나눠 작성해주세요.`)
        picks = picks.slice(0, MAX_JUDGE_HAZARDS)
      }

      if (options.skipAi) {
        onRowsReady(picks.map((pick) => withEquipmentFallback(createRowFromHazard(pick.hazard, undefined, pick.detailWork))))
        return
      }

      setPhase('judging')
      const judgements = await requestAiJudgement({
        projectId,
        trigger: workDescription.trim(),
        hazards: picks.map((pick) => pick.hazard),
        siteContext: siteContext || undefined,
      })
      const byHazardId = new Map(judgements.map((judgement) => [judgement.hazardId, judgement]))
      const rows = picks
        .filter((pick) => byHazardId.get(pick.hazard.id)?.selected)
        .map((pick) => withEquipmentFallback(
          createRowFromHazard(pick.hazard, byHazardId.get(pick.hazard.id), pick.detailWork)
        ))

      if (rows.length === 0) {
        setError('AI가 이번 작업과 관련된 위험요인을 고르지 못했습니다. 작업내용을 더 구체적으로 쓰거나 아래 전체 담기를 눌러주세요.')
        return
      }
      onRowsReady(rows)
    } catch (pipelineError: unknown) {
      setError(pipelineError instanceof Error ? pipelineError.message : '위험요인을 불러오지 못했습니다.')
    } finally {
      setPhase('idle')
    }
  }

  const runAuto = async () => {
    if (!workDescription.trim()) {
      setError('작업내용을 먼저 입력해주세요.')
      return
    }
    setError('')
    setNotice('')
    setPhase('classifying')
    let classified: RiskClassifyMatch[] = []
    try {
      classified = await classifyWork({
        businessType: filterBusinessType,
        workDescription: workDescription.trim(),
        personnel: personnel.trim() || undefined,
        equipment: equipment.trim() || undefined,
      })
      setMatches(classified)
      setExcludedKeys([])
    } catch (classifyError: unknown) {
      setError(classifyError instanceof Error ? classifyError.message : 'AI 자동 분류에 실패했습니다.')
      setPhase('idle')
      return
    }
    await runPipeline(classified, { skipAi: false })
  }

  const phaseIndex = PHASE_STEPS.findIndex((step) => step.phase === phase)

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="text-sm font-semibold text-gray-800">작업내용<span className="ml-1 text-red-500">*</span></span>
        <textarea
          value={workDescription}
          onChange={(event) => onWorkDescriptionChange(event.target.value)}
          rows={4}
          placeholder="예) 우기 대비 절토부 상단 배수로를 추가로 굴착한다. 기존 계획에 없던 작업이라 수시평가를 실시한다."
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
        />
        <span className="mt-1 block text-xs text-gray-500">이 내용이 평가서의 수시평가 사유로 저장되고, AI 분류·판정의 근거가 됩니다.</span>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-semibold text-gray-800">투입 인원</span>
          <input
            value={personnel}
            onChange={(event) => onPersonnelChange(event.target.value)}
            placeholder="예) 굴착기 운전원 1명, 신호수 1명, 보통인부 4명"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-gray-800">사용 장비</span>
          <input
            value={equipment}
            onChange={(event) => onEquipmentChange(event.target.value)}
            placeholder="예) 굴착기 0.8㎥ 1대, 덤프트럭 15t 2대"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
          />
          <span className="mt-1 block text-xs text-gray-500">AI가 장비를 제안하지 못한 행에 이 값을 채웁니다.</span>
        </label>
      </div>

      {running && (
        <ol className="flex flex-wrap items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-900">
          {PHASE_STEPS.map((step, index) => (
            <li key={step.phase} className="flex items-center gap-1.5">
              {index < phaseIndex
                ? <Check className="h-4 w-4 text-blue-600" />
                : index === phaseIndex
                  ? <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                  : <span className="h-4 w-4 rounded-full border border-blue-200" />}
              <span className={index === phaseIndex ? 'font-semibold' : 'text-blue-700/70'}>{step.label}</span>
              {index < PHASE_STEPS.length - 1 && <ChevronRight className="h-3.5 w-3.5 text-blue-300" />}
            </li>
          ))}
        </ol>
      )}

      {matches.length > 0 && (
        <div className="rounded-lg border border-gray-200 p-3">
          <p className="text-sm font-semibold text-gray-800">
            매칭된 분류 <span className="text-xs font-normal text-gray-500">{activeMatches.length}/{matches.length}건 사용</span>
          </p>
          <ul className="mt-2 space-y-1.5">
            {matches.map((match) => {
              const key = matchKey(match)
              const excluded = excludedKeys.includes(key)
              return (
                <li key={key} className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 text-sm ${
                  excluded ? 'border-gray-200 bg-gray-50 text-gray-400 line-through' : 'border-blue-200 bg-blue-50 text-blue-900'
                }`}>
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{match.construction} &gt; {match.unitWork} &gt; {match.detailWork}</span>
                    {match.reason && <span className="mt-0.5 block text-xs no-underline opacity-80">{match.reason}</span>}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleExclude(match)}
                    disabled={running}
                    className="shrink-0 rounded p-1 hover:bg-white/60 disabled:opacity-40"
                    aria-label={excluded ? `${match.detailWork} 다시 포함` : `${match.detailWork} 제외`}
                  >
                    {excluded ? <Plus className="h-4 w-4" /> : <X className="h-4 w-4" />}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {notice && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{notice}</div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={runAuto}
          disabled={running || !workDescription.trim()}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {phase === 'classifying' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          AI 자동 분류·판정
        </button>
        {matches.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => runPipeline(activeMatches, { skipAi: false })}
              disabled={running || activeMatches.length === 0}
              className="rounded-lg border border-blue-300 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              선택 조합으로 다시 판정
            </button>
            <button
              type="button"
              onClick={() => runPipeline(activeMatches, { skipAi: true })}
              disabled={running || activeMatches.length === 0}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              AI 판정 없이 전체 담기
            </button>
          </>
        )}
      </div>
      <p className="text-xs text-gray-500">AI는 분류 매칭과 선별·빈도·강도·장비 판정만 하고, 위험요인·대책 문구는 DB 원문을 그대로 씁니다.</p>

      <div className="rounded-lg border border-gray-200">
        <button
          type="button"
          onClick={() => setManualOpen((current) => !current)}
          className="flex w-full items-center gap-1.5 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          {manualOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          직접 선택 (AI 분류가 빗나갈 때)
        </button>
        {manualOpen && (
          <div className="space-y-3 border-t border-gray-200 p-3">
            <TaxonomyStep businessType={businessType} selection={selection} onChange={setSelection} />
            <button
              type="button"
              onClick={addManualMatch}
              disabled={running || !selection.detailWork}
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300 px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />선택한 작업 추가
            </button>
            <p className="text-xs text-gray-500">추가한 작업도 위 매칭 목록에 들어가며, &ldquo;선택 조합으로 다시 판정&rdquo;으로 함께 판정합니다.</p>
          </div>
        )}
      </div>
    </div>
  )
}
