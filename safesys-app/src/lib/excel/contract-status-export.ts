// 계약(공사·용역) 현황 표를 화면과 동일한 구성(총 합계·공사/용역 소계행·연도별 금차 컬럼·올해 강조)으로 Excel 내보내기
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
const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5597' } } // 남색 헤더
const TOTAL_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC9DCF5' } } // 총 합계 (진한 파랑톤)
const CNSTWK_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF2FB' } } // 공사 소계 (연파랑)
const SERVC_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7F4EA' } } // 용역 소계 (연초록)

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
    const isThisYear = col === thisYearCol
    cell.font = { size: 10, bold: true, color: { argb: isThisYear ? 'FF7C4A03' : 'FFFFFFFF' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.border = { ...thinBorder, bottom: { style: 'medium' } }
    cell.fill = isThisYear ? THIS_YEAR_FILL : HEADER_FILL
  })

  // 합계행 공용 — 총 합계·공사/용역 소계 (총액은 계약 단위 1회 합산, 연도별 금차는 컬럼 합)
  const addTotalRow = (label: string, list: ContractExcelRow[], fill: ExcelJS.Fill) => {
    const row = ws.addRow([
      `${label} (${list.length}건)`, '', '',
      list.reduce((s, r) => s + (r.totAmt || 0), 0),
      ...yearCols.map((y) => list.reduce((s, r) => s + (r.yearAmts[y] || 0), 0)),
      '', '', '',
    ])
    row.height = 22
    ws.mergeCells(row.number, 1, row.number, 3)
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      if (col > totalCols) return
      cell.font = { size: 10, bold: true }
      cell.alignment = { horizontal: col === 1 ? 'left' : col >= 4 && col < yearStart + yearCols.length ? 'right' : 'center', vertical: 'middle' }
      cell.border = thinBorder
      cell.fill = col === thisYearCol ? THIS_YEAR_FILL : fill
      if (typeof cell.value === 'number') cell.numFmt = NUM_FMT
    })
  }

  // Row 3: 총 합계 (헤더 바로 아래)
  addTotalRow('총 합계', rows, TOTAL_FILL)

  // 데이터 행 — 구분(공사→용역)이 바뀌는 첫 행 위에 해당 구분 소계행 삽입 (화면 표와 동일 구성)
  let prevType: string | null = null
  for (const r of rows) {
    if (r.type !== prevType) {
      addTotalRow(
        `${r.type} 소계`,
        rows.filter((x) => x.type === r.type),
        r.type === '공사' ? CNSTWK_FILL : SERVC_FILL,
      )
      prevType = r.type
    }
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
      // 구분 컬럼은 화면 배지처럼 공사=파랑·용역=초록 굵은 글씨로 구분
      cell.font = col === 1
        ? { size: 10, bold: true, color: { argb: r.type === '공사' ? 'FF1F4E9C' : 'FF2E7D32' } }
        : { size: 10 }
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

  // 제목·헤더·총 합계행 고정 (스크롤 시 상단 유지)
  ws.views = [{ state: 'frozen', ySplit: 3 }]

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
