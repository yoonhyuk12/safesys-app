// 서울 달력일과 변형 가능한 점검 JSON을 안전하게 처리하는 사고 분석 유틸리티
export const DAY_MS = 24 * 60 * 60 * 1000
export const BATCH_SIZE = 30

const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const NO_FINDING_KEYWORDS = new Set([
  '양호',
  '적정',
  '이상없음',
  '이상 없음',
  '지적없음',
  '지적 없음',
  '해당없음',
  '해당 없음',
  '해당사항 없음',
  '해당 사항 없음',
  '없음',
  '특이사항 없음',
  '특이사항없음',
])

export type UnknownRecord = Record<string, unknown>

export const parseCalendarDay = (value: string): number | null => {
  const match = DATE_PATTERN.exec(value.slice(0, 10))
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const timestamp = Date.UTC(year, month - 1, day)
  const parsed = new Date(timestamp)
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null
  }
  return timestamp
}

export const formatCalendarDay = (timestamp: number): string => new Date(timestamp).toISOString().slice(0, 10)

export const addCalendarDays = (value: string, days: number): string => {
  const timestamp = parseCalendarDay(value)
  if (timestamp === null) throw new Error('날짜 형식이 올바르지 않습니다.')
  return formatCalendarDay(timestamp + days * DAY_MS)
}

export const toInstantTimestamp = (value: string): number | null => {
  const dayTimestamp = parseCalendarDay(value)
  if (dayTimestamp === null) return null
  if (value.length <= 10) return dayTimestamp - SEOUL_OFFSET_MS

  const hasExplicitTimezone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(value)
  const timestamp = Date.parse(hasExplicitTimezone ? value : `${value}+09:00`)
  return Number.isFinite(timestamp) ? timestamp : null
}

export const toSeoulCalendarDay = (value: string): number | null => {
  if (!/(?:z|[+-]\d{2}:?\d{2})$/i.test(value)) return parseCalendarDay(value)
  const instant = toInstantTimestamp(value)
  if (instant === null) return null
  return parseCalendarDay(new Date(instant + SEOUL_OFFSET_MS).toISOString().slice(0, 10))
}

export const asRecord = (value: unknown): UnknownRecord | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as UnknownRecord
}

export const parseJsonValue = (value: unknown): unknown => {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (!trimmed || (!trimmed.startsWith('[') && !trimmed.startsWith('{'))) return value
  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    return value
  }
}

export const asArray = (value: unknown): unknown[] => {
  const parsed = parseJsonValue(value)
  return Array.isArray(parsed) ? parsed : []
}

export const textValue = (value: unknown): string => typeof value === 'string' ? value.trim() : ''

export const firstText = (...values: unknown[]): string => {
  for (const value of values) {
    const text = textValue(value)
    if (text) return text
  }
  return ''
}

export const isMeaningfulFindingText = (value: unknown): boolean => {
  const text = textValue(value)
  return text.length > 0 && !NO_FINDING_KEYWORDS.has(text)
}

export const compactSummary = (parts: string[]): string => {
  const unique = Array.from(new Set(parts.map((part) => part.trim()).filter(Boolean)))
  return unique.slice(0, 4).join(' · ') || '점검 내용 없음'
}
