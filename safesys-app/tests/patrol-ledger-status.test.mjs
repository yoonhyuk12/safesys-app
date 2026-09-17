// 순회점검 주간 범위와 미점검 포함 본부·지사·현장 집계를 검증한다.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

async function transpile(relativePath) {
  const source = await readFile(new URL(relativePath, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  })
  const module = { exports: {} }
  new Function('module', 'exports', outputText)(module, module.exports)
  return module.exports
}

const { patrolStatusWeekRange, isPatrolStatusProjectActive, aggregatePatrolStatus, groupPatrolStatus, sumPatrolStatus } =
  await transpile('../src/lib/patrol-ledger/status-aggregate.ts')

const project = (id, hq, branch) => ({ id, project_name: id, managing_hq: hq, managing_branch: branch })
const record = (id, projectId, date, overrides = {}) => ({
  id, project_id: projectId, inspection_date: date, inspector_name: '점검자',
  items: [{ result: '미흡' }, { result: '양호' }, { result: '미흡' }],
  finding_photo_kind: 'finding', finding_photo_url: 'https://example.com/photo.jpg',
  theme: '추락 예방', ...overrides,
})

test('월요일부터 일요일 범위와 전후 주는 월·연도 경계에서도 이어진다', () => {
  assert.deepEqual(patrolStatusWeekRange('2026-12-28'), { start: '2026-12-28', end: '2027-01-03' })
  assert.deepEqual(patrolStatusWeekRange('2026-12-28', 1), { start: '2027-01-04', end: '2027-01-10' })
  assert.deepEqual(patrolStatusWeekRange('2026-03-02', -1), { start: '2026-02-23', end: '2026-03-01' })
})

test('분기 경계 주는 어느 분기든 활성일 때 포함하며 구형 true도 인정한다', () => {
  const range = patrolStatusWeekRange('2026-09-28')
  for (const [is_active, expected] of [
    [true, true], [false, false], [null, false], [undefined, false],
    [{ q3: true, q4: false }, true], [{ q3: false, q4: true }, true],
    [{ q2: true, q3: false, q4: false }, false],
  ]) assert.equal(isPatrolStatusProjectActive({ ...project('a', '경기', 'A'), is_active }, range), expected)
  assert.equal(isPatrolStatusProjectActive({ is_active: { q1: true, q4: false } }, patrolStatusWeekRange('2026-12-28')), true)
})

test('기간 양 끝 포함, 관할 밖·기간 밖 제외, 미점검 현장도 0건으로 남는다', () => {
  const rows = aggregatePatrolStatus([project('a', '경기', 'A'), project('b', '경기', 'A')], [
    record('1', 'a', '2026-09-14'), record('2', 'a', '2026-09-20', { inspector_name: '최신', theme: '굴착', finding_photo_kind: 'overview' }),
    record('3', 'a', '2026-09-13'), record('4', 'a', '2026-09-21'), record('5', 'other', '2026-09-15'),
  ], { start: '2026-09-14', end: '2026-09-20' })
  assert.equal(rows.length, 2)
  assert.deepEqual([rows[0].inspectionCount, rows[0].poorCount, rows[0].photoCount], [2, 4, 1])
  assert.equal(rows[0].lastInspectionDate, '2026-09-20')
  assert.equal(rows[0].inspectorName, '최신')
  assert.equal(rows[0].themes, '굴착 / 추락 예방')
  assert.equal(rows[1].inspectionCount, 0)
  assert.equal(rows[1].uninspectedCount, 1)
  assert.equal(rows[1].lastInspectionDate, '')
})

test('사진 URL 없는 지적과 전경사진은 지적사진 건수에 넣지 않는다', () => {
  const rows = aggregatePatrolStatus([project('a', '경기', 'A')], [
    record('1', 'a', '2026-09-14', { finding_photo_url: null, items: [] }),
    record('2', 'a', '2026-09-14', { finding_photo_kind: 'overview', theme: '' }),
  ], patrolStatusWeekRange('2026-09-14'))
  assert.equal(rows[0].photoCount, 0)
  assert.equal(rows[0].poorCount, 2)
  assert.equal(rows[0].themes, '추락 예방')
})

test('본부·지사 합계는 동명 지사를 본부별로 구분하고 미점검을 포함한다', () => {
  const rows = aggregatePatrolStatus([
    project('a', '경기', '공통'), project('b', '경기', '공통'), project('c', '강원', '공통'),
  ], [record('1', 'a', '2026-09-14')], patrolStatusWeekRange('2026-09-14'))
  const hqs = groupPatrolStatus(rows, 'hq')
  const branches = groupPatrolStatus(rows, 'branch')
  assert.equal(hqs.length, 2)
  assert.equal(branches.length, 2)
  assert.equal(branches.find(row => row.hq === '경기').projectCount, 2)
  assert.deepEqual(sumPatrolStatus(hqs), { projectCount: 3, inspectionCount: 1, poorCount: 2, photoCount: 1, uninspectedCount: 2 })
  assert.deepEqual(sumPatrolStatus(branches), sumPatrolStatus(rows))
  assert.deepEqual(sumPatrolStatus([]), { projectCount: 0, inspectionCount: 0, poorCount: 0, photoCount: 0, uninspectedCount: 0 })
})

test('본부·지사 표는 직제 순서로 나열하고 목록에 없는 조직은 뒤에 가나다순으로 둔다', () => {
  const range = patrolStatusWeekRange('2026-09-14')
  const rows = aggregatePatrolStatus([
    project('p1', '충남', '충남서부지사'), project('p2', '경기', '여주이천지사'), project('p3', '경기', '경기본부'),
    project('p4', '기타본부', '기타지사'), project('p5', '충남', '충남본부'), project('p6', '가나본부', '가나지사'),
  ], [], range)
  const order = { hqs: ['본사', '경기', '충남'], branches: { '경기': ['경기본부', '여주이천지사'], '충남': ['충남본부', '충남서부지사'] } }
  assert.deepEqual(groupPatrolStatus(rows, 'hq', order).map(g => g.name), ['경기', '충남', '가나본부', '기타본부'])
  assert.deepEqual(groupPatrolStatus(rows, 'branch', order).map(g => g.name), ['경기본부', '여주이천지사', '충남본부', '충남서부지사', '가나지사', '기타지사'])
})
