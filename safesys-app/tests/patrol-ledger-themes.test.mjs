// 순회점검 주간 테마의 날짜 계산·편집 권한·문자열 정규화를 검증한다.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

async function transpile(relativePath, dependencies = {}) {
  const source = await readFile(new URL(relativePath, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  })
  const module = { exports: {} }
  const require = (name) => {
    assert.ok(name in dependencies, `예상하지 못한 의존성 ${name}`)
    return dependencies[name]
  }
  new Function('module', 'exports', 'require', outputText)(module, module.exports, require)
  return module.exports
}

const types = await transpile('../src/lib/patrol-ledger/types.ts')
const { patrolLedgerWeekStart, canEditPatrolLedgerTheme, normalizePatrolLedgerTheme } = await transpile('../src/lib/patrol-ledger/themes.ts', {
  '@/lib/supabase': { supabase: {} },
  '@/lib/patrol-ledger/types': types,
})

test('주 시작일은 월요일 그대로, 일요일 6일 전이며 월 경계와 윤년을 계산한다', () => {
  for (const [date, monday] of [
    ['2026-09-14', '2026-09-14'],
    ['2026-09-20', '2026-09-14'],
    ['2026-10-01', '2026-09-28'],
    ['2024-02-29', '2024-02-26'],
    ['2024-03-03', '2024-02-26'],
  ]) assert.equal(patrolLedgerWeekStart(date), monday)
})

test('주 시작일은 잘못된 날짜 형식을 거부한다', () => {
  for (const date of ['', '2026/09/17', '2026-9-17', '2026-09-17T00:00:00Z', '날짜']) assert.throws(() => patrolLedgerWeekStart(date), /날짜 형식/)
})

test('본사 또는 본부급 발주청만 주간 테마를 편집한다', () => {
  for (const profile of [
    { role: '발주청', hq_division: null, branch_division: null },
    { role: '발주청', hq_division: '본사', branch_division: '본사' },
    { role: '발주청', hq_division: '서울본부', branch_division: '서울본부' },
  ]) assert.equal(canEditPatrolLedgerTheme(profile), true)
  for (const profile of [
    { role: '발주청', hq_division: '서울본부', branch_division: '강남지사' },
    { role: '시공사', hq_division: null, branch_division: null },
    { role: '감리단', hq_division: '본사', branch_division: '본사' },
    null,
  ]) assert.equal(canEditPatrolLedgerTheme(profile), false)
})

test('테마 정규화는 공백을 합치며 빈 값과 201자를 거부한다', () => {
  assert.deepEqual(normalizePatrolLedgerTheme('  추락\n 예방\t 점검  '), { theme: '추락 예방 점검' })
  for (const value of ['', ' \n\t ']) assert.deepEqual(normalizePatrolLedgerTheme(value), { error: '점검 테마를 입력해주세요.' })
  assert.deepEqual(normalizePatrolLedgerTheme('가'.repeat(201)), { error: '점검 테마는 200자 이하로 입력해주세요.' })
  assert.deepEqual(normalizePatrolLedgerTheme(` ${'가'.repeat(200)} `), { theme: '가'.repeat(200) })
})
