// TBM 안전활동점검 현황의 주 단위(일~토) 날짜 계산을 담당하는 순수 유틸
import { addDays, addWeeks, format, parseISO, startOfWeek } from 'date-fns'

export interface TbmWeekDay {
  date: string
  weekdayLabel: string
  dateLabel: string
  isSunday: boolean
  isSaturday: boolean
}

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}/

// tbm_date는 DATE 컬럼이라 'YYYY-MM-DD'로 온다. Date 경유 없이 앞 10자만 잘라 타임존 왜곡을 막는다.
export function normalizeTbmDate(value: string | null | undefined): string | null {
  if (!value) return null
  if (!ISO_DATE_PATTERN.test(value)) return null
  return value.slice(0, 10)
}

export function getTodayDateString(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

// 앵커 문자열을 로컬 Date로 바꾸고, 비었거나 파싱 불가면 오늘로 폴백한다.
function toAnchorDate(anchorDate: string): Date {
  const normalized = normalizeTbmDate(anchorDate)
  if (!normalized) return new Date()
  const parsed = parseISO(normalized)
  if (Number.isNaN(parsed.getTime())) return new Date()
  return parsed
}

function getWeekStart(anchorDate: string): Date {
  return startOfWeek(toAnchorDate(anchorDate), { weekStartsOn: 0 })
}

export function getWeekDays(anchorDate: string): TbmWeekDay[] {
  const weekStart = getWeekStart(anchorDate)
  return WEEKDAY_LABELS.map((weekdayLabel, index) => {
    const day = addDays(weekStart, index)
    return {
      date: format(day, 'yyyy-MM-dd'),
      weekdayLabel,
      dateLabel: format(day, 'M/d'),
      isSunday: index === 0,
      isSaturday: index === WEEKDAY_LABELS.length - 1
    }
  })
}

export function getWeekRangeLabel(anchorDate: string): string {
  const weekStart = getWeekStart(anchorDate)
  const weekEnd = addDays(weekStart, WEEKDAY_LABELS.length - 1)
  return `${format(weekStart, 'yyyy.MM.dd')}(일) ~ ${format(weekEnd, 'MM.dd')}(토)`
}

export function shiftWeek(anchorDate: string, delta: number): string {
  return format(addWeeks(toAnchorDate(anchorDate), delta), 'yyyy-MM-dd')
}
