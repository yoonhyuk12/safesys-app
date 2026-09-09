// 지적사항 관리 별지 6호·7호 Excel 출력의 사진 셀 내부 배치·A4 인쇄영역·행 높이 픽셀 격자를 검증한다.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ExcelJS from 'exceljs'
import ts from 'typescript'

// ── Excel 기하 상수 (Coordinator COM 실측 기준)
// 열 폭 1단위 = 8px. ExcelJS 기본 글꼴은 scheme=minor 라 한국어 Excel 이 맑은 고딕 11pt(MDW 8px)로 해석한다.
const PX_PER_COL_WIDTH = 8
const EMU_PER_PX = 9525
const DEFAULT_COL_WIDTH = 8.43
const DEFAULT_ROW_HEIGHT_PT = 15
const ptToPx = (pt) => (pt * 4) / 3

// ── TS 트랜스파일 (tests/g2b-contract-period.test.mjs 관례)
async function transpile(relativePath, dependencies = {}) {
  const source = await readFile(new URL(relativePath, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  })
  const module = { exports: {} }
  const require = (name) => {
    assert.ok(name in dependencies, `예상하지 못한 의존성 ${name}`)
    return dependencies[name]
  }
  new Function('module', 'exports', 'require', outputText)(module, module.exports, require)
  return module.exports
}

// ── 브라우저 API 최소 스텁
const imageSizes = new Map() // 사진 URL → { width, height }
let capturedBlob = null

const encodeUrl = (url) => `data:image/png;base64,${Buffer.from(url, 'utf8').toString('base64')}`
const decodeUrl = (dataUrl) =>
  Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64').toString('utf8')

function installBrowserStubs() {
  globalThis.fetch = async (url) => ({ blob: async () => ({ type: 'image/png', __url: url }) })

  globalThis.FileReader = class {
    readAsDataURL(blob) {
      this.result = encodeUrl(blob.__url)
      this.onloadend?.()
    }
  }

  globalThis.document = {
    createElement(tag) {
      if (tag !== 'img') return { href: '', download: '', click() {} }
      const img = {}
      Object.defineProperty(img, 'src', {
        set(value) {
          const size = imageSizes.get(decodeUrl(value))
          if (!size) {
            img.onerror?.()
            return
          }
          img.naturalWidth = size.width
          img.naturalHeight = size.height
          img.onload?.()
        },
      })
      return img
    },
  }

  globalThis.window = {
    URL: {
      createObjectURL(blob) {
        capturedBlob = blob
        return 'blob:stub'
      },
      revokeObjectURL() {},
    },
  }
}

installBrowserStubs()

// ── 대상 모듈
const utils = await transpile('../src/lib/excel/quality-excel-utils.ts', { exceljs: ExcelJS })
const deps = { exceljs: ExcelJS, '@/lib/excel/quality-excel-utils': utils }
const { downloadCorrectiveActionRequestExcel } = await transpile(
  '../src/lib/excel/corrective-action-request-export.ts',
  deps
)
const { downloadIssueActionReportExcel } = await transpile(
  '../src/lib/excel/issue-action-report-export.ts',
  deps
)

// ── 사진 비율 종류 (Coordinator COM 검증 파일명과 동일)
const ASPECTS = {
  wide: { width: 1600, height: 900 },
  tall: { width: 900, height: 1600 },
  panorama: { width: 4000, height: 400 },
  narrow: { width: 400, height: 4000 },
}

const SIGNATURE = `data:image/png;base64,${Buffer.from('sig', 'utf8').toString('base64')}`
const LONG_TEXT = '비계 발판 고정 불량으로 추락 위험이 있어 즉시 시정을 요구함.\n안전난간 미설치 구간 확인.'
const INK_MARK = /\(인\)/

function registerPhoto(name, aspect) {
  const url = `https://example.test/${name}.png`
  imageSizes.set(url, ASPECTS[aspect])
  return url
}

async function runExport(exporter, data) {
  capturedBlob = null
  await exporter(data)
  assert.ok(capturedBlob, '워크북이 생성되지 않았다')
  const buffer = Buffer.from(await capturedBlob.arrayBuffer())
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  return workbook.worksheets[0]
}

const buildRequest = (aspect) =>
  runExport(
    downloadCorrectiveActionRequestExcel,
    {
      projectName: '○○ 도로 확포장 공사',
      departmentHead: '홍길동',
      inspectionType: '정기점검',
      inspectorName: '김점검',
      inspectionDate: '2026-09-09',
      content: LONG_TEXT,
      beforePhotoUrl: aspect ? registerPhoto(`request-${aspect}`, aspect) : null,
    }
  )

const buildReport = (aspect, overrides = {}) =>
  runExport(
    downloadIssueActionReportExcel,
    {
      projectName: '○○ 도로 확포장 공사',
      contractor: '△△건설',
      inspectorName: '김점검',
      inspectionDate: '2026-09-09',
      actionDate: '2026-09-10',
      location: '교대부 비계',
      findingText: LONG_TEXT,
      actionText: '안전난간 설치 완료',
      beforePhotoUrl: aspect ? registerPhoto(`report-before-${aspect}`, aspect) : null,
      afterPhotoUrl: aspect ? registerPhoto(`report-after-${aspect}`, aspect) : null,
      writerName: '이대리',
      confirmerName: '박감독',
      contractorSignature: SIGNATURE,
      supervisorSignature: SIGNATURE,
      ...overrides,
    }
  )

// ── 기하 계산 (워크시트가 실제로 담고 있는 열 폭·행 높이에서 역산)
const colWidthPx = (ws, col) => (ws.getColumn(col).width ?? DEFAULT_COL_WIDTH) * PX_PER_COL_WIDTH
const rowHeightPt = (ws, row) => ws.getRow(row).height ?? DEFAULT_ROW_HEIGHT_PT

function sumColPx(ws, fromCol, toCol) {
  let total = 0
  for (let c = fromCol; c <= toCol; c++) total += colWidthPx(ws, c)
  return total
}

function sumRowPx(ws, fromRow, toRow) {
  let total = 0
  for (let r = fromRow; r <= toRow; r++) total += ptToPx(rowHeightPt(ws, r))
  return total
}

const parseAddr = (addr) => {
  const [, letters, digits] = addr.match(/^([A-Z]+)(\d+)$/)
  let col = 0
  for (const ch of letters) col = col * 26 + (ch.charCodeAt(0) - 64)
  return { col, row: Number(digits) }
}

// 사진 칸 = C열에서 시작하고 10행 이상을 차지하는 병합 영역
function photoAreas(ws) {
  return (ws.model.merges ?? [])
    .map((range) => {
      const [start, end] = range.split(':')
      return { range, start: parseAddr(start), end: parseAddr(end) }
    })
    .filter((m) => m.start.col === 3 && m.end.row - m.start.row + 1 >= 10)
    .sort((a, b) => a.start.row - b.start.row)
    .map((m) => ({
      range: m.range,
      top: m.start.row,
      bottom: m.end.row,
      left: m.start.col,
      right: m.end.col,
      x0: sumColPx(ws, 1, m.start.col - 1),
      x1: sumColPx(ws, 1, m.end.col),
      y0: sumRowPx(ws, 1, m.start.row - 1),
      y1: sumRowPx(ws, 1, m.end.row),
    }))
}

function imageBox(ws, image) {
  const { tl, ext } = image.range
  const x0 = sumColPx(ws, 1, tl.nativeCol) + tl.nativeColOff / EMU_PER_PX
  const y0 = sumRowPx(ws, 1, tl.nativeRow) + tl.nativeRowOff / EMU_PER_PX
  return { x0, y0, x1: x0 + ext.width, y1: y0 + ext.height, width: ext.width, height: ext.height }
}

// 사진과 칸 테두리 사이 최소 여백 (px) — Excel COM/PDF 실측으로 정한 서식별 값.
// 별지 6호는 사진 칸이 내용 텍스트와 같은 칸이라 세로 여유가 적어 16px 로는 하단을 넘겼다.
const MIN_MARGIN_PX = { request: 32, report: 16 }

const margins = (box, area) => [
  box.x0 - area.x0,
  area.x1 - box.x1,
  box.y0 - area.y0,
  area.y1 - box.y1,
]

const isInside = (box, area, minMargin) => margins(box, area).every((m) => m >= minMargin - 0.01)

// 시작점이 해당 칸 안에 있는 이미지 = 그 칸에 넣으려던 사진 (서명은 다른 행이라 걸리지 않는다)
function photosIn(ws, area) {
  return ws
    .getImages()
    .map((image) => imageBox(ws, image))
    .filter(
      (box) =>
        box.x0 >= area.x0 - 0.01 && box.x0 < area.x1 && box.y0 >= area.y0 - 0.01 && box.y0 < area.y1
    )
}

function lastUsedRow(ws) {
  let last = 0
  ws.eachRow({ includeEmpty: false }, (_row, rowNumber) => {
    last = Math.max(last, rowNumber)
  })
  return last
}

const aspectRatio = ({ width, height }) => width / height

// ── 검증

test('두 서식 모두 sheetViews 를 명시해 Excel 이 저장된 행 높이를 그대로 쓴다', async () => {
  // sheetViews 가 없으면 Excel 이 화면 배율로 행 높이를 다시 계산한다 (ExcelJS #743).
  for (const [name, ws] of [
    ['별지 6호', await buildRequest('wide')],
    ['별지 7호', await buildReport('wide')],
  ]) {
    assert.ok(Array.isArray(ws.views) && ws.views.length > 0, `${name}: sheetViews 가 비어 있다`)
    assert.equal(ws.views[0].state, 'normal', `${name}: 뷰 상태가 normal 이 아니다`)
  }
})

test('사진 칸의 행 높이는 3의 배수 pt 여서 어느 화면 배율에서도 픽셀 손실이 없다', async () => {
  // 실제 픽셀 = round(pt × 4/3 × 배율). pt 가 3의 배수면 100~200% 어디서도 정수라 손실이 0 이다.
  for (const [name, ws] of [
    ['별지 6호', await buildRequest('wide')],
    ['별지 7호', await buildReport('wide')],
  ]) {
    for (const area of photoAreas(ws)) {
      for (let r = area.top; r <= area.bottom; r++) {
        const pt = rowHeightPt(ws, r)
        assert.equal(pt % 3, 0, `${name} ${area.range}: ${r}행 높이 ${pt}pt 가 3의 배수가 아니다`)
      }
    }
  }
})

test('별지 6호 지적사진은 비율을 지키며 내용 칸 안에 여백을 두고 들어간다', async () => {
  for (const aspect of Object.keys(ASPECTS)) {
    const ws = await buildRequest(aspect)
    const areas = photoAreas(ws)
    assert.equal(areas.length, 1, `${aspect}: 내용 칸이 1개가 아니다`)
    const boxes = photosIn(ws, areas[0])
    assert.equal(boxes.length, 1, `${aspect}: 사진이 1장이 아니다`)
    const [box] = boxes
    assert.ok(
      isInside(box, areas[0], MIN_MARGIN_PX.request),
      `${aspect}: 사진과 칸 사이 여백이 ${MIN_MARGIN_PX.request}px 미만이다 ${JSON.stringify(margins(box, areas[0]))}`
    )
    assert.ok(
      Math.abs(aspectRatio(box) - aspectRatio(ASPECTS[aspect])) < 1e-6,
      `${aspect}: 사진 비율이 원본과 다르다`
    )
  }
})

test('별지 7호 시정 전·후 사진은 비율을 지키며 각 사진 칸 안에 여백을 두고 들어간다', async () => {
  for (const aspect of Object.keys(ASPECTS)) {
    const ws = await buildReport(aspect)
    const areas = photoAreas(ws)
    assert.equal(areas.length, 2, `${aspect}: 사진 칸이 2개가 아니다`)
    for (const area of areas) {
      const boxes = photosIn(ws, area)
      assert.equal(boxes.length, 1, `${aspect} ${area.range}: 사진이 1장이 아니다`)
      const [box] = boxes
      assert.ok(
        isInside(box, area, MIN_MARGIN_PX.report),
        `${aspect} ${area.range}: 사진과 칸 사이 여백이 ${MIN_MARGIN_PX.report}px 미만이다 ${JSON.stringify(margins(box, area))}`
      )
      assert.ok(
        Math.abs(aspectRatio(box) - aspectRatio(ASPECTS[aspect])) < 1e-6,
        `${aspect} ${area.range}: 사진 비율이 원본과 다르다`
      )
    }
  }
})

test('사진이 없으면 안내 문구만 남고 서명은 (인) 문구 위에 그대로 겹친다', async () => {
  const ws = await buildReport(null, { beforePhotoUrl: null, afterPhotoUrl: 'N/A' })

  const areas = photoAreas(ws)
  for (const area of areas) {
    assert.equal(photosIn(ws, area).length, 0, `${area.range}: 사진이 없어야 한다`)
  }
  assert.deepEqual(
    areas.map((area) => ws.getCell(area.top, area.left).value),
    ['"사진 첨부"', '해당 없음']
  )

  // 서명 이미지는 사라지지 않는다 — (인) 문구가 있는 행에 그대로 놓인다.
  const signatureRows = ws.getImages().map((image) => image.range.tl.nativeRow + 1)
  assert.equal(signatureRows.length, 2, '서명 이미지가 2장이 아니다')
  for (const row of signatureRows) {
    assert.match(String(ws.getCell(row, 2).value ?? ''), INK_MARK, `${row}행에 (인) 문구가 없다`)
  }
})

test('두 서식 모두 A4 한 장짜리 인쇄 영역을 명시한다', async () => {
  for (const [name, ws] of [
    ['별지 6호', await buildRequest('wide')],
    ['별지 7호', await buildReport('wide')],
  ]) {
    assert.equal(ws.pageSetup.paperSize, 9, `${name}: A4 가 아니다`)
    assert.equal(ws.pageSetup.fitToWidth, 1, `${name}: fitToWidth 가 1 이 아니다`)
    assert.equal(ws.pageSetup.fitToHeight, 1, `${name}: fitToHeight 가 1 이 아니다`)
    assert.equal(
      ws.pageSetup.printArea,
      `A1:H${lastUsedRow(ws)}`,
      `${name}: 인쇄 영역이 마지막 행까지의 A~H 가 아니다`
    )
  }
})

test('두 서식의 인쇄 내용은 A4 세로 한 장에 담긴다', async () => {
  const PRINTABLE_WIDTH_PX = (8.27 - 0.7 * 2) * 96
  const PRINTABLE_HEIGHT_PT = 11.69 * 72 - 0.75 * 2 * 72
  for (const [name, ws] of [
    ['별지 6호', await buildRequest('wide')],
    ['별지 7호', await buildReport('wide')],
  ]) {
    assert.ok(
      sumColPx(ws, 1, 8) <= PRINTABLE_WIDTH_PX,
      `${name}: A~H 폭이 인쇄 가능 폭을 넘는다`
    )
    let heightPt = 0
    for (let r = 1; r <= lastUsedRow(ws); r++) heightPt += rowHeightPt(ws, r)
    assert.ok(
      heightPt <= PRINTABLE_HEIGHT_PT,
      `${name}: 전체 높이 ${heightPt}pt 가 A4 한 장(${PRINTABLE_HEIGHT_PT}pt)을 넘는다`
    )
  }
})
