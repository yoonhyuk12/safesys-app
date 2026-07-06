// 현장점검 지적사항 조치결과 보고 엑셀 내보내기 — 별지 7호 서식 (지침 제23조, A4 세로 1건 1시트)

import ExcelJS from 'exceljs'
import {
  mergeSet,
  addSignatureImage,
  addPhotoImageInArea,
  headerFill,
  downloadWorkbook,
  formatDateKorean,
} from '@/lib/excel/quality-excel-utils'

export interface IssueActionReportData {
  projectName: string
  contractor: string | null // 수급인
  inspectorName: string | null // 점검자 성명 (소속·직급은 원본 데이터에 없어 공란)
  inspectionDate: string | null // 점검일 YYYY-MM-DD
  actionDate: string | null // 조치완료일 YYYY-MM-DD
  location: string | null // 지적부위
  findingText: string // 시정 전 지적사항
  actionText: string | null // 시정 후 조치내용
  beforePhotoUrl: string | null // 시정 전 사진 URL
  afterPhotoUrl: string | null // 시정 후 사진 URL ('N/A' = 해당없음)
  writerName: string | null // 작성자(현장대리인) 성명
  confirmerName: string | null // 확인자(감독원/건설사업관리기술자) 성명
  contractorSignature: string | null // 작성자 서명 base64
  supervisorSignature: string | null // 확인자 서명 base64
}

export async function downloadIssueActionReportExcel(data: IssueActionReportData): Promise<void> {
  const workbook = new ExcelJS.Workbook()
  const ws = workbook.addWorksheet('조치결과 보고', {
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      horizontalCentered: true,
      margins: { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
    },
  })

  ws.columns = [
    { width: 6 }, // A
    { width: 6 }, // B
    { width: 11 }, // C
    { width: 11 }, // D
    { width: 11 }, // E
    { width: 11 }, // F
    { width: 11 }, // G
    { width: 11 }, // H
  ]

  let r = 1

  mergeSet(ws, `A${r}:E${r}`, '[별지 7호 서식] (지침 제23조와 관련)', {
    size: 9, border: false, align: { horizontal: 'left' },
  })
  ws.getRow(r).height = 18
  r++

  mergeSet(ws, `A${r}:H${r}`, '현장점검 지적사항 조치결과 보고', {
    size: 18, bold: true, border: false, align: { horizontal: 'center' }, underline: true,
  })
  ws.getRow(r).height = 36
  r++

  ws.getRow(r).height = 8
  r++

  // 1~5 기본 정보 (서식은 무테두리 서술형)
  mergeSet(ws, `A${r}:D${r}`, `1. 공사명 : ${data.projectName || ''}`, {
    size: 10, border: false, align: { horizontal: 'left' },
  })
  mergeSet(ws, `E${r}:H${r}`, `2. 수급인 : ${data.contractor || ''}`, {
    size: 10, border: false, align: { horizontal: 'left' },
  })
  ws.getRow(r).height = 22
  r++

  mergeSet(ws, `A${r}:H${r}`, `3. 점검자 : 소속           직급           성명  ${data.inspectorName || ''}`, {
    size: 10, border: false, align: { horizontal: 'left' },
  })
  ws.getRow(r).height = 22
  r++

  mergeSet(ws, `A${r}:D${r}`, `4. 점검일 : ${formatDateKorean(data.inspectionDate)}`, {
    size: 10, border: false, align: { horizontal: 'left' },
  })
  mergeSet(ws, `E${r}:H${r}`, `5. 조치완료일 : ${formatDateKorean(data.actionDate)}`, {
    size: 10, border: false, align: { horizontal: 'left' },
  })
  ws.getRow(r).height = 22
  r++

  ws.getRow(r).height = 6
  r++

  // 지적부위
  mergeSet(ws, `A${r}:B${r}`, '지적부위', {
    bold: true, size: 10, fill: headerFill, align: { horizontal: 'center' },
  })
  mergeSet(ws, `C${r}:H${r}`, data.location || '', { size: 10, align: { horizontal: 'left' } })
  ws.getRow(r).height = 26
  r++

  const ROW_H = 18
  const PHOTO_ROWS = 11

  // 시정 전 — 지적사항 + 사진
  const beforeStart = r
  mergeSet(ws, `C${r}:D${r}`, '지적사항', {
    bold: true, size: 10, fill: headerFill, align: { horizontal: 'center' },
  })
  mergeSet(ws, `E${r}:H${r}`, data.findingText || '', { size: 10, align: { horizontal: 'left' } })
  ws.getRow(r).height = 40
  r++
  const beforePhotoStart = r
  const beforeIsNa = !data.beforePhotoUrl
  mergeSet(ws, `C${r}:H${r + PHOTO_ROWS - 1}`, beforeIsNa ? '"사진 첨부"' : '', {
    size: 10, align: { horizontal: 'center' }, color: beforeIsNa ? 'FF999999' : undefined,
  })
  for (let i = 0; i < PHOTO_ROWS; i++) ws.getRow(r + i).height = ROW_H
  r += PHOTO_ROWS
  mergeSet(ws, `A${beforeStart}:B${r - 1}`, '시 정 전', {
    bold: true, size: 11, fill: headerFill, align: { horizontal: 'center' },
  })

  // 시정 후 — 조치내용 + 사진
  const afterStart = r
  mergeSet(ws, `C${r}:D${r}`, '조치내용', {
    bold: true, size: 10, fill: headerFill, align: { horizontal: 'center' },
  })
  mergeSet(ws, `E${r}:H${r}`, data.actionText || '', { size: 10, align: { horizontal: 'left' } })
  ws.getRow(r).height = 40
  r++
  const afterPhotoStart = r
  const afterIsNa = data.afterPhotoUrl === 'N/A'
  const hasAfterPhoto = !!data.afterPhotoUrl && !afterIsNa
  mergeSet(ws, `C${r}:H${r + PHOTO_ROWS - 1}`, hasAfterPhoto ? '' : afterIsNa ? '해당 없음' : '"사진 첨부"', {
    size: 10, align: { horizontal: 'center' }, color: hasAfterPhoto ? undefined : 'FF999999',
  })
  for (let i = 0; i < PHOTO_ROWS; i++) ws.getRow(r + i).height = ROW_H
  r += PHOTO_ROWS
  mergeSet(ws, `A${afterStart}:B${r - 1}`, '시 정 후', {
    bold: true, size: 11, fill: headerFill, align: { horizontal: 'center' },
  })

  ws.getRow(r).height = 10
  r++

  // 작성일 + 작성자/확인자 서명란
  mergeSet(ws, `A${r}:H${r}`, formatDateKorean(data.actionDate || data.inspectionDate), {
    size: 11, border: false, align: { horizontal: 'center' },
  })
  ws.getRow(r).height = 24
  r++

  mergeSet(ws, `B${r}:G${r}`, `작 성 자 : 현장대리인  ${data.writerName || ''}                    (인)`, {
    size: 11, border: false, align: { horizontal: 'left' },
  })
  const writerRow = r
  ws.getRow(r).height = 28
  r++

  mergeSet(ws, `B${r}:G${r}`, `확 인 자 : 감독원/건설사업관리기술자  ${data.confirmerName || ''}      (인)`, {
    size: 11, border: false, align: { horizontal: 'left' },
  })
  const confirmerRow = r
  ws.getRow(r).height = 28

  // 서명 이미지 — (인) 표기 위에 겹침
  addSignatureImage(workbook, ws, data.contractorSignature || undefined, 5.6, writerRow, 70, 26)
  addSignatureImage(workbook, ws, data.supervisorSignature || undefined, 5.6, confirmerRow, 70, 26)

  // 사진 삽입 (병합·테두리 이후) — C~H 영역 정중앙 배치
  const photoArea = {
    col: 2,
    colWidthsPx: Array(6).fill(11 * 8) as number[], // C~H 열 폭 (폭 단위당 8px — 한국어 Excel 실측)
    rowHeightPx: ROW_H * (4 / 3),
    rowCount: PHOTO_ROWS,
  }
  if (data.beforePhotoUrl) {
    await addPhotoImageInArea(workbook, ws, data.beforePhotoUrl, { ...photoArea, row: beforePhotoStart })
  }
  if (hasAfterPhoto && data.afterPhotoUrl) {
    await addPhotoImageInArea(workbook, ws, data.afterPhotoUrl, { ...photoArea, row: afterPhotoStart })
  }

  const dateStr = data.inspectionDate || new Date().toISOString().split('T')[0]
  await downloadWorkbook(workbook, `지적사항조치결과보고_${dateStr}.xlsx`)
}
