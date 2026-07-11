'use client'

// AI 초안(작업내용 공유·위험요인/개선대책·작업순서·전기작업단계·사전조사)을 생성해 검토·편집하는 단계

import { useState } from 'react'
import { Loader2, Plus, Sparkles, Trash2 } from 'lucide-react'
import { CONSTRUCTION_SURVEY_ITEMS, CONSTRUCTION_SURVEY_TYPE_OPTIONS, PLAN_TYPE_OPTIONS } from '@/lib/work-plan/constants'
import type {
  ConstructionSurveyEntry,
  ElectricWorkStep,
  PlanType,
  RiskControlRow,
  WorkPlanAiResult,
  WorkPlanFormData,
} from '@/lib/work-plan/types'

interface AiReviewStepProps {
  selectedTypes: PlanType[]
  formData: WorkPlanFormData
  onChange: (data: WorkPlanFormData) => void
  projectAddress: string | null
  scheduleCandidates: string[]
}

type CommonType = 'loading' | 'construction' | 'heavy'

const INPUT_CLASS =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
const LABEL_CLASS = 'text-xs font-medium text-gray-600'

function planTitle(type: PlanType): string {
  return PLAN_TYPE_OPTIONS.find((option) => option.value === type)?.title || type
}

function emptyRiskRow(): RiskControlRow {
  return { workStep: '', riskFactor: '', improvementMeasure: '' }
}

function emptyWorkStep(): ElectricWorkStep {
  return { workName: '', sequenceAndContent: '', riskFactor: '', safeMethod: '', note: '' }
}

// 사전조사 항목 인덱스에 해당하는 조사내용을 찾는다(없으면 빈 문자열).
function findingValue(entries: ConstructionSurveyEntry[], itemIndex: number): string {
  return entries.find((entry) => entry.itemIndex === itemIndex)?.finding || ''
}

export default function AiReviewStep({
  selectedTypes,
  formData,
  onChange,
  projectAddress,
  scheduleCandidates,
}: AiReviewStepProps) {
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [hasApplied, setHasApplied] = useState(false)

  const updatePlan = (type: PlanType, values: Record<string, unknown>) => {
    const current = formData[type]
    if (!current) return
    onChange({ ...formData, [type]: { ...current, ...values } } as WorkPlanFormData)
  }

  // AI 결과를 선택 종류별로 한 번의 onChange로 불변 적용한다.
  const applyResult = (result: WorkPlanAiResult) => {
    let next: WorkPlanFormData = { ...formData }
    for (const type of selectedTypes) {
      const draft = result[type]
      const current = next[type]
      if (!draft || !current) continue

      if (type === 'electric' && current.planType === 'electric') {
        const values: Record<string, unknown> = {}
        if (draft.sharedWorkContent) values.purposeAndContent = draft.sharedWorkContent
        if (draft.electricWorkSteps && draft.electricWorkSteps.length > 0) values.workSteps = draft.electricWorkSteps
        next = { ...next, electric: { ...current, ...values } } as WorkPlanFormData
        continue
      }

      if (current.planType === 'electric') continue
      const values: Record<string, unknown> = {}
      if (draft.sharedWorkContent) values.sharedWorkContent = draft.sharedWorkContent
      if (draft.riskControls.length > 0) values.riskControls = draft.riskControls
      if (current.planType === 'construction') {
        if (draft.workSequence && draft.workSequence.length > 0) values.workSequence = draft.workSequence
        if (draft.surveyFindings && draft.surveyFindings.length > 0) {
          const items = CONSTRUCTION_SURVEY_ITEMS[current.surveyType]
          values.surveyEntries = items.map((_, index) => ({
            itemIndex: index,
            finding: draft.surveyFindings?.[index] || '',
            photoUrl: current.surveyEntries.find((entry) => entry.itemIndex === index)?.photoUrl || '',
          }))
        }
      }
      next = { ...next, [type]: { ...current, ...values } } as WorkPlanFormData
    }
    onChange(next)
  }

  const generate = async () => {
    const firstType = selectedTypes[0]
    const requestBody = {
      planTypes: selectedTypes,
      title: firstType ? formData[firstType]?.title ?? '' : '',
      sharedWorkContent:
        formData.loading?.sharedWorkContent ??
        formData.construction?.sharedWorkContent ??
        formData.heavy?.sharedWorkContent ??
        formData.electric?.purposeAndContent ??
        '',
      workMethod: formData.construction?.workMethod,
      equipmentName:
        formData.loading?.equipment.equipmentName ||
        formData.construction?.equipment.equipmentName ||
        formData.heavy?.machine.machineName,
      loadItemName: formData.heavy?.load.itemName,
      surveyType: formData.construction?.surveyType,
      projectContext: { address: projectAddress || undefined, workTypes: scheduleCandidates },
    }

    setError('')
    setGenerating(true)
    try {
      const response = await fetch('/api/ai/work-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })
      const data = (await response.json()) as { result?: WorkPlanAiResult; error?: string }
      if (!response.ok || data.error || !data.result) {
        setError(data.error || 'AI 초안 생성에 실패했습니다. 잠시 후 다시 시도해주세요.')
        return
      }
      applyResult(data.result)
      setHasApplied(true)
    } catch (err: unknown) {
      console.error('작업계획서 AI 초안 생성 실패:', err)
      setError(err instanceof Error ? err.message : 'AI 초안 생성 중 오류가 발생했습니다.')
    } finally {
      setGenerating(false)
    }
  }

  const renderRiskControls = (type: CommonType, rows: RiskControlRow[]) => {
    const updateRow = (index: number, patch: Partial<RiskControlRow>) =>
      updatePlan(type, { riskControls: rows.map((row, i) => (i === index ? { ...row, ...patch } : row)) })
    return (
      <div>
        <span className={`mb-1 block ${LABEL_CLASS}`}>위험요인 및 개선대책</span>
        {rows.length === 0 ? (
          <p className="rounded-lg bg-gray-50 px-3 py-3 text-sm text-gray-500">AI 초안 생성을 누르거나 행을 직접 추가하세요.</p>
        ) : (
          <div className="space-y-2">
            {rows.map((row, index) => (
              <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1.2fr_1.2fr_auto]">
                <input value={row.workStep} onChange={(event) => updateRow(index, { workStep: event.target.value })} placeholder="작업순서" className={INPUT_CLASS} />
                <input value={row.riskFactor} onChange={(event) => updateRow(index, { riskFactor: event.target.value })} placeholder="위험요인" className={INPUT_CLASS} />
                <input value={row.improvementMeasure} onChange={(event) => updateRow(index, { improvementMeasure: event.target.value })} placeholder="개선대책" className={INPUT_CLASS} />
                <button
                  type="button"
                  onClick={() => updatePlan(type, { riskControls: rows.filter((_, i) => i !== index) })}
                  className="flex items-center justify-center rounded-lg border border-gray-300 px-3 py-2 text-gray-400 hover:border-red-300 hover:bg-red-50 hover:text-red-600 sm:px-2"
                  aria-label="행 삭제"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => updatePlan(type, { riskControls: [...rows, emptyRiskRow()] })}
          className="mt-2 inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700"
        >
          <Plus className="h-3.5 w-3.5" /> 행 추가
        </button>
      </div>
    )
  }

  const renderConstructionExtra = () => {
    const current = formData.construction
    if (!current) return null
    const surveyLabel = CONSTRUCTION_SURVEY_TYPE_OPTIONS.find((option) => option.value === current.surveyType)?.label || ''
    const items = CONSTRUCTION_SURVEY_ITEMS[current.surveyType]

    const updateFinding = (itemIndex: number, finding: string) => {
      const exists = current.surveyEntries.some((entry) => entry.itemIndex === itemIndex)
      const nextEntries = exists
        ? current.surveyEntries.map((entry) => (entry.itemIndex === itemIndex ? { ...entry, finding } : entry))
        : [...current.surveyEntries, { itemIndex, finding, photoUrl: '' }]
      updatePlan('construction', { surveyEntries: nextEntries })
    }

    return (
      <>
        <label className="block">
          <span className={`mb-1 block ${LABEL_CLASS}`}>작업순서</span>
          <textarea
            rows={4}
            value={current.workSequence.join('\n')}
            onChange={(event) => updatePlan('construction', { workSequence: event.target.value.split('\n') })}
            className={INPUT_CLASS}
          />
        </label>
        <div>
          <span className={`mb-1 block ${LABEL_CLASS}`}>사전조사</span>
          <p className="mb-2 text-xs font-semibold text-gray-500">{surveyLabel}</p>
          <div className="space-y-3">
            {items.map((item, index) => (
              <label key={index} className="block">
                <span className="mb-1 block text-xs text-gray-600">{item}</span>
                <textarea rows={2} value={findingValue(current.surveyEntries, index)} onChange={(event) => updateFinding(index, event.target.value)} className={INPUT_CLASS} />
              </label>
            ))}
          </div>
        </div>
      </>
    )
  }

  const renderCommonEditor = (type: CommonType) => {
    const current = formData[type]
    if (!current) return null
    return (
      <div className="space-y-4">
        <label className="block">
          <span className={`mb-1 block ${LABEL_CLASS}`}>작업내용 공유</span>
          <textarea rows={3} value={current.sharedWorkContent} onChange={(event) => updatePlan(type, { sharedWorkContent: event.target.value })} className={INPUT_CLASS} />
        </label>
        {renderRiskControls(type, current.riskControls)}
        {type === 'construction' && renderConstructionExtra()}
      </div>
    )
  }

  const renderElectric = () => {
    const current = formData.electric
    if (!current) return null
    const steps = current.workSteps

    const updateStep = (index: number, patch: Partial<ElectricWorkStep>) =>
      updatePlan('electric', { workSteps: steps.map((step, i) => (i === index ? { ...step, ...patch } : step)) })

    return (
      <div className="space-y-4">
        <label className="block">
          <span className={`mb-1 block ${LABEL_CLASS}`}>작업목적 및 내용</span>
          <textarea rows={3} value={current.purposeAndContent} onChange={(event) => updatePlan('electric', { purposeAndContent: event.target.value })} className={INPUT_CLASS} />
        </label>
        <div>
          <span className={`mb-1 block ${LABEL_CLASS}`}>작업단계별 안전작업방법</span>
          {steps.length === 0 ? (
            <p className="rounded-lg bg-gray-50 px-3 py-3 text-sm text-gray-500">AI 초안 생성을 누르거나 행을 직접 추가하세요.</p>
          ) : (
            <div className="space-y-3">
              {steps.map((step, index) => (
                <div key={index} className="rounded-lg border border-gray-200 p-3">
                  <div className="grid grid-cols-2 gap-2">
                    <input value={step.workName} onChange={(event) => updateStep(index, { workName: event.target.value })} placeholder="작업명" className={INPUT_CLASS} />
                    <input value={step.note} onChange={(event) => updateStep(index, { note: event.target.value })} placeholder="비고" className={INPUT_CLASS} />
                    <textarea rows={2} value={step.sequenceAndContent} onChange={(event) => updateStep(index, { sequenceAndContent: event.target.value })} placeholder="작업순서 및 내용" className={`col-span-2 ${INPUT_CLASS}`} />
                    <input value={step.riskFactor} onChange={(event) => updateStep(index, { riskFactor: event.target.value })} placeholder="위험요인" className={`col-span-2 ${INPUT_CLASS}`} />
                    <textarea rows={2} value={step.safeMethod} onChange={(event) => updateStep(index, { safeMethod: event.target.value })} placeholder="안전작업방법" className={`col-span-2 ${INPUT_CLASS}`} />
                  </div>
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => updatePlan('electric', { workSteps: steps.filter((_, i) => i !== index) })}
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-500 hover:border-red-300 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> 삭제
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => updatePlan('electric', { workSteps: [...steps, emptyWorkStep()] })}
            className="mt-2 inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700"
          >
            <Plus className="h-3.5 w-3.5" /> 행 추가
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900">AI 초안을 생성하고 검토해주세요.</h2>
        <p className="mt-1 text-sm text-gray-500">입력한 작업 정보를 바탕으로 위험요인·개선대책 초안을 생성하고, 아래에서 직접 수정할 수 있습니다.</p>
      </div>

      <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={generate}
            disabled={generating}
            className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-5 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {generating ? 'AI 초안 생성 중...' : hasApplied ? '다시 생성' : 'AI 초안 생성'}
          </button>
          {hasApplied && <span className="text-xs text-gray-500">다시 생성하면 아래 작성된 내용을 덮어씁니다.</span>}
        </div>
        {error && (
          <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>

      {selectedTypes.map((type) => (
        <section key={type} className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="mb-4 font-bold text-gray-900">{planTitle(type)}</h3>
          {type === 'electric' ? renderElectric() : renderCommonEditor(type)}
        </section>
      ))}
    </div>
  )
}
