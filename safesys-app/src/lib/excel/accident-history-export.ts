// 사고 분석 화면의 사고 이력 표를 화면 표기 그대로 엑셀로 내려받는 모듈
import ExcelJS from 'exceljs'

/** 화면이 이미 계산한 표기값을 담은 사고 이력 한 행 */
export interface AccidentHistoryExcelRow {
  hq: string
  branch: string
  projectName: string
  isExternalSite: boolean
  /** 화면 표기 그대로 (예: 26-03-04(수)) */
  accidentDate: string
  /** 화면 표기, 없으면 '-' */
  reportDate: string
  reportDelayDays: number | null
  reportDelayed: boolean
  /** 라벨 (예: 경상) */
  severity: string
  accidentType: string
  compApplied: boolean
  treatmentDays: number | null
  injuredCount: number
  fatalCount: number
  lostWorkdays: number
  description: string
  location: string
  workDescription: string
  cause: string
  preventionAction: string
  daysSinceLatestInspection: number | null
  /** 예: '본부불시 · 2026. 3. 1.' 없으면 '사고 전 점검 이력 없음' */
  latestInspectionLabel: string
  latestInspectionSummary: string
}

export interface AccidentHistoryPeriod {
  startDate: string
  endDate: string
}

const SHEET_NAME = '사고이력'

const thin: ExcelJS.Border = { style: 'thin', color: { argb: 'FF000000' } }
const allBorders: Partial<ExcelJS.Borders> = { top: thin, bottom: thin, left: thin, right: thin }

const headerFill: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFD9E1F2' },
}

// 보고 지연 셀 음영
const delayedFill: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFCE4E4' },
}

// 소계 행 음영
const subtotalFill: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFF2F2F2' },
}

const centeredAlignment: Partial<ExcelJS.Alignment> = {
  horizontal: 'center',
  vertical: 'middle',
  wrapText: true,
}

const leftAlignment: Partial<ExcelJS.Alignment> = {
  horizontal: 'left',
  vertical: 'middle',
  wrapText: true,
}

const COLUMNS = [
  { header: '순번', key: 'no', width: 6 },
  { header: '본부', key: 'hq', width: 14 },
  { header: '지사', key: 'branch', width: 14 },
  { header: '프로젝트', key: 'projectName', width: 30 },
  { header: '구분', key: 'siteKind', width: 8 },
  { header: '사고일자', key: 'accidentDate', width: 14 },
  { header: '보고일자', key: 'reportDate', width: 14 },
  { header: '보고 지연(일)', key: 'reportDelayDays', width: 10 },
  { header: '중대도', key: 'severity', width: 10 },
  { header: '사고 유형', key: 'accidentType', width: 14 },
  { header: '산재 신청', key: 'compApplied', width: 10 },
  { header: '요양일수', key: 'treatmentDays', width: 10 },
  { header: '부상자', key: 'injuredCount', width: 8 },
  { header: '사망자', key: 'fatalCount', width: 8 },
  { header: '휴업일수', key: 'lostWorkdays', width: 10 },
  { header: '사고 개요', key: 'description', width: 40 },
  { header: '사고 장소', key: 'location', width: 24 },
  { header: '사고 당시 작업', key: 'workDescription', width: 24 },
  { header: '사고 원인', key: 'cause', width: 30 },
  { header: '재발방지 대책', key: 'preventionAction', width: 30 },
  { header: '점검 후 경과일', key: 'daysSinceLatestInspection', width: 12 },
  { header: '최근 점검', key: 'latestInspectionLabel', width: 24 },
  { header: '최근 점검 내용', key: 'latestInspectionSummary', width: 40 },
] as const

type ColumnKey = (typeof COLUMNS)[number]['key']

/** 긴 글 열은 왼쪽 정렬, 나머지는 가운데 정렬한다. */
const LEFT_ALIGNED_KEYS: ReadonlySet<ColumnKey> = new Set<ColumnKey>([
  'description',
  'location',
  'workDescription',
  'cause',
  'preventionAction',
  'latestInspectionSummary',
])

/** 열 키의 열 번호(1부터) */
const columnOf = (key: ColumnKey): number => COLUMNS.findIndex((column) => column.key === key) + 1

const TITLE_ROW = 1
const HEADER_ROW = 2

function styleCell(cell: ExcelJS.Cell, key: ColumnKey): void {
  cell.border = allBorders
  cell.font = { size: 10 }
  cell.alignment = { ...(LEFT_ALIGNED_KEYS.has(key) ? leftAlignment : centeredAlignment) }
}

/** 화면이 계산한 행 배열로 사고 이력 워크북을 만든다. 표기 계산은 하지 않는다. */
export function buildAccidentHistoryWorkbook(
  rows: AccidentHistoryExcelRow[],
  period: AccidentHistoryPeriod
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet(SHEET_NAME)
  worksheet.columns = COLUMNS.map((column) => ({ key: column.key, width: column.width }))

  // 1행 제목(전 열 병합)
  worksheet.mergeCells(TITLE_ROW, 1, TITLE_ROW, COLUMNS.length)
  const titleCell = worksheet.getCell(TITLE_ROW, 1)
  titleCell.value = `사고 이력 (${period.startDate} ~ ${period.endDate})`
  titleCell.font = { bold: true, size: 14 }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  worksheet.getRow(TITLE_ROW).height = 28

  // 2행 헤더. 값이 빈 셀도 빠짐없이 꾸미도록 열 번호로 직접 돈다.
  const headerRow = worksheet.getRow(HEADER_ROW)
  COLUMNS.forEach((column, index) => {
    const cell = headerRow.getCell(index + 1)
    cell.value = column.header
    cell.fill = headerFill
    cell.font = { bold: true, size: 10 }
    cell.alignment = { ...centeredAlignment }
    cell.border = allBorders
  })
  headerRow.height = 30

  // 숫자 열은 숫자 셀로 넣고 null이면 빈 셀로 남긴다.
  rows.forEach((item, index) => {
    const row = worksheet.addRow({
      no: index + 1,
      hq: item.hq,
      branch: item.branch,
      projectName: item.projectName,
      siteKind: item.isExternalSite ? '미등록' : '등록',
      accidentDate: item.accidentDate,
      reportDate: item.reportDate,
      reportDelayDays: item.reportDelayDays,
      severity: item.severity,
      accidentType: item.accidentType,
      compApplied: item.compApplied ? '신청' : '미신청',
      treatmentDays: item.treatmentDays,
      injuredCount: item.injuredCount,
      fatalCount: item.fatalCount,
      lostWorkdays: item.lostWorkdays,
      description: item.description,
      location: item.location,
      workDescription: item.workDescription,
      cause: item.cause,
      preventionAction: item.preventionAction,
      daysSinceLatestInspection: item.daysSinceLatestInspection,
      latestInspectionLabel: item.latestInspectionLabel,
      latestInspectionSummary: item.latestInspectionSummary,
    })

    COLUMNS.forEach((column, columnIndex) => styleCell(row.getCell(columnIndex + 1), column.key))

    // 보고 지연 건은 보고일자·보고 지연 셀에 음영을 준다.
    if (item.reportDelayed) {
      row.getCell(columnOf('reportDate')).fill = delayedFill
      row.getCell(columnOf('reportDelayDays')).fill = delayedFill
    }
  })

  // 소계 행. 경과일 평균은 사고 전 점검이 있는 건만으로 낸다.
  const elapsedDays = rows
    .map((item) => item.daysSinceLatestInspection)
    .filter((days): days is number => days !== null)
  const elapsedAverage = elapsedDays.length > 0
    ? Math.round((elapsedDays.reduce((sum, days) => sum + days, 0) / elapsedDays.length) * 10) / 10
    : null

  const subtotalRow = worksheet.addRow({
    no: `소계 ${rows.length}건`,
    reportDelayDays: `지연 ${rows.filter((item) => item.reportDelayed).length}건`,
    compApplied: `신청 ${rows.filter((item) => item.compApplied).length}건`,
    injuredCount: rows.reduce((sum, item) => sum + item.injuredCount, 0),
    fatalCount: rows.reduce((sum, item) => sum + item.fatalCount, 0),
    lostWorkdays: rows.reduce((sum, item) => sum + item.lostWorkdays, 0),
    daysSinceLatestInspection: elapsedAverage,
  })
  COLUMNS.forEach((column, columnIndex) => {
    const cell = subtotalRow.getCell(columnIndex + 1)
    styleCell(cell, column.key)
    cell.font = { bold: true, size: 10 }
    cell.fill = subtotalFill
  })

  worksheet.views = [{ state: 'frozen', ySplit: HEADER_ROW }]

  return workbook
}

/** 사고 이력 엑셀을 만들어 내려받는다. */
export async function downloadAccidentHistoryExcel(
  rows: AccidentHistoryExcelRow[],
  period: AccidentHistoryPeriod
): Promise<void> {
  if (!rows || rows.length === 0) {
    throw new Error('내려받을 사고 이력이 없습니다.')
  }

  const workbook = buildAccidentHistoryWorkbook(rows, period)

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `사고이력_${period.startDate.replace(/-/g, '')}_${period.endDate.replace(/-/g, '')}.xlsx`
  anchor.click()
  URL.revokeObjectURL(url)
}
