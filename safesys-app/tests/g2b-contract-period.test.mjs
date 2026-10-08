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

const { earliestStartDate, resolveContractPeriod, nameGroupKey, isThtmPartial } = await transpile('../src/lib/g2b-contract-period.ts')

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

test('연차 계약만 조회되어도 기존 전체 착공일을 늦추지 않는다', () => {
  assert.equal(earliestStartDate([{ startDate: '2026-01-26' }], '2023-05-09'), '2023-05-09')
  assert.equal(earliestStartDate([], '2023-05-09'), '2023-05-09')
  assert.equal(earliestStartDate([{ startDate: '2023-05-09' }], '2026-01-26'), '2023-05-09')
})

const records = [
  { id: 'rep', contract_type: '공사', cntrct_nm: '용담지구 배수개선사업 토목공사', start_date: '2026-02-02', end_date: '2027-03-18' },
  { id: 'prev', contract_type: '공사', cntrct_nm: '용담지구 배수개선사업 토목공사', start_date: '2025-02-10', end_date: '2027-03-18' },
  { id: 'first', contract_type: '공사', cntrct_nm: '용담지구 배수개선사업 토목공사', start_date: '2024-06-17', end_date: '2027-03-18' },
  { id: 'other', contract_type: '용역', cntrct_nm: '용담지구 배수개선사업 토목공사', start_date: '2020-01-01', end_date: '2030-12-31' },
]
const latest = { startDate: '2026-02-02', endDate: '2026-12-18', thtmEndDate: '2026-12-18' }

test('대표계약 그룹의 전체 기간을 복원하고 다른 용역 기간을 섞지 않는다', () => {
  assert.deepEqual(resolveContractPeriod([latest], records, 'rep', latest.startDate, latest.endDate), {
    startDate: '2024-06-17', endDate: '2027-03-18',
  })
})

test('대표계약 없음·조회 실패 시 기존 전체 기간을 연차 기간으로 축소하지 않는다', () => {
  for (const representativeId of ['rep', null]) {
    assert.deepEqual(resolveContractPeriod([latest], [], representativeId, '2024-06-17', '2027-03-18'), {
      startDate: '2024-06-17', endDate: '2027-03-18',
    })
  }
  assert.deepEqual(resolveContractPeriod([latest], records, 'missing', null, null), {
    startDate: '2026-02-02', endDate: '2026-12-18',
  })
})

test('최신 총준공일 연장은 반영하되 금차 준공일은 전체 기간으로 사용하지 않는다', () => {
  assert.equal(resolveContractPeriod([{ ...latest, endDate: '2028-03-18' }], records, 'rep').endDate, '2028-03-18')
  assert.equal(resolveContractPeriod([{ ...latest, endDate: '' }], [], null).endDate, null)
  assert.deepEqual(resolveContractPeriod([], [], null), { startDate: null, endDate: null })
})

test('계약현황과 같은 연차명·차수분 판별로 그룹을 묶는다', () => {
  assert.equal(nameGroupKey('공사', '사업 (2차년도_2025년도)'), nameGroupKey('공사', '사업'))
  assert.equal(nameGroupKey('공사', '2025년 사업', true), nameGroupKey('공사', '사업(2026년)', true))
  assert.notEqual(nameGroupKey('공사', '2025년 사업'), nameGroupKey('공사', '2026년 사업'))
  assert.equal(isThtmPartial(100, 50), true)
  assert.equal(isThtmPartial(100, 100), false)
  assert.equal(isThtmPartial(null, 50), false)
})

test('상세 갱신이 대표 그룹 기간을 저장하고 보조 조회 실패에도 금액·업체 갱신을 유지한다', async () => {
  const source = await readFile(new URL('../src/app/project/[id]/page.tsx', import.meta.url), 'utf8')
  const handler = source.slice(source.indexOf('  const handleG2bSync = async'), source.indexOf('  const handleHandover ='))
  const { outputText } = ts.transpileModule(handler, { compilerOptions: { target: ts.ScriptTarget.ES2022 } })
  for (const queryFails of [false, true]) {
    let saved
    const project = {
      id: 'project', representative_contract_id: 'rep', g2b_cntrct_no: 'R26TA0138828601',
      g2b_ntce_no: 'notice', construction_start_date: queryFails ? '2024-06-17' : latest.startDate,
      construction_end_date: queryFails ? '2027-03-18' : latest.endDate,
    }
    const supabase = {
      from: (table) => table === 'project_contracts'
        ? { select: () => ({ eq: async (key, id) => {
            assert.equal(key, 'project_id')
            assert.equal(id, project.id)
            return queryFails ? { error: new Error('조회 실패') } : { data: records }
          } }) }
        : { update: (patch) => ({ eq: async () => { saved = patch; return {} } }) },
    }
    const fetch = async (url) => {
      if (!url.includes('latest=1')) throw new Error('공고 보조 조회 실패')
      return { json: async () => ({ success: true, data: { contracts: [{ ...latest, corpNms: ['새 업체'], totCntrctAmt: 9000, thtmCntrctAmt: 3000, cntrctNo: 'R26TA0138828602' }] } }) }
    }
    const run = new Function('project', 'g2bSyncing', 'setG2bSyncing', 'fetch', 'supabase', 'resolveContractPeriod', 'alert', 'setProject', 'console', `${outputText}; return handleG2bSync()`)
    await run(project, false, () => {}, fetch, supabase, resolveContractPeriod, () => {}, () => {}, { error: () => {} })
    assert.equal(saved.construction_start_date, '2024-06-17')
    assert.equal(saved.construction_end_date, '2027-03-18')
    assert.equal(saved.g2b_tot_amt, 9000)
    assert.equal(saved.g2b_thtm_amt, 3000)
    assert.equal(saved.g2b_corp_nm, '새 업체')
    assert.equal(saved.g2b_cntrct_no, 'R26TA0138828602')
  }
})
