// 사고 통계 분석의 공개 타입과 한글 선택 옵션을 정의하는 모듈
export type AccidentSeverity = 'minor' | 'lost_time' | 'serious' | 'fatal'

export interface ProjectAccident {
  id: string
  project_id: string
  accident_at: string
  severity: AccidentSeverity
  accident_type: string
  location: string
  work_description: string
  description: string
  cause: string
  prevention_action: string
  injured_count: number
  fatal_count: number
  lost_workdays: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface AccidentFormInput {
  project_id: string
  accident_at: string
  severity: AccidentSeverity
  accident_type: string
  location: string
  work_description: string
  description: string
  cause: string
  prevention_action: string
  injured_count: number
  fatal_count: number
  lost_workdays: number
}

export type SafetyInspectionSource = 'safety' | 'manager' | 'headquarters'

export interface NormalizedSafetyInspection {
  id: string
  project_id: string
  source_type: SafetyInspectionSource
  source_label: string
  inspected_at: string
  summary: string
  signed: boolean
  finding_count: number
  unresolved_count: number
}

export interface AccidentAnalysisKpis {
  observedProjectCount: number
  accidentCount: number
  injuredCount: number
  fatalCount: number
  inspectionCount: number
  latestAccidentAt: string | null
  projectMonthCount: number
  accidentsPer100ProjectMonths: number
}

export interface MonthlyAccidentTrend {
  month: string
  inspectionCount: number
  accidentCount: number
  injuredCount: number
  fatalCount: number
}

export interface AccidentProjectSummary {
  projectId: string
  projectName: string
  managingHq: string
  managingBranch: string
  inspectionCount: number
  signedInspectionCount: number
  signatureCompletionRate: number
  findingCount: number
  unresolvedCount: number
  accidentCount: number
  injuredCount: number
  fatalCount: number
  latestAccidentAt: string | null
}

export interface AccidentInspectionDetail {
  accident: ProjectAccident
  prior30Count: number
  prior90Count: number
  latestInspection: NormalizedSafetyInspection | null
}

export type InspectionCountBandKey = '0' | '1' | '2-3' | '4+'

export interface InspectionCountRelation {
  key: InspectionCountBandKey
  label: string
  projectMonthCount: number
  accidentProjectMonthCount: number
  accidentCount: number
  accidentOccurrenceRate: number
}

export interface AccidentAnalysisSampleSize {
  projectMonthCount: number
  accidentProjectMonthCount: number
  isInsufficient: boolean
  message: string
}

export interface AccidentAnalysisResult {
  kpis: AccidentAnalysisKpis
  monthlyTrend: MonthlyAccidentTrend[]
  projectSummaries: AccidentProjectSummary[]
  accidentDetails: AccidentInspectionDetail[]
  relation30Days: InspectionCountRelation[]
  relation90Days: InspectionCountRelation[]
  sampleSize: AccidentAnalysisSampleSize
}

export interface AccidentAnalysisDataResponse {
  success: boolean
  accidents: ProjectAccident[]
  inspections: NormalizedSafetyInspection[]
  error?: string
}

export interface AccidentValidationResult {
  valid: boolean
  errors: Partial<Record<keyof AccidentFormInput, string>>
}

export interface AccidentMutationResult {
  success: boolean
  accident?: ProjectAccident
  error?: string
}

export const ACCIDENT_SEVERITY_OPTIONS: ReadonlyArray<{ value: AccidentSeverity; label: string }> = [
  { value: 'minor', label: '경상' },
  { value: 'lost_time', label: '휴업' },
  { value: 'serious', label: '중상' },
  { value: 'fatal', label: '사망' },
]

export const ACCIDENT_TYPE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '추락', label: '추락' },
  { value: '넘어짐', label: '넘어짐' },
  { value: '부딪힘', label: '부딪힘' },
  { value: '물체에 맞음', label: '물체에 맞음' },
  { value: '끼임', label: '끼임' },
  { value: '깔림·뒤집힘', label: '깔림·뒤집힘' },
  { value: '절단·베임·찔림', label: '절단·베임·찔림' },
  { value: '감전', label: '감전' },
  { value: '붕괴·도괴', label: '붕괴·도괴' },
  { value: '화재·폭발', label: '화재·폭발' },
  { value: '질식·중독', label: '질식·중독' },
  { value: '기타', label: '기타' },
]
