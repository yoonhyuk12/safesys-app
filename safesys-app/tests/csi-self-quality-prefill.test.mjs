// 자체 품질시험의 실측값·날짜·판정과 서명 초기화를 검증한다.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const modules = {}
for (const name of ['quality-test-types', 'csi-self-quality-prefill']) {
  const source = await readFile(new URL(`../src/lib/quality/${name}.ts`, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } })
  const mod = { exports: {} }
  new Function('module', 'exports', 'require', outputText)(mod, mod.exports, (path) => modules[path.split('/').at(-1)])
  modules[name] = mod.exports
}
const detail = {
  groupNo: '1', bizMngNo: 'b', reportNo: 'SQ-1', materialName: '레미콘', producerName: '공장',
  testPlace: '현장내', testerName: '시험자', note: '',
  items: [
    { testDate: '2026-08-01', materialCategory: '콘크리트', testItem: '슬럼프', testStandard: '120±25mm', testResult: '115 / 120 / 125 mm', verdict: '적합' },
    { testDate: '20260829', materialCategory: '콘크리트', testItem: '압축강도', testStandard: '24 MPa', testResult: '20 MPa', verdict: '부적합' },
  ],
}
test('항목별 날짜와 복수 측정값을 유지하고 적합·부적합 판정을 변환한다', () => {
  const result = modules['csi-self-quality-prefill'].prefillCsiSelfQuality(detail, '감독')
  assert.deepEqual(result.items.map((item) => item.test_date), ['2026-08-01', '2026-08-29'])
  assert.deepEqual(result.items.map((item) => item.result_verdict), ['합격', '불합격'])
  assert.equal(result.items[0].test_result, '115 / 120 / 125 mm')
  assert.equal(result.common.test_category, '자체(관리)시험')
  assert.equal(result.common.work_type, '')
  assert.equal(result.common.quality_engineer_name, '시험자')
  assert.equal(result.common.quality_engineer_signature, '')
  assert.equal(result.common.supervision_engineer_signature, '')
})
test('미기재 날짜와 판정을 오늘 날짜나 합격으로 추정하지 않는다', () => {
  const result = modules['csi-self-quality-prefill'].prefillCsiSelfQuality({ ...detail, items: [{ ...detail.items[0], testDate: '', verdict: '' }] })
  assert.equal(result.common.test_date, null)
  assert.equal(result.items[0].test_date, null)
  assert.equal(result.items[0].result_verdict, '')
})
test('달력에 없는 날짜와 알 수 없는 판정은 사용자 확인을 위해 비운다', () => {
  const result = modules['csi-self-quality-prefill'].prefillCsiSelfQuality({ ...detail, items: [{ ...detail.items[0], testDate: '2026-02-30', verdict: '확인중' }] })
  assert.equal(result.items[0].test_date, null)
  assert.equal(result.items[0].result_verdict, '')
})
test('여러 줄 측정값은 한 줄 입력에서도 구분자를 유지한다', () => {
  const result = modules['csi-self-quality-prefill'].prefillCsiSelfQuality({ ...detail, items: [{ ...detail.items[0], testResult: '·0.067 mg/L\r\n·0.024 mg/L\n·0.031 mg/L' }] })
  assert.equal(result.items[0].test_result, '·0.067 mg/L / ·0.024 mg/L / ·0.031 mg/L')
})
