import ExcelJS from 'exceljs'
import type { TBMRecord } from '@/lib/tbm'
import { BRANCH_OPTIONS } from '@/lib/constants'

/**
 * 본부 단위 TBM 현황을 엑셀 파일로 다운로드
 */
export async function downloadTBMStatusExcel(
  records: TBMRecord[],
  hqName: string,
  selectedDate: string
) {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('TBM 현황')

  // 날짜 포맷: YY-MM-DD
  const d = new Date(selectedDate)
  const yy = String(d.getFullYear()).slice(2)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const dateStr = `${yy}-${mm}-${dd}`

  // 컬럼 정의 (12개)
  const columns = [
    { header: '일자', key: 'date', width: 12 },
    { header: '지사명', key: 'branch', width: 14 },
    { header: '사업명', key: 'project', width: 30 },
    { header: '작업내용', key: 'work', width: 35 },
    { header: '교육내용', key: 'education', width: 35 },
    { header: '회사명', key: 'company', width: 18 },
    { header: '작업주소', key: 'address', width: 35 },
    { header: '투입인원', key: 'personnel', width: 10 },
    { header: '투입장비', key: 'equipment', width: 20 },
    { header: '위험공종', key: 'riskType', width: 14 },
    { header: '소장이름', key: 'leader', width: 12 },
    { header: '소장연락처', key: 'contact', width: 16 },
  ]

  const colCount = columns.length

  // 1행: 제목 (병합)
  worksheet.mergeCells(1, 1, 1, colCount)
  const titleCell = worksheet.getCell('A1')
  titleCell.value = `${hqName} 건설현장 TBM 현황(${dateStr})`
  titleCell.font = { size: 14, bold: true }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  worksheet.getRow(1).height = 30

  // 2행: 빈 줄
  worksheet.getRow(2).height = 10

  // 3행: 제목행
  const headerRow = worksheet.getRow(3)
  columns.forEach((col, idx) => {
    const cell = headerRow.getCell(idx + 1)
    cell.value = col.header
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' },
    }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.border = {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' },
    }
  })
  headerRow.height = 24

  // 컬럼 너비 설정
  columns.forEach((col, idx) => {
    worksheet.getColumn(idx + 1).width = col.width
  })

  // 직제 순서로 지사 정렬
  const branchOrder = BRANCH_OPTIONS[hqName] || []
  const getBranchIndex = (branch: string) => {
    const idx = branchOrder.indexOf(branch)
    return idx === -1 ? 9999 : idx
  }
  const sortedRecords = [...records].sort((a, b) => {
    const orderA = getBranchIndex(a.managing_branch || '')
    const orderB = getBranchIndex(b.managing_branch || '')
    if (orderA !== orderB) return orderA - orderB
    return (a.project_name || '').localeCompare(b.project_name || '')
  })

  // 4행부터 데이터
  sortedRecords.forEach((record, idx) => {
    const row = worksheet.getRow(4 + idx)
    const meetingDate = record.meeting_date
      ? (() => {
          const rd = new Date(record.meeting_date)
          const ry = String(rd.getFullYear()).slice(2)
          const rm = String(rd.getMonth() + 1).padStart(2, '0')
          const rdd = String(rd.getDate()).padStart(2, '0')
          return `${ry}-${rm}-${rdd}`
        })()
      : ''

    const values = [
      meetingDate,
      record.managing_branch || '',
      record.project_name || '',
      record.today_work || '',
      record.education_content || '',
      record.construction_company || '',
      record.location || '',
      record.attendees || '',
      record.equipment_input || '',
      record.risk_work_type || '',
      record.leader || '',
      record.contact || '',
    ]

    // 가운데 정렬 컬럼 인덱스: 일자(0), 지사명(1), 사업명(2), 회사명(5), 위험공종(9), 소장이름(10)
    const centerColumns = new Set([0, 1, 2, 5, 9, 10])

    values.forEach((val, colIdx) => {
      const cell = row.getCell(colIdx + 1)
      cell.value = val
      cell.font = { size: 10 }
      cell.alignment = { horizontal: centerColumns.has(colIdx) ? 'center' : undefined, vertical: 'middle', wrapText: true }
      cell.border = {
        top: { style: 'thin' },
        bottom: { style: 'thin' },
        left: { style: 'thin' },
        right: { style: 'thin' },
      }
    })
  })

  // 다운로드
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${hqName}_TBM현황_${yy}${mm}${dd}.xlsx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
