// 특별점검 AI 조치의 인증·원본 접근·정확한 대응·다운로드 사본 불변성을 검증한다.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import test from 'node:test'
import ts from 'typescript'

const require = createRequire(import.meta.url)
async function load(name, overrides = {}, parent = new URL('../src/', import.meta.url)) {
  if (name in overrides) return overrides[name]
  if (!name.startsWith('.') && !name.startsWith('@/')) return require(name)
  const url = name.startsWith('@/') ? new URL(`../src/${name.slice(2)}.ts`, import.meta.url) : new URL(`${name}.ts`, parent)
  const source = await readFile(url, 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } })
  const deps = new Map()
  for (const [, dependency] of outputText.matchAll(/require\(["']([^"']+)["']\)/g)) {
    if (!deps.has(dependency)) deps.set(dependency, await load(dependency, overrides, url))
  }
  const module = { exports: {} }
  new Function('module', 'exports', 'require', outputText)(module, module.exports, name => deps.get(name))
  return module.exports
}
const helpers = await load('@/lib/special-inspection-770/ai-actions')
const { SPECIAL_770_TYPE } = await load('@/lib/safety-inspection-types')
const id = 'e2333261-63ce-457e-b4de-512aebe1b38f'
const makeData = () => ({ inspection_team: '', excavators: [{ id: 'e1', vehicle_no: '12가3456', items: {
  '1-1': { judgement: '부적정', finding: '위험성평가 실시 미흡', action: ' ', action_due_date: '2026-10-12' },
  '1-2': { judgement: '부적정', finding: '허가 미승인', action: ' 직접 쓴 조치 ' },
  '1-3': { judgement: '부적정', finding: ' ', action: '오래된 조치', action_due_date: '2026-10-11' },
  '1-4': { judgement: '부적정' },
} }] })
const action = '작업 전 위험성평가를 실시하고 위험요인 공유 예정'
const target = { excavatorId: 'e1', code: '1-1', finding: '위험성평가 실시 미흡' }
test('실제 지적만 대상이며 수기 조치·예정일·원본은 보존한다', async () => {
  const input = { inspectionId: id, data: makeData() }
  const original = structuredClone(input)
  assert.deepEqual(helpers.special770ActionTargets(input.data), [target])
  const output = await helpers.prepareSpecial770Actions(input, async inspectionId => {
    assert.equal(inspectionId, id)
    return [{ ...target, action }]
  })
  assert.deepEqual(input, original)
  assert.equal(output.data.excavators[0].items['1-1'].action, action)
  assert.equal(output.data.excavators[0].items['1-1'].action_due_date, '2026-10-12')
  assert.equal(output.data.excavators[0].items['1-2'].action, ' 직접 쓴 조치 ')
})
test('실제 지적이 없거나 모두 수기 조치가 있으면 ID·인증·AI를 요구하지 않는다', async () => {
  for (const data of [{ excavators: [] }, { excavators: [{ id: 'e', items: { '1-1': { judgement: '부적정' } } }] }, { excavators: [{ id: 'e', items: { '1-1': { judgement: '부적정', finding: '지적', action: '수기' } } }] }]) {
    const input = { data }
    assert.equal(await helpers.prepareSpecial770Actions(input, () => assert.fail('AI 호출 금지')), input)
  }
})
test('누락·추가·중복·알 수 없는 쌍·빈 문구·낡은 원본을 거절한다', () => {
  for (const rows of [[], [{ ...target, action }, { ...target, action }], [{ ...target, code: '9-9', action }], [{ ...target, action: '' }], [{ ...target, action, finding: '바뀐 지적' }]]) {
    assert.throws(() => helpers.validateSpecial770Actions(rows, [target], true))
  }
  assert.throws(() => helpers.validateSpecial770Actions([{ ...target, action }, { ...target, action }], [target, { ...target, code: '1-2' }]))
})
test('ID 누락과 AI 오류는 사본이나 원본의 부분 성공 없이 전파한다', async () => {
  const data = makeData()
  const original = structuredClone(data)
  await assert.rejects(helpers.prepareSpecial770Actions({ data }, async () => []), /ID/)
  await assert.rejects(helpers.prepareSpecial770Actions({ inspectionId: id, data }, async () => { throw new Error('AI 실패') }), /AI 실패/)
  assert.deepEqual(data, original)
})

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
process.env.OPENAI_API_KEY = 'fake-test-key'
async function routeHarness(options = {}) {
  const calls = [], usages = [], createCalls = []
  const inspection = { id, project_id: 'project', inspection_type: SPECIAL_770_TYPE, excavator_inspection: makeData(), ...options.inspection }
  const route = await load('@/app/api/ai/special-770-actions/route', {
    'next/server': { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } },
    '@supabase/supabase-js': { createClient: (...args) => {
      createCalls.push(args)
      return {
        auth: { getUser: async () => ({ data: { user: options.noUser ? null : { id: 'user' } } }) },
        from: table => {
          calls.push(table)
          const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({
            data: table === 'projects' ? options.noProject ? null : { id: 'project' } : options.missing ? null : inspection,
            error: options.dbError ? { code: 'failed' } : null,
          }) }
          return chain
        },
      }
    } },
    '@/lib/ai-usage-log': { recordAiUsage: value => usages.push(value) },
  })
  const request = (body = { inspectionId: id }, token = 'Bearer user-token') => route.POST({ headers: new Headers(token ? { authorization: token } : {}), text: async () => JSON.stringify(body) })
  return { request, calls, usages, createCalls }
}
const successResponse = rows => new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ results: rows }) } }] }))
test('API는 인증·점검 종류·존재·현장 접근 실패 시 AI를 호출하지 않는다', async t => {
  t.mock.method(globalThis, 'fetch', () => assert.fail('AI 호출 금지'))
  assert.equal((await (await routeHarness()).request({}, '')).status, 401)
  for (const [options, status] of [[{ noUser: true }, 401], [{ missing: true }, 404], [{ noProject: true }, 403], [{ inspection: { inspection_type: '우기' } }, 400], [{ dbError: true }, 500]]) {
    assert.equal((await (await routeHarness(options)).request()).status, status)
  }
  assert.equal((await (await routeHarness()).request({ inspectionId: 'bad' })).status, 400)
})
test('API는 JWT/RLS 원본만 사용하고 응답에 원본 지적을 포함한다', async t => {
  const h = await routeHarness()
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, 'https://api.openai.com/v1/chat/completions')
    const body = JSON.parse(init.body)
    assert.equal(body.model, 'gpt-6-luna')
    assert.equal(body.response_format.json_schema.strict, true)
    assert.deepEqual(JSON.parse(body.messages[1].content), [target])
    assert.ok(!init.body.includes('공격자 텍스트'))
    return successResponse([{ excavatorId: target.excavatorId, code: target.code, action }])
  })
  const response = await h.request({ inspectionId: id, finding: '공격자 텍스트' })
  assert.equal(response.status, 200)
  assert.deepEqual(response.body.results, [{ ...target, action }])
  assert.deepEqual(h.calls, ['safety_inspections', 'projects'])
  assert.equal(h.createCalls[0][1], 'anon-key')
  assert.equal(h.createCalls[0][2].global.headers.Authorization, 'Bearer user-token')
  assert.equal(h.usages[0].featureKey, 'ai.special-770-actions')
})
test('API의 빈 대상은 모델 키·호출 없이 빈 배열을 반환한다', async t => {
  t.mock.method(globalThis, 'fetch', () => assert.fail('AI 호출 금지'))
  const h = await routeHarness({ inspection: { excavator_inspection: { excavators: [] } } })
  assert.deepEqual((await h.request()).body, { success: true, results: [] })
})
test('API는 거절·잘림·빈 문구·누락·중복·다른 쌍·네트워크 실패를 명시한다', async t => {
  const responses = [
    { choices: [{ finish_reason: 'stop', message: { refusal: 'refused' } }] },
    { choices: [{ finish_reason: 'length', message: { content: '{}' } }] },
    ...[[], [{ ...target, action: '' }], [{ ...target, action }, { ...target, action }], [{ ...target, code: '2-2', action }]].map(results => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ results }) } }] })),
  ]
  for (const payload of responses) {
    const h = await routeHarness()
    t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(payload)))
    const response = await h.request()
    assert.equal(response.status, 502)
    assert.equal(response.body.results, undefined)
    assert.equal(h.usages[0].success, false)
  }
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('network') })
  assert.equal((await (await routeHarness()).request()).status, 502)
})
test('API는 20항목씩 순차 호출하며 두 번째 실패 시 전체 결과를 거절한다', async t => {
  const excavators = Array.from({ length: 21 }, (_, i) => ({ id: `e${i}`, items: { '1-1': { judgement: '부적정', finding: `지적 ${i}` } } }))
  let calls = 0
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    const batch = JSON.parse(JSON.parse(init.body).messages[1].content)
    assert.equal(batch.length, ++calls === 1 ? 20 : 1)
    return calls === 1 ? successResponse(batch.map(row => ({ ...row, action }))) : new Response('{}', { status: 500 })
  })
  const response = await (await routeHarness({ inspection: { excavator_inspection: { excavators } } })).request()
  assert.equal(calls, 2)
  assert.equal(response.status, 502)
  assert.equal(response.body.results, undefined)
})
test('단건·묶음 다운로드 모두 사본 준비를 호출하며 실패 시 파일을 내려받지 않는다', async t => {
  let requested = 0
  const api = await load('@/lib/hwpx/special-770-result-hwpx-export', {
    '@/lib/special-inspection-770/ai-actions-client': { requestSpecial770Actions: async () => { requested++; throw new Error('AI 실패') } },
  })
  const input = { inspectionId: id, inspectionDate: '2026-10-05', data: makeData(), project: {} }
  t.mock.method(globalThis, 'fetch', async path => new Response(await readFile(new URL(`../public${path}`, import.meta.url))))
  await assert.rejects(api.downloadSpecial770ResultHwpx(input), /AI 실패/)
  await assert.rejects(api.downloadSpecial770ResultHwpxBulk([input]), /AI 실패/)
  assert.equal(requested, 2)
})

test('개별·묶음 다운로드 산출물에는 AI 조치가 들어가고 원본은 유지된다', async t => {
  const JSZip = (await import('jszip')).default
  const blobs = [], requested = []
  const api = await load('@/lib/hwpx/special-770-result-hwpx-export', {
    '@/lib/special-inspection-770/ai-actions-client': { requestSpecial770Actions: async value => { requested.push(value); return [{ ...target, action }] } },
  })
  const input = { inspectionId: id, inspectionDate: '2026-10-05', data: makeData(), project: {} }
  const original = structuredClone(input)
  t.mock.method(globalThis, 'fetch', async path => new Response(await readFile(new URL(`../public${path}`, import.meta.url))))
  t.mock.method(URL, 'createObjectURL', blob => { blobs.push(blob); return 'blob:test' })
  t.mock.method(URL, 'revokeObjectURL', () => {})
  const oldDocument = globalThis.document
  globalThis.document = { createElement: () => ({ style: {}, click() {} }), body: { appendChild() {}, removeChild() {} } }
  t.after(() => { if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument })
  t.mock.method(globalThis, 'setTimeout', callback => { callback(); return 1 })
  await api.downloadSpecial770ResultHwpx(input)
  await api.downloadSpecial770ResultHwpxBulk([input])
  assert.deepEqual(requested, [id, id])
  assert.deepEqual(input, original)
  const single = await JSZip.loadAsync(await blobs[0].arrayBuffer())
  assert.ok((await single.file('Contents/section0.xml').async('string')).includes(action))
  const bulk = await JSZip.loadAsync(await blobs[1].arrayBuffer())
  const nested = await JSZip.loadAsync(await Object.values(bulk.files)[0].async('uint8array'))
  assert.ok((await nested.file('Contents/section0.xml').async('string')).includes(action))
})

test('API 시간 제한은 명시적 504와 실패 사용량을 남기고 슬롯을 해제한다', async t => {
  let timeout
  t.mock.method(globalThis, 'setTimeout', callback => { timeout = callback; return 1 })
  t.mock.method(globalThis, 'clearTimeout', () => {})
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    timeout()
    assert.equal(init.signal.aborted, true)
    throw new DOMException('aborted', 'AbortError')
  })
  const h = await routeHarness()
  assert.equal((await h.request()).status, 504)
  assert.equal((await h.request()).status, 504, '요청 종료 후 동시 요청 슬롯이 해제되어야 한다')
  assert.equal(h.usages[0].success, false)
})

test('클라이언트는 인증 토큰과 ID만 전송하고 서버 실패를 전파한다', async t => {
  const client = await load('@/lib/special-inspection-770/ai-actions-client', {
    '@/lib/supabase': { supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'token' } } }) } } },
  })
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    assert.deepEqual(JSON.parse(init.body), { inspectionId: id })
    assert.equal(init.headers.Authorization, 'Bearer token')
    return new Response(JSON.stringify({ success: false, error: '원본 변경' }), { status: 409 })
  })
  await assert.rejects(client.requestSpecial770Actions(id), /원본 변경/)
})

test('클라이언트는 JSON이 아닌 서버 오류와 잘못된 성공 응답을 안내한다', async t => {
  const client = await load('@/lib/special-inspection-770/ai-actions-client', {
    '@/lib/supabase': { supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'token' } } }) } } },
  })
  for (const [payload, status] of [['Internal Server Error', 500], ['<html>Bad Gateway</html>', 502], ['', 200], ['null', 200]]) {
    t.mock.method(globalThis, 'fetch', async () => new Response(payload, { status }))
    await assert.rejects(client.requestSpecial770Actions(id), error => {
      assert.ok(!(error instanceof SyntaxError))
      assert.match(error.message, status >= 400 ? new RegExp(`HTTP ${status}`) : /응답 형식/)
      assert.ok(!error.message.includes(payload) || !payload)
      return true
    })
  }
})
