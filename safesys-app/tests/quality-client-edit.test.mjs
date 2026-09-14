// 품질시험 세 탭의 실제 저장 함수와 UPDATE RLS에서 발주청 수정 및 작성자 보존을 검증한다.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'
import { PGlite } from '@electric-sql/pglite'

const tabs = [
  ['QualitySummaryTab', 'quality_summary_reports', 'confirmer_signature'],
  ['QualityVerificationRequestsTab', 'quality_verification_requests', 'sender_signature'],
  ['QualityTestRecordsTab', 'quality_test_records', 'quality_engineer_signature'],
]

async function readHandler(tab) {
  const source = await readFile(new URL(`../src/components/project/quality/${tab}.tsx`, import.meta.url), 'utf8')
  const ast = ts.createSourceFile(`${tab}.tsx`, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let handler
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'handleSave') handler = node.initializer.getText(ast)
    ts.forEachChild(node, visit)
  }
  visit(ast)
  assert.ok(handler, `${tab} 저장 함수를 찾지 못했다`)
  return ts.transpileModule(`const handleSave = ${handler}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText
}

async function save(tab, { role = '발주청', author = 'other', creating = false, zeroRows = false, removedOtherItem = false } = {}) {
  const calls = [], alerts = []
  let resets = 0
  const record = { id: 'record', created_by: author, serial_no: 1 }
  const supabase = {
    from(table) {
      let call
      const query = {
        update(payload) { call = { table, action: 'update', payload }; calls.push(call); return query },
        insert(payload) { calls.push({ table, action: 'insert', payload: payload[0] }); return Promise.resolve({ error: null }) },
        eq() { return query },
        select() { return query },
        single() { return Promise.resolve(zeroRows ? { data: null, error: new Error('수정 대상이 없습니다.') } : { data: { id: 'record' }, error: null }) },
        then(resolve) { resolve({ error: null }) },
      }
      return query
    },
  }
  const context = {
    formData: { test_items: '압축강도', confirmer_signature: 'signed', sender_signature: 'signed' },
    commonData: {
      quality_engineer_name: '담당자', quality_engineer_signature: 'signed', test_date: '2026-09-14',
      test_category: '확인시험', target_material: '콘크리트', work_type: '콘크리트', supplier_factory: '공장',
      test_place: '현장', photo_url: 'photo', note: '', supervision_engineer_name: '감독',
    },
    items: [{ ...(creating ? {} : { _id: 'record' }), test_date: '2026-09-14', test_item: '압축강도', test_standard: '24', test_result: '25', result_verdict: '합격' }],
    reports: [record], records: [record, ...(removedOtherItem ? [{ ...record, id: 'removed', created_by: 'other' }] : [])], editingReportId: creating ? null : 'record',
    editingRecordId: creating ? null : 'record', editingSerialNo: creating ? null : 1,
    selectedSummaryId: '', projectId: 'project', userId: 'user', currentUserRole: role,
    canSignQualityRecords: role === '발주청', supabase, alert: (value) => alerts.push(value),
    setSaving() {}, resetForm() { resets++ }, loadReports() {}, loadRecords() {}, loadSummaries() {}, computeNextSerialNo: () => 2,
  }
  const run = new Function(...Object.keys(context), `${await readHandler(tab)}; return handleSave()`)
  await run(...Object.values(context))
  return { calls, alerts, resets }
}

for (const [tab, table, signature] of tabs) {
  test(`${tab}: 발주청이 타작성자 서명을 저장하고 원래 작성자를 보존한다`, async () => {
    const result = await save(tab)
    assert.deepEqual(result.alerts, [])
    assert.equal(result.calls.length, 1)
    assert.equal(result.calls[0].table, table)
    assert.equal(result.calls[0].payload[signature], 'signed')
    assert.equal(Object.hasOwn(result.calls[0].payload, 'created_by'), false)
    assert.equal(result.resets, 1)
  })
  for (const role of ['시공사', '감리단', undefined]) {
    test(`${tab}: ${role ?? '역할 없음'} 타작성자 수정은 차단한다`, async () => {
      const result = await save(tab, { role: role ?? null })
      assert.equal(result.calls.length, 0)
      assert.equal(result.alerts.length, 1)
      assert.equal(result.resets, 0)
    })
  }
  test(`${tab}: 작성자 수정은 허용하고 RLS 0행이면 폼을 유지한다`, async () => {
    const own = await save(tab, { role: '시공사', author: 'user' })
    assert.equal(own.calls.length, 1)
    assert.deepEqual(own.alerts, [])
    const denied = await save(tab, { role: '시공사', author: 'user', zeroRows: true })
    assert.equal(denied.alerts.length, 1)
    assert.match(denied.alerts[0], /저장 실패/)
    assert.equal(denied.resets, 0)
  })
  test(`${tab}: 신규 등록에는 현재 작성자를 지정한다`, async () => {
    const result = await save(tab, { creating: true })
    assert.equal(result.calls[0].action, 'insert')
    assert.equal(result.calls[0].payload.created_by, 'user')
  })
}

test('실시대장 편집에서 타작성자 항목을 제거하면 어떤 항목도 먼저 저장하지 않는다', async () => {
  const result = await save('QualityTestRecordsTab', { removedOtherItem: true })
  assert.equal(result.calls.length, 0)
  assert.equal(result.resets, 0)
  assert.match(result.alerts[0], /다른 작성자의 시험 항목/)
})

test('실제 RLS는 본부·지사 발주청 수정과 기존 작성자만 허용하며 INSERT/DELETE 정책을 유지한다', async (t) => {
  const db = new PGlite()
  t.after(() => db.close())
  const ids = Array.from({ length: 6 }, (_, n) => `00000000-0000-0000-0000-${String(n + 1).padStart(12, '0')}`)
  await db.exec(`
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE TABLE public.projects (id uuid PRIMARY KEY, created_by uuid);
    CREATE TABLE public.project_shares (project_id uuid, shared_with uuid);
    CREATE FUNCTION public.is_project_owner(project_id uuid, user_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.created_by = user_id) $$;
    CREATE TYPE public.user_role AS ENUM ('발주청', '감리단', '시공사');
    CREATE TABLE public.user_profiles (id uuid PRIMARY KEY, role user_role, hq_division text, branch_division text);
  `)
  await db.exec(await readFile(new URL('../database/add_quality_test_ledger_tables.sql', import.meta.url), 'utf8'))
  await db.exec(await readFile(new URL('../../database/20260720-1515_quality_summary_delete_policy.sql', import.meta.url), 'utf8'))
  const policySnapshot = () => db.query("SELECT tablename, policyname, cmd, qual, with_check FROM pg_policies WHERE schemaname = 'public' AND cmd <> 'UPDATE' ORDER BY tablename, policyname")
  const before = await policySnapshot()
  await db.exec(await readFile(new URL('../../database/20260914-1333_quality_client_update_policy.sql', import.meta.url), 'utf8'))
  await db.exec(await readFile(new URL('../../database/20260914-1339_quality_preserve_created_by.sql', import.meta.url), 'utf8'))
  assert.deepEqual(await policySnapshot(), before)
  await db.exec('GRANT USAGE ON SCHEMA public, auth TO authenticated, anon, service_role; GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, anon, service_role;')
  for (const id of ids) await db.query('INSERT INTO auth.users VALUES ($1)', [id])
  await db.query('INSERT INTO projects (id) VALUES ($1)', [ids[0]])
  for (const [index, role, branch] of [[0, '시공사', '지사'], [1, '발주청', '본부'], [2, '발주청', '지사'], [3, '시공사', '지사'], [4, '감리단', '지사']]) {
    await db.query('INSERT INTO user_profiles VALUES ($1, $2, $3, $4)', [ids[index], role, '본부', branch])
  }
  for (const [, table, signature] of tabs) {
    await db.query(`INSERT INTO ${table} (project_id, created_by) VALUES ($1, $2)`, [ids[0], ids[0]])
    for (let index = 0; index < ids.length; index++) {
      await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [ids[index]])
      await db.exec('SET ROLE authenticated')
      const result = await db.query(`UPDATE ${table} SET ${signature} = 'signed' RETURNING created_by`)
      assert.equal(result.rows.length, index <= 2 ? 1 : 0, `${table} 사용자 ${index} 수정 권한`)
      if (result.rows.length) assert.equal(result.rows[0].created_by, ids[0])
      if (index === 1 || index === 2) {
        await assert.rejects(db.query(`UPDATE ${table} SET created_by = $1`, [ids[index]]), /QUALITY_CREATED_BY_IMMUTABLE/)
        await assert.rejects(db.query(`UPDATE ${table} SET created_by = NULL`), /QUALITY_CREATED_BY_IMMUTABLE/)
      }
      if (index > 0) {
        await db.exec('BEGIN')
        const deleted = await db.query(`DELETE FROM ${table} RETURNING id`)
        assert.equal(deleted.rows.length, table === 'quality_summary_reports' && (index === 1 || index === 2) ? 1 : 0)
        await db.exec('ROLLBACK')
        await assert.rejects(db.query(`INSERT INTO ${table} (project_id, created_by) VALUES ($1, $2)`, [ids[0], ids[0]]), /row-level security/)
      }
      await db.exec('RESET ROLE')
    }
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [ids[0]])
    await db.exec('SET ROLE authenticated')
    await assert.rejects(db.query(`UPDATE ${table} SET created_by = $1`, [ids[3]]), /QUALITY_CREATED_BY_IMMUTABLE/)
    await db.exec('RESET ROLE')
    await db.query("SELECT set_config('request.jwt.claim.sub', '', false)")
    await db.exec('SET ROLE anon')
    assert.equal((await db.query(`UPDATE ${table} SET ${signature} = 'anonymous' RETURNING id`)).rows.length, 0)
    await db.exec('RESET ROLE')
    // 관리 작업의 작성자 정정과 기존 회원 삭제 FK SET NULL 동작은 유지한다.
    await db.exec('SET ROLE service_role')
    assert.equal((await db.query(`UPDATE ${table} SET created_by = $1 RETURNING created_by`, [ids[5]])).rows[0].created_by, ids[5])
    await db.exec('RESET ROLE')
    assert.equal((await db.query(`UPDATE ${table} SET created_by = $1 RETURNING created_by`, [ids[0]])).rows[0].created_by, ids[0])
    await db.exec(`ALTER TABLE ${table} DROP CONSTRAINT ${table}_created_by_fkey, ADD CONSTRAINT ${table}_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL`)
  }
  await db.query('DELETE FROM auth.users WHERE id = $1', [ids[0]])
  for (const [, table] of tabs) {
    assert.equal((await db.query(`SELECT created_by FROM ${table}`)).rows[0].created_by, null)
  }
})
