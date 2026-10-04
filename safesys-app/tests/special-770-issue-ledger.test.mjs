// 770 관리대장의 지적 변환과 최신 원본 조치 갱신을 검증한다.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import React from 'react'
import { createClient } from '@supabase/supabase-js'

async function load(name, dependencies = {}) {
  const source = await readFile(new URL(`../src/lib/special-inspection-770/${name}.ts`, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } })
  const module = { exports: {} }
  vm.runInThisContext(`(function(module,exports,require){${outputText}\n})`)(module, module.exports, name => {
    assert.ok(name in dependencies, name)
    return dependencies[name]
  })
  return module.exports
}
const types = await load('types')
const summary = await load('summary', { '@/lib/special-inspection-770/types': types })
const { special770LedgerRows, patchSpecial770Action, saveSpecial770Action } = await load('issue-ledger', {
  '@/lib/special-inspection-770/summary': summary,
})
const fixture = () => ({ inspection_team: '점검반', metadata: { keep: true }, excavators: [
  { id: 'a', vehicle_no: '123', pin_photo_url: 'pin', items: {
    '1-1': { judgement: '부적정', finding: '미흡', action_due_date: '2026-10-10' },
    '1-2': { judgement: '적정', before_photo_url: 'proof' },
    '1-3': { judgement: '해당없음' },
    '4-1': { judgement: '부적정', after_photo_url: 'N/A' },
  }, etc_text: '기타 위험' },
  { id: 'b', vehicle_no: '456', items: { '1-1': { judgement: '부적정', after_photo_url: 'done' } } },
] })
test('부적정만 안정적인 키로 변환하고 기타 문구·조치·사진을 보존한다', () => {
  const rows = special770LedgerRows('inspection', fixture())
  assert.equal(rows.length, 3)
  assert.equal(new Set(rows.map(row => row.key)).size, 3)
  assert.equal(rows[0].findingText, '미흡')
  assert.match(rows[0].location, /123.*1-1/)
  assert.equal(rows[1].findingText, '기타 위험')
  assert.equal(rows[1].afterPhotoUrl, null)
  assert.equal(rows[2].afterPhotoUrl, 'done')
  assert.deepEqual(rows[0].source, { kind: 'safety_770', inspectionId: 'inspection', excavatorId: 'a', code: '1-1' })
})
test('굴착기 순서가 바뀌어도 id/code로 갱신하고 모든 다른 필드를 보존한다', () => {
  const data = fixture()
  data.excavators.reverse()
  const original = structuredClone(data)
  const updated = patchSpecial770Action(data, 'a', '1-1', { action: '조치', after_photo_url: 'new' })
  assert.deepEqual(data, original)
  assert.deepEqual(updated.metadata, original.metadata)
  assert.deepEqual(updated.excavators[0], original.excavators[0])
  assert.equal(updated.excavators[1].items['1-1'].action_due_date, '2026-10-10')
  assert.equal(updated.excavators[1].items['1-1'].action, '조치')
  assert.equal(patchSpecial770Action(updated, 'a', '1-1', { after_photo_url: null }).excavators[1].items['1-1'].action, '조치')
  assert.throws(() => patchSpecial770Action(data, 'missing', '1-1', { action: '' }))
  assert.throws(() => patchSpecial770Action(data, 'a', '1-2', { action: '' }))
})
test('저장 직전 최신 JSON을 읽고 조회·갱신 오류와 갱신 0건을 전파한다', async () => {
  for (const failure of [null, 'read', 'write', 'empty']) {
    let payload
    const client = { from() { return {
      select() { return this }, eq() { return this },
      update(value) { payload = value; return this },
      maybeSingle() { return this.single() },
      async single() {
        if (!payload) return { data: { excavator_inspection: fixture() }, error: failure === 'read' ? new Error('read') : null }
        return { data: failure === 'empty' ? null : { id: 'inspection' }, error: failure === 'write' ? new Error('write') : null }
      },
    } } }
    const operation = saveSpecial770Action(client, 'project', { inspectionId: 'inspection', excavatorId: 'a', code: '1-1' }, { action: 'new' })
    if (failure) await assert.rejects(operation)
    else { await operation; assert.equal(payload.excavator_inspection.excavators[0].items['1-1'].action, 'new'); assert.deepEqual(payload.excavator_inspection.metadata, { keep: true }) }
  }
})

test('같은 JSON을 읽은 두 저장 중 충돌한 저장은 첫 조치를 덮어쓰지 않는다', async () => {
  let current = fixture()
  const original = structuredClone(current)
  let reads = 0, releaseReads
  const bothRead = new Promise(resolve => { releaseReads = resolve })
  let releaseFirstWrite
  const firstWritten = new Promise(resolve => { releaseFirstWrite = resolve })
  const updates = []
  const client = createClient('https://example.supabase.co', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input))
      assert.equal(url.searchParams.get('id'), 'eq.inspection')
      assert.equal(url.searchParams.get('project_id'), 'eq.project')
      if (init.method === 'GET') {
        const snapshot = structuredClone(current)
        if (++reads === 2) releaseReads()
        await bothRead
        return new Response(JSON.stringify({ excavator_inspection: snapshot }), { status: 200 })
      }
      assert.equal(init.method, 'PATCH')
      const next = JSON.parse(init.body).excavator_inspection
      const isFirst = next.excavators[0].items['1-1'].action === '먼저 저장'
      if (!isFirst) await firstWritten
      const expected = url.searchParams.get('excavator_inspection')
      const matches = expected === null || expected === `eq.${JSON.stringify(current)}`
      updates.push(expected)
      if (matches) current = next
      if (isFirst) releaseFirstWrite()
      return matches
        ? new Response(JSON.stringify({ id: 'inspection' }), { status: 200 })
        : new Response(JSON.stringify({ code: 'PGRST116', details: 'The result contains 0 rows', message: 'Cannot coerce the result to a single JSON object' }), { status: 406 })
    } },
  })
  const outcomes = await Promise.allSettled([
    saveSpecial770Action(client, 'project', { inspectionId: 'inspection', excavatorId: 'a', code: '1-1' }, { action: '먼저 저장' }),
    saveSpecial770Action(client, 'project', { inspectionId: 'inspection', excavatorId: 'b', code: '1-1' }, { action: '충돌 저장' }),
  ])
  assert.equal(outcomes[0].status, 'fulfilled')
  assert.equal(outcomes[1].status, 'rejected')
  assert.match(outcomes[1].reason.message, /새로고침/)
  assert.deepEqual(updates, [1, 2].map(() => `eq.${JSON.stringify(original)}`))
  assert.deepEqual(current, patchSpecial770Action(original, 'a', '1-1', { action: '먼저 저장' }))
})

test('실제 관리대장 화면은 770 조치 편집과 다운로드를 연결하고 해당없음을 숨긴다', async () => {
  const source = await readFile(new URL('../src/app/project/[id]/issue-management/page.tsx', import.meta.url), 'utf8')
  const ledger = await load('issue-ledger', { '@/lib/special-inspection-770/summary': summary })
  const row = { ...special770LedgerRows('inspection', fixture())[0], sourceLabel: '특별점검', inspectionDate: '2026-10-04', inspectorName: '점검반' }
  const states = [{ project_name: '현장' }, null, [row], false, false, null, null, null, '수정 조치']
  let index = 0, saved, request, report
  const fakeReact = { ...React, useState: initial => {
    const slot = index++
    return [slot in states ? states[slot] : initial, value => { states[slot] = value }]
  }, useEffect() {}, useMemo: fn => fn(), useCallback: fn => fn }
  const module = { exports: {} }
  const dependencies = {
    react: fakeReact,
    'next/navigation': { useRouter: () => ({}), useParams: () => ({ id: 'project' }) },
    '@/contexts/AuthContext': { useAuth: () => ({ user: { id: 'user' }, userProfile: { role: '발주청' } }) },
    '@/lib/supabase': { supabase: { from: () => ({ select() { return this }, eq() { return this }, single: async () => ({ data: null }), then: resolve => resolve({ data: [] }) }) } },
    '@/lib/special-inspection-770/issue-ledger': { ...ledger, saveSpecial770Action: async (...args) => { saved = args } },
    '@/components/project/special-770/photo-storage': {},
    '@/lib/issue-ledger': { isNaValue: value => value === 'N/A', extractUploadDate: () => null },
    '@/lib/safety-inspection-types': { isSpecial287Type: () => false, isSpecial770Type: () => true },
    '@/lib/excel/corrective-action-request-export': { downloadCorrectiveActionRequestExcel: async value => { request = value } },
    '@/lib/excel/issue-action-report-export': { downloadIssueActionReportExcel: async value => { report = value } },
  }
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } })
  vm.runInThisContext(`(function(module,exports,require){${outputText}\n})`)(module, module.exports, name => dependencies[name] || {})
  const nodes = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)]
  const text = node => node == null || typeof node === 'boolean' ? '' : typeof node !== 'object' ? String(node) : Array.isArray(node) ? node.map(text).join('') : text(node.props?.children)
  const render = () => { index = 0; return nodes(module.exports.default()) }
  let tree = render()
  assert.ok(tree.some(node => node.type === 'span' && text(node) === '조치대기'))
  assert.ok(!tree.some(node => node.type === 'button' && text(node).includes('해당없음')))
  await tree.find(node => node.props?.title === '시정조치요구서 다운로드 (별지 6호)').props.onClick()
  assert.match(request.content, /미흡/)
  await tree.find(node => node.props?.title === '조치결과 보고 다운로드 (별지 7호)').props.onClick()
  assert.equal(report.findingText, '미흡')
  states[7] = row.key
  tree = render()
  await tree.find(node => node.type === 'button' && text(node) === '저장').props.onClick()
  assert.equal(saved[2].excavatorId, 'a')
  assert.deepEqual(saved[3], { action: '수정 조치' })
})
