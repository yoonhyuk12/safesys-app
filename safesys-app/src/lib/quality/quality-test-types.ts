// 품질시험 결과 관리대장 — 3종 양식(실시대장·성과총괄표·확인시험 의뢰서) 타입 정의와 집계 함수
// 원본 서식: 별지 제42호서식(품질검사 실시대장), 별지 2호(품질검사 성과 총괄표), 별지 제4호서식(확인시험 의뢰서)

export type TestVerdict = '' | '합격' | '불합격' | '재시험'

// 시험·검사구분 입력 제안값 — '확인시험'이면 총괄표 ⑤ 확인시험 실적으로 집계
export const TEST_CATEGORY_OPTIONS = ['자체(관리)시험', '의뢰(수탁)시험', '확인시험']
export const VERIFICATION_CATEGORY = '확인시험'

// ── 1) 품질검사 실시대장 (별지 제42호서식) — 대장 1행
export interface QualityTestRecordFormData {
  serial_no: number | null // 일련번호 — 한 제출건(여러 시험 항목)이 같은 번호를 공유
  test_date: string | null // 연월일 (YYYY-MM-DD)
  test_category: string // 시험·검사구분
  work_type: string // 공종 (총괄표 집계용 보조 필드)
  target_material: string // 품질검사 대상 재료
  supplier_factory: string // 건설자재·부재를 공급받은 공장
  test_place: string // 시험·검사 장소
  photo_url: string // 시험·검사 사진 (Storage URL, 일련번호당 1건, 사진대지 출력용)
  test_item: string // 시험·검사 종목
  test_standard: string // 시험 기준
  test_result: string // 시험 결과
  result_verdict: TestVerdict // 시험 결과 판정
  quality_engineer_name: string // 품질관리기술인 성명
  quality_engineer_signature: string // 품질관리기술인 서명 (base64)
  supervision_engineer_name: string // 건설사업관리기술인 성명
  supervision_engineer_signature: string // 건설사업관리기술인 서명 (base64)
  note: string // 비고
}

export interface QualityTestRecord extends QualityTestRecordFormData {
  id: string
  project_id: string
  created_by: string | null
  created_at: string
  updated_at: string
}

export const createEmptyQualityTestRecord = (
  defaults: Partial<QualityTestRecordFormData> = {}
): QualityTestRecordFormData => ({
  serial_no: null,
  test_date: new Date().toISOString().split('T')[0],
  test_category: '자체(관리)시험',
  work_type: '',
  target_material: '',
  supplier_factory: '',
  test_place: '',
  test_item: '',
  test_standard: '',
  test_result: '',
  result_verdict: '합격',
  quality_engineer_name: '',
  quality_engineer_signature: '',
  supervision_engineer_name: '',
  supervision_engineer_signature: '',
  photo_url: '',
  note: '',
  ...defaults,
})

// 한 제출건 안에서 여러 건 등록되는 항목별 필드 (시험·검사 종목 ~ 건설사업관리기술인 확인)
export interface QualityTestItemFields {
  test_item: string
  test_standard: string
  test_result: string
  result_verdict: TestVerdict
  quality_engineer_name: string
  quality_engineer_signature: string
  supervision_engineer_name: string
  supervision_engineer_signature: string
}

export const createEmptyQualityTestItem = (
  defaults: Partial<QualityTestItemFields> = {}
): QualityTestItemFields => ({
  test_item: '',
  test_standard: '',
  test_result: '',
  result_verdict: '합격',
  quality_engineer_name: '',
  quality_engineer_signature: '',
  supervision_engineer_name: '',
  supervision_engineer_signature: '',
  ...defaults,
})

// 한 제출건에서 항목들이 공유하는 필드 (연월일 ~ 시험·검사 장소, 비고)
export type QualityTestCommonFields = Omit<
  QualityTestRecordFormData,
  keyof QualityTestItemFields | 'serial_no'
>

export const createEmptyQualityTestCommon = (
  defaults: Partial<QualityTestCommonFields> = {}
): QualityTestCommonFields => ({
  test_date: new Date().toISOString().split('T')[0],
  test_category: '자체(관리)시험',
  work_type: '',
  target_material: '',
  supplier_factory: '',
  test_place: '',
  photo_url: '',
  note: '',
  ...defaults,
})

// ── 2) 확인시험 의뢰서 (별지 제4호서식)
export interface QualityVerificationRequestFormData {
  request_no: string // 의뢰번호
  request_date: string | null // 의뢰일자
  receiver: string // 받음
  sender: string // 보냄
  sender_signature: string // 보냄 서명 (base64)
  reference: string // 참조
  construction_name: string // 공사명
  client_name: string // 발주자
  contractor_name: string // 시공자
  target_work: string // 대상공종, 물량
  test_items: string // 확인시험 항목
  planned_date: string | null // 확인시험예정일
  purpose: string // 시험목적
  etc_note: string // 기타사항
}

export interface QualityVerificationRequestRecord extends QualityVerificationRequestFormData {
  id: string
  project_id: string
  created_by: string | null
  created_at: string
  updated_at: string
}

export const createEmptyVerificationRequest = (
  defaults: Partial<QualityVerificationRequestFormData> = {}
): QualityVerificationRequestFormData => ({
  request_no: '',
  request_date: new Date().toISOString().split('T')[0],
  receiver: '',
  sender: '',
  sender_signature: '',
  reference: '',
  construction_name: '',
  client_name: '',
  contractor_name: '',
  target_work: '',
  test_items: '',
  planned_date: null,
  purpose: '',
  etc_note: '',
  ...defaults,
})

// ── 3) 품질검사 성과 총괄표 (별지 2호)
// ③ 기성 또는 정산량 행 — 누계(전회+금회)는 저장하지 않고 계산
export interface SettlementRow {
  work_type: string // 공종
  plan_qty: string // 연도 계획량(㎥)
  prev_qty: string // 전회까지 시공량(㎥)
  current_qty: string // 금회 시공량(㎥)
  note: string // 비고
}

// ④ 품질검사 실적 행 — 횟수는 입력 편의상 문자열로 보관
export interface QualityPerformanceRow {
  work_type: string // 공종
  test_item: string // 시험·검사 종류(재료)
  plan: string // 계획
  done: string // 실시
  pass: string // 합격
  fail: string // 불합격
  retest: string // 재시험
  note: string // 비고
}

// ⑤ 확인시험 실적 행 — ④ + 확인시험구분
export interface VerificationPerformanceRow extends QualityPerformanceRow {
  verification_type: string // 확인시험구분 (제16조 구분)
}

export interface QualitySummaryFormData {
  report_date: string | null // 작성일시
  construction_period: string // 공사기간
  progress_rate: string // 공정 (%)
  settlement_rows: SettlementRow[]
  quality_rows: QualityPerformanceRow[]
  verification_rows: VerificationPerformanceRow[]
  writer_affiliation: string // 작성자(건설업자)
  writer_position: string
  writer_name: string
  writer_signature: string
  reviewer_affiliation: string // 검토자(품질시험업무담당자)
  reviewer_position: string
  reviewer_name: string
  reviewer_signature: string
  confirmer_affiliation: string // 확인자(감독소장)
  confirmer_position: string
  confirmer_name: string
  confirmer_signature: string
}

export interface QualitySummaryReport extends QualitySummaryFormData {
  id: string
  project_id: string
  created_by: string | null
  created_at: string
  updated_at: string
}

export const createEmptySettlementRow = (): SettlementRow => ({
  work_type: '',
  plan_qty: '',
  prev_qty: '',
  current_qty: '',
  note: '',
})

export const createEmptyQualityPerformanceRow = (): QualityPerformanceRow => ({
  work_type: '',
  test_item: '',
  plan: '',
  done: '',
  pass: '',
  fail: '',
  retest: '',
  note: '',
})

export const createEmptyVerificationPerformanceRow = (): VerificationPerformanceRow => ({
  ...createEmptyQualityPerformanceRow(),
  verification_type: '',
})

export const createEmptyQualitySummary = (
  defaults: Partial<QualitySummaryFormData> = {}
): QualitySummaryFormData => ({
  report_date: new Date().toISOString().split('T')[0],
  construction_period: '',
  progress_rate: '',
  settlement_rows: [createEmptySettlementRow()],
  quality_rows: [createEmptyQualityPerformanceRow()],
  verification_rows: [createEmptyVerificationPerformanceRow()],
  writer_affiliation: '',
  writer_position: '',
  writer_name: '',
  writer_signature: '',
  reviewer_affiliation: '',
  reviewer_position: '',
  reviewer_name: '',
  reviewer_signature: '',
  confirmer_affiliation: '',
  confirmer_position: '',
  confirmer_name: '',
  confirmer_signature: '',
  ...defaults,
})

// 기성량 누계 = 전회까지 + 금회 (둘 다 비어 있으면 빈 문자열)
export const settlementCumulative = (row: SettlementRow): string => {
  const prev = parseFloat(row.prev_qty)
  const current = parseFloat(row.current_qty)
  if (Number.isNaN(prev) && Number.isNaN(current)) return ''
  const sum = (Number.isNaN(prev) ? 0 : prev) + (Number.isNaN(current) ? 0 : current)
  return String(Math.round(sum * 1000) / 1000)
}

// 실시대장 레코드를 (공종, 시험·검사 종목) 단위로 집계해 총괄표 ④·⑤ 행을 만든다.
// 기존 행의 계획 횟수·비고·확인시험구분은 (공종, 종목)이 일치하면 보존한다.
export const aggregatePerformanceRows = (
  records: QualityTestRecord[],
  existingQualityRows: QualityPerformanceRow[] = [],
  existingVerificationRows: VerificationPerformanceRow[] = []
): { quality_rows: QualityPerformanceRow[]; verification_rows: VerificationPerformanceRow[] } => {
  interface Tally {
    done: number
    pass: number
    fail: number
    retest: number
  }
  // 키는 JSON 배열 문자열 — 공종·종목에 어떤 문자가 있어도 안전하게 복원 가능
  const tally = (recs: QualityTestRecord[]): Map<string, Tally> => {
    const map = new Map<string, Tally>()
    recs.forEach((rec) => {
      const key = JSON.stringify([rec.work_type, rec.test_item])
      const t = map.get(key) ?? { done: 0, pass: 0, fail: 0, retest: 0 }
      const next: Tally = {
        done: t.done + 1,
        pass: t.pass + (rec.result_verdict === '합격' ? 1 : 0),
        fail: t.fail + (rec.result_verdict === '불합격' ? 1 : 0),
        retest: t.retest + (rec.result_verdict === '재시험' ? 1 : 0),
      }
      map.set(key, next)
    })
    return map
  }

  const verificationRecords = records.filter((r) => r.test_category === VERIFICATION_CATEGORY)
  const qualityRecords = records.filter((r) => r.test_category !== VERIFICATION_CATEGORY)

  const buildRows = <T extends QualityPerformanceRow>(
    map: Map<string, Tally>,
    existing: T[],
    createEmpty: () => T
  ): T[] =>
    Array.from(map.entries()).map(([key, t]) => {
      const [work_type, test_item] = JSON.parse(key) as [string, string]
      const prev = existing.find((row) => row.work_type === work_type && row.test_item === test_item)
      return {
        ...createEmpty(),
        ...(prev ?? {}),
        work_type,
        test_item,
        done: String(t.done),
        pass: String(t.pass),
        fail: String(t.fail),
        retest: String(t.retest),
      }
    })

  return {
    quality_rows: buildRows(tally(qualityRecords), existingQualityRows, createEmptyQualityPerformanceRow),
    verification_rows: buildRows(
      tally(verificationRecords),
      existingVerificationRows,
      createEmptyVerificationPerformanceRow
    ),
  }
}
