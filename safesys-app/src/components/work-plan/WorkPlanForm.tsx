'use client'

// 프로젝트·근로자·공정표 값을 자동 인입해 작업계획서 기본정보와 종류별 핵심 제원을 입력하는 폼

import type { ReactNode } from 'react'
import { AlertTriangle, Calculator, CalendarRange, Users } from 'lucide-react'
import type {
  CommonWorkPlanFields,
  LiftingCapacityReview,
  PersonContact,
  PlanType,
  RiggingCapacityReview,
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

const TENSION_FACTORS: Record<number, number> = { 0: 1, 30: 1.04, 60: 1.16, 90: 1.41, 120: 2 }

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

function ratio(total: number | null, capacity: number | null) {
  if (!total || !capacity || capacity <= 0) return null
  return Math.round((total / capacity) * 1000) / 10
}

function nullableNumber(value: string) {
  if (value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
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

  const updateLifting = (type: 'loading' | 'heavy', patch: Partial<LiftingCapacityReview>) => {
    const current = formData[type]
    if (!current) return
    const lifting = { ...current.liftingReview, ...patch }
    lifting.safetyRatioPercent = ratio(lifting.totalLoadTon, lifting.maxCapacityTon)
    const rigging = { ...current.riggingReview }
    rigging.safetyRatioPercent = ratio(lifting.totalLoadTon, rigging.safeLoadTon)
    updatePlan(type, { liftingReview: lifting, riggingReview: rigging })
  }

  const updateRigging = (type: 'loading' | 'heavy', patch: Partial<RiggingCapacityReview>) => {
    const current = formData[type]
    if (!current) return
    const rigging = { ...current.riggingReview, ...patch }
    const count = Number(rigging.slingMethod.slice(0, 1)) || 1
    const breaking = rigging.breakingLoadTon || 0
    const safety = rigging.safetyFactor || 0
    const tension = rigging.tensionFactor || 0
    rigging.safeLoadTon = breaking > 0 && safety > 0 && tension > 0
      ? Math.round((breaking * count / (safety * tension)) * 1000) / 1000
      : null
    rigging.safetyRatioPercent = ratio(current.liftingReview.totalLoadTon, rigging.safeLoadTon)
    updatePlan(type, { riggingReview: rigging })
  }

  const renderSafetyResult = (label: string, percent: number | null) => {
    const unsafe = percent !== null && percent > 100
    return (
      <div className={`rounded-lg border px-4 py-3 ${unsafe ? 'border-red-300 bg-red-50' : 'border-emerald-200 bg-emerald-50'}`}>
        <div className="flex items-center justify-between gap-3">
          <span className={`text-sm font-semibold ${unsafe ? 'text-red-800' : 'text-emerald-800'}`}>{label}</span>
          <span className={`text-lg font-bold ${unsafe ? 'text-red-700' : 'text-emerald-700'}`}>{percent === null ? '-' : `${percent.toFixed(1)}%`}</span>
        </div>
        {unsafe && <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-red-700"><AlertTriangle className="h-3.5 w-3.5" />안전율 100% 초과로 사용이 불가합니다.</p>}
      </div>
    )
  }

  const renderLiftingReview = (type: 'loading' | 'heavy') => {
    const current = formData[type]
    if (!current) return null
    const lifting = current.liftingReview
    const rigging = current.riggingReview
    return (
      <Section title="인양·줄걸이 안전율 검토" description="입력 즉시 양중능력과 줄걸이 안전하중을 계산하며, 100%를 넘으면 사용 불가로 표시합니다.">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700"><Calculator className="h-4 w-4 text-blue-600" />건설기계 인양능력</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="중량물 총 하중" type="number" suffix="ton" value={lifting.totalLoadTon} onChange={(value) => updateLifting(type, { totalLoadTon: nullableNumber(value) })} />
          <Field label="최대 양중능력" type="number" suffix="ton" value={lifting.maxCapacityTon} onChange={(value) => updateLifting(type, { maxCapacityTon: nullableNumber(value) })} />
        </div>
        <div className="mt-3">{renderSafetyResult('건설기계 안전율', lifting.safetyRatioPercent)}</div>

        <div className="my-5 border-t border-gray-200" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">줄걸이 방법</span>
            <select value={rigging.slingMethod} onChange={(event) => updateRigging(type, { slingMethod: event.target.value as RiggingCapacityReview['slingMethod'] })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="">선택</option><option>1줄걸이</option><option>2줄걸이</option><option>3줄걸이</option><option>4줄걸이</option>
            </select>
          </label>
          <Field label="줄걸이 절단하중" type="number" suffix="ton" value={rigging.breakingLoadTon} onChange={(value) => updateRigging(type, { breakingLoadTon: nullableNumber(value) })} />
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">안전계수</span>
            <select value={rigging.safetyFactor ?? ''} onChange={(event) => updateRigging(type, { safetyFactor: nullableNumber(event.target.value) })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="5">줄걸이 작업 5</option><option value="7">섬유로프 7</option><option value="10">근로자 탑승 10</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">줄걸이 각도·장력계수</span>
            <select value={rigging.slingAngleDegree} onChange={(event) => { const angle = Number(event.target.value) as RiggingCapacityReview['slingAngleDegree']; updateRigging(type, { slingAngleDegree: angle, tensionFactor: TENSION_FACTORS[angle] }) }} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              {Object.entries(TENSION_FACTORS).map(([angle, factor]) => <option key={angle} value={angle}>{angle}° / {factor}</option>)}
            </select>
          </label>
          <Field label="계산된 줄걸이 안전하중" type="number" suffix="ton" value={rigging.safeLoadTon} onChange={() => undefined} />
        </div>
        <p className="mt-2 text-xs text-gray-500">줄걸이 안전하중 = 절단하중 × 줄걸이 수 ÷ (안전계수 × 장력계수)</p>
        <div className="mt-3">{renderSafetyResult('줄걸이 안전율', rigging.safetyRatioPercent)}</div>
      </Section>
    )
  }

  const renderCommon = (type: 'loading' | 'construction' | 'heavy') => {
    const current = formData[type]
    if (!current) return null
    return (
      <Section title="공통 기본정보" description="프로젝트·나라장터 계약정보·근로자 관리대장에서 자동으로 불러온 값입니다. 필요한 부분만 확인해 수정해주세요.">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label="작업명(장소)" value={current.title} onChange={(value) => updatePlan(type, { title: value })} /></div>
          <Field label="작업 시작일" type="date" value={current.workStartDate} onChange={(value) => updatePlan(type, { workStartDate: value })} />
          <Field label="작업 종료일" type="date" value={current.workEndDate} onChange={(value) => updatePlan(type, { workEndDate: value })} />
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
      <Section title="차량·장비 제원">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="차량 번호" value={current.vehicleNumber} onChange={(value) => updatePlan('loading', { vehicleNumber: value })} />
          <Field label="작업시간" type="time" value={current.workTime} onChange={(value) => updatePlan('loading', { workTime: value })} />
          <Field label="장비명" value={current.equipment.equipmentName} onChange={(value) => updateNested('loading', 'equipment', { equipmentName: value })} />
          <Field label="차량/장비번호" value={current.equipment.registrationNumber} onChange={(value) => updateNested('loading', 'equipment', { registrationNumber: value })} />
          <Field label="모델명/생산년도" value={current.equipment.modelAndYear} onChange={(value) => updateNested('loading', 'equipment', { modelAndYear: value })} />
          <Field label="보험기간" value={current.equipment.insurancePeriod} onChange={(value) => updateNested('loading', 'equipment', { insurancePeriod: value })} />
          <Field label="소유회사명" value={current.equipment.ownerCompany} onChange={(value) => updateNested('loading', 'equipment', { ownerCompany: value })} />
          <Field label="검사유효기간" value={current.equipment.inspectionValidity} onChange={(value) => updateNested('loading', 'equipment', { inspectionValidity: value })} />
          <Field label="차체중량" value={current.equipment.bodyWeightTon} suffix="ton" onChange={(value) => updateNested('loading', 'equipment', { bodyWeightTon: value })} />
          <Field label="장비폭" value={current.equipment.widthM} suffix="m" onChange={(value) => updateNested('loading', 'equipment', { widthM: value })} />
          <Field label="최소선회반경" value={current.equipment.minimumTurningRadiusM} suffix="m" onChange={(value) => updateNested('loading', 'equipment', { minimumTurningRadiusM: value })} />
          <Field label="작업반경" value={current.equipment.workingRadiusM} suffix="m" onChange={(value) => updateNested('loading', 'equipment', { workingRadiusM: value })} />
        </div>
      </Section>
      {renderLiftingReview('loading')}
    </>
  }

  const renderConstruction = () => {
    const current = formData.construction
    if (!current) return null
    return <>
      {renderCommon('construction')}
      <Section title="건설기계 작업정보">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="운전원 면허" value={current.operatorLicense} onChange={(value) => updatePlan('construction', { operatorLicense: value })} />
          <Field label="유도자 신호방법" value={current.guideSignalMethod} placeholder="수신호 / 무전기 / 기타" onChange={(value) => updatePlan('construction', { guideSignalMethod: value })} />
          <Field label="작업방법" value={current.workMethod} list="work-plan-schedules" onChange={(value) => updatePlan('construction', { workMethod: value })} />
          <label className="block"><span className="mb-1 block text-xs font-medium text-gray-600">사전조사 작업유형</span><select value={current.surveyType} onChange={(event) => updatePlan('construction', { surveyType: event.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"><option value="constructionMachine">건설기계 사용</option><option value="excavation">굴착작업</option><option value="tunnel">터널굴착작업</option><option value="demolition">해체작업</option></select></label>
          <Field label="장비명" value={current.equipment.equipmentName} onChange={(value) => updateNested('construction', 'equipment', { equipmentName: value })} />
          <Field label="등록번호" value={current.equipment.registrationNumber} onChange={(value) => updateNested('construction', 'equipment', { registrationNumber: value })} />
          <Field label="차체중량" value={current.equipment.bodyWeight} onChange={(value) => updateNested('construction', 'equipment', { bodyWeight: value })} />
          <Field label="능력" value={current.equipment.capacity} onChange={(value) => updateNested('construction', 'equipment', { capacity: value })} />
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
      <Section title="중량물·기계 제원">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="중량물 품명" value={current.load.itemName} onChange={(value) => updateNested('heavy', 'load', { itemName: value })} />
          <Field label="형상" value={current.load.shape} placeholder="박스형 / 봉형 / 묶음형" onChange={(value) => updateNested('heavy', 'load', { shape: value })} />
          <Field label="규격" value={current.load.dimensions} placeholder="너비 × 길이 × 높이" onChange={(value) => updateNested('heavy', 'load', { dimensions: value })} />
          <Field label="중량" value={current.load.weightKg} suffix="kg" onChange={(value) => updateNested('heavy', 'load', { weightKg: value })} />
          <Field label="1회 운반중량" value={current.load.transportWeightKg} suffix="kg" onChange={(value) => updateNested('heavy', 'load', { transportWeightKg: value })} />
          <Field label="고정방법" value={current.load.fixingMethod} placeholder="체인 / 와이어로프 / 샤클" onChange={(value) => updateNested('heavy', 'load', { fixingMethod: value })} />
          <Field label="기계명" value={current.machine.machineName} onChange={(value) => updateNested('heavy', 'machine', { machineName: value })} />
          <Field label="형식번호" value={current.machine.modelNumber} onChange={(value) => updateNested('heavy', 'machine', { modelNumber: value })} />
          <Field label="거더형식" value={current.machine.girderType} onChange={(value) => updateNested('heavy', 'machine', { girderType: value })} />
          <Field label="기계규격" value={current.machine.machineSpecification} onChange={(value) => updateNested('heavy', 'machine', { machineSpecification: value })} />
          <Field label="정격하중" value={current.machine.ratedLoad} onChange={(value) => updateNested('heavy', 'machine', { ratedLoad: value })} />
          <Field label="조작방식" value={current.machine.controlMethod} onChange={(value) => updateNested('heavy', 'machine', { controlMethod: value })} />
          <Field label="검사여부" value={current.machine.inspectionResult} onChange={(value) => updateNested('heavy', 'machine', { inspectionResult: value })} />
          <Field label="유효기간" value={current.machine.validityPeriod} onChange={(value) => updateNested('heavy', 'machine', { validityPeriod: value })} />
        </div>
      </Section>
      {renderLiftingReview('heavy')}
    </>
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900">기본정보를 확인해주세요.</h2>
        <p className="mt-1 text-sm text-gray-500">자동 인입된 값과 종류별 핵심 제원을 확인한 뒤 다음 단계로 이동하세요.</p>
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
