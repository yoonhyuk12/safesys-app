'use client'
// 관할 프로젝트의 사고 이력을 입력하고 수정하는 접근 가능한 모달 폼. 미등록 현장 직접입력을 지원한다.

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { AlertCircle, Loader2, X } from 'lucide-react'
import type { Project } from '@/lib/projects'
import {
  ACCIDENT_COMP_CLAIM_OPTIONS,
  ACCIDENT_SEVERITY_OPTIONS,
  ACCIDENT_TYPE_OPTIONS,
  type AccidentFormInput,
  type ProjectAccident,
} from '@/lib/accident-analysis'
import { normalizeAccidentReportDetails, validateAccidentReportDetails, type AccidentReportPhoto } from '@/lib/accident-report'
import { supabase } from '@/lib/supabase'
import { requestAccidentPrefill } from '@/lib/accident-report-import'
import AccidentPrefillPanel from '@/components/project/accident-report/AccidentPrefillPanel'
import AccidentReportFormSections from '@/components/project/accident-report/AccidentReportFormSections'
import { planPrefillMerge, type AccidentDraft, type AccidentPrefillDraftFields } from '@/components/project/accident-report/prefill-merge'
import { mergePdfPhotos } from '@/components/project/accident-report/pdf-photo-merge'
import ProjectSearchSelect, { getProjectOptionLabel, inputClassName } from '@/components/dashboard/AccidentProjectSearchSelect'

interface AccidentEntryModalProps {
  isOpen: boolean
  projects: Project[]
  accident: ProjectAccident | null
  submitting: boolean
  submitError: string
  onClose: () => void
  onSubmit: (input: AccidentFormInput) => Promise<void> | void
  /** 지정하면 이 프로젝트로 고정한다. 프로젝트 변경과 미등록 현장 직접입력을 막는다. */
  fixedProject?: Project | null
  /**
   * 참이면 사고발생보고서 추가 항목과 문서 업로드 초안 채우기를 함께 보여주고 report_details를 저장한다.
   * 거짓(기본)이면 report_details를 아예 넘기지 않아 현장이 작성한 보고서를 지우지 않는다.
   */
  reportMode?: boolean
}

const labelClassName = 'mb-1.5 block text-sm font-medium text-gray-700'

const severityOptions = ACCIDENT_SEVERITY_OPTIONS
const accidentTypeOptions = ACCIDENT_TYPE_OPTIONS
const compClaimOptions = ACCIDENT_COMP_CLAIM_OPTIONS

const isAccidentSeverity = (value: string): value is AccidentFormInput['severity'] =>
  severityOptions.some((option) => option.value === value)

const isWorkersCompClaim = (value: string): value is AccidentFormInput['workers_comp_claim'] =>
  compClaimOptions.some((option) => option.value === value)

const toLocalDateInput = (value?: string | null): string => {
  const date = value ? new Date(value) : new Date()
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const createDraft = (
  accident: ProjectAccident | null,
  defaultProjectId: string,
  fixedProjectId: string,
): AccidentDraft => {
  // 고정 모드에서는 저장된 값이 미등록 현장이더라도 이 프로젝트로 묶는다.
  const isExternal = !fixedProjectId && Boolean(accident && !accident.project_id && accident.external_project_name)
  return {
    projectId: fixedProjectId || (isExternal ? '' : (accident?.project_id ?? defaultProjectId)),
    externalProjectName: isExternal ? (accident?.external_project_name ?? '') : '',
    externalManagingHq: isExternal ? (accident?.external_managing_hq ?? '') : '',
    externalManagingBranch: isExternal ? (accident?.external_managing_branch ?? '') : '',
    isExternal,
    accidentAt: toLocalDateInput(accident?.accident_at),
    severity: accident?.severity ?? 'minor',
    accidentType: accident?.accident_type ?? accidentTypeOptions[0]?.value ?? '',
    location: accident?.location ?? '',
    workDescription: accident?.work_description ?? '',
    description: accident?.description ?? '',
    cause: accident?.cause ?? '',
    preventionAction: accident?.prevention_action ?? '',
    injuredCount: String(accident?.injured_count ?? 0),
    fatalCount: String(accident?.fatal_count ?? 0),
    lostWorkdays: String(accident?.lost_workdays ?? 0),
    workersCompClaim: accident?.workers_comp_claim ?? '',
    reportDetails: normalizeAccidentReportDetails(accident?.report_details ?? null),
  }
}

export default function AccidentEntryModal({
  isOpen,
  projects,
  accident,
  submitting,
  submitError,
  onClose,
  onSubmit,
  fixedProject = null,
  reportMode = false,
}: AccidentEntryModalProps) {
  const titleId = useId()
  const descriptionId = useId()
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const fixedProjectId = fixedProject?.id ?? ''
  const [draft, setDraft] = useState<AccidentDraft>(() => createDraft(accident, projects[0]?.id ?? '', fixedProjectId))
  /** 초안을 새로 만들 때마다 오르는 번호. 사진 필드를 다시 마운트해 늦게 도착한 압축 결과를 버린다. */
  const [draftSession, setDraftSession] = useState(0)
  /** 사진 압축이 도는 동안 참. 저장을 막아 사진 없는 저장을 피한다. */
  const [photoBusy, setPhotoBusy] = useState(false)
  const photoBusyRef = useRef(false)
  const [validationError, setValidationError] = useState('')
  const [prefillLoading, setPrefillLoading] = useState(false)
  const [prefillError, setPrefillError] = useState('')
  const [prefillWarnings, setPrefillWarnings] = useState<string[]>([])
  const [prefillNotice, setPrefillNotice] = useState('')
  /** 덮어쓰기 확인을 기다리는 문서 값. 병합은 사용자가 고른 시점의 최신 초안으로 다시 계산한다. */
  const [pendingFields, setPendingFields] = useState<AccidentPrefillDraftFields | null>(null)
  const pendingPhotosRef = useRef<{ candidates: AccidentReportPhoto[]; atUploadStart: AccidentReportPhoto[] } | null>(null)
  /** 마지막 업로드 요청만 반영한다. 모달이 닫히거나 대상 사고가 바뀌면 번호를 올려 이전 응답을 버린다. */
  const prefillSeqRef = useRef(0)
  /** 신규 등록에서 자동으로 채워진 기본값. 사용자가 손댄 칸을 가려내는 기준이며 수정 모드에서는 null이다. */
  const baselineDraftRef = useRef<AccidentDraft | null>(null)
  /** 비동기 업로드 응답이 클릭 시점이 아니라 지금의 초안을 보게 하는 거울. */
  const draftRef = useRef(draft)
  draftRef.current = draft

  // 확인 패널에 보여줄 충돌 항목. 초안이 바뀌면 다시 계산한다.
  const pendingConflicts = useMemo(
    () => (pendingFields ? planPrefillMerge(draft, pendingFields, baselineDraftRef.current ?? undefined).conflicts : null),
    [pendingFields, draft],
  )

  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) =>
      a.managing_hq.localeCompare(b.managing_hq, 'ko') ||
      a.managing_branch.localeCompare(b.managing_branch, 'ko') ||
      (a.display_order ?? Number.MAX_SAFE_INTEGER) - (b.display_order ?? Number.MAX_SAFE_INTEGER) ||
      a.project_name.localeCompare(b.project_name, 'ko')
    ),
    [projects],
  )

  const hqOptions = useMemo(
    () => Array.from(new Set(sortedProjects.map((project) => project.managing_hq).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ko')),
    [sortedProjects],
  )

  const branchOptions = useMemo(
    () => Array.from(new Set(
      sortedProjects
        .filter((project) => !draft.externalManagingHq || project.managing_hq === draft.externalManagingHq)
        .map((project) => project.managing_branch)
        .filter(Boolean),
    )).sort((a, b) => a.localeCompare(b, 'ko')),
    [draft.externalManagingHq, sortedProjects],
  )

  // 모달이 닫히거나 대상 사고가 바뀌면 진행 중인 업로드 응답을 버린다.
  useEffect(() => {
    prefillSeqRef.current += 1
    setPrefillLoading(false)
    setPrefillError('')
    setPrefillWarnings([])
    setPrefillNotice('')
    setPendingFields(null)
    pendingPhotosRef.current = null
  }, [isOpen, accident, fixedProjectId, sortedProjects])

  useEffect(() => {
    if (!isOpen) return
    const nextDraft = createDraft(accident, sortedProjects[0]?.id ?? '', fixedProjectId)
    // 신규 등록에서만 기본값을 기준으로 삼는다. 수정에서는 저장된 값이 "빈 칸"으로 취급되면 안 된다.
    baselineDraftRef.current = accident ? null : nextDraft
    setDraft(nextDraft)
    setValidationError('')
    setPhotoBusy(false)
    photoBusyRef.current = false
    setDraftSession((current) => current + 1)
  }, [isOpen, accident, sortedProjects, fixedProjectId])

  useEffect(() => {
    if (!isOpen) return
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeButtonRef.current?.focus()
    return () => previouslyFocused?.focus()
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose, submitting])

  if (!isOpen) return null

  const updateDraft = <K extends keyof AccidentDraft>(key: K, value: AccidentDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  const PREFILL_APPLIED_NOTICE = '문서에서 읽은 초안입니다. 내용을 확인하고 부족한 항목을 보완한 뒤 저장하세요.'

  const handlePrefillFile = async (file: File) => {
    const photosAtUploadStart = draftRef.current.reportDetails.photos
    const seq = prefillSeqRef.current + 1
    prefillSeqRef.current = seq
    setPrefillLoading(true)
    setPrefillError('')
    setPrefillWarnings([])
    setPrefillNotice('')
    setPendingFields(null)
    pendingPhotosRef.current = null
    try {
      const { data } = await supabase.auth.getSession()
      const accessToken = data.session?.access_token
      if (!accessToken) throw new Error('로그인 정보를 확인하지 못했습니다.')

      const result = await requestAccidentPrefill(file, draft.projectId || fixedProjectId, accessToken)
      // 늦게 도착한 이전 요청이나 닫힌 모달의 응답은 초안에 반영하지 않는다.
      if (prefillSeqRef.current !== seq) return

      // 업로드하는 동안 사용자가 적은 내용을 지우지 않도록 응답 시점의 최신 초안으로 병합을 계산한다.
      const plan = planPrefillMerge(draftRef.current, result.fields, baselineDraftRef.current ?? undefined)
      const currentPhotos = draftRef.current.reportDetails.photos
      const candidates = photoBusyRef.current ? [] : result.photos
      const mergedPhotos = mergePdfPhotos(currentPhotos, candidates, photosAtUploadStart)
      setPrefillWarnings([
        ...result.warnings,
        ...(result.photos.length > 0 && mergedPhotos === currentPhotos
          ? ['기존 사진 또는 업로드 중 변경한 사진 목록을 보존했습니다. PDF 사진이 필요하면 해당 사진을 직접 첨부해 주세요.']
          : []),
      ])
      if (plan.conflicts.length > 0) {
        pendingPhotosRef.current = { candidates, atUploadStart: photosAtUploadStart }
        setPendingFields(result.fields)
        return
      }
      if (!plan.hasChanges && mergedPhotos === currentPhotos) {
        setPrefillNotice('문서에서 채울 수 있는 항목을 찾지 못했습니다. 직접 입력해 주세요.')
        return
      }
      setDraft((current) => {
        const next = planPrefillMerge(current, result.fields, baselineDraftRef.current ?? undefined).fillEmpty
        return { ...next, reportDetails: { ...next.reportDetails, photos: mergePdfPhotos(current.reportDetails.photos, candidates, photosAtUploadStart) } }
      })
      setPrefillNotice(PREFILL_APPLIED_NOTICE)
    } catch (error: unknown) {
      if (prefillSeqRef.current !== seq) return
      setPrefillError(error instanceof Error && error.message ? error.message : '문서에서 초안을 읽지 못했습니다.')
    } finally {
      if (prefillSeqRef.current === seq) setPrefillLoading(false)
    }
  }

  const applyPendingFields = (mode: 'fillEmpty' | 'overwrite') => {
    const fields = pendingFields
    if (!fields) return
    const pendingPhotos = pendingPhotosRef.current
    const candidates = photoBusyRef.current ? [] : pendingPhotos?.candidates ?? []
    setDraft((current) => {
      const next = planPrefillMerge(current, fields, baselineDraftRef.current ?? undefined)[mode]
      return pendingPhotos
        ? { ...next, reportDetails: { ...next.reportDetails, photos: mergePdfPhotos(current.reportDetails.photos, candidates, pendingPhotos.atUploadStart) } }
        : next
    })
    pendingPhotosRef.current = null
    setPendingFields(null)
    setPrefillNotice(PREFILL_APPLIED_NOTICE)
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (prefillLoading) {
      setValidationError('문서와 사진을 처리하는 중입니다. 완료 후 확인하고 저장해 주세요.')
      return
    }
    if (photoBusy) {
      setValidationError('사진을 처리하는 중입니다. 잠시 뒤 저장해 주세요.')
      return
    }
    const injuredCount = Number(draft.injuredCount)
    const fatalCount = Number(draft.fatalCount)
    const lostWorkdays = Number(draft.lostWorkdays)

    if (fixedProjectId) {
      // 고정 모드에서는 초안이 이미 이 프로젝트로 묶여 있다. 검사만 남겨 회귀를 막는다.
      if (draft.isExternal || draft.projectId !== fixedProjectId) {
        setValidationError('이 현장의 사고만 등록할 수 있습니다.')
        return
      }
    } else if (draft.isExternal) {
      if (!draft.externalProjectName.trim()) {
        setValidationError('미등록 현장명을 입력해 주세요.')
        return
      }
      if (!draft.externalManagingHq) {
        setValidationError('미등록 현장의 관할 본부를 선택해 주세요.')
        return
      }
      if (!draft.externalManagingBranch) {
        setValidationError('미등록 현장의 관할 지사를 선택해 주세요.')
        return
      }
    } else if (!draft.projectId) {
      setValidationError('프로젝트를 선택하거나 미등록 현장으로 직접 입력해 주세요.')
      return
    }
    if (!draft.accidentAt) {
      setValidationError('사고일자를 입력해 주세요.')
      return
    }
    if (!draft.severity || !draft.accidentType) {
      setValidationError('중대도와 사고 유형을 선택해 주세요.')
      return
    }
    if (!draft.description.trim()) {
      setValidationError('사고 개요를 입력해 주세요.')
      return
    }
    if (!draft.location.trim()) {
      setValidationError('사고 장소를 입력해 주세요.')
      return
    }
    if (!draft.workDescription.trim()) {
      setValidationError('사고 당시 작업을 입력해 주세요.')
      return
    }
    if (!draft.cause.trim()) {
      setValidationError('사고 원인을 입력해 주세요.')
      return
    }
    if (!draft.preventionAction.trim()) {
      setValidationError('재발방지 대책을 입력해 주세요.')
      return
    }
    if ([injuredCount, fatalCount, lostWorkdays].some((value) => !Number.isInteger(value) || value < 0)) {
      setValidationError('부상자 수, 사망자 수, 휴업일수는 0 이상의 정수로 입력해 주세요.')
      return
    }

    const normalizedReportDetails = normalizeAccidentReportDetails(draft.reportDetails)
    if (reportMode) {
      const reportValidation = validateAccidentReportDetails(normalizedReportDetails)
      if (!reportValidation.valid) {
        setValidationError(Object.values(reportValidation.errors)[0] ?? '보고서 항목을 확인해 주세요.')
        return
      }
    }

    setValidationError('')
    const input: AccidentFormInput = {
      project_id: draft.isExternal ? '' : draft.projectId,
      external_project_name: draft.isExternal ? draft.externalProjectName.trim() : '',
      external_managing_hq: draft.isExternal ? draft.externalManagingHq : '',
      external_managing_branch: draft.isExternal ? draft.externalManagingBranch : '',
      // 일자만 저장. 서버 정규화에서 YYYY-MM-DD → 서울 00:00으로 변환한다.
      accident_at: draft.accidentAt,
      severity: draft.severity,
      accident_type: draft.accidentType,
      location: draft.location.trim(),
      work_description: draft.workDescription.trim(),
      description: draft.description.trim(),
      cause: draft.cause.trim(),
      prevention_action: draft.preventionAction.trim(),
      injured_count: injuredCount,
      fatal_count: fatalCount,
      lost_workdays: lostWorkdays,
      workers_comp_claim: draft.workersCompClaim,
      // 보고서 모드가 아니면 키 자체를 넣지 않아 저장된 report_details를 건드리지 않는다.
      ...(reportMode ? { report_details: normalizedReportDetails } : {}),
    }
    await onSubmit(input)
  }

  const visibleError = validationError || submitError
  // 수정 모드에서도 프로젝트/미등록 현장 변경 허용. 제출 중에만 잠근다.
  const lockProject = submitting

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-6" role="presentation">
      <div
        className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <div className="flex items-start justify-between border-b border-gray-200 px-4 py-4 sm:px-6">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-gray-900">
              {accident ? '사고 이력 수정' : '사고 이력 입력'}
            </h2>
            <p id={descriptionId} className="mt-1 text-sm text-gray-500">
              {reportMode
                ? '사고발생보고서에 필요한 항목을 함께 기록합니다. 모든 추가 항목은 선택이며 사진은 최대 2장입니다.'
                : '피해자 개인정보 없이 사고와 예방조치에 필요한 정보만 기록합니다.'}
              {fixedProject ? ' 현장은 이 프로젝트로 고정됩니다.' : ' 시스템에 없는 현장은 직접 입력할 수 있습니다.'}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="사고 이력 입력 닫기"
            className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-6">
            {visibleError && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert" aria-live="polite">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>{visibleError}</span>
              </div>
            )}

            {reportMode && (
              <AccidentPrefillPanel
                loading={prefillLoading}
                disabled={submitting}
                error={prefillError}
                warnings={prefillWarnings}
                notice={prefillNotice}
                conflicts={pendingConflicts}
                onSelectFile={handlePrefillFile}
                onFillEmpty={() => applyPendingFields('fillEmpty')}
                onOverwrite={() => applyPendingFields('overwrite')}
                onCancel={() => { setPendingFields(null); pendingPhotosRef.current = null }}
              />
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="accident-project" className={labelClassName}>프로젝트 <span className="text-red-500">*</span></label>
                {fixedProject ? (
                  <>
                    <input
                      id="accident-project"
                      type="text"
                      value={getProjectOptionLabel(fixedProject)}
                      readOnly
                      aria-describedby="accident-project-fixed-note"
                      className={`${inputClassName} bg-gray-50 text-gray-700`}
                    />
                    <p id="accident-project-fixed-note" className="mt-1.5 text-xs text-gray-500">
                      이 현장의 사고보고 서류철에서 작성하므로 다른 현장으로 바꿀 수 없습니다.
                    </p>
                  </>
                ) : (
                  <ProjectSearchSelect
                    id="accident-project"
                    projects={sortedProjects}
                    projectId={draft.projectId}
                    externalProjectName={draft.externalProjectName}
                    isExternal={draft.isExternal}
                    externalManagingHq={draft.externalManagingHq}
                    externalManagingBranch={draft.externalManagingBranch}
                    disabled={lockProject}
                    onSelectProject={(projectId) => setDraft((current) => ({
                      ...current,
                      projectId,
                      isExternal: false,
                      externalProjectName: '',
                      externalManagingHq: '',
                      externalManagingBranch: '',
                    }))}
                    onSelectExternal={(name) => setDraft((current) => ({
                      ...current,
                      projectId: '',
                      isExternal: true,
                      externalProjectName: name,
                      externalManagingHq: current.externalManagingHq || hqOptions[0] || '',
                      externalManagingBranch: current.externalManagingBranch || '',
                    }))}
                  />
                )}
                {draft.isExternal && (
                  <div className="mt-3 grid gap-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3 sm:grid-cols-2">
                    <p className="sm:col-span-2 text-xs text-amber-900">
                      미등록 현장으로 저장합니다. 관할 본부·지사를 지정해야 조회 권한과 필터에 반영됩니다.
                    </p>
                    <div className="sm:col-span-2">
                      <label htmlFor="accident-external-name" className={labelClassName}>현장명 <span className="text-red-500">*</span></label>
                      <input
                        id="accident-external-name"
                        type="text"
                        value={draft.externalProjectName}
                        onChange={(event) => updateDraft('externalProjectName', event.target.value)}
                        disabled={submitting}
                        className={inputClassName}
                        maxLength={200}
                        required
                      />
                    </div>
                    <div>
                      <label htmlFor="accident-external-hq" className={labelClassName}>관할 본부 <span className="text-red-500">*</span></label>
                      <select
                        id="accident-external-hq"
                        value={draft.externalManagingHq}
                        onChange={(event) => setDraft((current) => ({
                          ...current,
                          externalManagingHq: event.target.value,
                          externalManagingBranch: '',
                        }))}
                        disabled={submitting}
                        className={inputClassName}
                        required
                      >
                        <option value="">본부 선택</option>
                        {hqOptions.map((hq) => <option key={hq} value={hq}>{hq}</option>)}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="accident-external-branch" className={labelClassName}>관할 지사 <span className="text-red-500">*</span></label>
                      <select
                        id="accident-external-branch"
                        value={draft.externalManagingBranch}
                        onChange={(event) => updateDraft('externalManagingBranch', event.target.value)}
                        disabled={submitting || !draft.externalManagingHq}
                        className={inputClassName}
                        required
                      >
                        <option value="">지사 선택</option>
                        {branchOptions.map((branch) => <option key={branch} value={branch}>{branch}</option>)}
                      </select>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="accident-at" className={labelClassName}>사고일자 <span className="text-red-500">*</span></label>
                <input id="accident-at" type="date" value={draft.accidentAt} onChange={(event) => updateDraft('accidentAt', event.target.value)} disabled={submitting} className={inputClassName} required />
              </div>
              <div>
                <label htmlFor="accident-severity" className={labelClassName}>중대도 <span className="text-red-500">*</span></label>
                <select
                  id="accident-severity"
                  value={draft.severity}
                  onChange={(event) => {
                    if (isAccidentSeverity(event.target.value)) updateDraft('severity', event.target.value)
                  }}
                  disabled={submitting}
                  className={inputClassName}
                  required
                >
                  {severityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="accident-type" className={labelClassName}>사고 유형 <span className="text-red-500">*</span></label>
                <select id="accident-type" value={draft.accidentType} onChange={(event) => updateDraft('accidentType', event.target.value)} disabled={submitting} className={inputClassName} required>
                  {accidentTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="accident-location" className={labelClassName}>사고 장소 <span className="text-red-500">*</span></label>
                <input id="accident-location" type="text" value={draft.location} onChange={(event) => updateDraft('location', event.target.value)} disabled={submitting} className={inputClassName} maxLength={200} required />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="accident-work" className={labelClassName}>사고 당시 작업 <span className="text-red-500">*</span></label>
                <input id="accident-work" type="text" value={draft.workDescription} onChange={(event) => updateDraft('workDescription', event.target.value)} disabled={submitting} className={inputClassName} maxLength={500} required />
              </div>
            </div>

            <div>
              <label htmlFor="accident-description" className={labelClassName}>사고 개요 <span className="text-red-500">*</span></label>
              <textarea id="accident-description" value={draft.description} onChange={(event) => updateDraft('description', event.target.value)} disabled={submitting} className={`${inputClassName} min-h-24 resize-y`} maxLength={2000} required />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="accident-cause" className={labelClassName}>사고 원인 <span className="text-red-500">*</span></label>
                <textarea id="accident-cause" value={draft.cause} onChange={(event) => updateDraft('cause', event.target.value)} disabled={submitting} className={`${inputClassName} min-h-24 resize-y`} maxLength={2000} required />
              </div>
              <div>
                <label htmlFor="accident-prevention" className={labelClassName}>재발방지 대책 <span className="text-red-500">*</span></label>
                <textarea id="accident-prevention" value={draft.preventionAction} onChange={(event) => updateDraft('preventionAction', event.target.value)} disabled={submitting} className={`${inputClassName} min-h-24 resize-y`} maxLength={2000} required />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label htmlFor="accident-injured-count" className={labelClassName}>부상자 수</label>
                <input id="accident-injured-count" type="number" min="0" step="1" value={draft.injuredCount} onChange={(event) => updateDraft('injuredCount', event.target.value)} disabled={submitting} className={inputClassName} inputMode="numeric" />
              </div>
              <div>
                <label htmlFor="accident-fatal-count" className={labelClassName}>사망자 수</label>
                <input id="accident-fatal-count" type="number" min="0" step="1" value={draft.fatalCount} onChange={(event) => updateDraft('fatalCount', event.target.value)} disabled={submitting} className={inputClassName} inputMode="numeric" />
              </div>
              <div>
                <label htmlFor="accident-lost-workdays" className={labelClassName}>휴업일수</label>
                <input id="accident-lost-workdays" type="number" min="0" step="1" value={draft.lostWorkdays} onChange={(event) => updateDraft('lostWorkdays', event.target.value)} disabled={submitting} className={inputClassName} inputMode="numeric" />
              </div>
              <div>
                <label htmlFor="accident-comp-claim" className={labelClassName}>산재신청 여부</label>
                <select
                  id="accident-comp-claim"
                  value={draft.workersCompClaim}
                  onChange={(event) => {
                    if (isWorkersCompClaim(event.target.value)) updateDraft('workersCompClaim', event.target.value)
                  }}
                  disabled={submitting}
                  className={inputClassName}
                >
                  {compClaimOptions.map((option) => <option key={option.value || 'unknown'} value={option.value}>{option.label}</option>)}
                </select>
              </div>
            </div>

            {reportMode && (
              <AccidentReportFormSections
                key={draftSession}
                details={draft.reportDetails}
                disabled={submitting}
                onChange={(update) => setDraft((current) => ({ ...current, reportDetails: update(current.reportDetails) }))}
                onPhotoBusyChange={(busy) => { photoBusyRef.current = busy; setPhotoBusy(busy) }}
              />
            )}
          </div>

          <div className="flex justify-end gap-3 border-t border-gray-200 bg-gray-50 px-4 py-4 sm:px-6">
            <button type="button" onClick={onClose} disabled={submitting} className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              취소
            </button>
            <button type="submit" disabled={submitting || photoBusy || prefillLoading} className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {accident ? '수정 저장' : '사고 이력 저장'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
