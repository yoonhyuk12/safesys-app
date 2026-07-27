// 수시 위험성평가서 엑셀 출력 — 公社 「위험성평가표_양식_수시」 빈양식(A~R 18열) 재현, 인쇄 시 8~9행 제목 반복

import ExcelJS from 'exceljs'
import { downloadWorkbook } from '@/lib/excel/quality-excel-utils'
import {
  RiskAssessmentExportData,
  RiskAssessmentRow,
  RiskAssessmentSignatures,
  riskGrade,
} from '@/lib/risk-assessment/types'

const FONT = '맑은 고딕'
const GUIDE_COLOR = 'FF1616FF' // 양식의 파란색 안내 문구

/** 원본 양식의 A~R 열 폭 */
const COLUMN_WIDTHS = [
  14.75, 14.75, 14.75, 13.75, 13.75, 9.75, 6.75, 6.75, 9.75,
  8.75, 4.75, 4.75, 13.75, 13.75, 3.75, 9.75, 4.75, 13.75,
]

/** 원본 양식의 행 높이(pt) */
const HEADER_ROW_HEIGHTS = [28.9, 14.45, 14.45, 28.9, 14.45, 14.45]
const TITLE_ROW_HEIGHT = 32.1
const DATA_ROW_HEIGHT = 75.2

const FIRST_DATA_ROW = 10
/** 1페이지 마지막 시트 행 (헤더 1~9행 + 데이터 3조) */
const FIRST_PAGE_LAST_ROW = 15
/** 2페이지부터 페이지당 시트 행 수 (데이터 4조) */
const ROWS_PER_PAGE = 8

const thin: ExcelJS.Border = { style: 'thin', color: { argb: 'FF000000' } }
const ALL_BORDERS: Partial<ExcelJS.Borders> = { top: thin, left: thin, bottom: thin, right: thin }

interface CellStyle {
  size?: number
  bold?: boolean
  color?: string
  wrap?: boolean
  horizontal?: ExcelJS.Alignment['horizontal']
  shrink?: boolean
  border?: boolean
}

/** "AB12" → { col: 28, row: 12 } (col은 1-based) */
const parseAddr = (addr: string): { col: number; row: number } => {
  const match = addr.match(/^([A-Z]+)(\d+)$/)
  if (!match) throw new Error(`잘못된 셀 주소: ${addr}`)
  let col = 0
  for (const ch of match[1]) col = col * 26 + (ch.charCodeAt(0) - 64)
  return { col, row: parseInt(match[2], 10) }
}

const setCell = (
  ws: ExcelJS.Worksheet,
  addr: string,
  value: ExcelJS.CellValue,
  style: CellStyle = {}
) => {
  const cell = ws.getCell(addr)
  if (value !== null && value !== undefined && value !== '') cell.value = value
  cell.font = {
    name: FONT,
    size: style.size ?? 10,
    bold: style.bold ?? false,
    color: { argb: style.color ?? 'FF000000' },
  }
  cell.alignment = {
    vertical: 'middle',
    horizontal: style.horizontal ?? 'center',
    ...(style.wrap ? { wrapText: true } : {}),
    ...(style.shrink ? { shrinkToFit: true } : {}),
  }
  if (style.border !== false) cell.border = ALL_BORDERS
}

/** 병합 범위 전체에 테두리를 깔아 병합 셀 테두리 누락을 막는다 */
const borderRange = (ws: ExcelJS.Worksheet, range: string) => {
  const [start, end] = range.split(':')
  const s = parseAddr(start)
  const e = parseAddr(end)
  for (let r = s.row; r <= e.row; r++) {
    for (let c = s.col; c <= e.col; c++) ws.getCell(r, c).border = ALL_BORDERS
  }
}

const mergeSet = (
  ws: ExcelJS.Worksheet,
  range: string,
  value: ExcelJS.CellValue,
  style: CellStyle = {}
) => {
  ws.mergeCells(range)
  setCell(ws, range.split(':')[0], value, style)
  if (style.border !== false) borderRange(ws, range)
}

/** 결재 일자 표기 — "2026.07.28" → "26.07.28" (형식이 어긋나면 양식 기본값 "/") */
const toShortDate = (writtenDate: string): string => {
  const m = writtenDate?.match(/^\d{2}(\d{2})\.(\d{1,2})\.(\d{1,2})$/)
  if (!m) return '/'
  return `${m[1]}.${m[2].padStart(2, '0')}.${m[3].padStart(2, '0')}`
}

/** 1~6행 — 현장 정보 + 결재란(공사/안전/현장소장) + 점검란(공사감독) */
const buildHeader = (ws: ExcelJS.Worksheet, data: RiskAssessmentExportData) => {
  HEADER_ROW_HEIGHTS.forEach((h, i) => {
    ws.getRow(i + 1).height = h
  })

  setCell(ws, 'A1', '현 장 명')
  mergeSet(ws, 'B1:C1', data.siteName)

  mergeSet(ws, 'A2:A3', '작 성 일')
  mergeSet(ws, 'B2:C2', data.writtenDate)
  mergeSet(ws, 'B3:C3', '(위험성평가 회의일 또는 이전)', {
    bold: true, color: GUIDE_COLOR, shrink: true,
  })

  setCell(ws, 'A4', '작 성 자')
  mergeSet(ws, 'B4:C4', data.authorName)

  mergeSet(ws, 'A5:A6', '관리기간')
  mergeSet(ws, 'B5:C5', data.managePeriod)
  mergeSet(ws, 'B6:C6', '(위험성평가 실시규정에 정해진 주기)', {
    bold: true, color: GUIDE_COLOR, shrink: true,
  })

  mergeSet(ws, 'D1:K6', '수시 위험성평가서', { size: 20 })

  // 결재란 — 성명은 텍스트로 쓰고 서명 이미지를 그 위에 겹친다
  const sig = data.signatures
  const approvalDate = toShortDate(data.writtenDate)
  mergeSet(ws, 'L1:L6', '결\n\n재', { wrap: true })
  setCell(ws, 'M1', '공 사')
  setCell(ws, 'N1', '안 전')
  mergeSet(ws, 'O1:P1', '현장소장')
  // 결재란은 서명만 겹치므로 안내 문구 없이 빈 칸으로 둔다 (성명은 구 레코드 저장분만 표기)
  mergeSet(ws, 'M2:M4', sig?.constructionName ?? null, { wrap: true })
  mergeSet(ws, 'N2:N4', sig?.safetyName ?? null, { wrap: true })
  mergeSet(ws, 'O2:P4', sig?.siteManagerName ?? null, { wrap: true })
  mergeSet(ws, 'M5:M6', approvalDate)
  mergeSet(ws, 'N5:N6', approvalDate)
  mergeSet(ws, 'O5:P6', approvalDate)

  // 점검란
  mergeSet(ws, 'Q1:Q6', '점\n\n검', { wrap: true })
  setCell(ws, 'R1', '공사감독')
  mergeSet(ws, 'R2:R4', sig?.supervisorName ?? null, { wrap: true })
  mergeSet(ws, 'R5:R6', approvalDate)

  // 7행은 표와의 간격(테두리 없음)
  for (let c = 1; c <= COLUMN_WIDTHS.length; c++) {
    const cell = ws.getCell(7, c)
    cell.font = { name: FONT, size: 10 }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
  }
}

/** 8~9행 — 인쇄 시 매 페이지 반복되는 표 제목 2줄 */
const buildTableTitle = (ws: ExcelJS.Worksheet) => {
  ws.getRow(8).height = TITLE_ROW_HEIGHT
  ws.getRow(9).height = TITLE_ROW_HEIGHT

  const title: CellStyle = { wrap: true }
  setCell(ws, 'A8', '세부작업\n(단위작업)', title)
  setCell(ws, 'A9', '작업위치', title)
  mergeSet(ws, 'B8:B9', '사용장비\n/설비/인원', title)
  mergeSet(ws, 'C8:E9', '위험요인', title)
  mergeSet(ws, 'F8:F9', '재해\n형태', title)
  mergeSet(ws, 'G8:H8', '위험성\n평가', title)
  setCell(ws, 'G9', '빈도\n(3)', title)
  setCell(ws, 'H9', '강도\n(3)', title)
  mergeSet(ws, 'I8:I9', '위험\n등급', title)
  mergeSet(ws, 'J8:O9', '예방대책\n[검토/추록 기재]', title)
  mergeSet(ws, 'P8:Q8', '개선후\n위험성', title)
  mergeSet(ws, 'P9:Q9', '개선예정일\n(완료일)', title)
  setCell(ws, 'R8', '이행담당\n(하도급사)', title)
  setCell(ws, 'R9', '확인담당\n(원도급사)', title)
}

/** 위험성 점수를 "6(중)" 표기로 — 등급 판정은 계약 함수 riskGrade()에 위임 */
const formatRisk = (score: number): string => {
  const { grade } = riskGrade(score, 1)
  return `${score}(${grade})`
}

/** 표 1개 행(RiskAssessmentRow)을 2행 1조로 기록 */
const buildDataRow = (ws: ExcelJS.Worksheet, row: RiskAssessmentRow, topRow: number) => {
  const t = topRow
  const b = topRow + 1
  ws.getRow(t).height = DATA_ROW_HEIGHT
  ws.getRow(b).height = DATA_ROW_HEIGHT

  const { score } = riskGrade(row.frequency, row.intensity)

  // 상단 행
  setCell(ws, `A${t}`, row.detailWork, { wrap: true })
  mergeSet(ws, `B${t}:B${b}`, row.equipment, { wrap: true })
  mergeSet(ws, `C${t}:E${b}`, row.hazard, { wrap: true, horizontal: 'left' })
  mergeSet(ws, `F${t}:F${b}`, row.disasterType, { wrap: true })
  mergeSet(ws, `G${t}:G${b}`, row.frequency)
  mergeSet(ws, `H${t}:H${b}`, row.intensity)
  mergeSet(ws, `I${t}:I${b}`, formatRisk(score), { wrap: true })
  mergeSet(ws, `J${t}:O${t}`, row.measures.join('\n'), { wrap: true, horizontal: 'left' })
  mergeSet(ws, `P${t}:Q${t}`, formatRisk(row.improvedRisk), { wrap: true })
  setCell(ws, `R${t}`, row.managerSub, { wrap: true })

  // 하단 행
  setCell(ws, `A${b}`, row.workLocation, { wrap: true })
  setCell(ws, `J${b}`, '검토/추록', { wrap: true })
  mergeSet(ws, `K${b}:O${b}`, row.reviewNote, { wrap: true, horizontal: 'left' })
  mergeSet(ws, `P${b}:Q${b}`, row.improveDate)
  setCell(ws, `R${b}`, row.managerMain, { wrap: true })
}

/** 결재란 서명 칸 — 안내 문구 위에 겹쳐 배치할 영역 정의 (열 폭·행 높이는 원본 양식 값) */
const SIGNATURE_BOXES: {
  key: keyof RiskAssessmentSignatures
  col: number // 0-based 시작 열
  colWidthsPx: number[]
}[] = [
  { key: 'construction', col: 12, colWidthsPx: [101] },      // M2:M4 (공사)
  { key: 'safety', col: 13, colWidthsPx: [101] },            // N2:N4 (안전)
  { key: 'siteManager', col: 14, colWidthsPx: [31, 73] },    // O2:P4 (현장소장)
  { key: 'supervisor', col: 17, colWidthsPx: [101] },        // R2:R4 (공사감독)
]

const SIGNATURE_ROW_HEIGHTS_PX = [14.45, 14.45, 28.9].map((pt) => pt * (96 / 72)) // 2~4행
const EMU_PER_PX = 9525

/** dataURL 서명의 원본 크기를 잰다 (브라우저 밖이면 일반적인 서명 비율로 대체) */
const measureImage = (dataUrl: string): Promise<{ width: number; height: number }> =>
  new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve({ width: 200, height: 70 })
      return
    }
    const img = document.createElement('img')
    img.onload = () => resolve({ width: img.naturalWidth || 200, height: img.naturalHeight || 70 })
    img.onerror = () => resolve({ width: 200, height: 70 })
    img.src = dataUrl
  })

/**
 * 결재란 서명 이미지를 안내 문구 위에 겹쳐 배치한다 (CLAUDE.md 핵심 제약 #5).
 * 소수부 앵커(col: 12.3)는 ExcelJS가 열 폭을 잘못 근사하므로, 오프셋을 실제 열 폭·행 높이대로
 * 소진한 뒤 잔여분만 EMU로 지정한다 (quality-excel-utils.addPhotoImageInArea와 동일 기법).
 */
const addSignatures = async (
  wb: ExcelJS.Workbook,
  ws: ExcelJS.Worksheet,
  signatures: RiskAssessmentSignatures
) => {
  const areaHeightPx = SIGNATURE_ROW_HEIGHTS_PX.reduce((a, b) => a + b, 0)
  const padding = 4

  for (const box of SIGNATURE_BOXES) {
    const dataUrl = signatures[box.key]
    if (!dataUrl || !dataUrl.startsWith('data:image')) continue

    const natural = await measureImage(dataUrl)
    const areaWidthPx = box.colWidthsPx.reduce((a, b) => a + b, 0)
    const scale = Math.min(
      (areaWidthPx - padding * 2) / natural.width,
      (areaHeightPx - padding * 2) / natural.height
    )
    const w = natural.width * scale
    const h = natural.height * scale

    // 가로 중앙: 남는 폭의 절반을 열 폭대로 소진
    let colIdx = box.col
    let remX = (areaWidthPx - w) / 2
    for (const colW of box.colWidthsPx) {
      if (remX < colW) break
      remX -= colW
      colIdx++
    }
    // 세로 중앙: 남는 높이의 절반을 행 높이대로 소진 (2행부터 시작 → 0-based 1)
    let rowIdx = 1
    let remY = (areaHeightPx - h) / 2
    for (const rowH of SIGNATURE_ROW_HEIGHTS_PX) {
      if (remY < rowH) break
      remY -= rowH
      rowIdx++
    }

    const base64 = dataUrl.split(',')[1]
    const extension = dataUrl.includes('image/jpeg') ? 'jpeg' : 'png'
    const imageId = wb.addImage({ base64, extension })
    ws.addImage(imageId, {
      tl: {
        nativeCol: colIdx,
        nativeColOff: Math.round(remX * EMU_PER_PX),
        nativeRow: rowIdx,
        nativeRowOff: Math.round(remY * EMU_PER_PX),
      },
      ext: { width: w, height: h },
      editAs: 'absolute',
    } as unknown as ExcelJS.ImagePosition)
  }
}

/**
 * 수동 행 나눔 — 1페이지는 시트 15행까지(헤더 1~9행 + 데이터 3조),
 * 2페이지부터는 8행씩(데이터 4조). 마지막 데이터 행을 넘어서는 나눔은 넣지 않는다.
 */
const addPageBreaks = (ws: ExcelJS.Worksheet, rowCount: number) => {
  const lastRow = FIRST_DATA_ROW - 1 + rowCount * 2
  for (let brk = FIRST_PAGE_LAST_ROW; brk < lastRow; brk += ROWS_PER_PAGE) {
    // 인자 없이 부르면 exceljs가 max를 16838(열 인덱스 상한 16383 초과)로 넣으므로
    // 마지막 열까지 명시해 brk max=16383으로 나오게 한다
    ws.getRow(brk).addPageBreak(1, 16384)
  }
}

/** 파일명에 못 쓰는 문자를 걷어낸다 */
const sanitize = (name: string): string => name.replace(/[\\/:*?"<>|]/g, '_').trim()

/** 수시 위험성평가서 워크북 생성 (다운로드 없이 워크북만 필요할 때 사용) */
export async function buildRiskAssessmentWorkbook(
  data: RiskAssessmentExportData
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook()
  const ws = workbook.addWorksheet('수시 위험성평가서', {
    properties: { defaultRowHeight: 16.5 },
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'landscape',
      // 가로세로 맞춤 — 세로(fitToHeight)는 0이어야 Excel이 수동 행 나눔을 무시하지 않는다
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      showGridLines: false,
      printTitlesRow: '8:9', // 인쇄 시 매 페이지에 표 제목 2줄 반복 (사용자 명시 요구)
      margins: {
        left: 0.7480555772781372,
        right: 0.7480555772781372,
        top: 0.9843055605888367,
        bottom: 0.9843055605888367,
        header: 0.511388897895813,
        footer: 0.511388897895813,
      },
    },
    headerFooter: { oddFooter: `&C&"${FONT},Regular"- &P -` },
  })

  ws.columns = COLUMN_WIDTHS.map((width) => ({ width }))

  buildHeader(ws, data)
  buildTableTitle(ws)
  data.rows.forEach((row, i) => buildDataRow(ws, row, FIRST_DATA_ROW + i * 2))
  addPageBreaks(ws, data.rows.length)

  if (data.signatures) await addSignatures(workbook, ws, data.signatures)

  return workbook
}

/** 수시 위험성평가서 엑셀 다운로드 */
export async function exportRiskAssessmentExcel(data: RiskAssessmentExportData): Promise<void> {
  const workbook = await buildRiskAssessmentWorkbook(data)
  const filename = `수시 위험성평가서_${sanitize(data.siteName)}_${sanitize(data.writtenDate)}.xlsx`
  await downloadWorkbook(workbook, filename)
}
