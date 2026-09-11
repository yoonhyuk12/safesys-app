// CSI 자체 품질시험 API의 인증·입력 검증·세션 정리를 검증한다.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

let logins = 0
let logouts = 0
let failure = false
let projectSearch = ''
let dateRange
class CsiLoginError extends Error {}
class CsiParseError extends Error {}
class CsiSessionError extends Error {}
const dependencies = {
  'next/server': { NextResponse: { json: (body, init) => ({ body, status: init?.status || 200 }) } },
  '@/lib/supabase-admin': { supabaseAdmin: { auth: { getUser: async () => ({ data: { user: { id: 'example' } }, error: null }) } } },
  '@/lib/quality/csi-session': { CsiLoginError, loginCsi: async () => { logins++; return { cookie: 'example' } }, logoutCsi: async () => { logouts++ } },
  '@/lib/quality/csi-self-quality-scrape': { CsiParseError, CsiSessionError,
    fetchSelfQualityProjects: async (_cookie, search) => { projectSearch = search; if (failure) throw new CsiParseError('화면 오류'); return { rows: [], totalCount: 0, truncated: false } },
    fetchSelfQualityRows: async (_cookie, _bizMngNo, range) => { dateRange = range; return { rows: [], totalCount: 0, truncated: false } },
    fetchSelfQualityDetail: async () => { if (failure) throw new CsiParseError('화면 오류'); return { groupNo: '1' } },
  },
}
const rangeSource = await readFile(new URL('../src/lib/quality/csi-date-range.ts', import.meta.url), 'utf8')
const rangeModule = { exports: {} }
new Function('module', 'exports', ts.transpileModule(rangeSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(rangeModule, rangeModule.exports)
dependencies['@/lib/quality/csi-date-range'] = rangeModule.exports
async function load(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
  const module = { exports: {} }
  new Function('module', 'exports', 'require', outputText)(module, module.exports, (name) => dependencies[name])
  return module.exports.POST
}
const routes = await Promise.all(['../src/app/api/csi/self-quality/route.ts', '../src/app/api/csi/self-quality/detail/route.ts'].map(load))
const request = (body, token = 'Bearer example') => ({ headers: { get: () => token }, json: async () => body })
test('인증 없는 요청은 CSI에 로그인하지 않는다', async () => {
  logins = 0
  for (const route of routes) assert.equal((await route(request({}, ''))).status, 401)
  assert.equal(logins, 0)
})
test('null·배열·잘못된 타입의 입력은 400으로 거부한다', async () => {
  logins = 0
  for (const route of routes) for (const body of [null, [], { userId: {}, password: 'example' }, { userId: 'example', password: 1 }]) assert.equal((await route(request(body))).status, 400)
  assert.equal(logins, 0)
})
test('조회 성공과 실패 모두 CSI 세션을 정리한다', async () => {
  logins = 0
  logouts = 0
  for (const failed of [false, true]) {
    failure = failed
    for (const route of routes) {
      const result = await route(request({ userId: 'example', password: 'example', ...(route === routes[1] ? { bizMngNo: '1', groupNo: '1' } : {}) }))
      assert.equal(result.status, failed ? 502 : 200)
    }
  }
  assert.equal(logins, 4)
  assert.equal(logouts, 4)
})
test('사업 검색어의 타입·길이를 검증하고 정리한 검색어를 전달한다', async () => {
  failure = false
  logins = 0
  for (const search of [null, 1, {}, '가'.repeat(101)]) {
    assert.equal((await routes[0](request({ userId: 'example', password: 'example', projectSearch: search }))).status, 400)
  }
  assert.equal(logins, 0)
  assert.equal((await routes[0](request({ userId: 'example', password: 'example', projectSearch: ' 예시공사 ' }))).status, 200)
  assert.equal(projectSearch, '예시공사')
})
test('기간의 형식·달력·누락·역순 오류는 CSI 로그인 전에 거부한다', async () => {
  failure = false
  logins = 0
  for (const range of [
    { startDate: '2026-09-01' }, { endDate: '2026-09-11' },
    { startDate: '2026-02-30', endDate: '2026-09-11' },
    { startDate: '2026-09-12', endDate: '2026-09-11' },
    { startDate: '20260901', endDate: '2026-09-11' },
    { startDate: null, endDate: '2026-09-11' },
  ]) assert.equal((await routes[0](request({ userId: 'example', password: 'example', bizMngNo: '1', ...range }))).status, 400)
  assert.equal(logins, 0)
})
test('유효한 기간은 실적 조회에 전달하고 기간 없는 기존 요청도 허용한다', async () => {
  failure = false
  const range = { startDate: '2026-08-11', endDate: '2026-09-11' }
  assert.equal((await routes[0](request({ userId: 'example', password: 'example', bizMngNo: '1', ...range }))).status, 200)
  assert.deepEqual(dateRange, range)
  assert.equal((await routes[0](request({ userId: 'example', password: 'example', bizMngNo: '1' }))).status, 200)
  assert.equal(dateRange, undefined)
})
