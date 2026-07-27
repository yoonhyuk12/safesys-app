// 수시 위험성평가 기능의 공유 타입 계약 — Worker 병렬 작업의 고정점 (수정은 코디네이터만)

/** 유해·위험요인 DB의 위험요인 1건 (risk_hazards 테이블 행) */
export interface RiskHazard {
  id: number
  businessType: string      // 사업별 (16종)
  construction: string      // 공사
  unitWork: string          // 단위작업
  detailWork: string        // 세부단위작업
  hazard: string            // 유해위험요인
  disasterType: string      // 재해유형
  relatedLaw: string        // 관계법령
  workPermit: string        // 안전작업허가 대상작업
  flagSerious: boolean      // 공사중대재해
  flagAccidentCase: boolean // 공사재해사례
  flagNearMiss: boolean     // 아차사고
  flagSif: boolean          // SIF
  flagProfile: boolean      // 프로파일
  measures: string[]        // 감소대책 (risk_hazard_measures, sort_order 순)
}

/** GET /api/risk-db/taxonomy 응답 — 캐스케이드 다음 단계 옵션 */
export interface RiskTaxonomyResponse {
  success: boolean
  data?: string[]           // 다음 단계 고유값 목록 (파라미터 없으면 사업별, businessType만 주면 공사, ...)
  error?: string
}

/** GET /api/risk-db/hazards 응답 */
export interface RiskHazardsResponse {
  success: boolean
  data?: RiskHazard[]
  error?: string
}

/** 평가서 표의 1개 행 (양식 2행 1조 = 이 객체 1개) */
export interface RiskAssessmentRow {
  hazardId: number | null   // risk_hazards 참조 (null = 수기 입력 행)
  detailWork: string        // 세부작업(단위작업) — 상단 행 A열
  workLocation: string      // 작업위치 — 하단 행 A열
  equipment: string         // 사용장비/설비/인원
  hazard: string            // 위험요인 (DB 원문 유지)
  disasterType: string      // 재해형태
  frequency: number         // 빈도 1~3
  intensity: number         // 강도 1~3 (위험성 = frequency × intensity)
  measures: string[]        // 예방대책 (DB 원문 유지)
  reviewNote: string        // 검토/추록 — 하단 행
  improvedRisk: number      // 개선후 위험성 (3 이하 관리 목표)
  improveDate: string       // 개선예정일(완료일)
  managerSub: string        // 이행담당(하도급사)
  managerMain: string       // 확인담당(원도급사)
}

/** 위험성 등급 계산 — 상(7~9) / 중(4~6) / 하(1~3) */
export function riskGrade(frequency: number, intensity: number): { score: number; grade: '상' | '중' | '하' } {
  const score = frequency * intensity
  return { score, grade: score >= 7 ? '상' : score >= 4 ? '중' : '하' }
}

/** POST /api/ai/risk-assessment 요청 — Gemini에 선별·판정 위임 */
export interface RiskAiRequest {
  projectId: string
  trigger: string           // 수시평가 사유 (작업 변경 내용, 재해 발생 등 자유 텍스트)
  hazards: RiskHazard[]     // 선택된 세부단위작업의 DB 원문 위험요인들
  siteContext?: string      // 현장 부가 정보 (장비·인원 등)
}

/** POST /api/ai/risk-assessment 응답 — LLM은 선별·판정만, 텍스트는 DB 원문 참조 */
export interface RiskAiJudgement {
  hazardId: number
  selected: boolean         // 이번 수시평가에 포함할지
  frequency: number         // 1~3
  intensity: number         // 1~3 (SIF·중대재해 플래그는 상향 근거)
  equipment: string         // 사용장비/설비/인원 제안
  reason: string            // 판정 근거 한 줄
}

export interface RiskAiResponse {
  success: boolean
  data?: RiskAiJudgement[]
  error?: string
}

/** risk_assessments 테이블에 저장되는 평가서 1건 */
export interface RiskAssessment {
  id: string
  projectId: string
  assessmentType: '수시'    // 추후 최초·정기 확장 여지
  title: string
  businessType: string | null  // 확정 사업별 (전체 모드면 null)
  trigger: string              // 수시평가 사유
  authorName: string
  managePeriodStart: string | null  // YYYY-MM-DD
  managePeriodEnd: string | null
  rows: RiskAssessmentRow[]        // JSONB
  signatures: RiskAssessmentSignatures  // JSONB
  createdBy: string
  createdAt: string
  updatedAt: string
}

/** 결재란 서명 (dataURL, 미서명은 null) — 공사/안전/현장소장 + 점검(공사감독) */
export interface RiskAssessmentSignatures {
  construction?: string | null  // 공사 (작성자)
  safety?: string | null        // 안전
  siteManager?: string | null   // 현장소장
  supervisor?: string | null    // 공사감독 (점검)
}

/** 엑셀 출력 입력 — src/lib/excel/risk-assessment-export.ts 의 exportRiskAssessmentExcel() 인자 */
export interface RiskAssessmentExportData {
  siteName: string          // 현장명
  writtenDate: string       // 작성일 (YYYY.MM.DD)
  authorName: string        // 작성자
  managePeriod: string      // 관리기간 표기 (예: 26.07.27~26.08.02(7일간))
  rows: RiskAssessmentRow[]
  signatures?: RiskAssessmentSignatures
}
