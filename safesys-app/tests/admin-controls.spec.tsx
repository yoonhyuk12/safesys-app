// 관리자 정렬 컨트롤과 모바일 상세 목록의 접근성 마크업을 검증한다
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from '@playwright/test'
import { MobileSortControls, SortableHeader } from '../src/components/admin/AdminSortControls'
import { AdminMobileDisclosure } from '../src/components/admin/AdminMobileDisclosure'

test('활성 정렬 헤더는 aria-sort와 현재 방향을 표시한다', () => {
  const markup = renderToStaticMarkup(createElement('table', null,
    createElement('thead', null, createElement('tr', null,
      createElement(SortableHeader, {
        label: '이름', sortKey: 'name', sortState: { key: 'name', direction: 'asc' }, onSort: () => undefined,
      })
    ))
  ))
  expect(markup).toContain('aria-sort="ascending"')
  expect(markup).toContain('이름 오름차순 정렬 중')
})

test('모바일 정렬 컨트롤은 기본 순서와 모든 열을 제공한다', () => {
  const markup = renderToStaticMarkup(createElement(MobileSortControls, {
    options: [{ key: 'name', label: '이름' }, { key: 'email', label: '이메일' }],
    sortState: { key: null, direction: null },
    onChange: () => undefined,
  }))
  expect(markup).toContain('정렬 기준')
  expect(markup).toContain('기본 순서')
  expect(markup).toContain('이메일')
})

test('모바일 목록은 닫힘과 펼침 상태를 aria-expanded로 구분한다', () => {
  const collapsed = renderToStaticMarkup(createElement(AdminMobileDisclosure, {
    id: 'user-1', expanded: false, onToggle: () => undefined,
    summary: createElement('span', null, '김현우'),
    children: createElement('span', null, '경기본부'),
  }))
  const expanded = renderToStaticMarkup(createElement(AdminMobileDisclosure, {
    id: 'user-1', expanded: true, onToggle: () => undefined,
    summary: createElement('span', null, '김현우'),
    children: createElement('span', null, '경기본부'),
  }))

  expect(collapsed).toContain('aria-expanded="false"')
  expect(collapsed).not.toContain('경기본부')
  expect(expanded).toContain('aria-expanded="true"')
  expect(expanded).toContain('경기본부')
})
