// CSI 등록일 조회 기간을 오늘 기준으로 계산하고 날짜 쌍을 검증한다.
export interface CsiDateRange {
  startDate: string
  endDate: string
}

const localDateValue = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

export const getCsiDateRange = (months: number, today = new Date()): CsiDateRange => {
  const start = new Date(today.getFullYear(), today.getMonth() - months, 1)
  const lastDay = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate()
  start.setDate(Math.min(today.getDate(), lastDay))
  return { startDate: localDateValue(start), endDate: localDateValue(today) }
}

const isDateValue = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export const isCsiDateRange = (startDate: unknown, endDate: unknown): boolean =>
  isDateValue(startDate) && isDateValue(endDate) && startDate <= endDate
