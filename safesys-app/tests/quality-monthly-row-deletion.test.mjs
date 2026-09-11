// 품질 월례보고서의 삭제한 행이 집계와 저장 후 조회에서 복구되지 않는지 검증한다.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const source = await readFile(new URL('../src/lib/quality/quality-monthly-types.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
})
const module = { exports: {} }
new Function('module', 'exports', outputText)(module, module.exports)
const { applyQualityTestActuals, createEmptyRow, deriveRow, reconcileQualityMonthlyReports } = module.exports
const preserveRows = { appendMissingRows: false }
const row = (testItem, fields = {}) => ({ ...createEmptyRow(), workType: '레미콘', testItem, ...fields })
const sources = ['염화물', '압축강도'].map((test_item, index) => ({
  id: `test-${index}`, serial_no: index + 1, test_date: '2026-09-03',
  test_category: '품질시험', work_type: '레미콘', test_item,
}))
const record = (month, rows) => ({
  id: `report-${month}`, project_id: 'project', created_by: null, created_at: '', updated_at: '',
  report_year: 2026, report_month: month, district_name: '', author_name: '', confirmer_name: '', report_rows: rows,
})

test('실시대장에서 생성된 행을 삭제한 직후 집계해도 다시 추가하지 않는다', () => {
  const initial = applyQualityTestActuals([], sources, 2026, 9)
  const deleted = initial.filter((item) => item.testItem !== '염화물')
  const updated = applyQualityTestActuals(deleted, sources, 2026, 9, preserveRows)
  assert.deepEqual(updated.map((item) => item.testItem), ['압축강도'])
})

test('저장 후 다시 조회하고 전월 누계를 연결해도 삭제한 행은 돌아오지 않는다', () => {
  const saved = JSON.parse(JSON.stringify([
    record(9, [row('압축강도')]),
    record(8, [row('염화물', { monthQualityTest: '3' }), row('압축강도', { monthQualityTest: '2' })]),
  ]))
  const loaded = reconcileQualityMonthlyReports(saved).map((report) => ({
    ...report,
    report_rows: applyQualityTestActuals(report.report_rows, sources, report.report_year, report.report_month, preserveRows),
  }))
  assert.deepEqual(loaded[0].report_rows.map((item) => item.testItem), ['압축강도'])
  assert.equal(loaded[0].report_rows[0].prevCumulQualityTest, '2')
})

test('모든 행을 삭제한 저장 보고서는 전월 행과 실시대장이 있어도 비어 있다', () => {
  const loaded = reconcileQualityMonthlyReports([record(8, [row('염화물')]), record(9, [])])
  assert.deepEqual(applyQualityTestActuals(loaded[1].report_rows, sources, 2026, 9, preserveRows), [])
})

test('편집 중 추가한 빈 행과 기존 행의 순서를 유지한다', () => {
  const updated = applyQualityTestActuals([createEmptyRow(), row('압축강도')], sources, 2026, 9, preserveRows)
  assert.deepEqual(updated.map((item) => item.testItem), ['', '압축강도'])
})

test('기존 행 실적은 갱신하고 사용자가 입력한 수정값은 유지한다', () => {
  const updated = applyQualityTestActuals([
    row('압축강도', { monthQualityTest: '9', monthQualityTestOverride: '7', cumulTotalOverride: '20' }),
  ], sources, 2026, 9, preserveRows)
  assert.equal(updated[0].monthQualityTest, '1')
  assert.equal(deriveRow(updated[0]).monthQualityTest, 7)
  assert.equal(deriveRow(updated[0]).cumulTotal, 20)
})

test('새 보고서의 기본 집계는 실시대장 행을 자동 추가한다', () => {
  const updated = applyQualityTestActuals([createEmptyRow()], sources, 2026, 9)
  assert.deepEqual(updated.map((item) => item.testItem), ['염화물', '압축강도'])
  assert.ok(updated.every((item) => item.monthQualityTest === '1'))
})
