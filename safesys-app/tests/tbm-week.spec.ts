// TBM 안전활동점검 현황의 주 단위 날짜 계산 유틸을 검증하는 테스트
import { expect, test } from '@playwright/test'
import {
  getTodayDateString,
  getWeekDays,
  getWeekRangeLabel,
  normalizeTbmDate,
  shiftWeek,
} from '../src/lib/tbm-week'

test('주 중간 날짜를 주면 그 주의 일요일부터 토요일까지 7일을 돌려준다', () => {
  const days = getWeekDays('2026-08-13')

  expect(days.map((day) => day.date)).toEqual([
    '2026-08-09',
    '2026-08-10',
    '2026-08-11',
    '2026-08-12',
    '2026-08-13',
    '2026-08-14',
    '2026-08-15',
  ])
  expect(days.map((day) => day.weekdayLabel)).toEqual(['일', '월', '화', '수', '목', '금', '토'])
  expect(days.map((day) => day.dateLabel)).toEqual([
    '8/9',
    '8/10',
    '8/11',
    '8/12',
    '8/13',
    '8/14',
    '8/15',
  ])
})

test('일요일을 주면 그 날이 주의 첫날이고 전주로 밀리지 않는다', () => {
  const days = getWeekDays('2026-08-09')

  expect(days[0].date).toBe('2026-08-09')
  expect(days[0].isSunday).toBe(true)
  expect(days[6].date).toBe('2026-08-15')
})

test('토요일을 주면 같은 주를 돌려준다', () => {
  const days = getWeekDays('2026-08-15')

  expect(days[0].date).toBe('2026-08-09')
  expect(days[6].date).toBe('2026-08-15')
  expect(days[6].isSaturday).toBe(true)
})

test('월 경계에서도 전월 일요일부터 주가 시작한다', () => {
  const days = getWeekDays('2026-09-01')

  expect(days[0].date).toBe('2026-08-30')
  expect(days[6].date).toBe('2026-09-05')
  expect(days[2].date).toBe('2026-09-01')
})

test('연 경계 주는 전년 12월 날짜를 포함한다', () => {
  const days = getWeekDays('2027-01-01')

  expect(days[0].date).toBe('2026-12-27')
  expect(days[6].date).toBe('2027-01-02')
  expect(days.filter((day) => day.date.startsWith('2026-12')).length).toBe(5)
})

test('주 이동은 앵커 날짜를 7일 단위로 옮긴다', () => {
  expect(shiftWeek('2026-08-13', -1)).toBe('2026-08-06')
  expect(shiftWeek('2026-08-13', 1)).toBe('2026-08-20')
  expect(shiftWeek('2026-08-13', 0)).toBe('2026-08-13')
})

test('주 이동은 월·연 경계를 넘어도 정확한 날짜를 만든다', () => {
  expect(shiftWeek('2026-09-01', -1)).toBe('2026-08-25')
  expect(shiftWeek('2027-01-01', -1)).toBe('2026-12-25')
})

test('tbm_date를 타임존 왜곡 없이 YYYY-MM-DD로 정규화한다', () => {
  expect(normalizeTbmDate('2026-08-13')).toBe('2026-08-13')
  expect(normalizeTbmDate('2026-08-13T00:00:00Z')).toBe('2026-08-13')
  expect(normalizeTbmDate('2026-08-13T23:30:00+09:00')).toBe('2026-08-13')
  expect(normalizeTbmDate(null)).toBeNull()
  expect(normalizeTbmDate(undefined)).toBeNull()
  expect(normalizeTbmDate('')).toBeNull()
  expect(normalizeTbmDate('abc')).toBeNull()
})

test('주 범위 라벨은 연월일과 요일을 함께 보여준다', () => {
  expect(getWeekRangeLabel('2026-08-13')).toBe('2026.08.09(일) ~ 08.15(토)')
  expect(getWeekRangeLabel('2026-09-01')).toBe('2026.08.30(일) ~ 09.05(토)')
})

test('잘못된 앵커는 오늘이 속한 주로 폴백한다', () => {
  const today = getTodayDateString()

  expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  expect(getWeekDays('abc').map((day) => day.date)).toEqual(getWeekDays(today).map((day) => day.date))
  expect(getWeekDays('').map((day) => day.date)).toContain(today)
})
