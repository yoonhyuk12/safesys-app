// 품질시험 결과 관리대장 엑셀 출력 공용 유틸 (셀 스타일·병합·서명 이미지·다운로드)
// 검사/검측 대장(inspection-request-export.ts)의 헬퍼를 다열(A~Z) 대응으로 일반화한 것

import ExcelJS from 'exceljs'

const thin: ExcelJS.Border = { style: 'thin', color: { argb: 'FF000000' } }
export const allBorders: Partial<ExcelJS.Borders> = { top: thin, bottom: thin, left: thin, right: thin }
export const headerFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } }

export interface CellOpts {
  bold?: boolean
  size?: number
  fill?: ExcelJS.Fill
  align?: Partial<ExcelJS.Alignment>
  border?: boolean
  color?: string
  underline?: boolean
}

export const setCell = (
  ws: ExcelJS.Worksheet,
  addr: string,
  value: ExcelJS.CellValue,
  opts: CellOpts = {}
) => {
  const cell = ws.getCell(addr)
  cell.value = value
  cell.font = {
    size: opts.size ?? 10,
    bold: opts.bold ?? false,
    ...(opts.underline ? { underline: true } : {}),
    ...(opts.color ? { color: { argb: opts.color } } : {}),
  }
  if (opts.fill) cell.fill = opts.fill
  if (opts.border !== false) cell.border = allBorders
  cell.alignment = { vertical: 'middle', wrapText: true, ...opts.align }
}

// "AB12" → { col: 28, row: 12 } (col은 1-based)
const parseAddr = (addr: string): { col: number; row: number } => {
  const match = addr.match(/^([A-Z]+)(\d+)$/)
  if (!match) throw new Error(`잘못된 셀 주소: ${addr}`)
  const letters = match[1]
  let col = 0
  for (let i = 0; i < letters.length; i++) {
    col = col * 26 + (letters.charCodeAt(i) - 64)
  }
  return { col, row: parseInt(match[2], 10) }
}

// 병합 범위의 모든 셀에 테두리 적용 (병합 셀 테두리 누락 방지)
export const borderRange = (ws: ExcelJS.Worksheet, range: string) => {
  const [start, end] = range.split(':')
  const s = parseAddr(start)
  const e = parseAddr(end)
  for (let r = s.row; r <= e.row; r++) {
    for (let c = s.col; c <= e.col; c++) {
      ws.getCell(r, c).border = allBorders
    }
  }
}

export const mergeSet = (
  ws: ExcelJS.Worksheet,
  range: string,
  value: ExcelJS.CellValue,
  opts: CellOpts = {}
) => {
  ws.mergeCells(range)
  setCell(ws, range.split(':')[0], value, opts)
  if (opts.border !== false) borderRange(ws, range)
}

// 서명 이미지 삽입 ((인) 표기 위치에 겹쳐서 배치) — col은 0-based, 소수부로 미세 조정
export const addSignatureImage = (
  wb: ExcelJS.Workbook,
  ws: ExcelJS.Worksheet,
  signature: string | undefined,
  col: number,
  rowNum: number,
  width = 80,
  height = 28
) => {
  if (!signature || !signature.startsWith('data:image')) return
  try {
    const imageId = wb.addImage({ base64: signature.split(',')[1], extension: 'png' })
    ws.addImage(imageId, { tl: { col, row: rowNum - 1 }, ext: { width, height } })
  } catch {
    // 이미지 삽입 실패 시 무시
  }
}

export const formatDateKorean = (dateStr?: string | null): string => {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return '20      .        .        .'
  }
  const [y, m, d] = dateStr.split('-')
  return `${y}.  ${m}.  ${d}.`
}

export const downloadWorkbook = async (workbook: ExcelJS.Workbook, filename: string) => {
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  window.URL.revokeObjectURL(url)
}
