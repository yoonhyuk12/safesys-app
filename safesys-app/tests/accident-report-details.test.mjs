// 사고발생보고서 항목의 정규화·검증과, 그 항목을 읽고 쓰는 데이터 계층(목록 컬럼 분리·상세 조회·저장 페이로드)을 검증한다
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import test from 'node:test'
import ts from 'typescript'

const nodeRequire = createRequire(import.meta.url)

test('산재요양 예상 일수는 미입력과 0을 구분하고 안전한 정수 문자열만 저장한다', async () => {
  const { normalizeAccidentReportDetails, validateAccidentReportDetails, isAccidentReportDetailsEmpty } = await loadReportLib()
  assert.equal(normalizeAccidentReportDetails(null).expectedTreatmentDays, '')
  assert.equal(normalizeAccidentReportDetails({ summary: '기존 보고서' }).expectedTreatmentDays, '')
  for (const value of ['', '0', '14', '9007199254740991']) {
    const details = normalizeAccidentReportDetails({ expectedTreatmentDays: value })
    assert.equal(details.expectedTreatmentDays, value)
    assert.equal(validateAccidentReportDetails(details).valid, true)
    assert.equal(isAccidentReportDetailsEmpty(details), value === '')
  }
  assert.equal(normalizeAccidentReportDetails({ expectedTreatmentDays: ' 14 ' }).expectedTreatmentDays, '14')
  for (const value of ['-1', '1.5', '삼일', '1e2', '14일', '9007199254740992']) {
    const details = normalizeAccidentReportDetails({ expectedTreatmentDays: value })
    assert.ok(validateAccidentReportDetails(details).errors.expectedTreatmentDays, value)
  }
})

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

/** select 컬럼·insert/update 페이로드까지 기록하는 supabase 대역. */
function createRecordingSupabaseStub(defaultResponse = { data: [], error: null }) {
  const calls = { tables: [], selects: [], inserts: [], updates: [], filters: [] }
  let currentTable = ''
  let response = defaultResponse

  const passthrough = () => builder
  const builder = {
    select(columns) { calls.selects.push([currentTable, columns]); return builder },
    insert(payload) { calls.inserts.push([currentTable, payload]); return builder },
    update(payload) { calls.updates.push([currentTable, payload]); return builder },
    delete: passthrough,
    eq(column, value) { calls.filters.push([column, value]); return builder },
    is(column, value) { calls.filters.push([column, value]); return builder },
    in(column, value) { calls.filters.push([column, value]); return builder },
    neq: passthrough,
    not: passthrough,
    gte: passthrough,
    lt: passthrough,
    lte: passthrough,
    order: passthrough,
    range: passthrough,
    single: passthrough,
    then(resolve, reject) { return Promise.resolve(response).then(resolve, reject) },
  }

  return {
    calls,
    setResponse(next) { response = next },
    client: { from(table) { currentTable = table; calls.tables.push(table); return builder } },
  }
}

async function loadReportLib() {
  const load = createLoader({})
  return load('@/lib/accident-report')
}

async function loadAccidentLib(defaultResponse) {
  const stub = createRecordingSupabaseStub(defaultResponse)
  const load = createLoader({ '@/lib/supabase': { supabase: stub.client } })
  const lib = await load('@/lib/accident-analysis')
  return { lib, stub }
}

const JPEG = 'data:image/jpeg;base64,/9j/AAAABBBBCCCCDDDD'
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAA'

/** 저장 형태 그대로의 사고 행. 목록 조회는 report_details를 담지 않는다. */
const accidentRow = (overrides = {}) => ({
  id: 'accident-1',
  project_id: 'project-a',
  external_project_name: null,
  external_managing_hq: null,
  external_managing_branch: null,
  accident_at: '2026-09-16T00:00:00+09:00',
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
  created_at: '2026-09-16T00:00:00+09:00',
  updated_at: '2026-09-16T00:00:00+09:00',
  ...overrides,
})

/** 저장 가능한 최소 폼 입력. report_details는 시험마다 따로 얹는다. */
const formInput = (overrides = {}) => ({
  project_id: 'project-a',
  external_project_name: '',
  external_managing_hq: '',
  external_managing_branch: '',
  accident_at: '2026-09-16',
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
  ...overrides,
})

test('정규화는 모르는 키를 버리고 문자열을 다듬는다', async () => {
  const { normalizeAccidentReportDetails } = await loadReportLib()

  const details = normalizeAccidentReportDetails({
    reporterName: '  홍길동  ',
    summary: '  보고 요지  ',
    몰래담은키: '남는 값',
    notifications: ['emergency119', 'sms', 'emergency119', 'police'],
    victimActions: ['hospital', 'office', 'hospital'],
  })

  assert.equal(details.reporterName, '홍길동')
  assert.equal(details.summary, '보고 요지')
  assert.equal('몰래담은키' in details, false)
  // 모르는 선택지는 버리고 중복은 한 번만 남긴다.
  assert.deepEqual(details.notifications, ['emergency119', 'police'])
  assert.deepEqual(details.victimActions, ['hospital'])
})

test('정규화는 사진을 최대 두 장까지만 남기고 빈 사진은 버린다', async () => {
  const { normalizeAccidentReportDetails, ACCIDENT_REPORT_MAX_PHOTOS } = await loadReportLib()

  const details = normalizeAccidentReportDetails({
    photos: [
      { dataUrl: JPEG, caption: '  첫 장  ' },
      { dataUrl: '', caption: '사진 없는 설명' },
      { caption: 'dataUrl 자체가 없다' },
      { dataUrl: JPEG, caption: '둘째 장' },
      { dataUrl: JPEG, caption: '셋째 장' },
    ],
  })

  assert.equal(ACCIDENT_REPORT_MAX_PHOTOS, 2)
  assert.equal(details.photos.length, 2)
  assert.deepEqual(details.photos.map((photo) => photo.caption), ['첫 장', '둘째 장'])
})

test('정규화는 null·문자열 같은 엉뚱한 입력도 빈 보고서로 받는다', async () => {
  const { normalizeAccidentReportDetails, isAccidentReportDetailsEmpty } = await loadReportLib()

  for (const input of [null, undefined, '보고서', 42]) {
    const details = normalizeAccidentReportDetails(input)
    assert.equal(isAccidentReportDetailsEmpty(details), true, `${String(input)}이 빈 보고서가 아니다`)
    assert.deepEqual(details.photos, [])
    assert.deepEqual(details.notifications, [])
  }
})

test('빈 값만 있는 보고서는 검증을 통과한다', async () => {
  const { createEmptyAccidentReportDetails, validateAccidentReportDetails } = await loadReportLib()

  assert.equal(validateAccidentReportDetails(createEmptyAccidentReportDetails()).valid, true)
})

test('정상 보고서는 검증을 통과한다', async () => {
  const { normalizeAccidentReportDetails, validateAccidentReportDetails } = await loadReportLib()

  const details = normalizeAccidentReportDetails({
    reportTitle: '사고발생보고',
    reportDate: '2026-09-16',
    accidentTime: '09:30',
    summary: '비계 해체 중 추락 사고가 발생했습니다.',
    notifications: ['emergency119'],
    victimActions: ['hospital'],
    photos: [{ dataUrl: JPEG, caption: '사고 지점' }],
  })

  assert.deepEqual(validateAccidentReportDetails(details), { valid: true, errors: {} })
})

test('사진은 장수·형식·설명 길이를 모두 검증한다', async () => {
  const {
    createEmptyAccidentReportDetails,
    validateAccidentReportDetails,
    isValidAccidentReportPhotoDataUrl,
  } = await loadReportLib()

  const withPhotos = (photos) => validateAccidentReportDetails({ ...createEmptyAccidentReportDetails(), photos })

  // 정규화를 거치지 않은 세 장짜리 보고서는 검증에서 걸린다(정규화는 두 장으로 자른다).
  const tooMany = withPhotos([JPEG, JPEG, JPEG].map((dataUrl) => ({ dataUrl, caption: '' })))
  assert.equal(tooMany.valid, false)
  assert.match(tooMany.errors.photos, /2장/)

  const png = withPhotos([{ dataUrl: PNG, caption: '' }])
  assert.equal(png.valid, false)
  assert.match(png.errors.photos, /JPEG/)
  assert.equal(isValidAccidentReportPhotoDataUrl(PNG), false)
  assert.equal(isValidAccidentReportPhotoDataUrl(JPEG), true)

  const longCaption = withPhotos([{ dataUrl: JPEG, caption: '가'.repeat(201) }])
  assert.equal(longCaption.valid, false)
  assert.match(longCaption.errors.photos, /200자/)
})

test('날짜·시각 형식과 길이 상한을 검증한다', async () => {
  const { createEmptyAccidentReportDetails, validateAccidentReportDetails } = await loadReportLib()
  const base = createEmptyAccidentReportDetails()

  const badDate = validateAccidentReportDetails({ ...base, reportDate: '2026/09/16' })
  assert.equal(badDate.valid, false)
  assert.match(badDate.errors.reportDate, /YYYY-MM-DD/)

  const badTime = validateAccidentReportDetails({ ...base, accidentTime: '25:00' })
  assert.equal(badTime.valid, false)
  assert.match(badTime.errors.accidentTime, /HH:mm/)

  const longShort = validateAccidentReportDetails({ ...base, reporterName: '가'.repeat(201) })
  assert.equal(longShort.valid, false)
  assert.match(longShort.errors.reporterName, /200/)

  const longText = validateAccidentReportDetails({ ...base, summary: '가'.repeat(4001) })
  assert.equal(longText.valid, false)
  assert.match(longText.errors.summary, /4,000/)
})

test('사진만 있어도 빈 보고서로 보지 않는다', async () => {
  const { normalizeAccidentReportDetails, isAccidentReportDetailsEmpty } = await loadReportLib()

  assert.equal(isAccidentReportDetailsEmpty(normalizeAccidentReportDetails({ photos: [{ dataUrl: JPEG }] })), false)
  assert.equal(isAccidentReportDetailsEmpty(normalizeAccidentReportDetails({ notifications: ['police'] })), false)
  assert.equal(isAccidentReportDetailsEmpty(normalizeAccidentReportDetails({ summary: '   ' })), true)
})

test('아직 채우지 않은 항목만 안내 목록에 오른다', async () => {
  const {
    ACCIDENT_REPORT_TEXT_KEYS,
    listUnfilledAccidentReportFields,
    normalizeAccidentReportDetails,
  } = await loadReportLib()

  const empty = listUnfilledAccidentReportFields(normalizeAccidentReportDetails({}))
  assert.deepEqual(empty, [...ACCIDENT_REPORT_TEXT_KEYS])

  const partial = listUnfilledAccidentReportFields(
    normalizeAccidentReportDetails({ reporterName: '홍길동', summary: '보고 요지' })
  )
  assert.equal(partial.includes('reporterName'), false)
  assert.equal(partial.includes('summary'), false)
  assert.equal(partial.includes('reportTitle'), true)
})

test('프로젝트 사고 목록은 요양일 scalar만 추가하고 사진 JSON을 읽지 않는다', async () => {
  const { lib, stub } = await loadAccidentLib({ data: [accidentRow({ expected_treatment_days: '0' })], error: null })

  const rows = await lib.getProjectAccidents('project-a')

  assert.deepEqual(stub.calls.selects, [['project_accidents', `${lib.PROJECT_ACCIDENT_LIST_COLUMNS}, expected_treatment_days:report_details->>expectedTreatmentDays`]])
  assert.equal(lib.PROJECT_ACCIDENT_LIST_COLUMNS.includes('report_details'), false)
  assert.equal(rows[0].expected_treatment_days, '0')
  assert.equal(rows[0].report_details, undefined)
  assert.deepEqual(stub.calls.tables, ['project_accidents'])
})

test('등록·수정 후 목록 재조회는 저장된 요양일과 미입력을 반영한다', async () => {
  const { lib, stub } = await loadAccidentLib({ data: null, error: null })
  for (const operation of ['create', 'update']) {
    for (const value of ['14', '0', '']) {
      stub.setResponse({ data: accidentRow({ report_details: { expectedTreatmentDays: value } }), error: null })
      const input = formInput({ report_details: { expectedTreatmentDays: value } })
      const result = operation === 'create'
        ? await lib.createProjectAccident(input, 'user-1')
        : await lib.updateProjectAccident('accident-1', input)
      assert.equal(result.success, true)
      const payload = (operation === 'create' ? stub.calls.inserts : stub.calls.updates).at(-1)[1]
      assert.equal(payload.report_details?.expectedTreatmentDays ?? '', value)
      stub.setResponse({ data: [accidentRow({ expected_treatment_days: value || null })], error: null })
      const [row] = await lib.getProjectAccidents('project-a')
      assert.equal(row.expected_treatment_days, value || null)
      assert.equal(row.report_details, undefined)
    }
  }
})

test('사고 통계 조회도 사진 JSON 컬럼을 읽지 않는다', async () => {
  const { lib, stub } = await loadAccidentLib({ data: [], error: null })

  await lib.getAccidentAnalysisData(['project-a'], '2026-01-01', '2026-09-16')

  const accidentSelects = stub.calls.selects.filter(([table]) => table === 'project_accidents')
  assert.equal(accidentSelects.length, 2, '등록 현장·미등록 현장 조회 두 곳이어야 한다')
  for (const [, columns] of accidentSelects) {
    assert.equal(columns, lib.PROJECT_ACCIDENT_LIST_COLUMNS)
  }
})

test('프로젝트가 없는 통계 조회도 미등록 현장 사고를 목록 컬럼으로만 읽는다', async () => {
  const { lib, stub } = await loadAccidentLib({ data: [], error: null })

  await lib.getAccidentAnalysisData([], '2026-01-01', '2026-09-16')

  assert.deepEqual(stub.calls.selects, [['project_accidents', lib.PROJECT_ACCIDENT_LIST_COLUMNS]])
})

test('사고 상세 조회만 보고서 항목을 함께 읽고 정규화해 돌려준다', async () => {
  const { lib, stub } = await loadAccidentLib()
  stub.setResponse({
    data: accidentRow({
      report_details: {
        reporterName: '  홍길동  ',
        몰래담은키: '남는 값',
        notifications: ['police', 'sms'],
        photos: [{ dataUrl: JPEG, caption: '사고 지점' }],
      },
    }),
    error: null,
  })

  const accident = await lib.getProjectAccidentDetail('  accident-1  ')

  assert.deepEqual(stub.calls.selects, [
    ['project_accidents', `${lib.PROJECT_ACCIDENT_LIST_COLUMNS}, report_details`],
  ])
  assert.deepEqual(stub.calls.filters, [['id', 'accident-1']])
  assert.equal(accident.report_details.reporterName, '홍길동')
  assert.equal('몰래담은키' in accident.report_details, false)
  assert.deepEqual(accident.report_details.notifications, ['police'])
  assert.equal(accident.report_details.photos.length, 1)
})

test('보고서를 쓰지 않은 사고의 상세는 report_details가 null이다', async () => {
  const { lib, stub } = await loadAccidentLib()
  stub.setResponse({ data: accidentRow({ report_details: null }), error: null })

  const accident = await lib.getProjectAccidentDetail('accident-1')

  assert.equal(accident.report_details, null)
})

test('상세 조회 실패는 빈 값으로 감추지 않고 오류로 올린다', async () => {
  const { lib, stub } = await loadAccidentLib()
  stub.setResponse({ data: null, error: { message: 'permission denied' } })

  await assert.rejects(() => lib.getProjectAccidentDetail('accident-1'), /사고 상세/)
  await assert.rejects(() => lib.getProjectAccidentDetail('   '), /사고 상세/)
})

test('보고서를 넘기지 않은 저장은 report_details 키 자체를 담지 않는다', async () => {
  const { lib, stub } = await loadAccidentLib()
  stub.setResponse({ data: accidentRow({ report_details: null }), error: null })

  await lib.createProjectAccident(formInput(), 'user-1')
  await lib.updateProjectAccident('accident-1', formInput())

  const [, insertPayload] = stub.calls.inserts[0]
  const [, updatePayload] = stub.calls.updates[0]
  assert.equal('report_details' in insertPayload, false, '등록 페이로드가 기존 보고서를 덮어쓴다')
  assert.equal('report_details' in updatePayload, false, '수정 페이로드가 기존 보고서를 덮어쓴다')
})

test('보고서를 넘기지 않은 저장은 응답으로도 사진 JSON을 되받지 않는다', async () => {
  const { lib, stub } = await loadAccidentLib()
  const row = accidentRow()
  delete row.report_details
  stub.setResponse({ data: row, error: null })

  const created = await lib.createProjectAccident(formInput(), 'user-1')
  const updated = await lib.updateProjectAccident('accident-1', formInput())

  const accidentSelects = stub.calls.selects.filter(([table]) => table === 'project_accidents')
  assert.deepEqual(accidentSelects.map(([, columns]) => columns), [
    lib.PROJECT_ACCIDENT_LIST_COLUMNS,
    lib.PROJECT_ACCIDENT_LIST_COLUMNS,
  ])
  // 읽지 않은 컬럼은 undefined로 남겨 "작성분 없음"(null)과 구분한다.
  assert.equal('report_details' in created.accident, false)
  assert.equal('report_details' in updated.accident, false)
})

test('보고서를 넘긴 저장만 응답에 report_details를 함께 받는다', async () => {
  const { lib, stub } = await loadAccidentLib()
  stub.setResponse({ data: accidentRow({ report_details: null }), error: null })
  const { createEmptyAccidentReportDetails } = await loadReportLib()

  await lib.updateProjectAccident('accident-1', formInput({ report_details: createEmptyAccidentReportDetails() }))

  const accidentSelects = stub.calls.selects.filter(([table]) => table === 'project_accidents')
  assert.deepEqual(accidentSelects.map(([, columns]) => columns), [
    `${lib.PROJECT_ACCIDENT_LIST_COLUMNS}, report_details`,
  ])
})

test('빈 보고서를 넘긴 저장은 report_details를 null로 지운다', async () => {
  const { lib, stub } = await loadAccidentLib()
  stub.setResponse({ data: accidentRow({ report_details: null }), error: null })
  const { createEmptyAccidentReportDetails } = await loadReportLib()

  await lib.updateProjectAccident('accident-1', formInput({ report_details: createEmptyAccidentReportDetails() }))

  const [, updatePayload] = stub.calls.updates[0]
  assert.equal('report_details' in updatePayload, true)
  assert.equal(updatePayload.report_details, null)
})

test('적힌 보고서는 정규화된 객체로 저장되고 저장 결과도 정규화해 돌려준다', async () => {
  const { lib, stub } = await loadAccidentLib()
  stub.setResponse({
    data: accidentRow({ report_details: { reporterName: '  홍길동  ', 몰래담은키: 1 } }),
    error: null,
  })

  const result = await lib.createProjectAccident(
    formInput({
      report_details: {
        reporterName: '  홍길동  ',
        몰래담은키: '남는 값',
        photos: [{ dataUrl: JPEG, caption: '  사고 지점  ' }],
      },
    }),
    'user-1'
  )

  const [, insertPayload] = stub.calls.inserts[0]
  assert.equal(insertPayload.report_details.reporterName, '홍길동')
  assert.equal('몰래담은키' in insertPayload.report_details, false)
  assert.deepEqual(insertPayload.report_details.photos, [{ dataUrl: JPEG, caption: '사고 지점' }])
  assert.equal(result.success, true)
  assert.equal(result.accident.report_details.reporterName, '홍길동')
  assert.equal('몰래담은키' in result.accident.report_details, false)
})

test('형식이 어긋난 보고서는 DB에 닿기 전에 검증에서 막힌다', async () => {
  const { lib, stub } = await loadAccidentLib()

  const png = await lib.createProjectAccident(
    formInput({ report_details: { photos: [{ dataUrl: PNG, caption: '' }] } }),
    'user-1'
  )
  assert.equal(png.success, false)
  assert.match(png.error, /JPEG/)

  const badTime = await lib.updateProjectAccident(
    'accident-1',
    formInput({ report_details: { accidentTime: '25:00' } })
  )
  assert.equal(badTime.success, false)
  assert.match(badTime.error, /HH:mm/)

  const tooLong = await lib.updateProjectAccident(
    'accident-1',
    formInput({ report_details: { summary: '가'.repeat(4001) } })
  )
  assert.equal(tooLong.success, false)
  assert.match(tooLong.error, /4,000/)

  assert.deepEqual(stub.calls.tables, [], '검증 전에 DB를 부르면 안 된다')
})

test('요양 예상 일수 저장은 0을 보존하고 잘못된 정수 문자열의 DB 호출을 막는다', async () => {
  const { lib, stub } = await loadAccidentLib()
  for (const value of ['-1', '1.5', '삼일', '9007199254740992']) {
    const result = await lib.updateProjectAccident('accident-1', formInput({ report_details: { expectedTreatmentDays: value } }))
    assert.equal(result.success, false, value)
    assert.match(result.error, /산재요양 예상 일수/)
  }
  assert.deepEqual(stub.calls.tables, [])
  for (const value of ['0', '14']) {
    stub.setResponse({ data: accidentRow({ report_details: { expectedTreatmentDays: value } }), error: null })
    const result = await lib.updateProjectAccident('accident-1', formInput({ report_details: { expectedTreatmentDays: value } }))
    assert.equal(result.success, true)
    assert.equal(stub.calls.updates.at(-1)[1].report_details.expectedTreatmentDays, value)
    assert.equal(stub.calls.updates.at(-1)[1].lost_workdays, 3)
    assert.equal(result.accident.report_details.expectedTreatmentDays, value)
  }
})

test('입력 검증은 어긋난 보고서를 report_details 오류로 알린다', async () => {
  const { lib } = await loadAccidentLib()

  const validation = lib.validateAccidentInput(formInput({ report_details: { reportDate: '2026/09/16' } }))
  assert.equal(validation.valid, false)
  assert.match(validation.errors.report_details, /YYYY-MM-DD/)

  // 보고서를 넘기지 않으면 검증 대상이 아니다.
  assert.equal(lib.validateAccidentInput(formInput()).valid, true)
})
