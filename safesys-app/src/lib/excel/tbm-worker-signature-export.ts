// 일일안전교육 서명부(작업장 출입 전 근로자 작업가능상태 점검) 엑셀 생성
import ExcelJS from 'exceljs'

export interface TBMWorkerSignatureEntry {
  worker_name: string
  tbm_confirmed: boolean
  no_alcohol: boolean
  blood_pressure_ok: boolean
  ppe_worn: boolean
  cctv_consent: boolean
  body_ok: boolean
  signature?: string   // base64 data URL (data:image/png;base64,...)
}

const thin: ExcelJS.Border = { style: 'thin', color: { argb: 'FF000000' } }
const allBorders: Partial<ExcelJS.Borders> = {
  top: thin,
  bottom: thin,
  left: thin,
  right: thin,
}

const headerFill: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFE8E8E8' },
}

function getDayOfWeek(dateStr: string): string {
  const days = ['일', '월', '화', '수', '목', '금', '토']
  const d = new Date(dateStr)
  return days[d.getDay()]
}

/**
 * 일일안전교육 서명부(작업장 출입 전 근로자 작업가능상태 점검)를 엑셀 파일로 다운로드
 */
export async function downloadTBMWorkerSignatureExcel(
  entries: TBMWorkerSignatureEntry[],
  meetingDate: string,   // 'YYYY-MM-DD'
  filename?: string
): Promise<void> {
  const workbook = new ExcelJS.Workbook()
  const ws = workbook.addWorksheet('일일안전교육 서명부', {
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0, // 서명 인원이 많으면 세로로 자연 페이지 나눔 (압축 방지)
      horizontalCentered: true,
      margins: {
        left: 0.5,
        right: 0.5,
        top: 0.4,
        bottom: 0.4,
        header: 0.2,
        footer: 0.2,
      },
    },
  })

  // 열 너비 설정 (9열, A~I)
  ws.columns = [
    { width: 5 },  // A - NO.
    { width: 12 }, // B - 성 명
    { width: 11 }, // C - TBM 위.평확인
    { width: 9 },  // D - 음주여부
    { width: 10 }, // E - 혈압여부
    { width: 10 }, // F - 보호구 착용여부
    { width: 10 }, // G - CCTV 촬영동의
    { width: 10 }, // H - 몸(부상) 여부
    { width: 14 }, // I - 서 명
  ]

  let row = 1

  // ===== 제목 =====
  ws.mergeCells(`A${row}:I${row}`)
  const titleCell = ws.getCell(`A${row}`)
  titleCell.value = '일일안전교육 서명부'
  titleCell.font = { size: 16, bold: true }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(row).height = 32
  row++

  // ===== 부제 =====
  ws.mergeCells(`A${row}:I${row}`)
  const subtitleCell = ws.getCell(`A${row}`)
  subtitleCell.value = '작업장 출입 전 근로자 작업가능상태 점검'
  subtitleCell.font = { size: 12, bold: true }
  subtitleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  // 셀 하단 medium border(밑줄 효과) - 병합 셀 전체에 적용
    ;['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'].forEach((col) => {
      ws.getCell(`${col}${row}`).border = {
        bottom: { style: 'medium', color: { argb: 'FF000000' } },
      }
    })
  ws.getRow(row).height = 24
  row++

  // ===== 빈 행 =====
  ws.getRow(row).height = 8
  row++

  // ===== 일자 =====
  ws.mergeCells(`A${row}:I${row}`)
  const dateCell = ws.getCell(`A${row}`)
  const dow = meetingDate ? getDayOfWeek(meetingDate) : ''
  dateCell.value = `일자: ${meetingDate}(${dow})`
  dateCell.font = { size: 11, bold: true }
  dateCell.alignment = { horizontal: 'left', vertical: 'middle' }
  ws.getRow(row).height = 20
  row++

  // ===== 표 헤더 =====
  const headers = [
    'NO.',
    '성 명',
    'TBM\n위.평확인',
    '음주여부',
    '혈압여부',
    '보호구\n착용여부',
    'CCTV\n촬영동의',
    '몸(부상)\n여 부',
    '서 명',
  ]
  const headerCols = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']
  headerCols.forEach((col, i) => {
    const cell = ws.getCell(`${col}${row}`)
    cell.value = headers[i]
    cell.font = { bold: true, size: 10 }
    cell.fill = headerFill
    cell.border = allBorders
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  })
  ws.getRow(row).height = 30
  row++

  // ===== 데이터 행 =====
  const dataRowCount = Math.max(entries.length, 15)
  const dataStartRow = row
  for (let i = 0; i < dataRowCount; i++) {
    const entry = entries[i]
    const values = entry
      ? [
          i + 1,
          entry.worker_name,
          entry.tbm_confirmed ? '확인' : '',
          entry.no_alcohol ? 'X' : '',
          entry.blood_pressure_ok ? '150미만' : '',
          entry.ppe_worn ? '착용' : '',
          entry.cctv_consent ? '동의' : '',
          entry.body_ok ? '이상없음' : '',
          '',
        ]
      : ['', '', '', '', '', '', '', '', '']

    headerCols.forEach((col, c) => {
      const cell = ws.getCell(`${col}${row}`)
      cell.value = values[c]
      cell.font = { size: 10 }
      cell.border = allBorders
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
    })
    ws.getRow(row).height = 30
    row++
  }

  // ===== 표 아래 주석 =====
  const notes = [
    '※ 작업가능 혈압 : 수축기 150미만, 단, 의사 소견서 첨부 시 작업 가능(심혈관질환자포함)',
    '    CCTV 촬영 : 근로자 재해예방 목적의 안전관리 모니터링 CCTV 촬영(개인정보 보호법 제15조 1항)',
  ]
  notes.forEach((note) => {
    ws.mergeCells(`A${row}:I${row}`)
    const noteCell = ws.getCell(`A${row}`)
    noteCell.value = note
    noteCell.font = { size: 9, color: { argb: 'FF444444' } }
    noteCell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }
    ws.getRow(row).height = 16
    row++
  })

  // ===== 서명 이미지 삽입 =====
  for (let i = 0; i < entries.length; i++) {
    const sig = entries[i]?.signature
    if (sig && sig.startsWith('data:image')) {
      try {
        const base64Data = sig.split(',')[1]
        const imageId = workbook.addImage({
          base64: base64Data,
          extension: 'png',
        })
        ws.addImage(imageId, {
          tl: { col: 8, row: dataStartRow + i - 1 },
          ext: { width: 70, height: 26 },
        })
      } catch {
        // 이미지 삽입 실패 시 무시
      }
    }
  }

  // ===== 파일 다운로드 =====
  const finalFilename = filename || `일일안전교육서명부_${meetingDate}.xlsx`

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = finalFilename
  link.click()
  window.URL.revokeObjectURL(url)
}
