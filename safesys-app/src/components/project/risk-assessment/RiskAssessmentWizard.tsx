'use client'

// 수시 위험성평가 작성 마법사 — 사업별 확인부터 저장까지 4단계 흐름과 단계별 상태를 관리한다

import { useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Loader2, Save, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { inferBusinessType } from '@/lib/risk-assessment/business-type-infer'
import type { RiskAssessmentRow } from '@/lib/risk-assessment/types'
import BusinessTypeStep from './BusinessTypeStep'
import RowEditorStep from './RowEditorStep'
import SaveStep from './SaveStep'
import WorkInputStep from './WorkInputStep'
import { BUSINESS_TYPE_ALL, type RiskAssessmentRecord } from './record'

interface RiskAssessmentWizardProps {
  projectId: string
  projectName: string
  managingHq: string | null
  managingBranch: string | null
  savedBusinessType: string | null
  defaultAuthorName: string
  userId: string
  onSaved: (record: RiskAssessmentRecord) => void
  onClose: () => void
}

const STEPS = ['사업별 확인', '작업 정보·AI 분류', '행 편집', '저장']

const today = () => new Date().toISOString().slice(0, 10)

const addDays = (days: number) => {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

/** 저장 전 정리 — 빈 대책 줄을 걷어내고 담당자 등 공백을 다듬는다. */
function normalizeRows(rows: RiskAssessmentRow[]): RiskAssessmentRow[] {
  return rows.map((row) => ({
    ...row,
    detailWork: row.detailWork.trim(),
    workLocation: row.workLocation.trim(),
    equipment: row.equipment.trim(),
    hazard: row.hazard.trim(),
    disasterType: row.disasterType.trim(),
    measures: row.measures.map((measure) => measure.trim()).filter(Boolean),
    reviewNote: row.reviewNote.trim(),
    managerSub: row.managerSub.trim(),
    managerMain: row.managerMain.trim(),
  }))
}

export default function RiskAssessmentWizard({
  projectId,
  projectName,
  managingHq,
  managingBranch,
  savedBusinessType,
  defaultAuthorName,
  userId,
  onSaved,
  onClose,
}: RiskAssessmentWizardProps) {
  const inferred = useMemo(() => inferBusinessType(projectName), [projectName])

  const [step, setStep] = useState(0)
  const [businessType, setBusinessType] = useState(savedBusinessType || inferred || BUSINESS_TYPE_ALL)
  const [workDescription, setWorkDescription] = useState('')
  const [personnel, setPersonnel] = useState('')
  const [equipment, setEquipment] = useState('')
  const [rows, setRows] = useState<RiskAssessmentRow[]>([])
  const [title, setTitle] = useState('')
  const [authorName, setAuthorName] = useState(defaultAuthorName)
  const [managePeriodStart, setManagePeriodStart] = useState(today())
  const [managePeriodEnd, setManagePeriodEnd] = useState(addDays(6))
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const businessTypeLabel = businessType === BUSINESS_TYPE_ALL ? '사업 무관(전체)' : businessType
  // 행마다 세부단위작업이 달라질 수 있어 요약에는 고유값을 모아 보여준다
  const detailWorks = [...new Set(rows.map((row) => row.detailWork).filter(Boolean))]

  // 확정한 사업별을 프로젝트에 기억시킨다. 편의 기능이라 실패해도 작성 흐름은 막지 않는다.
  const persistBusinessType = async () => {
    const value = businessType === BUSINESS_TYPE_ALL ? null : businessType
    if (value === savedBusinessType) return
    const { error } = await supabase.from('projects').update({ risk_business_type: value }).eq('id', projectId)
    if (error) console.error('사업별 확정값 저장 실패:', error)
  }

  const canProceed = () => {
    if (step === 1 || step === 2) return rows.length > 0
    return true
  }

  const goNext = async () => {
    if (!canProceed()) return
    if (step === 0) await persistBusinessType()
    if (step === 2 && !title.trim()) {
      setTitle(`${detailWorks[0] || projectName} 수시 위험성평가 (${today()})`)
    }
    setStep((current) => Math.min(STEPS.length - 1, current + 1))
  }

  const goPrev = () => setStep((current) => Math.max(0, current - 1))

  const handleRowsReady = (nextRows: RiskAssessmentRow[]) => {
    setRows(nextRows)
    setStep(2)
  }

  const handleSave = async () => {
    if (!title.trim()) {
      setSaveError('제목을 입력해주세요.')
      return
    }
    setSaving(true)
    setSaveError('')
    try {
      const { data, error } = await supabase
        .from('risk_assessments')
        .insert({
          project_id: projectId,
          assessment_type: '수시',
          title: title.trim(),
          business_type: businessType === BUSINESS_TYPE_ALL ? null : businessType,
          trigger: workDescription.trim(),
          author_name: authorName.trim(),
          manage_period_start: managePeriodStart || null,
          manage_period_end: managePeriodEnd || null,
          rows: normalizeRows(rows),
          signatures: {},
          created_by: userId,
        })
        .select('*')
        .single()

      if (error) throw new Error(error.message)
      onSaved(data as RiskAssessmentRecord)
      onClose()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '알 수 없는 오류'
      setSaveError(message.includes('risk_assessments')
        ? '위험성평가 테이블이 준비되지 않았습니다. 데이터베이스 마이그레이션을 먼저 실행해주세요.'
        : `저장에 실패했습니다. ${message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
        <h2 className="font-bold text-gray-900">새 수시 위험성평가</h2>
        <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600" aria-label="작성 취소">
          <X className="h-5 w-5" />
        </button>
      </div>

      <ol className="flex flex-wrap gap-1.5 border-b border-gray-200 px-4 py-3">
        {STEPS.map((label, index) => (
          <li key={label}>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
              index === step
                ? 'bg-blue-600 text-white'
                : index < step
                  ? 'bg-blue-50 text-blue-700'
                  : 'bg-gray-100 text-gray-500'
            }`}>
              <span className="font-bold">{index + 1}</span>{label}
            </span>
          </li>
        ))}
      </ol>

      <div className="px-4 py-4">
        {step === 0 && (
          <BusinessTypeStep
            projectName={projectName}
            inferred={inferred}
            value={businessType}
            onChange={setBusinessType}
          />
        )}
        {step === 1 && (
          <WorkInputStep
            projectId={projectId}
            projectName={projectName}
            managingHq={managingHq}
            managingBranch={managingBranch}
            businessType={businessType}
            workDescription={workDescription}
            personnel={personnel}
            equipment={equipment}
            onWorkDescriptionChange={setWorkDescription}
            onPersonnelChange={setPersonnel}
            onEquipmentChange={setEquipment}
            onRowsReady={handleRowsReady}
          />
        )}
        {step === 2 && (
          <RowEditorStep rows={rows} detailWork={detailWorks[0] || ''} onChange={setRows} />
        )}
        {step === 3 && (
          <SaveStep
            title={title}
            authorName={authorName}
            managePeriodStart={managePeriodStart}
            managePeriodEnd={managePeriodEnd}
            businessTypeLabel={businessTypeLabel}
            detailWorkLabel={detailWorks.join(', ')}
            trigger={workDescription}
            rowCount={rows.length}
            onTitleChange={setTitle}
            onAuthorNameChange={setAuthorName}
            onManagePeriodStartChange={setManagePeriodStart}
            onManagePeriodEndChange={setManagePeriodEnd}
          />
        )}
      </div>

      {saveError && (
        <div role="alert" className="mx-4 mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{saveError}</div>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-gray-200 px-4 py-3">
        <button
          type="button"
          onClick={goPrev}
          disabled={step === 0 || saving}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
        >
          <ArrowLeft className="h-4 w-4" />이전
        </button>

        {step < STEPS.length - 1 ? (
          <button
            type="button"
            onClick={goNext}
            disabled={!canProceed()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            다음<ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || rows.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? '저장 중' : '저장'}
          </button>
        )}
      </div>
    </section>
  )
}
