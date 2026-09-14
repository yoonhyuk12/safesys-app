// 성과총괄표 반려 취소 API의 권한과 메타정보 초기화 및 기존 반려 동작을 검증한다.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const REPORT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const source = await readFile(new URL('../src/app/api/quality-summary/reject/route.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
})

async function request(method = 'DELETE', options = {}) {
  const { body = { report_id: REPORT_ID }, role = '발주청', token = 'token', invalidToken = false, malformed = false, reportExists = true, rejected = true, updateError = null, profileError = null } = options
  const rejectedBy = options.rejectedBy === undefined ? 'client' : options.rejectedBy
  const updates = [], filters = [], logs = []
  let authCalls = 0
  const admin = {
    auth: { async getUser() { authCalls++; return { data: { user: invalidToken ? null : { id: 'client' } }, error: invalidToken ? new Error('invalid') : null } } },
    from(table) {
      let updatePayload
      const query = {
        select() { return query }, eq(column, value) { filters.push([column, value]); return query },
        not(...args) { filters.push(args); return query },
        update(payload) { updatePayload = payload; updates.push(payload); return query },
        async maybeSingle() {
          if (table === 'user_profiles') return { data: role ? { role } : null, error: profileError }
          const needsRejected = filters.some(([column, operator, value]) => column === 'rejected_at' && operator === 'is' && value === null)
          const matchesRejector = filters.filter(([column]) => column === 'rejected_by').every(([, value]) => value === rejectedBy)
          return { data: reportExists && (!needsRejected || rejected) && matchesRejector && updatePayload ? { id: REPORT_ID } : null, error: updateError }
        },
      }
      return query
    },
  }
  const dependencies = {
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
    '@/lib/supabase-admin': { supabaseAdmin: admin },
  }
  const module = { exports: {} }
  new Function('module', 'exports', 'require', 'console', outputText)(module, module.exports, (name) => dependencies[name], { error: (...args) => logs.push(args) })
  assert.equal(typeof module.exports[method], 'function', `${method} 핸들러가 있어야 한다`)
  const response = await module.exports[method]({
    headers: { get: () => token ? `Bearer ${token}` : null },
    json: async () => { if (malformed) throw new Error('JSON'); return body },
  })
  return { ...response, updates, filters, authCalls, logs }
}

test('발주청 취소는 반려 정보 5개만 초기화하고 현재 서명과 작성자·본문을 보존한다', async () => {
  const result = await request()
  assert.equal(result.status, 200)
  assert.equal(result.body.success, true)
  assert.equal(result.updates.length, 1)
  const { updated_at, ...payload } = result.updates[0]
  assert.ok(!Number.isNaN(Date.parse(updated_at)))
  assert.deepEqual(payload, { rejection_reason: null, rejected_at: null, rejected_by: null, rejection_read_at: null, rejection_read_by: null })
  assert.ok(result.filters.some(([column, value]) => column === 'id' && value === REPORT_ID))
  assert.ok(result.filters.some(([column, operator, value]) => column === 'rejected_at' && operator === 'is' && value === null))
  assert.ok(result.filters.some(([column, value]) => column === 'rejected_by' && value === 'client'))
})

test('다른 발주청 사용자 또는 통보자가 없는 반려는 취소할 수 없다', async () => {
  for (const rejectedBy of ['another-client', null]) {
    const result = await request('DELETE', { rejectedBy })
    assert.equal(result.status, 404)
    assert.equal(result.body.success, false)
  }
})

for (const method of ['POST', 'DELETE']) {
  for (const [label, options, status] of [
    ['잘못된 JSON', { malformed: true }, 400],
    ['null 본문', { body: null }, 400],
    ['유효하지 않은 UUID', { body: { report_id: 'invalid', reason: '사유' } }, 400],
    ['인증 누락', { token: null }, 401],
    ['유효하지 않은 인증', { invalidToken: true }, 401],
    ['시공사', { role: '시공사' }, 403],
    ['감리단', { role: '감리단' }, 403],
    ['프로필 없음', { role: null }, 403],
    ['프로필 조회 실패', { profileError: new Error('profile') }, 500],
  ]) {
    test(`${method} ${label} 요청은 DB 수정 전에 거부한다`, async () => {
      const result = await request(method, { body: { report_id: REPORT_ID, reason: '반려 사유' }, ...options })
      assert.equal(result.status, status)
      assert.equal(result.body.success, false)
      assert.equal(result.updates.length, 0)
    })
  }
}

test('취소 대상이 없거나 이미 취소된 보고서는 실패하고 DB 오류를 노출하지 않는다', async () => {
  for (const options of [{ reportExists: false }, { rejected: false }]) {
    const result = await request('DELETE', options)
    assert.equal(result.status, 404)
    assert.equal(result.body.success, false)
    assert.match(result.body.error, /본인이 반려 통보한 성과총괄표/)
  }
  const result = await request('DELETE', { updateError: new Error('private database error') })
  assert.equal(result.status, 500)
  assert.doesNotMatch(result.body.error, /private database/)
})

test('기존 반려 POST는 사유 검증과 검토자 서명 초기화를 유지한다', async () => {
  for (const reason of ['', '  ', 'a'.repeat(1001)]) {
    const result = await request('POST', { body: { report_id: REPORT_ID, reason } })
    assert.equal(result.status, 400)
    assert.equal(result.updates.length, 0)
  }
  const result = await request('POST', { body: { report_id: REPORT_ID, reason: ' 사유 ' } })
  assert.equal(result.status, 200)
  assert.equal(result.updates[0].rejection_reason, '사유')
  assert.equal(result.updates[0].reviewer_signature, '')
  assert.equal(result.updates[0].rejected_by, 'client')
})

const componentSource = await readFile(new URL('../src/components/project/quality/QualitySummaryTab.tsx', import.meta.url), 'utf8')
const ast = ts.createSourceFile('QualitySummaryTab.tsx', componentSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
let cancelHandler, cancelPermission, cancelButton
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'handleCancelRejection') cancelHandler = node.initializer.getText(ast)
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'canCancelRejection') cancelPermission = node.initializer.getText(ast)
  if (ts.isJsxElement(node) && node.openingElement.tagName.getText(ast) === 'button' && node.getText(ast).includes('onClick={handleCancelRejection}')) cancelButton = node.parent.getText(ast)
  ts.forEachChild(node, visit)
}
visit(ast)

async function cancelFromForm(overrides = {}, success = true) {
  assert.ok(cancelHandler)
  const calls = [], alerts = [], savingStates = []
  let reloads = 0
  const formData = { writer_name: '편집 중 이름', reviewer_signature: 'current-signature', writer_signature: 'writer-signature' }
  const context = {
    editingReportId: REPORT_ID, activeReport: { rejected_at: '2026-09-14', rejected_by: 'client' }, canReject: true, userId: 'client',
    saving: false, rejectionSaving: false, formData,
    setRejectionSaving: (value) => savingStates.push(value),
    supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'token' } }, error: null }) } },
    fetch: async (url, options) => { calls.push({ url, ...options }); return { ok: success, json: async () => ({ success, error: success ? undefined : '취소 오류' }) } },
    loadReports: async () => { reloads++ }, alert: (value) => alerts.push(value), getErrorMessage: (error) => error.message,
    set: () => assert.fail('취소는 편집 중 서명을 변경하지 않아야 한다'),
    setFormData: () => assert.fail('취소는 편집 중 입력을 변경하지 않아야 한다'),
    resetForm: () => assert.fail('취소는 편집 폼을 닫지 않아야 한다'),
    ...overrides,
  }
  assert.ok(cancelPermission)
  const { outputText } = ts.transpileModule(`const canCancelRejection = ${cancelPermission}; const cancel = ${cancelHandler}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } })
  await new Function(...Object.keys(context), `${outputText}; return cancel()`)(...Object.values(context))
  assert.deepEqual(formData, { writer_name: '편집 중 이름', reviewer_signature: 'current-signature', writer_signature: 'writer-signature' })
  return { calls, alerts, savingStates, reloads }
}

test('화면 취소 성공은 DELETE 후 목록을 갱신하고 편집 값·서명을 보존한다', async () => {
  const result = await cancelFromForm()
  assert.equal(result.calls[0].method, 'DELETE')
  assert.deepEqual(JSON.parse(result.calls[0].body), { report_id: REPORT_ID })
  assert.equal(result.reloads, 1)
  assert.deepEqual(result.savingStates, [true, false])
})

test('화면 취소 실패는 편집 값을 유지하고 진행 상태를 해제한다', async () => {
  const result = await cancelFromForm({}, false)
  assert.equal(result.reloads, 0)
  assert.deepEqual(result.savingStates, [true, false])
  assert.match(result.alerts[0], /취소 실패/)
})

test('권한·반려 대상이 없거나 저장·반려 처리 중이면 취소 요청을 보내지 않는다', async () => {
  for (const overrides of [{ canReject: false }, { activeReport: null }, { activeReport: { rejected_at: '2026-09-14', rejected_by: 'another-client' } }, { activeReport: { rejected_at: '2026-09-14', rejected_by: null } }, { editingReportId: null }, { saving: true }, { rejectionSaving: true }]) {
    const result = await cancelFromForm(overrides)
    assert.equal(result.calls.length, 0)
    assert.deepEqual(result.savingStates, [])
  }
})

test('다른 사용자도 취소 버튼을 볼 수 있지만 비활성화되고 이유가 표시된다', () => {
  assert.ok(cancelButton)
  const { outputText } = ts.transpileModule(`const canCancelRejection = ${cancelPermission}; const button = ${cancelButton}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  })
  for (const rejectedBy of ['client', 'another-client', null]) {
    const button = new Function('React', 'canReject', 'userId', 'activeReport', 'signer', 'editingReportId', 'saving', 'rejectionSaving', 'handleCancelRejection', `${outputText}; return button`)(
      { createElement: (tag, props) => ({ tag, props }) }, true, 'client', { rejected_at: '2026-09-14', rejected_by: rejectedBy }, { sig: 'reviewer_signature' }, REPORT_ID, false, false, () => {},
    )
    assert.equal(button.tag, 'button')
    assert.equal(button.props.disabled, rejectedBy !== 'client')
    if (rejectedBy !== 'client') assert.match(button.props.title, /본인만/)
  }
})
