// 관리자 로그아웃의 성공 이동과 실패 차단을 검증한다
import { expect, test } from '@playwright/test'
import { performAdminSignOut } from '../src/lib/admin-session'

test('로그아웃 성공 후 로그인 화면으로 이동한다', async () => {
  const redirects: string[] = []
  await performAdminSignOut(async () => ({ error: null }), (path) => redirects.push(path))
  expect(redirects).toEqual(['/login'])
})

test('로그아웃 실패 시 이동하지 않고 오류를 전달한다', async () => {
  const redirects: string[] = []
  await expect(performAdminSignOut(
    async () => ({ error: new Error('network') }),
    (path) => redirects.push(path)
  )).rejects.toThrow('network')
  expect(redirects).toEqual([])
})
