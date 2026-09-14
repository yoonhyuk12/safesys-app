// 패트롤 AI 라우트의 인증·관할·입력 검증과 모델 payload·응답 엄격 검증을 확인한다.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-openai-key'

async function transpile(relativePath, dependencies = {}) {
  const source = await readFile(new URL(relativePath, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  })
  const module = { exports: {} }
  const require = (name) => {
    assert.ok(name in dependencies, `예상하지 못한 의존성 ${name}`)
    return dependencies[name]
  }
  new Function('module', 'exports', 'require', outputText)(module, module.exports, require)
  return module.exports
}

const utils = await transpile('../src/lib/patrol-inspection-utils.ts')

const NextResponse = {
  json(body, init) {
    return {
      status: init?.status ?? 200,
      body,
      async json() {
        return body
      },
    }
  },
}

function uuid(index) {
  const tail = String(index).padStart(12, '0')
  return `11111111-2222-4333-8444-${tail}`
}

const 발주청_PROFILE = { role: '발주청', hq_division: '경기', branch_division: '경기본부' }

function makeRequest(body, { token = 'valid-token', rawBody } = {}) {
  const text = rawBody ?? JSON.stringify(body)
  return {
    headers: {
      get(name) {
        if (name.toLowerCase() !== 'authorization') return null
        return token ? `Bearer ${token}` : null
      },
    },
    async text() {
      return text
    },
    async json() {
      return JSON.parse(text)
    },
  }
}

function makeRow(index, { patrol = true, hq = '경기', branch = '경기본부' } = {}) {
  return {
    id: uuid(index),
    inspection_date: '2026-07-01',
    issue_content1: `지적내용 ${index}`,
    issue_content2: '',
    patrol_car_used: patrol,
    finding_type: 'corrective_action',
    projects: { project_name: `사업 ${index}`, managing_hq: hq, managing_branch: branch },
  }
}

/** supabaseAdmin 최소 스텁 — 필요한 체이닝만 흉내낸다. */
function makeSupabaseAdmin({ user, authError = null, profile = 발주청_PROFILE, profileError = null, rows = [], loadError = null }) {
  return {
    auth: {
      async getUser() {
        return { data: { user: user ?? null }, error: authError }
      },
    },
    from(table) {
      if (table === 'user_profiles') {
        const chain = {
          select: () => chain,
          eq: () => chain,
          async maybeSingle() {
            return { data: profile, error: profileError }
          },
        }
        return chain
      }
      if (table === 'headquarters_inspections') {
        const chain = {
          select: () => chain,
          in: () => chain,
          eq: () => chain,
          then(resolve, reject) {
            return Promise.resolve({ data: rows, error: loadError }).then(resolve, reject)
          },
        }
        return chain
      }
      throw new Error(`예상하지 못한 테이블 ${table}`)
    },
  }
}

function aiContent(ids, { action = '작업 전 안전점검을 강화하고 관리감독자 확인 절차를 정한다.', disasterType = '추락' } = {}) {
  return JSON.stringify({ results: ids.map((id) => ({ id, action, disasterType })) })
}

function openAiResponse(content) {
  return {
    ok: true,
    status: 200,
    async json() {
      return { choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 20 } }
    },
  }
}

/** 매 테스트마다 새 모듈 인스턴스를 만들어 모듈 수준 제한기 상태를 격리한다. */
async function loadRoute(supabaseAdmin, fetchImpl) {
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init, body: init?.body ? JSON.parse(init.body) : null })
    return fetchImpl(url, init)
  }

  const route = await transpile('../src/app/api/ai/patrol-inspection/route.ts', {
    'next/server': { NextResponse },
    '@/lib/ai-usage-log': { recordAiUsage: () => {} },
    '@/lib/inspection/headquarters-finding-type': { headquartersFindingTypeLabel: () => '시정조치' },
    '@/lib/organization-scope': {
      isOrganizationInUserScope: (profile, target) =>
        profile?.hq_division === target?.managing_hq,
    },
    '@/lib/patrol-inspection-utils': utils,
    '@/lib/supabase-admin': { supabaseAdmin },
  })

  return { route, calls }
}

const defaultFetch = () => openAiResponse(aiContent([uuid(1)]))

test('Authorization 헤더가 없으면 401 JSON 이다', async () => {
  const { route, calls } = await loadRoute(makeSupabaseAdmin({ user: { id: 'u1' } }), defaultFetch)
  const response = await route.POST(makeRequest({ inspectionIds: [uuid(1)] }, { token: null }))

  assert.equal(response.status, 401)
  assert.equal(response.body.success, false)
  assert.equal(typeof response.body.error, 'string')
  assert.equal(calls.length, 0)
})

test('토큰 검증에 실패해도 같은 JSON 모양으로 답한다', async () => {
  const { route, calls } = await loadRoute(
    makeSupabaseAdmin({ user: null, authError: { message: 'bad token' } }),
    defaultFetch
  )
  const response = await route.POST(makeRequest({ inspectionIds: [uuid(1)] }))

  assert.equal(response.status, 401)
  assert.equal(response.body.success, false)
  assert.equal(typeof response.body.error, 'string')
  assert.equal(calls.length, 0)
})

test('발주청이 아닌 역할은 403 이다', async () => {
  const { route, calls } = await loadRoute(
    makeSupabaseAdmin({
      user: { id: 'u-role' },
      profile: { role: '시공사', hq_division: '경기', branch_division: '경기본부' },
      rows: [makeRow(1)],
    }),
    defaultFetch
  )
  const response = await route.POST(makeRequest({ inspectionIds: [uuid(1)] }))

  assert.equal(response.status, 403)
  assert.equal(calls.length, 0)
})

test('관할 밖 점검이 섞이면 403 이고 AI 를 부르지 않는다', async () => {
  const { route, calls } = await loadRoute(
    makeSupabaseAdmin({
      user: { id: 'u-scope' },
      rows: [makeRow(1), makeRow(2, { hq: '충남', branch: '충남본부' })],
    }),
    defaultFetch
  )
  const response = await route.POST(makeRequest({ inspectionIds: [uuid(1), uuid(2)] }))

  assert.equal(response.status, 403)
  assert.equal(calls.length, 0)
})

test('UUID 형식이 아닌 id 는 400 이다', async () => {
  const { route, calls } = await loadRoute(makeSupabaseAdmin({ user: { id: 'u-uuid' } }), defaultFetch)
  const response = await route.POST(makeRequest({ inspectionIds: ['not-a-uuid'] }))

  assert.equal(response.status, 400)
  assert.equal(calls.length, 0)
})

test('요청 건수 상한을 넘기면 400 이다', async () => {
  const ids = Array.from({ length: utils.PATROL_MAX_AI_ITEMS + 1 }, (_, index) => uuid(index + 1))
  const { route, calls } = await loadRoute(makeSupabaseAdmin({ user: { id: 'u-limit' } }), defaultFetch)
  const response = await route.POST(makeRequest({ inspectionIds: ids }))

  assert.equal(response.status, 400)
  assert.equal(calls.length, 0)
})

test('본문이 과도하게 크면 413 이다', async () => {
  const { route, calls } = await loadRoute(makeSupabaseAdmin({ user: { id: 'u-body' } }), defaultFetch)
  const response = await route.POST(
    makeRequest(null, { rawBody: JSON.stringify({ inspectionIds: [uuid(1)], padding: 'x'.repeat(200_000) }) })
  )

  assert.equal(response.status, 413)
  assert.equal(calls.length, 0)
})

test('요청 id 중 원본이 없으면 AI 호출 전에 실패한다', async () => {
  const { route, calls } = await loadRoute(
    makeSupabaseAdmin({ user: { id: 'u-missing' }, rows: [makeRow(1), makeRow(2)] }),
    defaultFetch
  )
  const response = await route.POST(makeRequest({ inspectionIds: [uuid(1), uuid(2), uuid(3)] }))

  assert.equal(response.status, 404)
  assert.equal(response.body.success, false)
  assert.equal(calls.length, 0)
})

test('패트롤이 아닌 점검만 걸러져도 개수 불일치로 실패한다', async () => {
  // patrol_car_used=true 필터로 비패트롤 행은 아예 내려오지 않는다.
  const { route, calls } = await loadRoute(
    makeSupabaseAdmin({ user: { id: 'u-nonpatrol' }, rows: [makeRow(1)] }),
    defaultFetch
  )
  const response = await route.POST(makeRequest({ inspectionIds: [uuid(1), uuid(2)] }))

  assert.equal(response.status, 404)
  assert.equal(calls.length, 0)
})

test('20건 요청은 고정 모델·추론수준·건수 기반 토큰·strict json_schema 로 호출한다', async () => {
  const ids = Array.from({ length: 20 }, (_, index) => uuid(index + 1))
  const rows = ids.map((_, index) => makeRow(index + 1))
  const { route, calls } = await loadRoute(
    makeSupabaseAdmin({ user: { id: 'u-payload' }, rows }),
    () => openAiResponse(aiContent(ids))
  )

  const response = await route.POST(makeRequest({ inspectionIds: ids }))
  assert.equal(response.status, 200)
  assert.equal(response.body.success, true)
  assert.equal(Object.keys(response.body.results).length, 20)

  assert.equal(calls.length, 1)
  const payload = calls[0].body
  assert.equal(payload.model, 'gpt-5.6-luna')
  assert.ok(['low', 'none'].includes(payload.reasoning_effort))
  // low 추론 + 20건 본문이 잘리지 않도록 넉넉히 잡는다.
  assert.equal(payload.max_completion_tokens, 4000 + 20 * 600)
  assert.equal(payload.max_completion_tokens, 16000)

  const format = payload.response_format
  assert.equal(format.type, 'json_schema')
  assert.equal(format.json_schema.strict, true)
  const schema = format.json_schema.schema
  assert.equal(schema.additionalProperties, false)
  assert.deepEqual(schema.required, ['results'])
  const item = schema.properties.results.items
  assert.equal(item.additionalProperties, false)
  assert.deepEqual(item.required, ['id', 'action', 'disasterType'])
})

test('JSON 이 잘려 있으면 성공으로 반환하지 않는다', async () => {
  const ids = [uuid(1)]
  const { route } = await loadRoute(
    makeSupabaseAdmin({ user: { id: 'u-broken' }, rows: [makeRow(1)] }),
    () => openAiResponse('{"results": [{"id": "11111111-2222-4333-8444-000000000001", "action": "잘린')
  )
  const response = await route.POST(makeRequest({ inspectionIds: ids }))

  assert.equal(response.status, 502)
  assert.equal(response.body.success, false)
})

test('응답에 빠진 id 가 있으면 실패한다', async () => {
  const ids = [uuid(1), uuid(2)]
  const rows = [makeRow(1), makeRow(2)]
  const { route } = await loadRoute(
    makeSupabaseAdmin({ user: { id: 'u-partial' }, rows }),
    () => openAiResponse(aiContent([uuid(1)]))
  )
  const response = await route.POST(makeRequest({ inspectionIds: ids }))

  assert.equal(response.status, 502)
  assert.equal(response.body.success, false)
})

test('응답 id 가 중복되거나 요청 밖이면 실패한다', async () => {
  const ids = [uuid(1), uuid(2)]
  const rows = [makeRow(1), makeRow(2)]
  const { route } = await loadRoute(
    makeSupabaseAdmin({ user: { id: 'u-dup' }, rows }),
    () => openAiResponse(aiContent([uuid(1), uuid(1)]))
  )
  const response = await route.POST(makeRequest({ inspectionIds: ids }))

  assert.equal(response.status, 502)
  assert.equal(response.body.success, false)
})

test('빈 조치내용은 결과로 인정하지 않는다', async () => {
  const ids = [uuid(1)]
  const { route } = await loadRoute(
    makeSupabaseAdmin({ user: { id: 'u-empty' }, rows: [makeRow(1)] }),
    () => openAiResponse(aiContent(ids, { action: '   ' }))
  )
  const response = await route.POST(makeRequest({ inspectionIds: ids }))

  assert.equal(response.status, 502)
  assert.equal(response.body.success, false)
})

test('120자를 넘는 조치내용도 자르지 않고 그대로 돌려준다', async () => {
  const ids = [uuid(1)]
  // 프롬프트는 120자 이내를 요구하지만, 넘겨온 문장을 임의로 끊어 불완전 문장을 만들지 않는다.
  const longAction =
    '작업 착수 전 관리감독자가 안전난간 설치 상태를 확인하고, 미설치 구간은 당일 작업을 중지한 뒤 ' +
    '설치 완료를 사진으로 확인하며, 매주 순회점검 시 난간 결속 상태와 고정 볼트 조임 상태를 재확인하고 ' +
    '그 결과를 안전점검일지에 남기도록 현장 절차를 문서화한다.'
  assert.ok(longAction.length > 120, '테스트 문장이 120자를 넘지 않는다')

  const { route } = await loadRoute(
    makeSupabaseAdmin({ user: { id: 'u-long' }, rows: [makeRow(1)] }),
    () => openAiResponse(aiContent(ids, { action: longAction }))
  )
  const response = await route.POST(makeRequest({ inspectionIds: ids }))

  assert.equal(response.status, 200)
  assert.equal(response.body.results[uuid(1)].action, longAction)
})

test('조치내용의 줄바꿈만 공백으로 정리하고 앞뒤 공백을 다듬는다', async () => {
  const ids = [uuid(1)]
  const rawAction = '  작업 전 안전점검을 강화한다.\n\n  관리감독자 확인 절차를 정한다.  '
  const { route } = await loadRoute(
    makeSupabaseAdmin({ user: { id: 'u-newline' }, rows: [makeRow(1)] }),
    () => openAiResponse(aiContent(ids, { action: rawAction }))
  )
  const response = await route.POST(makeRequest({ inspectionIds: ids }))

  assert.equal(response.status, 200)
  assert.equal(
    response.body.results[uuid(1)].action,
    '작업 전 안전점검을 강화한다. 관리감독자 확인 절차를 정한다.'
  )
})

test('허용 목록 밖 재해유형은 기타로 정규화한다', async () => {
  const ids = [uuid(1)]
  const { route } = await loadRoute(
    makeSupabaseAdmin({ user: { id: 'u-type' }, rows: [makeRow(1)] }),
    () => openAiResponse(aiContent(ids, { disasterType: '우주선 충돌' }))
  )
  const response = await route.POST(makeRequest({ inspectionIds: ids }))

  assert.equal(response.status, 200)
  assert.equal(response.body.results[uuid(1)].disasterType, '기타')
})

test('정상적인 여러 배치 다운로드는 스스로 막지 않는다', async () => {
  const ids = [uuid(1)]
  const { route, calls } = await loadRoute(
    makeSupabaseAdmin({ user: { id: 'u-normal' }, rows: [makeRow(1)] }),
    () => openAiResponse(aiContent(ids))
  )

  // 1,000건을 20건씩 나누면 50회다. 이 정도는 전부 통과해야 한다.
  for (let attempt = 0; attempt < 50; attempt++) {
    const response = await route.POST(makeRequest({ inspectionIds: ids }))
    assert.equal(response.status, 200, `${attempt + 1}번째 배치가 막혔다`)
  }
  assert.equal(calls.length, 50)
})

test('같은 사용자가 분당 한도를 넘기면 429 로 막는다', async () => {
  const ids = [uuid(1)]
  const { route, calls } = await loadRoute(
    makeSupabaseAdmin({ user: { id: 'u-rate' }, rows: [makeRow(1)] }),
    () => openAiResponse(aiContent(ids))
  )

  const statuses = []
  for (let attempt = 0; attempt < 70; attempt++) {
    const response = await route.POST(makeRequest({ inspectionIds: ids }))
    statuses.push(response.status)
  }

  assert.equal(statuses.filter((status) => status === 200).length, 60)
  assert.ok(statuses.includes(429), '분당 한도를 넘겨도 429 가 나오지 않았다')
  assert.equal(calls.length, 60, '차단된 요청이 OpenAI 로 나갔다')
})

test('같은 사용자의 동시 요청은 한 건만 처리한다', async () => {
  const ids = [uuid(1)]
  let release
  const gate = new Promise((resolve) => {
    release = resolve
  })

  const { route } = await loadRoute(
    makeSupabaseAdmin({ user: { id: 'u-concurrent' }, rows: [makeRow(1)] }),
    async () => {
      await gate
      return openAiResponse(aiContent(ids))
    }
  )

  const first = route.POST(makeRequest({ inspectionIds: ids }))
  // 첫 요청이 OpenAI 응답을 기다리는 동안 두 번째가 들어온다.
  await new Promise((resolve) => setImmediate(resolve))
  const second = await route.POST(makeRequest({ inspectionIds: ids }))

  assert.equal(second.status, 429)
  release()
  assert.equal((await first).status, 200)

  // 앞 요청이 끝난 뒤에는 다시 받아준다.
  const third = await route.POST(makeRequest({ inspectionIds: ids }))
  assert.equal(third.status, 200)
})
