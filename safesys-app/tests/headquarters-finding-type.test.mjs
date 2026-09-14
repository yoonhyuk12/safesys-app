// 본부불시점검 지적유형 정규화·라벨 매핑 순수 로직을 검증한다.
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

const {
  DEFAULT_HEADQUARTERS_FINDING_TYPE,
  HEADQUARTERS_FINDING_TYPE_OPTIONS,
  headquartersFindingTypeLabel,
  normalizeHeadquartersFindingType,
} = await transpile('../src/lib/inspection/headquarters-finding-type.ts')

test('유효한 지적유형 코드 3종은 그대로 통과한다', () => {
  assert.equal(normalizeHeadquartersFindingType('work_stop'), 'work_stop')
  assert.equal(normalizeHeadquartersFindingType('corrective_action'), 'corrective_action')
  assert.equal(normalizeHeadquartersFindingType('not_applicable'), 'not_applicable')
})

test('비어 있거나 알 수 없는 값은 기본값으로 되돌린다', () => {
  assert.equal(normalizeHeadquartersFindingType(null), DEFAULT_HEADQUARTERS_FINDING_TYPE)
  assert.equal(normalizeHeadquartersFindingType(undefined), DEFAULT_HEADQUARTERS_FINDING_TYPE)
  assert.equal(normalizeHeadquartersFindingType(''), DEFAULT_HEADQUARTERS_FINDING_TYPE)
  assert.equal(normalizeHeadquartersFindingType('기타'), DEFAULT_HEADQUARTERS_FINDING_TYPE)
  assert.equal(normalizeHeadquartersFindingType(0), DEFAULT_HEADQUARTERS_FINDING_TYPE)
  assert.equal(DEFAULT_HEADQUARTERS_FINDING_TYPE, 'corrective_action')
})

test('코드마다 한국어 라벨을 돌려준다', () => {
  assert.equal(headquartersFindingTypeLabel('work_stop'), '작업중지')
  assert.equal(headquartersFindingTypeLabel('corrective_action'), '시정조치')
  assert.equal(headquartersFindingTypeLabel('not_applicable'), '해당없음')
  assert.equal(headquartersFindingTypeLabel('알 수 없음'), '시정조치')
})

test('옵션 목록의 순서와 기본값이 맞물린다', () => {
  assert.deepEqual(HEADQUARTERS_FINDING_TYPE_OPTIONS.map((opt) => opt.value), [
    'work_stop',
    'corrective_action',
    'not_applicable',
  ])
  assert.deepEqual(HEADQUARTERS_FINDING_TYPE_OPTIONS.map((opt) => opt.label), [
    '작업중지',
    '시정조치',
    '해당없음',
  ])
  assert.ok(HEADQUARTERS_FINDING_TYPE_OPTIONS.some((opt) => opt.value === DEFAULT_HEADQUARTERS_FINDING_TYPE))
})
