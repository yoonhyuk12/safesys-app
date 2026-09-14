// getProjectsByUserBranch의 fetchAll 페이지네이션·안정정렬·부분성공 금지를 mock 쿼리로 검증한다.
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

const PAGE_SIZE = 1000

/** eq 필터와 order를 실제 PostgREST처럼 적용한다. order는 기록된 순서대로 비교한다. */
function resolveRows(rows, state) {
  const filtered = rows.filter((row) =>
    state.filters.every(([column, value]) => row[column] === value)
  )
  const sorted = [...filtered].sort((left, right) => {
    for (const [column, ascending] of state.orders) {
      const a = String(left[column] ?? '')
      const b = String(right[column] ?? '')
      if (a === b) continue
      return (a < b ? -1 : 1) * (ascending ? 1 : -1)
    }
    return 0
  })
  return sorted
}

/**
 * supabase 쿼리 빌더 mock. range 호출 이력을 남겨 페이지 경계와 정렬 키를 검증한다.
 * failOnPage에 지정한 순번의 range 호출은 오류를 돌려준다.
 */
function makeSupabase(rows, { failOnPage = null } = {}) {
  const calls = []

  const client = {
    from(table) {
      const state = { table, filters: [], orders: [] }
      const builder = {
        select() {
          return builder
        },
        eq(column, value) {
          state.filters.push([column, value])
          return builder
        },
        order(column, options) {
          state.orders.push([column, options?.ascending !== false])
          return builder
        },
        range(from, to) {
          const pageIndex = calls.length
          calls.push({
            table: state.table,
            from,
            to,
            orderColumns: state.orders.map(([column]) => column),
            filters: state.filters.map(([column, value]) => `${column}=${value}`),
          })
          if (failOnPage === pageIndex) {
            return Promise.resolve({ data: null, error: { message: `page ${pageIndex} 실패` } })
          }
          return Promise.resolve({ data: resolveRows(rows, state).slice(from, to + 1), error: null })
        },
        // range 없이 await 하는 기존 호출 경로
        then(onFulfilled, onRejected) {
          calls.push({
            table: state.table,
            from: null,
            to: null,
            orderColumns: state.orders.map(([column]) => column),
            filters: state.filters.map(([column, value]) => `${column}=${value}`),
          })
          return Promise.resolve({ data: resolveRows(rows, state), error: null }).then(
            onFulfilled,
            onRejected
          )
        },
      }
      return builder
    },
  }

  return { client, calls }
}

const BRANCH_OPTIONS = {
  경기: ['경기본부', '수원지사', '지하수지질부'],
  충남: ['충남본부', '천안지사', '지하수지질부'],
}

async function loadProjects(supabase) {
  return transpile('../src/lib/projects.ts', {
    './supabase': { supabase },
    './constants': { BRANCH_OPTIONS, DEBUG_LOGS: false },
    './ptw/permit-types': { PERMIT_TYPE_CONFIGS: {} },
  })
}

/** project_name 오름차순으로 정렬됐을 때 자기 순번을 알 수 있는 사업명을 만든다. */
function makeRows(count, { sameName = false } = {}) {
  return Array.from({ length: count }, (_, index) => ({
    id: `proj-${String(index).padStart(5, '0')}`,
    project_name: sameName ? '동일사업' : `사업-${String(index).padStart(5, '0')}`,
    managing_hq: '경기',
    managing_branch: '수원지사',
  }))
}

const HQ_USER = { id: 'u1', role: '발주청', hq_division: '본사', branch_division: '본사' }

test('fetchAll이 1000행 상한을 넘는 1034건을 전부 가져온다', async () => {
  const { client, calls } = makeSupabase(makeRows(1034))
  const { getProjectsByUserBranch } = await loadProjects(client)

  const result = await getProjectsByUserBranch(HQ_USER, { fetchAll: true })

  assert.equal(result.success, true)
  assert.equal(result.projects.length, 1034)
  assert.equal(new Set(result.projects.map((project) => project.id)).size, 1034)
  // 1000건짜리 첫 페이지 뒤에 34건짜리 두 번째 페이지로 끝난다
  assert.equal(calls.length, 2)
  assert.deepEqual(
    calls.map((call) => [call.from, call.to]),
    [
      [0, PAGE_SIZE - 1],
      [PAGE_SIZE, PAGE_SIZE * 2 - 1],
    ]
  )
})

test('fetchAll은 동명 사업이 있어도 id 보조키로 페이지 경계에서 겹치거나 빠지지 않는다', async () => {
  const { client, calls } = makeSupabase(makeRows(1001, { sameName: true }))
  const { getProjectsByUserBranch } = await loadProjects(client)

  const result = await getProjectsByUserBranch(HQ_USER, { fetchAll: true })

  assert.equal(result.success, true)
  assert.equal(result.projects.length, 1001)
  const ids = result.projects.map((project) => project.id)
  assert.equal(new Set(ids).size, 1001, '중복 없이 전부 와야 한다')
  assert.deepEqual(ids, [...ids].sort(), 'id 오름차순 안정정렬이 유지돼야 한다')
  for (const call of calls) {
    assert.deepEqual(call.orderColumns, ['project_name', 'id'])
  }
})

test('fetchAll 중간 페이지가 실패하면 부분 목록을 돌려주지 않는다', async () => {
  const { client, calls } = makeSupabase(makeRows(1034), { failOnPage: 1 })
  const { getProjectsByUserBranch } = await loadProjects(client)

  const result = await getProjectsByUserBranch(HQ_USER, { fetchAll: true })

  assert.equal(result.success, false)
  assert.equal(result.projects, undefined)
  assert.equal(result.error, '프로젝트 조회에 실패했습니다.')
  assert.equal(calls.length, 2)
})

test('fetchAll 없이 부르면 기존 동작 그대로 range 없이 한 번만 조회한다', async () => {
  const { client, calls } = makeSupabase(makeRows(12))
  const { getProjectsByUserBranch } = await loadProjects(client)

  const result = await getProjectsByUserBranch(HQ_USER)

  assert.equal(result.success, true)
  assert.equal(result.projects.length, 12)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].from, null, 'range를 쓰지 않아야 한다')
  assert.deepEqual(calls[0].orderColumns, ['project_name'], '기본 경로 정렬은 그대로여야 한다')
})

test('fetchAll이 관할 필터를 페이지마다 동일하게 유지한다', async () => {
  const rows = [
    ...makeRows(3),
    { id: 'x1', project_name: '타지사사업', managing_hq: '충남', managing_branch: '천안지사' },
  ]
  const { client, calls } = makeSupabase(rows)
  const { getProjectsByUserBranch } = await loadProjects(client)

  const result = await getProjectsByUserBranch(
    { id: 'u2', role: '발주청', hq_division: '경기', branch_division: '수원지사' },
    { fetchAll: true }
  )

  assert.equal(result.success, true)
  assert.equal(result.projects.length, 3)
  assert.deepEqual(calls[0].filters, ['managing_branch=수원지사', 'managing_hq=경기'])
})

test('fetchAll 일반지사는 동명 지사가 있는 다른 본부 사업을 가져오지 않는다', async () => {
  // 지하수지질부는 경기·충남 양쪽에 있다. 충남 소속 일반지사 계정은 충남 것만 봐야 한다.
  const rows = [
    { id: 'g1', project_name: '경기지하수사업', managing_hq: '경기', managing_branch: '지하수지질부' },
    { id: 'c1', project_name: '충남지하수사업', managing_hq: '충남', managing_branch: '지하수지질부' },
    { id: 'c2', project_name: '충남지하수사업2', managing_hq: '충남', managing_branch: '지하수지질부' },
  ]
  const { client, calls } = makeSupabase(rows)
  const { getProjectsByUserBranch } = await loadProjects(client)

  const result = await getProjectsByUserBranch(
    { id: 'u4', role: '발주청', hq_division: '충남', branch_division: '지하수지질부' },
    { fetchAll: true }
  )

  assert.equal(result.success, true)
  assert.deepEqual(
    result.projects.map((project) => project.id),
    ['c1', 'c2']
  )
  assert.deepEqual(calls[0].filters, ['managing_branch=지하수지질부', 'managing_hq=충남'])
})

test('fetchAll 없는 기존 경로는 본부 필터를 더하지 않는다', async () => {
  const { client, calls } = makeSupabase(makeRows(2))
  const { getProjectsByUserBranch } = await loadProjects(client)

  await getProjectsByUserBranch({
    id: 'u5',
    role: '발주청',
    hq_division: '경기',
    branch_division: '수원지사',
  })

  assert.deepEqual(calls[0].filters, ['managing_branch=수원지사'])
})

test('발주청이 아니면 조회 없이 빈 목록을 돌려준다', async () => {
  const { client, calls } = makeSupabase(makeRows(5))
  const { getProjectsByUserBranch } = await loadProjects(client)

  const result = await getProjectsByUserBranch(
    { id: 'u3', role: '시공사', hq_division: '경기', branch_division: '수원지사' },
    { fetchAll: true }
  )

  assert.equal(result.success, true)
  assert.deepEqual(result.projects, [])
  assert.equal(calls.length, 0)
})
