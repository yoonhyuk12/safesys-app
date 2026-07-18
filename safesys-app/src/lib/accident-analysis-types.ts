// 사고 통계 분석의 공개 타입과 한글 선택 옵션을 정의하는 모듈
import type { FindingClassificationSummary, FindingCode } from '@/lib/finding-classification'

export type AccidentSeverity = 'minor' | 'lost_time' | 'serious' | 'fatal'

export interface ProjectAccident {
  id: string
  /** 등록 프로젝트 FK. 미등록 현장 사고는 null */
  project_id: string | null
  /** 미등록 현장 직접입력 명칭 */
  external_project_name: string | null
  external_managing_hq: string | null
  external_managing_branch: string | null
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
  /** 등록 프로젝트 id. 미등록 현장이면 빈 문자열 */
  project_id: string
  /** 미등록 현장 직접입력 명칭. 등록 프로젝트 선택 시 빈 문자열 */
  external_project_name: string
  external_managing_hq: string
  external_managing_branch: string
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

/** 점검에서 전개된 개별 지적 항목. 지적 텍스트와 고정 분류 코드를 담는다. */
export interface NormalizedFinding {
  /** 점검 내 안정 키(React 키·중복 판별용) */
  id: string
  /** 지적 원문 */
  text: string
  /**
   * 고정 분류 코드 (F01_PPE … F20_WORK_METHOD, F19_OTHER).
   * 메타·상태 등 통계 제외 문구는 findings 배열에 넣지 않는다.
   */
  code: FindingCode
}

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
  /**
   * 분류용 개별 지적 항목. 정기 safety_inspection_results·본부 issue_content(사진 지적 입력란)만 담는 보고서 권장 1차 코퍼스다.
   * 추가항목·체크리스트 부적합을 포함하는 finding_count의 부분집합이며, 관리자점검은 빈 배열이다.
   */
  findings: NormalizedFinding[]
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
  /** 점검 합계 (정기+지사+본부) */
  inspectionCount: number
  /** 정기안전점검 (source: safety) */
  safetyInspectionCount: number
  /** 관리자점검·지사 (source: manager) */
  managerInspectionCount: number
  /** 본부불시점검 (source: headquarters) */
  headquartersInspectionCount: number
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
  /** 사고 직전 최근 점검일부터 사고일까지의 경과일. 사고 전 점검이 없으면 null */
  daysSinceLatestInspection: number | null
  latestInspection: NormalizedSafetyInspection | null
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
  sampleSize: AccidentAnalysisSampleSize
  /** 분석 기간·조직 필터 내 정기·본부불시점검 지적의 고정 코드 분류 집계(관리자점검 제외) */
  findingClassification: FindingClassificationSummary
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
