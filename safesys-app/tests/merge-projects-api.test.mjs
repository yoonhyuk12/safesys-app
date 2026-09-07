// 프로젝트 병합 API의 권한·충돌 차단·버전 RPC 호출·오류 응답을 검증한다.
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

const mergeConflicts = await transpile('../src/lib/merge-conflicts.ts')
const {
  describeMergeConflicts,
  parseMergeConflictCounts,
  totalMergeConflicts,
  hasMergeConflict,
  isMergeRpcMissingError,
  parseMergeConflictError,
} = mergeConflicts

const SOURCE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const TARGET_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const NO_CONFLICT = { workDailyReports: 0, qualityMonthlyReports: 0, scheduleConflict: false }

const nextServerMock = {
  NextResponse: {
    json: (body, init) => ({ body, status: init?.status ?? 200 }),
  },
}

// Supabase 쿼리 빌더를 흉내 내 테이블별 고정 결과를 돌려준다.
function makeQuery(result) {
  const query = {
    select: () => query,
    eq: () => query,
    in: () => query,
    single: async () => result,
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  }
  return query
}

function createSupabaseAdmin(options = {}) {
  const {
    user = { id: 'user-1' },
    authError = null,
    role = '발주청',
    projects = [{ id: SOURCE_ID, project_name: '삭제될 현장', created_by: 'owner-1' },
      { id: TARGET_ID, project_name: '유지될 현장', created_by: 'owner-2' }],
    shares = [],
    profiles = [],
    rpcResults = {},
  } = options

  const rpcCalls = []
  const tables = {
    user_profiles: { data: profiles.length > 0 ? profiles : [], error: null },
    projects: { data: projects, error: null },
    project_shares: { data: shares, error: null },
  }

  return {
    rpcCalls,
    client: {
      auth: {
        getUser: async () => ({ data: { user: authError ? null : user }, error: authError }),
      },
      from: (table) => {
        if (table === 'user_profiles') {
          // 권한 확인용 single()과 목록 조회용 in()을 같은 빌더로 처리한다.
          const result = { data: profiles, error: null }
          const query = {
            select: () => query,
            eq: () => query,
            in: () => query,
            single: async () => ({ data: role ? { role } : null, error: null }),
            then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
          }
          return query
        }
        return makeQuery(tables[table] ?? { data: [], error: null })
      },
      rpc: async (name, args) => {
        rpcCalls.push({ name, args })
        return rpcResults[name] ?? { data: null, error: null }
      },
    },
  }
}

async function loadRoute(admin) {
  return transpile('../src/app/api/projects/merge/route.ts', {
    'next/server': nextServerMock,
    '@/lib/supabase-admin': { supabaseAdmin: admin },
    '@/lib/merge-conflicts': mergeConflicts,
  })
}

function createGetRequest({ sourceId = SOURCE_ID, targetId = TARGET_ID, token = 'token-1' } = {}) {
  const params = new URLSearchParams()
  if (sourceId) params.set('sourceId', sourceId)
  if (targetId) params.set('targetId', targetId)
  return {
    headers: { get: (name) => (name.toLowerCase() === 'authorization' && token ? `Bearer ${token}` : null) },
    nextUrl: { searchParams: params },
  }
}

function createPostRequest({ sourceId = SOURCE_ID, targetId = TARGET_ID, token = 'token-1' } = {}) {
  return {
    headers: { get: (name) => (name.toLowerCase() === 'authorization' && token ? `Bearer ${token}` : null) },
    json: async () => ({ sourceId, targetId }),
  }
}

test('충돌 응답은 유한한 0 이상 정수 두 개와 boolean 공정표 충돌만 받아들인다', () => {
  assert.deepEqual(
    parseMergeConflictCounts({ workDailyReports: 0, qualityMonthlyReports: 2, scheduleConflict: true }),
    { workDailyReports: 0, qualityMonthlyReports: 2, scheduleConflict: true },
  )
  for (const invalid of [
    null, undefined, 'x', [], { workDailyReports: 1 },
    { workDailyReports: 1.5, qualityMonthlyReports: 0, scheduleConflict: false },
    { workDailyReports: -1, qualityMonthlyReports: 0, scheduleConflict: false },
    { workDailyReports: Number.NaN, qualityMonthlyReports: 0, scheduleConflict: false },
    { workDailyReports: Number.POSITIVE_INFINITY, qualityMonthlyReports: 0, scheduleConflict: false },
    { workDailyReports: '1', qualityMonthlyReports: 0, scheduleConflict: false },
    { workDailyReports: 1, qualityMonthlyReports: null, scheduleConflict: false },
    { workDailyReports: 0, qualityMonthlyReports: 0 },
    { workDailyReports: 0, qualityMonthlyReports: 0, scheduleConflict: 'false' },
    { workDailyReports: 0, qualityMonthlyReports: 0, scheduleConflict: 0 },
    { workDailyReports: 0, qualityMonthlyReports: 0, scheduleConflict: null },
  ]) {
    assert.equal(parseMergeConflictCounts(invalid), null, `허용하면 안 되는 값 ${JSON.stringify(invalid)}`)
  }
  assert.equal(totalMergeConflicts({ workDailyReports: 2, qualityMonthlyReports: 3, scheduleConflict: false }), 5)
  assert.equal(hasMergeConflict(NO_CONFLICT), false)
  assert.equal(hasMergeConflict({ ...NO_CONFLICT, scheduleConflict: true }), true)
  assert.equal(hasMergeConflict({ ...NO_CONFLICT, workDailyReports: 1 }), true)
})

test('충돌 안내 문구는 0건 항목을 빼고 마지막 낱말에 맞는 조사를 붙인다', () => {
  assert.equal(
    describeMergeConflicts({ ...NO_CONFLICT, scheduleConflict: true }),
    '그대로 옮길 수 없는 시공공정표가 있습니다. 원본 자료를 보존하기 위해 두 현장을 합칠 수 없습니다.',
  )
  assert.equal(
    describeMergeConflicts({ workDailyReports: 2, qualityMonthlyReports: 0, scheduleConflict: false }),
    '같은 날짜의 작업일보 2건이 있습니다. 원본 자료를 보존하기 위해 두 현장을 합칠 수 없습니다.',
  )
  assert.equal(
    describeMergeConflicts({ workDailyReports: 2, qualityMonthlyReports: 0, scheduleConflict: true }),
    '같은 날짜의 작업일보 2건과 그대로 옮길 수 없는 시공공정표가 있습니다. 원본 자료를 보존하기 위해 두 현장을 합칠 수 없습니다.',
  )
  assert.equal(describeMergeConflicts(NO_CONFLICT), '겹치는 자료가 없습니다.')
})

test('마이그레이션 전 RPC 부재 오류와 DB 최종 충돌 오류를 구분한다', () => {
  assert.equal(isMergeRpcMissingError({ code: 'PGRST202' }), true)
  assert.equal(isMergeRpcMissingError({ code: '42883' }), true)
  assert.equal(isMergeRpcMissingError({ code: 'P0001' }), false)
  assert.equal(isMergeRpcMissingError(null), false)

  assert.deepEqual(parseMergeConflictError({
    code: 'P0001',
    message: 'MERGE_REPORT_CONFLICT',
    details: JSON.stringify({ workDailyReports: 1, qualityMonthlyReports: 2, scheduleConflict: false }),
  }), { workDailyReports: 1, qualityMonthlyReports: 2, scheduleConflict: false })
  assert.deepEqual(parseMergeConflictError({
    code: 'P0001',
    message: 'MERGE_SCHEDULE_CONFLICT',
    details: JSON.stringify({ workDailyReports: 0, qualityMonthlyReports: 0, scheduleConflict: true }),
  }), { workDailyReports: 0, qualityMonthlyReports: 0, scheduleConflict: true })
  assert.equal(parseMergeConflictError({ code: 'P0001', message: '다른 오류', details: '{}' }), null)
  assert.equal(parseMergeConflictError({ code: 'P0001', message: 'MERGE_REPORT_CONFLICT', details: '깨진 값' }), null)
})

test('토큰이 없거나 권한이 없으면 병합 RPC를 호출하지 않는다', async () => {
  const anonymous = createSupabaseAdmin()
  const anonymousRoute = await loadRoute(anonymous.client)
  const unauthorized = await anonymousRoute.POST(createPostRequest({ token: '' }))
  assert.equal(unauthorized.status, 401)
  assert.deepEqual(anonymous.rpcCalls, [])

  const contractor = createSupabaseAdmin({ role: '시공사' })
  const contractorRoute = await loadRoute(contractor.client)
  const forbidden = await contractorRoute.POST(createPostRequest())
  assert.equal(forbidden.status, 403)
  assert.deepEqual(contractor.rpcCalls, [])
})

test('GET은 서버 미리보기 RPC로 두 종류 충돌 건수를 반환한다', async () => {
  const admin = createSupabaseAdmin({
    profiles: [{ id: 'owner-1', full_name: '홍길동', email: 'a@b.c', company_name: '가나', role: '시공사' }],
    rpcResults: {
      preview_project_merge_v2: { data: { workDailyReports: 2, qualityMonthlyReports: 1, scheduleConflict: false }, error: null },
    },
  })
  const route = await loadRoute(admin.client)
  const response = await route.GET(createGetRequest())

  assert.equal(response.status, 200)
  assert.equal(response.body.success, true)
  assert.equal(response.body.targetProjectName, '유지될 현장')
  assert.deepEqual(response.body.conflicts, { workDailyReports: 2, qualityMonthlyReports: 1, scheduleConflict: false })
  assert.deepEqual(admin.rpcCalls, [
    { name: 'preview_project_merge_v2', args: { p_source: SOURCE_ID, p_target: TARGET_ID } },
  ])
})

test('미리보기 RPC가 아직 없으면 GET·POST 모두 503으로 안전하게 실패한다', async () => {
  const missing = { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.preview_project_merge_v2' } }

  const getAdmin = createSupabaseAdmin({ rpcResults: { preview_project_merge_v2: missing } })
  const getRoute = await loadRoute(getAdmin.client)
  const getResponse = await getRoute.GET(createGetRequest())
  assert.equal(getResponse.status, 503)
  assert.equal(getResponse.body.success, false)
  assert.doesNotMatch(getResponse.body.error, /preview_project_merge_v2|PGRST202/)

  const postAdmin = createSupabaseAdmin({ rpcResults: { preview_project_merge_v2: missing } })
  const postRoute = await loadRoute(postAdmin.client)
  const postResponse = await postRoute.POST(createPostRequest())
  assert.equal(postResponse.status, 503)
  assert.deepEqual(postAdmin.rpcCalls.map((call) => call.name), ['preview_project_merge_v2'])
})

test('미리보기 조회 오류나 형식 오류면 병합을 차단한다', async () => {
  const failing = createSupabaseAdmin({
    rpcResults: { preview_project_merge_v2: { data: null, error: { code: '42501', message: 'permission denied for relation work_daily_reports' } } },
  })
  const failingRoute = await loadRoute(failing.client)
  const failed = await failingRoute.POST(createPostRequest())
  assert.equal(failed.status, 500)
  assert.doesNotMatch(failed.body.error, /permission denied|work_daily_reports/)
  assert.deepEqual(failing.rpcCalls.map((call) => call.name), ['preview_project_merge_v2'])

  const malformed = createSupabaseAdmin({
    rpcResults: { preview_project_merge_v2: { data: { workDailyReports: -3, qualityMonthlyReports: 0, scheduleConflict: false }, error: null } },
  })
  const malformedRoute = await loadRoute(malformed.client)
  const rejected = await malformedRoute.POST(createPostRequest())
  assert.equal(rejected.status, 500)
  assert.deepEqual(malformed.rpcCalls.map((call) => call.name), ['preview_project_merge_v2'])
})

test('미리보기에서 보고서 충돌이 있으면 409로 막고 병합 RPC를 호출하지 않는다', async () => {
  const admin = createSupabaseAdmin({
    rpcResults: {
      preview_project_merge_v2: { data: { workDailyReports: 3, qualityMonthlyReports: 1, scheduleConflict: false }, error: null },
    },
  })
  const route = await loadRoute(admin.client)
  const response = await route.POST(createPostRequest())

  assert.equal(response.status, 409)
  assert.equal(response.body.success, false)
  assert.deepEqual(response.body.conflicts, { workDailyReports: 3, qualityMonthlyReports: 1, scheduleConflict: false })
  assert.match(response.body.error, /합칠 수 없습니다/)
  assert.match(response.body.error, /3/)
  assert.match(response.body.error, /1/)
  assert.deepEqual(admin.rpcCalls.map((call) => call.name), ['preview_project_merge_v2'])
})

test('충돌이 없으면 새 안전 RPC를 같은 인자로 호출한다', async () => {
  const admin = createSupabaseAdmin({
    rpcResults: {
      preview_project_merge_v2: { data: NO_CONFLICT, error: null },
      merge_projects_safe_v2: { data: { moved: 27 }, error: null },
    },
  })
  const route = await loadRoute(admin.client)
  const response = await route.POST(createPostRequest())

  assert.equal(response.status, 200)
  assert.equal(response.body.success, true)
  assert.deepEqual(admin.rpcCalls, [
    { name: 'preview_project_merge_v2', args: { p_source: SOURCE_ID, p_target: TARGET_ID } },
    { name: 'merge_projects_safe_v2', args: { p_source: SOURCE_ID, p_target: TARGET_ID } },
  ])
  assert.equal(admin.rpcCalls.some((call) => call.name === 'merge_projects'), false)
})

test('DB 최종 충돌은 409로 안내하고 구버전 RPC로 대체하지 않는다', async () => {
  const admin = createSupabaseAdmin({
    rpcResults: {
      preview_project_merge_v2: { data: NO_CONFLICT, error: null },
      merge_projects_safe_v2: {
        data: null,
        error: {
          code: 'P0001',
          message: 'MERGE_REPORT_CONFLICT',
          details: JSON.stringify({ workDailyReports: 1, qualityMonthlyReports: 0, scheduleConflict: false }),
        },
      },
    },
  })
  const route = await loadRoute(admin.client)
  const response = await route.POST(createPostRequest())

  assert.equal(response.status, 409)
  assert.deepEqual(response.body.conflicts, { workDailyReports: 1, qualityMonthlyReports: 0, scheduleConflict: false })
  assert.doesNotMatch(response.body.error, /MERGE_REPORT_CONFLICT|P0001/)
  assert.deepEqual(admin.rpcCalls.map((call) => call.name),
    ['preview_project_merge_v2', 'merge_projects_safe_v2'])
})

test('병합 RPC가 아직 없으면 503으로 실패하고 구버전 merge_projects를 호출하지 않는다', async () => {
  const admin = createSupabaseAdmin({
    rpcResults: {
      preview_project_merge_v2: { data: NO_CONFLICT, error: null },
      merge_projects_safe_v2: { data: null, error: { code: '42883', message: 'function merge_projects_safe_v2 does not exist' } },
    },
  })
  const route = await loadRoute(admin.client)
  const response = await route.POST(createPostRequest())

  assert.equal(response.status, 503)
  assert.doesNotMatch(response.body.error, /merge_projects_safe_v2|42883/)
  assert.equal(admin.rpcCalls.some((call) => call.name === 'merge_projects'), false)
})

test('그 밖의 병합 실패는 DB 메시지를 감춘 500으로 응답한다', async () => {
  const admin = createSupabaseAdmin({
    rpcResults: {
      preview_project_merge_v2: { data: NO_CONFLICT, error: null },
      merge_projects_safe_v2: { data: null, error: { code: '23503', message: 'insert or update on table "tbm_records" violates foreign key constraint' } },
    },
  })
  const route = await loadRoute(admin.client)
  const response = await route.POST(createPostRequest())

  assert.equal(response.status, 500)
  assert.doesNotMatch(response.body.error, /tbm_records|foreign key/)
})

test('존재하지 않는 프로젝트는 RPC 호출 전에 404로 막는다', async () => {
  const admin = createSupabaseAdmin({ projects: [{ id: TARGET_ID, project_name: '유지될 현장', created_by: 'owner-2' }] })
  const route = await loadRoute(admin.client)
  const response = await route.POST(createPostRequest())

  assert.equal(response.status, 404)
  assert.deepEqual(admin.rpcCalls, [])
})

test('공정표 공사기간이 다르면 보고서가 없어도 409로 막는다', async () => {
  const admin = createSupabaseAdmin({
    rpcResults: {
      preview_project_merge_v2: { data: { ...NO_CONFLICT, scheduleConflict: true }, error: null },
    },
  })
  const route = await loadRoute(admin.client)
  const response = await route.POST(createPostRequest())

  assert.equal(response.status, 409)
  assert.equal(response.body.success, false)
  assert.deepEqual(response.body.conflicts, { workDailyReports: 0, qualityMonthlyReports: 0, scheduleConflict: true })
  assert.match(response.body.error, /공정표/)
  assert.match(response.body.error, /합칠 수 없습니다/)
  assert.deepEqual(admin.rpcCalls.map((call) => call.name), ['preview_project_merge_v2'])
})

test('DB 최종 공정표 충돌도 409로 안내한다', async () => {
  const admin = createSupabaseAdmin({
    rpcResults: {
      preview_project_merge_v2: { data: NO_CONFLICT, error: null },
      merge_projects_safe_v2: {
        data: null,
        error: {
          code: 'P0001',
          message: 'MERGE_SCHEDULE_CONFLICT',
          details: JSON.stringify({ workDailyReports: 0, qualityMonthlyReports: 0, scheduleConflict: true }),
        },
      },
    },
  })
  const route = await loadRoute(admin.client)
  const response = await route.POST(createPostRequest())

  assert.equal(response.status, 409)
  assert.deepEqual(response.body.conflicts, { workDailyReports: 0, qualityMonthlyReports: 0, scheduleConflict: true })
  assert.match(response.body.error, /공정표/)
  assert.doesNotMatch(response.body.error, /MERGE_SCHEDULE_CONFLICT|P0001/)
  assert.deepEqual(admin.rpcCalls.map((call) => call.name),
    ['preview_project_merge_v2', 'merge_projects_safe_v2'])
})

test('미리보기 응답에 scheduleConflict가 없거나 boolean이 아니면 병합을 차단한다', async () => {
  for (const data of [
    { workDailyReports: 0, qualityMonthlyReports: 0 },
    { workDailyReports: 0, qualityMonthlyReports: 0, scheduleConflict: 'false' },
  ]) {
    const admin = createSupabaseAdmin({ rpcResults: { preview_project_merge_v2: { data, error: null } } })
    const route = await loadRoute(admin.client)

    const posted = await route.POST(createPostRequest())
    assert.equal(posted.status, 500, `허용하면 안 되는 응답 ${JSON.stringify(data)}`)
    assert.deepEqual(admin.rpcCalls.map((call) => call.name), ['preview_project_merge_v2'])

    const getAdmin = createSupabaseAdmin({ rpcResults: { preview_project_merge_v2: { data, error: null } } })
    const getRoute = await loadRoute(getAdmin.client)
    const fetched = await getRoute.GET(createGetRequest())
    assert.equal(fetched.status, 500)
    assert.equal(fetched.body.success, false)
  }
})
