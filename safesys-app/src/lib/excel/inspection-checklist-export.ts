// 검측 체크리스트(별지 제5호) 엑셀 내보내기 — 요청서 1건에 첨부되는 체크리스트
// 11열(A–K) 레이아웃이라 8열 기준의 inspection-request-export.ts와 분리한다.

import ExcelJS from 'exceljs'
import {
  InspectionRequestRecord,
  normalizeChecklistItems,
  normalizeInspectionPhotos,
} from '@/lib/inspection/inspection-types'
import { addRequestSheet } from '@/lib/excel/inspection-request-export'
import { addInspectionPhotoSheet } from '@/lib/excel/inspection-photo-report'

const thin: ExcelJS.Border = { style: 'thin', color: { argb: 'FF000000' } }
const allBorders: Partial<ExcelJS.Borders> = { top: thin, bottom: thin, left: thin, right: thin }
const headerFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } }

const COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K']

interface CellOpts {
  bold?: boolean
  size?: number
  fill?: ExcelJS.Fill
  align?: Partial<ExcelJS.Alignment>
  border?: boolean
}

const setCell = (ws: ExcelJS.Worksheet, addr: string, value: ExcelJS.CellValue, opts: CellOpts = {}) => {
  const cell = ws.getCell(addr)
  cell.value = value
  cell.font = { size: opts.size ?? 10, bold: opts.bold ?? false }
  if (opts.fill) cell.fill = opts.fill
  if (opts.border !== false) cell.border = allBorders
  cell.alignment = { vertical: 'middle', wrapText: true, ...opts.align }
}

// 병합 범위 전체에 테두리 적용 (병합 셀 테두리 누락 방지)
const borderRange = (ws: ExcelJS.Worksheet, range: string) => {
  const [start, end] = range.split(':')
  const startCol = COLS.indexOf(start[0])
  const endCol = COLS.indexOf(end[0])
  const startRow = parseInt(start.slice(1), 10)
  const endRow = parseInt(end.slice(1), 10)
  for (let row = startRow; row <= endRow; row++) {
    for (let c = startCol; c <= endCol; c++) {
      ws.getCell(`${COLS[c]}${row}`).border = allBorders
    }
  }
}

const mergeSet = (ws: ExcelJS.Worksheet, range: string, value: ExcelJS.CellValue, opts: CellOpts = {}) => {
  ws.mergeCells(range)
  setCell(ws, range.split(':')[0], value, opts)
  if (opts.border !== false) borderRange(ws, range)
}

const formatDateKorean = (dateStr?: string | null): string => {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return '20      .        .        .'
  }
  const [y, m, d] = dateStr.split('-')
  return `${y}.  ${m}.  ${d}.`
}

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
    // 서명 크기 고정: 너비 3cm, 높이 1cm (96 DPI 기준 1cm ≈ 37.8px)
    ws.addImage(imageId, { tl: { col, row: rowNum - 1 }, ext: { width: 113.4, height: 37.8 } })
  } catch {
    // 이미지 삽입 실패 시 무시
  }
}

// 성명(J, 서명 이미지 겹침)과 (인)(K)을 분리 배치해 서명이 (인)을 가리지 않게 한다.
// J·K 사이 구분선은 제거해 기존 병합 셀처럼 한 칸으로 보이게 유지.
const setSignatureNameCell = (ws: ExcelJS.Worksheet, rowNum: number, name: string) => {
  const j = ws.getCell(`J${rowNum}`)
  j.value = name
  j.font = { size: 10 }
  j.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  j.border = { top: thin, bottom: thin, left: thin }
  const k = ws.getCell(`K${rowNum}`)
  k.value = '(인)'
  k.font = { size: 10 }
  k.alignment = { vertical: 'middle', horizontal: 'center' }
  k.border = { top: thin, bottom: thin, right: thin }
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

// ── 검측 체크리스트 (별지 제5호) 시트를 워크북에 추가
export function addChecklistSheet(
  workbook: ExcelJS.Workbook,
  record: InspectionRequestRecord
): ExcelJS.Worksheet {
  const ws = workbook.addWorksheet('검측체크리스트', {
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'portrait',
      horizontalCentered: true, // 페이지 가로 가운데 맞춤
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      margins: { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
    },
  })

  ws.columns = [
    { width: 23 }, // A
    { width: 6 }, // B
    { width: 2 }, // C
    { width: 9 }, // D
    { width: 6 }, // E
    { width: 13 }, // F
    { width: 5 }, // G
    { width: 13 }, // H 합격
    { width: 7 }, // I 불합격
    { width: 8 }, // J 불합격
    { width: 27 }, // K 조치사항
  ]

  // 헤더는 검측요청서 필드와 공유 — 구조물명/검측부위/공종/수량을 그대로 사용
  const facility = record.structure_name || ''
  const location = record.inspection_part || record.location_and_type || ''
  const workType = record.work_type || ''
  const quantity = record.quantity || ''

  let r = 1

  // 서식 태그
  mergeSet(ws, `A${r}:C${r}`, '[별지 제5호 서식]', { size: 10, border: false, align: { horizontal: 'left' } })
  ws.getRow(r).height = 18
  r++

  // 제목
  mergeSet(ws, `A${r}:K${r}`, '검 측 체 크 리 스 트', {
    size: 20,
    bold: true,
    border: false,
    align: { horizontal: 'center' },
  })
  ws.getRow(r).height = 40
  r++

  // 헤더 1행: 시설물명 / 위치 또는 부위
  setCell(ws, `A${r}`, '시설물명', { bold: true, fill: headerFill, align: { horizontal: 'center' } })
  mergeSet(ws, `B${r}:F${r}`, facility, { align: { horizontal: 'left' } })
  mergeSet(ws, `G${r}:I${r}`, '위치 또는 부위', { bold: true, fill: headerFill, align: { horizontal: 'center' } })
  mergeSet(ws, `J${r}:K${r}`, location, { align: { horizontal: 'left' } })
  ws.getRow(r).height = 24
  r++

  // 헤더 2행: 공종명 / 물량
  setCell(ws, `A${r}`, '공종명', { bold: true, fill: headerFill, align: { horizontal: 'center' } })
  mergeSet(ws, `B${r}:F${r}`, workType, { align: { horizontal: 'left' } })
  mergeSet(ws, `G${r}:I${r}`, '물량(길이 면적 등)', { bold: true, fill: headerFill, align: { horizontal: 'center' } })
  mergeSet(ws, `J${r}:K${r}`, quantity, { align: { horizontal: 'left' } })
  ws.getRow(r).height = 24
  r++

  // 표 헤더 (2행 병합)
  const headTop = r
  const headBottom = r + 1
  mergeSet(ws, `A${headTop}:C${headBottom}`, '검측 항목', {
    bold: true,
    fill: headerFill,
    align: { horizontal: 'center' },
  })
  mergeSet(ws, `D${headTop}:G${headBottom}`, '검사기준\n(시방서 또는 도면 등)', {
    bold: true,
    fill: headerFill,
    align: { horizontal: 'center' },
  })
  mergeSet(ws, `H${headTop}:J${headTop}`, '검사결과', {
    bold: true,
    fill: headerFill,
    align: { horizontal: 'center' },
  })
  mergeSet(ws, `K${headTop}:K${headBottom}`, '조치사항', {
    bold: true,
    fill: headerFill,
    align: { horizontal: 'center' },
  })
  setCell(ws, `H${headBottom}`, '합격', { bold: true, fill: headerFill, align: { horizontal: 'center' } })
  mergeSet(ws, `I${headBottom}:J${headBottom}`, '불합격', {
    bold: true,
    fill: headerFill,
    align: { horizontal: 'center' },
  })
  ws.getRow(headTop).height = 22
  ws.getRow(headBottom).height = 22
  r += 2

  // 데이터 — 항목별 2행(상단=시공자 점검, 하단=감독원 검측). 구버전 레코드(null) 대비 정규화
  const mark = (cond: boolean) => (cond ? '○' : '')
  normalizeChecklistItems(record.checklist_items).forEach((it) => {
    const top = r
    const bottom = r + 1
    // 항목이 비어있는 행은 기본값(합격)이라도 표시하지 않는다 (빈 행에 ○ 방지)
    const hasItem = !!(it.item && it.item.trim())
    mergeSet(ws, `A${top}:C${bottom}`, it.item || '', { align: { horizontal: 'left' } })
    mergeSet(ws, `D${top}:G${bottom}`, it.standard || '', { align: { horizontal: 'left' }, size: 9 })
    // 시공자 (상단)
    setCell(ws, `H${top}`, mark(hasItem && it.contractor_result === '합격'), { align: { horizontal: 'center' } })
    mergeSet(ws, `I${top}:J${top}`, mark(hasItem && it.contractor_result === '불합격'), {
      align: { horizontal: 'center' },
    })
    // 감독원 (하단)
    setCell(ws, `H${bottom}`, mark(hasItem && it.supervisor_result === '합격'), { align: { horizontal: 'center' } })
    mergeSet(ws, `I${bottom}:J${bottom}`, mark(hasItem && it.supervisor_result === '불합격'), {
      align: { horizontal: 'center' },
    })
    mergeSet(ws, `K${top}:K${bottom}`, it.action || '', { align: { horizontal: 'left' }, size: 9 })
    ws.getRow(top).height = 18
    ws.getRow(bottom).height = 18
    r += 2
  })

  // 푸터 — 시공자 점검일자 / 현장대리인
  mergeSet(ws, `A${r}:B${r}`, '시공자 점검일자', { bold: true, fill: headerFill, align: { horizontal: 'center' } })
  // 점검일자가 비어 있으면 시트1(검측요청서)의 요청일자를 따른다
  mergeSet(ws, `C${r}:F${r}`, formatDateKorean(record.contractor_check_date || record.request_date), { align: { horizontal: 'center' } })
  mergeSet(ws, `G${r}:I${r}`, '현장대리인', { bold: true, fill: headerFill, align: { horizontal: 'center' } })
  setSignatureNameCell(ws, r, record.field_agent_name || '')
  addSignatureImage(workbook, ws, record.field_agent_signature, 10.99, r)
  ws.getRow(r).height = 28
  r++

  // 푸터 — 감독원 검측일자 / 감독원
  mergeSet(ws, `A${r}:B${r}`, '감독원 검측일자', { bold: true, fill: headerFill, align: { horizontal: 'center' } })
  // 검측일자가 비어 있으면 시트1(검측요청서)의 요청일자를 따른다
  mergeSet(ws, `C${r}:F${r}`, formatDateKorean(record.supervisor_check_date || record.request_date), { align: { horizontal: 'center' } })
  mergeSet(ws, `G${r}:I${r}`, '감 독 원', { bold: true, fill: headerFill, align: { horizontal: 'center' } })
  setSignatureNameCell(ws, r, record.supervisor_name || '')
  addSignatureImage(workbook, ws, record.supervisor_signature, 10.99, r)
  ws.getRow(r).height = 28
  r++

  // 주석
  mergeSet(
    ws,
    `A${r}:K${r}`,
    '* 검사결과 상단은 시공자 점검직원이 하단은 감독원이 기록한다. 매몰부분 등 검측 사진을 첨부한다.',
    { size: 9, border: false, align: { horizontal: 'left' } }
  )
  ws.getRow(r).height = 24

  // 3~6행(헤더)·35·36행(서명 푸터) 텍스트 크기 12 적용 (굵기 등 기존 속성은 유지)
  for (const row of [3, 4, 5, 6, 35, 36]) {
    ws.getRow(row).eachCell({ includeEmpty: false }, (cell) => {
      cell.font = { ...cell.font, size: 12 }
    })
  }

  // 제목~서명 푸터(2~36행) 행 높이를 30으로 일괄 통일 (37행 주석은 제외)
  for (let row = 2; row <= 36; row++) {
    ws.getRow(row).height = 30
  }

  return ws
}

// ── 검측요청서(시트1) + 검측 체크리스트(시트2) + 사진대지(시트3, 사진 있을 때)를 한 파일로 출력
export async function downloadInspectionRequestWithChecklistExcel(
  record: InspectionRequestRecord,
  projectName: string
): Promise<void> {
  const workbook = new ExcelJS.Workbook()
  addRequestSheet(workbook, record, projectName) // 시트1: 검측요청서
  addChecklistSheet(workbook, record) // 시트2: 검측 체크리스트
  if (normalizeInspectionPhotos(record.photos).length > 0) {
    await addInspectionPhotoSheet(workbook, record, projectName) // 시트3: 사진대지
  }
  const dateStr = record.request_date || new Date().toISOString().split('T')[0]
  const filename = `검측요청서_체크리스트_${record.request_no ? `제${record.request_no}호_` : ''}${dateStr}.xlsx`
  await downloadWorkbook(workbook, filename)
}
