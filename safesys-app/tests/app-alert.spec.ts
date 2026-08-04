// stripTelegramHtml의 태그 제거·링크 URL 보존·엔티티 복원을 검증한다
import { expect, test } from '@playwright/test'
import { stripTelegramHtml } from '../src/lib/app-alert'

test('링크 태그는 "텍스트 URL" 형태로 URL을 보존한다', () => {
  const input = '점검 결과 알림\n\n🔗 <a href="https://safesys.vercel.app/">AI안전관리 시스템 바로가기</a>'
  expect(stripTelegramHtml(input)).toBe(
    '점검 결과 알림\n\n🔗 AI안전관리 시스템 바로가기 https://safesys.vercel.app/'
  )
})

test('href 앞뒤에 다른 속성이 있어도 URL을 보존한다', () => {
  const input = '<a target="_blank" href="https://example.com/a?x=1" class="link">문서</a>'
  expect(stripTelegramHtml(input)).toBe('문서 https://example.com/a?x=1')
})

test('링크 외 태그는 제거되고 엔티티는 복원된다', () => {
  const input = '📋 <b>안전서류점검 결과</b>\n✅ 이행: 3건\n조건: A &lt; B &amp; C &gt; D'
  expect(stripTelegramHtml(input)).toBe('📋 안전서류점검 결과\n✅ 이행: 3건\n조건: A < B & C > D')
})

test('링크가 없는 메시지는 기존과 동일하게 동작한다', () => {
  const input = '🏗️ <b>현장:</b> 테스트 현장\n📅 <b>점검일자:</b> 2026-08-05'
  expect(stripTelegramHtml(input)).toBe('🏗️ 현장: 테스트 현장\n📅 점검일자: 2026-08-05')
})
