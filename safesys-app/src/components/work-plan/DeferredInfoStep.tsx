// 작업계획서에서 나중에 확인할 장비 제원과 안전율 정보를 입력하는 단계

'use client'

import type { ReactNode } from 'react'
import { AlertTriangle, Calculator } from 'lucide-react'
import EquipmentCatalogSelector from '@/components/work-plan/EquipmentCatalogSelector'
import {
  toConstructionEquipmentPatch,
  toHeavyMachinePatch,
  toLoadingEquipmentPatch,
  type EquipmentCatalogItem,
} from '@/lib/work-plan/equipment-catalog'
import { RIGGING_STANDARD_SPECS } from '@/lib/work-plan/rigging-catalog'
import type {
  LiftingCapacityReview,
  PlanType,
  RiggingCapacityReview,
  RiggingTool,
  WorkPlanFormData,
} from '@/lib/work-plan/types'

interface DeferredInfoStepProps {
  selectedTypes: PlanType[]
  formData: WorkPlanFormData
  onChange: (data: WorkPlanFormData) => void
}

interface FieldProps {
  label: string
  value: string | number | null | undefined
  onChange: (value: string) => void
  type?: 'text' | 'number'
  placeholder?: string
  suffix?: string
}

const TYPE_LABELS: Record<PlanType, string> = {
  loading: '붙임 2-1 차량계 하역운반기계',
  construction: '붙임 2-2 차량계 건설기계',
  electric: '붙임 2-3 전기 작업',
  heavy: '붙임 2-4 중량물 취급',
}

const RIGGING_TOOLS: RiggingTool[] = ['와이어로프', '섬유로프', '체인블럭', '기타']
const TENSION_FACTORS = { 0: 1, 30: 1.04, 60: 1.16, 90: 1.41, 120: 2 } as const

function Field({ label, value, onChange, type = 'text', placeholder, suffix }: FieldProps) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
      <span className="relative block">
        <input
          type={type}
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
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

function ratio(total: number | null, capacity: number | null) {
  if (total === null || capacity === null || capacity <= 0) return null
  return Math.round((total / capacity) * 1000) / 10
}

function SafetyResult({ label, percent }: { label: string; percent: number | null }) {
  const unsafe = percent !== null && percent > 100
  const pending = percent === null
  const tone = unsafe
    ? 'border-red-300 bg-red-50 text-red-800'
    : pending
      ? 'border-gray-200 bg-gray-50 text-gray-500'
      : 'border-emerald-200 bg-emerald-50 text-emerald-800'

  return (
    <div className={`rounded-lg border px-4 py-3 ${tone}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold">{label}</span>
        <span className="text-lg font-bold">{pending ? '미계산' : `${percent.toFixed(1)}%`}</span>
      </div>
      {unsafe && <p className="mt-1 flex items-center gap-1 text-xs font-semibold"><AlertTriangle className="h-3.5 w-3.5" />안전율 100% 초과로 사용이 불가합니다.</p>}
    </div>
  )
}

export default function DeferredInfoStep({ selectedTypes, formData, onChange }: DeferredInfoStepProps) {
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

  const updateLifting = (type: 'loading' | 'heavy', patch: Partial<LiftingCapacityReview>) => {
    const current = formData[type]
    if (!current) return
    const lifting = { ...current.liftingReview, ...patch }
    lifting.safetyRatioPercent = ratio(lifting.totalLoadTon, lifting.maxCapacityTon)
    const rigging = {
      ...current.riggingReview,
      safetyRatioPercent: ratio(lifting.totalLoadTon, current.riggingReview.safeLoadTon),
    }
    updatePlan(type, { liftingReview: lifting, riggingReview: rigging })
  }

  const updateRigging = (type: 'loading' | 'heavy', patch: Partial<RiggingCapacityReview>) => {
    const current = formData[type]
    if (!current) return
    const rigging = { ...current.riggingReview, ...patch }
    const slingCount = rigging.slingMethod ? Number(rigging.slingMethod.slice(0, 1)) : null
    if (
      slingCount !== null
      && rigging.breakingLoadTon !== null
      && rigging.breakingLoadTon > 0
      && rigging.safetyFactor !== null
      && rigging.safetyFactor > 0
      && rigging.tensionFactor !== null
      && rigging.tensionFactor > 0
    ) {
      rigging.safeLoadTon = Math.round((rigging.breakingLoadTon * slingCount / (rigging.safetyFactor * rigging.tensionFactor)) * 1000) / 1000
    } else {
      rigging.safeLoadTon = null
    }
    rigging.safetyRatioPercent = ratio(current.liftingReview.totalLoadTon, rigging.safeLoadTon)
    updatePlan(type, { riggingReview: rigging })
  }

  const renderLiftingAndRigging = (type: 'loading' | 'heavy') => {
    const current = formData[type]
    if (!current) return null
    const lifting = current.liftingReview
    const rigging = current.riggingReview

    return (
      <Section title="인양·줄걸이 안전율 검토" description="필요한 값을 모두 입력한 경우에만 안전율을 계산합니다.">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700"><Calculator className="h-4 w-4 text-blue-600" />건설기계 인양능력</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="중량물 총 하중" type="number" suffix="ton" value={lifting.totalLoadTon} onChange={(value) => updateLifting(type, { totalLoadTon: nullableNumber(value) })} />
          <Field label="최대 양중능력" type="number" suffix="ton" value={lifting.maxCapacityTon} onChange={(value) => updateLifting(type, { maxCapacityTon: nullableNumber(value) })} />
        </div>
        <div className="mt-3"><SafetyResult label="건설기계 안전율" percent={lifting.safetyRatioPercent} /></div>

        <div className="my-5 border-t border-gray-200" />
        <div>
          <span className="mb-2 block text-xs font-medium text-gray-600">줄걸이 용구</span>
          <div className="flex flex-wrap gap-2">
            {RIGGING_TOOLS.map((tool) => {
              const selected = rigging.tools.includes(tool)
              return (
                <label key={tool} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${selected ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-600'}`}>
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => updateRigging(type, { tools: selected ? rigging.tools.filter((item) => item !== tool) : [...rigging.tools, tool] })}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  {tool}
                </label>
              )
            })}
          </div>
          {RIGGING_STANDARD_SPECS.filter((group) => rigging.tools.includes(group.tool)).map((group) => (
            <div key={group.tool} className="mt-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-medium text-gray-500">{group.tool} 표준 규격</span>
                {group.items.map((item) => {
                  const active = Object.entries(item.patch).every(
                    ([key, value]) => rigging[key as keyof RiggingCapacityReview] === value,
                  )
                  return (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => updateRigging(type, item.patch)}
                      className={`rounded-full border px-2.5 py-1 text-xs ${active ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'}`}
                    >
                      {item.label}
                    </button>
                  )
                })}
              </div>
              <p className="mt-1 text-[11px] text-gray-400">{group.note}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="기타 줄걸이 용구" value={rigging.otherTool} onChange={(value) => updateRigging(type, { otherTool: value })} />
          <Field label="직경" type="number" suffix="mm" value={rigging.diameterMm} onChange={(value) => updateRigging(type, { diameterMm: nullableNumber(value) })} />
          <Field label="길이" type="number" suffix="m" value={rigging.lengthM} onChange={(value) => updateRigging(type, { lengthM: nullableNumber(value) })} />
          <Field label="수량" type="number" value={rigging.quantity} onChange={(value) => updateRigging(type, { quantity: nullableNumber(value) })} />
          <Field label="개당 안전하중" type="number" suffix="ton" value={rigging.safeLoadPerToolTon} onChange={(value) => updateRigging(type, { safeLoadPerToolTon: nullableNumber(value) })} />
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">줄걸이 방법</span>
            <select value={rigging.slingMethod} onChange={(event) => updateRigging(type, { slingMethod: event.target.value as RiggingCapacityReview['slingMethod'] })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="">선택 안 함</option><option>1줄걸이</option><option>2줄걸이</option><option>3줄걸이</option><option>4줄걸이</option>
            </select>
          </label>
          <Field label="훅 용구" value={rigging.hookTool} onChange={(value) => updateRigging(type, { hookTool: value })} />
          <Field label="훅 직경" type="number" suffix="inch" value={rigging.hookDiameterInch} onChange={(value) => updateRigging(type, { hookDiameterInch: nullableNumber(value) })} />
          <Field label="훅 수량" type="number" value={rigging.hookQuantity} onChange={(value) => updateRigging(type, { hookQuantity: nullableNumber(value) })} />
          <Field label="훅 안전하중" type="number" suffix="ton" value={rigging.hookSafeLoadTon} onChange={(value) => updateRigging(type, { hookSafeLoadTon: nullableNumber(value) })} />
          <Field label="줄걸이 절단하중" type="number" suffix="ton" value={rigging.breakingLoadTon} onChange={(value) => updateRigging(type, { breakingLoadTon: nullableNumber(value) })} />
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">안전계수</span>
            <select value={rigging.safetyFactor ?? ''} onChange={(event) => updateRigging(type, { safetyFactor: nullableNumber(event.target.value) })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="">선택 안 함</option><option value="5">줄걸이 작업 5</option><option value="7">섬유로프 7</option><option value="10">근로자 탑승 10</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">줄걸이 각도·장력계수</span>
            <select
              value={rigging.slingAngleDegree ?? ''}
              onChange={(event) => {
                const value = event.target.value
                const angle = value === '' ? null : Number(value) as NonNullable<RiggingCapacityReview['slingAngleDegree']>
                updateRigging(type, { slingAngleDegree: angle, tensionFactor: angle === null ? null : TENSION_FACTORS[angle] })
              }}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">선택 안 함</option>
              {Object.entries(TENSION_FACTORS).map(([angle, factor]) => <option key={angle} value={angle}>{angle}° / {factor}</option>)}
            </select>
          </label>
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
            <span className="block text-xs font-medium text-gray-600">계산된 줄걸이 안전하중</span>
            <span className="mt-1 block text-sm font-semibold text-gray-800">{rigging.safeLoadTon === null ? '미계산' : `${rigging.safeLoadTon} ton`}</span>
          </div>
        </div>
        <p className="mt-2 text-xs text-gray-500">줄걸이 안전하중 = 절단하중 × 줄걸이 수 ÷ (안전계수 × 장력계수)</p>
        <div className="mt-3"><SafetyResult label="줄걸이 안전율" percent={rigging.safetyRatioPercent} /></div>
      </Section>
    )
  }

  const renderLoading = () => {
    const current = formData.loading
    if (!current) return null
    return (
      <>
        <Section title="장비 제원">
          <EquipmentCatalogSelector
            planType="loading"
            onSelect={(item: EquipmentCatalogItem) => updateNested('loading', 'equipment', toLoadingEquipmentPatch(item))}
          />
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="장비명" value={current.equipment.equipmentName} onChange={(value) => updateNested('loading', 'equipment', { equipmentName: value })} />
            <Field label="차량/장비번호" value={current.equipment.registrationNumber} onChange={(value) => updateNested('loading', 'equipment', { registrationNumber: value })} />
            <Field label="모델명/생산년도" value={current.equipment.modelAndYear} onChange={(value) => updateNested('loading', 'equipment', { modelAndYear: value })} />
            <Field label="보험기간" value={current.equipment.insurancePeriod} onChange={(value) => updateNested('loading', 'equipment', { insurancePeriod: value })} />
            <Field label="소유회사명" value={current.equipment.ownerCompany} onChange={(value) => updateNested('loading', 'equipment', { ownerCompany: value })} />
            <Field label="검사유효기간" value={current.equipment.inspectionValidity} onChange={(value) => updateNested('loading', 'equipment', { inspectionValidity: value })} />
            <Field label="차체중량" value={current.equipment.bodyWeightTon} suffix="ton" onChange={(value) => updateNested('loading', 'equipment', { bodyWeightTon: value })} />
            <Field label="장비폭" value={current.equipment.widthM} suffix="m" onChange={(value) => updateNested('loading', 'equipment', { widthM: value })} />
            <Field label="최소선회반경" value={current.equipment.minimumTurningRadiusM} suffix="m" onChange={(value) => updateNested('loading', 'equipment', { minimumTurningRadiusM: value })} />
            <Field label="최대 인양높이" value={current.equipment.maximumLiftingHeightM} suffix="m" onChange={(value) => updateNested('loading', 'equipment', { maximumLiftingHeightM: value })} />
            <Field label="작업반경" value={current.equipment.workingRadiusM} suffix="m" onChange={(value) => updateNested('loading', 'equipment', { workingRadiusM: value })} />
            <Field label="최대/정격하중" value={current.equipment.maxAndRatedLoadTon} suffix="ton" onChange={(value) => updateNested('loading', 'equipment', { maxAndRatedLoadTon: value })} />
          </div>
        </Section>
        {renderLiftingAndRigging('loading')}
      </>
    )
  }

  const renderConstruction = () => {
    const current = formData.construction
    if (!current) return null
    return (
      <Section title="건설기계 제원·운전원 면허">
        <EquipmentCatalogSelector
          planType="construction"
          onSelect={(item: EquipmentCatalogItem) => updateNested('construction', 'equipment', toConstructionEquipmentPatch(item))}
        />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="운전원 면허" value={current.operatorLicense} onChange={(value) => updatePlan('construction', { operatorLicense: value })} />
          <Field label="장비명" value={current.equipment.equipmentName} onChange={(value) => updateNested('construction', 'equipment', { equipmentName: value })} />
          <Field label="등록번호" value={current.equipment.registrationNumber} onChange={(value) => updateNested('construction', 'equipment', { registrationNumber: value })} />
          <Field label="차체중량" value={current.equipment.bodyWeight} onChange={(value) => updateNested('construction', 'equipment', { bodyWeight: value })} />
          <Field label="능력" value={current.equipment.capacity} onChange={(value) => updateNested('construction', 'equipment', { capacity: value })} />
        </div>
      </Section>
    )
  }

  const renderElectric = () => {
    const current = formData.electric
    if (!current) return null
    return (
      <Section title="작업자 보유자격" description="확인된 작업자 자격만 입력하고, 모르는 항목은 비워둘 수 있습니다.">
        {current.workers.length === 0 ? (
          <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-500">기본정보 단계에서 작업자를 먼저 추가해주세요.</p>
        ) : (
          <div className="space-y-3">
            {current.workers.map((worker, index) => (
              <div key={`${worker.name}-${index}`} className="grid items-end gap-3 rounded-lg border border-gray-200 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                <div>
                  <span className="block text-xs font-medium text-gray-500">작업자</span>
                  <span className="mt-1 block text-sm font-semibold text-gray-800">{worker.name}</span>
                </div>
                <Field
                  label="보유자격"
                  value={worker.qualification}
                  onChange={(value) => updatePlan('electric', {
                    workers: current.workers.map((item, workerIndex) => workerIndex === index ? { ...item, qualification: value } : item),
                  })}
                />
              </div>
            ))}
          </div>
        )}
      </Section>
    )
  }

  const renderHeavy = () => {
    const current = formData.heavy
    if (!current) return null
    return (
      <>
        <Section title="중량물·기계 제원">
          <EquipmentCatalogSelector
            planType="heavy"
            onSelect={(item: EquipmentCatalogItem) => updateNested('heavy', 'machine', toHeavyMachinePatch(item))}
          />
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="중량물 규격" value={current.load.dimensions} placeholder="너비 × 길이 × 높이" onChange={(value) => updateNested('heavy', 'load', { dimensions: value })} />
            <Field label="중량" value={current.load.weightKg} suffix="kg" onChange={(value) => updateNested('heavy', 'load', { weightKg: value })} />
            <Field label="1회 운반중량" value={current.load.transportWeightKg} suffix="kg" onChange={(value) => updateNested('heavy', 'load', { transportWeightKg: value })} />
            <Field label="기계명" value={current.machine.machineName} onChange={(value) => updateNested('heavy', 'machine', { machineName: value })} />
            <Field label="형식번호" value={current.machine.modelNumber} onChange={(value) => updateNested('heavy', 'machine', { modelNumber: value })} />
            <Field label="거더형식" value={current.machine.girderType} onChange={(value) => updateNested('heavy', 'machine', { girderType: value })} />
            <Field label="기계규격" value={current.machine.machineSpecification} onChange={(value) => updateNested('heavy', 'machine', { machineSpecification: value })} />
            <Field label="제조연월" value={current.machine.manufacturedDate} onChange={(value) => updateNested('heavy', 'machine', { manufacturedDate: value })} />
            <Field label="보험가입 여부" value={current.machine.insured} onChange={(value) => updateNested('heavy', 'machine', { insured: value })} />
            <Field label="정격하중" value={current.machine.ratedLoad} onChange={(value) => updateNested('heavy', 'machine', { ratedLoad: value })} />
            <Field label="조작방식" value={current.machine.controlMethod} onChange={(value) => updateNested('heavy', 'machine', { controlMethod: value })} />
            <Field label="검사결과" value={current.machine.inspectionResult} onChange={(value) => updateNested('heavy', 'machine', { inspectionResult: value })} />
            <Field label="유효기간" value={current.machine.validityPeriod} onChange={(value) => updateNested('heavy', 'machine', { validityPeriod: value })} />
          </div>
        </Section>
        {renderLiftingAndRigging('heavy')}
      </>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900">나중 확인 정보를 입력해주세요.</h2>
        <p className="mt-1 text-sm text-gray-500">장비 제원과 자격 정보를 아직 모르면 모두 비워두고 저장할 수 있습니다.</p>
      </div>
      {selectedTypes.map((type) => (
        <div key={type} className="space-y-4 rounded-xl border-2 border-amber-100 bg-amber-50/40 p-3 sm:p-4">
          <div className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white">{TYPE_LABELS[type]}</div>
          {type === 'loading' && renderLoading()}
          {type === 'construction' && renderConstruction()}
          {type === 'electric' && renderElectric()}
          {type === 'heavy' && renderHeavy()}
        </div>
      ))}
    </div>
  )
}
