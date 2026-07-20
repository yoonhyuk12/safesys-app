// TBM AI 분석·발송 내역을 엑셀로 내보내는 모듈
import ExcelJS from 'exceljs'

export interface TbmAnalysisExportRow {
  projectName: string
  branch: string
  projectCategory: string
  todayWork: string
  personnelText: string
  equipment: string
  analysis: string
  message: string
  hasClientTelegram: boolean
  hasContractorTelegram: boolean
}

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' },
  left: { style: 'thin' },
  bottom: { style: 'thin' },
  right: { style: 'thin' },
}

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF4472C4' },
}

const COL_COUNT = 11

// wrapText 적용 컬럼(1-based): 오늘 작업내용(5), AI 분석 요약(8), 발송 메시지(9)
const WRAP_COLS = new Set([5, 8, 9])

export async function exportTbmTelegramAnalysis(
  rows: TbmAnalysisExportRow[],
  selectedDate: string,
): Promise<void> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('TBM AI 분석')

  ws.columns = [
    { width: 6 },   // 순번
    { width: 28 },  // 현장명
    { width: 12 },  // 지사
    { width: 16 },  // 소관사업
    { width: 40 },  // 오늘 작업내용
    { width: 10 },  // 투입인원
    { width: 18 },  // 투입장비
    { width: 45 },  // AI 분석 요약
    { width: 50 },  // 발송 메시지
    { width: 14 },  // 수신 가능(발주청)
    { width: 14 },  // 수신 가능(시공사)
  ]

  // 1행: 제목
  ws.mergeCells(1, 1, 1, COL_COUNT)
  const titleCell = ws.getCell(1, 1)
  titleCell.value = `TBM AI 분석 결과 (${selectedDate})`
  titleCell.font = { size: 14, bold: true }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(1).height = 28

  // 2행: 헤더
  const headerLabels = [
    '순번',
    '현장명',
    '지사',
    '소관사업',
    '오늘 작업내용',
    '투입인원',
    '투입장비',
    'AI 분석 요약',
    '발송 메시지',
    '수신 가능(발주청)',
    '수신 가능(시공사)',
  ]
  const headerRow = ws.addRow(headerLabels)
  headerRow.height = 24
  headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
    if (col > COL_COUNT) return
    cell.font = { size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = HEADER_FILL
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.border = thinBorder
  })

  // 3행부터 데이터
  rows.forEach((r, idx) => {
    const excelRow = ws.addRow([
      idx + 1,
      r.projectName || '',
      r.branch || '',
      r.projectCategory || '',
      r.todayWork || '',
      r.personnelText || '',
      r.equipment || '',
      r.analysis || '',
      r.message || '',
      r.hasClientTelegram ? 'O' : 'X',
      r.hasContractorTelegram ? 'O' : 'X',
    ])

    // 긴 텍스트 행 높이 여유
    const longTextLen = Math.max(
      (r.todayWork || '').length,
      (r.analysis || '').length,
      (r.message || '').length,
    )
    excelRow.height = Math.min(120, Math.max(22, Math.ceil(longTextLen / 40) * 15))

    excelRow.eachCell({ includeEmpty: true }, (cell, col) => {
      if (col > COL_COUNT) return
      cell.font = { size: 10 }
      cell.border = thinBorder
      if (WRAP_COLS.has(col)) {
        cell.alignment = { wrapText: true, vertical: 'top', horizontal: 'left' }
      } else {
        cell.alignment = {
          horizontal: col === 2 || col === 4 || col === 7 ? 'left' : 'center',
          vertical: 'middle',
        }
      }
    })
  })

  ws.views = [{ state: 'frozen', ySplit: 2 }]

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `TBM_AI분석결과_${selectedDate}.xlsx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
