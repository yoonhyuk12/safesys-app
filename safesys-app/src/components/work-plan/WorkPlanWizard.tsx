'use client'

// AI 작업계획서의 5단계 작성 흐름과 단계별 입력 상태를 관리하는 마법사

import { useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Map, Save, Sparkles, X } from 'lucide-react'
import PlanTypeSelector from './PlanTypeSelector'
import WorkPlanForm from './WorkPlanForm'
import type {
  CommonWorkPlanFields,
  PlanType,
  RiggingCapacityReview,
  WorkPlanFormData,
  WorkPlanProject,
  WorkPlanWorker,
} from '@/lib/work-plan/types'

interface WorkPlanWizardProps {
  project: WorkPlanProject
  workers: WorkPlanWorker[]
  onClose: () => void
}

const STEPS = [
  { label: '서류 선택', icon: Check },
  { label: '기본정보', icon: ArrowRight },
  { label: '지도 드로잉', icon: Map },
  { label: 'AI 검토', icon: Sparkles },
  { label: '저장·PDF', icon: Save },
]

const today = () => new Date().toISOString().slice(0, 10)

function createCommon(project: WorkPlanProject): CommonWorkPlanFields {
  const address = project.actual_work_address || project.site_address || ''
  return {
    title: [project.project_name, address].filter(Boolean).join(' / '),
    workStartDate: today(),
    workEndDate: today(),
    companyName: project.g2b_corp_nm || '',
    workerNames: [],
    workDirector: { name: '', phone: '' },
    operator: { name: '', phone: '' },
    guide: { name: '', phone: '' },
    sharedWorkContent: '',
    riskControls: [],
  }
}

function createRiggingReview(): RiggingCapacityReview {
  return {
    tools: [],
    otherTool: '',
    diameterMm: null,
    lengthM: null,
    quantity: null,
    safeLoadPerToolTon: null,
    slingMethod: '',
    hookTool: '',
    hookDiameterInch: null,
    hookQuantity: null,
    hookSafeLoadTon: null,
    breakingLoadTon: null,
    safetyFactor: 5,
    slingAngleDegree: 0,
    tensionFactor: 1,
    safeLoadTon: null,
    safetyRatioPercent: null,
  }
}

function createPlanForm(type: PlanType, project: WorkPlanProject): NonNullable<WorkPlanFormData[PlanType]> {
  const common = createCommon(project)
  if (type === 'loading') {
    return {
      ...common,
      planType: 'loading',
      vehicleNumber: '',
      workTime: '',
      equipment: {
        equipmentName: '', registrationNumber: '', modelAndYear: '', insurancePeriod: '', ownerCompany: '',
        inspectionValidity: '', bodyWeightTon: '', widthM: '', minimumTurningRadiusM: '',
        maximumLiftingHeightM: '', workingRadiusM: '', maxAndRatedLoadTon: '',
      },
      liftingReview: { totalLoadTon: null, maxCapacityTon: null, safetyRatioPercent: null },
      riggingReview: createRiggingReview(),
      checklist: [],
    }
  }
  if (type === 'construction') {
    return {
      ...common,
      planType: 'construction',
      operatorLicense: '', guideSignalMethod: '', workMethod: '', workSequence: [],
      equipment: { equipmentName: '', registrationNumber: '', bodyWeight: '', capacity: '' },
      surveyType: 'constructionMachine', surveyEntries: [], checklist: [],
    }
  }
  if (type === 'electric') {
    return {
      planType: 'electric',
      title: common.title,
      workDate: today(),
      clientName: [project.managing_hq, project.managing_branch].filter(Boolean).join(' '),
      manager: {
        position: project.supervisor_position || '',
        name: project.supervisor_name || '',
        phone: project.supervisor_phone || '',
      },
      companyName: common.companyName,
      workLeader: { position: '', name: '', phone: '' },
      purposeAndContent: '', workScope: '', workers: [],
      education: { date: today(), place: '', instructor: '', attendeeCount: null, content: '' },
      protectiveEquipment: [], otherProtectiveEquipment: '', measurementEquipment: '',
      liveLineEquipment: '', protectiveDevices: '', otherEquipment: '',
      instructionAcknowledgement: { managerName: '', workerName: '' },
      workSteps: [], handover: { details: '', deliverer: '', receiver: '' },
      attachments: [], checklist: [],
    }
  }
  return {
    ...common,
    planType: 'heavy',
    load: { itemName: '', shape: '', dimensions: '', weightKg: '', transportWeightKg: '', fixingMethod: '' },
    machine: {
      machineName: '', modelNumber: '', girderType: '', machineSpecification: '', manufacturedDate: '',
      insured: '', ratedLoad: '', controlMethod: '', inspectionResult: '', validityPeriod: '',
    },
    liftingReview: { totalLoadTon: null, maxCapacityTon: null, safetyRatioPercent: null },
    riggingReview: createRiggingReview(),
    checklist: [],
  }
}

export default function WorkPlanWizard({ project, workers, onClose }: WorkPlanWizardProps) {
  const [step, setStep] = useState(1)
  const [selectedTypes, setSelectedTypes] = useState<PlanType[]>([])
  const [formData, setFormData] = useState<WorkPlanFormData>({})

  const scheduleCandidates = useMemo(() => {
    const schedule = project.construction_schedule as { items?: Array<{ name?: string }> } | null
    return (schedule?.items || []).map((item) => item.name || '').filter(Boolean)
  }, [project.construction_schedule])

  const handleTypeChange = (types: PlanType[]) => {
    setSelectedTypes(types)
    setFormData((current) => {
      const next: WorkPlanFormData = {}
      types.forEach((type) => {
        Object.assign(next, { [type]: current[type] || createPlanForm(type, project) })
      })
      return next
    })
  }

  const canContinue = step !== 1 || selectedTypes.length > 0

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-4 sm:px-6">
        <div>
          <h2 className="font-bold text-gray-900">새 작업계획서</h2>
          <p className="text-xs text-gray-500">{project.project_name}</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="작성 닫기">
          <X className="h-5 w-5" />
        </button>
      </div>

      <ol className="grid grid-cols-5 border-b border-gray-200 bg-gray-50 px-2 py-3 sm:px-6">
        {STEPS.map((item, index) => {
          const number = index + 1
          const Icon = item.icon
          return (
            <li key={item.label} className={`flex flex-col items-center gap-1 text-center ${number <= step ? 'text-blue-700' : 'text-gray-400'}`}>
              <span className={`flex h-8 w-8 items-center justify-center rounded-full border ${number < step ? 'border-blue-600 bg-blue-600 text-white' : number === step ? 'border-blue-600 bg-white' : 'border-gray-300 bg-white'}`}>
                {number < step ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              </span>
              <span className="hidden text-xs font-medium sm:block">{item.label}</span>
            </li>
          )
        })}
      </ol>

      <div className="max-h-[calc(100vh-15rem)] min-h-80 overflow-y-auto p-4 sm:p-6">
        {step === 1 && <PlanTypeSelector selectedTypes={selectedTypes} onChange={handleTypeChange} />}
        {step === 2 && (
          <WorkPlanForm
            selectedTypes={selectedTypes}
            formData={formData}
            onChange={setFormData}
            workers={workers}
            scheduleCandidates={scheduleCandidates}
            constructionPeriod={{ start: project.construction_start_date, end: project.construction_end_date }}
          />
        )}
        {step >= 3 && (
          <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 p-8 text-center">
            {step === 3 && <Map className="mb-4 h-12 w-12 text-blue-400" />}
            {step === 4 && <Sparkles className="mb-4 h-12 w-12 text-violet-400" />}
            {step === 5 && <Save className="mb-4 h-12 w-12 text-emerald-500" />}
            <h3 className="text-lg font-bold text-gray-900">{STEPS[step - 1].label}</h3>
            <p className="mt-2 max-w-md text-sm text-gray-500">
              {step === 3 && 'Phase 2에서 위성지도·현장사진 위에 작업 동선과 안전표지를 그리는 기능이 연결됩니다.'}
              {step === 4 && 'Phase 3에서 입력 내용을 바탕으로 위험요인과 안전대책 AI 초안을 생성하고 검토합니다.'}
              {step === 5 && 'Phase 4에서 저장과 선택 서류별 PDF 다운로드 기능이 연결됩니다.'}
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-4 py-3 sm:px-6">
        <button type="button" onClick={() => step === 1 ? onClose() : setStep((value) => value - 1)} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100">
          <ArrowLeft className="h-4 w-4" />
          {step === 1 ? '취소' : '이전'}
        </button>
        {step < 5 && (
          <button type="button" disabled={!canContinue} onClick={() => setStep((value) => value + 1)} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40">
            다음
            <ArrowRight className="h-4 w-4" />
          </button>
        )}
        {step === 5 && <span className="text-xs text-gray-500">저장·PDF는 Phase 4에서 활성화됩니다.</span>}
      </div>
    </div>
  )
}
