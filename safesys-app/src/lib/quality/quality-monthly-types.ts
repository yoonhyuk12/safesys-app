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
  nextMonthPlan: string // 다음월 시공계획 물량
  nextMonthPlanCount: string // 다음월 시공계획 횟수
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

export interface QualityMonthlyTestActualSource {
  id: string
  serial_no: number | null
  test_date: string | null
  test_category: string
  work_type: string
  test_item: string
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
    nextMonthPlanCount: '',
  }
}

type QualityMonthlyActualField =
  | 'monthQualityTest'
  | 'monthExpertConfirm'
  | 'monthOtherConfirm'
  | 'prevCumulQualityTest'
  | 'prevCumulExpertConfirm'
  | 'prevCumulOtherConfirm'

const QUALITY_MONTHLY_ACTUAL_FIELDS: QualityMonthlyActualField[] = [
  'monthQualityTest',
  'monthExpertConfirm',
  'monthOtherConfirm',
  'prevCumulQualityTest',
  'prevCumulExpertConfirm',
  'prevCumulOtherConfirm',
]

const normalizeActualLabel = (value: string): string => value.trim().replace(/\s+/g, ' ')

const actualRowKey = (workType: string, testItem: string): string =>
  JSON.stringify([normalizeActualLabel(workType), normalizeActualLabel(testItem)])

const isEmptyReportRow = (row: QualityMonthlyReportRow): boolean =>
  Object.values(row).every((value) => value.trim() === '')

const actualFieldFor = (
  testCategory: string,
  isReportMonth: boolean
): QualityMonthlyActualField => {
  if (testCategory === '의뢰(수탁)시험') {
    return isReportMonth ? 'monthExpertConfirm' : 'prevCumulExpertConfirm'
  }
  if (testCategory === '확인시험') {
    return isReportMonth ? 'monthOtherConfirm' : 'prevCumulOtherConfirm'
  }
  return isReportMonth ? 'monthQualityTest' : 'prevCumulQualityTest'
}

// 실시대장의 일련번호를 기준으로 보고 연월의 시험실적 6개 필드를 새로 집계한다.
export function applyQualityTestActuals(
  rows: QualityMonthlyReportRow[],
  records: QualityMonthlyTestActualSource[],
  reportYear: number,
  reportMonth: number
): QualityMonthlyReportRow[] {
  const monthStart = `${reportYear}-${String(reportMonth).padStart(2, '0')}-01`
  const nextMonthYear = reportMonth === 12 ? reportYear + 1 : reportYear
  const nextMonth = reportMonth === 12 ? 1 : reportMonth + 1
  const nextMonthStart = `${nextMonthYear}-${String(nextMonth).padStart(2, '0')}-01`
  const tallies = new Map<string, Map<QualityMonthlyActualField, Set<string>>>()
  const sourceLabels = new Map<string, { workType: string; testItem: string }>()

  records.forEach((record) => {
    const testDate = record.test_date?.slice(0, 10)
    if (!testDate || testDate >= nextMonthStart) return

    const key = actualRowKey(record.work_type, record.test_item)
    const field = actualFieldFor(record.test_category, testDate >= monthStart)
    const serialKey = record.serial_no === null ? `record:${record.id}` : `serial:${record.serial_no}`
    const rowTally = tallies.get(key) ?? new Map<QualityMonthlyActualField, Set<string>>()
    const serials = rowTally.get(field) ?? new Set<string>()
    serials.add(serialKey)
    rowTally.set(field, serials)
    tallies.set(key, rowTally)
    if (!sourceLabels.has(key)) {
      sourceLabels.set(key, {
        workType: normalizeActualLabel(record.work_type),
        testItem: normalizeActualLabel(record.test_item),
      })
    }
  })

  const applyTally = (row: QualityMonthlyReportRow): QualityMonthlyReportRow => {
    const tally = tallies.get(actualRowKey(row.workType, row.testItem))
    return QUALITY_MONTHLY_ACTUAL_FIELDS.reduce(
      (nextRow, field) => {
        const count = tally?.get(field)?.size ?? 0
        return { ...nextRow, [field]: count ? String(count) : '' }
      },
      { ...row }
    )
  }

  const existingKeys = new Set(rows.map((row) => actualRowKey(row.workType, row.testItem)))
  const appendedRows = Array.from(sourceLabels.entries())
    .filter(([key]) => !existingKeys.has(key))
    .map(([, labels]) => applyTally({
      ...createEmptyRow(),
      workType: labels.workType,
      testItem: labels.testItem,
    }))

  const mergedRows = [...rows.map(applyTally), ...appendedRows]
  return mergedRows.length > 1 && isEmptyReportRow(mergedRows[0])
    ? mergedRows.slice(1)
    : mergedRows
}

// "1,200㎥" 같은 단위 포함 입력에서 앞쪽 숫자만 추출. 숫자가 없으면 null.
export function parseNum(value: string): number | null {
  const cleaned = (value || '').replace(/,/g, '').trim()
  const match = cleaned.match(/^-?\d+(\.\d+)?/)
  if (!match) return null
  const n = parseFloat(match[0])
  return Number.isFinite(n) ? n : null
}

// "684㎥" 같은 값에서 숫자 뒤에 붙은 단위 문자열 추출 ("㎥"). 숫자 없이 단위만 있으면 그대로 반환.
export function extractUnit(value: string): string {
  const cleaned = (value || '').replace(/,/g, '').trim()
  return cleaned.replace(/^-?\d*(?:\.\d+)?\s*/, '')
}

// 입력값의 숫자 부분에 1,000단위 콤마 적용 ("1200㎥" → "1,200㎥"). 숫자로 시작하지 않으면 그대로.
export function formatThousands(value: string): string {
  const match = (value || '').match(/^(-?)([\d,]+)(\.\d*)?(.*)$/)
  if (!match) return value
  const digits = match[2].replace(/,/g, '')
  if (!digits) return value
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return match[1] + grouped + (match[3] || '') + match[4]
}

// 물량 값의 단위 부분만 교체 — 숫자 부분은 유지 ("684㎥" + "톤" → "684톤")
export function replaceUnit(value: string, unit: string): string {
  const match = (value || '').trim().match(/^(-?[\d,]*(?:\.\d+)?)\s*/)
  const numPart = match ? match[1] : ''
  return numPart + unit
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
  remainingCount: number | null
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
  // 시공잔량 횟수 = 년시공계획 횟수 - 금월까지 시험 계(①+②) 누계
  const yearlyPlanCount = parseNum(row.yearlyPlanCount)
  const remainingCount = yearlyPlanCount !== null && cumulTotal !== null ? yearlyPlanCount - cumulTotal : null
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
    remainingCount,
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

// 보고서를 연월 순으로 다시 연결해 나중에 입력된 앞선 월의 계획·누계를 기존 후속 월에도 반영한다.
export function reconcileQualityMonthlyReports(
  records: QualityMonthlyReportRecord[]
): QualityMonthlyReportRecord[] {
  const reconciledById = new Map<string, QualityMonthlyReportRecord>()
  const chronologicalRecords = [...records].sort(
    (a, b) => a.report_year - b.report_year || a.report_month - b.report_month
  )
  let previousRows: QualityMonthlyReportRow[] | null = null
  let previousReportYear: number | null = null

  chronologicalRecords.forEach((record) => {
    const currentRows = normalizeRows(record.report_rows)
    let reportRows = currentRows

    if (previousRows && previousReportYear === record.report_year) {
      const previousRowsByKey = new Map(
        previousRows
          .filter((row) => row.workType.trim() || row.testItem.trim())
          .map((row) => [actualRowKey(row.workType, row.testItem), row])
      )
      const currentKeys = new Set(
        currentRows.map((row) => actualRowKey(row.workType, row.testItem))
      )

      reportRows = currentRows.map((row) => {
        const previousRow = previousRowsByKey.get(actualRowKey(row.workType, row.testItem))
        if (!previousRow) return row

        const previousDerived = deriveRow(previousRow)
        return {
          ...row,
          yearlyPlan:
            parseNum(previousRow.yearlyPlan) !== null ? previousRow.yearlyPlan : row.yearlyPlan,
          yearlyPlanCount:
            parseNum(previousRow.yearlyPlanCount) !== null
              ? previousRow.yearlyPlanCount
              : row.yearlyPlanCount,
          prevCumulVolume:
            previousDerived.cumulVolume !== null ? String(previousDerived.cumulVolume) : '',
          prevCumulQualityTest:
            previousDerived.cumulQualityTest !== null ? String(previousDerived.cumulQualityTest) : '',
          prevCumulExpertConfirm:
            previousDerived.cumulExpertConfirm !== null ? String(previousDerived.cumulExpertConfirm) : '',
          prevCumulOtherConfirm:
            previousDerived.cumulOtherConfirm !== null ? String(previousDerived.cumulOtherConfirm) : '',
        }
      })

      const missingCarriedRows = carryOverRows(previousRows).filter(
        (row) => !currentKeys.has(actualRowKey(row.workType, row.testItem))
      )
      reportRows = [...reportRows, ...missingCarriedRows]
    }

    const reconciledRecord = { ...record, report_rows: reportRows }
    reconciledById.set(record.id, reconciledRecord)
    previousRows = reportRows
    previousReportYear = record.report_year
  })

  return records.map((record) => reconciledById.get(record.id) ?? record)
}

// DB JSONB 값 방어적 정규화 — 배열이 아니거나 필드가 빠져 있어도 안전한 행 배열로 변환
export function normalizeRows(value: unknown): QualityMonthlyReportRow[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => ({
    ...createEmptyRow(),
    ...(typeof item === 'object' && item !== null ? item : {}),
  }))
}
