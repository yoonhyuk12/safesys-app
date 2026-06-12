// 작업일보 (공사작업일지) 엑셀 내보내기
// 원본 서식: 별지 제60호 (건설공사 사업관리방식 검토기준 및 업무수행지침)
// 원본은 상단 정보(공사명/일자/날씨 등)가 표 없이 나열되지만, 본 양식은 표 형태로 출력

import ExcelJS from 'exceljs'
import {
  WorkDailyReport,
  defaultPersonnelRows,
  getWeekdayKorean,
} from '@/lib/work-daily-report/work-daily-report-types'

const thin: ExcelJS.Border = { style: 'thin', color: { argb: 'FF000000' } }
const allBorders: Partial<ExcelJS.Borders> = { top: thin, bottom: thin, left: thin, right: thin }
const headerFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } }

const COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']

// A4 세로 기준 인쇄 가능 높이(pt) — 행 높이 합이 이보다 작으면 늘려서 하단 여백 제거
const A4_USABLE_HEIGHT = 740
const MAX_STRETCH = 1.5

interface CellOpts {
  bold?: boolean
  size?: number
  fill?: ExcelJS.Fill
  align?: Partial<ExcelJS.Alignment>
  border?: boolean
}

const setCell = (ws: ExcelJS.Worksheet, addr: string, value: ExcelJS.CellValue, opts: CellOpts = {}) => {
  const cell = ws.getCell(addr)
  cell.value = value
  cell.font = { size: opts.size ?? 10, bold: opts.bold ?? false }
  if (opts.fill) cell.fill = opts.fill
  if (opts.border !== false) cell.border = allBorders
  cell.alignment = { vertical: 'middle', wrapText: true, ...opts.align }
}

// 병합 범위의 모든 셀에 테두리 적용 (병합 셀 테두리 누락 방지)
const borderRange = (ws: ExcelJS.Worksheet, range: string) => {
  const [start, end] = range.split(':')
  const startCol = COLS.indexOf(start[0])
  const endCol = COLS.indexOf(end[0])
  const startRow = parseInt(start.slice(1), 10)
  const endRow = parseInt(end.slice(1), 10)
  for (let r = startRow; r <= endRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      ws.getCell(`${COLS[c]}${r}`).border = allBorders
    }
  }
}

const mergeSet = (
  ws: ExcelJS.Worksheet,
  range: string,
  value: ExcelJS.CellValue,
  opts: CellOpts = {}
) => {
  ws.mergeCells(range)
  setCell(ws, range.split(':')[0], value, opts)
  if (opts.border !== false) borderRange(ws, range)
}

const stretchRowsToA4 = (ws: ExcelJS.Worksheet, lastRow: number) => {
  let total = 0
  for (let r = 1; r <= lastRow; r++) {
    total += ws.getRow(r).height || 18
  }
  if (total <= 0 || total >= A4_USABLE_HEIGHT) return
  const scale = Math.min(A4_USABLE_HEIGHT / total, MAX_STRETCH)
  for (let r = 1; r <= lastRow; r++) {
    const row = ws.getRow(r)
    row.height = Math.floor((row.height || 18) * scale)
  }
}

// 숫자 값에만 단위 부착 ("금일조회X" 등 텍스트는 그대로 표시)
const withUnit = (value: string, unit: string): string => {
  if (!value) return ''
  return /^-?\d+(\.\d+)?$/.test(value.trim()) ? `${value} ${unit}` : value
}

const formatDateKorean = (dateStr: string): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return ''
  const [y, m, d] = dateStr.split('-')
  const weekday = getWeekdayKorean(dateStr)
  return `${y}. ${m}. ${d}. (${weekday}요일)`
}

const downloadWorkbook = async (workbook: ExcelJS.Workbook, filename: string) => {
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

// ── 공사작업일지 (별지 제60호) — 워크북에 1건 시트 추가
const buildReportSheet = (
  workbook: ExcelJS.Workbook,
  report: WorkDailyReport,
  projectName: string,
  sheetName: string
): void => {
  const ws = workbook.addWorksheet(sheetName, {
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      margins: { left: 0.6, right: 0.6, top: 0.7, bottom: 0.7, header: 0.3, footer: 0.3 },
    },
  })

  ws.columns = [
    { width: 9 },  // A
    { width: 9 },  // B
    { width: 9 },  // C
    { width: 7 },  // D
    { width: 9 },  // E
    { width: 9 },  // F
    { width: 9 },  // G
    { width: 9 },  // H
    { width: 9 },  // I
    { width: 9 },  // J
  ]

  let r = 1

  // 서식 태그
  mergeSet(ws, `A${r}:J${r}`, '[별지 60] 공사작업일지(건설공사 사업관리방식 검토기준 및 업무수행지침)', {
    size: 10, border: false, align: { horizontal: 'left' },
  })
  ws.getRow(r).height = 18
  r++

  // 제목
  mergeSet(ws, `A${r}:J${r}`, '공  사  작  업  일  지', {
    size: 20, bold: true, border: false, align: { horizontal: 'center' },
  })
  ws.getRow(r).height = 36
  r++

  // ── 상단 정보 (표 형태)
  mergeSet(ws, `A${r}:B${r}`, '공 사 명', { bold: true, fill: headerFill, align: { horizontal: 'center' } })
  mergeSet(ws, `C${r}:J${r}`, projectName || '', { align: { horizontal: 'left' } })
  ws.getRow(r).height = 24
  r++

  mergeSet(ws, `A${r}:B${r}`, '일    자', { bold: true, fill: headerFill, align: { horizontal: 'center' } })
  mergeSet(ws, `C${r}:E${r}`, formatDateKorean(report.report_date), { align: { horizontal: 'center' } })
  mergeSet(ws, `F${r}:G${r}`, '날    씨', { bold: true, fill: headerFill, align: { horizontal: 'center' } })
  mergeSet(ws, `H${r}:J${r}`, report.weather || '', { align: { horizontal: 'center' } })
  ws.getRow(r).height = 24
  r++

  mergeSet(ws, `A${r}:B${r}`, '기온(최고)', { bold: true, fill: headerFill, align: { horizontal: 'center' } })
  mergeSet(ws, `C${r}:D${r}`, withUnit(report.temp_high, '℃'), { align: { horizontal: 'center' } })
  mergeSet(ws, `E${r}:F${r}`, '기온(최저)', { bold: true, fill: headerFill, align: { horizontal: 'center' } })
  mergeSet(ws, `G${r}:H${r}`, withUnit(report.temp_low, '℃'), { align: { horizontal: 'center' } })
  setCell(ws, `I${r}`, '강우량', { bold: true, fill: headerFill, align: { horizontal: 'center' } })
  setCell(ws, `J${r}`, withUnit(report.rainfall, 'mm'), { align: { horizontal: 'center' } })
  ws.getRow(r).height = 24
  r++

  mergeSet(ws, `A${r}:B${r}`, '작 성 자\n(담당자)', { bold: true, fill: headerFill, align: { horizontal: 'center' } })
  mergeSet(ws, `C${r}:D${r}`, report.author_name ? `${report.author_name}  (인)` : '(인)', { align: { horizontal: 'center' } })
  mergeSet(ws, `E${r}:F${r}`, '확 인 자\n(현장대리인)', { bold: true, fill: headerFill, align: { horizontal: 'center' } })
  mergeSet(ws, `G${r}:H${r}`, report.checker_name ? `${report.checker_name}  (인)` : '(인)', { align: { horizontal: 'center' } })
  setCell(ws, `I${r}`, '공정률', { bold: true, fill: headerFill, align: { horizontal: 'center' } })
  setCell(ws, `J${r}`, report.progress_rate ? `${report.progress_rate} %` : '', { align: { horizontal: 'center' } })
  ws.getRow(r).height = 32
  r++

  // ── 1. 공사추진상황 (금일작업/명일작업 좌우 배치)
  mergeSet(ws, `A${r}:J${r}`, '1. 공사추진상황', { size: 11, bold: true, border: false, align: { horizontal: 'left' } })
  ws.getRow(r).height = 24
  r++

  mergeSet(ws, `A${r}:E${r}`, '금일작업', { bold: true, fill: headerFill, align: { horizontal: 'center' } })
  mergeSet(ws, `F${r}:J${r}`, '명일작업', { bold: true, fill: headerFill, align: { horizontal: 'center' } })
  ws.getRow(r).height = 24
  r++

  mergeSet(ws, `A${r}:E${r}`, report.today_work || '', { align: { horizontal: 'left', vertical: 'top' } })
  mergeSet(ws, `F${r}:J${r}`, report.tomorrow_work || '', { align: { horizontal: 'left', vertical: 'top' } })
  ws.getRow(r).height = 90
  r++

  // ── 2. 장비투입상황 (좌/우 2단 구성 — 원본 서식 유지)
  mergeSet(ws, `A${r}:H${r}`, '2. 장비투입상황', { size: 11, bold: true, border: false, align: { horizontal: 'left' } })
  mergeSet(ws, `I${r}:J${r}`, '(단위 : 대)', { size: 9, border: false, align: { horizontal: 'right' } })
  ws.getRow(r).height = 24
  r++

  const equipHeaders = ['장비명', '규  격', '전일까지\n투입', '금일\n투입', '누계\n투입']
  equipHeaders.forEach((label, i) => {
    setCell(ws, `${COLS[i]}${r}`, label, { bold: true, fill: headerFill, align: { horizontal: 'center' } })
    setCell(ws, `${COLS[i + 5]}${r}`, label, { bold: true, fill: headerFill, align: { horizontal: 'center' } })
  })
  ws.getRow(r).height = 28
  r++

  const equipmentRows = report.equipment_rows || []
  const halfCount = Math.max(Math.ceil(equipmentRows.length / 2), 4)
  for (let i = 0; i < halfCount; i++) {
    const left = equipmentRows[i]
    const right = equipmentRows[i + halfCount]
    setCell(ws, `A${r}`, left?.name || '', { align: { horizontal: 'center' } })
    setCell(ws, `B${r}`, left?.spec || '', { align: { horizontal: 'center' } })
    setCell(ws, `C${r}`, left?.prevCount || '', { align: { horizontal: 'center' } })
    setCell(ws, `D${r}`, left?.todayCount || '', { align: { horizontal: 'center' } })
    setCell(ws, `E${r}`, left?.cumulativeCount || '', { align: { horizontal: 'center' } })
    setCell(ws, `F${r}`, right?.name || '', { align: { horizontal: 'center' } })
    setCell(ws, `G${r}`, right?.spec || '', { align: { horizontal: 'center' } })
    setCell(ws, `H${r}`, right?.prevCount || '', { align: { horizontal: 'center' } })
    setCell(ws, `I${r}`, right?.todayCount || '', { align: { horizontal: 'center' } })
    setCell(ws, `J${r}`, right?.cumulativeCount || '', { align: { horizontal: 'center' } })
    ws.getRow(r).height = 22
    r++
  }

  // ── 3. 인력투입상황 (좌/우 2단 구성)
  mergeSet(ws, `A${r}:H${r}`, '3. 인력투입상황', { size: 11, bold: true, border: false, align: { horizontal: 'left' } })
  mergeSet(ws, `I${r}:J${r}`, '(단위 : 명)', { size: 9, border: false, align: { horizontal: 'right' } })
  ws.getRow(r).height = 24
  r++

  const personHeaders = ['구  분', '전일까지', '금일', '누계', '비  고']
  personHeaders.forEach((label, i) => {
    setCell(ws, `${COLS[i]}${r}`, label, { bold: true, fill: headerFill, align: { horizontal: 'center' } })
    setCell(ws, `${COLS[i + 5]}${r}`, label, { bold: true, fill: headerFill, align: { horizontal: 'center' } })
  })
  ws.getRow(r).height = 28
  r++

  const personnelRows = report.personnel_rows?.length ? report.personnel_rows : defaultPersonnelRows()
  const personHalf = Math.max(Math.ceil(personnelRows.length / 2), 5)
  for (let i = 0; i < personHalf; i++) {
    const left = personnelRows[i]
    const right = personnelRows[i + personHalf]
    setCell(ws, `A${r}`, left?.category || '', { align: { horizontal: 'center' } })
    setCell(ws, `B${r}`, left?.prevCount || '', { align: { horizontal: 'center' } })
    setCell(ws, `C${r}`, left?.todayCount || '', { align: { horizontal: 'center' } })
    setCell(ws, `D${r}`, left?.cumulativeCount || '', { align: { horizontal: 'center' } })
    setCell(ws, `E${r}`, left?.remarks || '', { align: { horizontal: 'center' } })
    setCell(ws, `F${r}`, right?.category || '', { align: { horizontal: 'center' } })
    setCell(ws, `G${r}`, right?.prevCount || '', { align: { horizontal: 'center' } })
    setCell(ws, `H${r}`, right?.todayCount || '', { align: { horizontal: 'center' } })
    setCell(ws, `I${r}`, right?.cumulativeCount || '', { align: { horizontal: 'center' } })
    setCell(ws, `J${r}`, right?.remarks || '', { align: { horizontal: 'center' } })
    ws.getRow(r).height = 22
    r++
  }

  // ── 4. 기타 특이사항
  mergeSet(ws, `A${r}:J${r}`, '4. 기타 특이사항', {
    size: 11, bold: true, border: false, align: { horizontal: 'left' },
  })
  ws.getRow(r).height = 24
  r++

  mergeSet(ws, `A${r}:J${r}`, report.participants || '', { align: { horizontal: 'left', vertical: 'top' } })
  ws.getRow(r).height = 64
  r++

  stretchRowsToA4(ws, r - 1)
}

const safeFileName = (projectName: string): string =>
  (projectName || '사업명').replace(/[\\/:*?"<>|]/g, '_').trim()

// ── 공사작업일지 (별지 제60호) — 1건 출력
export async function downloadWorkDailyReportExcel(
  report: WorkDailyReport,
  projectName: string,
  filename?: string
): Promise<void> {
  const workbook = new ExcelJS.Workbook()
  buildReportSheet(workbook, report, projectName, '공사작업일지')

  const dateStr = report.report_date || new Date().toISOString().split('T')[0]
  await downloadWorkbook(workbook, filename || `${safeFileName(projectName)}_작업일보_${dateStr}.xlsx`)
}

// ── 공사작업일지 월 단위 일괄 출력 — 일자별 시트 (벌크 다운로드)
export async function downloadMonthlyWorkDailyReportsExcel(
  reports: WorkDailyReport[],
  projectName: string,
  year: number,
  month: number // 1~12
): Promise<void> {
  if (!reports.length) return

  const workbook = new ExcelJS.Workbook()
  const sorted = [...reports].sort((a, b) => a.report_date.localeCompare(b.report_date))
  sorted.forEach(report => {
    const day = report.report_date?.slice(8, 10) || '00'
    buildReportSheet(workbook, report, projectName, `${day}일`)
  })

  const monthStr = `${year}년 ${String(month).padStart(2, '0')}월`
  await downloadWorkbook(workbook, `${safeFileName(projectName)}_작업일보_${monthStr}_일괄.xlsx`)
}
