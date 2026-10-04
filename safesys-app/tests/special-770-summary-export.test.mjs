// 굴삭기 특별점검 붙임4 총괄표 워크북의 헤더 라벨·병합·계 수식·데이터 셀·정렬·사진·인쇄 설정을 검증한다.
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { createCanvas, Image } from '@napi-rs/canvas'

// 브라우저와 같은 실제 이미지 디코더로 원본 크기를 읽는다.
globalThis.Image = Image

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
  vm.runInThisContext(`(function (module, exports, require) {\n${outputText}\n})`)(module, module.exports, require)
  return module.exports
}

const types = await transpile('../src/lib/special-inspection-770/types.ts')
const summary = await transpile('../src/lib/special-inspection-770/summary.ts', { '@/lib/special-inspection-770/types': types })
const {
  buildSpecial770SummaryWorkbook,
  toSpecial770SummaryRows,
  loadSpecial770PinImages,
  formatSpecial770InspectionDate,
  special770SummaryFileName,
  SPECIAL_770_SUMMARY_SHEET_NAME,
} = await transpile('../src/lib/excel/special-770-summary-export.ts', {
  exceljs: ExcelJS,
  '@/lib/special-inspection-770/summary': summary,
})

// 1x1 PNG
const PNG_BYTES = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'))

function source(hq, branch, projectName, date, excavators, district = '') {
  return {
    inspection_date: date,
    district_name: district,
    data: { inspection_team: '3급 홍길동', excavators },
    project: { project_name: projectName, managing_hq: hq, managing_branch: branch },
  }
}

const SOURCES = [
  source('충남본부', '당진지사', '석문지구 용수개발', '2026-10-12', [
    { id: 'c1', vehicle_no: '충남34나5678', items: { '1-1': { judgement: '적정' } } },
  ]),
  source('경기본부', '여주이천지사', '나 현장', '2026-10-10', [
    {
      id: 'a1',
      vehicle_no: '경기12가3456',
      pin_photo_url: 'https://x/pin-a1.png',
      etc_text: '경사지 전도 위험',
      items: {
        '1-1': { judgement: '부적정', finding: 'TBM 미실시', action: 'TBM 실시', after_photo_url: 'https://x/after.jpg' },
        '1-3': { judgement: '부적정', finding: '자격 미확인', action: '면허 확인 예정', action_due_date: '2026-10-20' },
        '3-1': { judgement: '부적정', finding: '안전핀 미체결', action: '안전핀 체결 예정', action_due_date: '2026-10-25' },
        '4-1': { judgement: '부적정', action: '경사지 작업 금지' },
      },
    },
    { id: 'a2', vehicle_no: '경기99다0001', pin_photo_url: 'https://x/broken.jpg', items: {} },
  ], '이천지구'),
  source('경기본부', '여주이천지사', '가 현장', '2026-10-11', [
    { id: 'b1', vehicle_no: '경기55라1111', items: { '2-5': { judgement: '부적정', after_photo_url: 'https://x/after2.jpg' } } },
  ]),
  source('경기본부', '여주이천지사', '빈 현장', '2026-10-13', []),
]

const ROWS = toSpecial770SummaryRows(SOURCES)

async function images() {
  return loadSpecial770PinImages(ROWS, async (url) => {
    if (url.includes('broken')) throw new Error('404')
    return { data: PNG_BYTES, contentType: 'image/png' }
  })
}

async function sheet() {
  return buildSpecial770SummaryWorkbook(ROWS, { images: await images() }).getWorksheet(SPECIAL_770_SUMMARY_SHEET_NAME)
}

test('점검을 굴착기 1대 = 1행으로 펴고 본부 → 지사 → 현장명 순으로 정렬한다', () => {
  assert.deepEqual(ROWS.map(r => r.vehicleNo), ['경기55라1111', '경기12가3456', '경기99다0001', '충남34나5678'])
  assert.deepEqual(ROWS.map(r => r.detailBusiness), ['가 현장', '나 현장', '나 현장', '석문지구 용수개발'])
  assert.equal(formatSpecial770InspectionDate('2026-10-10'), '26.10.10')
  assert.equal(special770SummaryFileName(2026, '경기본부'), '특별점검(굴삭기 버킷 사고)_총괄표_2026_경기본부.xlsx')
  assert.ok(!special770SummaryFileName(2026).includes('770'))
})

test('헤더 3단 라벨·병합 14개·틀 고정·인쇄 설정을 원본대로 만든다', async () => {
  const ws = await sheet()
  assert.ok(ws)
  const expected = {
    B3: '본부/사업단', C3: '지사', D3: '사업유형', E3: '세부사업명', F3: '지구명', H3: '점검일',
    I3: '특별점검 지적 및 조치 사항', I4: '1. 사전조사 및 절차 준수', K4: '2. 운전 시작 전 현장 확인',
    M4: '3. 운전 중 현장 확인', O4: '4. 기타 점검 사항', I5: '지적사항', J5: '조치사항', P5: '조치사항',
    Q3: '조치 현황', Q5: '지적사항', R5: '조치완료', S5: '조치중', T5: '조치예정일', U3: '증빙사진\n(굴착기 안전핀)',
  }
  for (const [address, label] of Object.entries(expected)) assert.equal(ws.getCell(address).value, label, address)
  assert.equal(ws.getCell('G3').value, '굴착기 \n등록번호\n(차량번호)')
  assert.equal(ws.getCell('T5').note, '모든 지적사항 조치 완료일')

  const merges = ws.model.merges.slice().sort()
  assert.deepEqual(merges, ['B3:B5', 'C3:C5', 'D3:D5', 'E3:E5', 'F3:F5', 'G3:G5', 'H3:H5', 'U3:U5', 'I3:P3', 'I4:J4', 'K4:L4', 'M4:N4', 'O4:P4', 'Q3:T4'].sort())
  assert.equal(ws.getCell('T4').master.address, 'Q3')

  assert.equal(ws.views[0].state, 'frozen')
  assert.equal(ws.views[0].ySplit, 5)
  assert.equal(ws.pageSetup.paperSize, 8)
  assert.equal(ws.pageSetup.orientation, 'landscape')
  assert.equal(ws.pageSetup.fitToWidth, 1)
  assert.equal(ws.pageSetup.fitToHeight, 0)
  assert.equal(ws.getColumn('K').width, 27.875)
  assert.equal(ws.getColumn('U').width, 22.875)
  assert.equal(ws.getRow(3).height, 31.5)
  assert.equal(ws.getRow(7).height, 114.75)
  assert.equal(ws.getCell('B3').font.name, '맑은 고딕')
  assert.equal(ws.getCell('B3').fill.fgColor.argb, 'FFDBEEF3')
  assert.equal(ws.getCell('B5').border.bottom.style, 'double')
  assert.equal(ws.getCell('B3').border.top.style, 'medium')
  assert.equal(ws.getCell('B8').border.left.style, 'medium')
  assert.equal(ws.getCell('U8').border.right.style, 'medium')
})

test('6행 계는 7행~마지막 행 SUM 수식이고 데이터 셀을 굴착기별로 채운다', async () => {
  const ws = await sheet()
  assert.equal(ws.getCell('B6').value, '계')
  assert.deepEqual(ws.getCell('Q6').value, { formula: 'SUM(Q7:Q10)', result: 5 })
  assert.deepEqual(ws.getCell('R6').value, { formula: 'SUM(R7:R10)', result: 2 })
  assert.deepEqual(ws.getCell('S6').value, { formula: 'SUM(S7:S10)', result: 3 })
  assert.equal(ws.getCell('Q6').fill.fgColor.argb, 'FFD7E4BC')

  // 8행 = 경기12가3456
  const r = ws.getRow(8)
  const v = (c) => r.getCell(c).value
  assert.equal(v('B'), '경기본부')
  assert.equal(v('C'), '여주이천지사')
  assert.equal(v('D'), '')
  assert.equal(v('E'), '나 현장')
  assert.equal(v('F'), '이천지구')
  assert.equal(v('G'), '경기12가3456')
  assert.equal(v('H'), '26.10.10')
  assert.equal(v('I'), '- TBM 미실시\n- 자격 미확인')
  assert.equal(v('J'), '- TBM 실시\n- 면허 확인 예정')
  assert.equal(v('K'), '')
  assert.equal(v('M'), '- 안전핀 미체결')
  assert.equal(v('N'), '- 안전핀 체결 예정')
  assert.equal(v('O'), '- 경사지 전도 위험')
  assert.equal(v('P'), '- 경사지 작업 금지')
  assert.equal(v('Q'), 4)
  assert.equal(v('R'), 1)
  assert.equal(v('S'), 3)
  assert.equal(v('T'), '2026-10-25')
  assert.equal(r.getCell('I').alignment.horizontal, 'left')
  assert.equal(r.getCell('I').alignment.wrapText, true)

  // 지적 없는 굴착기는 0과 빈 예정일
  assert.equal(ws.getCell('Q10').value, 0)
  assert.equal(ws.getCell('T10').value, '')
})

test('안전핀 사진은 받은 것만 U열에 붙이고 실패한 URL은 빈칸으로 둔다', async () => {
  const loaded = await images()
  assert.deepEqual([...loaded.keys()], ['https://x/pin-a1.png'])
  const ws = buildSpecial770SummaryWorkbook(ROWS, { images: loaded }).getWorksheet(SPECIAL_770_SUMMARY_SHEET_NAME)
  const placed = ws.getImages()
  assert.equal(placed.length, 1)
  assert.equal(Math.floor(placed[0].range.tl.nativeCol), 20)
  assert.equal(Math.floor(placed[0].range.tl.nativeRow), 7)
})

test('쓰고 다시 읽어도 병합·수식·헤더가 유지되고 빈 목록은 계 0이다', async () => {
  const buffer = await buildSpecial770SummaryWorkbook(ROWS, { images: await images() }).xlsx.writeBuffer()
  if (process.env.SPECIAL770_SAMPLE_OUT) await writeFile(process.env.SPECIAL770_SAMPLE_OUT, Buffer.from(buffer))
  const reread = new ExcelJS.Workbook()
  await reread.xlsx.load(buffer)
  const ws = reread.getWorksheet(SPECIAL_770_SUMMARY_SHEET_NAME)
  assert.equal(ws.getCell('Q6').formula, 'SUM(Q7:Q10)')
  assert.equal(ws.getCell('Q3').value, '조치 현황')
  assert.equal(ws.getCell('G10').value, '충남34나5678')

  const empty = buildSpecial770SummaryWorkbook([]).getWorksheet(SPECIAL_770_SUMMARY_SHEET_NAME)
  assert.equal(empty.getCell('Q6').value, 0)
})

test('사업유형과 지구명을 원천에서 가져오고 E열 현장명은 보존한다', () => {
  for (const [district, expected] of [
    [' 점동지구 다목적 농촌용수 개발사업 토목공사 ', '점동지구'],
    ['이천지구 보수공사', '이천지구'], ['', '점동지구'], [null, '점동지구'], ['   ', '점동지구'],
  ]) {
    const input = source('경기', '여주', '점동지구 다목적 농촌용수 개발사업 토목공사', '2026-10-05', [{ id: '1', items: {} }], district)
    input.project.project_category = '농촌용수개발'
    const ws = buildSpecial770SummaryWorkbook(toSpecial770SummaryRows([input])).worksheets[0]
    assert.equal(ws.getCell('D7').value, '농촌용수개발')
    assert.equal(ws.getCell('E7').value, input.project.project_name)
    assert.equal(ws.getCell('F7').value, expected)
  }
})

for (const [extension, width, height] of [['png', 400, 800], ['jpeg', 900, 300]]) {
  test(`${extension} 실제 이미지의 ZIP 물리 크기·비율·셀 경계를 검증한다`, async () => {
    const canvas = createCanvas(width, height)
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#357abc'
    ctx.fillRect(0, 0, width, height)
    const bytes = canvas.toBuffer(`image/${extension}`)
    const rows = [{ ...ROWS[0], pinPhotoUrl: `https://x/photo.${extension}` }]
    const loaded = await loadSpecial770PinImages(rows, async () => ({ data: bytes, contentType: `image/${extension}` }))
    const buffer = await buildSpecial770SummaryWorkbook(rows, { images: loaded }).xlsx.writeBuffer()
    if (process.env.SPECIAL770_ARTIFACT_DIR) {
      await writeFile(`${process.env.SPECIAL770_ARTIFACT_DIR}/${extension}-aspect.xlsx`, Buffer.from(buffer))
    }
    const zip = await JSZip.loadAsync(buffer)
    const xml = await zip.file('xl/drawings/drawing1.xml').async('string')
    assert.match(xml, /<xdr:oneCellAnchor/)
    const value = tag => Number(xml.match(new RegExp(`<xdr:${tag}>(\\d+)</xdr:${tag}>`))[1])
    const [, cx, cy] = xml.match(/<xdr:ext cx="(\d+)" cy="(\d+)"/)
    const w = Number(cx) / 9525, h = Number(cy) / 9525
    const x = value('colOff') / 9525, y = value('rowOff') / 9525
    assert.equal(value('col'), 20)
    assert.equal(value('row'), 6)
    assert.ok(w > 60 && h > 40, `${w} x ${h}`)
    assert.ok(Math.abs(w / h - width / height) < 0.001)
    assert.ok(x >= 5 && y >= 5)
    assert.ok(x + w <= 165.125 - 5 && y + h <= 153 - 5)
    const media = Object.keys(zip.files).filter(name => /^xl\/media\/[^/]+$/.test(name))
    assert.equal(media.length, 1)
    assert.deepEqual(await zip.file(media[0]).async('nodebuffer'), bytes)
  })
}

test('손상된 이미지 응답은 사전 로드에서 제외한다', async () => {
  const loaded = await loadSpecial770PinImages([{ ...ROWS[0], pinPhotoUrl: 'https://x/invalid.jpg' }], async () => ({ data: new Uint8Array([1, 2, 3]), contentType: 'image/jpeg' }))
  assert.equal(loaded.size, 0)
})

if (process.env.SPECIAL770_REAL_SOURCE && process.env.SPECIAL770_ARTIFACT_DIR) {
  test('기존 다운로드 사진으로 실제 검토용 총괄표를 만든다', async () => {
    const original = await JSZip.loadAsync(await readFile(process.env.SPECIAL770_REAL_SOURCE))
    const media = Object.keys(original.files).find(name => /^xl\/media\/.*\.jpe?g$/.test(name))
    assert.ok(media)
    const bytes = await original.file(media).async('nodebuffer')
    const input = source('경기본부', '여주이천지사', '점동지구 다목적 농촌용수 개발사업 토목공사', '2026-10-05', [{ id: 'sample', vehicle_no: '검토용 굴착기', items: {}, pin_photo_url: 'https://fixture/photo.jpeg' }], '점동지구 다목적 농촌용수 개발사업 토목공사')
    input.project.project_category = '농촌용수개발'
    const rows = toSpecial770SummaryRows([input])
    const loaded = await loadSpecial770PinImages(rows, async () => ({ data: bytes, contentType: 'image/jpeg' }))
    assert.equal(loaded.size, 1)
    const buffer = await buildSpecial770SummaryWorkbook(rows, { images: loaded }).xlsx.writeBuffer()
    await writeFile(`${process.env.SPECIAL770_ARTIFACT_DIR}/real-photo-summary.xlsx`, Buffer.from(buffer))
    const zip = await JSZip.loadAsync(buffer)
    const xml = await zip.file('xl/drawings/drawing1.xml').async('string')
    assert.match(xml, /<xdr:ext cx="1343025" cy="1343025"/)
  })
}
