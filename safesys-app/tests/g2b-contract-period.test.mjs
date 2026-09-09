// 장기계속 계약 목록에서 최초 착공일을 고르는 earliestStartDate 를 검증한다.
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

const { earliestStartDate } = await transpile('../src/lib/g2b-contract-period.ts')

test('여러 차수 계약 중 가장 이른 착공일을 고른다', () => {
  assert.equal(earliestStartDate([
    { startDate: '2026-01-26' },
    { startDate: '2025-02-11' },
    { startDate: '2023-05-09' },
    { startDate: '2024-03-04' },
  ]), '2023-05-09')
})

test('배열 순서가 달라도 결과는 같다', () => {
  const contracts = [
    { startDate: '2023-05-09' },
    { startDate: '2026-01-26' },
    { startDate: '2024-03-04' },
  ]
  const reversed = [...contracts].reverse()
  assert.equal(earliestStartDate(contracts), '2023-05-09')
  assert.equal(earliestStartDate(reversed), '2023-05-09')
})

test('빈 값과 형식이 어긋난 값은 무시한다', () => {
  assert.equal(earliestStartDate([
    { startDate: '' },
    { startDate: null },
    { startDate: undefined },
    {},
    { startDate: '20230509' },
    { startDate: '2023-5-9' },
    { startDate: '2023-05-09T00:00:00Z' },
    { startDate: '2024-03-04' },
  ]), '2024-03-04')
})

test('쓸 수 있는 착공일이 하나도 없으면 빈 문자열을 돌려준다', () => {
  assert.equal(earliestStartDate([]), '')
  assert.equal(earliestStartDate([{ startDate: '' }, { startDate: null }]), '')
  assert.equal(earliestStartDate([{ startDate: '알 수 없음' }]), '')
})

test('단일 계약이면 그 착공일을 그대로 돌려준다', () => {
  assert.equal(earliestStartDate([{ startDate: '2026-01-26' }]), '2026-01-26')
})
