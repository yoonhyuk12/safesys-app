import ExcelJS from 'exceljs'

interface WorkerEntry {
  job_type: string
  name: string
  signature?: string
}

interface MentorEntry {
  affiliation: string
  position: string
  name: string
}

interface MentorSignature {
  name: string
  signature: string
}

interface OrientationRecord {
  id: string
  orientation_date: string
  start_time: string
  end_time: string
  location: string
  workers: WorkerEntry[]
  mentors: MentorEntry[]
  main_work_types: string[]
  risk_factors: string[]
  mentor_signatures: MentorSignature[]
  manager_name: string
  manager_signature: string
}

const thin: ExcelJS.Border = { style: 'thin' }
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
 * 신규근로자 현장안내 일지를 엑셀 파일로 다운로드
 */
export async function downloadNewWorkerOrientationExcel(
  record: OrientationRecord,
  projectName: string,
  filename?: string
) {
  const workbook = new ExcelJS.Workbook()
  const ws = workbook.addWorksheet('신규근로자 현장안내 일지', {
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
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

  // 열 너비 설정 (8열)
  ws.columns = [
    { width: 14 }, // A - 라벨
    { width: 12 }, // B
    { width: 14 }, // C
    { width: 12 }, // D
    { width: 6 },  // E - 구분
    { width: 14 }, // F
    { width: 14 }, // G
    { width: 12 }, // H
  ]

  // 멘토/서명 수 계산
  const mentors = record.mentors || []
  const mentorCount = Math.max(mentors.length, 1)
  const mentorSigs = record.mentor_signatures || []
  const mentorSigCount = Math.max(mentorSigs.length, 1)

  // 전체 행 수 계산
  // 참고(1) + 제목(1) + 날짜(1) + 사업명(1) + 시간장소(1) + 멘티헤더(1) + 컬럼헤더(1) + 근로자(4) + 멘토(mentorCount) + 주요공종(5) + 위험요소(5) + 빈줄(1) + 확인문구(1) + 서명(mentorSigCount) + 빈줄(1) + 확인자(1)
  const totalRows = 1 + 1 + 1 + 1 + 1 + 1 + 1 + 4 + mentorCount + 5 + 5 + 1 + 1 + mentorSigCount + 1 + 1

  // A4 세로 사용 가능 높이 (포인트): 297mm - 상하마진(0.4+0.4 inch = 20.32mm) ≈ 276.7mm ≈ 784pt
  const A4_USABLE_HEIGHT = 784
  // 고정 높이 행들
  const TITLE_HEIGHT = 32
  const HEADER_HEIGHT = 20
  const CONFIRM_HEIGHT = 28
  // 나머지 행들에 균등 배분
  const fixedHeightRows = 3 // 제목, 참고, 확인문구
  const fixedTotal = TITLE_HEIGHT + HEADER_HEIGHT + CONFIRM_HEIGHT
  const flexibleRows = totalRows - fixedHeightRows
  const flexRowHeight = Math.floor((A4_USABLE_HEIGHT - fixedTotal) / flexibleRows)

  let row = 1

  // ===== 참고 텍스트 =====
  ws.mergeCells(`A${row}:H${row}`)
  const refCell = ws.getCell(`A${row}`)
  refCell.value = '<참고> 신규근로자 현장안내(1시간 둘러보기) 일지'
  refCell.font = { size: 10, color: { argb: 'FF666666' } }
  refCell.alignment = { horizontal: 'left', vertical: 'middle' }
  ws.getRow(row).height = HEADER_HEIGHT
  row++

  // ===== 제목 =====
  ws.mergeCells(`A${row}:H${row}`)
  const titleCell = ws.getCell(`A${row}`)
  titleCell.value = '신규근로자 현장안내(1시간 둘러보기) 일지'
  titleCell.font = { size: 16, bold: true }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(row).height = TITLE_HEIGHT
  row++

  // ===== 날짜 =====
  ws.mergeCells(`A${row}:H${row}`)
  const dateCell = ws.getCell(`A${row}`)
  const y = record.orientation_date ? record.orientation_date.substring(0, 4) : ''
  const m = record.orientation_date ? record.orientation_date.substring(5, 7) : ''
  const d = record.orientation_date ? record.orientation_date.substring(8, 10) : ''
  const dow = record.orientation_date ? getDayOfWeek(record.orientation_date) : ''
  dateCell.value = `${y} 년  ${m} 월  ${d} 일 (${dow})`
  dateCell.font = { size: 11 }
  dateCell.alignment = { horizontal: 'right', vertical: 'middle' }
  ws.getRow(row).height = flexRowHeight
  row++

  // ===== 사업명 =====
  const projLabel = ws.getCell(`A${row}`)
  projLabel.value = '■ 사업명'
  projLabel.font = { bold: true, size: 10 }
  projLabel.fill = headerFill
  projLabel.border = allBorders
  projLabel.alignment = { vertical: 'middle' }

  ws.mergeCells(`B${row}:H${row}`)
  const projValue = ws.getCell(`B${row}`)
  projValue.value = projectName
  projValue.font = { size: 10 }
  projValue.border = allBorders
  projValue.alignment = { vertical: 'middle' }
  ws.getRow(row).height = flexRowHeight
  row++

  // ===== 시간 + 장소 =====
  const timeLabel = ws.getCell(`A${row}`)
  timeLabel.value = '■ 시  간'
  timeLabel.font = { bold: true, size: 10 }
  timeLabel.fill = headerFill
  timeLabel.border = allBorders
  timeLabel.alignment = { vertical: 'middle' }

  ws.mergeCells(`B${row}:D${row}`)
  const timeValue = ws.getCell(`B${row}`)
  timeValue.value = `${record.start_time || ''} ~ ${record.end_time || ''}`
  timeValue.font = { size: 10 }
  timeValue.border = allBorders
  timeValue.alignment = { horizontal: 'center', vertical: 'middle' }

  const locLabel = ws.getCell(`E${row}`)
  locLabel.value = '■ 장 소'
  locLabel.font = { bold: true, size: 10 }
  locLabel.fill = headerFill
  locLabel.border = allBorders
  locLabel.alignment = { vertical: 'middle' }

  ws.mergeCells(`F${row}:H${row}`)
  const locValue = ws.getCell(`F${row}`)
  locValue.value = record.location || ''
  locValue.font = { size: 10 }
  locValue.border = allBorders
  locValue.alignment = { vertical: 'middle' }
  ws.getRow(row).height = flexRowHeight
  row++

  // ===== 신규근로자(멘티) 헤더 =====
  ws.mergeCells(`A${row}:H${row}`)
  const workerHeader = ws.getCell(`A${row}`)
  workerHeader.value = '■ 신규근로자(멘티)'
  workerHeader.font = { bold: true, size: 10 }
  workerHeader.fill = headerFill
  workerHeader.border = allBorders
  workerHeader.alignment = { vertical: 'middle' }
  ws.getRow(row).height = flexRowHeight
  row++

  // 컬럼 헤더: 직종 | 성명 | 직종 | 성명 (각 2컬럼씩 동일 폭)
  ws.mergeCells(`A${row}:B${row}`)
  ws.getCell(`A${row}`).value = '직종'
  ws.mergeCells(`C${row}:D${row}`)
  ws.getCell(`C${row}`).value = '성명'
  ws.mergeCells(`E${row}:F${row}`)
  ws.getCell(`E${row}`).value = '직종'
  ws.mergeCells(`G${row}:H${row}`)
  ws.getCell(`G${row}`).value = '성명'
  ;['A', 'C', 'E', 'G'].forEach((col) => {
    const cell = ws.getCell(`${col}${row}`)
    cell.font = { bold: true, size: 10 }
    cell.fill = headerFill
    cell.border = allBorders
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
  })
  ws.getCell(`B${row}`).border = allBorders
  ws.getCell(`D${row}`).border = allBorders
  ws.getCell(`F${row}`).border = allBorders
  ws.getCell(`H${row}`).border = allBorders
  ws.getRow(row).height = flexRowHeight
  row++

  // 근로자 데이터 (4행 x 2열)
  const workers = record.workers || []
  const workerStartRow = row
  for (let i = 0; i < 4; i++) {
    const leftWorker = workers[i] || { job_type: '', name: '' }
    const rightWorker = workers[i + 4] || { job_type: '', name: '' }

    ws.mergeCells(`A${row}:B${row}`)
    ws.getCell(`A${row}`).value = leftWorker.job_type || ''
    ws.getCell(`A${row}`).border = allBorders
    ws.getCell(`A${row}`).font = { size: 10 }
    ws.getCell(`A${row}`).alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getCell(`B${row}`).border = allBorders

    ws.mergeCells(`C${row}:D${row}`)
    ws.getCell(`C${row}`).value = leftWorker.name ? `${leftWorker.name}  (서명)` : ''
    ws.getCell(`C${row}`).border = allBorders
    ws.getCell(`C${row}`).font = { size: 10 }
    ws.getCell(`C${row}`).alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getCell(`D${row}`).border = allBorders

    ws.mergeCells(`E${row}:F${row}`)
    ws.getCell(`E${row}`).value = rightWorker.job_type || ''
    ws.getCell(`E${row}`).border = allBorders
    ws.getCell(`E${row}`).font = { size: 10 }
    ws.getCell(`E${row}`).alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getCell(`F${row}`).border = allBorders

    ws.mergeCells(`G${row}:H${row}`)
    ws.getCell(`G${row}`).value = rightWorker.name ? `${rightWorker.name}  (서명)` : ''
    ws.getCell(`G${row}`).border = allBorders
    ws.getCell(`G${row}`).font = { size: 10 }
    ws.getCell(`G${row}`).alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getCell(`H${row}`).border = allBorders

    ws.getRow(row).height = flexRowHeight
    row++
  }

  // ===== 현장안내자(멘토) =====
  const mentorStartRow = row
  if (mentorCount > 1) {
    ws.mergeCells(`A${mentorStartRow}:A${mentorStartRow + mentorCount - 1}`)
  }
  const mentorLabel = ws.getCell(`A${mentorStartRow}`)
  mentorLabel.value = '■ 현장안내자\n  (멘토)'
  mentorLabel.font = { bold: true, size: 10 }
  mentorLabel.fill = headerFill
  mentorLabel.border = allBorders
  mentorLabel.alignment = { vertical: 'middle', wrapText: true }

  for (let i = 0; i < mentorCount; i++) {
    const mentor = mentors[i] || { affiliation: '', position: '', name: '' }
    ws.mergeCells(`B${row}:C${row}`)
    ws.getCell(`B${row}`).value = `· 소속: ${mentor.affiliation || ''}`
    ws.getCell(`B${row}`).border = allBorders
    ws.getCell(`B${row}`).font = { size: 10 }
    ws.getCell(`B${row}`).alignment = { vertical: 'middle' }
    ws.getCell(`C${row}`).border = allBorders

    ws.mergeCells(`D${row}:F${row}`)
    ws.getCell(`D${row}`).value = `·직책: ${mentor.position || ''}`
    ws.getCell(`D${row}`).border = allBorders
    ws.getCell(`D${row}`).font = { size: 10 }
    ws.getCell(`D${row}`).alignment = { vertical: 'middle' }
    ws.getCell(`F${row}`).border = allBorders

    ws.mergeCells(`G${row}:H${row}`)
    ws.getCell(`G${row}`).value = `·성명: ${mentor.name || ''}`
    ws.getCell(`G${row}`).border = allBorders
    ws.getCell(`G${row}`).font = { size: 10 }
    ws.getCell(`G${row}`).alignment = { vertical: 'middle' }
    ws.getCell(`H${row}`).border = allBorders

    ws.getCell(`A${row}`).border = allBorders
    ws.getRow(row).height = flexRowHeight
    row++
  }

  // ===== 주요공종 =====
  const mainWorkTypes = record.main_work_types || []
  const workTypeStartRow = row
  ws.mergeCells(`A${workTypeStartRow}:A${workTypeStartRow + 4}`)
  const workTypeLabel = ws.getCell(`A${workTypeStartRow}`)
  workTypeLabel.value = '■ 주요공종'
  workTypeLabel.font = { bold: true, size: 10 }
  workTypeLabel.fill = headerFill
  workTypeLabel.border = allBorders
  workTypeLabel.alignment = { vertical: 'middle', wrapText: true }

  for (let i = 0; i < 5; i++) {
    ws.mergeCells(`B${row}:H${row}`)
    ws.getCell(`B${row}`).value = mainWorkTypes[i] ? `· ${mainWorkTypes[i]}` : '·'
    ws.getCell(`B${row}`).border = allBorders
    ws.getCell(`B${row}`).font = { size: 10 }
    ws.getCell(`B${row}`).alignment = { vertical: 'middle' }
    ws.getCell(`H${row}`).border = allBorders
    ws.getCell(`A${row}`).border = allBorders
    ws.getRow(row).height = flexRowHeight
    row++
  }

  // ===== 현장 내 위험요소 =====
  const riskFactors = record.risk_factors || []
  const riskStartRow = row
  ws.mergeCells(`A${riskStartRow}:A${riskStartRow + 4}`)
  const riskLabel = ws.getCell(`A${riskStartRow}`)
  riskLabel.value = '■ 현장 내\n  위험요소'
  riskLabel.font = { bold: true, size: 10 }
  riskLabel.fill = headerFill
  riskLabel.border = allBorders
  riskLabel.alignment = { vertical: 'middle', wrapText: true }

  const circleNumbers = ['①', '②', '③', '④', '⑤']
  for (let i = 0; i < 5; i++) {
    ws.mergeCells(`B${row}:H${row}`)
    ws.getCell(`B${row}`).value = `${circleNumbers[i]} ${riskFactors[i] || ''}`
    ws.getCell(`B${row}`).border = allBorders
    ws.getCell(`B${row}`).font = { size: 10 }
    ws.getCell(`B${row}`).alignment = { vertical: 'middle' }
    ws.getCell(`H${row}`).border = allBorders
    ws.getCell(`A${row}`).border = allBorders
    ws.getRow(row).height = flexRowHeight
    row++
  }

  // ===== 확인 문구 =====
  ws.mergeCells(`A${row}:H${row}`)
  const confirmCell = ws.getCell(`A${row}`)
  confirmCell.value = '신규근로자를 대상으로 위 내용과 같이 현장안내를 실시 하였음을 확인합니다.'
  confirmCell.font = { size: 10 }
  confirmCell.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(row).height = CONFIRM_HEIGHT
  row++

  // ===== 서명란 =====
  // 현장안내자 서명
  const sigStartRow = row
  for (let i = 0; i < mentorSigCount; i++) {
    const sig = mentorSigs[i]
    if (i === 0) {
      ws.mergeCells(`A${row}:D${row}`)
      ws.getCell(`A${row}`).value = '현장안내자'
      ws.getCell(`A${row}`).font = { bold: true, size: 10 }
      ws.getCell(`A${row}`).alignment = { horizontal: 'right', vertical: 'middle' }
    }
    ws.mergeCells(`E${row}:G${row}`)
    ws.getCell(`E${row}`).value = sig?.name || '○ ○ ○'
    ws.getCell(`E${row}`).font = { size: 10 }
    ws.getCell(`E${row}`).alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getCell(`H${row}`).value = '(서명)'
    ws.getCell(`H${row}`).font = { size: 10 }
    ws.getCell(`H${row}`).alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getRow(row).height = flexRowHeight
    row++
  }

  // 빈 줄
  ws.getRow(row).height = flexRowHeight
  row++

  // 확인자(관리자) 서명
  const managerSigRow = row
  ws.mergeCells(`A${row}:D${row}`)
  ws.getCell(`A${row}`).value = '확인자(관리자)'
  ws.getCell(`A${row}`).font = { bold: true, size: 10 }
  ws.getCell(`A${row}`).alignment = { horizontal: 'right', vertical: 'middle' }
  ws.mergeCells(`E${row}:G${row}`)
  ws.getCell(`E${row}`).value = record.manager_name || '○ ○ ○'
  ws.getCell(`E${row}`).font = { size: 10 }
  ws.getCell(`E${row}`).alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getCell(`H${row}`).value = '(서명)'
  ws.getCell(`H${row}`).font = { size: 10 }
  ws.getCell(`H${row}`).alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(row).height = flexRowHeight

  // ===== 서명 이미지 삽입 =====
  // 근로자 서명 이미지
  for (let i = 0; i < workers.length; i++) {
    if (workers[i]?.signature && workers[i].signature!.startsWith('data:image')) {
      try {
        const base64Data = workers[i].signature!.split(',')[1]
        const imageId = workbook.addImage({
          base64: base64Data,
          extension: 'png',
        })
        // 왼쪽(0~3) → D열(col 3), 오른쪽(4~7) → H열(col 7)
        const isRight = i >= 4
        const rowOffset = isRight ? i - 4 : i
        ws.addImage(imageId, {
          tl: { col: isRight ? 7 : 3, row: workerStartRow + rowOffset - 1 },
          ext: { width: 60, height: 24 },
        })
      } catch {
        // 이미지 삽입 실패 시 무시
      }
    }
  }

  // 멘토 서명 이미지
  for (let i = 0; i < mentorSigs.length; i++) {
    if (mentorSigs[i]?.signature && mentorSigs[i].signature.startsWith('data:image')) {
      try {
        const base64Data = mentorSigs[i].signature.split(',')[1]
        const imageId = workbook.addImage({
          base64: base64Data,
          extension: 'png',
        })
        ws.addImage(imageId, {
          tl: { col: 7, row: sigStartRow + i - 1 },
          ext: { width: 80, height: 30 },
        })
      } catch {
        // 이미지 삽입 실패 시 무시
      }
    }
  }

  if (record.manager_signature && record.manager_signature.startsWith('data:image')) {
    try {
      const base64Data = record.manager_signature.split(',')[1]
      const imageId = workbook.addImage({
        base64: base64Data,
        extension: 'png',
      })
      ws.addImage(imageId, {
        tl: { col: 7, row: managerSigRow - 1 },
        ext: { width: 80, height: 30 },
      })
    } catch {
      // 이미지 삽입 실패 시 무시
    }
  }

  // ===== 파일 다운로드 =====
  const dateStr = record.orientation_date || new Date().toISOString().split('T')[0]
  const finalFilename = filename || `신규근로자현장안내_${dateStr}.xlsx`

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
