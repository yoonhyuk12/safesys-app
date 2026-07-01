// 품질검사 성과 총괄표 엑셀 내보내기 — 별지 2호 (지침 제14조 1항 관련, A4 세로)

import ExcelJS from 'exceljs'
import {
  QualitySummaryFormData,
  settlementCumulative,
} from '@/lib/quality/quality-test-types'
import {
  setCell,
  mergeSet,
  addSignatureImage,
  headerFill,
  downloadWorkbook,
} from '@/lib/excel/quality-excel-utils'

const MIN_SETTLEMENT_ROWS = 3
const MIN_QUALITY_ROWS = 4
const MIN_VERIFICATION_ROWS = 3

// 작성일시 한국식 표기 (YYYY년 MM월 DD일)
const formatReportDate = (dateStr?: string | null): string => {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return '        년        월        일'
  const [y, m, d] = dateStr.split('-')
  return `${y}년  ${m}월  ${d}일`
}

export async function downloadQualitySummaryExcel(
  report: QualitySummaryFormData,
  projectName: string
): Promise<void> {
  const workbook = new ExcelJS.Workbook()
  const ws = workbook.addWorksheet('품질검사 성과 총괄표', {
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      margins: { left: 0.6, right: 0.6, top: 0.7, bottom: 0.7, header: 0.3, footer: 0.3 },
    },
  })

  // A 공종 | B 시험종류 | C 확인시험구분 | D~H 횟수(계획/실시/합격/불합격/재시험) | I 비고
  ws.columns = [
    { width: 11 }, // A
    { width: 15 }, // B
    { width: 11 }, // C
    { width: 6.5 }, // D
    { width: 6.5 }, // E
    { width: 6.5 }, // F
    { width: 6.5 }, // G
    { width: 6.5 }, // H
    { width: 10 }, // I
  ]

  let r = 1

  // 서식 태그
  mergeSet(ws, `A${r}:C${r}`, '[별지 2호]', { size: 9, border: false, align: { horizontal: 'left' } })
  ws.getRow(r).height = 16
  r++

  // 제목 + 부제
  mergeSet(ws, `A${r}:I${r}`, '품질검사 성과 총괄표', {
    size: 18, bold: true, border: false, align: { horizontal: 'center' }, underline: true,
  })
  ws.getRow(r).height = 34
  r++
  mergeSet(ws, `A${r}:I${r}`, '(지침 제14조 1항 관련)', {
    size: 9, border: false, align: { horizontal: 'center' },
  })
  ws.getRow(r).height = 16
  r++

  // 1. 공사명 / 2. 공사기간·공정
  mergeSet(ws, `A${r}:I${r}`, `1. 공사명 :  ${projectName || ''}`, {
    size: 10, border: false, align: { horizontal: 'left' },
  })
  ws.getRow(r).height = 20
  r++
  mergeSet(
    ws,
    `A${r}:I${r}`,
    `2. 공사기간 :  ${report.construction_period || '    .    .    . ~    .    .    .'}      공정 :  ${report.progress_rate || '     '} %`,
    { size: 10, border: false, align: { horizontal: 'left' } }
  )
  ws.getRow(r).height = 20
  r++

  // 3. 기성 또는 정산량
  mergeSet(ws, `A${r}:I${r}`, '3. 기성 또는 정산량', { size: 10, bold: true, border: false, align: { horizontal: 'left' } })
  ws.getRow(r).height = 20
  r++
  setCell(ws, `A${r}`, '공 종', { bold: true, size: 9, fill: headerFill, align: { horizontal: 'center' } })
  setCell(ws, `B${r}`, '계획량\n(㎥)', { bold: true, size: 9, fill: headerFill, align: { horizontal: 'center' } })
  mergeSet(ws, `C${r}:D${r}`, '전회까지 시공량(㎥)', { bold: true, size: 9, fill: headerFill, align: { horizontal: 'center' } })
  mergeSet(ws, `E${r}:F${r}`, '금회 시공량(㎥)', { bold: true, size: 9, fill: headerFill, align: { horizontal: 'center' } })
  mergeSet(ws, `G${r}:H${r}`, '누 계', { bold: true, size: 9, fill: headerFill, align: { horizontal: 'center' } })
  setCell(ws, `I${r}`, '비 고', { bold: true, size: 9, fill: headerFill, align: { horizontal: 'center' } })
  ws.getRow(r).height = 24
  r++
  const settlementCount = Math.max(report.settlement_rows.length, MIN_SETTLEMENT_ROWS)
  for (let i = 0; i < settlementCount; i++) {
    const row = report.settlement_rows[i]
    setCell(ws, `A${r}`, row?.work_type || '', { size: 9, align: { horizontal: 'center' } })
    setCell(ws, `B${r}`, row?.plan_qty || '', { size: 9, align: { horizontal: 'center' } })
    mergeSet(ws, `C${r}:D${r}`, row?.prev_qty || '', { size: 9, align: { horizontal: 'center' } })
    mergeSet(ws, `E${r}:F${r}`, row?.current_qty || '', { size: 9, align: { horizontal: 'center' } })
    mergeSet(ws, `G${r}:H${r}`, row ? settlementCumulative(row) : '', { size: 9, align: { horizontal: 'center' } })
    setCell(ws, `I${r}`, row?.note || '', { size: 9, align: { horizontal: 'center' } })
    ws.getRow(r).height = 22
    r++
  }
  ws.getRow(r).height = 8
  r++

  // 4. 품질검사 종류 및 실적
  mergeSet(ws, `A${r}:I${r}`, '4. 품질검사 종류 및 실적', { size: 10, bold: true, border: false, align: { horizontal: 'left' } })
  ws.getRow(r).height = 20
  r++
  const q1 = r
  const q2 = r + 1
  mergeSet(ws, `A${q1}:A${q2}`, '공 종', { bold: true, size: 9, fill: headerFill, align: { horizontal: 'center' } })
  mergeSet(ws, `B${q1}:C${q2}`, '시험ㆍ검사\n종류(재료)', { bold: true, size: 9, fill: headerFill, align: { horizontal: 'center' } })
  mergeSet(ws, `D${q1}:H${q1}`, '시험ㆍ검사 횟수', { bold: true, size: 9, fill: headerFill, align: { horizontal: 'center' } })
  mergeSet(ws, `I${q1}:I${q2}`, '비 고', { bold: true, size: 9, fill: headerFill, align: { horizontal: 'center' } })
  ;([['D', '계획'], ['E', '실시'], ['F', '합격'], ['G', '불합격'], ['H', '재시험']] as const).forEach(([col, label]) => {
    setCell(ws, `${col}${q2}`, label, { bold: true, size: 9, fill: headerFill, align: { horizontal: 'center' } })
  })
  ws.getRow(q1).height = 20
  ws.getRow(q2).height = 20
  r = q2 + 1
  const qualityCount = Math.max(report.quality_rows.length, MIN_QUALITY_ROWS)
  for (let i = 0; i < qualityCount; i++) {
    const row = report.quality_rows[i]
    setCell(ws, `A${r}`, row?.work_type || '', { size: 9, align: { horizontal: 'center' } })
    mergeSet(ws, `B${r}:C${r}`, row?.test_item || '', { size: 9, align: { horizontal: 'center' } })
    setCell(ws, `D${r}`, row?.plan || '', { size: 9, align: { horizontal: 'center' } })
    setCell(ws, `E${r}`, row?.done || '', { size: 9, align: { horizontal: 'center' } })
    setCell(ws, `F${r}`, row?.pass || '', { size: 9, align: { horizontal: 'center' } })
    setCell(ws, `G${r}`, row?.fail || '', { size: 9, align: { horizontal: 'center' } })
    setCell(ws, `H${r}`, row?.retest || '', { size: 9, align: { horizontal: 'center' } })
    setCell(ws, `I${r}`, row?.note || '', { size: 9, align: { horizontal: 'center' } })
    ws.getRow(r).height = 22
    r++
  }
  ws.getRow(r).height = 8
  r++

  // 5. 확인시험 종류 및 실적
  mergeSet(ws, `A${r}:I${r}`, '5. 확인시험 종류 및 실적', { size: 10, bold: true, border: false, align: { horizontal: 'left' } })
  ws.getRow(r).height = 20
  r++
  const v1 = r
  const v2 = r + 1
  mergeSet(ws, `A${v1}:A${v2}`, '공 종', { bold: true, size: 9, fill: headerFill, align: { horizontal: 'center' } })
  mergeSet(ws, `B${v1}:B${v2}`, '시험ㆍ검사\n종류(재료)①', { bold: true, size: 9, fill: headerFill, align: { horizontal: 'center' } })
  mergeSet(ws, `C${v1}:C${v2}`, '확인시험\n구분②', { bold: true, size: 9, fill: headerFill, align: { horizontal: 'center' } })
  mergeSet(ws, `D${v1}:H${v1}`, '시험ㆍ검사 횟수', { bold: true, size: 9, fill: headerFill, align: { horizontal: 'center' } })
  mergeSet(ws, `I${v1}:I${v2}`, '비 고', { bold: true, size: 9, fill: headerFill, align: { horizontal: 'center' } })
  ;([['D', '계획'], ['E', '실시'], ['F', '합격'], ['G', '불합격'], ['H', '재시험']] as const).forEach(([col, label]) => {
    setCell(ws, `${col}${v2}`, label, { bold: true, size: 9, fill: headerFill, align: { horizontal: 'center' } })
  })
  ws.getRow(v1).height = 20
  ws.getRow(v2).height = 20
  r = v2 + 1
  const verificationCount = Math.max(report.verification_rows.length, MIN_VERIFICATION_ROWS)
  for (let i = 0; i < verificationCount; i++) {
    const row = report.verification_rows[i]
    setCell(ws, `A${r}`, row?.work_type || '', { size: 9, align: { horizontal: 'center' } })
    setCell(ws, `B${r}`, row?.test_item || '', { size: 9, align: { horizontal: 'center' } })
    setCell(ws, `C${r}`, row?.verification_type || '', { size: 9, align: { horizontal: 'center' } })
    setCell(ws, `D${r}`, row?.plan || '', { size: 9, align: { horizontal: 'center' } })
    setCell(ws, `E${r}`, row?.done || '', { size: 9, align: { horizontal: 'center' } })
    setCell(ws, `F${r}`, row?.pass || '', { size: 9, align: { horizontal: 'center' } })
    setCell(ws, `G${r}`, row?.fail || '', { size: 9, align: { horizontal: 'center' } })
    setCell(ws, `H${r}`, row?.retest || '', { size: 9, align: { horizontal: 'center' } })
    setCell(ws, `I${r}`, row?.note || '', { size: 9, align: { horizontal: 'center' } })
    ws.getRow(r).height = 22
    r++
  }
  ws.getRow(r).height = 10
  r++

  // 작성일시
  mergeSet(ws, `A${r}:I${r}`, `작성일시 :        ${formatReportDate(report.report_date)}`, {
    size: 10, border: false, align: { horizontal: 'center' },
  })
  ws.getRow(r).height = 24
  r++

  // 작성자·검토자·확인자 (각 소속/직위/성명 + 서명)
  const signers: { label: string; affiliation: string; position: string; name: string; signature: string }[] = [
    { label: '작 성 자③', affiliation: report.writer_affiliation, position: report.writer_position, name: report.writer_name, signature: report.writer_signature },
    { label: '검 토 자④', affiliation: report.reviewer_affiliation, position: report.reviewer_position, name: report.reviewer_name, signature: report.reviewer_signature },
    { label: '확 인 자⑤', affiliation: report.confirmer_affiliation, position: report.confirmer_position, name: report.confirmer_name, signature: report.confirmer_signature },
  ]
  const signatureCells: { signature: string; row: number }[] = []
  signers.forEach((signer) => {
    mergeSet(ws, `A${r}:B${r}`, signer.label, { size: 10, bold: true, border: false, align: { horizontal: 'left' } })
    mergeSet(ws, `C${r}:D${r}`, `소속 : ${signer.affiliation || ''}`, { size: 10, border: false, align: { horizontal: 'left' } })
    mergeSet(ws, `E${r}:F${r}`, `직위 : ${signer.position || ''}`, { size: 10, border: false, align: { horizontal: 'left' } })
    mergeSet(ws, `G${r}:I${r}`, `성명 : ${signer.name || ''}      (인)`, { size: 10, border: false, align: { horizontal: 'left' } })
    if (signer.signature) signatureCells.push({ signature: signer.signature, row: r })
    ws.getRow(r).height = 24
    r++
  })

  // 기입요령
  const notes = [
    '(기입요령)',
    ' ① 시험검사종류는 기성 또는 정산물량에 대하여 실시한 시험종목 전부를 기입한다.',
    ' ② 확인시험의 구분은 제16조의 구분에 따라 기입한다.',
    ' ③ 작성자 : 건설업자    ④ 검토자 : 품질시험업무담당자    ⑤ 확인자 : 감독소장',
  ]
  notes.forEach((note) => {
    mergeSet(ws, `A${r}:I${r}`, note, { size: 8, border: false, align: { horizontal: 'left' } })
    ws.getRow(r).height = 14
    r++
  })

  signatureCells.forEach((item) => {
    addSignatureImage(workbook, ws, item.signature, 7.6, item.row, 70, 26)
  })

  const dateStr = report.report_date || new Date().toISOString().split('T')[0]
  await downloadWorkbook(workbook, `품질검사성과총괄표_${dateStr}.xlsx`)
}
