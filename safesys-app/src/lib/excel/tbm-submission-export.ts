import ExcelJS from 'exceljs'
import type { TBMSubmissionFormData } from '@/lib/reports/tbm-submission-report'

// A4 인쇄 가능 높이 (points)
// A4 = 297mm = 11.693in, 마진(top 0.4 + bottom 0.2 + header 0.1 + footer 0.1 = 0.8in)
// 인쇄 가능 = (11.693 - 0.8) × 72pt/in ≈ 784pt
const A4_PRINTABLE_HEIGHT = 784
const A4_PAGE_WIDTH_POINTS = 8.267 * 72
const EXCEL_DEFAULT_COLUMN_WIDTH = 8.43

function columnWidthToPoints(width: number): number {
  // Excel column width unit -> pixel 근사 공식(OpenXML 관례) -> points(72dpi 기준)
  const pixels = Math.floor(((256 * width + Math.floor(128 / 7)) / 256) * 7)
  return (pixels * 72) / 96
}

function getWidthScaleForFitToPage(ws: ExcelJS.Worksheet): number {
  const margins = ws.pageSetup.margins || {}
  const leftMargin = margins.left ?? 0.7
  const rightMargin = margins.right ?? 0.7

  const printableWidth = A4_PAGE_WIDTH_POINTS - (leftMargin + rightMargin) * 72
  const sheetWidth = ws.columns.reduce((sum, col) => {
    const width = typeof col.width === 'number' ? col.width : EXCEL_DEFAULT_COLUMN_WIDTH
    return sum + columnWidthToPoints(width)
  }, 0)

  if (printableWidth <= 0 || sheetWidth <= 0) return 1
  return Math.min(1, printableWidth / sheetWidth)
}

function sanitizeSheetName(rawName: string): string {
  const fallback = 'TBM회의록'
  const trimmed = (rawName || '').trim()
  const normalized = (trimmed || fallback).replace(/[\\/*?:[\]]/g, '_')
  return normalized.slice(0, 31) || fallback
}

function buildUniqueSheetName(rawName: string, usedNames: Set<string>): string {
  const base = sanitizeSheetName(rawName)
  if (!usedNames.has(base)) {
    usedNames.add(base)
    return base
  }

  let index = 2
  while (true) {
    const suffix = ` (${index})`
    const candidate = `${base.slice(0, Math.max(0, 31 - suffix.length))}${suffix}`
    if (!usedNames.has(candidate)) {
      usedNames.add(candidate)
      return candidate
    }
    index += 1
  }
}

function downloadWorkbook(workbook: ExcelJS.Workbook, filename: string) {
  return workbook.xlsx.writeBuffer().then(buffer => {
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    window.URL.revokeObjectURL(url)
  })
}

async function fetchImageAsBase64(url: string): Promise<{ base64: string; extension: 'png' | 'jpeg' } | null> {
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    const blob = await response.blob()
    const arrayBuffer = await blob.arrayBuffer()
    const uint8Array = new Uint8Array(arrayBuffer)
    let binary = ''
    for (let i = 0; i < uint8Array.length; i++) {
      binary += String.fromCharCode(uint8Array[i])
    }
    return { base64: btoa(binary), extension: blob.type?.includes('png') ? 'png' : 'jpeg' }
  } catch (e) {
    console.error('이미지 로드 실패:', e)
    return null
  }
}

/**
 * TBM 제출 보고서를 엑셀 파일로 다운로드 (A4 한 장 꽉 차게)
 */
export async function downloadTBMSubmissionExcel(
  formData: TBMSubmissionFormData,
  filename?: string,
  options?: {
    workbook?: ExcelJS.Workbook
    sheetName?: string
    skipDownload?: boolean
  }
) {
  const workbook = options?.workbook || new ExcelJS.Workbook()
  const ws = workbook.addWorksheet(options?.sheetName || 'TBM회의록', {
    pageSetup: {
      paperSize: 9,
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      horizontalCentered: true,
      verticalCentered: true,
      margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.2, header: 0.1, footer: 0.1 }
    }
  })

  const contentColumnWidth = (14 * 8 - 7 * 2) / 6
  ws.columns = [
    { width: 7 },
    { width: 7 },
    ...Array.from({ length: 6 }, () => ({ width: contentColumnWidth }))
  ]

  const thin: ExcelJS.Border = { style: 'thin', color: { argb: 'FF000000' } }
  const allBorders: Partial<ExcelJS.Borders> = { top: thin, bottom: thin, left: thin, right: thin }
  const headerFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } }

  const boldFont: Partial<ExcelJS.Font> = { bold: true, size: 10, name: '맑은 고딕' }
  const normalFont: Partial<ExcelJS.Font> = { size: 10, name: '맑은 고딕' }
  const titleFont: Partial<ExcelJS.Font> = { bold: true, size: 16, name: '맑은 고딕' }

  const centerAlign: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle', wrapText: true }
  const leftAlign: Partial<ExcelJS.Alignment> = { horizontal: 'left', vertical: 'middle', wrapText: true }
  const topLeftAlign: Partial<ExcelJS.Alignment> = { horizontal: 'left', vertical: 'top', wrapText: true }

  // 이미지 사전 로드
  const [photoImage, signatureImage] = await Promise.all([
    formData.photo ? fetchImageAsBase64(formData.photo) : null,
    formData.signature ? fetchImageAsBase64(formData.signature) : null
  ])

  // 행 높이 추적 (행번호 → { height, expandable })
  // expandable: 남는 공간을 채울 수 있는 데이터 행
  const rowHeights: Map<number, { height: number; expandable: boolean }> = new Map()
  const setRowH = (row: number, height: number, expandable = false) => {
    ws.getRow(row).height = height
    rowHeights.set(row, { height, expandable })
  }

  let r = 1

  // ──── 법조문 ────
  ws.mergeCells(r, 1, r, 8)
  const lawCell = ws.getCell(r, 1)
  lawCell.value = '건설기술 진흥법 시행령 103조(안전교육) 제3항에 따른 안전교육내용 기록'
  lawCell.font = { size: 7, name: '맑은 고딕', color: { argb: 'FF333333' } }
  lawCell.alignment = { horizontal: 'left', vertical: 'bottom' }
  setRowH(r, 14)
  r++

  // ──── 제목 ────
  ws.mergeCells(r, 1, r, 8)
  const titleCell = ws.getCell(r, 1)
  titleCell.value = 'Tool Box Meeting 회의록'
  titleCell.font = titleFont
  titleCell.alignment = centerAlign
  titleCell.border = { bottom: { style: 'medium', color: { argb: 'FF000000' } } }
  setRowH(r, 36)
  r++

  // ──── TBM리더 ────
  const leaderRow = r
  ws.mergeCells(r, 1, r, 2)
  ws.mergeCells(r, 3, r, 5)
  setCellStyle(ws, r, 1, 'TBM리더', boldFont, centerAlign, headerFill, allBorders)
  setCellStyle(ws, r, 3, `◆ 소속 : ${formData.constructionCompany || ''}`, normalFont, leftAlign, undefined, allBorders)
  setCellStyle(ws, r, 6, '이름', boldFont, centerAlign, headerFill, allBorders)
  setCellStyle(ws, r, 7, `${formData.name || ''}`, normalFont, centerAlign, undefined, allBorders)
  setCellStyle(ws, r, 8, signatureImage ? '' : '(서명)', normalFont, centerAlign, undefined, allBorders)
  setRowH(r, 30)
  if (signatureImage) {
    const sigId = workbook.addImage({ base64: signatureImage.base64, extension: signatureImage.extension })
    ws.addImage(sigId, { tl: { col: 7, row: leaderRow - 1 } as any, br: { col: 8, row: leaderRow } as any })
  }
  r++

  // ──── TBM 일시 ────
  ws.mergeCells(r, 1, r, 2); ws.mergeCells(r, 3, r, 8)
  setCellStyle(ws, r, 1, 'TBM 일시', boldFont, centerAlign, headerFill, allBorders)
  setCellStyle(ws, r, 3, `${formData.educationDate || ''} ${formData.educationStartTime || ''} (20분) 작업 날짜와 동일함`, normalFont, leftAlign, undefined, allBorders)
  setRowH(r, 26)
  r++

  // ──── 작업명 ────
  ws.mergeCells(r, 1, r, 2); ws.mergeCells(r, 3, r, 8)
  setCellStyle(ws, r, 1, '작업명', boldFont, centerAlign, headerFill, allBorders)
  setCellStyle(ws, r, 3, `${formData.projectName || ''} (${formData.headquarters || ''}-${formData.branch || ''})`, normalFont, leftAlign, undefined, allBorders)
  setRowH(r, 26)
  r++

  // ──── 작업내용 (expandable) ────
  const workContentRow = r
  ws.mergeCells(r, 1, r, 2); ws.mergeCells(r, 3, r, 8)
  setCellStyle(ws, r, 1, '작업내용', boldFont, centerAlign, headerFill, allBorders)
  setCellStyle(ws, r, 3, formData.todayWork || '', normalFont, topLeftAlign, undefined, allBorders)
  const workLines = (formData.todayWork || '').split('\n').length
  setRowH(r, Math.max(36, workLines * 15), true)
  r++

  // ──── TBM 장소 ────
  ws.mergeCells(r, 1, r, 2); ws.mergeCells(r, 3, r, 5); ws.mergeCells(r, 7, r, 8)
  setCellStyle(ws, r, 1, 'TBM 장소', boldFont, centerAlign, headerFill, allBorders)
  setCellStyle(ws, r, 3, formData.address || '', normalFont, leftAlign, undefined, allBorders)
  setCellStyle(ws, r, 6, '위험성평가\n실시여부', { ...boldFont, size: 9 }, centerAlign, headerFill, allBorders)
  setCellStyle(ws, r, 7, '예 ☑  아니오 ☐', normalFont, centerAlign, undefined, allBorders)
  setRowH(r, 28)
  r++

  // ──── 잠재위험요인 헤더 ────
  ws.mergeCells(r, 1, r, 4); ws.mergeCells(r, 5, r, 8)
  setCellStyle(ws, r, 1, '잠재위험요인(수시위험성평가와 연계)', boldFont, centerAlign, headerFill, allBorders)
  setCellStyle(ws, r, 5, '대책(제거>대체>통제 순서고려)', boldFont, centerAlign, headerFill, allBorders)
  setRowH(r, 24)
  r++

  // ──── 잠재위험요인 1~3 ────
  const risks = [
    { risk: formData.potentialRisk1, solution: formData.solution1 },
    { risk: formData.potentialRisk2, solution: formData.solution2 },
    { risk: formData.potentialRisk3, solution: formData.solution3 },
  ]
  risks.forEach((item, idx) => {
    ws.mergeCells(r, 1, r, 4); ws.mergeCells(r, 5, r, 8)
    setCellStyle(ws, r, 1, `${idx + 1}. ${(item.risk || '').trim()}`, normalFont, leftAlign, undefined, allBorders)
    setCellStyle(ws, r, 5, `${idx + 1}. ${(item.solution || '').trim()}`, normalFont, leftAlign, undefined, allBorders)
    setRowH(r, 24)
    r++
  })

  // ──── 중점위험요인 ────
  ws.mergeCells(r, 1, r, 2); ws.mergeCells(r, 3, r, 5); ws.mergeCells(r, 6, r, 8)
  setCellStyle(ws, r, 1, '중점위험\n요인', boldFont, centerAlign, headerFill, allBorders)
  setCellStyle(ws, r, 3, `선정: ${(formData.mainRiskSelection || '').trim()}`, normalFont, leftAlign, undefined, allBorders)
  setCellStyle(ws, r, 6, `대책: ${(formData.mainRiskSolution || '').trim()}`, normalFont, leftAlign, undefined, allBorders)
  setRowH(r, 30)
  r++

  // ──── 안전조치 확인 헤더 ────
  ws.mergeCells(r, 1, r, 8)
  setCellStyle(ws, r, 1, '■ 작업 전 안전조치 확인 ※ 위 잠재위험요인(중점위험 포함) 안전조치 여부 재확인', boldFont, leftAlign, headerFill, allBorders)
  setRowH(r, 24)
  r++

  // ──── 잠재위험요소 헤더 ────
  ws.mergeCells(r, 1, r, 6); ws.mergeCells(r, 7, r, 8)
  setCellStyle(ws, r, 1, '잠재위험요소(중점위험 포함)', boldFont, centerAlign, headerFill, allBorders)
  setCellStyle(ws, r, 7, '조치여부', boldFont, centerAlign, headerFill, allBorders)
  setRowH(r, 24)
  r++

  // ──── 잠재위험요소 1~3 ────
  const riskFactors = [formData.riskFactor1, formData.riskFactor2, formData.riskFactor3]
  riskFactors.forEach((factor, idx) => {
    ws.mergeCells(r, 1, r, 6); ws.mergeCells(r, 7, r, 8)
    setCellStyle(ws, r, 1, `${idx + 1}. ${(factor || '').trim()}`, normalFont, leftAlign, undefined, allBorders)
    setCellStyle(ws, r, 7, '예 ☑ 아니오 ☐', normalFont, centerAlign, undefined, allBorders)
    setRowH(r, 24)
    r++
  })

  // ──── 일일안전점검 ────
  ws.mergeCells(r, 1, r, 8)
  setCellStyle(ws, r, 1, '■ 작업 전 일일 안전점검 시행 결과 ※ 공사현장 일일안전점검을 통해 위험성평가 이행 확인', boldFont, leftAlign, headerFill, allBorders)
  setRowH(r, 24)
  r++

  // ──── 기타사항 헤더 ────
  ws.mergeCells(r, 1, r, 8)
  setCellStyle(ws, r, 1, '■ 기타사항(교육내용, 제안제도, 아차사고 등)', boldFont, leftAlign, headerFill, allBorders)
  setRowH(r, 24)
  r++

  // ──── 기타사항 내용 (expandable) ────
  const remarksRow = r
  ws.mergeCells(r, 1, r, 8)
  const otherRemarks = (formData.otherRemarks || '').trimStart()
  setCellStyle(ws, r, 1, otherRemarks, normalFont, topLeftAlign, undefined, allBorders)
  const remarksLines = otherRemarks.split('\n').length
  setRowH(r, Math.max(40, remarksLines * 15), true)
  r++

  // ──── 사진/투입 헤더 ────
  ws.mergeCells(r, 1, r, 3); ws.mergeCells(r, 4, r, 5); ws.mergeCells(r, 6, r, 8)
  setCellStyle(ws, r, 1, 'TBM 실시사진', boldFont, centerAlign, headerFill, allBorders)
  setCellStyle(ws, r, 4, '투입인원', boldFont, centerAlign, headerFill, allBorders)
  setCellStyle(ws, r, 6, '투입장비', boldFont, centerAlign, headerFill, allBorders)
  setRowH(r, 24)
  r++

  // ──── 사진/투입 데이터 (expandable) ────
  const photoDataRow = r
  ws.mergeCells(r, 1, r, 3); ws.mergeCells(r, 4, r, 5); ws.mergeCells(r, 6, r, 8)

  let personnelText = (formData.personnelInput || '').trimStart()
  if (formData.newWorkerCount && formData.newWorkerCount !== '0') {
    personnelText += personnelText ? `\n\n신규근로자: ${formData.newWorkerCount}명` : `신규근로자: ${formData.newWorkerCount}명`
  }

  if (photoImage) {
    setCellStyle(ws, r, 1, '', normalFont, centerAlign, undefined, allBorders)
  } else {
    setCellStyle(ws, r, 1, '사진 없음', { ...normalFont, color: { argb: 'FF999999' } }, centerAlign, undefined, allBorders)
  }
  setCellStyle(ws, r, 4, personnelText, normalFont, topLeftAlign, undefined, allBorders)
  setCellStyle(ws, r, 6, (formData.equipmentInput || '').trimStart(), normalFont, topLeftAlign, undefined, allBorders)
  setRowH(r, photoImage ? 140 : 60, true)
  r++

  // ──── 하단 메모 ────
  ws.mergeCells(r, 1, r, 8)
  const bottomCell = ws.getCell(r, 1)
  bottomCell.value = '붙임) TBM 참여 서명부 _ 작업장 출입 전.후 근로자 작업가능상태 점검'
  bottomCell.font = { ...boldFont, size: 11 }
  bottomCell.alignment = leftAlign
  setRowH(r, 26)
  const totalRows = r

  // 인쇄 영역을 A~H 열로 고정해 불필요한 I열이 포함되지 않도록 보장
  ws.pageSetup.printArea = `A1:H${totalRows}`

  // ═══════════════════════════════════════════════
  // A4 한 장에 꽉 차도록 행 높이 동적 조정
  // ═══════════════════════════════════════════════
  let totalHeight = 0
  rowHeights.forEach(v => { totalHeight += v.height })

  // fitToWidth가 동작하면 시트 전체가 비율 축소되므로, 세로 목표 높이를 역보정
  // (짧은 내용에서 하단 여백이 커지는 현상 완화)
  const widthScale = getWidthScaleForFitToPage(ws)
  const targetHeight = A4_PRINTABLE_HEIGHT / widthScale
  const deficit = targetHeight - totalHeight

  if (deficit > 5) {
    // 남는 공간이 있을 때 → 확장 가능 행에 우선 분배, 부족하면 전체 행에 균일 분배

    const expandableRows: number[] = []
    rowHeights.forEach((v, rowNum) => {
      if (v.expandable) expandableRows.push(rowNum)
    })

    if (expandableRows.length > 0) {
      // 확장 가능 행에 균등 분배
      const extraPerRow = Math.floor(deficit / expandableRows.length)
      let distributed = 0
      expandableRows.forEach(rowNum => {
        const entry = rowHeights.get(rowNum)!
        const newHeight = entry.height + extraPerRow
        ws.getRow(rowNum).height = newHeight
        entry.height = newHeight
        distributed += extraPerRow
      })

      // 나머지 1~2pt는 첫 번째 확장 행에 추가
      const remainder = deficit - distributed
      if (remainder > 0 && expandableRows.length > 0) {
        const firstExp = expandableRows[0]
        const entry = rowHeights.get(firstExp)!
        ws.getRow(firstExp).height = entry.height + remainder
        entry.height += remainder
      }
    } else {
      // 확장 가능 행이 없으면 모든 행에 균일 분배
      const extraPerRow = deficit / totalRows
      rowHeights.forEach((entry, rowNum) => {
        const newHeight = entry.height + extraPerRow
        ws.getRow(rowNum).height = newHeight
        entry.height = newHeight
      })
    }
  }

  // ═══════════════════════════════════════════════
  // 이미지 삽입 (높이 조정 완료 후)
  // ═══════════════════════════════════════════════
  if (photoImage) {
    const photoImgId = workbook.addImage({ base64: photoImage.base64, extension: photoImage.extension })
    ws.addImage(photoImgId, {
      tl: { col: 0, row: photoDataRow - 1 } as any,
      br: { col: 3, row: photoDataRow } as any,
    })
  }

  // 파일 다운로드
  const defaultFilename = `${formData.projectName || '사업명'}_TBM_${formData.educationDate || new Date().toISOString().split('T')[0]}.xlsx`
  const finalFilename = filename || defaultFilename

  if (options?.skipDownload) {
    return workbook
  }

  await downloadWorkbook(workbook, finalFilename)
  return workbook
}

export async function downloadTBMSubmissionBulkExcel(
  items: Array<{ formData: TBMSubmissionFormData; sheetName?: string }>,
  filename?: string,
  options?: {
    onProgress?: (current: number, total: number) => void
  }
) {
  if (items.length === 0) {
    throw new Error('일괄 엑셀 생성 대상이 없습니다.')
  }

  const workbook = new ExcelJS.Workbook()
  const usedSheetNames = new Set<string>()

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const dateLabel = item.formData.educationDate || new Date().toISOString().split('T')[0]
    const defaultSheetName = item.sheetName || `${dateLabel}_${i + 1}`
    const uniqueSheetName = buildUniqueSheetName(defaultSheetName, usedSheetNames)

    await downloadTBMSubmissionExcel(item.formData, undefined, {
      workbook,
      sheetName: uniqueSheetName,
      skipDownload: true
    })

    options?.onProgress?.(i + 1, items.length)
  }

  const first = items[0]?.formData
  const last = items[items.length - 1]?.formData
  const startDate = first?.educationDate || new Date().toISOString().split('T')[0]
  const endDate = last?.educationDate || startDate
  const dateLabel = startDate === endDate ? startDate : `${startDate}_${endDate}`
  const defaultFilename = `${first?.projectName || '사업명'}_TBM_${dateLabel}_일괄.xlsx`
  await downloadWorkbook(workbook, filename || defaultFilename)
}

function setCellStyle(
  ws: ExcelJS.Worksheet,
  row: number,
  col: number,
  value: string,
  font: Partial<ExcelJS.Font>,
  alignment: Partial<ExcelJS.Alignment>,
  fill?: ExcelJS.Fill,
  border?: Partial<ExcelJS.Borders>
) {
  const cell = ws.getCell(row, col)
  cell.value = value
  cell.font = font
  cell.alignment = alignment
  if (fill) cell.fill = fill
  if (border) cell.border = border
}
