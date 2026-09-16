// 사고 분석의 실제 필터 콜백으로 산재 신청 조건과 기존 조건의 결합을 검증한다.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const source = readFileSync(new URL('../src/components/dashboard/AccidentAnalysisView.tsx', import.meta.url), 'utf8')
const ast = ts.createSourceFile('view.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
let callback
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'filteredAccidents') {
    callback = node.initializer.arguments[0].getText(ast)
  }
  ts.forEachChild(node, visit)
}
visit(ast)
assert.ok(callback, '실제 filteredAccidents 콜백이 존재해야 한다')
const registered = { project_id: 'p1', accident_type: 'fall', severity: 'minor' }
const accidents = ['applied', 'not_applied', null].map((workers_comp_claim, id) => ({ ...registered, id, workers_comp_claim }))
accidents.push({ id: 3, project_id: null, external_managing_hq: 'hq', external_managing_branch: 'branch', accident_type: 'fall', severity: 'minor', workers_comp_claim: 'applied' })
function filter(overrides = {}) {
  const scope = { accidents, filteredProjectIds: new Set(['p1']), selectedAccidentType: '', selectedSeverity: '', selectedProjectId: '', selectedHq: '', selectedBranch: '', onlyWorkersCompApplied: false, ...overrides }
  return new Function(...Object.keys(scope), `return (${callback})()`)(...Object.values(scope)).map(({ id }) => id)
}

test('기본 해제 상태는 미신청과 미입력을 포함한다', () => {
  assert.deepEqual(filter(), [0, 1, 2, 3])
})
test('체크 상태는 등록·미등록 현장의 신청 건만 포함한다', () => {
  assert.deepEqual(filter({ onlyWorkersCompApplied: true }), [0, 3])
})
test('신청 조건은 유형·중대도·프로젝트·미등록 조직 조건과 AND로 결합한다', () => {
  assert.deepEqual(filter({ onlyWorkersCompApplied: true, selectedAccidentType: 'other' }), [])
  assert.deepEqual(filter({ onlyWorkersCompApplied: true, selectedSeverity: 'fatal' }), [])
  assert.deepEqual(filter({ onlyWorkersCompApplied: true, selectedProjectId: 'p1' }), [0])
  assert.deepEqual(filter({ onlyWorkersCompApplied: true, filteredProjectIds: new Set(), selectedHq: 'hq', selectedBranch: 'branch' }), [3])
  assert.deepEqual(filter({ onlyWorkersCompApplied: true, filteredProjectIds: new Set(), selectedBranch: 'other' }), [])
})
