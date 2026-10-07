// 정기안전점검 대장의 유형별 부분 조회 결과 병합(그룹 필드만 교체·총 건수 재계산)을 검증한다.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

async function loadModule() {
  const source = await readFile(new URL('../src/lib/safety-inspection-count-groups.ts', import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  })
  const module = { exports: {} }
  const deps = {
    './safety-inspection-types': { SPECIAL_287_TYPE: '특별점검(안전혁신건설-287)', SPECIAL_770_TYPE: '특별점검(굴삭기 버킷 사고)' },
  }
  const require = (name) => {
    assert.ok(name in deps, `예상하지 못한 의존성 ${name}`)
    return deps[name]
  }
  new Function('exports', 'require', 'module', outputText)(module.exports, require, module)
  return module.exports
}

const row = (id, overrides = {}) => ({
  project_id: id, project_name: id, managing_hq: '', managing_branch: '', inspection_count: 0,
  thawing_count: 0, thawing_findings: 0, thawing_additional_findings: 0, thawing_unresolved: 0, thawing_unsigned: 0,
  rainy_count: 0, rainy_findings: 0, rainy_additional_findings: 0, rainy_unresolved: 0, rainy_unsigned: 0,
  comprehensive_count: 0, comprehensive_findings: 0, comprehensive_unresolved: 0, comprehensive_unsigned: 0,
  special_count: 0, special_findings: 0, special_unresolved: 0, special_unsigned: 0,
  special770_count: 0, special770_findings: 0, special770_pending: 0,
  ...overrides,
})

test('빈 집계에 한 유형을 병합하면 그 유형 값과 총 건수가 채워진다', async () => {
  const { mergeSafetyInspectionGroupCounts } = await loadModule()
  const result = mergeSafetyInspectionGroupCounts([], [row('a', { rainy_count: 2, rainy_findings: 3, inspection_count: 2 })], 'rainy')
  assert.equal(result[0].rainy_count, 2)
  assert.equal(result[0].rainy_findings, 3)
  assert.equal(result[0].inspection_count, 2)
})

test('다른 유형 값은 유지하고 해당 유형만 교체하며 총 건수를 다시 더한다', async () => {
  const { mergeSafetyInspectionGroupCounts } = await loadModule()
  const base = [row('a', { thawing_count: 1, thawing_unsigned: 1, rainy_count: 5, inspection_count: 6 })]
  const incoming = [row('a', { rainy_count: 2, rainy_unresolved: 1, inspection_count: 2 })]
  const [merged] = mergeSafetyInspectionGroupCounts(base, incoming, 'rainy')
  assert.equal(merged.thawing_count, 1)
  assert.equal(merged.thawing_unsigned, 1)
  assert.equal(merged.rainy_count, 2)
  assert.equal(merged.rainy_unresolved, 1)
  assert.equal(merged.inspection_count, 3)
  assert.equal(base[0].rainy_count, 5, '원본 배열을 변경하지 않는다')
})

test('그룹별 inspection_type 매핑은 다섯 유형을 모두 가진다', async () => {
  const { SAFETY_INSPECTION_COUNT_GROUPS, SAFETY_INSPECTION_GROUP_TYPES } = await loadModule()
  assert.deepEqual([...SAFETY_INSPECTION_COUNT_GROUPS], ['thawing', 'rainy', 'comprehensive', 'special', 'special770'])
  assert.equal(SAFETY_INSPECTION_GROUP_TYPES.special770, '특별점검(굴삭기 버킷 사고)')
})
