// 계약(공사·용역) 현황 표를 화면과 동일한 구성(소계행·연도별 금차 컬럼·올해 강조)으로 Excel 내보내기
import ExcelJS from 'exceljs'

export interface ContractExcelRow {
  type: string
  name: string
  memberCount: number // 병합된 차수 건수 (2 이상이면 계약명에 부기)
  corp: string
  totAmt: number | null
  yearAmts: Record<string, number> // 연도('2026'|'기타') → 금차 합
  cntrctDate: string
  period: string
  dminstt: string
}

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' },
  left: { style: 'thin' },
  bottom: { style: 'thin' },
  right: { style: 'thin' },
}

const NUM_FMT = '#,##0'
const THIS_YEAR_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE7C8' } }
const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } }
const SUBTOTAL_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF2FB' } }

const yearLabel = (y: string) => (y === '기타' ? '연도미상' : `${y.slice(2)}년`)

export async function downloadContractStatusExcel(
  projectName: string,
  yearCols: string[],
  thisYear: string,
  rows: ContractExcelRow[],
) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('계약현황')

  // 컬럼 구성: 구분, 계약명, 계약상대자, 총계약금액, [연도별 금차…], 계약체결일, 계약기간, 수요기관
  const yearStart = 5 // 연도 컬럼 시작(1-based)
  const totalCols = 4 + yearCols.length + 3
  const thisYearCol = yearCols.indexOf(thisYear) >= 0 ? yearStart + yearCols.indexOf(thisYear) : -1

  ws.columns = [
    { width: 8 },   // 구분
    { width: 42 },  // 계약명
    { width: 22 },  // 계약상대자
    { width: 16 },  // 총계약금액
    ...yearCols.map(() => ({ width: 15 })), // 연도별 금차
    { width: 13 },  // 계약체결일
    { width: 26 },  // 계약기간
    { width: 26 },  // 수요기관
  ]

  // Row 1: 제목
  ws.mergeCells(1, 1, 1, totalCols)
  const titleCell = ws.getCell(1, 1)
  titleCell.value = `계약(공사·용역) 현황 — ${projectName}`
  titleCell.font = { size: 16, bold: true }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(1).height = 30

  // Row 2: 헤더
  const headerLabels = [
    '구분', '계약명', '계약상대자', '총계약금액(원)',
    ...yearCols.map(yearLabel),
    '계약체결일', '계약기간', '수요기관',
  ]
  const headerRow = ws.addRow(headerLabels)
  headerRow.height = 24
  headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
    if (col > totalCols) return
    cell.font = { size: 10, bold: true }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.border = thinBorder
    cell.fill = col === thisYearCol ? THIS_YEAR_FILL : HEADER_FILL
  })

  // Row 3: 소계 (총액은 계약 단위 1회 합산, 연도별 금차는 컬럼 합)
  const subtotalTot = rows.reduce((s, r) => s + (r.totAmt || 0), 0)
  const subtotalRow = ws.addRow([
    '소계', `${rows.length}건`, '', subtotalTot,
    ...yearCols.map((y) => rows.reduce((s, r) => s + (r.yearAmts[y] || 0), 0)),
    '', '', '',
  ])
  subtotalRow.height = 22
  subtotalRow.eachCell({ includeEmpty: true }, (cell, col) => {
    if (col > totalCols) return
    cell.font = { size: 10, bold: true }
    cell.alignment = { horizontal: col === 2 ? 'center' : col >= 4 && col < yearStart + yearCols.length ? 'right' : 'center', vertical: 'middle' }
    cell.border = thinBorder
    cell.fill = col === thisYearCol ? THIS_YEAR_FILL : SUBTOTAL_FILL
    if (typeof cell.value === 'number') cell.numFmt = NUM_FMT
  })

  // 데이터 행
  for (const r of rows) {
    const nameText = r.memberCount > 1 ? `${r.name}\n(장기계속 · 차수 ${r.memberCount}건 병합)` : r.name
    const excelRow = ws.addRow([
      r.type,
      nameText,
      r.corp || '',
      r.totAmt || null,
      ...yearCols.map((y) => (r.yearAmts[y] != null ? r.yearAmts[y] : null)),
      r.cntrctDate || '',
      r.period || '',
      r.dminstt || '',
    ])
    excelRow.height = r.memberCount > 1 ? 30 : 22
    excelRow.eachCell({ includeEmpty: true }, (cell, col) => {
      if (col > totalCols) return
      cell.border = thinBorder
      cell.font = { size: 10 }
      const isYearCol = col >= yearStart && col < yearStart + yearCols.length
      const isAmtCol = col === 4 || isYearCol
      cell.alignment = {
        horizontal: col === 2 ? 'left' : isAmtCol ? 'right' : 'center',
        vertical: 'middle',
        wrapText: col === 2 || col === 3 || col === totalCols || col === totalCols - 1,
      }
      if (typeof cell.value === 'number') cell.numFmt = NUM_FMT
      if (col === thisYearCol) cell.fill = THIS_YEAR_FILL
    })
  }

  ws.pageSetup = {
    paperSize: 9,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.4, header: 0.3, footer: 0.3 },
  }

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const today = new Date()
  const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`
  a.href = url
  a.download = `${projectName ? projectName + '_' : ''}계약현황_${dateStr}.xlsx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
