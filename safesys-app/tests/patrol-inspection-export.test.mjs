// 패트롤 엑셀을 실제 ExcelJS 워크북으로 다시 읽어 18열 구성·주소 보완·지연 음영·실패 시 미다운로드를 검증한다.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'
import ExcelJS from 'exceljs'

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

const utils = await transpile('../src/lib/patrol-inspection-utils.ts')

const FINDING_LABELS = {
  work_stop: '작업중지',
  corrective_action: '시정조치',
  not_applicable: '해당없음',
}

const EXPECTED_HEADERS = [
  '순번',
  '본부',
  '지사',
  '사업구분',
  '사업명',
  '총사업비(백만원)',
  '시공사명',
  '지적유형',
  '지적일(점검일)',
  '지적내용',
  '조치내용(재발방지대책)(AI작성)',
  '재해유형(AI작성)',
  '점검종류',
  '작업주소',
  '조치완료일',
  '공사감독',
  '확인자',
  '비고',
]

const STORAGE_BASE =
  'https://example.supabase.co/storage/v1/object/public/inspection-photos/headquarters-actions'

function photoUrlForSeoulDate(dateText) {
  return `${STORAGE_BASE}/${Date.parse(`${dateText}T03:00:00.000Z`)}-abcdefghijk.jpg`
}

/** 브라우저 전역을 흉내내고 다운로드 시도를 기록한다. */
function installBrowserStubs() {
  const state = { clicks: 0, blobs: [], alerts: 0 }

  globalThis.document = {
    createElement() {
      return {
        href: '',
        download: '',
        click() {
          state.clicks += 1
        },
      }
    },
  }
  globalThis.URL.createObjectURL = (blob) => {
    state.blobs.push(blob)
    return 'blob:patrol-test'
  }
  globalThis.URL.revokeObjectURL = () => {}
  globalThis.alert = () => {
    state.alerts += 1
  }

  return state
}

async function loadExport(fetchImpl, { accessToken = 'token-abc' } = {}) {
  globalThis.fetch = fetchImpl

  return transpile('../src/lib/excel/patrol-inspection-export.ts', {
    // 기본 내보내기 형태로 넘겨야 transpile 된 default import 가 잡힌다.
    exceljs: { default: ExcelJS },
    '@/lib/supabase': {
      supabase: {
        auth: {
          async getSession() {
            return { data: { session: accessToken ? { access_token: accessToken } : null } }
          },
        },
      },
    },
    '@/lib/inspection/headquarters-finding-type': {
      headquartersFindingTypeLabel: (value) => FINDING_LABELS[value] ?? '시정조치',
    },
    '@/lib/patrol-inspections': utils,
  })
}

function inspection(overrides = {}) {
  return {
    id: '11111111-2222-4333-8444-000000000001',
    project_id: 'p-1',
    project_name: '○○지구 배수개선사업',
    managing_hq: '경기',
    managing_branch: '경기본부',
    project_category: '기반사업처',
    total_budget: '49233',
    contractor_name: '대한건설(주)',
    supervisor_position: '3급',
    supervisor_name: '박상진',
    actual_work_address: '충청남도 아산시 영인면 역리 780',
    site_address: '',
    inspection_date: '2026-07-01',
    inspector_name: '3급 홍길동',
    issue_content1: '안전난간 미설치',
    issue_content2: '',
    issue1_status: 'completed',
    action_photo_issue1: photoUrlForSeoulDate('2026-07-03'),
    action_photo_issue2: null,
    site_photo_issue2: null,
    patrol_car_used: true,
    finding_type: 'corrective_action',
    created_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  }
}

function aiOkResponse(items) {
  return {
    ok: true,
    status: 200,
    async json() {
      const results = {}
      for (const item of items) {
        results[item.id] = { action: `${item.id} 재발방지대책`, disasterType: '추락' }
      }
      return { success: true, results }
    },
  }
}

async function readWorkbook(blob) {
  const buffer = Buffer.from(await blob.arrayBuffer())
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  return workbook.worksheets[0]
}

test('성공하면 18열 헤더가 계약 순서대로 만들어진다', async () => {
  const stubs = installBrowserStubs()
  const items = [inspection()]
  const { downloadPatrolInspectionExcel } = await loadExport(async () => aiOkResponse(items))

  await downloadPatrolInspectionExcel([], items, '2026Q3')

  assert.equal(stubs.clicks, 1)
  const sheet = await readWorkbook(stubs.blobs[0])
  const headers = sheet.getRow(1).values.slice(1)
  assert.deepEqual(headers, EXPECTED_HEADERS)
  assert.equal(sheet.actualRowCount, 2)
})

test('지적 2건은 한 셀에 번호와 줄바꿈으로 들어간다', async () => {
  const stubs = installBrowserStubs()
  const items = [inspection({ issue_content2: '개구부 덮개 미고정' })]
  const { downloadPatrolInspectionExcel } = await loadExport(async () => aiOkResponse(items))

  await downloadPatrolInspectionExcel([], items, '2026Q3')

  const sheet = await readWorkbook(stubs.blobs[0])
  const issueCell = sheet.getRow(2).getCell(EXPECTED_HEADERS.indexOf('지적내용') + 1)
  assert.equal(issueCell.value, '1. 안전난간 미설치\n2. 개구부 덮개 미고정')
})

test('총사업비는 백만원 값을 그대로 숫자 셀로 넣는다', async () => {
  const stubs = installBrowserStubs()
  const items = [inspection()]
  const { downloadPatrolInspectionExcel } = await loadExport(async () => aiOkResponse(items))

  await downloadPatrolInspectionExcel([], items, '2026Q3')

  const sheet = await readWorkbook(stubs.blobs[0])
  const budgetCell = sheet.getRow(2).getCell(EXPECTED_HEADERS.indexOf('총사업비(백만원)') + 1)
  assert.equal(budgetCell.value, 49233)
})

test('작업주소가 빈 문자열이면 현장주소와 상세주소로 보완한다', async () => {
  const stubs = installBrowserStubs()
  const items = [inspection({ actual_work_address: '   ', site_address: '경기도 연천군 장남면 원당리 408-8' })]
  const projects = [
    {
      id: 'p-1',
      site_address: '경기도 연천군 장남면 원당리 408-8',
      site_address_detail: '수로 3공구',
    },
  ]
  const { downloadPatrolInspectionExcel } = await loadExport(async () => aiOkResponse(items))

  await downloadPatrolInspectionExcel(projects, items, '2026Q3')

  const sheet = await readWorkbook(stubs.blobs[0])
  const addressCell = sheet.getRow(2).getCell(EXPECTED_HEADERS.indexOf('작업주소') + 1)
  assert.equal(addressCell.value, '경기도 연천군 장남면 원당리 408-8 수로 3공구')
})

test('시공사명이 빈 문자열이면 계약 상호나 소속 회사명으로 보완한다', async () => {
  const stubs = installBrowserStubs()
  const items = [inspection({ contractor_name: '  ' })]
  const projects = [{ id: 'p-1', g2b_corp_nm: '나라장터건설(주)' }]
  const { downloadPatrolInspectionExcel } = await loadExport(async () => aiOkResponse(items))

  await downloadPatrolInspectionExcel(projects, items, '2026Q3')

  const sheet = await readWorkbook(stubs.blobs[0])
  const contractorCell = sheet.getRow(2).getCell(EXPECTED_HEADERS.indexOf('시공사명') + 1)
  assert.equal(contractorCell.value, '나라장터건설(주)')
})

test('g2b 상호가 없으면 현장 소속 회사명으로 보완한다', async () => {
  const stubs = installBrowserStubs()
  const items = [inspection({ contractor_name: '' })]
  const projects = [{ id: 'p-1', g2b_corp_nm: '   ', user_profiles: { company_name: '현장건설(주)' } }]
  const { downloadPatrolInspectionExcel } = await loadExport(async () => aiOkResponse(items))

  await downloadPatrolInspectionExcel(projects, items, '2026Q3')

  const sheet = await readWorkbook(stubs.blobs[0])
  const contractorCell = sheet.getRow(2).getCell(EXPECTED_HEADERS.indexOf('시공사명') + 1)
  assert.equal(contractorCell.value, '현장건설(주)')
})

test('7일을 넘긴 건은 점검일·조치완료일 셀에 음영이 들어간다', async () => {
  const stubs = installBrowserStubs()
  const late = inspection({
    id: '11111111-2222-4333-8444-000000000009',
    action_photo_issue1: photoUrlForSeoulDate('2026-07-09'),
  })
  const onTime = inspection({
    id: '11111111-2222-4333-8444-000000000008',
    action_photo_issue1: photoUrlForSeoulDate('2026-07-08'),
  })
  const items = [late, onTime]
  const { downloadPatrolInspectionExcel } = await loadExport(async () => aiOkResponse(items))

  await downloadPatrolInspectionExcel([], items, '2026Q3')

  const sheet = await readWorkbook(stubs.blobs[0])
  const dateColumn = EXPECTED_HEADERS.indexOf('지적일(점검일)') + 1
  const doneColumn = EXPECTED_HEADERS.indexOf('조치완료일') + 1

  const lateRow = sheet.getRow(2)
  assert.equal(lateRow.getCell(doneColumn).value, '2026-07-09')
  assert.equal(lateRow.getCell(dateColumn).fill?.fgColor?.argb, 'FFFCE4E4')
  assert.equal(lateRow.getCell(doneColumn).fill?.fgColor?.argb, 'FFFCE4E4')

  const onTimeRow = sheet.getRow(3)
  assert.equal(onTimeRow.getCell(doneColumn).value, '2026-07-08')
  assert.notEqual(onTimeRow.getCell(dateColumn).fill?.fgColor?.argb, 'FFFCE4E4')
})

test('AI 가 401 이면 파일을 내려받지 않고 오류를 던진다', async () => {
  const stubs = installBrowserStubs()
  const items = [inspection()]
  const { downloadPatrolInspectionExcel } = await loadExport(async () => ({
    ok: false,
    status: 401,
    async json() {
      return { success: false, error: '로그인이 필요합니다.' }
    },
  }))

  await assert.rejects(() => downloadPatrolInspectionExcel([], items, '2026Q3'), /로그인/)
  assert.equal(stubs.clicks, 0)
  assert.equal(stubs.blobs.length, 0)
  assert.equal(stubs.alerts, 0)
})

test('AI 가 403 이면 권한 문구를 그대로 전달한다', async () => {
  const stubs = installBrowserStubs()
  const items = [inspection()]
  const { downloadPatrolInspectionExcel } = await loadExport(async () => ({
    ok: false,
    status: 403,
    async json() {
      return { success: false, error: '조회 권한이 없는 점검이 포함되어 있습니다.' }
    },
  }))

  await assert.rejects(() => downloadPatrolInspectionExcel([], items, '2026Q3'), /권한/)
  assert.equal(stubs.clicks, 0)
})

test('AI 결과가 하나라도 비면 부분 엑셀을 내려받지 않는다', async () => {
  const stubs = installBrowserStubs()
  const items = [inspection(), inspection({ id: '11111111-2222-4333-8444-000000000002' })]
  const { downloadPatrolInspectionExcel } = await loadExport(async () => aiOkResponse([items[0]]))

  await assert.rejects(() => downloadPatrolInspectionExcel([], items, '2026Q3'))
  assert.equal(stubs.clicks, 0)
  assert.equal(stubs.alerts, 0)
})

test('네트워크 오류도 다운로드 없이 오류로 전달한다', async () => {
  const stubs = installBrowserStubs()
  const items = [inspection()]
  const { downloadPatrolInspectionExcel } = await loadExport(async () => {
    throw new Error('network down')
  })

  await assert.rejects(() => downloadPatrolInspectionExcel([], items, '2026Q3'))
  assert.equal(stubs.clicks, 0)
})

test('로그인 세션이 없으면 AI 를 부르지 않고 오류를 던진다', async () => {
  const stubs = installBrowserStubs()
  const items = [inspection()]
  let called = 0
  const { downloadPatrolInspectionExcel } = await loadExport(
    async () => {
      called += 1
      return aiOkResponse(items)
    },
    { accessToken: null }
  )

  await assert.rejects(() => downloadPatrolInspectionExcel([], items, '2026Q3'))
  assert.equal(called, 0)
  assert.equal(stubs.clicks, 0)
})

test('빈 목록은 시작 전에 막는다', async () => {
  const stubs = installBrowserStubs()
  const { downloadPatrolInspectionExcel } = await loadExport(async () => aiOkResponse([]))

  await assert.rejects(() => downloadPatrolInspectionExcel([], [], '2026Q3'))
  assert.equal(stubs.clicks, 0)
})

test('21건은 20+1 두 배치로 나눠 부르고 전체 행을 만든다', async () => {
  const stubs = installBrowserStubs()
  const items = Array.from({ length: 21 }, (_, index) =>
    inspection({ id: `11111111-2222-4333-8444-${String(index + 1).padStart(12, '0')}` })
  )

  const batchSizes = []
  const { downloadPatrolInspectionExcel } = await loadExport(async (_url, init) => {
    const ids = JSON.parse(init.body).inspectionIds
    batchSizes.push(ids.length)
    return aiOkResponse(items.filter((item) => ids.includes(item.id)))
  })

  const progress = []
  await downloadPatrolInspectionExcel([], items, '2026Q3', (current, total) => progress.push([current, total]))

  assert.deepEqual(batchSizes, [20, 1])
  assert.deepEqual(progress, [[20, 21], [21, 21]])
  assert.equal(stubs.clicks, 1)

  const sheet = await readWorkbook(stubs.blobs[0])
  assert.equal(sheet.actualRowCount, 22)
  assert.equal(sheet.getRow(22).getCell(1).value, 21)
})

test('해당없음 건은 조치완료일에 해당없음을 적고 음영을 넣지 않는다', async () => {
  const stubs = installBrowserStubs()
  const items = [
    inspection({
      finding_type: 'not_applicable',
      action_photo_issue1: '해당 사항 없음',
      inspection_date: '2026-07-01',
    }),
  ]
  const { downloadPatrolInspectionExcel } = await loadExport(async () => aiOkResponse(items))

  await downloadPatrolInspectionExcel([], items, '2026Q3')

  const sheet = await readWorkbook(stubs.blobs[0])
  const doneColumn = EXPECTED_HEADERS.indexOf('조치완료일') + 1
  const row = sheet.getRow(2)
  assert.equal(row.getCell(doneColumn).value, '해당없음')
  assert.notEqual(row.getCell(doneColumn).fill?.fgColor?.argb, 'FFFCE4E4')
})

function isBlank(value) {
  return value === null || value === '' || value === undefined
}

test('확인자와 비고는 비우고 공사감독·점검종류는 채운다', async () => {
  const stubs = installBrowserStubs()
  const items = [inspection()]
  const { downloadPatrolInspectionExcel } = await loadExport(async () => aiOkResponse(items))

  await downloadPatrolInspectionExcel([], items, '2026Q3')

  const sheet = await readWorkbook(stubs.blobs[0])
  const row = sheet.getRow(2)
  // 확인자는 점검자가 아니므로 원본 이름으로 채우지 않는다.
  assert.ok(isBlank(row.getCell(EXPECTED_HEADERS.indexOf('확인자') + 1).value))
  assert.ok(isBlank(row.getCell(EXPECTED_HEADERS.indexOf('비고') + 1).value))
  assert.equal(row.getCell(EXPECTED_HEADERS.indexOf('공사감독') + 1).value, '3급 박상진')
  assert.equal(row.getCell(EXPECTED_HEADERS.indexOf('점검종류') + 1).value, '패트롤 점검')
})

test('확인자는 점검자 이름이 있어도 항상 공란이다', async () => {
  const stubs = installBrowserStubs()
  const items = [
    inspection({ inspector_name: '2급 김검사' }),
    inspection({ id: '11111111-2222-4333-8444-000000000002', inspector_name: '' }),
  ]
  const { downloadPatrolInspectionExcel } = await loadExport(async () => aiOkResponse(items))

  await downloadPatrolInspectionExcel([], items, '2026Q3')

  const sheet = await readWorkbook(stubs.blobs[0])
  const inspectorColumn = EXPECTED_HEADERS.indexOf('확인자') + 1
  assert.ok(isBlank(sheet.getRow(2).getCell(inspectorColumn).value))
  assert.ok(isBlank(sheet.getRow(3).getCell(inspectorColumn).value))
})

test('헤더와 모든 데이터 셀이 가운데·중앙 정렬이고 줄바꿈을 유지한다', async () => {
  const stubs = installBrowserStubs()
  const items = [
    inspection({ issue_content2: '개구부 덮개 미고정' }),
    inspection({
      id: '11111111-2222-4333-8444-000000000009',
      action_photo_issue1: photoUrlForSeoulDate('2026-07-09'),
    }),
  ]
  const { downloadPatrolInspectionExcel } = await loadExport(async () => aiOkResponse(items))

  await downloadPatrolInspectionExcel([], items, '2026Q3')

  const sheet = await readWorkbook(stubs.blobs[0])
  let checked = 0

  for (let rowNumber = 1; rowNumber <= 3; rowNumber++) {
    const row = sheet.getRow(rowNumber)
    for (let column = 1; column <= EXPECTED_HEADERS.length; column++) {
      const cell = row.getCell(column)
      const where = `${rowNumber}행 ${column}열`
      assert.equal(cell.alignment?.horizontal, 'center', `${where} 가로 정렬`)
      assert.equal(cell.alignment?.vertical, 'middle', `${where} 세로 정렬`)
      assert.equal(cell.alignment?.wrapText, true, `${where} 줄바꿈`)
      checked += 1
    }
  }

  // 숫자·지적내용·AI내용·주소를 포함해 예외 없이 전부 확인했다.
  assert.equal(checked, 3 * EXPECTED_HEADERS.length)
  assert.equal(sheet.getRow(2).getCell(EXPECTED_HEADERS.indexOf('총사업비(백만원)') + 1).value, 49233)
  assert.equal(
    sheet.getRow(2).getCell(EXPECTED_HEADERS.indexOf('지적내용') + 1).value,
    '1. 안전난간 미설치\n2. 개구부 덮개 미고정'
  )
})
