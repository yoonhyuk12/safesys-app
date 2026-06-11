// 검사/검측 대장 - 검측요청서 타입 정의
// 원본 서식: 별지 제3호(검측대장), 별지 제4호(검측요청서/검측결과통보)

export type PassStatus = '' | '합격' | '불합격'

export interface InspectionRequestFormData {
  // 검측요청서 (별지 제4호)
  request_no: string // 요청 번호
  request_date: string | null // 요청 일자 (YYYY-MM-DD)
  location_and_type: string // 위치 및 공종
  inspection_part: string // 검측 부위
  requested_datetime: string // 검측 요구 일자 (YYYY-MM-DD)
  inspection_items: string // 검측 사항
  field_agent_name: string // 현장대리인
  field_agent_signature: string // 현장대리인 서명 (base64 이미지)
  is_reinspection: boolean // 재검측 여부

  // 검측대장 (별지 제3호) 항목
  work_type: string // 공종
  structure_name: string // 구조물명
  design_spec: string // 설계규격
  unit: string // 단위
  quantity: string // 수량

  // 검측결과통보 (별지 제4호 하단)
  result_no: string // 통보 번호
  result_date: string | null // 통보 일자 (YYYY-MM-DD)
  inspector_name: string // 검측자
  inspector_signature: string // 검측자 서명 (base64 이미지)
  pass_status: PassStatus // 합격여부
  result_content: string // 검측결과
  instructions: string // 지시사항
  supervisor_name: string // 공사감독원
  supervisor_signature: string // 공사감독원 서명 (base64 이미지)

  remarks: string
}

export interface InspectionRequestRecord extends InspectionRequestFormData {
  id: string
  project_id: string
  created_by: string | null
  created_at: string
  updated_at: string
}

export const createEmptyInspectionRequest = (
  defaults: Partial<InspectionRequestFormData> = {}
): InspectionRequestFormData => ({
  request_no: '',
  request_date: new Date().toISOString().split('T')[0],
  location_and_type: '',
  inspection_part: '',
  requested_datetime: new Date().toISOString().split('T')[0],
  inspection_items: '',
  field_agent_name: '',
  field_agent_signature: '',
  is_reinspection: false,
  work_type: '',
  structure_name: '',
  design_spec: '',
  unit: '',
  quantity: '',
  result_no: '',
  result_date: new Date().toISOString().split('T')[0],
  inspector_name: '',
  inspector_signature: '',
  pass_status: '합격',
  result_content: '설계 도면대로 시공함',
  instructions: '',
  supervisor_name: '',
  supervisor_signature: '',
  remarks: '',
  ...defaults,
})

// 검측대장 "검측결과 또는 입증자료" 칸: 검측결과통보 번호 및 날짜를 작성
export const buildResultEvidence = (record: InspectionRequestFormData): string => {
  const parts = [record.result_no, record.result_date].filter(Boolean) as string[]
  if (parts.length > 0) return `검측결과통보 ${parts.join(' / ')}`
  return record.result_content || ''
}
