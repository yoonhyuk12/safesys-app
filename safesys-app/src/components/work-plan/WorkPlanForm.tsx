'use client'

// 프로젝트·근로자·공정표 값을 자동 인입해 작업계획서 기본정보와 현장 즉시 정보를 입력하는 폼

import type { ReactNode } from 'react'
import { CalendarRange, Users } from 'lucide-react'
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
}: WorkPlanFormProps) {
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

  const renderPerson = (label: string, person: PersonContact, onUpdate: (person: PersonContact) => void, position = false) => (
    <div className={`grid gap-3 ${position ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
      {position && <Field label={`${label} 직급`} value={person.position} onChange={(value) => onUpdate({ ...person, position: value })} />}
      <Field label={`${label} 성명`} value={person.name} list="work-plan-workers" onChange={(value) => selectPerson(value, person, onUpdate)} />
      <Field label={`${label} 연락처`} value={person.phone} placeholder="010-0000-0000" onChange={(value) => onUpdate({ ...person, phone: value })} />
    </div>
  )

  const renderWorkerPicker = (type: 'loading' | 'construction' | 'heavy', common: CommonWorkPlanFields) => (
    <div>
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-gray-600">
        <Users className="h-4 w-4" /> 작업자 선택
      </div>
      <div className="mb-3">
        <Field
          label="작업자 성명(쉼표로 구분)"
          value={common.workerNames.join(', ')}
          placeholder="등록 근로자를 선택하거나 성명을 직접 입력하세요."
          onChange={(value) => updatePlan(type, { workerNames: value.split(',').map((name) => name.trim()).filter(Boolean) })}
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

  const renderCommon = (type: 'loading' | 'construction' | 'heavy') => {
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
            {PERIOD_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  const start = current.workStartDate || toDateString(new Date())
                  updatePlan(type, { workStartDate: start, workEndDate: calcPeriodEnd(start, preset) })
                }}
                className="rounded-full border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-600 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700"
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="sm:col-span-2"><Field label="작업업체" value={current.companyName} onChange={(value) => updatePlan(type, { companyName: value })} /></div>
        </div>
        {(constructionPeriod.start || constructionPeriod.end) && <p className="mt-2 flex items-center gap-1 text-xs text-blue-700"><CalendarRange className="h-3.5 w-3.5" />공사기간 {constructionPeriod.start || '-'} ~ {constructionPeriod.end || '-'}</p>}
        <div className="my-4 border-t border-gray-100" />
        {renderWorkerPicker(type, current)}
        <div className="mt-4 space-y-3">
          {renderPerson('작업지휘자', current.workDirector, (value) => updatePerson(type, 'workDirector', value))}
          {renderPerson('운전원', current.operator, (value) => updatePerson(type, 'operator', value))}
          {renderPerson('유도자', current.guide, (value) => updatePerson(type, 'guide', value))}
        </div>
        <label className="mt-4 block">
          <span className="mb-1 block text-xs font-medium text-gray-600">작업내용 공유</span>
          <textarea value={current.sharedWorkContent} onChange={(event) => updatePlan(type, { sharedWorkContent: event.target.value })} rows={3} placeholder={scheduleCandidates.length ? `공정표 후보. ${scheduleCandidates.join(', ')}` : '작업내용과 근로자 공유사항을 입력하세요.'} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
        </label>
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
          <Field label="작업시간" type="time" value={current.workTime} onChange={(value) => updatePlan('loading', { workTime: value })} />
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
          <Field label="유도자 신호방법" value={current.guideSignalMethod} placeholder="수신호 / 무전기 / 기타" onChange={(value) => updatePlan('construction', { guideSignalMethod: value })} />
          <Field label="작업방법" value={current.workMethod} list="work-plan-schedules" onChange={(value) => updatePlan('construction', { workMethod: value })} />
          <label className="block"><span className="mb-1 block text-xs font-medium text-gray-600">사전조사 작업유형</span><select value={current.surveyType} onChange={(event) => updatePlan('construction', { surveyType: event.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"><option value="constructionMachine">건설기계 사용</option><option value="excavation">굴착작업</option><option value="tunnel">터널굴착작업</option><option value="demolition">해체작업</option></select></label>
        </div>
        <label className="mt-3 block"><span className="mb-1 block text-xs font-medium text-gray-600">작업순서</span><textarea rows={4} value={current.workSequence.join('\n')} onChange={(event) => updatePlan('construction', { workSequence: event.target.value.split('\n') })} placeholder="장비 현장 투입&#10;단거리 이동&#10;작업 실시" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" /></label>
      </Section>
    </>
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
          <div className="sm:col-span-2">{renderPerson('작업책임자', current.workLeader, (value) => updatePerson('electric', 'workLeader', value), true)}</div>
        </div>
        <label className="mt-3 block"><span className="mb-1 block text-xs font-medium text-gray-600">작업목적 및 내용</span><textarea rows={3} value={current.purposeAndContent} onChange={(event) => updatePlan('electric', { purposeAndContent: event.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" /></label>
        <div className="mt-3"><Field label="공사범위" value={current.workScope} list="work-plan-schedules" onChange={(value) => updatePlan('electric', { workScope: value })} /></div>
      </Section>
      <Section title="작업자·안전보건교육">
        <div className="mb-3">
          <Field
            label="작업자 성명(쉼표로 구분)"
            value={current.workers.map((worker) => worker.name).join(', ')}
            placeholder="등록 근로자를 선택하거나 성명을 직접 입력하세요."
            onChange={(value) => {
              const names = value.split(',').map((name) => name.trim()).filter(Boolean)
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

  const renderHeavy = () => {
    const current = formData.heavy
    if (!current) return null
    return <>
      {renderCommon('heavy')}
      <Section title="중량물 정보">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="중량물 품명" value={current.load.itemName} onChange={(value) => updateNested('heavy', 'load', { itemName: value })} />
          <Field label="형상" value={current.load.shape} placeholder="박스형 / 봉형 / 묶음형" onChange={(value) => updateNested('heavy', 'load', { shape: value })} />
          <Field label="고정방법" value={current.load.fixingMethod} placeholder="체인 / 와이어로프 / 샤클" onChange={(value) => updateNested('heavy', 'load', { fixingMethod: value })} />
        </div>
      </Section>
    </>
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
        </div>
      ))}
    </div>
  )
}
