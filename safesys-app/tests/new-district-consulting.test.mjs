// 신규지구 안전컨설팅의 대표계약 시작일 해석·인정기간·지구/건수 집계·소계 재계산과 조회 페이지네이션을 검증한다.
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

// 본부·지사 정렬은 실제 조직 목록 순서를 따라야 하므로 상수를 복제하지 않고 그대로 읽는다.
const constants = await transpile('../src/lib/constants.ts')
const { BRANCH_OPTIONS } = constants

const dateFns = await import('date-fns')

const utils = await transpile('../src/lib/new-district-consulting-utils.ts', {
  'date-fns': dateFns,
  '@/lib/constants': constants,
})

const { addMonthsToDateText, buildNewDistrictConsulting, clampConsultingMonths } = utils

function makeProject(id, overrides = {}) {
  return {
    id,
    project_name: `사업-${id}`,
    managing_hq: '경기',
    managing_branch: '수원지사',
    representative_contract_id: `c-${id}`,
    ...overrides,
  }
}

function makeContract(id, projectId, startDate, overrides = {}) {
  return {
    id,
    project_id: projectId,
    contract_type: '공사',
    cntrct_nm: '테스트 정비공사',
    cntrct_no: null,
    unty_cntrct_no: null,
    cntrct_info_url: null,
    start_date: startDate,
    tot_cntrct_amt: 1000,
    thtm_cntrct_amt: 1000,
    ...overrides,
  }
}

function makeInspection(id, projectId, inspectionDate) {
  return { id, project_id: projectId, inspection_date: inspectionDate }
}

/** 계층 결과에서 프로젝트 행 하나를 꺼낸다. */
function findRow(result, projectId) {
  for (const hq of result.hqs) {
    for (const branch of hq.branches) {
      const found = branch.projects.find((row) => row.projectId === projectId)
      if (found) return found
    }
  }
  return null
}

test('addMonths는 달력 개월로 월말을 보정한다', () => {
  assert.equal(addMonthsToDateText('2026-01-31', 1), '2026-02-28')
  assert.equal(addMonthsToDateText('2026-01-31', 3), '2026-04-30')
  assert.equal(addMonthsToDateText('2026-12-20', 3), '2027-03-20')
  // 인정 기간에 상한은 없다. 13개월은 그대로 13개월로 쓴다
  assert.equal(clampConsultingMonths(13), 13)
  assert.equal(addMonthsToDateText('2026-01-31', clampConsultingMonths(13)), '2027-02-28')
})

test('인정 기간은 12개월을 넘겨도 잘리지 않는다', () => {
  const projects = [makeProject('p1')]
  const contracts = [makeContract('c-p1', 'p1', '2026-01-15')]
  const inspections = [makeInspection('i1', 'p1', '2027-02-10')]

  const result = buildNewDistrictConsulting(projects, contracts, inspections, 2026, 13)
  const row = findRow(result, 'p1')

  assert.equal(result.months, 13)
  assert.equal(row.deadlineDate, '2027-02-15')
  assert.deepEqual(row.inspectionDates, ['2027-02-10'])
  assert.equal(result.total.inspectedDistrictCount, 1)
})

test('인정 기한 당일 점검은 포함하고 다음날은 제외한다', () => {
  const projects = [makeProject('p1')]
  const contracts = [makeContract('c-p1', 'p1', '2026-03-01')]
  const inspections = [
    makeInspection('i1', 'p1', '2026-06-01'),
    makeInspection('i2', 'p1', '2026-06-02'),
  ]

  const result = buildNewDistrictConsulting(projects, contracts, inspections, 2026, 3)
  const row = findRow(result, 'p1')

  assert.equal(row.deadlineDate, '2026-06-01')
  assert.deepEqual(row.inspectionDates, ['2026-06-01'])
  assert.equal(row.inspectionCount, 1)
})

test('대표 시작일 이전 점검은 인정하지 않는다', () => {
  const projects = [makeProject('p1')]
  const contracts = [makeContract('c-p1', 'p1', '2026-03-01')]
  const inspections = [makeInspection('i1', 'p1', '2026-02-28')]

  const result = buildNewDistrictConsulting(projects, contracts, inspections, 2026, 3)
  const row = findRow(result, 'p1')

  assert.deepEqual(row.inspectionDates, [])
  assert.equal(row.inspected, false)
  assert.equal(result.total.inspectedDistrictCount, 0)
  assert.equal(result.total.districtCount, 1)
})

test('연말 착공 지구는 다음 해 점검도 인정한다', () => {
  const projects = [makeProject('p1')]
  const contracts = [makeContract('c-p1', 'p1', '2026-12-20')]
  const inspections = [makeInspection('i1', 'p1', '2027-02-10')]

  const result = buildNewDistrictConsulting(projects, contracts, inspections, 2026, 3)
  const row = findRow(result, 'p1')

  assert.equal(row.deadlineDate, '2027-03-20')
  assert.deepEqual(row.inspectionDates, ['2027-02-10'])
  assert.equal(result.total.inspectedDistrictCount, 1)
})

test('같은 지구를 두 번 점검하면 지구 수는 1이고 건수는 2다', () => {
  const projects = [makeProject('p1')]
  const contracts = [makeContract('c-p1', 'p1', '2026-03-01')]
  const inspections = [
    makeInspection('i2', 'p1', '2026-03-20'),
    makeInspection('i1', 'p1', '2026-03-05'),
  ]

  const result = buildNewDistrictConsulting(projects, contracts, inspections, 2026, 3)
  const row = findRow(result, 'p1')

  assert.deepEqual(row.inspectionDates, ['2026-03-05', '2026-03-20'])
  assert.equal(row.inspectionCount, 2)
  assert.equal(result.total.districtCount, 1)
  assert.equal(result.total.inspectedDistrictCount, 1)
  assert.equal(result.total.inspectionCount, 2)
})

test('미점검 지구도 행으로 남고 분모에 들어간다', () => {
  const projects = [makeProject('p1'), makeProject('p2')]
  const contracts = [
    makeContract('c-p1', 'p1', '2026-03-01'),
    makeContract('c-p2', 'p2', '2026-03-10'),
  ]
  const inspections = [makeInspection('i1', 'p1', '2026-03-05')]

  const result = buildNewDistrictConsulting(projects, contracts, inspections, 2026, 3)

  assert.equal(findRow(result, 'p2').inspected, false)
  assert.equal(result.total.districtCount, 2)
  assert.equal(result.total.inspectedDistrictCount, 1)
  assert.equal(result.total.rate, 0.5)
})

test('다른 연도에 착공한 지구는 코호트에서 빠진다', () => {
  const projects = [makeProject('p1')]
  const contracts = [makeContract('c-p1', 'p1', '2025-05-01')]

  const result = buildNewDistrictConsulting(projects, contracts, [], 2026, 3)

  assert.equal(findRow(result, 'p1'), null)
  assert.deepEqual(result.hqs, [])
  assert.equal(result.total.districtCount, 0)
})

test('대표 계약을 정할 수 없으면 제외 행으로 남기고 착공일로 대체하지 않는다', () => {
  const projects = [
    makeProject('p1', {
      representative_contract_id: null,
      g2b_cntrct_no: null,
      g2b_ntce_no: null,
      construction_start_date: '2026-01-02',
    }),
  ]
  const contracts = [makeContract('c-p1', 'p1', '2026-03-01')]
  const inspections = [makeInspection('i1', 'p1', '2026-03-05')]

  const result = buildNewDistrictConsulting(projects, contracts, inspections, 2026, 3)
  const row = findRow(result, 'p1')

  assert.equal(row.excluded, true)
  assert.equal(row.excludeReason, 'no_representative')
  assert.equal(row.representativeStartDate, null)
  assert.equal(row.deadlineDate, null)
  assert.equal(row.inspectionCount, 0)
  assert.equal(result.total.districtCount, 0)
  assert.equal(result.total.excludedCount, 1)
  assert.equal(result.total.rate, 0)
})

test('연차 그룹은 대표가 3차년도여도 1차년도 시작일을 대표 시작일로 쓴다', () => {
  const projects = [makeProject('p1', { representative_contract_id: 'c3' })]
  const contracts = [
    makeContract('c1', 'p1', '2026-02-01', {
      cntrct_nm: '한들지구 정비공사',
      tot_cntrct_amt: 3000,
      thtm_cntrct_amt: 1000,
    }),
    makeContract('c3', 'p1', '2028-02-01', {
      cntrct_nm: '한들지구 정비공사(3차년도_2028년)',
      tot_cntrct_amt: 3000,
      thtm_cntrct_amt: 1000,
    }),
  ]

  const result = buildNewDistrictConsulting(projects, contracts, [], 2026, 3)
  const row = findRow(result, 'p1')

  assert.equal(row.representativeStartDate, '2026-02-01')
  assert.equal(row.deadlineDate, '2026-05-01')
  assert.equal(row.excluded, false)
})

test('대표 미지정이면 나라장터 기본 대표 계약으로 폴백한다', () => {
  const projects = [
    makeProject('p1', { representative_contract_id: null, g2b_cntrct_no: ' 1234567890123 ' }),
  ]
  const contracts = [
    // 확정계약번호 뒤 2자리는 차수라 기본번호가 같으면 같은 계약이다
    makeContract('c-other', 'p1', '2026-04-01', { cntrct_no: '1234567890199' }),
  ]

  const result = buildNewDistrictConsulting(projects, contracts, [], 2026, 3)
  const row = findRow(result, 'p1')

  assert.equal(row.excluded, false)
  assert.equal(row.representativeStartDate, '2026-04-01')
})

test('본부 소계는 지사 실시율의 평균이 아니라 원수 합산으로 다시 계산한다', () => {
  const projects = [
    makeProject('a1', { managing_branch: '가지사' }),
    makeProject('b1', { managing_branch: '나지사' }),
    makeProject('b2', { managing_branch: '나지사' }),
    makeProject('b3', { managing_branch: '나지사' }),
  ]
  const contracts = projects.map((project) => makeContract(`c-${project.id}`, project.id, '2026-03-01'))
  const inspections = [
    makeInspection('i1', 'a1', '2026-03-05'),
    makeInspection('i2', 'b1', '2026-03-05'),
  ]

  const result = buildNewDistrictConsulting(projects, contracts, inspections, 2026, 3)
  const hq = result.hqs[0]

  // 둘 다 BRANCH_OPTIONS 미등재라 뒤쪽에서 가나다순으로 놓인다
  assert.deepEqual(
    hq.branches.map((branch) => branch.branch),
    ['가지사', '나지사']
  )
  assert.equal(hq.branches[0].subtotal.rate, 1)
  assert.equal(hq.branches[1].subtotal.rate, 1 / 3)
  // 율 평균이면 0.666…, 원수 합산이면 2/4 = 0.5
  assert.equal(hq.subtotal.districtCount, 4)
  assert.equal(hq.subtotal.inspectedDistrictCount, 2)
  assert.equal(hq.subtotal.rate, 0.5)
  assert.equal(result.total.rate, 0.5)
})

test('개월 수는 최소 1개월로 하한 처리한다', () => {
  const projects = [makeProject('p1')]
  const contracts = [makeContract('c-p1', 'p1', '2026-01-31')]
  const inspections = [
    makeInspection('i1', 'p1', '2026-02-28'),
    makeInspection('i2', 'p1', '2026-03-01'),
  ]

  const result = buildNewDistrictConsulting(projects, contracts, inspections, 2026, 0)
  const row = findRow(result, 'p1')

  assert.equal(result.months, 1)
  assert.equal(row.deadlineDate, '2026-02-28')
  assert.deepEqual(row.inspectionDates, ['2026-02-28'])
})

test('지사는 BRANCH_OPTIONS 순서, 미등재 지사는 뒤에 가나다순으로 놓는다', () => {
  // 경기본부 지사 배열에서 안성지사(뒤)가 여주·이천지사(앞)보다 먼저 들어와도 배열 순서대로 나와야 한다
  const options = BRANCH_OPTIONS['경기']
  assert.ok(options.indexOf('여주·이천지사') < options.indexOf('안성지사'))

  const projects = [
    makeProject('b1', { managing_branch: '없는지사' }),
    makeProject('b2', { managing_branch: '안성지사' }),
    makeProject('b3', { managing_branch: '가상지사' }),
    makeProject('b4', { managing_branch: '여주·이천지사' }),
  ]
  const contracts = projects.map((project) => makeContract(`c-${project.id}`, project.id, '2026-03-01'))

  const result = buildNewDistrictConsulting(projects, contracts, [], 2026, 3)

  assert.deepEqual(
    result.hqs[0].branches.map((branch) => branch.branch),
    ['여주·이천지사', '안성지사', '가상지사', '없는지사']
  )
})

test('본부는 조직 목록 순서, 미등재 본부는 뒤에 가나다순으로 놓는다', () => {
  const projects = [
    makeProject('x1', { managing_hq: '없는본부' }),
    makeProject('c1', { managing_hq: '충남' }),
    makeProject('g1', { managing_hq: '경기' }),
    makeProject('a1', { managing_hq: '가상본부' }),
  ]
  const contracts = projects.map((project) => makeContract(`c-${project.id}`, project.id, '2026-03-01'))

  const result = buildNewDistrictConsulting(projects, contracts, [], 2026, 3)

  assert.deepEqual(
    result.hqs.map((hq) => hq.hq),
    ['경기', '충남', '가상본부', '없는본부']
  )
})

// ---- 조회 계층 ----

const PAGE_SIZE = 1000
const PROJECT_ID_CHUNK = 80

/** supabase 쿼리 빌더 mock. range 호출 이력으로 청크·페이지 경계·날짜 필터를 검증한다. */
function makeSupabase(tables, { failOn = null } = {}) {
  const calls = []

  const client = {
    from(table) {
      const state = { table, ids: null, gte: null, lte: null }
      const builder = {
        select() {
          return builder
        },
        in(column, values) {
          state.ids = { column, values }
          return builder
        },
        gte(column, value) {
          state.gte = { column, value }
          return builder
        },
        lte(column, value) {
          state.lte = { column, value }
          return builder
        },
        order() {
          return builder
        },
        range(from, to) {
          const index = calls.length
          calls.push({
            table: state.table,
            ids: state.ids ? [...state.ids.values] : null,
            gte: state.gte,
            lte: state.lte,
            from,
            to,
          })
          if (failOn === index) {
            return Promise.resolve({ data: null, error: { message: `page ${index} 실패` } })
          }
          const rows = (tables[state.table] ?? [])
            .filter((row) => {
              if (state.ids && !state.ids.values.includes(row[state.ids.column])) return false
              if (state.gte && !(row[state.gte.column] >= state.gte.value)) return false
              if (state.lte && !(row[state.lte.column] <= state.lte.value)) return false
              return true
            })
            .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
          return Promise.resolve({ data: rows.slice(from, to + 1), error: null })
        },
      }
      return builder
    },
  }

  return { client, calls }
}

async function loadQuery(client) {
  return transpile('../src/lib/new-district-consulting.ts', {
    '@/lib/supabase': { supabase: client },
    '@/lib/new-district-consulting-utils': utils,
  })
}

test('계약 조회는 1000행 상한을 넘겨도 전부 가져온다', async () => {
  const contracts = Array.from({ length: 1034 }, (_, index) =>
    makeContract(`k-${String(index).padStart(5, '0')}`, 'p1', '2026-03-01', {
      cntrct_nm: `계약-${index}`,
    })
  )
  contracts.push(makeContract('c-p1', 'p1', '2026-03-01'))
  const { client, calls } = makeSupabase({ project_contracts: contracts, headquarters_inspections: [] })
  const { getNewDistrictConsulting } = await loadQuery(client)

  const result = await getNewDistrictConsulting([makeProject('p1')], 2026, 3)

  const contractCalls = calls.filter((call) => call.table === 'project_contracts')
  assert.equal(contractCalls.length, 2)
  assert.deepEqual(
    contractCalls.map((call) => [call.from, call.to]),
    [
      [0, PAGE_SIZE - 1],
      [PAGE_SIZE, PAGE_SIZE * 2 - 1],
    ]
  )
  assert.equal(findRow(result, 'p1').representativeStartDate, '2026-03-01')
})

test('프로젝트 id는 80개씩 나눠 조회한다', async () => {
  const projects = Array.from({ length: 85 }, (_, index) =>
    makeProject(`p-${String(index).padStart(3, '0')}`)
  )
  const contracts = projects.map((project) => makeContract(`c-${project.id}`, project.id, '2026-03-01'))
  const { client, calls } = makeSupabase({ project_contracts: contracts, headquarters_inspections: [] })
  const { getNewDistrictConsulting } = await loadQuery(client)

  const result = await getNewDistrictConsulting(projects, 2026, 3)

  const contractCalls = calls.filter((call) => call.table === 'project_contracts')
  assert.equal(contractCalls.length, 2)
  assert.deepEqual(
    contractCalls.map((call) => call.ids.length),
    [PROJECT_ID_CHUNK, 5]
  )
  assert.equal(result.total.districtCount, 85)
})

test('점검 조회는 코호트 최소 시작일부터 최대 기한까지로 범위를 잡는다', async () => {
  const projects = [makeProject('p1'), makeProject('p2')]
  const contracts = [
    makeContract('c-p1', 'p1', '2026-02-01'),
    makeContract('c-p2', 'p2', '2026-12-20'),
  ]
  const inspections = [
    makeInspection('i1', 'p1', '2026-03-02'),
    makeInspection('i2', 'p2', '2027-02-10'),
  ]
  const { client, calls } = makeSupabase({
    project_contracts: contracts,
    headquarters_inspections: inspections,
  })
  const { getNewDistrictConsulting } = await loadQuery(client)

  const result = await getNewDistrictConsulting(projects, 2026, 3)

  const inspectionCalls = calls.filter((call) => call.table === 'headquarters_inspections')
  assert.equal(inspectionCalls.length, 1)
  assert.deepEqual(inspectionCalls[0].gte, { column: 'inspection_date', value: '2026-02-01' })
  assert.deepEqual(inspectionCalls[0].lte, { column: 'inspection_date', value: '2027-03-20' })
  assert.equal(result.total.inspectedDistrictCount, 2)
})

test('조회 오류는 부분 결과 대신 예외로 알린다', async () => {
  const { client } = makeSupabase({ project_contracts: [], headquarters_inspections: [] }, { failOn: 0 })
  const { getNewDistrictConsulting } = await loadQuery(client)

  await assert.rejects(() => getNewDistrictConsulting([makeProject('p1')], 2026, 3), /page 0 실패/)
})
