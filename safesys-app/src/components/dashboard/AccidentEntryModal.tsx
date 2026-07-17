'use client'
// 관할 프로젝트의 사고 이력을 입력하고 수정하는 접근 가능한 모달 폼.

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { AlertCircle, Loader2, X } from 'lucide-react'
import type { Project } from '@/lib/projects'
import {
  ACCIDENT_SEVERITY_OPTIONS,
  ACCIDENT_TYPE_OPTIONS,
  type AccidentFormInput,
  type ProjectAccident,
} from '@/lib/accident-analysis'

interface AccidentEntryModalProps {
  isOpen: boolean
  projects: Project[]
  accident: ProjectAccident | null
  submitting: boolean
  submitError: string
  onClose: () => void
  onSubmit: (input: AccidentFormInput) => Promise<void> | void
}

interface AccidentDraft {
  projectId: string
  accidentAt: string
  severity: AccidentFormInput['severity']
  accidentType: string
  location: string
  workDescription: string
  description: string
  cause: string
  preventionAction: string
  injuredCount: string
  fatalCount: string
  lostWorkdays: string
}

const inputClassName = 'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:bg-gray-100'
const labelClassName = 'mb-1.5 block text-sm font-medium text-gray-700'

const severityOptions = ACCIDENT_SEVERITY_OPTIONS
const accidentTypeOptions = ACCIDENT_TYPE_OPTIONS

const isAccidentSeverity = (value: string): value is AccidentFormInput['severity'] =>
  severityOptions.some((option) => option.value === value)

const toLocalDateTimeInput = (value?: string | null): string => {
  const date = value ? new Date(value) : new Date()
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

const createDraft = (accident: ProjectAccident | null, defaultProjectId: string): AccidentDraft => ({
  projectId: accident?.project_id ?? defaultProjectId,
  accidentAt: toLocalDateTimeInput(accident?.accident_at),
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
})

export default function AccidentEntryModal({
  isOpen,
  projects,
  accident,
  submitting,
  submitError,
  onClose,
  onSubmit,
}: AccidentEntryModalProps) {
  const titleId = useId()
  const descriptionId = useId()
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const [draft, setDraft] = useState<AccidentDraft>(() => createDraft(accident, projects[0]?.id ?? ''))
  const [validationError, setValidationError] = useState('')

  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) =>
      a.managing_hq.localeCompare(b.managing_hq, 'ko') ||
      a.managing_branch.localeCompare(b.managing_branch, 'ko') ||
      (a.display_order ?? Number.MAX_SAFE_INTEGER) - (b.display_order ?? Number.MAX_SAFE_INTEGER) ||
      a.project_name.localeCompare(b.project_name, 'ko')
    ),
    [projects],
  )

  useEffect(() => {
    if (!isOpen) return
    setDraft(createDraft(accident, sortedProjects[0]?.id ?? ''))
    setValidationError('')
  }, [isOpen, accident, sortedProjects])

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

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const injuredCount = Number(draft.injuredCount)
    const fatalCount = Number(draft.fatalCount)
    const lostWorkdays = Number(draft.lostWorkdays)

    if (!draft.projectId) {
      setValidationError('프로젝트를 선택해 주세요.')
      return
    }
    if (!draft.accidentAt) {
      setValidationError('사고 일시를 입력해 주세요.')
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

    setValidationError('')
    const input: AccidentFormInput = {
      project_id: draft.projectId,
      accident_at: new Date(draft.accidentAt).toISOString(),
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
    }
    await onSubmit(input)
  }

  const visibleError = validationError || submitError

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
              피해자 개인정보 없이 사고와 예방조치에 필요한 정보만 기록합니다.
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

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="accident-project" className={labelClassName}>프로젝트 <span className="text-red-500">*</span></label>
                <select
                  id="accident-project"
                  value={draft.projectId}
                  onChange={(event) => updateDraft('projectId', event.target.value)}
                  disabled={submitting || Boolean(accident)}
                  className={inputClassName}
                  required
                >
                  <option value="">프로젝트 선택</option>
                  {sortedProjects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.managing_hq} · {project.managing_branch} · {project.project_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="accident-at" className={labelClassName}>사고 일시 <span className="text-red-500">*</span></label>
                <input id="accident-at" type="datetime-local" value={draft.accidentAt} onChange={(event) => updateDraft('accidentAt', event.target.value)} disabled={submitting} className={inputClassName} required />
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

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-gray-200 bg-gray-50 px-4 py-4 sm:px-6">
            <button type="button" onClick={onClose} disabled={submitting} className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              취소
            </button>
            <button type="submit" disabled={submitting || sortedProjects.length === 0} className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {accident ? '수정 저장' : '사고 이력 저장'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
