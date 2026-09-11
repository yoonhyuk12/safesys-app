// CSI 자체 품질시험 사업·실적·상세 조회의 공용 자료형을 정의한다.
export interface CsiSelfQualityProject {
  bizMngNo: string
  projectName: string
  totalCount: number
}

export interface CsiSelfQualityRow {
  groupNo: string
  bizMngNo: string
  reportNo: string
  projectName: string
  materialName: string
  testPlace: string
  testSummary: string
  registeredDate: string
  testerName: string
  status: string
}

export interface CsiSelfQualityItem {
  testDate: string
  materialCategory: string
  testItem: string
  testStandard: string
  testResult: string
  verdict: string
}

export interface CsiSelfQualityDetail {
  groupNo: string
  bizMngNo: string
  reportNo: string
  materialName: string
  producerName: string
  testPlace: string
  testerName: string
  note: string
  items: CsiSelfQualityItem[]
}

export interface CsiSelfQualityListData {
  projects: CsiSelfQualityProject[]
  rows: CsiSelfQualityRow[]
  totalCount: number
  truncated: boolean
}

export type CsiSelfQualityListResponse = { success: true; data: CsiSelfQualityListData; error?: never } | { success: false; error: string; data?: never }
export type CsiSelfQualityDetailResponse = { success: true; data: CsiSelfQualityDetail; error?: never } | { success: false; error: string; data?: never }
