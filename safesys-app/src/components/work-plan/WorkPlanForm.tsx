'use client'

// 프로젝트·근로자·공정표 값을 자동 인입해 작업계획서 기본정보와 현장 즉시 정보를 입력하는 폼

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CalendarRange, History, Loader2, Plus, Trash2, Users } from 'lucide-react'
import { fetchRecentTbm, type TbmCandidate } from '@/lib/ptw/recent-tbm'
import { GUIDE_SIGNAL_METHODS, HEAVY_FIXING_METHODS, HEAVY_LOAD_SHAPE_EXAMPLES } from '@/lib/work-plan/constants'
import {
  EXCAVATION_DRAINAGE_PRESETS,
  EXCAVATION_EQUIPMENT_PRESETS,
  EXCAVATION_METHOD_PRESETS,
} from '@/lib/work-plan/excavation-constants'
import type {
  CommonWorkPlanFields,
  PersonContact,
  PlanType,
  WorkPlanFormData,
  WorkPlanWorker,
} from '@/lib/work-plan/types'

interface WorkPlanFormProps {
  selectedTypes: PlanType[]
  formData: WorkPlanFormData
  onChange: (data: WorkPlanFormData) => void
  workers: WorkPlanWorker[]
  scheduleCandidates: string[]
  constructionPeriod: { start?: string | null; end?: string | null }
  projectId: string
  projectName: string
}

interface FieldProps {
  label: string
  value: string | number | null | undefined
  onChange: (value: string) => void
  type?: 'text' | 'date' | 'time' | 'number'
  placeholder?: string
  list?: string
  suffix?: string
}

const TYPE_LABELS: Record<PlanType, string> = {
  loading: '붙임 2-1 차량계 하역운반기계',
  construction: '붙임 2-2 차량계 건설기계',
  electric: '붙임 2-3 전기 작업',
  heavy: '붙임 2-4 중량물 취급',
  excavation: '표준 양식 지반 굴착',
}

function Field({ label, value, onChange, type = 'text', placeholder, list, suffix }: FieldProps) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
      <span className="relative block">
        <input
          type={type}
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          list={list}
          step={type === 'number' ? 'any' : undefined}
          className={`w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 ${suffix ? 'pr-12' : ''}`}
        />
        {suffix && <span className="absolute right-3 top-2 text-sm text-gray-400">{suffix}</span>}
      </span>
    </label>
  )
}

// 쉼표 구분 성명 입력 — 끝 쉼표/공백을 지우지 않아 다음 이름을 이어서 칠 수 있게 한다
function parseCommaSeparatedNames(value: string) {
  return value.split(',').map((name) => name.trim()).filter(Boolean)
}

function namesKey(names: string[]) {
  return names.join('\0')
}

function CommaSeparatedNamesField({
  label,
  names,
  onChange,
  placeholder,
}: {
  label: string
  names: string[]
  onChange: (names: string[]) => void
  placeholder?: string
}) {
  const joined = names.join(', ')
  const [draft, setDraft] = useState(joined)

  useEffect(() => {
    if (namesKey(parseCommaSeparatedNames(draft)) !== namesKey(names)) {
      setDraft(joined)
    }
  }, [draft, joined, names])

  return (
    <Field
      label={label}
      value={draft}
      placeholder={placeholder}
      onChange={(value) => {
        setDraft(value)
        onChange(parseCommaSeparatedNames(value))
      }}
    />
  )
}

// 작업시간 바 눈금 — 05:00부터 21:00까지 30분 단위 시각 목록
const WORK_TIME_SLOTS = Array.from({ length: 33 }, (_, index) => {
  const minutes = 5 * 60 + index * 30
  return `${`${Math.floor(minutes / 60)}`.padStart(2, '0')}:${`${minutes % 60}`.padStart(2, '0')}`
})

const WORK_TIME_HOUR_LABELS = ['05', '07', '09', '11', '13', '15', '17', '19', '21']

function parseWorkTimeRange(value: string) {
  const [start, end] = value.split('~').map((part) => part.trim())
  return {
    startIndex: WORK_TIME_SLOTS.indexOf(start || ''),
    endIndex: WORK_TIME_SLOTS.indexOf(end || ''),
  }
}

// "07:30" → "7시30분", "08:00" → "8시"
function formatKoreanTime(slot: string) {
  const [hour, minute] = slot.split(':').map(Number)
  return minute === 0 ? `${hour}시` : `${hour}시${minute}분`
}

// 세로 핸들 2개를 좌우로 드래그해 시작·종료 시간을 30분 단위로 고르는 작업시간 슬라이더
function WorkTimeRangeBar({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef<'start' | 'end' | null>(null)
  const parsed = parseWorkTimeRange(value)
  const hasValue = parsed.startIndex >= 0
  // 값이 없으면 기본 위치(08:00~17:00)에 회색 핸들을 보여주고, 조작하는 순간부터 값을 기록한다.
  const startIndex = parsed.startIndex >= 0 ? parsed.startIndex : WORK_TIME_SLOTS.indexOf('08:00')
  const endIndex = parsed.endIndex >= 0 ? parsed.endIndex : parsed.startIndex >= 0 ? parsed.startIndex : WORK_TIME_SLOTS.indexOf('17:00')
  const toPercent = (index: number) => index / (WORK_TIME_SLOTS.length - 1) * 100

  const slotFromClientX = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return 0
    const ratio = (clientX - rect.left) / rect.width
    return Math.min(WORK_TIME_SLOTS.length - 1, Math.max(0, Math.round(ratio * (WORK_TIME_SLOTS.length - 1))))
  }

  const moveHandle = (handle: 'start' | 'end', index: number) => {
    if (handle === 'start') onChange(`${WORK_TIME_SLOTS[Math.min(index, endIndex)]} ~ ${WORK_TIME_SLOTS[endIndex]}`)
    else onChange(`${WORK_TIME_SLOTS[startIndex]} ~ ${WORK_TIME_SLOTS[Math.max(index, startIndex)]}`)
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    const index = slotFromClientX(event.clientX)
    const handle = Math.abs(index - startIndex) <= Math.abs(index - endIndex) ? 'start' : 'end'
    draggingRef.current = handle
    moveHandle(handle, index)
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (draggingRef.current) moveHandle(draggingRef.current, slotFromClientX(event.clientX))
  }

  const stopDragging = () => {
    draggingRef.current = null
  }

  return (
    <div className="block min-w-0">
      <span className="mb-1 flex flex-wrap items-center justify-between gap-1 text-xs font-medium text-gray-600">
        <span>작업시간 (30분 단위)</span>
        <span className="flex items-center gap-2">
          <span className={hasValue ? 'font-semibold text-blue-700' : 'text-gray-400'}>
            {hasValue ? `${WORK_TIME_SLOTS[startIndex]} ~ ${WORK_TIME_SLOTS[endIndex]}` : '바를 움직여 시작·종료 시간을 선택하세요.'}
          </span>
          {hasValue && <button type="button" onClick={() => onChange('')} className="text-gray-400 underline hover:text-gray-600">초기화</button>}
        </span>
      </span>
      <div
        ref={trackRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
        className="relative h-12 touch-none cursor-pointer select-none"
      >
        {/* 핸들 위 선택 시간 표시 — 시작·종료가 같으면 하나만 보여준다 */}
        <span
          className={`absolute top-0.5 -translate-x-1/2 whitespace-nowrap text-[11px] font-semibold ${hasValue ? 'text-blue-700' : 'text-gray-400'}`}
          style={{ left: `${toPercent(startIndex)}%` }}
        >
          {formatKoreanTime(WORK_TIME_SLOTS[startIndex])}
        </span>
        {endIndex !== startIndex && (
          <span
            className={`absolute top-0.5 -translate-x-1/2 whitespace-nowrap text-[11px] font-semibold ${hasValue ? 'text-blue-700' : 'text-gray-400'}`}
            style={{ left: `${toPercent(endIndex)}%` }}
          >
            {formatKoreanTime(WORK_TIME_SLOTS[endIndex])}
          </span>
        )}
        <div className="absolute inset-x-0 top-8 h-2 -translate-y-1/2 rounded-full bg-gray-200" />
        <div
          className={`absolute top-8 h-2 -translate-y-1/2 rounded-full ${hasValue ? 'bg-blue-500' : 'bg-gray-300'}`}
          style={{ left: `${toPercent(startIndex)}%`, width: `${toPercent(endIndex) - toPercent(startIndex)}%` }}
        />
        <div
          className={`absolute top-8 h-7 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white shadow ${hasValue ? 'bg-blue-600' : 'bg-gray-400'}`}
          style={{ left: `${toPercent(startIndex)}%` }}
        />
        <div
          className={`absolute top-8 h-7 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white shadow ${hasValue ? 'bg-blue-600' : 'bg-gray-400'}`}
          style={{ left: `${toPercent(endIndex)}%` }}
        />
      </div>
      <div className="flex justify-between px-0.5 text-[10px] text-gray-400">
        {WORK_TIME_HOUR_LABELS.map((hour) => <span key={hour}>{hour}시</span>)}
      </div>
    </div>
  )
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-4">
        <h3 className="font-bold text-gray-900">{title}</h3>
        {description && <p className="mt-1 text-xs text-gray-500">{description}</p>}
      </div>
      {children}
    </section>
  )
}

// 포커스 시 플로팅 프리셋 목록을 띄워 한 번에 채우는 textarea
function PresetTextarea({
  label,
  value,
  onChange,
  presets,
  placeholder,
  rows = 3,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  presets: readonly string[]
  placeholder?: string
  rows?: number
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative block">
      <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
      <textarea
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      />
      {open && (
        <div
          role="listbox"
          aria-label={`${label} 프리셋`}
          className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg"
          // blur보다 먼저 클릭이 처리되도록 포커스 이탈을 막는다
          onMouseDown={(event) => event.preventDefault()}
        >
          <div className="border-b border-gray-100 bg-gray-50 px-3 py-1.5 text-[11px] font-medium text-gray-500">
            프리셋 선택 · 클릭하면 입력됩니다
          </div>
          <ul className="max-h-56 overflow-y-auto py-1">
            {presets.map((preset) => {
              const selected = value.trim() === preset
              return (
                <li key={preset} role="option" aria-selected={selected}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(preset)
                      setOpen(false)
                    }}
                    className={`w-full px-3 py-2.5 text-left text-sm leading-snug hover:bg-blue-50 ${selected ? 'bg-blue-50 font-medium text-blue-700' : 'text-gray-700'}`}
                  >
                    {preset}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

function nullableNumber(value: string) {
  if (value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

interface PeriodPreset {
  label: string
  days?: number
  months?: number
}

const PERIOD_PRESETS: PeriodPreset[] = [
  { label: '7일', days: 7 },
  { label: '15일', days: 15 },
  { label: '30일', days: 30 },
  { label: '분기', months: 3 },
  { label: '반기', months: 6 },
  { label: '1년', months: 12 },
]

function toDateString(date: Date) {
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

// 시작일을 포함한 기간이므로 종료일은 하루를 뺀다 (예: 7/1 시작 7일 → 7/7 종료)
function calcPeriodEnd(start: string, preset: PeriodPreset) {
  const [year, month, day] = start.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  if (preset.months) date.setMonth(date.getMonth() + preset.months)
  if (preset.days) date.setDate(date.getDate() + preset.days)
  date.setDate(date.getDate() - 1)
  return toDateString(date)
}

export default function WorkPlanForm({
  selectedTypes,
  formData,
  onChange,
  workers,
  scheduleCandidates,
  constructionPeriod,
  projectId,
  projectName,
}: WorkPlanFormProps) {
  const [tbmPickerType, setTbmPickerType] = useState<PlanType | null>(null)
  const [tbmLoading, setTbmLoading] = useState(false)
  const [tbmCandidates, setTbmCandidates] = useState<TbmCandidate[] | null>(null)

  const toggleTbmPicker = async (type: PlanType) => {
    if (tbmPickerType === type) {
      setTbmPickerType(null)
      return
    }
    if (!tbmCandidates) {
      setTbmLoading(true)
      try {
        setTbmCandidates(await fetchRecentTbm(projectId, projectName))
      } catch {
        alert('TBM 제출 내역을 불러오지 못했습니다.')
        return
      } finally {
        setTbmLoading(false)
      }
    }
    setTbmPickerType(type)
  }

  const updatePlan = (type: PlanType, values: Record<string, unknown>) => {
    const current = formData[type]
    if (!current) return
    onChange({ ...formData, [type]: { ...current, ...values } } as WorkPlanFormData)
  }

  const updateNested = (type: PlanType, group: string, values: Record<string, unknown>) => {
    const current = formData[type]
    if (!current) return
    const record = current as unknown as Record<string, unknown>
    const nested = (record[group] || {}) as Record<string, unknown>
    updatePlan(type, { [group]: { ...nested, ...values } })
  }

  const updatePerson = (type: PlanType, key: string, value: PersonContact) => updatePlan(type, { [key]: value })

  const selectPerson = (value: string, current: PersonContact, onSelect: (person: PersonContact) => void) => {
    const worker = workers.find((candidate) => candidate.name === value)
    onSelect({ ...current, name: value, phone: worker?.phone || current.phone })
  }

  const personInputClass = 'w-full min-w-0 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100'

  // 그룹 라벨 1개 아래 직급·성명·연락처를 한 줄로 배치해 세로 공간을 줄인 컴팩트 레이아웃
  const renderPerson = (label: string, person: PersonContact, onUpdate: (person: PersonContact) => void, position = false) => (
    <div className="min-w-0">
      <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
      <div className={`grid gap-2 ${position ? 'grid-cols-[0.7fr_1fr_1.2fr]' : 'grid-cols-[1fr_1.2fr]'}`}>
        {position && <input value={person.position ?? ''} onChange={(event) => onUpdate({ ...person, position: event.target.value })} placeholder="직급" aria-label={`${label} 직급`} className={personInputClass} />}
        <input value={person.name ?? ''} list="work-plan-workers" onChange={(event) => selectPerson(event.target.value, person, onUpdate)} placeholder="성명" aria-label={`${label} 성명`} className={personInputClass} />
        <input value={person.phone ?? ''} onChange={(event) => onUpdate({ ...person, phone: event.target.value })} placeholder="010-0000-0000" aria-label={`${label} 연락처`} className={personInputClass} />
      </div>
    </div>
  )

  const renderWorkerPicker = (type: 'loading' | 'construction' | 'heavy' | 'excavation', common: CommonWorkPlanFields) => (
    <div>
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-gray-600">
        <Users className="h-4 w-4" /> 작업자 선택
      </div>
      <div className="mb-3">
        <CommaSeparatedNamesField
          label="작업자 성명(쉼표로 구분)"
          names={common.workerNames}
          placeholder="등록 근로자를 선택하거나 성명을 직접 입력하세요."
          onChange={(workerNames) => updatePlan(type, { workerNames })}
        />
      </div>
      {workers.length === 0 ? (
        <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-500">등록된 근로자가 없습니다. 성명 입력란에는 수기로 입력할 수 있습니다.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {workers.map((worker) => {
            const selected = common.workerNames.includes(worker.name)
            return (
              <button
                key={worker.id}
                type="button"
                onClick={() => updatePlan(type, { workerNames: selected ? common.workerNames.filter((name) => name !== worker.name) : [...common.workerNames, worker.name] })}
                className={`rounded-full border px-3 py-1.5 text-sm ${selected ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                {worker.name}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )

  // 최근 TBM 제출 내역을 골라 onPick으로 값을 채우는 버튼+드롭다운
  const renderTbmPicker = (type: PlanType, onPick: (tbm: TbmCandidate) => void) => (
    <div className="relative">
      <button
        type="button"
        onClick={() => toggleTbmPicker(type)}
        disabled={tbmLoading}
        className="flex items-center gap-1 rounded border border-blue-300 bg-white px-2 py-1 text-xs text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {tbmLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <History className="h-3.5 w-3.5" />}
        최근 TBM에서 선택
      </button>
      {tbmPickerType === type && (
        <div className="absolute right-0 top-full z-20 mt-1 max-h-72 w-80 overflow-y-auto rounded-lg border border-gray-300 bg-white shadow-lg">
          {(tbmCandidates || []).length === 0 ? (
            <div className="p-4 text-center text-xs text-gray-400">제출된 TBM이 없습니다.</div>
          ) : (
            (tbmCandidates || []).map((tbm) => {
              const preview = (tbm.today_work || '').replace(/\s+/g, ' ').trim()
              return (
                <button
                  key={tbm.id}
                  type="button"
                  onClick={() => {
                    onPick(tbm)
                    setTbmPickerType(null)
                  }}
                  className="w-full border-b border-gray-100 px-3 py-2 text-left last:border-b-0 hover:bg-blue-50"
                >
                  <span className="whitespace-nowrap text-sm font-medium text-gray-800">{tbm.meeting_date}</span>
                  <span className="ml-2 text-xs text-gray-500">{preview.slice(0, 24)}{preview.length > 24 ? '…' : ''}</span>
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )

  const renderCommon = (type: 'loading' | 'construction' | 'heavy' | 'excavation') => {
    const current = formData[type]
    if (!current) return null
    return (
      <Section title="공통 기본정보" description="프로젝트·나라장터 계약정보·근로자 관리대장에서 자동으로 불러온 값입니다. 필요한 부분만 확인해 수정해주세요.">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label="작업명(장소)" value={current.title} onChange={(value) => updatePlan(type, { title: value })} /></div>
          <Field label="작업 시작일" type="date" value={current.workStartDate} onChange={(value) => updatePlan(type, { workStartDate: value })} />
          <Field label="작업 종료일" type="date" value={current.workEndDate} onChange={(value) => updatePlan(type, { workEndDate: value })} />
          <div className="-mt-1 flex flex-wrap items-center gap-1.5 sm:col-span-2">
            <span className="text-xs text-gray-500">기간 설정</span>
            {PERIOD_PRESETS.map((preset) => {
              const selected = Boolean(current.workStartDate) && current.workEndDate === calcPeriodEnd(current.workStartDate, preset)
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    const start = current.workStartDate || toDateString(new Date())
                    updatePlan(type, { workStartDate: start, workEndDate: calcPeriodEnd(start, preset) })
                  }}
                  className={`rounded-full border px-2.5 py-1 text-xs ${selected ? 'border-blue-600 bg-blue-50 font-medium text-blue-700' : 'border-gray-300 bg-white text-gray-600 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700'}`}
                >
                  {preset.label}
                </button>
              )
            })}
          </div>
          <div className="sm:col-span-2"><Field label="작업업체" value={current.companyName} onChange={(value) => updatePlan(type, { companyName: value })} /></div>
        </div>
        {(constructionPeriod.start || constructionPeriod.end) && <p className="mt-2 flex items-center gap-1 text-xs text-blue-700"><CalendarRange className="h-3.5 w-3.5" />공사기간 {constructionPeriod.start || '-'} ~ {constructionPeriod.end || '-'}</p>}
        <div className="my-4 border-t border-gray-100" />
        {renderWorkerPicker(type, current)}
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {renderPerson('작업지휘자', current.workDirector, (value) => updatePerson(type, 'workDirector', value))}
          {renderPerson('운전원', current.operator, (value) => updatePerson(type, 'operator', value))}
          {renderPerson('유도자', current.guide, (value) => updatePerson(type, 'guide', value))}
        </div>
        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium text-gray-600">작업내용 공유</span>
            {renderTbmPicker(type, (tbm) => updatePlan(type, { sharedWorkContent: tbm.today_work || '' }))}
          </div>
          <textarea value={current.sharedWorkContent} onChange={(event) => updatePlan(type, { sharedWorkContent: event.target.value })} rows={3} placeholder={scheduleCandidates.length ? `공정표 후보. ${scheduleCandidates.join(', ')}` : '작업내용과 근로자 공유사항을 입력하세요.'} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
        </div>
      </Section>
    )
  }

  const renderLoading = () => {
    const current = formData.loading
    if (!current) return null
    return <>
      {renderCommon('loading')}
      <Section title="차량 작업정보">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="차량 번호" value={current.vehicleNumber} onChange={(value) => updatePlan('loading', { vehicleNumber: value })} />
          <div className="sm:col-span-2"><WorkTimeRangeBar value={current.workTime} onChange={(value) => updatePlan('loading', { workTime: value })} /></div>
        </div>
      </Section>
    </>
  }

  const renderConstruction = () => {
    const current = formData.construction
    if (!current) return null
    return <>
      {renderCommon('construction')}
      <Section title="건설기계 작업정보">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <Field label="유도자 신호방법" value={current.guideSignalMethod} placeholder="수신호 / 무전기 / 기타" onChange={(value) => updatePlan('construction', { guideSignalMethod: value })} />
            {renderQuickFill(GUIDE_SIGNAL_METHODS, current.guideSignalMethod, (next) => updatePlan('construction', { guideSignalMethod: next }))}
          </div>
          <Field label="작업방법" value={current.workMethod} list="work-plan-schedules" onChange={(value) => updatePlan('construction', { workMethod: value })} />
          <label className="block"><span className="mb-1 block text-xs font-medium text-gray-600">사전조사 작업유형</span><select value={current.surveyType} onChange={(event) => updatePlan('construction', { surveyType: event.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"><option value="constructionMachine">건설기계 사용</option><option value="excavation">굴착작업</option><option value="tunnel">터널굴착작업</option><option value="demolition">해체작업</option></select></label>
        </div>
        <label className="mt-3 block"><span className="mb-1 block text-xs font-medium text-gray-600">작업순서</span><textarea rows={4} value={current.workSequence.join('\n')} onChange={(event) => updatePlan('construction', { workSequence: event.target.value.split('\n') })} placeholder="장비 현장 투입&#10;단거리 이동&#10;작업 실시" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" /></label>
      </Section>
    </>
  }

  // 선택한 TBM으로 전기 작업내용·작업책임자(제출자)·교육장소·교육자를 채운다
  const applyElectricTbm = (tbm: TbmCandidate) => {
    const current = formData.electric
    if (!current) return
    const place = [tbm.address, tbm.detail_address].filter(Boolean).join(' ')
    updatePlan('electric', {
      purposeAndContent: tbm.today_work || current.purposeAndContent,
      workLeader: {
        ...current.workLeader,
        name: tbm.reporter_name || current.workLeader.name,
        phone: tbm.reporter_contact || current.workLeader.phone,
      },
      education: {
        ...current.education,
        place: place || current.education.place,
        instructor: tbm.reporter_name || current.education.instructor,
      },
    })
  }

  const renderElectric = () => {
    const current = formData.electric
    if (!current) return null
    return <>
      <Section title="전기 작업 기본정보" description="발주처와 담당자는 프로젝트 감독정보에서 자동 인입했습니다.">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label="작업명(장소)" value={current.title} onChange={(value) => updatePlan('electric', { title: value })} /></div>
          <Field label="작업일자" type="date" value={current.workDate} onChange={(value) => updatePlan('electric', { workDate: value })} />
          <Field label="발주처" value={current.clientName} onChange={(value) => updatePlan('electric', { clientName: value })} />
          <div className="sm:col-span-2">{renderPerson('담당자', current.manager, (value) => updatePerson('electric', 'manager', value), true)}</div>
          <Field label="공사(용역)업체" value={current.companyName} onChange={(value) => updatePlan('electric', { companyName: value })} />
          <div className="flex items-center justify-between gap-2 sm:col-span-2">
            <p className="text-[11px] text-gray-400">TBM을 선택하면 작업내용과 작업책임자(제출자), 아래 교육장소·교육자가 함께 채워집니다.</p>
            {renderTbmPicker('electric', applyElectricTbm)}
          </div>
          <div className="sm:col-span-2">{renderPerson('작업책임자', current.workLeader, (value) => updatePerson('electric', 'workLeader', value), true)}</div>
        </div>
        <label className="mt-3 block"><span className="mb-1 block text-xs font-medium text-gray-600">작업목적 및 내용</span><textarea rows={3} value={current.purposeAndContent} onChange={(event) => updatePlan('electric', { purposeAndContent: event.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" /></label>
        <div className="mt-3"><Field label="공사범위" value={current.workScope} list="work-plan-schedules" onChange={(value) => updatePlan('electric', { workScope: value })} /></div>
      </Section>
      <Section title="작업자·안전보건교육">
        <div className="mb-3">
          <CommaSeparatedNamesField
            label="작업자 성명(쉼표로 구분)"
            names={current.workers.map((worker) => worker.name)}
            placeholder="등록 근로자를 선택하거나 성명을 직접 입력하세요."
            onChange={(names) => {
              updatePlan('electric', {
                workers: names.map((name) => current.workers.find((worker) => worker.name === name) || { name, qualification: '', employmentType: '상근' }),
              })
            }}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {workers.map((worker) => {
            const selected = current.workers.some((item) => item.name === worker.name)
            return <button key={worker.id} type="button" onClick={() => updatePlan('electric', { workers: selected ? current.workers.filter((item) => item.name !== worker.name) : [...current.workers, { name: worker.name, qualification: '', employmentType: '상근' }] })} className={`rounded-full border px-3 py-1.5 text-sm ${selected ? 'border-violet-600 bg-violet-50 text-violet-700' : 'border-gray-300 text-gray-600'}`}>{worker.name}</button>
          })}
          {workers.length === 0 && <p className="text-sm text-gray-500">등록된 근로자가 없습니다.</p>}
        </div>
        {current.workers.length > 0 && (
          <div className="mt-4 space-y-2">
            {current.workers.map((worker, index) => (
              <label key={`${worker.name}-${index}`} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2">
                <span className="min-w-0 truncate text-sm font-medium text-gray-700">{worker.name}</span>
                <span className="flex items-center gap-2 text-xs text-gray-500">
                  근로형태
                  <select
                    value={worker.employmentType}
                    onChange={(event) => updatePlan('electric', {
                      workers: current.workers.map((item, workerIndex) => workerIndex === index
                        ? { ...item, employmentType: event.target.value as typeof item.employmentType }
                        : item),
                    })}
                    className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-700"
                  >
                    <option value="상근">상근</option>
                    <option value="일용">일용</option>
                  </select>
                </span>
              </label>
            ))}
          </div>
        )}
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="교육일자" type="date" value={current.education.date} onChange={(value) => updateNested('electric', 'education', { date: value })} />
          <Field label="교육장소" value={current.education.place} onChange={(value) => updateNested('electric', 'education', { place: value })} />
          <Field label="교육자" value={current.education.instructor} list="work-plan-workers" onChange={(value) => updateNested('electric', 'education', { instructor: value })} />
          <Field label="교육인원" type="number" value={current.education.attendeeCount} onChange={(value) => updateNested('electric', 'education', { attendeeCount: nullableNumber(value) })} />
          <div className="sm:col-span-2"><Field label="교육내용" value={current.education.content} onChange={(value) => updateNested('electric', 'education', { content: value })} /></div>
        </div>
      </Section>
    </>
  }

  // 입력값을 쉼표 구분 목록으로 보고 선택 항목을 넣고 빼는 퀵 입력 버튼 행
  const renderQuickFill = (options: readonly string[], value: string, onSelect: (next: string) => void) => {
    const parts = value.split(',').map((part) => part.trim()).filter(Boolean)
    return (
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {options.map((option) => {
          const selected = parts.includes(option)
          return (
            <button
              key={option}
              type="button"
              onClick={() => onSelect((selected ? parts.filter((part) => part !== option) : [...parts, option]).join(', '))}
              className={`rounded-full border px-2.5 py-1 text-xs ${selected ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              {option}
            </button>
          )
        })}
      </div>
    )
  }

  const renderHeavy = () => {
    const current = formData.heavy
    if (!current) return null
    return <>
      {renderCommon('heavy')}
      <Section title="중량물 정보">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="중량물 품명" value={current.load.itemName} onChange={(value) => updateNested('heavy', 'load', { itemName: value })} />
          <div className="min-w-0">
            <Field label="형상" value={current.load.shape} placeholder="박스형 / 봉형 / 묶음형" onChange={(value) => updateNested('heavy', 'load', { shape: value })} />
            {renderQuickFill(HEAVY_LOAD_SHAPE_EXAMPLES, current.load.shape, (next) => updateNested('heavy', 'load', { shape: next }))}
          </div>
          <div className="min-w-0">
            <Field label="고정방법" value={current.load.fixingMethod} placeholder="체인 / 와이어로프 / 샤클" onChange={(value) => updateNested('heavy', 'load', { fixingMethod: value })} />
            {renderQuickFill(HEAVY_FIXING_METHODS, current.load.fixingMethod, (next) => updateNested('heavy', 'load', { fixingMethod: next }))}
          </div>
        </div>
      </Section>
    </>
  }

  const renderExcavation = () => {
    const current = formData.excavation
    if (!current) return null

    const updateUtility = (index: number, patch: Partial<(typeof current.utilities)[number]>) =>
      updatePlan('excavation', {
        utilities: current.utilities.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row),
      })

    return (
      <>
        {renderCommon('excavation')}
        <Section title="굴착공사 개요">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="현장 전화번호" value={current.overview.sitePhone} onChange={(value) => updateNested('excavation', 'overview', { sitePhone: value })} />
            <Field label="공사규모" value={current.overview.siteScale} onChange={(value) => updateNested('excavation', 'overview', { siteScale: value })} />
            <Field label="협력업체명" value={current.overview.partnerCompany} onChange={(value) => updateNested('excavation', 'overview', { partnerCompany: value })} />
            <Field label="업체 전화번호" value={current.overview.partnerPhone} onChange={(value) => updateNested('excavation', 'overview', { partnerPhone: value })} />
            <div className="sm:col-span-2">
              {renderPerson('작업담당자', current.overview.partnerManager, (value) => updateNested('excavation', 'overview', { partnerManager: value }))}
            </div>
            <Field label="굴착 깊이" value={current.overview.depth} placeholder="예: GL(-)4.5m" onChange={(value) => updateNested('excavation', 'overview', { depth: value })} />
            <Field label="굴착면적" value={current.overview.area} placeholder="예: 500㎡" onChange={(value) => updateNested('excavation', 'overview', { area: value })} />
            <Field label="터파기 물량" value={current.overview.volume} placeholder="예: 2,000㎥" onChange={(value) => updateNested('excavation', 'overview', { volume: value })} />
            <div className="min-w-0">
              <Field label="굴착방법" value={current.overview.method} placeholder="예: 개착식 굴착(기계식)" onChange={(value) => updateNested('excavation', 'overview', { method: value })} />
              {renderQuickFill(EXCAVATION_METHOD_PRESETS, current.overview.method, (next) => updateNested('excavation', 'overview', { method: next }))}
            </div>
            <div className="sm:col-span-2">
              <Field label="사용기계 및 장비" value={current.overview.equipmentSummary} placeholder="예: 굴착기, 덤프트럭" onChange={(value) => updateNested('excavation', 'overview', { equipmentSummary: value })} />
              {renderQuickFill(EXCAVATION_EQUIPMENT_PRESETS, current.overview.equipmentSummary, (next) => updateNested('excavation', 'overview', { equipmentSummary: next }))}
            </div>
          </div>
        </Section>

        <Section title="지하매설물 조사" description="도면·탐지기·관계기관 확인 결과를 매설물별로 기록해주세요.">
          <div className="space-y-3">
            {current.utilities.map((row, index) => (
              <div key={`utility-${index}`} className="rounded-lg border border-gray-200 p-3">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="종류" value={row.kind} onChange={(value) => updateUtility(index, { kind: value })} />
                  <Field label="확인결과/위치" value={row.finding} onChange={(value) => updateUtility(index, { finding: value })} />
                  <Field label="조치 여부" value={row.action} onChange={(value) => updateUtility(index, { action: value })} />
                  <Field label="담당기관/연락처" value={row.agency} onChange={(value) => updateUtility(index, { agency: value })} />
                </div>
                <div className="mt-2 flex justify-end gap-2">
                  <button type="button" onClick={() => updateUtility(index, { finding: '해당없음', action: '해당없음' })} className="rounded-full border border-gray-300 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50">해당없음</button>
                  <button type="button" onClick={() => updatePlan('excavation', { utilities: current.utilities.filter((_, rowIndex) => rowIndex !== index) })} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50" aria-label={`${row.kind || index + 1} 매설물 행 삭제`}>
                    <Trash2 className="h-3.5 w-3.5" /> 삭제
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => updatePlan('excavation', { utilities: [...current.utilities, { kind: '', finding: '', action: '', agency: '' }] })} className="mt-3 inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700">
            <Plus className="h-3.5 w-3.5" /> 매설물 행 추가
          </button>
        </Section>

        <Section title="배수·조건부 공정">
          <PresetTextarea
            label="배수방법"
            value={current.drainagePlan}
            onChange={(value) => updatePlan('excavation', { drainagePlan: value })}
            presets={EXCAVATION_DRAINAGE_PRESETS}
            placeholder="예: 집수정 설치 후 양수기 2대로 우수관 배수"
          />

          <div className="mt-4 space-y-3">
            <div className="rounded-lg border border-gray-200 p-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-gray-700">
                <input type="checkbox" checked={current.blasting.applied} onChange={(event) => updateNested('excavation', 'blasting', { applied: event.target.checked })} className="h-4 w-4 rounded border-gray-300" />
                발파 작업 있음
              </label>
              {current.blasting.applied && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field label="발파공법" value={current.blasting.method} onChange={(value) => updateNested('excavation', 'blasting', { method: value })} />
                  <Field label="발파구역" value={current.blasting.area} onChange={(value) => updateNested('excavation', 'blasting', { area: value })} />
                  <Field label="발파량" value={current.blasting.amount} onChange={(value) => updateNested('excavation', 'blasting', { amount: value })} />
                  <Field label="화약관리자" value={current.blasting.managerName} onChange={(value) => updateNested('excavation', 'blasting', { managerName: value })} />
                  <div className="sm:col-span-2"><Field label="경보·통제방법" value={current.blasting.controlMeasure} onChange={(value) => updateNested('excavation', 'blasting', { controlMeasure: value })} /></div>
                </div>
              )}
            </div>

            <div className="rounded-lg border border-gray-200 p-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-gray-700">
                <input type="checkbox" checked={current.shoring.applied} onChange={(event) => updateNested('excavation', 'shoring', { applied: event.target.checked })} className="h-4 w-4 rounded border-gray-300" />
                흙막이 가시설 있음
              </label>
              {current.shoring.applied && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field label="흙막이공법" value={current.shoring.wallMethod} placeholder="예: H-Pile + 토류판" onChange={(value) => updateNested('excavation', 'shoring', { wallMethod: value })} />
                  <Field label="흙막이 수량" value={current.shoring.wallQuantity} onChange={(value) => updateNested('excavation', 'shoring', { wallQuantity: value })} />
                  <Field label="지보공법" value={current.shoring.supportMethod} placeholder="예: 어스앙카" onChange={(value) => updateNested('excavation', 'shoring', { supportMethod: value })} />
                  <Field label="지보공 수량" value={current.shoring.supportQuantity} onChange={(value) => updateNested('excavation', 'shoring', { supportQuantity: value })} />
                </div>
              )}
            </div>

            <div className="rounded-lg border border-gray-200 p-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-gray-700">
                <input type="checkbox" checked={current.instrumentation.applied} onChange={(event) => updateNested('excavation', 'instrumentation', { applied: event.target.checked })} className="h-4 w-4 rounded border-gray-300" />
                지반 계측 있음
              </label>
              {current.instrumentation.applied && <p className="mt-2 text-xs text-blue-700">계측기 상세는 5단계(나중 확인 정보)에서 입력합니다.</p>}
            </div>
          </div>
        </Section>
      </>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900">기본정보를 확인해주세요.</h2>
        <p className="mt-1 text-sm text-gray-500">자동 인입된 값과 현장에서 확인 가능한 정보를 검토한 뒤 다음 단계로 이동하세요.</p>
      </div>
      <datalist id="work-plan-workers">{workers.map((worker) => <option key={worker.id} value={worker.name}>{worker.phone || ''}</option>)}</datalist>
      <datalist id="work-plan-schedules">{scheduleCandidates.map((name) => <option key={name} value={name} />)}</datalist>
      {selectedTypes.map((type) => (
        <div key={type} className="space-y-4 rounded-xl border-2 border-blue-100 bg-blue-50/40 p-3 sm:p-4">
          <div className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white">{TYPE_LABELS[type]}</div>
          {type === 'loading' && renderLoading()}
          {type === 'construction' && renderConstruction()}
          {type === 'electric' && renderElectric()}
          {type === 'heavy' && renderHeavy()}
          {type === 'excavation' && renderExcavation()}
        </div>
      ))}
    </div>
  )
}
