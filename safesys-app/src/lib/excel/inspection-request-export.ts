// 검사/검측 대장 엑셀 내보내기
// 원본 서식: 별지 제3호(검측대장), 별지 제4호(검측요청서/검측결과통보)

import ExcelJS from 'exceljs'
import {
  InspectionRequestRecord,
  buildResultEvidence,
} from '@/lib/inspection/inspection-types'

const thin: ExcelJS.Border = { style: 'thin', color: { argb: 'FF000000' } }
const allBorders: Partial<ExcelJS.Borders> = { top: thin, bottom: thin, left: thin, right: thin }
const headerFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } }

const COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

// A4 세로 기준 인쇄 가능 높이(pt) — 행 높이 합이 이보다 작으면 늘려서 하단 여백 제거
const A4_USABLE_HEIGHT = 740
const MAX_STRETCH = 1.6

interface CellOpts {
  bold?: boolean
  size?: number
  fill?: ExcelJS.Fill
  align?: Partial<ExcelJS.Alignment>
  border?: boolean
  color?: string
  underline?: boolean
}

const setCell = (ws: ExcelJS.Worksheet, addr: string, value: ExcelJS.CellValue, opts: CellOpts = {}) => {
  const cell = ws.getCell(addr)
  cell.value = value
  cell.font = {
    size: opts.size ?? 10,
    bold: opts.bold ?? false,
    ...(opts.underline ? { underline: true } : {}),
    ...(opts.color ? { color: { argb: opts.color } } : {}),
  }
  if (opts.fill) cell.fill = opts.fill
  if (opts.border !== false) cell.border = allBorders
  cell.alignment = { vertical: 'middle', wrapText: true, ...opts.align }
}

// 병합 범위의 모든 셀에 테두리 적용 (병합 셀 테두리 누락 방지)
const borderRange = (ws: ExcelJS.Worksheet, range: string) => {
  const [start, end] = range.split(':')
  const startCol = COLS.indexOf(start[0])
  const endCol = COLS.indexOf(end[0])
  const startRow = parseInt(start.slice(1), 10)
  const endRow = parseInt(end.slice(1), 10)
  for (let r = startRow; r <= endRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      ws.getCell(`${COLS[c]}${r}`).border = allBorders
    }
  }
}

const mergeSet = (
  ws: ExcelJS.Worksheet,
  range: string,
  value: ExcelJS.CellValue,
  opts: CellOpts = {}
) => {
  ws.mergeCells(range)
  setCell(ws, range.split(':')[0], value, opts)
  if (opts.border !== false) borderRange(ws, range)
}

const stretchRowsToA4 = (ws: ExcelJS.Worksheet, lastRow: number) => {
  let total = 0
  for (let r = 1; r <= lastRow; r++) {
    total += ws.getRow(r).height || 18
  }
  if (total <= 0 || total >= A4_USABLE_HEIGHT) return
  const scale = Math.min(A4_USABLE_HEIGHT / total, MAX_STRETCH)
  for (let r = 1; r <= lastRow; r++) {
    const row = ws.getRow(r)
    row.height = Math.floor((row.height || 18) * scale)
  }
}

// 서명 이미지 삽입 ((인) 표기 위치에 겹쳐서 배치)
const addSignatureImage = (
  wb: ExcelJS.Workbook,
  ws: ExcelJS.Worksheet,
  signature: string | undefined,
  col: number,
  rowNum: number
) => {
  if (!signature || !signature.startsWith('data:image')) return
  try {
    const imageId = wb.addImage({ base64: signature.split(',')[1], extension: 'png' })
    ws.addImage(imageId, { tl: { col, row: rowNum - 1 }, ext: { width: 80, height: 28 } })
  } catch {
    // 이미지 삽입 실패 시 무시
  }
}

const formatDateKorean = (dateStr?: string | null): string => {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return '20      .        .        .'
  }
  const [y, m, d] = dateStr.split('-')
  return `${y}.  ${m}.  ${d}.`
}

const downloadWorkbook = async (workbook: ExcelJS.Workbook, filename: string) => {
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  window.URL.revokeObjectURL(url)
}

// ── 검측대장 (별지 제3호) — 등록된 목록 전체 출력
export async function downloadInspectionLedgerExcel(
  records: InspectionRequestRecord[],
  projectName: string,
  supervisorName: string,
  supervisorSignature?: string
): Promise<void> {
  const workbook = new ExcelJS.Workbook()
  const ws = workbook.addWorksheet('검측대장', {
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      margins: { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
    },
  })

  // 공종|구조물명|노선명,위치및부위|설계규격|단위|수량|합격여부|검측결과또는입증자료 (8열)
  ws.columns = [
    { width: 9 }, // A 공종
    { width: 11 }, // B 구조물명
    { width: 18 }, // C 노선명, 위치 및 부위
    { width: 11 }, // D 설계규격
    { width: 6 }, // E 단위
    { width: 7 }, // F 수량
    { width: 7 }, // G 합격여부
    { width: 17 }, // H 검측결과 또는 입증자료
  ]

  let r = 1

  // 서식 태그
  mergeSet(ws, `A${r}:C${r}`, '[별지 제3호 서식]', { size: 10, border: false, align: { horizontal: 'left' } })
  ws.getRow(r).height = 20
  r++

  // 제목
  ws.mergeCells(`A${r}:H${r}`)
  const titleCell = ws.getCell(`A${r}`)
  titleCell.value = '검  측  대  장'
  titleCell.font = { size: 20, bold: true }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(r).height = 38
  r++

  // 현장명 (좌) / 공사감독원 (우)
  mergeSet(ws, `A${r}:D${r}`, projectName ? `[${projectName}]` : '', {
    size: 10, border: false, align: { horizontal: 'left' },
  })
  mergeSet(ws, `E${r}:H${r}`, `공사감독원 :  ${supervisorName || '○ ○ ○'}  (인)`, {
    size: 11, border: false, align: { horizontal: 'right' },
  })
  const supervisorSignatureRow = r
  ws.getRow(r).height = 24
  r++

  // 테이블 헤더
  const headers: [string, string][] = [
    ['A', '공 종'],
    ['B', '구조물명'],
    ['C', '노선명, 위치 및 부위'],
    ['D', '설계규격'],
    ['E', '단위'],
    ['F', '수량'],
    ['G', '합격\n여부'],
    ['H', '검측결과 또는\n입증자료'],
  ]
  headers.forEach(([col, label]) => {
    setCell(ws, `${col}${r}`, label, { bold: true, fill: headerFill, align: { horizontal: 'center' } })
  })
  ws.getRow(r).height = 30
  r++

  // 데이터 행 (최소 15행 — 빈 칸 유지로 원본 서식 유지)
  const rowCount = Math.max(records.length, 15)
  for (let i = 0; i < rowCount; i++) {
    const record = records[i]
    setCell(ws, `A${r}`, record?.work_type || '', { align: { horizontal: 'center' } })
    setCell(ws, `B${r}`, record?.structure_name || '', { align: { horizontal: 'center' } })
    setCell(ws, `C${r}`, record ? record.inspection_part || record.location_and_type : '', {})
    setCell(ws, `D${r}`, record?.design_spec || '', { align: { horizontal: 'center' } })
    setCell(ws, `E${r}`, record?.unit || '', { align: { horizontal: 'center' } })
    setCell(ws, `F${r}`, record?.quantity || '', { align: { horizontal: 'center' } })
    setCell(ws, `G${r}`, record?.pass_status || '', { align: { horizontal: 'center' } })
    setCell(ws, `H${r}`, record ? buildResultEvidence(record) : '', { size: 9 })
    ws.getRow(r).height = 36
    r++
  }

  // 하단 주석
  mergeSet(
    ws,
    `A${r}:H${r}`,
    '* 검측결과 및 입증자료는 검측결과통보 번호 및 날짜를 작성 또는 검사부서의 관련대호 및 날짜를 작성',
    { size: 9, border: false, align: { horizontal: 'left' } }
  )
  ws.getRow(r).height = 20

  stretchRowsToA4(ws, r)
  addSignatureImage(workbook, ws, supervisorSignature, 7.5, supervisorSignatureRow)

  const filename = `검측대장_${new Date().toISOString().split('T')[0]}.xlsx`
  await downloadWorkbook(workbook, filename)
}

// ── 검측요청서 + 검측결과통보 (별지 제4호) — 1건 출력
export function addRequestSheet(
  workbook: ExcelJS.Workbook,
  record: InspectionRequestRecord,
  projectName: string
): ExcelJS.Worksheet {
  const signaturesToAdd: { signature: string | undefined; col: number; row: number }[] = []
  const ws = workbook.addWorksheet('검측요청서', {
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
    { width: 8 }, // A
    { width: 10 }, // B
    { width: 11 }, // C
    { width: 11 }, // D
    { width: 11 }, // E
    { width: 11 }, // F
    { width: 11 }, // G
    { width: 13 }, // H
  ]

  let r = 1

  // 서식 태그 + 재검측 표시
  mergeSet(ws, `A${r}:C${r}`, '[별지 제4호 서식]', { size: 10, border: false, align: { horizontal: 'left' } })
  if (record.is_reinspection) {
    mergeSet(ws, `G${r}:H${r}`, '(재)', {
      size: 14, bold: true, color: 'FFFF0000', border: false, align: { horizontal: 'right' },
    })
  }
  ws.getRow(r).height = 20
  r++

  // ── 검측요청서
  ws.mergeCells(`A${r}:H${r}`)
  const titleCell = ws.getCell(`A${r}`)
  titleCell.value = '검  측  요  청  서'
  titleCell.font = { size: 18, bold: true }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(r).height = 34
  r++

  // 번호 / 일자
  mergeSet(ws, `A${r}:D${r}`, `번  호 :  ${record.request_no || ''}`, {
    size: 11, border: false, align: { horizontal: 'left' },
  })
  mergeSet(ws, `E${r}:H${r}`, formatDateKorean(record.request_date), {
    size: 11, border: false, align: { horizontal: 'right' },
  })
  ws.getRow(r).height = 22
  r++

  mergeSet(ws, `A${r}:H${r}`, '받  음 :  공사 사무소장', {
    size: 11, border: false, align: { horizontal: 'left' },
  })
  ws.getRow(r).height = 22
  r++

  mergeSet(ws, `A${r}:H${r}`, '    다음과 같은 세부공종에 대하여 검측요청 하오니 검사 후 승인하여 주시기 바랍니다.', {
    size: 11, border: false, align: { horizontal: 'left' },
  })
  ws.getRow(r).height = 26
  r++

  // 요청 내용 테이블 — 검측요구 일자는 날짜 형식(YYYY-MM-DD)이면 한국식 표기로 변환
  const requestedDate = /^\d{4}-\d{2}-\d{2}$/.test(record.requested_datetime)
    ? formatDateKorean(record.requested_datetime)
    : record.requested_datetime || ''
  const requestRows: [string, string, number][] = [
    ['위치 및 공종', record.location_and_type || '', 26],
    ['검 측 부 위', record.inspection_part || '', 26],
    ['검측 요구 일자', requestedDate, 26],
    ['검 측 사 항', record.inspection_items || '', 50],
  ]
  requestRows.forEach(([label, value, height]) => {
    mergeSet(ws, `A${r}:B${r}`, label, { bold: true, fill: headerFill, align: { horizontal: 'center' } })
    mergeSet(ws, `C${r}:H${r}`, value, { align: { horizontal: 'left' } })
    ws.getRow(r).height = height
    r++
  })

  mergeSet(ws, `A${r}:H${r}`, '붙  임 :  검측 체크리스트, 시공사진, 도면 각1부', {
    size: 10, border: false, align: { horizontal: 'left' },
  })
  ws.getRow(r).height = 22
  r++

  mergeSet(ws, `A${r}:H${r}`, `현장대리인      ${record.field_agent_name || ''}      (인)`, {
    size: 11, border: false, align: { horizontal: 'center' },
  })
  signaturesToAdd.push({ signature: record.field_agent_signature, col: 5.1, row: r })
  ws.getRow(r).height = 26
  r++

  // 절취선 (점선)
  ws.mergeCells(`A${r}:H${r}`)
  for (let c = 0; c < COLS.length; c++) {
    ws.getCell(`${COLS[c]}${r}`).border = {
      bottom: { style: 'dotted', color: { argb: 'FF888888' } },
    }
  }
  ws.getRow(r).height = 12
  r++

  // ── 검측결과통보
  ws.mergeCells(`A${r}:H${r}`)
  const resultTitle = ws.getCell(`A${r}`)
  resultTitle.value = '검  측  결  과  통  보'
  resultTitle.font = { size: 18, bold: true }
  resultTitle.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(r).height = 34
  r++

  mergeSet(ws, `A${r}:D${r}`, `번  호 :  ${record.result_no || ''}`, {
    size: 11, border: false, align: { horizontal: 'left' },
  })
  mergeSet(ws, `E${r}:H${r}`, formatDateKorean(record.result_date), {
    size: 11, border: false, align: { horizontal: 'right' },
  })
  ws.getRow(r).height = 22
  r++

  mergeSet(ws, `A${r}:H${r}`, `받  음 :  ${projectName || '○○공사'} 현장대리인  ${record.field_agent_name || '○○○'}`, {
    size: 11, border: false, align: { horizontal: 'left' },
  })
  ws.getRow(r).height = 22
  r++

  mergeSet(ws, `A${r}:H${r}`, `    검측요청서 번호 ${record.request_no || '○○'}에 대한 검측결과를 다음과 같이 통보합니다.`, {
    size: 11, border: false, align: { horizontal: 'left' },
  })
  ws.getRow(r).height = 26
  r++

  // 결과 테이블
  mergeSet(ws, `A${r}:B${r}`, '검  측  자', { bold: true, fill: headerFill, align: { horizontal: 'center' } })
  mergeSet(ws, `C${r}:H${r}`, record.inspector_name ? `${record.inspector_name}  (인)` : '(인)', {
    align: { horizontal: 'center' },
  })
  signaturesToAdd.push({ signature: record.inspector_signature, col: 5.0, row: r })
  ws.getRow(r).height = 26
  r++

  const resultText = [record.pass_status, record.result_content].filter(Boolean).join(' — ')
  mergeSet(ws, `A${r}:B${r}`, '검 측 결 과', { bold: true, fill: headerFill, align: { horizontal: 'center' } })
  mergeSet(ws, `C${r}:H${r}`, resultText, { align: { horizontal: 'left' } })
  ws.getRow(r).height = 50
  r++

  mergeSet(ws, `A${r}:B${r}`, '지 시 사 항', { bold: true, fill: headerFill, align: { horizontal: 'center' } })
  mergeSet(ws, `C${r}:H${r}`, record.instructions || '', { align: { horizontal: 'left' } })
  ws.getRow(r).height = 40
  r++

  mergeSet(ws, `A${r}:H${r}`, '붙임 :  공사감독의 체크리스트 검측결과, 검측야장 사본', {
    size: 10, border: false, align: { horizontal: 'left' },
  })
  ws.getRow(r).height = 22
  r++

  mergeSet(ws, `A${r}:H${r}`, `공사감독원      ${record.supervisor_name || ''}      (인)`, {
    size: 11, border: false, align: { horizontal: 'center' },
  })
  signaturesToAdd.push({ signature: record.supervisor_signature, col: 5.1, row: r })
  ws.getRow(r).height = 26
  r++

  // 하단 주석
  const notes = [
    '주) ① 재검측시에는 붉은 글씨로 "(재)"를 우측 상단에 작성함',
    '      ② 시공자가 재검측 요청을 할 때에는 잘못 시공한 기능공의 서명을 받아 그 명단을 첨부하여야 함',
    '      ③ 2부 작성하여 시공자, 공사감독 각 1부 보관',
  ]
  notes.forEach((note) => {
    mergeSet(ws, `A${r}:H${r}`, note, { size: 9, border: false, align: { horizontal: 'left' } })
    ws.getRow(r).height = 16
    r++
  })

  stretchRowsToA4(ws, r - 1)
  signaturesToAdd.forEach((item) => {
    addSignatureImage(workbook, ws, item.signature, item.col, item.row)
  })

  return ws
}

// 검측요청서(별지 제4호) 단독 1건 출력
export async function downloadInspectionRequestExcel(
  record: InspectionRequestRecord,
  projectName: string
): Promise<void> {
  const workbook = new ExcelJS.Workbook()
  addRequestSheet(workbook, record, projectName)
  const dateStr = record.request_date || new Date().toISOString().split('T')[0]
  const filename = `검측요청서_${record.request_no ? `제${record.request_no}호_` : ''}${dateStr}.xlsx`
  await downloadWorkbook(workbook, filename)
}
