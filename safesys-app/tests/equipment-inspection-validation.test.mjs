// 장비 일일점검 대장의 제출 전 검증·장비 교체 초기화·서명 무효화·조회 오류 구분과 created_by 고정을 검증한다.
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

/** supabase 클라이언트 대역 — 마지막 호출 인자를 기록하고 미리 정한 응답을 돌려준다. */
function createSupabaseStub(response) {
  const calls = { table: null, inserted: null, filters: [], orders: [] }
  const builder = {
    select() { return builder },
    eq(column, value) { calls.filters.push([column, value]); return builder },
    order(column, options) { calls.orders.push([column, options]); return builder },
    insert(rows) { calls.inserted = rows; return builder },
    delete() { return builder },
    single() { return Promise.resolve(response) },
    then(resolve, reject) { return Promise.resolve(response).then(resolve, reject) },
  }
  return {
    calls,
    client: {
      from(table) { calls.table = table; return builder },
    },
  }
}

async function loadModule(response = { data: [], error: null }) {
  const stub = createSupabaseStub(response)
  const moduleExports = await transpile('../src/lib/equipment-inspections.ts', {
    '@/lib/supabase': { supabase: stub.client },
  })
  return { ...moduleExports, calls: stub.calls }
}

const CHECKLIST = {
  id: 'equipment-01',
  name: '타워크레인',
  sourcePage: 6,
  items: [
    { id: 'equipment-01-01', category: '기본사항', text: '운전원의 자격여부는 적정한가?' },
    { id: 'equipment-01-02', category: '기본사항', text: '방호장치는 설치되어 있는가?' },
    { id: 'equipment-01-03', category: '작동검사', text: '경보음이 정상 작동하는가?' },
  ],
}

const OTHER_CHECKLIST = {
  id: 'equipment-02',
  name: '이동식 크레인',
  sourcePage: 7,
  items: [{ id: 'equipment-02-01', category: '기본사항', text: '아웃트리거는 견고한가?' }],
}

// 실제 PNG여야 서명 이미지로 쓸 수 있다. 내보내기 하니스와 같은 파일을 쓴다.
const SIGNATURE_PNG = await readFile(new URL('./fixtures/equipment-inspection-signature.png', import.meta.url))
const SIGNATURE = `data:image/png;base64,${SIGNATURE_PNG.toString('base64')}`

const LF = String.fromCharCode(10)
const CR = String.fromCharCode(13)

/** 모든 항목에 결과를 채운 제출 직전 상태를 만든다. 서명은 마지막에 붙여 무효화 규칙을 타지 않게 한다. */
function completedDraft(lib, checklist = CHECKLIST, overrides = {}) {
  let draft = lib.selectEquipmentChecklist(lib.createEquipmentInspectionDraft(), checklist)
  for (const item of checklist.items) {
    draft = lib.setEquipmentAnswerResult(draft, item.id, 'pass')
  }
  return {
    ...draft,
    inspectionDate: '2026-09-14',
    inspectorName: '홍길동',
    signature: SIGNATURE,
    ...overrides,
  }
}

test('빈 초안은 장비를 고르지 않은 상태이며 결과가 하나도 없다', async () => {
  const lib = await loadModule()
  const draft = lib.createEquipmentInspectionDraft()

  assert.equal(draft.checklistId, '')
  assert.deepEqual(draft.responses, {})
  assert.equal(draft.signature, '')
})

test('점검 결과는 적합·부적합·해당없음 셋뿐이다', async () => {
  const lib = await loadModule()

  assert.deepEqual(lib.EQUIPMENT_INSPECTION_RESULTS, ['pass', 'fail', 'na'])
  assert.equal(lib.EQUIPMENT_INSPECTION_RESULT_LABELS.pass, '적합')
  assert.equal(lib.EQUIPMENT_INSPECTION_RESULT_LABELS.fail, '부적합')
  assert.equal(lib.EQUIPMENT_INSPECTION_RESULT_LABELS.na, '해당없음')
})

test('장비를 고르지 않으면 제출을 막는다', async () => {
  const lib = await loadModule()
  const draft = { ...lib.createEquipmentInspectionDraft(), inspectorName: '홍길동', signature: SIGNATURE }

  assert.match(lib.validateEquipmentInspectionDraft(draft, null) ?? '', /장비/)
})

test('항목이 하나라도 미점검이면 제출을 막고 남은 항목을 알려준다', async () => {
  const lib = await loadModule()
  let draft = lib.selectEquipmentChecklist(lib.createEquipmentInspectionDraft(), CHECKLIST)
  draft = lib.setEquipmentAnswerResult(draft, 'equipment-01-01', 'pass')
  draft = { ...draft, inspectionDate: '2026-09-14', inspectorName: '홍길동', signature: SIGNATURE }

  const remaining = lib.unansweredEquipmentItems(draft, CHECKLIST)
  assert.deepEqual(remaining.map((item) => item.id), ['equipment-01-02', 'equipment-01-03'])
  assert.match(lib.validateEquipmentInspectionDraft(draft, CHECKLIST) ?? '', /2개/)
})

test('결과 칸에 적합·부적합·해당없음이 아닌 값이 들어오면 미점검으로 본다', async () => {
  const lib = await loadModule()
  let draft = lib.selectEquipmentChecklist(lib.createEquipmentInspectionDraft(), CHECKLIST)
  for (const item of CHECKLIST.items) {
    draft = lib.setEquipmentAnswerResult(draft, item.id, 'pass')
  }
  // 저장된 초안이 손상되었거나 옛 값이 남아 있는 상황을 흉내 낸다.
  draft = {
    ...draft,
    responses: { ...draft.responses, 'equipment-01-02': { result: '적합', note: '' } },
  }

  assert.deepEqual(lib.unansweredEquipmentItems(draft, CHECKLIST).map((item) => item.id), ['equipment-01-02'])
  assert.match(
    lib.validateEquipmentInspectionDraft({ ...draft, inspectorName: '홍길동', signature: SIGNATURE }, CHECKLIST) ?? '',
    /1개/
  )
})

test('부적합·해당없음도 점검한 것으로 본다', async () => {
  const lib = await loadModule()
  let draft = lib.selectEquipmentChecklist(lib.createEquipmentInspectionDraft(), CHECKLIST)
  draft = lib.setEquipmentAnswerResult(draft, 'equipment-01-01', 'fail')
  draft = lib.setEquipmentAnswerResult(draft, 'equipment-01-02', 'na')
  draft = lib.setEquipmentAnswerResult(draft, 'equipment-01-03', 'pass')
  draft = { ...draft, inspectionDate: '2026-09-14', inspectorName: '홍길동', signature: SIGNATURE }

  assert.deepEqual(lib.unansweredEquipmentItems(draft, CHECKLIST), [])
  assert.equal(lib.validateEquipmentInspectionDraft(draft, CHECKLIST), null)
})

test('서명으로 인정하는 것은 캔버스가 만든 PNG dataURL뿐이다', async () => {
  const lib = await loadModule()
  const payload = SIGNATURE.split('base64,')[1]

  const rejected = [
    '',
    '   ',
    'undefined',
    'data:,',
    '(서명 또는 인)',
    'https://example.com/sign.png',
    'data:image/png;base64,',
    // PNG가 아닌 이미지, PNG 매직이 없는 base64, 그림이라 보기 어려운 짧은 값.
    `data:image/jpeg;base64,${payload}`,
    `data:image/png;base64,${'QUFB'.repeat(80)}`,
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB',
    null,
    undefined,
    42,
  ]

  for (const blank of rejected) {
    assert.equal(lib.isBlankEquipmentSignature(blank), true, `${String(blank).slice(0, 30)}를 빈 서명으로 보지 않았다`)
  }
  for (const blank of ['', '(서명 또는 인)', 'data:image/png;base64,']) {
    const draft = completedDraft(lib, CHECKLIST, { signature: blank })
    assert.match(lib.validateEquipmentInspectionDraft(draft, CHECKLIST) ?? '', /서명/)
  }

  assert.equal(lib.isBlankEquipmentSignature(SIGNATURE), false)
})

test('점검자 성명과 점검일이 비면 제출을 막는다', async () => {
  const lib = await loadModule()

  assert.match(
    lib.validateEquipmentInspectionDraft(completedDraft(lib, CHECKLIST, { inspectorName: '  ' }), CHECKLIST) ?? '',
    /점검자/
  )
  assert.match(
    lib.validateEquipmentInspectionDraft(completedDraft(lib, CHECKLIST, { inspectionDate: '' }), CHECKLIST) ?? '',
    /점검일/
  )
})

test('점검자 성명은 출력 한 줄에 들어가도록 100자 이하 한 줄이어야 한다', async () => {
  const lib = await loadModule()

  assert.equal(lib.EQUIPMENT_INSPECTOR_NAME_MAX, 100)
  assert.match(
    lib.validateEquipmentInspectionDraft(completedDraft(lib, CHECKLIST, { inspectorName: '가'.repeat(101) }), CHECKLIST) ?? '',
    /100자/
  )
  for (const name of [`홍길동${LF}안전관리자`, `홍길동${CR}안전관리자`]) {
    assert.match(
      lib.validateEquipmentInspectionDraft(completedDraft(lib, CHECKLIST, { inspectorName: name }), CHECKLIST) ?? '',
      /한 줄/
    )
  }
  assert.equal(
    lib.validateEquipmentInspectionDraft(completedDraft(lib, CHECKLIST, { inspectorName: '가'.repeat(100) }), CHECKLIST),
    null
  )
})

test('장비를 바꾸면 이전 응답·서명과 차량·기계번호가 초기화된다', async () => {
  const lib = await loadModule()
  const filled = completedDraft(lib, CHECKLIST, {
    companyName: '가나건설',
    remarks: '특이사항 없음',
    vehicleNumber: '12가3456',
    machineNumber: 'TC-01',
  })

  const switched = lib.selectEquipmentChecklist(filled, OTHER_CHECKLIST)

  assert.equal(switched.checklistId, 'equipment-02')
  assert.equal(switched.equipmentName, '이동식 크레인')
  assert.deepEqual(switched.responses, {})
  assert.equal(switched.signature, '')
  // 차량·기계번호는 그 장비의 식별자라 남기면 다른 장비의 번호가 된다.
  assert.equal(switched.vehicleNumber, '')
  assert.equal(switched.machineNumber, '')
  // 장비와 무관한 기본사항은 다시 입력하게 만들지 않는다.
  assert.equal(switched.companyName, '가나건설')
  assert.equal(switched.remarks, '특이사항 없음')
  // 원본 초안은 그대로 남는다.
  assert.equal(filled.signature, SIGNATURE)
  assert.equal(filled.vehicleNumber, '12가3456')
  assert.equal(Object.keys(filled.responses).length, 3)
})

test('같은 장비를 다시 고르면 입력한 응답과 서명을 지우지 않는다', async () => {
  const lib = await loadModule()
  const filled = completedDraft(lib)

  const again = lib.selectEquipmentChecklist(filled, CHECKLIST)

  assert.equal(again.signature, SIGNATURE)
  assert.equal(Object.keys(again.responses).length, 3)
})

test('서명 뒤에 내용을 고치면 서명이 무효가 된다', async () => {
  const lib = await loadModule()
  const signed = completedDraft(lib, CHECKLIST, { companyName: '가나건설' })

  // 점검 결과 변경.
  assert.equal(lib.setEquipmentAnswerResult(signed, 'equipment-01-01', 'fail').signature, '')
  // 항목 비고 변경.
  assert.equal(lib.setEquipmentAnswerNote(signed, 'equipment-01-01', '와이어 손상').signature, '')
  // 기본사항·종합 비고 변경.
  for (const patch of [
    { companyName: '다라건설' },
    { remarks: '조치 필요' },
    { inspectionDate: '2026-09-15' },
    { inspectorName: '김점검' },
    { vehicleNumber: '99나9999' },
  ]) {
    assert.equal(lib.editEquipmentInspectionDraft(signed, patch).signature, '', `${JSON.stringify(patch)} 후 서명이 남았다`)
  }

  // 값이 그대로면 서명을 지우지 않는다.
  assert.equal(lib.editEquipmentInspectionDraft(signed, { companyName: '가나건설' }).signature, SIGNATURE)
  // 서명 자체를 넣는 변경은 당연히 유지한다.
  assert.equal(lib.editEquipmentInspectionDraft(signed, { signature: SIGNATURE }).signature, SIGNATURE)
  // 원본 초안은 바뀌지 않는다.
  assert.equal(signed.signature, SIGNATURE)
})

test('응답 변경은 초안을 직접 바꾸지 않고 새 객체를 돌려준다', async () => {
  const lib = await loadModule()
  const draft = lib.selectEquipmentChecklist(lib.createEquipmentInspectionDraft(), CHECKLIST)

  const next = lib.setEquipmentAnswerResult(draft, 'equipment-01-01', 'fail')
  const noted = lib.setEquipmentAnswerNote(next, 'equipment-01-01', '와이어 손상')

  assert.equal(draft.responses['equipment-01-01'], undefined)
  assert.equal(next.responses['equipment-01-01'].note, '')
  assert.equal(noted.responses['equipment-01-01'].result, 'fail')
  assert.equal(noted.responses['equipment-01-01'].note, '와이어 손상')
})

test('제출 답변은 원문 항목의 분류·문구를 그대로 보존한다', async () => {
  const lib = await loadModule()
  let draft = completedDraft(lib)
  draft = lib.setEquipmentAnswerResult(draft, 'equipment-01-03', 'fail')
  draft = lib.setEquipmentAnswerNote(draft, 'equipment-01-03', '경보음 미작동')

  const answers = lib.buildEquipmentInspectionAnswers(draft, CHECKLIST)

  assert.equal(answers.length, 3)
  assert.deepEqual(answers[0], {
    id: 'equipment-01-01',
    category: '기본사항',
    text: '운전원의 자격여부는 적정한가?',
    result: 'pass',
    note: '',
  })
  assert.deepEqual(answers[2], {
    id: 'equipment-01-03',
    category: '작동검사',
    text: '경보음이 정상 작동하는가?',
    result: 'fail',
    note: '경보음 미작동',
  })
})

test('미점검 항목을 해당없음으로 채우지 않고 오류를 낸다', async () => {
  const lib = await loadModule()
  let draft = lib.selectEquipmentChecklist(lib.createEquipmentInspectionDraft(), CHECKLIST)
  draft = lib.setEquipmentAnswerResult(draft, 'equipment-01-01', 'pass')

  assert.throws(() => lib.buildEquipmentInspectionAnswers(draft, CHECKLIST), /점검하지 않은 항목/)
})

test('목록 조회는 프로젝트로 걸러 최신순으로 가져온다', async () => {
  const rows = [{ id: 'a', project_id: 'p1', answers: [] }]
  const lib = await loadModule({ data: rows, error: null })

  const result = await lib.getEquipmentInspections('p1')

  assert.equal(lib.calls.table, 'equipment_daily_inspections')
  assert.deepEqual(lib.calls.filters, [['project_id', 'p1']])
  assert.deepEqual(lib.calls.orders[0], ['inspection_date', { ascending: false }])
  assert.deepEqual(result, rows)
})

test('빈 목록과 조회 오류를 구분한다', async () => {
  const empty = await loadModule({ data: null, error: null })
  assert.deepEqual(await empty.getEquipmentInspections('p1'), [])

  const failed = await loadModule({ data: null, error: { message: 'permission denied' } })
  await assert.rejects(() => failed.getEquipmentInspections('p1'), /permission denied/)
})

test('대장 테이블이 아직 없으면 빈 목록이 아니라 미개설로 알린다', async () => {
  for (const error of [
    { code: 'PGRST205', message: "Could not find the table 'public.equipment_daily_inspections'" },
    { code: '42P01', message: 'relation "equipment_daily_inspections" does not exist' },
  ]) {
    const lib = await loadModule({ data: null, error })
    await assert.rejects(() => lib.getEquipmentInspections('p1'), /개설되지 않았습니다/)
    // 사용자 화면에 실행할 SQL 파일명을 흘리지 않는다.
    assert.doesNotMatch(lib.EQUIPMENT_INSPECTION_MISSING_TABLE, /\.sql|database\//)
  }
})

test('프로젝트 ID가 없으면 조회하지 않는다', async () => {
  const lib = await loadModule()
  assert.deepEqual(await lib.getEquipmentInspections(''), [])
  assert.equal(lib.calls.table, null)
})

test('제출 행은 로그인 사용자를 작성자로 고정하고 원문 답변을 담는다', async () => {
  const saved = { id: 'new-id', project_id: 'p1' }
  const lib = await loadModule({ data: saved, error: null })
  const draft = completedDraft(lib, CHECKLIST, {
    companyName: '가나건설',
    vehicleNumber: '12가3456',
    machineNumber: 'TC-01',
    remarks: '이상 없음',
  })

  const created = await lib.createEquipmentInspection('p1', draft, CHECKLIST, 'user-1')

  assert.deepEqual(created, saved)
  assert.equal(lib.calls.table, 'equipment_daily_inspections')
  const row = lib.calls.inserted[0]
  assert.equal(row.project_id, 'p1')
  assert.equal(row.created_by, 'user-1')
  assert.equal(row.equipment_type, 'equipment-01')
  assert.equal(row.equipment_name, '타워크레인')
  assert.equal(row.inspector_name, '홍길동')
  assert.equal(row.signature, SIGNATURE)
  assert.equal(row.vehicle_number, '12가3456')
  assert.equal(row.machine_number, 'TC-01')
  assert.equal(row.answers.length, 3)
})

test('검증을 통과하지 못한 초안은 저장을 시도하지 않는다', async () => {
  const lib = await loadModule()
  const draft = completedDraft(lib, CHECKLIST, { signature: '' })

  await assert.rejects(() => lib.createEquipmentInspection('p1', draft, CHECKLIST, 'user-1'), /서명/)
  assert.equal(lib.calls.table, null)
})

test('로그인하지 않았거나 프로젝트가 없으면 저장을 거부한다', async () => {
  const lib = await loadModule()
  const draft = completedDraft(lib)

  await assert.rejects(() => lib.createEquipmentInspection('p1', draft, CHECKLIST, ''), /로그인/)
  await assert.rejects(() => lib.createEquipmentInspection('', draft, CHECKLIST, 'user-1'), /프로젝트/)
  assert.equal(lib.calls.table, null)
})

test('저장 오류는 그대로 올려 화면이 성공으로 오해하지 않게 한다', async () => {
  const lib = await loadModule({ data: null, error: { message: 'new row violates row-level security policy' } })
  const draft = completedDraft(lib)

  await assert.rejects(() => lib.createEquipmentInspection('p1', draft, CHECKLIST, 'user-1'), /row-level security/)
})

test('장비 일일점검은 일괄서명 등록 대상이 아니다', async () => {
  const targets = await transpile('../src/lib/bulk-sign/bulk-sign-targets.ts')
  const tables = Object.values(targets.BULK_SIGN_SIGNERS)
    .flatMap((signer) => signer.targets)
    .map((target) => target.table)

  assert.ok(!tables.includes('equipment_daily_inspections'), '개인 점검자 서명이 일괄서명에 섞였다')
})
