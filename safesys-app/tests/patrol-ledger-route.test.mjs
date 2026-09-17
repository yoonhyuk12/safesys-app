// 순회점검 AI 인증·프로젝트 권한·모델 요청과 응답 무결성을 검증한다.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

process.env.OPENAI_API_KEY = 'test-key'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
const projectId = '11111111-2222-4333-8444-000000000001'
const body = { projectId, inspectionDate: '2026-09-17' }
const items = () => Array.from({ length: 10 }, (_, i) => ({ category: i < 5 ? '작업장 공통' : '테마', text: `작업장 안전통로 ${i + 1}의 확보 상태는 양호한가` }))
const request = (value = body, token = 'token') => ({ headers: { get: () => token ? `Bearer ${token}` : null }, text: async () => JSON.stringify(value) })
async function load({ project = { id: projectId, project_name: '사업' }, summary = '철근 배근', result = items(), finish = 'stop', fetchImpl } = {}) {
  const calls = []; const clients = []; const tbmCalls = []
  const source = await readFile(new URL('../src/app/api/ai/patrol-ledger/route.ts', import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
  const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: project, error: null }) }
  const dependencies = {
    'next/server': { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } },
    '@supabase/supabase-js': { createClient: (...args) => { clients.push(args); return { from: () => chain } } },
    '@/lib/supabase-admin': { supabaseAdmin: { auth: { getUser: async () => ({ data: { user: { id: 'u' } }, error: null }) } } },
    '@/lib/ai-usage-log': { recordAiUsage: () => {} },
    '@/lib/patrol-ledger/tbm-work': { loadTbmWorkForDate: async (...args) => { tbmCalls.push(args); return { summary, count: summary ? 1 : 0 } } },
  }
  globalThis.fetch = async (url, init) => {
    calls.push(JSON.parse(init.body))
    if (fetchImpl) await fetchImpl()
    return { ok: true, json: async () => ({ choices: [{ finish_reason: finish, message: { content: JSON.stringify({ items: result }) } }] }) }
  }
  const module = { exports: {} }
  new Function('module', 'exports', 'require', outputText)(module, module.exports, name => { assert.ok(name in dependencies, name); return dependencies[name] })
  return { ...module.exports, calls, clients, tbmCalls }
}
test('토큰 누락은 401', async () => { const r = await load(); assert.equal((await r.POST(request(body, null))).status, 401) })
test('잘못된 요청·실재하지 않는 날짜·긴 직접입력은 400', async () => {
  const r = await load()
  for (const value of [null, {}, { ...body, projectId: 'bad' }, { ...body, inspectionDate: '2026-02-30' }, { ...body, workDescription: '가'.repeat(2001) }]) assert.equal((await r.POST(request(value))).status, 400)
})
test('프로젝트가 보이지 않으면 404', async () => { const r = await load({ project: null }); assert.equal((await r.POST(request())).status, 404); assert.equal(r.calls.length, 0) })
test('TBM 작업도 직접입력도 없으면 404', async () => { const r = await load({ summary: '' }); assert.equal((await r.POST(request())).status, 404) })
test('정상 요청은 사용자 토큰 클라이언트와 고정 모델·strict schema를 사용한다', async () => {
  const r = await load(); const response = await r.POST(request())
  assert.equal(response.status, 200); assert.equal(response.body.items.length, 10); assert.equal(response.body.tbmCount, 1)
  assert.equal(r.clients[0][2].global.headers.Authorization, 'Bearer token')
  const payload = r.calls[0]
  assert.equal(payload.model, 'gpt-5.6-luna'); assert.equal(payload.reasoning_effort, 'low'); assert.equal(payload.max_completion_tokens, 6000)
  assert.equal(payload.response_format.type, 'json_schema'); assert.equal(payload.response_format.json_schema.strict, true)
  assert.match(payload.messages[1].content, /철근 배근/)
})
test('직접입력은 TBM 조회를 건너뛰고 건수 0을 반환한다', async () => {
  const r = await load({ summary: '' }); const response = await r.POST(request({ ...body, workDescription: '  거푸집 설치  ' }))
  assert.equal(response.status, 200); assert.equal(response.body.workSummary, '거푸집 설치'); assert.equal(response.body.tbmCount, 0); assert.equal(r.tbmCalls.length, 0)
})
test('9건·분류 순서 오류·빈 문구·응답 잘림은 502', async () => {
  for (const options of [{ result: items().slice(1) }, { result: items().reverse() }, { result: items().map(x => ({ ...x, text: '' })) }, { finish: 'length' }, { finish: undefined, result: [] }]) {
    const r = await load(options); assert.equal((await r.POST(request())).status, 502)
  }
})
test('사용자당 동시 요청은 1건이며 완료 후 슬롯을 반환한다', async () => {
  let release; const gate = new Promise(resolve => { release = resolve })
  const r = await load({ fetchImpl: () => gate })
  const first = r.POST(request()); await new Promise(resolve => setImmediate(resolve))
  assert.equal((await r.POST(request())).status, 429)
  release(); assert.equal((await first).status, 200); assert.equal((await r.POST(request())).status, 200)
})
test('프로젝트 삭제는 순회점검 사진과 기존 현장 폴더 사진을 함께 정리한다', async () => {
  const removed = []
  const queried = []
  const photoPath = `patrol-ledger/${projectId}/123_photo.jpg`
  const admin = {
    auth: { getUser: async () => ({ data: { user: { id: 'u' } }, error: null }) },
    from(table) {
      queried.push(table)
      const data = table === 'projects' ? { id: projectId, created_by: 'u' }
        : table === 'user_profiles' ? { role: '시공사' }
        : table === 'patrol_ledger_inspections' ? [{ finding_photo_url: `https://example.com/storage/v1/object/public/safety-inspection-photos/${photoPath}` }] : []
      const chain = { select: () => chain, eq: () => chain, delete: () => chain, single: async () => ({ data, error: null }), then: resolve => resolve({ data, error: null }) }
      return chain
    },
    storage: { from: bucket => ({ list: async () => ({ data: [{ name: 'legacy.jpg' }] }), remove: async paths => { removed.push({ bucket, paths }); return { error: null } } }) },
  }
  const source = await readFile(new URL('../src/app/api/projects/[id]/delete/route.ts', import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
  const dependencies = { 'next/server': { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } }, '@/lib/supabase-admin': { supabaseAdmin: admin } }
  const module = { exports: {} }
  new Function('module', 'exports', 'require', outputText)(module, module.exports, name => dependencies[name])
  const response = await module.exports.POST(request(), { params: Promise.resolve({ id: projectId }) })
  assert.equal(response.status, 200)
  assert.ok(queried.includes('patrol_ledger_inspections'))
  assert.deepEqual(removed, [{ bucket: 'safety-inspection-photos', paths: [photoPath, `${projectId}/legacy.jpg`] }])
})
