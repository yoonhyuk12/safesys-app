// 재해예방기술지도 계약현황 관공서 양식 엑셀을 ExcelJS로 생성·다운로드하는 모듈
import ExcelJS from 'exceljs'

export interface DisasterPreventionExcelRow {
  hqName: string        // 본부명 (예: '경기본부')
  branchName: string    // 지사명 (예: '여주·이천지사')
  corpName: string      // 건설업체명
  workName: string      // 공사명
  location: string      // 소재지 (시·군)
  workStart: string     // 공사 착공일 'YYYY-MM-DD' | ''
  workEnd: string       // 공사 준공일 'YYYY-MM-DD' | ''
  workAmt: number | null   // 공사금액(원)
  guideName: string     // 기술지도 계약건명 ('' 가능)
  guideOrgName: string  // 지도기관명 ('' 가능)
  guideAmt: number | null  // 기술지도 대가(원)
  guideStart: string    // 지도 계약 착공일 'YYYY-MM-DD' | ''
  guideEnd: string      // 지도 계약 준공일 'YYYY-MM-DD' | ''
}

const BLACK = 'FF000000'
// 표 디자인 — 남색 헤더 + 흰 글씨, 짝수 데이터 행 줄무늬 (contract-status-export와 동일 계열)
const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5597' } }
const STRIPE_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F6FB' } }

// 열 너비(A~S). A는 여백 열
const COL_WIDTHS = [1.7, 9.6, 9.6, 12.9, 55, 8.5, 12.9, 12.9, 14.7, 15.3, 42, 18, 12.1, 12, 14, 14, 12.3, 12.3, 8]

const AMT_FMT = '_-* #,##0_-;-* #,##0_-;_-* "-"_-;_-@_-'

// 'YYYY-MM-DD' → 'YYYY.MM.DD'
const fmtYmd = (d: string): string => (d ? d.slice(0, 10).replace(/-/g, '.') : '')
// 'YYYY-MM-DD' → 'YY.MM.DD'
const fmtYy = (d: string): string => {
  if (!d) return ''
  const [y, m, day] = d.slice(0, 10).split('-')
  return `${y.slice(2)}.${m}.${day}`
}

const thinBorder = (argb: string): Partial<ExcelJS.Borders> => ({
  top: { style: 'thin', color: { argb } },
  bottom: { style: 'thin', color: { argb } },
  left: { style: 'thin', color: { argb } },
  right: { style: 'thin', color: { argb } },
})

export async function downloadDisasterPreventionContractExcel(rows: DisasterPreventionExcelRow[]): Promise<void> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Sheet1')

  ws.columns = COL_WIDTHS.map((w) => ({ width: w }))

  // 2~3행: 제목 (B2:K3 병합, 두 줄)
  const now = new Date()
  const dateLabel = `${String(now.getFullYear()).slice(2)}.${now.getMonth() + 1}.${now.getDate()}`
  ws.mergeCells('B2:K3')
  const titleCell = ws.getCell('B2')
  titleCell.value =
    `□ 재해예방기술지도 정기 관리 현황(${dateLabel} 기준)\n` +
    '   *  공사(기간, 금액), 기술지도(대가, 횟수, 계약기간)는 전체계약분으로 작성'
  titleCell.font = { name: 'HY헤드라인M', size: 16 }
  titleCell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }
  ws.getRow(2).height = 20.25
  ws.getRow(3).height = 20.25

  // 5~7행: 3단 헤더 — 값 설정
  ws.getCell('B5').value = '본부명'
  ws.getCell('C5').value = '지사명'
  ws.getCell('D5').value = '기술지도 대상 사업'
  ws.getCell('J5').value = '재해예방 지도기관'
  ws.getCell('S5').value = '비고'
  ws.getCell('D6').value = '건설업체명'
  ws.getCell('E6').value = '공사명'
  ws.getCell('F6').value = '소재지'
  ws.getCell('G6').value = '공사기간'
  ws.getCell('I6').value = '공사금액(원)'
  ws.getCell('J6').value = '지방고용노동청'
  ws.getCell('K6').value = '계약건명'
  ws.getCell('L6').value = '지도기관명'
  ws.getCell('M6').value = '사업장구분'
  ws.getCell('N6').value = '소재지'
  ws.getCell('O6').value = '기술지도 구분'
  ws.getCell('P6').value = '기술지도 대가(원)'
  ws.getCell('Q6').value = '계약기간'
  ws.getCell('G7').value = '착공일'
  ws.getCell('H7').value = '준공일'
  ws.getCell('Q7').value = '착공일'
  ws.getCell('R7').value = '준공일'

  // 헤더 병합
  ws.mergeCells('B5:B7')
  ws.mergeCells('C5:C7')
  ws.mergeCells('D5:I5')
  ws.mergeCells('J5:R5')
  ws.mergeCells('S5:S7')
  ws.mergeCells('D6:D7')
  ws.mergeCells('E6:E7')
  ws.mergeCells('F6:F7')
  ws.mergeCells('G6:H6')
  ws.mergeCells('I6:I7')
  ws.mergeCells('J6:J7')
  ws.mergeCells('K6:K7')
  ws.mergeCells('L6:L7')
  ws.mergeCells('M6:M7')
  ws.mergeCells('N6:N7')
  ws.mergeCells('O6:O7')
  ws.mergeCells('P6:P7')
  ws.mergeCells('Q6:R6')

  // 헤더 공통 스타일 (B~S, 5~7행 전부) — 남색 배경 + 흰 글씨 + 가는 테두리
  for (let r = 5; r <= 7; r++) {
    const row = ws.getRow(r)
    row.height = 18
    for (let c = 2; c <= 19; c++) {
      const cell = row.getCell(c)
      cell.font = { name: 'Dotum', size: 9, bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = HEADER_FILL
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      cell.border = r === 7 ? { ...thinBorder(BLACK), bottom: { style: 'medium', color: { argb: BLACK } } } : thinBorder(BLACK)
    }
  }

  // 8행부터 데이터
  rows.forEach((row, i) => {
    const r = 8 + i
    const excelRow = ws.getRow(r)
    excelRow.height = 26.25
    const values: Array<string | number | null> = [
      row.hqName,          // B
      row.branchName,      // C
      row.corpName,        // D
      row.workName,        // E
      row.location,        // F
      fmtYmd(row.workStart), // G
      fmtYmd(row.workEnd),   // H
      row.workAmt,         // I
      '',                  // J
      row.guideName,       // K
      row.guideOrgName,    // L
      '',                  // M
      '',                  // N
      '',                  // O
      row.guideAmt,        // P
      fmtYy(row.guideStart), // Q
      fmtYy(row.guideEnd),   // R
      '',                  // S
    ]
    for (let c = 2; c <= 19; c++) {
      const cell = excelRow.getCell(c)
      const v = values[c - 2]
      cell.value = v == null ? null : v
      cell.font = { name: 'Dotum', size: 9 }
      cell.border = thinBorder(BLACK)
      if (i % 2 === 1) cell.fill = STRIPE_FILL
      const isAmt = c === 9 || c === 16
      cell.alignment = {
        horizontal: c === 5 || c === 11 ? 'left' : 'center',
        vertical: 'middle',
        ...(isAmt ? { shrinkToFit: true } : { wrapText: true }),
      }
      if (isAmt) cell.numFmt = AMT_FMT
    }
  })

  // 헤더(7행까지) 고정 — 스크롤 시 상단 유지
  ws.views = [{ state: 'frozen', ySplit: 7 }]

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
  a.download = `재해예방기술지도 계약현황_${dateStr}.xlsx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
