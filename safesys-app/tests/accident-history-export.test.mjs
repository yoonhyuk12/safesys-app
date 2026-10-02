// 사고 이력 엑셀 워크북을 ExcelJS로 직접 만들어 제목·헤더·데이터 셀·지연 음영·소계 행·빈 목록 예외를 검증한다.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'
import ExcelJS from 'exceljs'

async function transpile(relativePath, dependencies = {}) {
  const source = await readFile(new URL(relativePath, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  })
  const module = { exports: {} }
  const require = (name) => {
    assert.ok(name in dependencies, `예상하지 못한 의존성 ${name}`)
    return dependencies[name]
  }
  new Function('module', 'exports', 'require', outputText)(module, module.exports, require)
  return module.exports
}

const { buildAccidentHistoryWorkbook, downloadAccidentHistoryExcel } = await transpile(
  '../src/lib/excel/accident-history-export.ts',
  { exceljs: ExcelJS }
)

const EXPECTED_HEADERS = [
  '순번',
  '본부',
  '지사',
  '프로젝트',
  '구분',
  '사고일자',
  '보고일자',
  '보고 지연(일)',
  '중대도',
  '사고 유형',
  '산재 신청',
  '요양일수',
  '부상자',
  '사망자',
  '휴업일수',
  '사고 개요',
  '사고 장소',
  '사고 당시 작업',
  '사고 원인',
  '재발방지 대책',
  '점검 후 경과일',
  '최근 점검',
  '최근 점검 내용',
]

const PERIOD = { startDate: '2026-01-01', endDate: '2026-10-02' }

/** 열 머리글로 열 번호(1부터)를 찾는다. */
const col = (header) => {
  const index = EXPECTED_HEADERS.indexOf(header)
  assert.ok(index >= 0, `없는 헤더 ${header}`)
  return index + 1
}

function makeRow(overrides = {}) {
  return {
    hq: '경기본부',
    branch: '여주이천지사',
    projectName: '농업용수 개발 공사',
    isExternalSite: false,
    accidentDate: '26-03-04(수)',
    reportDate: '26-03-05(목)',
    reportDelayDays: 1,
    reportDelayed: false,
    severity: '경상',
    accidentType: '넘어짐',
    compApplied: false,
    treatmentDays: null,
    injuredCount: 1,
    fatalCount: 0,
    lostWorkdays: 3,
    description: '자재 운반 중 미끄러짐',
    location: '수로 구간',
    workDescription: '자재 운반',
    cause: '바닥 결빙',
    preventionAction: '제설 및 미끄럼 방지 매트 설치',
    daysSinceLatestInspection: 5,
    latestInspectionLabel: '본부불시점검 · 2026. 2. 27.',
    latestInspectionSummary: '안전난간 미설치',
    ...overrides,
  }
}

const ROWS = [
  makeRow(),
  makeRow({
    hq: '충남본부',
    branch: '당진지사',
    projectName: '외부 현장',
    isExternalSite: true,
    accidentDate: '26-04-10(금)',
    reportDate: '26-04-15(수)',
    reportDelayDays: 5,
    reportDelayed: true,
    severity: '중상',
    accidentType: '떨어짐',
    compApplied: true,
    treatmentDays: 42,
    injuredCount: 2,
    fatalCount: 1,
    lostWorkdays: 10,
    daysSinceLatestInspection: 8,
  }),
  makeRow({
    reportDate: '-',
    reportDelayDays: null,
    reportDelayed: false,
    injuredCount: 0,
    lostWorkdays: 0,
    daysSinceLatestInspection: null,
    latestInspectionLabel: '사고 전 점검 이력 없음',
    latestInspectionSummary: '',
  }),
]

const isEmpty = (value) => value === null || value === undefined || value === ''

test('시트 이름·제목 행·헤더 23열 순서를 만든다', () => {
  const workbook = buildAccidentHistoryWorkbook(ROWS, PERIOD)
  const sheet = workbook.getWorksheet('사고이력')
  assert.ok(sheet, '사고이력 시트가 있어야 한다')

  assert.equal(sheet.getCell(1, 1).value, '사고 이력 (2026-01-01 ~ 2026-10-02)')
  // 제목은 전 열 병합이다.
  assert.equal(sheet.getCell(1, EXPECTED_HEADERS.length).master.address, 'A1')

  const headers = EXPECTED_HEADERS.map((_, index) => sheet.getCell(2, index + 1).value)
  assert.deepEqual(headers, EXPECTED_HEADERS)

  assert.equal(sheet.views[0].state, 'frozen')
  assert.equal(sheet.views[0].ySplit, 2)
})

test('데이터 행은 화면 표기와 숫자 셀로 채우고 null은 빈 셀로 둔다', () => {
  const sheet = buildAccidentHistoryWorkbook(ROWS, PERIOD).getWorksheet('사고이력')

  const first = sheet.getRow(3)
  assert.equal(first.getCell(col('순번')).value, 1)
  assert.equal(first.getCell(col('본부')).value, '경기본부')
  assert.equal(first.getCell(col('지사')).value, '여주이천지사')
  assert.equal(first.getCell(col('프로젝트')).value, '농업용수 개발 공사')
  assert.equal(first.getCell(col('구분')).value, '등록')
  assert.equal(first.getCell(col('사고일자')).value, '26-03-04(수)')
  assert.equal(first.getCell(col('보고일자')).value, '26-03-05(목)')
  assert.equal(first.getCell(col('보고 지연(일)')).value, 1)
  assert.equal(typeof first.getCell(col('보고 지연(일)')).value, 'number')
  assert.equal(first.getCell(col('중대도')).value, '경상')
  assert.equal(first.getCell(col('사고 유형')).value, '넘어짐')
  assert.equal(first.getCell(col('산재 신청')).value, '미신청')
  assert.ok(isEmpty(first.getCell(col('요양일수')).value))
  assert.equal(first.getCell(col('부상자')).value, 1)
  assert.equal(first.getCell(col('사망자')).value, 0)
  assert.equal(typeof first.getCell(col('사망자')).value, 'number')
  assert.equal(first.getCell(col('휴업일수')).value, 3)
  assert.equal(first.getCell(col('사고 개요')).value, '자재 운반 중 미끄러짐')
  assert.equal(first.getCell(col('사고 장소')).value, '수로 구간')
  assert.equal(first.getCell(col('사고 당시 작업')).value, '자재 운반')
  assert.equal(first.getCell(col('사고 원인')).value, '바닥 결빙')
  assert.equal(first.getCell(col('재발방지 대책')).value, '제설 및 미끄럼 방지 매트 설치')
  assert.equal(first.getCell(col('점검 후 경과일')).value, 5)
  assert.equal(first.getCell(col('최근 점검')).value, '본부불시점검 · 2026. 2. 27.')
  assert.equal(first.getCell(col('최근 점검 내용')).value, '안전난간 미설치')

  const second = sheet.getRow(4)
  assert.equal(second.getCell(col('순번')).value, 2)
  assert.equal(second.getCell(col('구분')).value, '미등록')
  assert.equal(second.getCell(col('산재 신청')).value, '신청')
  assert.equal(second.getCell(col('요양일수')).value, 42)
  assert.equal(typeof second.getCell(col('요양일수')).value, 'number')

  const third = sheet.getRow(5)
  assert.equal(third.getCell(col('보고일자')).value, '-')
  assert.ok(isEmpty(third.getCell(col('보고 지연(일)')).value))
  assert.ok(isEmpty(third.getCell(col('점검 후 경과일')).value))
  assert.equal(third.getCell(col('최근 점검')).value, '사고 전 점검 이력 없음')
})

test('보고 지연 행만 보고일자·보고 지연 셀에 연한 빨강 음영을 준다', () => {
  const sheet = buildAccidentHistoryWorkbook(ROWS, PERIOD).getWorksheet('사고이력')

  const delayed = sheet.getRow(4)
  for (const header of ['보고일자', '보고 지연(일)']) {
    assert.equal(delayed.getCell(col(header)).fill?.fgColor?.argb, 'FFFCE4E4', `${header} 음영`)
  }
  assert.notEqual(delayed.getCell(col('사고일자')).fill?.fgColor?.argb, 'FFFCE4E4')

  const normal = sheet.getRow(3)
  for (const header of ['보고일자', '보고 지연(일)']) {
    assert.notEqual(normal.getCell(col(header)).fill?.fgColor?.argb, 'FFFCE4E4', `${header} 비지연 무음영`)
  }
})

test('마지막 소계 행에 건수·지연·신청·합계·경과일 평균을 넣는다', () => {
  const sheet = buildAccidentHistoryWorkbook(ROWS, PERIOD).getWorksheet('사고이력')
  const subtotal = sheet.getRow(3 + ROWS.length)

  assert.equal(subtotal.getCell(1).value, '소계 3건')
  assert.equal(subtotal.getCell(col('보고 지연(일)')).value, '지연 1건')
  assert.equal(subtotal.getCell(col('산재 신청')).value, '신청 1건')
  assert.equal(subtotal.getCell(col('부상자')).value, 3)
  assert.equal(subtotal.getCell(col('사망자')).value, 1)
  assert.equal(subtotal.getCell(col('휴업일수')).value, 13)
  // (5 + 8) / 2 = 6.5
  assert.equal(subtotal.getCell(col('점검 후 경과일')).value, 6.5)

  assert.equal(subtotal.getCell(1).font?.bold, true)
  assert.equal(subtotal.getCell(1).fill?.fgColor?.argb, 'FFF2F2F2')
  assert.equal(sheet.rowCount, 3 + ROWS.length)
})

test('경과일 평균은 소수 1자리로 반올림하고 전부 null이면 빈 셀이다', () => {
  const rounded = buildAccidentHistoryWorkbook(
    [
      makeRow({ daysSinceLatestInspection: 1 }),
      makeRow({ daysSinceLatestInspection: 2 }),
      makeRow({ daysSinceLatestInspection: 2 }),
    ],
    PERIOD
  ).getWorksheet('사고이력')
  // 5 / 3 = 1.666… → 1.7
  assert.equal(rounded.getRow(6).getCell(col('점검 후 경과일')).value, 1.7)

  const allNull = buildAccidentHistoryWorkbook(
    [makeRow({ daysSinceLatestInspection: null }), makeRow({ daysSinceLatestInspection: null })],
    PERIOD
  ).getWorksheet('사고이력')
  assert.ok(isEmpty(allNull.getRow(5).getCell(col('점검 후 경과일')).value))
})

test('내려받을 사고 이력이 없으면 다운로드 함수가 예외를 던진다', async () => {
  await assert.rejects(
    () => downloadAccidentHistoryExcel([], PERIOD),
    { message: '내려받을 사고 이력이 없습니다.' }
  )
})
