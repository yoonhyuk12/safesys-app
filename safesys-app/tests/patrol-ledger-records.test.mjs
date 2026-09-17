// 순회점검대장 초안·검증·불변 편집과 TBM 요약을 검증한다.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

async function transpile(path, dependencies = {}) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
  const module = { exports: {} }
  new Function('module', 'exports', 'require', outputText)(module, module.exports, name => {
    assert.ok(name in dependencies, name)
    return dependencies[name]
  })
  return module.exports
}
const types = await transpile('../src/lib/patrol-ledger/types.ts')
const records = await transpile('../src/lib/patrol-ledger/records.ts', { '@/lib/supabase': { supabase: {} }, '@/lib/patrol-ledger/types': types })
const tbm = await transpile('../src/lib/patrol-ledger/tbm-work.ts')
const signature = 'data:image/png;base64,iVBORw0KGgo' + 'A'.repeat(200)
const init = { districtName: '지구', contractorName: '시공사', inspectorName: '홍길동', inspectorAffiliation: '지사' }
const aiItems = [{ category: '작업장 공통', text: '안전통로는 확보되어 있는가' }]
const valid = () => ({ ...records.createPatrolLedgerDraft(init), signature, items: records.buildPatrolLedgerItems(aiItems) })

test('초안 기본값과 로컬 날짜, 항목 번호와 미점검 결과', () => {
  assert.equal(records.patrolLedgerToday(new Date(2026, 8, 17, 23)), '2026-09-17')
  const draft = records.createPatrolLedgerDraft(init)
  assert.equal(draft.inspector_name, '홍길동')
  assert.equal(draft.district_name, '지구')
  assert.equal(draft.contractor_name, '시공사')
  assert.equal(draft.inspector_affiliation, '지사')
  assert.equal(draft.finding_photo_url, null)
  assert.deepEqual(records.buildPatrolLedgerItems(aiItems), [{ ...aiItems[0], no: 1, result: '' }])
})
test('개별·전체 편집은 원본 배열과 항목을 바꾸지 않는다', () => {
  const items = records.buildPatrolLedgerItems(aiItems)
  assert.equal(records.setPatrolLedgerItemResult(items, 0, '양호')[0].result, '양호')
  assert.equal(records.setPatrolLedgerItemText(items, 0, '수정')[0].text, '수정')
  assert.equal(records.setAllPatrolLedgerResults(items, '미흡')[0].result, '미흡')
  assert.equal(items[0].result, '')
  assert.equal(items[0].text, aiItems[0].text)
})
test('검증은 날짜·성명·서명·항목의 잘못된 값을 거부한다', () => {
  assert.equal(records.validatePatrolLedgerDraft(valid()), null)
  for (const patch of [
    { inspection_date: '2026-02-30' }, { inspection_date: 'bad' },
    { inspector_name: '' }, { inspector_name: '홍\n길동' }, { inspector_name: '가'.repeat(101) },
    { signature: '' }, { signature: 'data:image/png;base64,abc' },
    { items: [] }, { items: Array(11).fill(valid().items[0]) },
    { items: [{ ...valid().items[0], text: ' ' }] },
    { items: [{ ...valid().items[0], result: '오류' }] },
  ]) assert.equal(typeof records.validatePatrolLedgerDraft({ ...valid(), ...patch }), 'string')
  assert.equal(records.isBlankPatrolLedgerSignature(signature), false)
  assert.equal(records.isBlankPatrolLedgerSignature(null), true)
})
test('기록을 초안으로 바꿀 때 항목을 복사한다', () => {
  const record = { ...valid(), id: 'id', project_id: 'p', created_by: 'u', created_at: '', updated_at: '' }
  const draft = records.patrolLedgerToDraft(record)
  draft.items[0].text = '변경'
  assert.equal(record.items[0].text, aiItems[0].text)
  assert.equal('id' in draft, false)
})
test('TBM 요약은 빈 작업·작업없음·중복 작업을 제외하고 부가정보를 한 줄로 묶는다', () => {
  const summary = tbm.summarizeTbmWork([
    { construction_company: '가나', today_work: ' 철근 배근 ', location: '1구역', risk_work_type: '고소', equipment_input: '크레인', personnel_total_count: 3 },
    { today_work: '철근 배근' }, { today_work: '작업없음' }, { today_work: '' }, { today_work: '콘크리트\n타설' },
  ])
  assert.equal(summary, '• [가나] 철근 배근 (1구역, 고소, 크레인, 3명)\n• 콘크리트 타설')
})
test('TBM 조회는 사용자 클라이언트로 두 갈래를 조회하고 id를 중복 제거한다', async () => {
  const queries = []
  const client = { from(table) {
    assert.equal(table, 'tbm_submissions')
    const calls = []; queries.push(calls)
    const chain = Object.fromEntries(['select', 'eq', 'gte', 'lte'].map(method => [method, (...args) => { calls.push([method, ...args]); return chain }]))
    chain.then = resolve => resolve({ data: [{ id: '1', today_work: '철근 배근', address: '1구역' }], error: null })
    return chain
  } }
  const result = await tbm.loadTbmWorkForDate(client, { id: 'p', project_name: '사업', managing_hq: '본부', managing_branch: '지사' }, '2026-09-17')
  assert.deepEqual(result, { summary: '• 철근 배근 (1구역)', count: 1 })
  assert.equal(queries.length, 2)
  for (const calls of queries) {
    assert.ok(calls.some(call => call[1] === 'status' && call[2] === 'submitted'))
    assert.ok(calls.some(call => call[0] === 'lte' && call[2] === '2026-09-17T23:59:59'))
  }
})
test('CRUD는 기록 정렬·불변 저장 열·누락 테이블·권한 오류를 구분한다', async () => {
  const calls = []
  let response = { data: [], error: null, count: 3 }
  const chain = {}
  for (const method of ['select', 'eq', 'order', 'insert', 'update', 'delete']) chain[method] = (...args) => { calls.push([method, ...args]); return chain }
  chain.then = resolve => resolve(response)
  chain.single = chain.maybeSingle = async () => response
  const module = await transpile('../src/lib/patrol-ledger/records.ts', { '@/lib/supabase': { supabase: { from: () => chain } }, '@/lib/patrol-ledger/types': types })
  await module.getPatrolLedgerInspections('p')
  assert.deepEqual(calls.filter(c => c[0] === 'order').map(c => c[1]), ['inspection_date', 'created_at'])
  assert.equal(await module.countPatrolLedgerInspections('p'), 3)
  response = { data: { id: 'saved' }, error: null }
  await module.createPatrolLedgerInspection('p', 'u', { ...valid(), created_by: 'forged', project_id: 'forged' })
  const inserted = calls.find(c => c[0] === 'insert')[1][0]
  assert.equal(inserted.created_by, 'u'); assert.equal(inserted.project_id, 'p')
  await module.updatePatrolLedgerInspection('saved', { ...valid(), created_by: 'forged', project_id: 'forged' })
  const updated = calls.find(c => c[0] === 'update')[1]
  assert.equal('created_by' in updated, false); assert.equal('project_id' in updated, false)
  response = { data: null, error: null }
  await assert.rejects(module.updatePatrolLedgerInspection('missing', valid()), /본인이 제출/)
  await assert.rejects(module.deletePatrolLedgerInspection('missing'), /삭제할 권한/)
  response = { data: null, error: { code: 'PGRST205' } }
  await assert.rejects(module.getPatrolLedgerInspections('p'), /아직 개설되지/)
})
test('사진 업로드는 기존 버킷의 현장 경로와 안전한 파일명을 쓴다', async () => {
  let uploaded
  const module = await transpile('../src/lib/patrol-ledger/records.ts', {
    '@/lib/patrol-ledger/types': types,
    '@/lib/supabase': { supabase: { storage: { from: bucket => {
      assert.equal(bucket, 'safety-inspection-photos')
      return { upload: async (path, file) => { uploaded = { path, file }; return { error: null } }, getPublicUrl: path => ({ data: { publicUrl: `https://example.com/${path}` } }) }
    } } } },
  })
  const file = { name: '현장 사진/1.jpg' }
  const url = await module.uploadPatrolLedgerPhoto('project', file)
  assert.match(uploaded.path, /^patrol-ledger\/project\/\d+_[A-Za-z0-9._-]+$/)
  assert.equal(uploaded.file, file); assert.equal(url, `https://example.com/${uploaded.path}`)
})
