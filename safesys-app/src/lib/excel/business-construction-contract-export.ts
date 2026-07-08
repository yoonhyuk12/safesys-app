// 사업현황 '본부별 공사 계약현황'을 계약 단위 상세 목록(본부·지사·사업명 + 계약현황 엑셀 구성)으로 Excel 내보내기
import ExcelJS from 'exceljs'

export interface BusinessContractExcelRow {
  hq: string // 표시용 본부명 (예: 경기본부)
  branch: string
  projectName: string
  name: string // 계약명 (차수 병합 그룹 대표)
  memberCount: number // 병합된 차수 건수 (2 이상이면 계약명에 부기)
  totAmt: number | null
  yearAmts: Record<string, number> // 연도('2026'|'기타') → 금차 합
  corp: string
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
const HQ_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF2FB' } } // 본부 소계 (연파랑)
const BRANCH_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF6FAFE' } } // 지사 소계 (아주 연한 파랑)

const yearLabel = (y: string) => (y === '기타' ? '연도미상' : `${y.slice(2)}년`)

export async function downloadBusinessConstructionContractExcel(
  yearCols: string[],
  thisYear: string,
  rows: BusinessContractExcelRow[],
) {
  const wb = new ExcelJS.Workbook()
  wb.calcProperties.fullCalcOnLoad = true // 소계 수식을 열 때 재계산
  const ws = wb.addWorksheet('본부별 공사 계약현황')

  // 컬럼 구성: 본부, 지사, 사업명, 계약명, 계약상대자, 총계약금액, [연도별 금차…], 계약체결일, 계약기간, 수요기관
  const yearStart = 7 // 연도 컬럼 시작(1-based)
  const amtColEnd = yearStart + yearCols.length // 금액 컬럼(총계약금액 6 + 연도별)은 6..amtColEnd-1로 연속
  const totalCols = 6 + yearCols.length + 3
  const thisYearCol = yearCols.indexOf(thisYear) >= 0 ? yearStart + yearCols.indexOf(thisYear) : -1

  ws.columns = [
    { width: 12 },  // 본부
    { width: 12 },  // 지사
    { width: 30 },  // 사업명
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
  titleCell.value = '본부별 공사 계약현황'
  titleCell.font = { size: 16, bold: true }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(1).height = 30

  // Row 2: 헤더
  const headerLabels = [
    '본부', '지사', '사업명', '계약명', '계약상대자', '총계약금액(원)',
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

  // 합계행 공용(총 합계·본부/지사 소계) — 금액 셀은 비워 추가하고 행 확정 후 수식 주입
  const addTotalRow = (label: string, count: number, fill: ExcelJS.Fill): ExcelJS.Row => {
    const row = ws.addRow([
      `${label} (${count}건)`, '', '', '', '',
      null,
      ...yearCols.map(() => null),
      '', '', '',
    ])
    row.height = 22
    ws.mergeCells(row.number, 1, row.number, 5)
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      if (col > totalCols) return
      cell.font = { size: 10, bold: true }
      cell.alignment = { horizontal: col === 1 ? 'left' : col >= 6 && col < amtColEnd ? 'right' : 'center', vertical: 'middle' }
      cell.border = thinBorder
      cell.fill = col === thisYearCol ? THIS_YEAR_FILL : fill
    })
    return row
  }

  // 금액 컬럼별 합계 (수식의 result 값 — 미리보기 앱 호환용)
  const colSums = (list: BusinessContractExcelRow[]): number[] => [
    list.reduce((s, r) => s + (r.totAmt || 0), 0),
    ...yearCols.map((y) => list.reduce((s, r) => s + (r.yearAmts[y] || 0), 0)),
  ]

  // 합계행 금액 셀에 SUM 수식 주입 — 지사 소계는 데이터 행 범위, 본부 소계·총 합계는 하위 소계 셀 목록
  const setSumFormulas = (
    row: ExcelJS.Row,
    refs: { type: 'range'; start: number; end: number } | { type: 'cells'; rows: number[] },
    results: number[],
  ) => {
    for (let col = 6; col < amtColEnd; col++) {
      const letter = ws.getColumn(col).letter
      const cell = row.getCell(col)
      const result = results[col - 6]
      if (refs.type === 'range') {
        cell.value = { formula: `SUM(${letter}${refs.start}:${letter}${refs.end})`, result }
      } else if (refs.rows.length > 0) {
        cell.value = { formula: `SUM(${refs.rows.map((r) => `${letter}${r}`).join(',')})`, result }
      } else {
        cell.value = 0
      }
      cell.numFmt = NUM_FMT
    }
  }

  // 데이터 행 1건 기록
  const addDataRow = (r: BusinessContractExcelRow) => {
    const nameText = r.memberCount > 1 ? `${r.name}\n(장기계속 · 차수 ${r.memberCount}건 병합)` : r.name
    const excelRow = ws.addRow([
      r.hq,
      r.branch,
      r.projectName,
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
      cell.font = col <= 2 ? { size: 10, bold: true, color: { argb: 'FF1F4E9C' } } : { size: 10 }
      const isYearCol = col >= yearStart && col < amtColEnd
      const isAmtCol = col === 6 || isYearCol
      cell.alignment = {
        horizontal: col === 3 || col === 4 ? 'left' : isAmtCol ? 'right' : 'center',
        vertical: 'middle',
        wrapText: col >= 3 && col <= 5 || col === totalCols || col === totalCols - 1,
      }
      if (typeof cell.value === 'number') cell.numFmt = NUM_FMT
      if (col === thisYearCol) cell.fill = THIS_YEAR_FILL
    })
  }

  // 본부 → 지사 순 중첩 그룹 (rows는 이미 본부→지사→사업 순 정렬됨)
  const hqGroups: Array<{ hq: string; branches: Array<{ branch: string; rows: BusinessContractExcelRow[] }> }> = []
  for (const r of rows) {
    let hg = hqGroups[hqGroups.length - 1]
    if (!hg || hg.hq !== r.hq) {
      hg = { hq: r.hq, branches: [] }
      hqGroups.push(hg)
    }
    let bg = hg.branches[hg.branches.length - 1]
    if (!bg || bg.branch !== r.branch) {
      bg = { branch: r.branch, rows: [] }
      hg.branches.push(bg)
    }
    bg.rows.push(r)
  }

  // Row 3: 총 합계 → 본부마다 [본부 소계 → 지사마다 [지사 소계 → 데이터 행…]] 순서로 기록.
  // 소계행이 그룹 상단에 오므로 수식은 각 그룹의 행 번호가 확정된 뒤 주입한다
  const grandRow = addTotalRow('총 합계', rows.length, TOTAL_FILL)
  const hqSubRowNums: number[] = []
  for (const hg of hqGroups) {
    const hqRows = hg.branches.flatMap((b) => b.rows)
    const hqRow = addTotalRow(`${hg.hq} 소계`, hqRows.length, HQ_FILL)
    hqSubRowNums.push(hqRow.number)
    const branchSubRowNums: number[] = []
    for (const bg of hg.branches) {
      const brRow = addTotalRow(`${bg.branch} 소계`, bg.rows.length, BRANCH_FILL)
      branchSubRowNums.push(brRow.number)
      for (const r of bg.rows) addDataRow(r)
      setSumFormulas(brRow, { type: 'range', start: brRow.number + 1, end: brRow.number + bg.rows.length }, colSums(bg.rows))
    }
    setSumFormulas(hqRow, { type: 'cells', rows: branchSubRowNums }, colSums(hqRows))
  }
  setSumFormulas(grandRow, { type: 'cells', rows: hqSubRowNums }, colSums(rows))

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
  a.download = `본부별_공사계약현황_${dateStr}.xlsx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
