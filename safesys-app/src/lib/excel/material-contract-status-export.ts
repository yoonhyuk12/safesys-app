// 지급자재(관급자재) 계약 현황 엑셀 다운로드 — 관급자재 계약 현황 보고 양식 기반
import ExcelJS from 'exceljs'

export interface MaterialContractRow {
  contractName: string // 계약명 (조달청 납품요구 건명, 없으면 자재명)
  itemName: string // 품목 (자재명)
  spec: string // 품목 및 규격 (원장 행의 품명/규격)
  qty: number // 수량 (발주량, 보정 행 반영)
  unit: string // 단위
  dlvrReqNo: string // 납품요구(계약) 번호
  supplier: string // 계약자 (업체)
  cndtn: string // 인도조건
  deadline: string // 납품기한 (YYYY-MM-DD)
  prdctAmt: number // 품대계 (품목금액 합)
  feeAmt: number // 조달수수료 합
  note: string // 비고 (업체 연락처 등)
}

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' },
  left: { style: 'thin' },
  bottom: { style: 'thin' },
  right: { style: 'thin' },
}

const NUM_FMT = '#,##0'
const FONT_NAME = '맑은 고딕'
const AMOUNT_SUB_LABELS = ['품대계', '조달수수료', '합계']

// 배경색 팔레트 — 헤더는 진한 청회색, 합계는 옅은 골드, 금액 그룹은 옅은 색으로 구분
const solidFill = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })
const HEADER_FILL = solidFill('FF44546A')
const TOTAL_FILL = solidFill('FFFFF2CC')
const AMOUNT_TOTAL_GROUP_FILL = solidFill('FFFFF9E8') // 전체 계약금액 그룹 데이터 셀
const YEAR_GROUP_FILLS = [solidFill('FFEAF2FA'), solidFill('FFE9F5EC')] // 연도 그룹 데이터 셀 (파랑/초록 교대)

// YYYY-MM-DD → YY.MM.DD (양식 표기), 그 외 형식은 그대로
function formatDeadline(val: string): string {
  const m = val.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return val
  return `${m[1].slice(2)}.${m[2]}.${m[3]}`
}

// 납품기한에서 연도(YYYY) 추출 — 'YYYY-…' 또는 'YY.…' 표기 지원, 없으면 null
function deadlineYear(val: string): string | null {
  let m = val.match(/^(\d{4})\D/)
  if (m) return m[1]
  m = val.match(/^(\d{2})\./)
  if (m) return `20${m[1]}`
  return null
}

/**
 * 지급자재 계약 현황 Excel 다운로드
 * 컬럼: 번호·계약명·품목·품목및규격·수량·단위·납품요구(계약)번호·계약자·인도조건·납품기한 (품목/규격당 한 줄)
 *       + 계약금액(품대계/조달수수료/합계)
 *       + 납품기한 연도별 그룹(품대계/조달수수료/합계, 연도는 데이터에서 동적 구성)
 *       + 비고
 */
export async function downloadMaterialContractStatusExcel(
  projectName: string,
  rows: MaterialContractRow[],
) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('지급자재 계약 현황')

  // 납품기한 연도 목록 (오름차순) — 연도별 계약금액 그룹 컬럼
  const years = [...new Set(rows.map(r => deadlineYear(r.deadline)).filter((y): y is string => !!y))].sort()

  // 컬럼 구성 — A~J 기본 정보, 이후 금액 그룹(전체 + 연도별) 3열씩, 마지막 비고
  const BASE_COLS = 10
  const QTY_COL = 5 // 수량 열 (숫자 서식)
  const amountGroups: string[] = ['계약금액', ...years.map(y => `${y}년`)]
  const amountStartCol = (g: number) => BASE_COLS + 1 + g * 3 // 그룹 g의 품대계 열 번호
  const noteCol = BASE_COLS + amountGroups.length * 3 + 1

  // 금액 그룹 데이터 셀 배경 (그 외 열은 흰색 유지)
  const dataFill = (c: number): ExcelJS.Fill | null => {
    if (c <= BASE_COLS || c >= noteCol) return null
    const g = Math.floor((c - BASE_COLS - 1) / 3)
    if (g === 0) return AMOUNT_TOTAL_GROUP_FILL
    return YEAR_GROUP_FILLS[(g - 1) % YEAR_GROUP_FILLS.length]
  }

  // 그룹 경계(각 금액 그룹 시작·비고 열)는 왼쪽 테두리를 굵게
  const borderAt = (c: number): Partial<ExcelJS.Borders> => {
    const isGroupStart = c === noteCol || (c > BASE_COLS && (c - BASE_COLS - 1) % 3 === 0)
    return isGroupStart ? { ...thinBorder, left: { style: 'medium' } } : thinBorder
  }
  ws.columns = [
    { width: 6 },   // 번호
    { width: 48 },  // 계약명
    { width: 16 },  // 품목
    { width: 40 },  // 품목 및 규격
    { width: 10 },  // 수량
    { width: 8 },   // 단위
    { width: 20 },  // 납품요구(계약) 번호
    { width: 22 },  // 계약자
    { width: 14 },  // 인도조건
    { width: 11 },  // 납품기한
    ...amountGroups.flatMap(() => [{ width: 14 }, { width: 12 }, { width: 14 }]), // 품대계/조달수수료/합계
    { width: 22 },  // 비고
  ]

  // ── Row 1: 제목 ──
  ws.mergeCells(1, 1, 1, noteCol)
  const titleCell = ws.getCell(1, 1)
  titleCell.value = `${projectName ? projectName + ' ' : ''}지급자재 계약 현황`
  titleCell.font = { name: FONT_NAME, size: 16, bold: true, color: { argb: 'FF1F3864' } }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(1).height = 34

  // ── Row 2: 단위 표기 ──
  const unitCell = ws.getCell(2, noteCol)
  unitCell.value = '(단위: 원)'
  unitCell.font = { name: FONT_NAME, size: 9, color: { argb: 'FF808080' } }
  unitCell.alignment = { horizontal: 'right', vertical: 'middle' }

  // ── Row 3~4: 2단 헤더 ──
  const baseHeaders = ['번호', '계약명', '품목', '품목 및 규격', '수량', '단위', '납품요구(계약) 번호', '계약자', '인도조건', '납품기한']
  baseHeaders.forEach((label, i) => {
    ws.mergeCells(3, i + 1, 4, i + 1)
    ws.getCell(3, i + 1).value = label
  })
  amountGroups.forEach((label, g) => {
    const start = amountStartCol(g)
    ws.mergeCells(3, start, 3, start + 2)
    ws.getCell(3, start).value = label
    AMOUNT_SUB_LABELS.forEach((sub, i) => {
      ws.getCell(4, start + i).value = sub
    })
  })
  ws.mergeCells(3, noteCol, 4, noteCol)
  ws.getCell(3, noteCol).value = '비고'
  for (const rowNum of [3, 4]) {
    const row = ws.getRow(rowNum)
    row.height = 20
    for (let c = 1; c <= noteCol; c++) {
      const cell = row.getCell(c)
      cell.font = { name: FONT_NAME, size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      cell.border = borderAt(c)
      cell.fill = HEADER_FILL
    }
  }

  // 금액 3종(품대계/조달수수료/합계) 값 반환 — 0은 빈칸으로
  const amountValues = (prdct: number, fee: number): Array<number | null> =>
    [prdct || null, fee || null, (prdct + fee) || null]

  // ── Row 5: 합계 ──
  ws.mergeCells(5, 1, 5, BASE_COLS)
  ws.getCell(5, 1).value = '합계'
  amountGroups.forEach((_, g) => {
    const inGroup = g === 0 ? rows : rows.filter(r => deadlineYear(r.deadline) === years[g - 1])
    const prdct = inGroup.reduce((s, r) => s + (r.prdctAmt || 0), 0)
    const fee = inGroup.reduce((s, r) => s + (r.feeAmt || 0), 0)
    amountValues(prdct, fee).forEach((v, i) => {
      ws.getCell(5, amountStartCol(g) + i).value = v
    })
  })
  const totalRow = ws.getRow(5)
  totalRow.height = 20
  for (let c = 1; c <= noteCol; c++) {
    const cell = totalRow.getCell(c)
    const isAmount = c > BASE_COLS && c < noteCol
    cell.font = { name: FONT_NAME, size: 10, bold: true, color: { argb: 'FF7F5F00' } }
    cell.alignment = { horizontal: isAmount ? 'right' : 'center', vertical: 'middle' }
    cell.border = borderAt(c)
    cell.fill = TOTAL_FILL
    if (isAmount) cell.numFmt = NUM_FMT
  }

  // ── Row 6~: 데이터 ──
  rows.forEach((r, idx) => {
    const year = deadlineYear(r.deadline)
    const yearAmounts = amountGroups.slice(1).flatMap((_, g) =>
      years[g] === year ? amountValues(r.prdctAmt, r.feeAmt) : [null, null, null])
    const row = ws.addRow([
      idx + 1,
      r.contractName,
      r.itemName,
      r.spec,
      r.qty || null,
      r.unit,
      r.dlvrReqNo,
      r.supplier,
      r.cndtn,
      formatDeadline(r.deadline),
      ...amountValues(r.prdctAmt, r.feeAmt),
      ...yearAmounts,
      r.note,
    ])
    row.height = 20
    for (let c = 1; c <= noteCol; c++) {
      const cell = row.getCell(c)
      cell.font = { name: FONT_NAME, size: 10 }
      cell.border = borderAt(c)
      const fill = dataFill(c)
      if (fill) cell.fill = fill
      if (c > BASE_COLS && c < noteCol) {
        cell.numFmt = NUM_FMT
        cell.alignment = { horizontal: 'right', vertical: 'middle' }
      } else if (c === QTY_COL) {
        cell.numFmt = '#,##0.###'
        cell.alignment = { horizontal: 'right', vertical: 'middle' }
      } else if (c === 2 || c === 4 || c === noteCol) {
        cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }
      } else {
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      }
    }
  })

  // 표 바깥 테두리는 굵게
  const lastRowNum = 5 + rows.length
  for (let rn = 3; rn <= lastRowNum; rn++) {
    const left = ws.getCell(rn, 1)
    left.border = { ...left.border, left: { style: 'medium' } }
    const right = ws.getCell(rn, noteCol)
    right.border = { ...right.border, right: { style: 'medium' } }
  }
  for (let c = 1; c <= noteCol; c++) {
    const top = ws.getCell(3, c)
    top.border = { ...top.border, top: { style: 'medium' } }
    const bottom = ws.getCell(lastRowNum, c)
    bottom.border = { ...bottom.border, bottom: { style: 'medium' } }
  }

  // 인쇄 설정 — 가로 A4 한 장 폭 맞춤
  ws.pageSetup = {
    paperSize: 9,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    margins: {
      left: 0.4, right: 0.4,
      top: 0.6, bottom: 0.5,
      header: 0.3, footer: 0.3,
    },
  }

  // 다운로드
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const today = new Date()
  const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`
  a.href = url
  a.download = `${projectName ? projectName + '_' : ''}지급자재_계약현황_${dateStr}.xlsx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
