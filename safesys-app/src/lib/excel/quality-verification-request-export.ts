// 확인시험 의뢰서 엑셀 내보내기 — 公社시험업무지침 별지 제4호서식 (지침 제17조·제18조 관련, A4 세로)

import ExcelJS from 'exceljs'
import { QualityVerificationRequestRecord } from '@/lib/quality/quality-test-types'
import {
  mergeSet,
  addSignatureImage,
  headerFill,
  formatDateKorean,
  downloadWorkbook,
} from '@/lib/excel/quality-excel-utils'

export async function downloadQualityVerificationRequestExcel(
  record: QualityVerificationRequestRecord
): Promise<void> {
  const workbook = new ExcelJS.Workbook()
  const ws = workbook.addWorksheet('확인시험 의뢰서', {
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      margins: { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
    },
  })

  ws.columns = [
    { width: 9 }, // A
    { width: 10 }, // B
    { width: 11 }, // C
    { width: 11 }, // D
    { width: 11 }, // E
    { width: 11 }, // F
    { width: 11 }, // G
    { width: 12 }, // H
  ]

  let r = 1

  // 서식 태그
  mergeSet(ws, `A${r}:E${r}`, '확인시험 의뢰서(公社시험업무지침 별지 제4호서식)', {
    size: 9, border: false, align: { horizontal: 'left' },
  })
  ws.getRow(r).height = 18
  r++

  // 제목 + 부제
  mergeSet(ws, `A${r}:H${r}`, '확인시험 의뢰서', {
    size: 20, bold: true, underline: true, border: false, align: { horizontal: 'center' },
  })
  ws.getRow(r).height = 40
  r++
  mergeSet(ws, `A${r}:H${r}`, '(지침 제17조, 제18조 관련)', {
    size: 9, border: false, align: { horizontal: 'center' },
  })
  ws.getRow(r).height = 18
  r++

  ws.getRow(r).height = 10
  r++

  // 의뢰번호 / 의뢰일자
  mergeSet(ws, `A${r}:D${r}`, `의뢰번호 :  ${record.request_no || ''}`, {
    size: 11, border: false, align: { horizontal: 'left' },
  })
  mergeSet(ws, `E${r}:H${r}`, `의뢰일자 :  ${formatDateKorean(record.request_date)}`, {
    size: 11, border: false, align: { horizontal: 'left' },
  })
  ws.getRow(r).height = 24
  r++

  // 받음 / 보냄 (인 또는 서명)
  mergeSet(ws, `A${r}:D${r}`, `받    음 :  ${record.receiver || ''}`, {
    size: 11, border: false, align: { horizontal: 'left' },
  })
  mergeSet(ws, `E${r}:H${r}`, `보    냄 :  ${record.sender || ''}      (인 또는 서명)`, {
    size: 11, border: false, align: { horizontal: 'left' },
  })
  const senderSignatureRow = r
  ws.getRow(r).height = 24
  r++

  // 참조
  mergeSet(ws, `A${r}:H${r}`, `참    조 :  ${record.reference || ''}`, {
    size: 11, border: false, align: { horizontal: 'left' },
  })
  ws.getRow(r).height = 24
  r++

  // 구분선
  ws.mergeCells(`A${r}:H${r}`)
  for (let c = 1; c <= 8; c++) {
    ws.getCell(r, c).border = { bottom: { style: 'thin', color: { argb: 'FF000000' } } }
  }
  ws.getRow(r).height = 8
  r++

  ws.getRow(r).height = 14
  r++

  // 본문 표 (항목 | 내용)
  const bodyRows: [string, string, number][] = [
    ['공  사  명', record.construction_name || '', 40],
    ['발  주  자', record.client_name || '', 40],
    ['시  공  자', record.contractor_name || '', 40],
    ['대상공종, 물량', record.target_work || '', 44],
    ['확인시험 항목', record.test_items || '', 44],
    ['확인시험예정일', formatDateKorean(record.planned_date), 40],
    ['시 험 목 적', record.purpose || '', 44],
    ['기 타 사 항', record.etc_note || '', 44],
  ]
  bodyRows.forEach(([label, value, height]) => {
    mergeSet(ws, `A${r}:B${r}`, label, { bold: true, size: 10, fill: headerFill, align: { horizontal: 'center' } })
    mergeSet(ws, `C${r}:H${r}`, value, { size: 10, align: { horizontal: 'left' } })
    ws.getRow(r).height = height
    r++
  })

  addSignatureImage(workbook, ws, record.sender_signature, 5.6, senderSignatureRow, 70, 26)

  const dateStr = record.request_date || new Date().toISOString().split('T')[0]
  const filename = `확인시험의뢰서_${record.request_no ? `${record.request_no}_` : ''}${dateStr}.xlsx`
  await downloadWorkbook(workbook, filename)
}
