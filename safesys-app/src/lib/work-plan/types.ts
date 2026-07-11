// AI 작업계획서 4종의 폼·AI 초안·지도 드로잉·DB 레코드 공용 타입

export type PlanType = 'loading' | 'construction' | 'electric' | 'heavy'

// 작성 화면 자동 인입에 필요한 프로젝트·작업자 최소 필드
export interface WorkPlanProject {
  id: string
  project_name: string
  actual_work_address?: string | null
  site_address?: string | null
  managing_hq?: string | null
  managing_branch?: string | null
  supervisor_position?: string | null
  supervisor_name?: string | null
  supervisor_phone?: string | null
  g2b_corp_nm?: string | null
  construction_start_date?: string | null
  construction_end_date?: string | null
  construction_schedule?: unknown
  latitude?: number | null
  longitude?: number | null
}

export interface WorkPlanWorker {
  id: string
  name: string
  phone: string | null
}

export type ChecklistResult = '양호' | '미흡' | '해당없음'

export interface ChecklistAnswer {
  itemIndex: number
  result: ChecklistResult
  note: string
}

export interface PersonContact {
  name: string
  phone: string
  position?: string
}

export interface RiskControlRow {
  workStep: string
  riskFactor: string
  improvementMeasure: string
}

// 보고서 서명 대상 역할 — 결재란(담당·승인), 공통 서식(지휘자·운전원·유도자), 전기 서식(지시확인·인계인수)
export type WorkPlanSignatureRole =
  | 'approvalManager'
  | 'approvalApprover'
  | 'workDirector'
  | 'operator'
  | 'guide'
  | 'instructionManager'
  | 'instructionWorker'
  | 'handoverDeliverer'
  | 'handoverReceiver'

// 역할별 손글씨 서명 PNG data URL
export type WorkPlanSignatures = Partial<Record<WorkPlanSignatureRole, string>>

export interface CommonWorkPlanFields {
  title: string
  workStartDate: string
  workEndDate: string
  companyName: string
  workerNames: string[]
  workDirector: PersonContact
  operator: PersonContact
  guide: PersonContact
  sharedWorkContent: string
  riskControls: RiskControlRow[]
  signatures?: WorkPlanSignatures
}

export interface LiftingCapacityReview {
  totalLoadTon: number | null
  maxCapacityTon: number | null
  safetyRatioPercent: number | null
}

export type RiggingTool = '와이어로프' | '섬유로프' | '체인블럭' | '기타'
export type SlingMethod = '1줄걸이' | '2줄걸이' | '3줄걸이' | '4줄걸이'

export interface RiggingCapacityReview {
  tools: RiggingTool[]
  otherTool: string
  diameterMm: number | null
  lengthM: number | null
  quantity: number | null
  safeLoadPerToolTon: number | null
  slingMethod: SlingMethod | ''
  hookTool: string
  hookDiameterInch: number | null
  hookQuantity: number | null
  hookSafeLoadTon: number | null
  breakingLoadTon: number | null
  safetyFactor: number | null
  slingAngleDegree: 0 | 30 | 60 | 90 | 120 | null
  tensionFactor: number | null
  safeLoadTon: number | null
  safetyRatioPercent: number | null
}

export interface LoadingEquipmentSpec {
  equipmentName: string
  registrationNumber: string
  modelAndYear: string
  insurancePeriod: string
  ownerCompany: string
  inspectionValidity: string
  bodyWeightTon: string
  widthM: string
  minimumTurningRadiusM: string
  maximumLiftingHeightM: string
  workingRadiusM: string
  maxAndRatedLoadTon: string
}

export interface LoadingWorkPlanFormData extends CommonWorkPlanFields {
  planType: 'loading'
  vehicleNumber: string
  workTime: string
  equipment: LoadingEquipmentSpec
  liftingReview: LiftingCapacityReview
  riggingReview: RiggingCapacityReview
  checklist: ChecklistAnswer[]
}

export type ConstructionSurveyType = 'constructionMachine' | 'excavation' | 'tunnel' | 'demolition'

export interface ConstructionSurveyEntry {
  itemIndex: number
  finding: string
  photoUrl: string
}

export interface ConstructionEquipmentSpec {
  equipmentName: string
  registrationNumber: string
  bodyWeight: string
  capacity: string
}

export interface ConstructionWorkPlanFormData extends CommonWorkPlanFields {
  planType: 'construction'
  operatorLicense: string
  guideSignalMethod: string
  workMethod: string
  workSequence: string[]
  equipment: ConstructionEquipmentSpec
  surveyType: ConstructionSurveyType
  surveyEntries: ConstructionSurveyEntry[]
  checklist: ChecklistAnswer[]
}

export type EmploymentType = '상근' | '일용'

export interface ElectricWorker {
  name: string
  qualification: string
  employmentType: EmploymentType
}

export interface SafetyEducationPlan {
  date: string
  place: string
  instructor: string
  attendeeCount: number | null
  content: string
}

export interface ElectricWorkStep {
  workName: string
  sequenceAndContent: string
  riskFactor: string
  safeMethod: string
  note: string
}

export interface WorkPlanElectricAttachments {
  drawingSource: string | null
  drawingFileName: string
  sitePhotoSource: string | null
  sitePhotoFileName: string
}

export interface ElectricWorkPlanFormData {
  planType: 'electric'
  title: string
  workDate: string
  clientName: string
  manager: PersonContact
  companyName: string
  workLeader: PersonContact
  purposeAndContent: string
  workScope: string
  workers: ElectricWorker[]
  education: SafetyEducationPlan
  protectiveEquipment: string[]
  otherProtectiveEquipment: string
  measurementEquipment: string
  liveLineEquipment: string
  protectiveDevices: string
  otherEquipment: string
  instructionAcknowledgement: { managerName: string; workerName: string }
  workSteps: ElectricWorkStep[]
  handover: { details: string; deliverer: string; receiver: string }
  attachments: string[]
  checklist: ChecklistAnswer[]
  signatures?: WorkPlanSignatures
}

export interface HeavyLoadSpec {
  itemName: string
  shape: string
  dimensions: string
  weightKg: string
  transportWeightKg: string
  fixingMethod: string
}

export interface HeavyMachineSpec {
  machineName: string
  modelNumber: string
  girderType: string
  machineSpecification: string
  manufacturedDate: string
  insured: string
  ratedLoad: string
  controlMethod: string
  inspectionResult: string
  validityPeriod: string
}

export interface HeavyWorkPlanFormData extends CommonWorkPlanFields {
  planType: 'heavy'
  load: HeavyLoadSpec
  machine: HeavyMachineSpec
  liftingReview: LiftingCapacityReview
  riggingReview: RiggingCapacityReview
  checklist: ChecklistAnswer[]
}

export interface WorkPlanFormByType {
  loading: LoadingWorkPlanFormData
  construction: ConstructionWorkPlanFormData
  electric: ElectricWorkPlanFormData
  heavy: HeavyWorkPlanFormData
}

export type WorkPlanFormData = Partial<WorkPlanFormByType>

export interface WorkPlanAiDraft {
  sharedWorkContent?: string
  riskControls: RiskControlRow[]
  workSequence?: string[]
  electricWorkSteps?: ElectricWorkStep[]
  surveyFindings?: string[]
}

export type WorkPlanAiResult = Partial<Record<PlanType, WorkPlanAiDraft>>

export type MapBackgroundType = 'hybrid' | 'roadmap' | 'photo'
export type DrawingToolType =
  | 'equipment'
  | 'route'
  | 'guide'
  | 'workDirector'
  | 'restrictedArea'
  | 'safetySign'
  | 'label'

export interface DrawingPoint {
  x: number
  y: number
}

export interface MapDrawingObject {
  id: string
  type: DrawingToolType
  points: DrawingPoint[]
  text?: string
}

export interface MapDrawingData {
  background: {
    type: MapBackgroundType
    imageUrl?: string
    center?: { latitude: number; longitude: number }
    level?: number
  }
  canvasWidth: number
  canvasHeight: number
  objects: MapDrawingObject[]
}

export interface WorkPlanRecord {
  id: string
  project_id: string
  plan_types: PlanType[]
  title: string
  work_start_date: string | null
  work_end_date: string | null
  form_data: WorkPlanFormData
  map_drawing: MapDrawingData | null
  map_image_url: string | null
  site_photo_urls: string[]
  created_by: string | null
  created_at: string
  updated_at: string
}
