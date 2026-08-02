// 관리자 목록의 공용 정렬 규칙과 열 값 매핑을 검증하는 테스트
import { expect, test } from '@playwright/test'
import { nextSortState, sortRows, type SortState } from '../src/lib/admin-sort'
import {
  getAdminProjectSortValue,
  getAdminUserSortValue,
} from '../src/lib/admin-list-sort'

test('같은 열은 없음, 오름차순, 내림차순, 없음 순으로 순환한다', () => {
  const initial: SortState<'name'> = { key: null, direction: null }
  const ascending = nextSortState(initial, 'name')
  const descending = nextSortState(ascending, 'name')
  const cleared = nextSortState(descending, 'name')

  expect(ascending).toEqual({ key: 'name', direction: 'asc' })
  expect(descending).toEqual({ key: 'name', direction: 'desc' })
  expect(cleared).toEqual(initial)
})

test('다른 열을 선택하면 오름차순으로 전환한다', () => {
  expect(nextSortState({ key: 'name', direction: 'desc' }, 'email')).toEqual({
    key: 'email',
    direction: 'asc',
  })
})

test('빈 값은 양 방향에서 마지막이고 동일 값은 원본 순서를 유지한다', () => {
  const rows = [
    { id: 'b', value: 2 },
    { id: 'same-1', value: 1 },
    { id: 'empty', value: null },
    { id: 'same-2', value: 1 },
  ]

  expect(sortRows(rows, { key: 'value', direction: 'asc' }, (row) => row.value).map((row) => row.id))
    .toEqual(['same-1', 'same-2', 'b', 'empty'])
  expect(sortRows(rows, { key: 'value', direction: 'desc' }, (row) => row.value).map((row) => row.id))
    .toEqual(['b', 'same-1', 'same-2', 'empty'])
})

test('한국어 문자열은 숫자를 포함해 자연스러운 순서로 정렬한다', () => {
  const rows = [{ name: '현장10' }, { name: '가설공사' }, { name: '현장2' }]
  expect(sortRows(rows, { key: 'name', direction: 'asc' }, (row) => row.name).map((row) => row.name))
    .toEqual(['가설공사', '현장2', '현장10'])
})

test('필터링된 전체 결과를 정렬한 뒤 페이지를 나눈다', () => {
  const rows = [
    { id: 'older', active: true, createdAt: 1 },
    { id: 'newer', active: true, createdAt: 3 },
    { id: 'inactive', active: false, createdAt: 4 },
    { id: 'middle', active: true, createdAt: 2 },
  ]
  const filtered = rows.filter((row) => row.active)
  const sorted = sortRows(filtered, { key: 'createdAt', direction: 'desc' }, (row) => row.createdAt)
  expect(sorted.slice(0, 2).map((row) => row.id)).toEqual(['newer', 'middle'])
})

test('가입자 열을 한국어 문자열, 날짜, 인증 상태 값으로 변환한다', () => {
  const user = {
    full_name: '김현우',
    email: 'kim@example.com',
    role: '발주청',
    hq_division: '경기본부',
    branch_division: '수원지사',
    company_name: '한국안전건설',
    position: '안전관리자',
    created_at: '2026-08-01T00:00:00.000Z',
    last_sign_in_at: null,
    email_confirmed_at: '2026-08-02T00:00:00.000Z',
  }

  expect(getAdminUserSortValue(user, 'organization')).toBe('경기본부 수원지사')
  expect(getAdminUserSortValue(user, 'createdAt')).toBe(Date.parse(user.created_at))
  expect(getAdminUserSortValue(user, 'lastSignInAt')).toBeNull()
  expect(getAdminUserSortValue(user, 'confirmed')).toBe(true)
})

test('프로젝트 열을 등록자, 날짜, 활성 상태 값으로 변환한다', () => {
  const project = {
    project_name: '광역철도 제2공구',
    managing_hq: '경기본부',
    managing_branch: '수원지사',
    created_at: '2026-07-28T00:00:00.000Z',
    isActive: false,
    creator: { fullName: '김현우', companyName: '한국안전건설' },
  }

  expect(getAdminProjectSortValue(project, 'creator')).toBe('김현우 한국안전건설')
  expect(getAdminProjectSortValue(project, 'createdAt')).toBe(Date.parse(project.created_at))
  expect(getAdminProjectSortValue(project, 'status')).toBe(false)
})
