// 단속·점검방문 일지 타입 정의 — 건설기술 진흥법 시행규칙 제48조, 별지 제9호 서식

// ⑥ 방문자 1인 (서명은 base64 이미지, 이름 특정 개인 서명이라 일괄서명 대상 아님)
export interface VisitorEntry {
  affiliation: string // 소속
  position: string // 직급
  name: string // 성명
  signature: string // 서명 (base64 이미지)
}

export interface InspectionVisitLogFormData {
  // ① 공사명 및 발주기관 등 (작성 시점 스냅샷)
  construction_name: string // 공사명
  site_location: string // 현장위치
  ordering_agency: string // 발주기관(건축주)
  construction_scale: string // 공사규모

  // ② 방문 일시
  visit_date: string | null // 방문 일자 (YYYY-MM-DD)
  visit_time_from: string // 시작 시각 (HH:MM)
  visit_time_to: string // 종료 시각 (HH:MM)

  // ③~⑤
  visit_basis_purpose: string // 방문 근거 및 목적
  work_content: string // 업무 수행내용
  instructions: string // 지시사항 또는 특기사항

  // ⑥ 방문자 (서식은 3명 칸, 초과분은 별지 취급 — 배열로 유연하게)
  visitors: VisitorEntry[]

  // ⑦ 공사감독원(책임건설사업관리기술자) 또는 현장 배치 건설기술자 확인
  confirmer_affiliation: string // 소속
  confirmer_position: string // 직책
  confirmer_name: string // 성명
  confirmer_signature: string // 서명 (base64 이미지)
}

export interface InspectionVisitLogRecord extends InspectionVisitLogFormData {
  id: string
  project_id: string
  created_by: string | null
  created_at: string
  updated_at: string
}

export const createEmptyVisitor = (): VisitorEntry => ({
  affiliation: '',
  position: '',
  name: '',
  signature: '',
})

// DB에서 불러온 방문자 배열(null·필드 누락 가능)을 정규화 — 최소 1명 보장
export const normalizeVisitors = (visitors: unknown): VisitorEntry[] => {
  const arr = Array.isArray(visitors) ? visitors : []
  const normalized = arr
    .filter((v): v is Partial<VisitorEntry> => !!v && typeof v === 'object')
    .map((v) => ({ ...createEmptyVisitor(), ...v }))
  return normalized.length > 0 ? normalized : [createEmptyVisitor()]
}

export const createEmptyInspectionVisitLog = (
  defaults: Partial<InspectionVisitLogFormData> = {}
): InspectionVisitLogFormData => ({
  construction_name: '',
  site_location: '',
  ordering_agency: '',
  construction_scale: '',
  visit_date: new Date().toISOString().split('T')[0],
  visit_time_from: '',
  visit_time_to: '',
  visit_basis_purpose: '',
  work_content: '',
  instructions: '',
  visitors: [createEmptyVisitor()],
  confirmer_affiliation: '',
  confirmer_position: '',
  confirmer_name: '',
  confirmer_signature: '',
  ...defaults,
})
