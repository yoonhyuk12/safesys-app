'use client'

// AI 작업계획서의 6단계 작성·수정 흐름과 단계별 입력·저장 상태를 관리하는 마법사

import { useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Download, Loader2, Map, Save, Sparkles, X } from 'lucide-react'
import DeferredInfoStep from './DeferredInfoStep'
import PlanTypeSelector from './PlanTypeSelector'
import WorkPlanForm from './WorkPlanForm'
import { supabase } from '@/lib/supabase'
import type {
  CommonWorkPlanFields,
  PlanType,
  RiggingCapacityReview,
  WorkPlanFormData,
  WorkPlanProject,
  WorkPlanRecord,
  WorkPlanWorker,
} from '@/lib/work-plan/types'

interface WorkPlanWizardProps {
  project: WorkPlanProject
  workers: WorkPlanWorker[]
  initialRecord?: WorkPlanRecord | null
  userId: string
  onClose: () => void
  onSaved: (record: WorkPlanRecord) => void
}

const STEPS = [
  { label: '서류 선택', icon: Check },
  { label: '기본정보', icon: ArrowRight },
  { label: '지도 드로잉', icon: Map },
  { label: 'AI 검토', icon: Sparkles },
  { label: '나중 확인 정보', icon: Check },
  { label: '저장·다운로드', icon: Save },
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
    safetyFactor: null,
    slingAngleDegree: null,
    tensionFactor: null,
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

function cloneFormData(formData: WorkPlanFormData): WorkPlanFormData {
  return JSON.parse(JSON.stringify(formData)) as WorkPlanFormData
}

function getWorkPlanSummary(selectedTypes: PlanType[], formData: WorkPlanFormData) {
  const representativeType = selectedTypes[0]
  const representativeForm = representativeType ? formData[representativeType] : undefined
  if (!representativeForm) return null

  if (representativeForm.planType === 'electric') {
    return {
      title: representativeForm.title.trim(),
      workStartDate: representativeForm.workDate || null,
      workEndDate: representativeForm.workDate || null,
    }
  }

  return {
    title: representativeForm.title.trim(),
    workStartDate: representativeForm.workStartDate || null,
    workEndDate: representativeForm.workEndDate || null,
  }
}

export default function WorkPlanWizard({
  project,
  workers,
  initialRecord = null,
  userId,
  onClose,
  onSaved,
}: WorkPlanWizardProps) {
  const [step, setStep] = useState(initialRecord ? 2 : 1)
  const [selectedTypes, setSelectedTypes] = useState<PlanType[]>(() =>
    initialRecord ? [...initialRecord.plan_types] : [],
  )
  const [formData, setFormData] = useState<WorkPlanFormData>(() =>
    initialRecord ? cloneFormData(initialRecord.form_data) : {},
  )
  const [persistedRecord, setPersistedRecord] = useState<WorkPlanRecord | null>(initialRecord)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveSucceeded, setSaveSucceeded] = useState(false)

  const scheduleCandidates = useMemo(() => {
    const schedule = project.construction_schedule as { items?: Array<{ name?: string }> } | null
    return (schedule?.items || []).map((item) => item.name || '').filter(Boolean)
  }, [project.construction_schedule])

  const handleTypeChange = (types: PlanType[]) => {
    setSelectedTypes(types)
    setSaveSucceeded(false)
    setSaveError('')
    setFormData((current) => {
      const next: WorkPlanFormData = {}
      types.forEach((type) => {
        Object.assign(next, { [type]: current[type] || createPlanForm(type, project) })
      })
      return next
    })
  }

  const canContinue = step !== 1 || selectedTypes.length > 0

  const handleSave = async () => {
    setSaveError('')
    setSaveSucceeded(false)

    if (selectedTypes.length === 0) {
      setSaveError('저장할 서류를 한 개 이상 선택해주세요.')
      setStep(1)
      return
    }

    const missingTitle = selectedTypes.some((type) => !formData[type]?.title.trim())
    const summary = getWorkPlanSummary(selectedTypes, formData)
    if (missingTitle || !summary?.title) {
      setSaveError('선택한 모든 서류의 작업명(장소)을 입력해주세요.')
      setStep(2)
      return
    }

    setIsSaving(true)
    try {
      const payload = {
        project_id: project.id,
        plan_types: [...selectedTypes],
        title: summary.title,
        work_start_date: summary.workStartDate,
        work_end_date: summary.workEndDate,
        form_data: cloneFormData(formData),
      }

      const query = persistedRecord
        ? supabase
            .from('work_plans')
            .update(payload)
            .eq('id', persistedRecord.id)
            .eq('project_id', project.id)
        : supabase
            .from('work_plans')
            .insert({ ...payload, created_by: userId })

      const { data, error } = await query.select('*').single()
      if (error) throw new Error(error.message)

      const savedRecord = data as WorkPlanRecord
      setPersistedRecord(savedRecord)
      setSaveSucceeded(true)
      onSaved(savedRecord)
    } catch (error: unknown) {
      console.error('작업계획서 저장 실패:', error)
      setSaveError(error instanceof Error ? error.message : '작업계획서를 저장하지 못했습니다.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-4 sm:px-6">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-bold text-gray-900">{initialRecord ? '작업계획서 수정' : '새 작업계획서'}</h2>
            {initialRecord && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">수정 모드</span>}
          </div>
          <p className="text-xs text-gray-500">{project.project_name}</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="작성 닫기">
          <X className="h-5 w-5" />
        </button>
      </div>

      <ol className="grid grid-cols-6 border-b border-gray-200 bg-gray-50 px-2 py-3 sm:px-6">
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
        {saveError && step !== 6 && (
          <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {saveError}
          </p>
        )}
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
        {(step === 3 || step === 4) && (
          <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 p-8 text-center">
            {step === 3 && <Map className="mb-4 h-12 w-12 text-blue-400" />}
            {step === 4 && <Sparkles className="mb-4 h-12 w-12 text-violet-400" />}
            <h3 className="text-lg font-bold text-gray-900">{STEPS[step - 1].label}</h3>
            <p className="mt-2 max-w-md text-sm text-gray-500">
              {step === 3 && 'Phase 2에서 위성지도·현장사진 위에 작업 동선과 안전표지를 그리는 기능이 연결됩니다.'}
              {step === 4 && 'Phase 3에서 입력 내용을 바탕으로 위험요인과 안전대책 AI 초안을 생성하고 검토합니다.'}
            </p>
          </div>
        )}
        {step === 5 && (
          <DeferredInfoStep selectedTypes={selectedTypes} formData={formData} onChange={setFormData} />
        )}
        {step === 6 && (
          <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-gray-200 bg-gray-50 p-8 text-center">
            {saveSucceeded ? <Check className="mb-4 h-12 w-12 text-emerald-500" /> : <Save className="mb-4 h-12 w-12 text-blue-500" />}
            <h3 className="text-lg font-bold text-gray-900">
              {saveSucceeded ? '저장이 완료되었습니다.' : initialRecord ? '수정 내용을 저장합니다.' : '작업계획서를 저장합니다.'}
            </h3>
            <p className="mt-2 max-w-md text-sm text-gray-500">
              비워둔 나중 확인 정보는 공란으로 저장되며, 목록의 수정 버튼에서 언제든 이어서 입력할 수 있습니다.
            </p>
            {saveError && (
              <p role="alert" className="mt-4 w-full max-w-lg rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {saveError}
              </p>
            )}
            <button type="button" disabled className="mt-5 inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-400">
              <Download className="h-4 w-4" />PDF 다운로드 (Phase 4)
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-4 py-3 sm:px-6">
        <button type="button" disabled={isSaving} onClick={() => step === 1 ? onClose() : setStep((value) => value - 1)} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40">
          <ArrowLeft className="h-4 w-4" />
          {step === 1 ? '취소' : '이전'}
        </button>
        {step < 5 && (
          <button type="button" disabled={!canContinue} onClick={() => setStep((value) => value + 1)} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40">
            다음
            <ArrowRight className="h-4 w-4" />
          </button>
        )}
        {step === 5 && (
          <button type="button" onClick={() => setStep(6)} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            건너뛰고 저장
            <ArrowRight className="h-4 w-4" />
          </button>
        )}
        {step === 6 && (
          <button type="button" disabled={isSaving} onClick={handleSave} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isSaving ? '저장 중...' : persistedRecord ? '수정 저장' : '저장'}
          </button>
        )}
      </div>
    </div>
  )
}
