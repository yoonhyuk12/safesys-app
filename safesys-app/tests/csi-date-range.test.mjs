// CSI 조회 기간의 말일·윤년 보정과 날짜 경계 검증을 확인한다.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const source = await readFile(new URL('../src/lib/quality/csi-date-range.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
const module = { exports: {} }
new Function('module', 'exports', outputText)(module, module.exports)
const { getCsiDateRange, isCsiDateRange } = module.exports

test('한 달 전 말일을 평년과 윤년의 2월에 맞춘다', () => {
  assert.deepEqual(getCsiDateRange(1, new Date(2026, 2, 31)), { startDate: '2026-02-28', endDate: '2026-03-31' })
  assert.deepEqual(getCsiDateRange(1, new Date(2024, 2, 31)), { startDate: '2024-02-29', endDate: '2024-03-31' })
  assert.deepEqual(getCsiDateRange(12, new Date(2024, 1, 29)), { startDate: '2023-02-28', endDate: '2024-02-29' })
})
test('모든 프리셋은 전달한 오늘을 종료일로 사용한다', () => {
  const today = new Date(2026, 8, 11)
  assert.deepEqual([1, 2, 3, 6, 12, 24].map((months) => getCsiDateRange(months, today).startDate), ['2026-08-11', '2026-07-11', '2026-06-11', '2026-03-11', '2025-09-11', '2024-09-11'])
  for (const months of [1, 2, 3, 6, 12, 24]) assert.equal(getCsiDateRange(months, today).endDate, '2026-09-11')
  assert.equal(today.getDate(), 11)
})
test('날짜 형식·달력·순서를 검증하고 같은 날은 허용한다', () => {
  assert.equal(isCsiDateRange('2024-02-29', '2024-02-29'), true)
  for (const pair of [['2026-02-29', '2026-03-01'], ['2026-02-30', '2026-03-01'], ['20260801', '2026-09-01'], ['', '2026-09-01'], [null, '2026-09-01'], ['2026-09-02', '2026-09-01']]) assert.equal(isCsiDateRange(...pair), false)
})
