'use client'

// 수시 위험성평가 작성·수정 마법사 — 신규는 4단계, 수정은 행 편집·저장 2단계 흐름과 단계별 상태를 관리한다

import { useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Loader2, Save, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { inferBusinessType } from '@/lib/risk-assessment/business-type-infer'
import type { RiskAssessmentRow } from '@/lib/risk-assessment/types'
import BusinessTypeStep from './BusinessTypeStep'
import RowEditorStep from './RowEditorStep'
import SaveStep, { type SignatureNameKey, type SignatureNames } from './SaveStep'
import WorkInputStep from './WorkInputStep'
import { BUSINESS_TYPE_ALL, type RiskAssessmentRecord } from './record'

interface RiskAssessmentWizardProps {
  projectId: string
  projectName: string
  managingHq: string | null
  managingBranch: string | null
  savedBusinessType: string | null
  defaultAuthorName: string
  /** 프로젝트 소유자 이름 — 결재란 현장소장 기본값 */
  ownerName: string
  /** projects.supervisor_name — 결재란 공사감독 기본값 */
  supervisorName: string
  userId: string
  /** 주면 수정 모드 — 저장된 값을 채운 채 행 편집 단계부터 시작한다 */
  initialRecord?: RiskAssessmentRecord | null
  onSaved: (record: RiskAssessmentRecord) => void
  onClose: () => void
}

type StepKey = 'business' | 'work' | 'rows' | 'save'

const CREATE_STEPS: Array<{ key: StepKey; label: string }> = [
  { key: 'business', label: '사업별 확인' },
  { key: 'work', label: '작업 정보·AI 분류' },
  { key: 'rows', label: '행 편집' },
  { key: 'save', label: '저장' },
]

// 수정 모드는 재분류 없이 내용만 손보므로 앞 두 단계를 건너뛴다.
const EDIT_STEPS: Array<{ key: StepKey; label: string }> = [
  { key: 'rows', label: '행 편집' },
  { key: 'save', label: '저장' },
]

/** 로컬 날짜 문자열 — toISOString은 UTC 기준이라 이른 새벽에 하루 밀린다. */
const formatLocalDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

const today = () => formatLocalDate(new Date())

const addDays = (days: number) => {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return formatLocalDate(date)
}

// 신규 작성 관리기간 기본값 (시작일 포함 30일간)
const DEFAULT_PERIOD_DAYS = 30

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
  ownerName,
  supervisorName,
  userId,
  initialRecord,
  onSaved,
  onClose,
}: RiskAssessmentWizardProps) {
  const inferred = useMemo(() => inferBusinessType(projectName), [projectName])
  const isEdit = Boolean(initialRecord)
  const steps = isEdit ? EDIT_STEPS : CREATE_STEPS

  const [step, setStep] = useState(0)
  // 저장된 사업별이 null이면 전체 모드로 만든 평가서다
  const [businessType, setBusinessType] = useState(initialRecord
    ? initialRecord.business_type || BUSINESS_TYPE_ALL
    : savedBusinessType || inferred || BUSINESS_TYPE_ALL)
  const [workDescription, setWorkDescription] = useState(initialRecord?.trigger || '')
  const [personnel, setPersonnel] = useState('')
  const [equipment, setEquipment] = useState('')
  const [workLocation, setWorkLocation] = useState('')
  const [rows, setRows] = useState<RiskAssessmentRow[]>(initialRecord?.rows || [])
  const [title, setTitle] = useState(initialRecord?.title || '')
  const [authorName, setAuthorName] = useState(initialRecord?.author_name || defaultAuthorName)
  const [managePeriodStart, setManagePeriodStart] = useState(initialRecord?.manage_period_start || today())
  const [managePeriodEnd, setManagePeriodEnd] = useState(initialRecord?.manage_period_end || addDays(DEFAULT_PERIOD_DAYS - 1))
  // 저장된 명단이 있으면 그대로, 없으면 접속자·프로젝트 정보로 채운다 (안전 담당은 수기 입력)
  const [signatureNames, setSignatureNames] = useState<SignatureNames>({
    constructionName: initialRecord?.signatures?.constructionName ?? defaultAuthorName,
    safetyName: initialRecord?.signatures?.safetyName ?? '',
    siteManagerName: initialRecord?.signatures?.siteManagerName ?? ownerName,
    supervisorName: initialRecord?.signatures?.supervisorName ?? supervisorName,
  })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const currentKey = steps[step].key

  const updateSignatureName = (key: SignatureNameKey, value: string) => {
    setSignatureNames((current) => ({ ...current, [key]: value }))
  }

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
    if (currentKey === 'work' || currentKey === 'rows') return rows.length > 0
    return true
  }

  const goNext = async () => {
    if (!canProceed()) return
    if (currentKey === 'business') await persistBusinessType()
    if (currentKey === 'rows' && !title.trim()) {
      setTitle(`${detailWorks[0] || projectName} 수시 위험성평가 (${today()})`)
    }
    setStep((current) => Math.min(steps.length - 1, current + 1))
  }

  const goPrev = () => setStep((current) => Math.max(0, current - 1))

  const handleRowsReady = (nextRows: RiskAssessmentRow[]) => {
    setRows(nextRows)
    setStep(steps.findIndex((item) => item.key === 'rows'))
  }

  const handleSave = async () => {
    if (!title.trim()) {
      setSaveError('제목을 입력해주세요.')
      return
    }
    setSaving(true)
    setSaveError('')
    try {
      // 두 흐름이 공유하는 본문. updated_at은 DB 트리거가 갱신한다.
      const payload = {
        title: title.trim(),
        business_type: businessType === BUSINESS_TYPE_ALL ? null : businessType,
        trigger: workDescription.trim(),
        author_name: authorName.trim(),
        manage_period_start: managePeriodStart || null,
        manage_period_end: managePeriodEnd || null,
        rows: normalizeRows(rows),
        // 이미 받아 둔 서명 이미지는 남기고 명단만 덮어쓴다
        signatures: {
          ...(initialRecord?.signatures ?? {}),
          constructionName: signatureNames.constructionName.trim(),
          safetyName: signatureNames.safetyName.trim(),
          siteManagerName: signatureNames.siteManagerName.trim(),
          supervisorName: signatureNames.supervisorName.trim(),
        },
      }

      const { data, error } = initialRecord
        ? await supabase
            .from('risk_assessments')
            .update(payload)
            .eq('id', initialRecord.id)
            .select('*')
            .single()
        : await supabase
            .from('risk_assessments')
            .insert({
              ...payload,
              project_id: projectId,
              assessment_type: '수시',
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
        : `${isEdit ? '수정 저장' : '저장'}에 실패했습니다. ${message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
        <h2 className="font-bold text-gray-900">{isEdit ? '수시 위험성평가 수정' : '새 수시 위험성평가'}</h2>
        <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600" aria-label={isEdit ? '수정 취소' : '작성 취소'}>
          <X className="h-5 w-5" />
        </button>
      </div>

      <ol className="flex flex-wrap gap-1.5 border-b border-gray-200 px-4 py-3">
        {steps.map(({ label }, index) => (
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
        {currentKey === 'business' && (
          <BusinessTypeStep
            projectName={projectName}
            inferred={inferred}
            value={businessType}
            onChange={setBusinessType}
          />
        )}
        {currentKey === 'work' && (
          <WorkInputStep
            projectId={projectId}
            projectName={projectName}
            managingHq={managingHq}
            managingBranch={managingBranch}
            businessType={businessType}
            workDescription={workDescription}
            personnel={personnel}
            equipment={equipment}
            workLocation={workLocation}
            onWorkDescriptionChange={setWorkDescription}
            onPersonnelChange={setPersonnel}
            onEquipmentChange={setEquipment}
            onWorkLocationChange={setWorkLocation}
            onRowsReady={handleRowsReady}
          />
        )}
        {currentKey === 'rows' && (
          <RowEditorStep rows={rows} detailWork={detailWorks[0] || ''} onChange={setRows} />
        )}
        {currentKey === 'save' && (
          <SaveStep
            title={title}
            authorName={authorName}
            managePeriodStart={managePeriodStart}
            managePeriodEnd={managePeriodEnd}
            businessTypeLabel={businessTypeLabel}
            detailWorkLabel={detailWorks.join(', ')}
            trigger={workDescription}
            rowCount={rows.length}
            signatureNames={signatureNames}
            onTitleChange={setTitle}
            onAuthorNameChange={setAuthorName}
            onManagePeriodStartChange={setManagePeriodStart}
            onManagePeriodEndChange={setManagePeriodEnd}
            onSignatureNameChange={updateSignatureName}
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

        {step < steps.length - 1 ? (
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
            {saving ? '저장 중' : isEdit ? '수정 저장' : '저장'}
          </button>
        )}
      </div>
    </section>
  )
}
