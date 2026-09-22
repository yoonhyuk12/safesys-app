// 관리자 모델 목록의 공급자별 캐시와 강제 새로고침을 검증한다.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

async function load(auth = { ok: true }) {
  const calls = []
  let now = 0
  let fail = false
  const source = await readFile(new URL('../src/app/api/admin/ai-models/available/route.ts', import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } })
  const dependencies = {
    'next/server': { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } },
    '@/lib/admin-auth': { requireAdmin: async () => auth },
  }
  const fetch = async (url, init) => {
    calls.push({ url, init })
    const id = `${calls.length}`
    return { ok: !fail, status: fail ? 503 : 200, json: async () => ({
      data: [{ id: 'embedding' }, { id: `gpt-${id}` }],
      models: [{ name: 'models/embedding' }, { name: `models/gemini-${id}`, supportedGenerationMethods: ['generateContent'] }],
    }) }
  }
  const module = { exports: {} }
  new Function('module', 'exports', 'require', 'fetch', 'process', 'Date', 'console', outputText)(
    module, module.exports, name => { assert.ok(name in dependencies, name); return dependencies[name] },
    fetch, { env: { OPENAI_API_KEY: 'test', GEMINI_API_KEY: 'test' } }, { now: () => now }, { error() {} },
  )
  return { ...module.exports, calls, advance: ms => { now += ms }, fail: () => { fail = true } }
}
const request = (provider, refresh = '') => ({ nextUrl: new URL(`https://example.test/?provider=${provider}${refresh}`) })

for (const provider of ['OpenAI', 'Google']) {
  test(`${provider}: 일반 조회는 캐시를 사용하고 강제 새로고침은 캐시를 갱신한다`, async () => {
    const route = await load()
    const first = await route.GET(request(provider))
    assert.equal(first.status, 200)
    assert.match(first.body.models[0], provider === 'OpenAI' ? /^gpt-/ : /^gemini-/)
    assert.deepEqual(await route.GET(request(provider)), first)
    assert.equal(route.calls.length, 1)
    const refreshed = await route.GET(request(provider, '&refresh=true'))
    assert.equal(route.calls.length, 2)
    assert.notDeepEqual(refreshed.body.models, first.body.models)
    assert.deepEqual(await route.GET(request(provider)), refreshed)
    assert.equal(route.calls.length, 2)
    assert.ok(route.calls.every(call => call.init.cache === 'no-store'))
    await route.GET(request(provider, '&refresh=false'))
    assert.equal(route.calls.length, 2)
    route.advance(10 * 60 * 1000)
    await route.GET(request(provider))
    assert.equal(route.calls.length, 3)
  })
  test(`${provider}: 새로고침 실패는 502이며 이전 정상 캐시는 유지한다`, async () => {
    const route = await load()
    const first = await route.GET(request(provider))
    route.fail()
    assert.equal((await route.GET(request(provider, '&refresh=true'))).status, 502)
    assert.deepEqual(await route.GET(request(provider)), first)
  })
}
test('공급자별 캐시는 독립적이다', async () => {
  const route = await load()
  const google = await route.GET(request('Google'))
  await route.GET(request('OpenAI'))
  await route.GET(request('OpenAI', '&refresh=true'))
  assert.deepEqual(await route.GET(request('Google')), google)
  assert.equal(route.calls.length, 3)
})
test('새로고침도 관리자 인증과 공급자 검증을 우회하지 않는다', async () => {
  for (const status of [401, 403]) {
    const route = await load({ ok: false, status, error: 'denied' })
    assert.equal((await route.GET(request('OpenAI', '&refresh=true'))).status, status)
    assert.equal(route.calls.length, 0)
  }
  const route = await load()
  assert.equal((await route.GET(request('unknown', '&refresh=true'))).status, 400)
  assert.equal(route.calls.length, 0)
})
