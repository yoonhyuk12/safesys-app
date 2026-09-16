// 사고보고 자동 채움 라우트의 인증·RLS 접근 확인·입력 검증과 Gemini 요청 형식·사용량 기록을 검증한다
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import test from 'node:test'
import ts from 'typescript'

const nodeRequire = createRequire(import.meta.url)

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
process.env.GEMINI_API_KEY = 'test-gemini-key'

/** `@/` 별칭 모듈을 실제 소스로 따라가며 transpile한다. overrides에 담긴 이름만 대역으로 바꾼다. */
function createLoader(overrides = {}) {
  const cache = new Map()

  const load = async (name) => {
    if (name in overrides) return overrides[name]
    if (!name.startsWith('@/')) return nodeRequire(name)
    if (cache.has(name)) return cache.get(name)

    const relative = name.replace('@/', '../src/')
    let source = null
    for (const suffix of ['.ts', '.tsx']) {
      try {
        source = await readFile(new URL(`${relative}${suffix}`, import.meta.url), 'utf8')
        break
      } catch {
        // 다음 확장자를 시도한다.
      }
    }
    if (source === null) throw new Error(`별칭 모듈을 찾지 못했다: ${name}`)

    const { outputText } = ts.transpileModule(source, {
      // esModuleInterop은 tsconfig와 같게 둔다 — 기본 import가 실제 빌드처럼 해석된다.
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    })

    const dependencies = new Map()
    for (const match of outputText.matchAll(/require\(["']([^"']+)["']\)/g)) {
      const dependency = match[1]
      if (!dependencies.has(dependency)) dependencies.set(dependency, await load(dependency))
    }

    const module = { exports: {} }
    cache.set(name, module.exports)
    const requireShim = (dependency) => {
      if (!dependencies.has(dependency)) throw new Error(`예상하지 못한 의존성 ${dependency}`)
      return dependencies.get(dependency)
    }
    new Function('module', 'exports', 'require', outputText)(module, module.exports, requireShim)
    cache.set(name, module.exports)
    return module.exports
  }

  return load
}

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

/** 인증·현장 조회 대역. getUser 결과와 projects 행을 시험마다 바꾼다. */
const supabaseState = {
  user: { id: '' },
  authError: null,
  project: { id: '' },
  projectError: null,
  createCalls: [],
}

const supabaseStub = {
  createClient(url, key, options) {
    supabaseState.createCalls.push({ url, key, options })
    return {
      auth: {
        async getUser(token) {
          return supabaseState.authError
            ? { data: { user: null }, error: supabaseState.authError, token }
            : { data: { user: supabaseState.user }, error: null }
        },
      },
      from(table) {
        assert.equal(table, 'projects', '이 라우트는 projects만 읽어야 한다')
        const chain = {
          select: () => chain,
          eq: () => chain,
          async maybeSingle() {
            return { data: supabaseState.project, error: supabaseState.projectError }
          },
        }
        return chain
      },
    }
  },
}

const usageCalls = []

const load = createLoader({
  'next/server': { NextResponse },
  '@supabase/supabase-js': supabaseStub,
  '@/lib/ai-models': { getAiModel: async () => 'gemini-flash-lite-latest' },
  '@/lib/ai-usage-log': { recordAiUsage: (params) => usageCalls.push(params) },
})

const { POST } = await load('@/app/api/ai/accident-report/route')

const PROJECT_ID = '11111111-2222-4333-8444-555555555555'
const FileCtor = globalThis.File ?? nodeRequire('node:buffer').File

let userCounter = 0

/** 사용자별 레이트리밋에 걸리지 않도록 시험마다 다른 사용자로 요청한다. */
function newUserId() {
  userCounter += 1
  return `22222222-3333-4333-8444-${String(userCounter).padStart(12, '0')}`
}

function resetState({ project = { id: PROJECT_ID }, projectError = null, authError = null } = {}) {
  supabaseState.user = { id: newUserId() }
  supabaseState.authError = authError
  supabaseState.project = project
  supabaseState.projectError = projectError
  usageCalls.length = 0
  return supabaseState.user.id
}

function makeRequest(formData, { token = 'test-token' } = {}) {
  return {
    headers: {
      get(name) {
        if (name.toLowerCase() !== 'authorization') return null
        return token ? `Bearer ${token}` : null
      },
    },
    async formData() {
      return formData
    },
  }
}

function pdfBlob(size = 2048, name = '사고보고.pdf') {
  const bytes = Buffer.alloc(size, 0x20)
  Buffer.from('%PDF-1.7').copy(bytes)
  return new FileCtor([bytes], name, { type: 'application/pdf' })
}

function pdfForm(file = pdfBlob(), projectId = PROJECT_ID) {
  const form = new FormData()
  form.append('project_id', projectId)
  form.append('file', file)
  return form
}

function textForm(text = '사고발생보고 본문', projectId = PROJECT_ID) {
  const form = new FormData()
  form.append('project_id', projectId)
  form.append('text', text)
  return form
}

/** Gemini 대역 — 요청 본문을 기록하고 정해진 응답을 돌려준다. */
function stubGemini(handler) {
  const calls = []
  const original = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init, body: init?.body ? JSON.parse(init.body) : null })
    return handler(url, init)
  }
  return {
    calls,
    restore() {
      globalThis.fetch = original
    },
  }
}

function geminiOk(payload, { finishReason } = {}) {
  return {
    ok: true,
    status: 200,
    async json() {
      return {
        candidates: [{ finishReason, content: { parts: [{ text: JSON.stringify(payload) }] } }],
        usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50, totalTokenCount: 150 },
      }
    },
  }
}

test('Authorization 헤더가 없으면 401이고 AI를 부르지 않는다', async () => {
  resetState()
  const stub = stubGemini(() => geminiOk({}))
  try {
    const response = await POST(makeRequest(pdfForm(), { token: '' }))
    assert.equal(response.status, 401)
    assert.equal(response.body.success, false)
    assert.equal(stub.calls.length, 0)
  } finally {
    stub.restore()
  }
})

test('토큰이 유효하지 않으면 401이고 AI를 부르지 않는다', async () => {
  resetState({ authError: { message: 'bad token', status: 401 } })
  const stub = stubGemini(() => geminiOk({}))
  try {
    const response = await POST(makeRequest(pdfForm()))
    assert.equal(response.status, 401)
    assert.equal(stub.calls.length, 0)
  } finally {
    stub.restore()
  }
})

test('사용자 JWT를 그대로 쓰는 클라이언트로 접근을 확인한다', async () => {
  resetState()
  supabaseState.createCalls.length = 0
  const stub = stubGemini(() => geminiOk({ description: '사고 내용' }))
  try {
    await POST(makeRequest(textForm()))

    const created = supabaseState.createCalls[0]
    assert.equal(created.url, 'https://example.supabase.co')
    assert.equal(created.key, 'test-anon-key')
    assert.equal(created.options.global.headers.Authorization, 'Bearer test-token')
    assert.equal(created.options.auth.persistSession, false)
  } finally {
    stub.restore()
  }
})

test('project_id 형식이 UUID가 아니면 400이다', async () => {
  resetState()
  const stub = stubGemini(() => geminiOk({}))
  try {
    for (const bad of ['', '현장1', '11111111-2222-4333-8444']) {
      const response = await POST(makeRequest(textForm('본문', bad)))
      assert.equal(response.status, 400, bad)
    }
    assert.equal(stub.calls.length, 0)
  } finally {
    stub.restore()
  }
})

test('RLS로 현장 행이 보이지 않으면 403이고 AI를 부르지 않는다', async () => {
  resetState({ project: null })
  const stub = stubGemini(() => geminiOk({}))
  try {
    const response = await POST(makeRequest(pdfForm()))
    assert.equal(response.status, 403)
    assert.match(response.body.error, /접근할 수 없습니다/)
    assert.equal(stub.calls.length, 0)
  } finally {
    stub.restore()
  }
})

test('현장 조회가 실패하면 500이다', async () => {
  resetState({ project: null, projectError: { code: 'PGRST500', message: 'boom' } })
  const stub = stubGemini(() => geminiOk({}))
  try {
    const response = await POST(makeRequest(pdfForm()))
    assert.equal(response.status, 500)
    assert.equal(stub.calls.length, 0)
  } finally {
    stub.restore()
  }
})

test('file과 text가 둘 다 없거나 둘 다 있으면 400이다', async () => {
  const stub = stubGemini(() => geminiOk({}))
  try {
    resetState()
    const empty = new FormData()
    empty.append('project_id', PROJECT_ID)
    assert.equal((await POST(makeRequest(empty))).status, 400)

    resetState()
    const both = pdfForm()
    both.append('text', '본문')
    assert.equal((await POST(makeRequest(both))).status, 400)

    assert.equal(stub.calls.length, 0)
  } finally {
    stub.restore()
  }
})

test('PDF가 아닌 파일과 서명이 다른 파일은 400이다', async () => {
  const stub = stubGemini(() => geminiOk({}))
  try {
    resetState()
    const hwp = new FileCtor([Buffer.alloc(32)], '사고보고.hwp', { type: 'application/x-hwp' })
    assert.equal((await POST(makeRequest(pdfForm(hwp)))).status, 400)

    resetState()
    const fake = new FileCtor([Buffer.from('PKfake')], '위장.pdf', { type: 'application/pdf' })
    const response = await POST(makeRequest(pdfForm(fake)))
    assert.equal(response.status, 400)
    assert.match(response.body.error, /PDF 파일만/)

    assert.equal(stub.calls.length, 0)
  } finally {
    stub.restore()
  }
})

test('4MB를 넘는 PDF는 413이다', async () => {
  resetState()
  const stub = stubGemini(() => geminiOk({}))
  try {
    const response = await POST(makeRequest(pdfForm(pdfBlob(5 * 1024 * 1024))))
    assert.equal(response.status, 413)
    assert.equal(stub.calls.length, 0)
  } finally {
    stub.restore()
  }
})

test('빈 텍스트는 400, 10만 자를 넘는 텍스트는 413이다', async () => {
  const stub = stubGemini(() => geminiOk({}))
  try {
    resetState()
    assert.equal((await POST(makeRequest(textForm('   ')))).status, 400)

    resetState()
    const response = await POST(makeRequest(textForm('가'.repeat(100_001))))
    assert.equal(response.status, 413)

    assert.equal(stub.calls.length, 0)
  } finally {
    stub.restore()
  }
})

test('정상 PDF는 inlineData와 응답 스키마를 담아 Gemini에 보낸다', async () => {
  const userId = resetState()
  const stub = stubGemini(() => geminiOk({ description: '사고 내용', location: '예시지구' }))
  try {
    const response = await POST(makeRequest(pdfForm()))
    assert.equal(response.status, 200)
    assert.equal(response.body.success, true)

    assert.equal(stub.calls.length, 1)
    const { url, init, body } = stub.calls[0]
    assert.match(url, /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-flash-lite-latest:generateContent$/)
    assert.equal(init.headers['x-goog-api-key'], 'test-gemini-key')

    const parts = body.contents[0].parts
    assert.equal(parts[0].inlineData.mimeType, 'application/pdf')
    assert.ok(parts[0].inlineData.data.length > 0)
    assert.equal(typeof parts[1].text, 'string')
    assert.ok(body.systemInstruction.parts[0].text.includes('null'))
    assert.equal(body.generationConfig.responseMimeType, 'application/json')
    assert.equal(body.generationConfig.responseSchema.type, 'OBJECT')
    assert.equal(body.generationConfig.temperature, 0.1)
    assert.equal(body.generationConfig.maxOutputTokens, 4096)

    assert.equal(response.body.fields.description, '사고 내용')
    assert.equal(response.body.model, 'gemini-flash-lite-latest')

    // 성공도 사용량으로 남고 사용자·현장이 함께 기록된다.
    assert.equal(usageCalls.length, 1)
    assert.equal(usageCalls[0].featureKey, 'ai.accident-report')
    assert.equal(usageCalls[0].provider, 'Google')
    assert.equal(usageCalls[0].userId, userId)
    assert.equal(usageCalls[0].projectId, PROJECT_ID)
  } finally {
    stub.restore()
  }
})

test('HWPX 텍스트는 text 파트 하나로만 보낸다', async () => {
  resetState()
  const stub = stubGemini(() => geminiOk({ description: '사고 내용' }))
  try {
    const response = await POST(makeRequest(textForm('사고발생보고\n예시지구 현장')))
    assert.equal(response.status, 200)

    const parts = stub.calls[0].body.contents[0].parts
    assert.equal(parts.length, 1)
    assert.equal(parts[0].inlineData, undefined)
    assert.ok(parts[0].text.includes('# 문서 본문'))
    assert.ok(parts[0].text.includes('예시지구 현장'))
  } finally {
    stub.restore()
  }
})

test('Gemini가 오류 상태를 주면 502로 바꾸고 실패를 기록한다', async () => {
  const userId = resetState()
  const stub = stubGemini(() => ({ ok: false, status: 500, async json() { return {} } }))
  try {
    const response = await POST(makeRequest(textForm()))
    assert.equal(response.status, 502)
    assert.match(response.body.error, /HTTP 500/)

    assert.equal(usageCalls.length, 1)
    assert.equal(usageCalls[0].success, false)
    assert.equal(usageCalls[0].errorMessage, 'HTTP 500')
    assert.equal(usageCalls[0].userId, userId)
  } finally {
    stub.restore()
  }
})

test('Gemini 응답 JSON이 깨졌으면 502다', async () => {
  resetState()
  const stub = stubGemini(() => ({
    ok: true,
    status: 200,
    async json() {
      return { candidates: [{ content: { parts: [{ text: '{"description": ' }] } }] }
    },
  }))
  try {
    const response = await POST(makeRequest(textForm()))
    assert.equal(response.status, 502)
    assert.match(response.body.error, /해석하지 못했습니다/)
  } finally {
    stub.restore()
  }
})

test('응답에 텍스트 파트가 없으면 502다', async () => {
  resetState()
  const stub = stubGemini(() => ({ ok: true, status: 200, async json() { return { candidates: [] } } }))
  try {
    assert.equal((await POST(makeRequest(textForm()))).status, 502)
  } finally {
    stub.restore()
  }
})

test('타임아웃(AbortError)은 504, 네트워크 오류는 502다', async () => {
  resetState()
  const aborted = stubGemini(() => {
    const error = new Error('aborted')
    error.name = 'AbortError'
    throw error
  })
  try {
    const response = await POST(makeRequest(textForm()))
    assert.equal(response.status, 504)
    assert.match(response.body.error, /시간이 초과/)
    assert.equal(usageCalls[0].success, false)
  } finally {
    aborted.restore()
  }

  resetState()
  const broken = stubGemini(() => {
    throw new TypeError('fetch failed')
  })
  try {
    const response = await POST(makeRequest(textForm()))
    assert.equal(response.status, 502)
    assert.match(response.body.error, /연결하지 못했습니다/)
  } finally {
    broken.restore()
  }
})

test('MAX_TOKENS로 끊기면 안내를 앞에 붙인다', async () => {
  resetState()
  const stub = stubGemini(() => geminiOk({ description: '사고 내용' }, { finishReason: 'MAX_TOKENS' }))
  try {
    const response = await POST(makeRequest(textForm()))
    assert.equal(response.status, 200)
    assert.match(response.body.warnings[0], /일부 항목이 채워지지 않았을 수 있습니다/)
  } finally {
    stub.restore()
  }
})

test('AI가 project_id·photos를 돌려줘도 응답 필드에 넣지 않는다', async () => {
  resetState()
  const stub = stubGemini(() =>
    geminiOk({
      project_id: '99999999-2222-4333-8444-555555555555',
      created_by: '88888888-2222-4333-8444-555555555555',
      photos: [{ dataUrl: 'data:image/jpeg;base64,/9j/AAAA', caption: '사진' }],
      description: '사고 내용',
      report_details: { photos: [{ dataUrl: 'data:image/jpeg;base64,/9j/AAAA', caption: '사진' }], summary: '요지' },
    })
  )
  try {
    const { body } = await POST(makeRequest(textForm()))

    assert.equal('project_id' in body.fields, false)
    assert.equal('created_by' in body.fields, false)
    assert.equal('photos' in body.fields, false)
    assert.equal('photos' in body.fields.report_details, false)
    assert.equal(body.fields.report_details.summary, '요지')
  } finally {
    stub.restore()
  }
})

test('라우트 소스는 서비스 롤을 쓰지 않고 사고를 저장하지도 않는다', async () => {
  const source = await readFile(
    new URL('../src/app/api/ai/accident-report/route.ts', import.meta.url),
    'utf8'
  )

  assert.equal(source.includes('supabase-admin'), false, '서비스 롤로 권한을 우회해서는 안 된다')
  assert.equal(source.includes('project_accidents'), false, '이 라우트는 사고를 저장하지 않는다')
  // 모델명을 코드에 박으면 관리자 화면의 모델 설정이 무시된다. 반드시 기능 키로 조회해야 한다.
  assert.match(source, /const FEATURE_KEY = 'ai\.accident-report'/)
  assert.match(source, /getAiModel\(FEATURE_KEY\)/)
  assert.doesNotMatch(source, /model:\s*'[^']*gemini/i, '모델명이 라우트에 하드코딩되어 있다')
  // 문서 원문·추출 텍스트를 로그로 남기지 않는다.
  assert.equal(/console\.(log|error|warn)\([^)]*\b(text|prompt|jsonText)\b/.test(source), false)
})
