// 관리자 프로젝트 등록일을 월별 건수로 집계하고 정렬하는 유틸
export type MonthlySortMode = 'month' | 'count'

export interface MonthlyProjectCount {
  /** 'YYYY-MM' */
  month: string
  /** 막대 축 라벨. 'YY.MM' 형식 (예: '26.01') */
  label: string
  count: number
}

/** 로컬(KST) 기준 연·월을 하나의 정수 축으로 환산한다 */
function toMonthIndex(date: Date): number {
  return date.getFullYear() * 12 + date.getMonth()
}

function formatMonthKey(monthIndex: number): string {
  const year = Math.floor(monthIndex / 12)
  const month = (monthIndex % 12) + 1
  return `${year}-${String(month).padStart(2, '0')}`
}

function formatMonthLabel(monthIndex: number): string {
  const year = Math.floor(monthIndex / 12)
  const month = (monthIndex % 12) + 1
  return `${String(year % 100).padStart(2, '0')}.${String(month).padStart(2, '0')}`
}

export function buildMonthlyProjectCounts(createdAts: readonly string[]): MonthlyProjectCount[] {
  const countByMonth = new Map<number, number>()

  for (const value of createdAts) {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) continue
    const monthIndex = toMonthIndex(date)
    countByMonth.set(monthIndex, (countByMonth.get(monthIndex) ?? 0) + 1)
  }

  if (countByMonth.size === 0) return []

  const monthIndexes = Array.from(countByMonth.keys())
  const firstMonth = Math.min(...monthIndexes)
  const lastMonth = Math.max(...monthIndexes)

  const rows: MonthlyProjectCount[] = []
  for (let monthIndex = firstMonth; monthIndex <= lastMonth; monthIndex += 1) {
    rows.push({
      month: formatMonthKey(monthIndex),
      label: formatMonthLabel(monthIndex),
      count: countByMonth.get(monthIndex) ?? 0,
    })
  }

  return rows
}

export function sortMonthlyCounts(
  rows: readonly MonthlyProjectCount[],
  mode: MonthlySortMode
): MonthlyProjectCount[] {
  const sorted = [...rows]

  if (mode === 'count') {
    return sorted.sort((left, right) => right.count - left.count || left.month.localeCompare(right.month))
  }

  return sorted.sort((left, right) => left.month.localeCompare(right.month))
}
