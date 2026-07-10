// 품질시험 월례보고서(금월 품질시험실적 및 다음월 시공계획, 별지 제3호서식) 타입 정의와 파생값 계산 헬퍼

// 표 행 하나 — 공종/시험항목 단위. 소계·계·누계·시공잔량은 파생값이므로 저장하지 않는다.
export interface QualityMonthlyReportRow {
  workType: string // 공종
  testItem: string // 시험항목
  yearlyPlan: string // ( )년 시공계획 물량
  yearlyPlanCount: string // ( )년 시공계획 횟수
  monthVolume: string // 이번달 시공물량
  monthQualityTest: string // 이번달 품질시험① 회수
  monthExpertConfirm: string // 이번달 확인시험② 전문기관확인 회수
  monthOtherConfirm: string // 이번달 확인시험② 기타확인 회수
  prevCumulVolume: string // 전월까지 누계 시공물량
  prevCumulQualityTest: string // 전월까지 누계 품질시험 회수
  prevCumulExpertConfirm: string // 전월까지 누계 전문기관확인 회수
  prevCumulOtherConfirm: string // 전월까지 누계 기타확인 회수
  nextMonthPlan: string // 다음월 시공계획
}

export interface QualityMonthlyReportFormData {
  report_year: number
  report_month: number
  district_name: string
  author_name: string
  confirmer_name: string
  report_rows: QualityMonthlyReportRow[]
}

export interface QualityMonthlyReportRecord extends QualityMonthlyReportFormData {
  id: string
  project_id: string
  created_by: string | null
  created_at: string
  updated_at: string
}

export function createEmptyRow(): QualityMonthlyReportRow {
  return {
    workType: '',
    testItem: '',
    yearlyPlan: '',
    yearlyPlanCount: '',
    monthVolume: '',
    monthQualityTest: '',
    monthExpertConfirm: '',
    monthOtherConfirm: '',
    prevCumulVolume: '',
    prevCumulQualityTest: '',
    prevCumulExpertConfirm: '',
    prevCumulOtherConfirm: '',
    nextMonthPlan: '',
  }
}

// "1,200㎥" 같은 단위 포함 입력에서 앞쪽 숫자만 추출. 숫자가 없으면 null.
export function parseNum(value: string): number | null {
  const cleaned = (value || '').replace(/,/g, '').trim()
  const match = cleaned.match(/^-?\d+(\.\d+)?/)
  if (!match) return null
  const n = parseFloat(match[0])
  return Number.isFinite(n) ? n : null
}

// null 허용 합계 — 전부 null이면 null (빈 칸 유지용)
export function sumNums(...values: Array<number | null>): number | null {
  const nums = values.filter((v): v is number => v !== null)
  if (nums.length === 0) return null
  return nums.reduce((acc, v) => acc + v, 0)
}

export function formatNum(value: number | null): string {
  if (value === null) return ''
  return value.toLocaleString('ko-KR', { maximumFractionDigits: 2 })
}

// 행 파생값 묶음 — 계(①+②), 확인시험 소계, 누계, 시공잔량(년계획-누계물량)
export interface QualityMonthlyRowDerived {
  monthConfirmSubtotal: number | null
  monthTotal: number | null
  prevConfirmSubtotal: number | null
  prevTotal: number | null
  cumulVolume: number | null
  cumulQualityTest: number | null
  cumulExpertConfirm: number | null
  cumulOtherConfirm: number | null
  cumulConfirmSubtotal: number | null
  cumulTotal: number | null
  remaining: number | null
}

export function deriveRow(row: QualityMonthlyReportRow): QualityMonthlyRowDerived {
  const monthConfirmSubtotal = sumNums(parseNum(row.monthExpertConfirm), parseNum(row.monthOtherConfirm))
  const monthTotal = sumNums(parseNum(row.monthQualityTest), monthConfirmSubtotal)
  const prevConfirmSubtotal = sumNums(parseNum(row.prevCumulExpertConfirm), parseNum(row.prevCumulOtherConfirm))
  const prevTotal = sumNums(parseNum(row.prevCumulQualityTest), prevConfirmSubtotal)
  const cumulVolume = sumNums(parseNum(row.prevCumulVolume), parseNum(row.monthVolume))
  const cumulQualityTest = sumNums(parseNum(row.prevCumulQualityTest), parseNum(row.monthQualityTest))
  const cumulExpertConfirm = sumNums(parseNum(row.prevCumulExpertConfirm), parseNum(row.monthExpertConfirm))
  const cumulOtherConfirm = sumNums(parseNum(row.prevCumulOtherConfirm), parseNum(row.monthOtherConfirm))
  const cumulConfirmSubtotal = sumNums(cumulExpertConfirm, cumulOtherConfirm)
  const cumulTotal = sumNums(cumulQualityTest, cumulConfirmSubtotal)
  const yearlyPlan = parseNum(row.yearlyPlan)
  const remaining = yearlyPlan !== null && cumulVolume !== null ? yearlyPlan - cumulVolume : null
  return {
    monthConfirmSubtotal,
    monthTotal,
    prevConfirmSubtotal,
    prevTotal,
    cumulVolume,
    cumulQualityTest,
    cumulExpertConfirm,
    cumulOtherConfirm,
    cumulConfirmSubtotal,
    cumulTotal,
    remaining,
  }
}

// 직전 월 보고서 행 → 새 달 행 이월: 공종/시험항목/년계획 복사, 누계는 직전 누계로 채움
export function carryOverRows(prevRows: QualityMonthlyReportRow[]): QualityMonthlyReportRow[] {
  return prevRows.map((row) => {
    const derived = deriveRow(row)
    return {
      ...createEmptyRow(),
      workType: row.workType,
      testItem: row.testItem,
      yearlyPlan: row.yearlyPlan,
      yearlyPlanCount: row.yearlyPlanCount,
      prevCumulVolume: derived.cumulVolume !== null ? String(derived.cumulVolume) : '',
      prevCumulQualityTest: derived.cumulQualityTest !== null ? String(derived.cumulQualityTest) : '',
      prevCumulExpertConfirm: derived.cumulExpertConfirm !== null ? String(derived.cumulExpertConfirm) : '',
      prevCumulOtherConfirm: derived.cumulOtherConfirm !== null ? String(derived.cumulOtherConfirm) : '',
    }
  })
}

// DB JSONB 값 방어적 정규화 — 배열이 아니거나 필드가 빠져 있어도 안전한 행 배열로 변환
export function normalizeRows(value: unknown): QualityMonthlyReportRow[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => ({
    ...createEmptyRow(),
    ...(typeof item === 'object' && item !== null ? item : {}),
  }))
}
