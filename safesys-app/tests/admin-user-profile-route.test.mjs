// 관리자 프로필 PATCH의 역할별 회사 정규화와 오류 응답을 검증한다.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const source = readFileSync(new URL('../src/app/api/admin/users/[id]/route.ts', import.meta.url), 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
function load({ profile = { role: '발주청', company_name: null }, auth = { ok: true }, readError = null, writeError = null, missingOnWrite = false } = {}) {
  const writes = []; const reads = []; const logs = []
  const db = { from(table) {
    assert.equal(table, 'user_profiles')
    let update
    const chain = {
      update(value) { update = value; writes.push(value); return chain },
      select(fields) { if (!update) reads.push(fields); return chain },
      eq(key, value) { assert.equal(key, 'id'); assert.equal(value, 'target'); return chain },
      async maybeSingle() {
        if (!update) return { data: profile, error: readError }
        const merged = { ...profile, ...update }
        const constraint = merged.role === '발주청' && merged.company_name !== null
          ? { code: '23514', message: 'violates check_company_name_by_role', details: 'private record' } : null
        return { data: missingOnWrite ? null : { id: 'target' }, error: writeError ?? constraint }
      },
    }
    return chain
  } }
  const dependencies = {
    'next/server': { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } },
    '@/lib/admin-auth': { requireAdmin: async () => auth },
    '@/lib/supabase-admin': { supabaseAdmin: db },
  }
  const module = { exports: {} }
  new Function('module', 'exports', 'require', 'console', code)(module, module.exports, name => dependencies[name], { error: (...args) => logs.push(args) })
  return { writes, reads, logs, patch: body => module.exports.PATCH({ json: async () => body }, { params: Promise.resolve({ id: 'target' }) }) }
}

test('운영 재현: 발주청 빈 회사명은 null로 저장되어 성공한다', async () => {
  const r = load()
  assert.equal((await r.patch({ role: '발주청', company_name: '' })).status, 200)
  assert.equal(r.writes[0].company_name, null)
})
test('시공사에서 발주청 변경은 생략 또는 입력한 회사명을 제거한다', async () => {
  for (const extra of [{}, { company_name: '기존 회사' }]) {
    const r = load({ profile: { role: '시공사', company_name: '기존 회사' } })
    assert.equal((await r.patch({ role: '발주청', ...extra })).status, 200)
    assert.equal(r.writes[0].company_name, null)
  }
})
test('역할 생략 시 기존 역할에 따라 처리하며 생략 필드는 보존한다', async () => {
  for (const role of ['발주청', '시공사', '감리단']) {
    const r = load({ profile: { role, company_name: role === '발주청' ? null : '회사' } })
    assert.equal((await r.patch({ full_name: ' 이름 ' })).status, 200)
    assert.equal(r.writes[0].full_name, '이름')
    assert.ok(!('role' in r.writes[0]))
    assert.ok(!('phone_number' in r.writes[0]))
    if (role === '발주청') assert.equal(r.writes[0].company_name, null)
    else assert.ok(!('company_name' in r.writes[0]))
  }
  const r = load()
  assert.equal((await r.patch({ company_name: '임의 회사' })).status, 200)
  assert.equal(r.writes[0].company_name, null)
})
test('시공사·감리단은 회사 공백을 거부하고 유효 회사명은 trim한다', async () => {
  for (const role of ['시공사', '감리단']) {
    for (const company_name of ['', ' \t ', null]) {
      const r = load({ profile: { role, company_name: '회사' } })
      assert.equal((await r.patch({ company_name })).status, 400)
      assert.equal(r.writes.length, 0)
    }
    const r = load()
    assert.equal((await r.patch({ role, company_name: ' 회사 ' })).status, 200)
    assert.equal(r.writes[0].company_name, '회사')
    assert.equal((await load().patch({ role })).status, 400)
  }
})
test('미인증·비관리자는 DB 접근 없이 원래 인증 오류를 반환한다', async () => {
  for (const status of [401, 403]) {
    const r = load({ auth: { ok: false, status, error: '권한 없음' } })
    assert.equal((await r.patch({ company_name: '' })).status, status)
    assert.equal(r.writes.length + r.reads.length, 0)
  }
})
test('없는 프로필과 수정 중 삭제된 프로필은 404', async () => {
  const r = load({ profile: null })
  assert.equal((await r.patch({ full_name: '이름' })).status, 404)
  assert.equal(r.writes.length, 0)
  assert.equal((await load({ missingOnWrite: true }).patch({ full_name: '이름' })).status, 404)
})
test('알려진 회사 제약은 400, 다른 DB 오류는 500이며 PII를 노출하지 않는다', async () => {
  for (const [option, error, status] of [
    ['writeError', { code: '23514', message: 'violates check_company_name_by_role', details: 'private record' }, 400],
    ['writeError', { code: '23514', message: 'other constraint', details: 'private record' }, 500],
    ['readError', { code: '08006', message: 'private record', details: 'private record' }, 500],
  ]) {
    const r = load({ [option]: error })
    const response = await r.patch({ full_name: '이름' })
    assert.equal(response.status, status)
    assert.doesNotMatch(JSON.stringify([response, r.logs]), /private record/)
    if (option === 'readError') assert.equal(r.writes.length, 0)
  }
})
test('잘못된 입력은 DB 접근 전에 400', async () => {
  for (const body of [null, [], {}, { role: 'invalid' }, { company_name: 12 }]) {
    const r = load()
    assert.equal((await r.patch(body)).status, 400)
    assert.equal(r.writes.length + r.reads.length, 0)
  }
})
