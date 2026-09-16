// 프로젝트 전용 사고보고의 조회 격리·누락 방지·오류 노출과 사고 입력 모달의 프로젝트 고정 모드를 검증한다
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import test from 'node:test'
import ts from 'typescript'

const nodeRequire = createRequire(import.meta.url)
const React = nodeRequire('react')
const { renderToStaticMarkup } = nodeRequire('react-dom/server')

/**
 * `@/` 별칭 모듈을 실제 소스로 따라가며 전부 transpile한다.
 * `overrides`에 담긴 이름만 대역으로 바꾸고, 그 밖의 패키지는 node가 해결한다.
 */
function createLoader(overrides) {
  const cache = new Map()

  const resolveAlias = async (name) => {
    const relative = name.replace('@/', '../src/')
    for (const suffix of ['.ts', '.tsx']) {
      try {
        const url = new URL(`${relative}${suffix}`, import.meta.url)
        return { url, source: await readFile(url, 'utf8') }
      } catch {
        // 다음 확장자를 시도한다.
      }
    }
    throw new Error(`별칭 모듈을 찾지 못했다: ${name}`)
  }

  const load = async (name) => {
    if (name in overrides) return overrides[name]
    if (!name.startsWith('@/')) return nodeRequire(name)
    if (cache.has(name)) return cache.get(name)

    const { source } = await resolveAlias(name)
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    })

    // 의존성을 먼저 모두 로드해 동기 require로 돌려줄 수 있게 한다.
    const dependencies = new Map()
    for (const match of outputText.matchAll(/require\(["']([^"']+)["']\)/g)) {
      const dependency = match[1]
      if (!dependencies.has(dependency)) dependencies.set(dependency, await load(dependency))
    }

    const module = { exports: {} }
    cache.set(name, module.exports)
    const requireShim = (dependency) => {
      if (!dependencies.has(dependency)) throw new Error(`예상하지 못한 의존성 ${dependency}`)
      return dependencies.get(dependency)
    }
    new Function('module', 'exports', 'require', outputText)(module, module.exports, requireShim)
    cache.set(name, module.exports)
    return module.exports
  }

  return load
}

/** project_accidents 조회 대역 — 호출 인자를 기록하고 페이지별 응답을 순서대로 돌려준다. */
function createAccidentSupabaseStub(pages) {
  const calls = { tables: [], filters: [], orders: [], ranges: [] }
  let pageIndex = 0

  const builder = {
    select() { return builder },
    eq(column, value) { calls.filters.push([column, value]); return builder },
    is(column, value) { calls.filters.push([column, value]); return builder },
    in(column, value) { calls.filters.push([column, value]); return builder },
    gte(column, value) { calls.filters.push([column, value]); return builder },
    lt(column, value) { calls.filters.push([column, value]); return builder },
    lte(column, value) { calls.filters.push([column, value]); return builder },
    order(column, options) { calls.orders.push([column, options]); return builder },
    range(from, to) { calls.ranges.push([from, to]); return builder },
    then(resolve, reject) {
      const page = pages[Math.min(pageIndex, pages.length - 1)]
      pageIndex += 1
      return Promise.resolve(page).then(resolve, reject)
    },
  }

  return {
    calls,
    client: {
      from(table) { calls.tables.push(table); return builder },
    },
  }
}

async function loadAccidentLib(pages = [{ data: [], error: null }]) {
  const stub = createAccidentSupabaseStub(pages)
  const load = createLoader({ '@/lib/supabase': { supabase: stub.client } })
  const lib = await load('@/lib/accident-analysis')
  return { lib, calls: stub.calls }
}

const accidentRow = (id, accidentAt) => ({
  id,
  project_id: 'project-a',
  external_project_name: null,
  external_managing_hq: null,
  external_managing_branch: null,
  accident_at: accidentAt,
  severity: 'minor',
  accident_type: '넘어짐',
  location: '가설통로',
  work_description: '자재 운반',
  description: '이동 중 미끄러짐',
  cause: '통로 물기',
  prevention_action: '배수 및 미끄럼 방지 처리',
  injured_count: 1,
  fatal_count: 0,
  lost_workdays: 3,
  workers_comp_claim: 'applied',
  created_by: 'user-1',
  created_at: accidentAt,
  updated_at: accidentAt,
})

test('프로젝트 사고 조회는 그 프로젝트만 최신순으로 읽는다', async () => {
  const { lib, calls } = await loadAccidentLib([
    { data: [accidentRow('a2', '2026-09-10T00:00:00+09:00'), accidentRow('a1', '2026-08-01T00:00:00+09:00')], error: null },
  ])

  const accidents = await lib.getProjectAccidents('project-a')

  assert.deepEqual(calls.tables, ['project_accidents'])
  assert.deepEqual(calls.filters, [['project_id', 'project-a']])
  assert.equal(calls.orders[0][0], 'accident_at')
  assert.equal(calls.orders[0][1].ascending, false)
  assert.deepEqual(accidents.map((accident) => accident.id), ['a2', 'a1'])
})

test('앞뒤 공백만 있는 프로젝트 id로는 조회하지 않는다', async () => {
  const { lib, calls } = await loadAccidentLib()

  await assert.rejects(() => lib.getProjectAccidents('   '), /프로젝트/)
  assert.deepEqual(calls.tables, [])
})

test('페이지 한도를 넘는 사고도 빠짐없이 모은다', async () => {
  const { lib } = await loadAccidentLib([])
  const pageSize = lib.PROJECT_ACCIDENT_PAGE_SIZE
  assert.ok(Number.isInteger(pageSize) && pageSize > 0, '페이지 크기를 공개해야 한다')

  const firstPage = Array.from({ length: pageSize }, (_, index) =>
    accidentRow(`first-${index}`, '2026-09-10T00:00:00+09:00'))
  const secondPage = [accidentRow('last', '2026-01-01T00:00:00+09:00')]
  const { lib: paged, calls } = await loadAccidentLib([
    { data: firstPage, error: null },
    { data: secondPage, error: null },
  ])

  const accidents = await paged.getProjectAccidents('project-a')

  assert.equal(accidents.length, pageSize + 1)
  assert.equal(accidents.at(-1).id, 'last')
  assert.deepEqual(calls.ranges, [[0, pageSize - 1], [pageSize, pageSize * 2 - 1]])
})

test('조회 실패는 빈 목록으로 감추지 않고 오류로 올린다', async () => {
  const { lib } = await loadAccidentLib([{ data: null, error: { message: 'permission denied' } }])

  await assert.rejects(() => lib.getProjectAccidents('project-a'), /사고 이력/)
})

const PROJECT = {
  id: 'project-a',
  project_name: '○○지구 배수개선사업',
  managing_hq: '전북본부',
  managing_branch: '김제지사',
  display_order: 1,
}

const OTHER_PROJECT = {
  id: 'project-b',
  project_name: '△△지구 용수개발사업',
  managing_hq: '전남본부',
  managing_branch: '나주지사',
  display_order: 2,
}

async function renderModal(props) {
  const load = createLoader({ '@/lib/supabase': { supabase: {} } })
  const modalModule = await load('@/components/dashboard/AccidentEntryModal')
  const AccidentEntryModal = modalModule.default
  return renderToStaticMarkup(React.createElement(AccidentEntryModal, {
    isOpen: true,
    projects: [PROJECT, OTHER_PROJECT],
    accident: null,
    submitting: false,
    submitError: '',
    onClose: () => undefined,
    onSubmit: () => undefined,
    ...props,
  }))
}

test('일반 모드 모달은 프로젝트 검색과 미등록 현장 직접입력을 그대로 제공한다', async () => {
  const markup = await renderModal({})

  assert.match(markup, /role="combobox"/)
  assert.match(markup, /미등록 현장 직접입력/)
})

test('프로젝트 고정 모달은 그 현장만 보여주고 프로젝트 검색을 없앤다', async () => {
  const markup = await renderModal({ fixedProject: PROJECT })

  assert.doesNotMatch(markup, /role="combobox"/)
  assert.doesNotMatch(markup, /미등록 현장 직접입력/)
  assert.match(markup, /○○지구 배수개선사업/)
  assert.doesNotMatch(markup, /△△지구 용수개발사업/)
})

test('프로젝트 고정 모달은 미등록 현장으로 저장된 사고도 그 현장에 묶는다', async () => {
  const externalAccident = {
    ...accidentRow('external-1', '2026-09-10T00:00:00+09:00'),
    project_id: null,
    external_project_name: '미등록 현장',
    external_managing_hq: '전북본부',
    external_managing_branch: '김제지사',
  }

  const markup = await renderModal({ fixedProject: PROJECT, accident: externalAccident })

  assert.doesNotMatch(markup, /미등록 현장의 관할 본부/)
  assert.match(markup, /○○지구 배수개선사업/)
})

test('타인 보고 관리 권한은 본사·관리자급만 전사로 열린다', async () => {
  const load = createLoader({})
  const { canManageProjectAccidents } = await load('@/lib/accident-permissions')
  const otherHqProject = { managing_hq: '전남본부' }

  assert.equal(canManageProjectAccidents({ role: '발주청', hq_division: null, branch_division: null }, otherHqProject), true)
  assert.equal(canManageProjectAccidents({ role: '발주청', hq_division: '본사', branch_division: '본사' }, otherHqProject), true)
  assert.equal(canManageProjectAccidents(null, otherHqProject), false)
})

test('본부 소속은 자기 본부가 관할하는 현장만 타인 보고를 고친다', async () => {
  const load = createLoader({})
  const { canManageProjectAccidents } = await load('@/lib/accident-permissions')
  const jeonbukManager = { role: '발주청', hq_division: '전북본부', branch_division: '전북본부' }

  assert.equal(canManageProjectAccidents(jeonbukManager, { managing_hq: '전북본부' }), true)
  assert.equal(canManageProjectAccidents(jeonbukManager, { managing_hq: '전남본부' }), false)
  // 현장을 아직 못 읽었으면 관할을 확인할 수 없으므로 열지 않는다.
  assert.equal(canManageProjectAccidents(jeonbukManager, null), false)
})

test('지사 소속과 현장 사용자는 타인 보고를 고치지 못한다', async () => {
  const load = createLoader({})
  const { canManageProjectAccidents } = await load('@/lib/accident-permissions')
  const sameHqProject = { managing_hq: '전북본부' }

  assert.equal(canManageProjectAccidents({ role: '발주청', hq_division: '전북본부', branch_division: '김제지사' }, sameHqProject), false)
  assert.equal(canManageProjectAccidents({ role: '시공사', hq_division: '전북본부', branch_division: '전북본부' }, sameHqProject), false)
  assert.equal(canManageProjectAccidents({ role: '감리단', hq_division: null, branch_division: null }, sameHqProject), false)
})

test('사고일자는 보는 사람의 시간대와 무관하게 서울 날짜로 읽힌다', async () => {
  const load = createLoader({})
  const { formatAccidentDate } = await load('@/lib/accident-report-format')
  const previousTimeZone = process.env.TZ

  try {
    // 서울 자정 저장분을 서반구에서 열면 시간대를 고정하지 않는 한 전날로 보인다.
    process.env.TZ = 'America/Los_Angeles'
    assert.equal(new Date('2026-09-16T00:00:00+09:00').toLocaleDateString('ko-KR'), '2026. 9. 15.')
    assert.equal(formatAccidentDate('2026-09-16T00:00:00+09:00'), '2026. 9. 16.')
  } finally {
    if (previousTimeZone === undefined) delete process.env.TZ
    else process.env.TZ = previousTimeZone
  }
})

const OWN_ACCIDENT = { ...accidentRow('own-1', '2026-09-10T00:00:00+09:00'), created_by: 'me' }
const OTHERS_ACCIDENT = { ...accidentRow('other-1', '2026-09-09T00:00:00+09:00'), created_by: 'someone-else' }

async function renderList(props) {
  const load = createLoader({ '@/lib/supabase': { supabase: {} } })
  const listModule = await load('@/components/project/accident-report/AccidentReportList')
  return renderToStaticMarkup(React.createElement(listModule.default, {
    accidents: [OWN_ACCIDENT, OTHERS_ACCIDENT],
    loadError: null,
    canCreate: true,
    canModify: () => true,
    deletingId: null,
    onRetry: () => undefined,
    onSelect: () => undefined,
    onCreate: () => undefined,
    onEdit: () => undefined,
    onDelete: () => undefined,
    ...props,
  }))
}

async function renderDetail(props) {
  const load = createLoader({ '@/lib/supabase': { supabase: {} } })
  const detailModule = await load('@/components/project/accident-report/AccidentReportDetail')
  return renderToStaticMarkup(React.createElement(detailModule.default, {
    accident: OWN_ACCIDENT,
    projectName: PROJECT.project_name,
    canModify: true,
    deleting: false,
    onEdit: () => undefined,
    onDelete: () => undefined,
    ...props,
  }))
}

test('목록은 조회 실패를 빈 목록이 아니라 오류와 재시도로 보여준다', async () => {
  const markup = await renderList({ accidents: [], loadError: '사고 이력을 불러오지 못했습니다.' })

  assert.match(markup, /사고 이력을 불러오지 못했습니다\./)
  assert.match(markup, /다시 시도/)
  assert.doesNotMatch(markup, /등록된 사고가 없습니다/)
})

test('사고가 없으면 등록 권한이 있을 때만 등록 버튼을 준다', async () => {
  const withPermission = await renderList({ accidents: [], canCreate: true })
  const withoutPermission = await renderList({ accidents: [], canCreate: false })

  assert.match(withPermission, /등록된 사고가 없습니다/)
  assert.match(withPermission, /사고 등록/)
  assert.match(withoutPermission, /등록된 사고가 없습니다/)
  assert.doesNotMatch(withoutPermission, /사고 등록/)
})

test('목록의 수정·삭제는 고칠 수 있는 사고에만 붙는다', async () => {
  const markup = await renderList({ canModify: (accident) => accident.created_by === 'me' })

  assert.match(markup, /aria-label="2026\. 9\. 10\. 사고 수정"/)
  assert.match(markup, /aria-label="2026\. 9\. 10\. 사고 삭제"/)
  assert.doesNotMatch(markup, /2026\. 9\. 9\. 사고 수정/)
})

test('고칠 수 있는 사고가 하나도 없으면 관리 열 자체를 두지 않는다', async () => {
  const markup = await renderList({ canModify: () => false })

  assert.doesNotMatch(markup, /사고 수정/)
  assert.doesNotMatch(markup, /사고 삭제/)
  assert.doesNotMatch(markup, />관리</)
})

test('목록의 상세 진입은 키보드로 누를 수 있는 버튼이다', async () => {
  const markup = await renderList({})

  assert.match(markup, /<button type="button" class="min-h-\[44px\][^"]*">2026\. 9\. 10\.<\/button>/)
})

test('상세는 기존 사고 항목을 모두 보여준다', async () => {
  const markup = await renderDetail({})

  for (const label of ['현장', '사고일자', '사고 장소', '사고 당시 작업', '사고 개요', '사고 원인', '재발방지 대책', '부상자 수', '사망자 수', '휴업일수', '산재신청 여부']) {
    assert.ok(markup.includes(`>${label}<`), `상세에 ${label} 항목이 없다`)
  }
  assert.match(markup, /이동 중 미끄러짐/)
  assert.match(markup, /배수 및 미끄럼 방지 처리/)
})

test('상세의 수정·삭제는 고칠 권한이 있을 때만 보인다', async () => {
  const allowed = await renderDetail({ canModify: true })
  const blocked = await renderDetail({ canModify: false })

  assert.match(allowed, />수정</)
  assert.match(allowed, />삭제</)
  assert.doesNotMatch(blocked, />수정</)
  assert.doesNotMatch(blocked, />삭제</)
})

const projectPageSource = await readFile(
  new URL('../src/app/project/[id]/page.tsx', import.meta.url),
  'utf8',
)

test('안전캐비넷 A(조치)에 사고보고 서류철이 있다', () => {
  // 안전 캐비넷의 A 그룹 라벨 직후부터 그 캐비넷이 닫히기 전까지가 검사 대상이다.
  const afterLabel = projectPageSource.split('A (조치)</div>')[1] ?? ''
  const actionBlock = afterLabel.split('</CabinetDrawer>')[0]

  assert.match(actionBlock, /title="사고\n보고"/)
  assert.match(actionBlock, /\/accident-report`\)/)
})
