import ExcelJS from 'exceljs'
import {
  setCell,
  mergeSet,
  headerFill,
  addPhotoImageInArea,
} from '@/lib/excel/quality-excel-utils'

interface MaterialLedgerRow {
  nameOrSpec: string
  orderQty: string
  receiveDate: string
  receiveQty: string
  passQtyCurrent: string
  passQtyTotal: string
  failQty: string
  action: string
  releaseDate: string
  releaseQty: string
  remainQty: string
  supervisorConfirm: string
}

const ROWS_PER_PAGE = 25
const TOTAL_COLS = 12 // A~L

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' },
  left: { style: 'thin' },
  bottom: { style: 'thin' },
  right: { style: 'thin' },
}

const NUM_FMT = '#,##0'

function numOrDash(val: string): string | number {
  if (!val || val === '-') return val || ''
  const n = parseFloat(val.replace(/,/g, ''))
  if (isNaN(n)) return val
  return n
}

function formatDate(val: string): string {
  if (!val) return ''
  const m = val.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return val
  return `${m[1].slice(2)}-${m[2]}-${m[3]}`
}

function dataUrlToBase64(dataUrl: string): string {
  return dataUrl.split(',')[1]
}

// 품명/규격("품명\n(규격)")에서 자재명과 중복되는 품명(첫 줄)을 제거하고 규격만 남긴다.
// 수불부는 상단에 "품명 및 규격 : 자재명", 출고요청서는 품명 컬럼이 따로 있어 중복 표기 방지
function stripDupName(nameOrSpec: string, materialName: string): string {
  const [first, ...rest] = nameOrSpec.split('\n')
  if (first.trim() !== materialName.trim()) return nameOrSpec
  return rest.join('\n').replace(/^\(/, '').replace(/\)$/, '').trim()
}

// ── 검수조서(별지 제11호 서식) 관련 타입 ──

export interface MaterialJosaItem {
  name: string // 품명 (규격 첫 줄)
  spec: string // 규격 상세
  unit: string
  qty: number // 계약량 (유효 발주량)
  amt: number // 품대 (원)
}

export interface MaterialInspectionPhotoItem {
  url: string
  caption: string
}

export interface MaterialJosaOpts {
  contractTitle?: string // 계약명 (납품요구 건명, 없으면 자재명)
  dlvrReqNo?: string
  supplier?: string // 공급자 상호
  deadline?: string // 납품기한 (YYYY-MM-DD)
  cndtn?: string // 인도조건
  receiverName?: string // 인수자 성명 기본값 (프로젝트 소유자 = 현장소장)
  josaItems?: MaterialJosaItem[]
  photos?: MaterialInspectionPhotoItem[]
}

// ── 시트 1: 자재 검사(검수)조서 (별지 제11호 서식) ──
// "계약 내용 그대로 검수" 개념 — 내역은 계약 품목 그대로, 금회 검수량 = 계약량, 일자 = 출력일
function addJosaSheet(
  wb: ExcelJS.Workbook,
  josa: MaterialJosaOpts,
  materialName: string,
  projectName: string,
  today: Date,
) {
  const ws = wb.addWorksheet('검수조서')
  ws.columns = [
    { width: 11 }, // A: 품명
    { width: 24 }, // B: 규격
    { width: 6 },  // C: 단위
    { width: 9 },  // D: 계약량-수량
    { width: 12 }, // E: 계약량-금액
    { width: 8 },  // F: 전회-수량
    { width: 10 }, // G: 전회-금액
    { width: 9 },  // H: 금회-수량
    { width: 12 }, // I: 금회-금액
    { width: 8 },  // J: 잔량-수량
    { width: 10 }, // K: 잔량-금액
    { width: 9 },  // L: 비고
  ]

  const yyyy = today.getFullYear()
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const dd = String(today.getDate()).padStart(2, '0')
  const dateStr = `${yyyy}-${mm}-${dd}`

  setCell(ws, 'A1', '[별지 제11호 서식]', { size: 9, border: false })
  ws.getRow(1).height = 18

  mergeSet(ws, 'A3:L3', '자재 검사(검수)조서', {
    size: 22, bold: true, border: false, align: { horizontal: 'center' },
  })
  ws.getRow(3).height = 34

  // ── 상단 정보 표 (5~13행) ──
  const labelOpts = { bold: true, fill: headerFill, align: { horizontal: 'center' as const } }
  const infoRow = (row: number, label: string, value: string) => {
    mergeSet(ws, `A${row}:B${row}`, label, labelOpts)
    mergeSet(ws, `C${row}:L${row}`, value, { align: { horizontal: 'left' } })
    ws.getRow(row).height = 24
  }
  const infoSplitRow = (row: number, label1: string, value1: string, label2: string, value2: string) => {
    mergeSet(ws, `A${row}:B${row}`, label1, labelOpts)
    mergeSet(ws, `C${row}:F${row}`, value1, { align: { horizontal: 'left' } })
    mergeSet(ws, `G${row}:H${row}`, label2, labelOpts)
    mergeSet(ws, `I${row}:L${row}`, value2, { align: { horizontal: 'left' } })
    ws.getRow(row).height = 24
  }

  infoRow(5, '계약명', josa.contractTitle || materialName)
  infoRow(6, '납품요구번호', josa.dlvrReqNo || '')
  infoSplitRow(7, '납품기한', josa.deadline || '', '납품 완료일', dateStr)
  infoSplitRow(8, '검사 요청일', dateStr, '검사 완료일', dateStr)
  infoSplitRow(9, '인도 조건', josa.cndtn || '', '납품 장소', projectName)

  // 공급자 또는 도급자 — 상호(대표자) / 주소 2단
  mergeSet(ws, 'A10:A11', '공급자\n또는\n도급자', { ...labelOpts, size: 9 })
  setCell(ws, 'B10', '상호(대표자)', labelOpts)
  mergeSet(ws, 'C10:L10', josa.supplier || '', { align: { horizontal: 'left' } })
  setCell(ws, 'B11', '주  소', labelOpts)
  mergeSet(ws, 'C11:L11', '', { align: { horizontal: 'left' } })
  ws.getRow(10).height = 24
  ws.getRow(11).height = 24

  infoRow(12, '완성 또는 납품정도', '납품 완료')
  infoRow(13, '검사(검수)자 의견', '계약(납품요구) 내용과 같이 검수함')

  // ── < 내 역 > 표 (15행~) ──
  mergeSet(ws, 'A15:L15', '< 내  역 >', {
    size: 14, bold: true, border: false, align: { horizontal: 'center' },
  })
  ws.getRow(15).height = 26
  mergeSet(ws, 'A16:L16', '(단위 : 원)', { size: 9, border: false, align: { horizontal: 'right' } })

  // 3단 헤더 (17~19행)
  mergeSet(ws, 'A17:A19', '품명', labelOpts)
  mergeSet(ws, 'B17:B19', '규격', labelOpts)
  mergeSet(ws, 'C17:C19', '단위', labelOpts)
  mergeSet(ws, 'D17:E18', '계약량', labelOpts)
  mergeSet(ws, 'F17:K17', '검사(검수량)', labelOpts)
  mergeSet(ws, 'L17:L19', '비고', labelOpts)
  mergeSet(ws, 'F18:G18', '전회', labelOpts)
  mergeSet(ws, 'H18:I18', '금회', labelOpts)
  mergeSet(ws, 'J18:K18', '잔량', labelOpts)
  for (const c of ['D', 'F', 'H', 'J']) setCell(ws, `${c}19`, '수량', labelOpts)
  for (const c of ['E', 'G', 'I', 'K']) setCell(ws, `${c}19`, '금액', labelOpts)
  for (let row = 17; row <= 19; row++) ws.getRow(row).height = 20

  // 데이터 행 — 금회 = 계약량 (전량 검수), 전회·잔량 공란. 최소 3행으로 양식 형태 유지
  const QTY_FMT = '#,##0.###'
  const items = josa.josaItems || []
  let r = 20
  const rowCount = Math.max(items.length, 3)
  for (let i = 0; i < rowCount; i++) {
    const item = items[i]
    setCell(ws, `A${r}`, item?.name || '', { size: 9, align: { horizontal: 'center' } })
    setCell(ws, `B${r}`, item?.spec || '', { size: 8, align: { horizontal: 'left' } })
    setCell(ws, `C${r}`, item?.unit || '', { size: 9, align: { horizontal: 'center' } })
    const qtyVal = item && item.qty > 0 ? item.qty : ''
    const amtVal = item && item.amt > 0 ? item.amt : ''
    setCell(ws, `D${r}`, qtyVal, { size: 9, align: { horizontal: 'right' } })
    setCell(ws, `E${r}`, amtVal, { size: 9, align: { horizontal: 'right' } })
    setCell(ws, `F${r}`, '', {})
    setCell(ws, `G${r}`, '', {})
    setCell(ws, `H${r}`, qtyVal, { size: 9, align: { horizontal: 'right' } })
    setCell(ws, `I${r}`, amtVal, { size: 9, align: { horizontal: 'right' } })
    setCell(ws, `J${r}`, '', {})
    setCell(ws, `K${r}`, '', {})
    setCell(ws, `L${r}`, '', {})
    for (const c of ['D', 'H']) {
      const cell = ws.getCell(`${c}${r}`)
      if (typeof cell.value === 'number') cell.numFmt = QTY_FMT
    }
    for (const c of ['E', 'I']) {
      const cell = ws.getCell(`${c}${r}`)
      if (typeof cell.value === 'number') cell.numFmt = NUM_FMT
    }
    ws.getRow(r).height = items.length > 0 && item?.spec ? 34 : 24
    r++
  }

  // 계 행
  const sumQty = items.reduce((s, it) => s + (it.qty || 0), 0)
  const sumAmt = items.reduce((s, it) => s + (it.amt || 0), 0)
  mergeSet(ws, `A${r}:C${r}`, '계', { bold: true, align: { horizontal: 'center' } })
  setCell(ws, `D${r}`, sumQty > 0 ? sumQty : '', { size: 9, bold: true, align: { horizontal: 'right' } })
  setCell(ws, `E${r}`, sumAmt > 0 ? sumAmt : '', { size: 9, bold: true, align: { horizontal: 'right' } })
  setCell(ws, `F${r}`, '', {})
  setCell(ws, `G${r}`, '', {})
  setCell(ws, `H${r}`, sumQty > 0 ? sumQty : '', { size: 9, bold: true, align: { horizontal: 'right' } })
  setCell(ws, `I${r}`, sumAmt > 0 ? sumAmt : '', { size: 9, bold: true, align: { horizontal: 'right' } })
  setCell(ws, `J${r}`, '', {})
  setCell(ws, `K${r}`, '', {})
  setCell(ws, `L${r}`, '', {})
  for (const c of ['D', 'H']) {
    const cell = ws.getCell(`${c}${r}`)
    if (typeof cell.value === 'number') cell.numFmt = QTY_FMT
  }
  for (const c of ['E', 'I']) {
    const cell = ws.getCell(`${c}${r}`)
    if (typeof cell.value === 'number') cell.numFmt = NUM_FMT
  }
  ws.getRow(r).height = 24
  r += 2

  // ── 하단 보고문·일자·인수자·결재란 ──
  mergeSet(ws, `A${r}:L${r}`, '위와 같이 검사(검수)하였기 보고합니다.', {
    size: 11, bold: true, border: false, align: { horizontal: 'left' },
  })
  ws.getRow(r).height = 24
  r += 2

  mergeSet(ws, `A${r}:L${r}`, `${yyyy}년 ${mm}월 ${dd}일`, {
    size: 12, border: false, align: { horizontal: 'center' },
  })
  ws.getRow(r).height = 24
  r += 2

  // 인수자 1행 기본값 — 직급 현장소장, 성명 프로젝트 소유자
  const receiver = josa.receiverName || ''
  mergeSet(ws, `E${r}:L${r}`, `인 수 자   (직급) 현장소장   (성명) ${receiver || '          '}          (인)`, {
    size: 10, border: false, align: { horizontal: 'left' },
  })
  ws.getRow(r).height = 22
  r++
  mergeSet(ws, `E${r}:L${r}`, '              (직급)              (성명)                    (인)', {
    size: 10, border: false, align: { horizontal: 'left' },
  })
  ws.getRow(r).height = 22
  r += 2

  // 결재란 (우측)
  mergeSet(ws, `G${r}:H${r}`, '담 당', labelOpts)
  mergeSet(ws, `I${r}:J${r}`, '부 장', labelOpts)
  mergeSet(ws, `K${r}:K${r + 1}`, `${mm}월\n${dd}일`, { size: 9, align: { horizontal: 'center' } })
  mergeSet(ws, `L${r}:L${r + 1}`, '결  재', { bold: true, align: { horizontal: 'center' } })
  ws.getRow(r).height = 20
  r++
  mergeSet(ws, `G${r}:H${r}`, '')
  mergeSet(ws, `I${r}:J${r}`, '')
  ws.getRow(r).height = 40
  r++
  mergeSet(ws, `A${r}:L${r}`, '※ 전자결재시 서면결재 생략가능', {
    size: 9, border: false, align: { horizontal: 'right' },
  })

  ws.pageSetup = {
    paperSize: 9,
    orientation: 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    printArea: `A1:L${r}`,
    margins: {
      left: 0.5, right: 0.5,
      top: 0.6, bottom: 0.5,
      header: 0.3, footer: 0.3,
    },
  }
}

// ── 시트 2: 검사(검수) 사진대지 — 1페이지당 사진 2컷 + 사진설명 ──
const PHOTO_COL_W = 15 // A~F 열 폭 (단위당 8px — 한국어 Excel 실측, inspection-photo-report와 동일)
const PHOTO_COL_PX = PHOTO_COL_W * 8
const PHOTO_ROW_H = 22 // 행 높이 (pt)
const PHOTO_ROW_PX = PHOTO_ROW_H * (4 / 3)
const PHOTO_AREA_ROWS = 12 // 사진 1칸이 차지하는 행 수

async function addPhotoLedgerSheet(
  wb: ExcelJS.Workbook,
  photos: MaterialInspectionPhotoItem[],
  projectName: string,
  materialName: string,
) {
  const ws = wb.addWorksheet('사진대지', {
    pageSetup: {
      paperSize: 9,
      orientation: 'portrait',
      horizontalCentered: true,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0, // 페이지 나눔(1페이지당 2컷)이 그대로 유지되게 세로는 자동
      margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
    },
  })
  ws.columns = Array(6).fill({ width: PHOTO_COL_W })

  let r = 1
  for (let p = 0; p < photos.length; p += 2) {
    // 제목 + 헤더 표 (페이지마다 반복)
    mergeSet(ws, `A${r}:F${r}`, '검사(검수) 사진대지', {
      size: 18, bold: true, border: false, align: { horizontal: 'center' },
    })
    ws.getRow(r).height = 34
    r++

    setCell(ws, `A${r}`, '공 사 명', { bold: true, fill: headerFill, align: { horizontal: 'center' } })
    mergeSet(ws, `B${r}:F${r}`, projectName, { align: { horizontal: 'left' } })
    ws.getRow(r).height = PHOTO_ROW_H
    r++

    setCell(ws, `A${r}`, '구    분', { bold: true, fill: headerFill, align: { horizontal: 'center' } })
    mergeSet(ws, `B${r}:F${r}`, materialName, { align: { horizontal: 'left' } })
    ws.getRow(r).height = PHOTO_ROW_H
    r++

    // 사진 칸 2개 — 항상 2칸을 그려 양식 형태 유지, 사진이 없으면 빈 칸
    for (let i = 0; i < 2; i++) {
      const photo = photos[p + i]
      const areaStart = r
      const areaEnd = r + PHOTO_AREA_ROWS - 1
      for (let row = areaStart; row <= areaEnd; row++) ws.getRow(row).height = PHOTO_ROW_H
      mergeSet(ws, `A${areaStart}:F${areaEnd}`, '')
      if (photo) {
        await addPhotoImageInArea(wb, ws, photo.url, {
          col: 0,
          row: areaStart,
          colWidthsPx: Array(6).fill(PHOTO_COL_PX),
          rowHeightPx: PHOTO_ROW_PX,
          rowCount: PHOTO_AREA_ROWS,
        })
      }
      r = areaEnd + 1

      setCell(ws, `A${r}`, '사진설명', { bold: true, fill: headerFill, align: { horizontal: 'center' } })
      mergeSet(ws, `B${r}:F${r}`, photo?.caption || '', { align: { horizontal: 'left' } })
      ws.getRow(r).height = PHOTO_ROW_H
      r++
    }

    if (p + 2 < photos.length) {
      ws.getRow(r - 1).addPageBreak()
    }
  }
}

/**
 * 주요자재 수불부 및 검사부 Excel 다운로드
 * 시트 구성: ①검수조서(별지 제11호) ②사진대지(검수 사진이 있을 때만) ③수불부 ④출고요청서
 * 수불부 컬럼: A품명/규격 B발주량 C반입일 D반입량 E합격금회 F합격누계 G불합격량 H조치사항 I출고일 J출고량 K잔량 L감독원확인
 */
export async function downloadMaterialLedgerExcel(
  materialName: string,
  materialUnit: string,
  rows: MaterialLedgerRow[],
  projectName?: string,
  supervisorName?: string,
  josa?: MaterialJosaOpts,
) {
  const wb = new ExcelJS.Workbook()
  const today = new Date()

  // ── 시트 1: 자재 검사(검수)조서 ──
  if (josa) {
    addJosaSheet(wb, josa, materialName, projectName || '', today)
  }

  // ── 시트 2: 검사(검수) 사진대지 (검수 사진이 있을 때만) ──
  if (josa?.photos && josa.photos.length > 0) {
    await addPhotoLedgerSheet(wb, josa.photos, projectName || '', materialName)
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE))

  for (let page = 0; page < totalPages; page++) {
    const sheetName = totalPages === 1 ? '수불부' : `수불부(${page + 1})`
    const ws = wb.addWorksheet(sheetName)

    // 열 너비 (A~L, 12열) — 세로(portrait) A4
    ws.columns = [
      { width: 14 },  // A: 품명 및 규격
      { width: 11 },  // B: 발주량(설계량)
      { width: 10 },  // C: 반입일
      { width: 9 },   // D: 반입량
      { width: 9 },   // E: 합격량-금회
      { width: 9 },   // F: 합격량-누계
      { width: 9 },   // G: 불합격량
      { width: 11 },  // H: 조치사항
      { width: 10 },  // I: 출고일
      { width: 9 },   // J: 출고량
      { width: 9 },   // K: 잔량(보관)
      { width: 11 },  // L: 감독원확인
    ]

    // ── Row 1: [별지 제2호 서식] ──
    const r1 = ws.addRow(['[별지 제2호 서식]'])
    r1.getCell(1).font = { size: 9, color: { argb: 'FF333333' } }
    r1.height = 20

    // ── Row 2: 빈 행 ──
    ws.addRow([])

    // ── Row 3: 제목 ──
    ws.mergeCells('A3:L3')
    const titleCell = ws.getCell('A3')
    titleCell.value = '주요자재 수불부 및 검사부'
    titleCell.font = { size: 28, bold: true }
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getRow(3).height = 36

    // ── Row 4: 빈 행 ──
    ws.addRow([])

    // ── Row 5: 품명 및 규격 / 단위 ──
    ws.mergeCells('A5:G5')
    const specCell = ws.getCell('A5')
    specCell.value = `품명 및 규격 : ${materialName}`
    specCell.font = { size: 10 }
    specCell.alignment = { horizontal: 'left', vertical: 'middle' }

    ws.mergeCells('J5:L5')
    const unitCell = ws.getCell('J5')
    unitCell.value = `(단위 : ${materialUnit || ''})`
    unitCell.font = { size: 10 }
    unitCell.alignment = { horizontal: 'right', vertical: 'middle' }
    ws.getRow(5).height = 22

    // ── Row 6~7: 2단 헤더 ──
    const hdrRow1 = 6
    const hdrRow2 = 7

    // 품명 및 규격: A6:A7 merge
    ws.mergeCells(`A${hdrRow1}:A${hdrRow2}`)
    const h_spec = ws.getCell(`A${hdrRow1}`)
    h_spec.value = '품명 및\n규격'
    h_spec.font = { size: 9, bold: true }
    h_spec.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    h_spec.border = thinBorder

    // 발주량(설계량): B6:B7 merge
    ws.mergeCells(`B${hdrRow1}:B${hdrRow2}`)
    const h_order = ws.getCell(`B${hdrRow1}`)
    h_order.value = '발주량\n(설계량)'
    h_order.font = { size: 9, bold: true }
    h_order.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    h_order.border = thinBorder

    // 반입: C6:D6 merge
    ws.mergeCells(`C${hdrRow1}:D${hdrRow1}`)
    const h_receive = ws.getCell(`C${hdrRow1}`)
    h_receive.value = '반입'
    h_receive.font = { size: 9, bold: true }
    h_receive.alignment = { horizontal: 'center', vertical: 'middle' }
    h_receive.border = thinBorder
    ws.getCell(`D${hdrRow1}`).border = thinBorder

    // 합격량: E6:F6 merge
    ws.mergeCells(`E${hdrRow1}:F${hdrRow1}`)
    const h_pass = ws.getCell(`E${hdrRow1}`)
    h_pass.value = '합격량'
    h_pass.font = { size: 9, bold: true }
    h_pass.alignment = { horizontal: 'center', vertical: 'middle' }
    h_pass.border = thinBorder
    ws.getCell(`F${hdrRow1}`).border = thinBorder

    // 불합격: G6:H6 merge
    ws.mergeCells(`G${hdrRow1}:H${hdrRow1}`)
    const h_fail = ws.getCell(`G${hdrRow1}`)
    h_fail.value = '불합격'
    h_fail.font = { size: 9, bold: true }
    h_fail.alignment = { horizontal: 'center', vertical: 'middle' }
    h_fail.border = thinBorder
    ws.getCell(`H${hdrRow1}`).border = thinBorder

    // 출고: I6:J6 merge
    ws.mergeCells(`I${hdrRow1}:J${hdrRow1}`)
    const h_release = ws.getCell(`I${hdrRow1}`)
    h_release.value = '출고'
    h_release.font = { size: 9, bold: true }
    h_release.alignment = { horizontal: 'center', vertical: 'middle' }
    h_release.border = thinBorder
    ws.getCell(`J${hdrRow1}`).border = thinBorder

    // 잔량(보관): K6:K7 merge
    ws.mergeCells(`K${hdrRow1}:K${hdrRow2}`)
    const h_remain = ws.getCell(`K${hdrRow1}`)
    h_remain.value = '잔량\n(보관)'
    h_remain.font = { size: 9, bold: true }
    h_remain.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    h_remain.border = thinBorder

    // 감독원확인: L6:L7 merge
    ws.mergeCells(`L${hdrRow1}:L${hdrRow2}`)
    const h_confirm = ws.getCell(`L${hdrRow1}`)
    h_confirm.value = '감독원\n확인'
    h_confirm.font = { size: 9, bold: true }
    h_confirm.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    h_confirm.border = thinBorder

    ws.getRow(hdrRow1).height = 22

    // Row 7: 하단 헤더
    //           A    B    C       D       E      F      G         H         I       J       K    L
    const sub = ['', '', '반입일', '반입량', '금회', '누계', '불합격량', '조치사항', '출고일', '출고량', '', '']
    sub.forEach((label, ci) => {
      const cell = ws.getCell(hdrRow2, ci + 1)
      if (label) {
        cell.value = label
      }
      cell.font = { size: 9, bold: true }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
      cell.border = thinBorder
    })
    // 병합된 셀 border 보정
    ws.getCell(`A${hdrRow2}`).border = thinBorder
    ws.getCell(`B${hdrRow2}`).border = thinBorder
    ws.getCell(`K${hdrRow2}`).border = thinBorder
    ws.getCell(`L${hdrRow2}`).border = thinBorder
    ws.getRow(hdrRow2).height = 22

    // 헤더 배경색
    for (let r = hdrRow1; r <= hdrRow2; r++) {
      for (let c = 1; c <= TOTAL_COLS; c++) {
        const cell = ws.getCell(r, c)
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } }
      }
    }

    // ── 데이터 행 ──
    const startIdx = page * ROWS_PER_PAGE
    const pageRows = rows.slice(startIdx, startIdx + ROWS_PER_PAGE)

    for (let i = 0; i < ROWS_PER_PAGE; i++) {
      const dataRow = pageRows[i]
      const hasSignature = dataRow?.supervisorConfirm && dataRow.supervisorConfirm.startsWith('data:image')

      const excelRow = ws.addRow([
        dataRow ? stripDupName(dataRow.nameOrSpec || '', materialName) : '', // A: 품명/규격 (자재명과 같은 품명은 제외)
        dataRow ? numOrDash(dataRow.orderQty) : '',          // B: 발주량
        dataRow ? formatDate(dataRow.receiveDate) : '',      // C: 반입일
        dataRow ? numOrDash(dataRow.receiveQty) : '',        // D: 반입량
        dataRow ? numOrDash(dataRow.passQtyCurrent) : '',    // E: 합격-금회
        dataRow ? numOrDash(dataRow.passQtyTotal) : '',      // F: 합격-누계
        dataRow ? (dataRow.failQty || '') : '',              // G: 불합격량
        dataRow ? (dataRow.action || '') : '',               // H: 조치사항
        dataRow ? formatDate(dataRow.releaseDate) : '',      // I: 출고일
        dataRow ? numOrDash(dataRow.releaseQty) : '',        // J: 출고량
        dataRow ? numOrDash(dataRow.remainQty) : '',         // K: 잔량 (실제 값 사용)
        hasSignature ? '' : (dataRow?.supervisorConfirm || ''), // L: 감독원확인
      ])

      const rowNum = excelRow.number
      excelRow.height = 32

      excelRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
        if (colNum <= TOTAL_COLS) {
          cell.border = thinBorder
          cell.alignment = { horizontal: 'center', vertical: 'middle' }
          cell.font = { size: 9 }
        }
      })

      // 수량 컬럼에 1000단위 콤마 서식 (B, D, E, F, J, K)
      const numCols = [2, 4, 5, 6, 10, 11]
      for (const col of numCols) {
        const cell = excelRow.getCell(col)
        if (typeof cell.value === 'number') {
          cell.numFmt = NUM_FMT
        }
      }

      // 잔량(K) - 웹 내역상 값 그대로 사용
      const kCell = excelRow.getCell(11) // K열
      if (typeof kCell.value === 'number') {
        kCell.numFmt = NUM_FMT
      }
      kCell.border = thinBorder
      kCell.alignment = { horizontal: 'center', vertical: 'middle' }
      kCell.font = { size: 9 }

      // 품명/규격(A) 가운데 정렬 + 줄바꿈 표시 (품명\n(규격) 형식)
      excelRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      // 조치사항(H) 가운데 정렬
      excelRow.getCell(8).alignment = { horizontal: 'center', vertical: 'middle' }

      // 감독원확인(L) 서명 이미지 삽입
      if (hasSignature) {
        try {
          const imgBase64 = dataUrlToBase64(dataRow.supervisorConfirm)
          const imageId = wb.addImage({ base64: imgBase64, extension: 'png' })
          ws.addImage(imageId, {
            tl: { col: 11, row: rowNum - 1 + 0.1 } as ExcelJS.Anchor,
            br: { col: 12, row: rowNum - 1 + 0.9 } as ExcelJS.Anchor,
          })
        } catch {
          excelRow.getCell(12).value = '서명완료'
        }
      }
    }

    // ── 하단 안내문 ──
    const footerRowNum = hdrRow2 + ROWS_PER_PAGE + 1
    ws.addRow([])
    ws.mergeCells(`A${footerRowNum}:L${footerRowNum}`)
    const footerCell = ws.getCell(`A${footerRowNum}`)
    footerCell.value = '* 현장 반입 후 작업장 반출시 까지는 감독원이 관리하고 매 출고시 반출량 및 잔량을 확인'
    footerCell.font = { size: 9, color: { argb: 'FF666666' } }
    footerCell.alignment = { horizontal: 'left', vertical: 'middle' }

    // 인쇄 영역: A~L만 (M열 제외)
    const lastPrintRow = footerRowNum
    ws.pageSetup = {
      paperSize: 9,
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      printArea: `A1:L${lastPrintRow}`,
      margins: {
        left: 0.5, right: 0.5,
        top: 0.6, bottom: 0.5,
        header: 0.3, footer: 0.3,
      },
    }
  }

  // ── 출고요청서 시트 (데이터 행별 1장씩) ──
  const RELEASE_DATA_ROWS = 10 // 출고요청서 테이블 빈 행 수

  rows.forEach((row, idx) => {
    // 출고량이 없는 행은 건너뜀
    const releaseQtyNum = parseFloat((row.releaseQty || '').replace(/,/g, ''))
    if (!row.releaseDate && (isNaN(releaseQtyNum) || releaseQtyNum === 0)) return

    const sheetLabel = `출고요청서(${idx + 1})`
    const ws = wb.addWorksheet(sheetLabel)

    // 열 너비 (A~E, 5열)
    ws.columns = [
      { width: 18 },  // A: 품명
      { width: 16 },  // B: 규격
      { width: 10 },  // C: 단위
      { width: 14 },  // D: 수량
      { width: 24 },  // E: 사용처
    ]

    // Row 1: [별지 제6호 서식]
    const r1 = ws.addRow(['[별지 제6호 서식]'])
    r1.getCell(1).font = { size: 9, color: { argb: 'FF333333' } }
    r1.height = 20

    // Row 2: 빈 행
    ws.addRow([])

    // Row 3: 제목
    ws.mergeCells('A3:E3')
    const titleCell = ws.getCell('A3')
    titleCell.value = '지급자재 출고 요청서'
    titleCell.font = { size: 28, bold: true }
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getRow(3).height = 48

    // Row 4: 빈 행
    ws.addRow([])

    // Row 5: 테이블 헤더
    const hdrLabels = ['품    명', '규    격', '단  위', '수    량', '사  용  처']
    const hdrRow = ws.addRow(hdrLabels)
    hdrRow.height = 28
    hdrRow.eachCell((cell) => {
      cell.font = { size: 11, bold: true }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
      cell.border = thinBorder
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } }
    })

    // Row 6: 실제 데이터 (1행) — 품명 컬럼이 따로 있으므로 규격에는 품명 제외한 내용만
    const dataExcelRow = ws.addRow([
      materialName || '',
      stripDupName(row.nameOrSpec || '', materialName),
      materialUnit || '',
      numOrDash(row.releaseQty),
      projectName || '',
    ])
    dataExcelRow.height = 32
    dataExcelRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
      if (colNum <= 5) {
        cell.border = thinBorder
        // 사용처(E열)·규격(B열)은 자동 줄바꿈 적용
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: colNum === 5 || colNum === 2 }
        cell.font = { size: 10 }
      }
    })
    // 수량에 콤마 서식
    const qtyCell = dataExcelRow.getCell(4)
    if (typeof qtyCell.value === 'number') {
      qtyCell.numFmt = NUM_FMT
    }

    // Row 7~: 나머지 빈 행
    for (let i = 1; i < RELEASE_DATA_ROWS; i++) {
      const emptyRow = ws.addRow(['', '', '', '', ''])
      emptyRow.height = 32
      emptyRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
        if (colNum <= 5) {
          cell.border = thinBorder
          cell.alignment = { horizontal: 'center', vertical: 'middle' }
          cell.font = { size: 10 }
        }
      })
    }

    // 계 행
    const totalRowNum = 5 + RELEASE_DATA_ROWS + 1 // 헤더(5) + 데이터행 + 1
    const totalRow = ws.addRow(['계', '', '', numOrDash(row.releaseQty), ''])
    totalRow.height = 32
    totalRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
      if (colNum <= 5) {
        cell.border = thinBorder
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
        cell.font = { size: 10, bold: colNum === 1 }
      }
    })
    const totalQtyCell = totalRow.getCell(4)
    if (typeof totalQtyCell.value === 'number') {
      totalQtyCell.numFmt = NUM_FMT
    }

    // 빈 행 2줄
    ws.addRow([])
    ws.addRow([])

    // 날짜 행: 출고일 기반
    const dateMatch = (row.releaseDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
    const yr = dateMatch ? dateMatch[1] : '    '
    const mo = dateMatch ? dateMatch[2] : '  '
    const dy = dateMatch ? dateMatch[3] : '  '

    const dateRowNum = totalRowNum + 3
    ws.mergeCells(`B${dateRowNum}:E${dateRowNum}`)
    const dateCell = ws.getCell(`B${dateRowNum}`)
    dateCell.value = `${yr}년       ${mo}월       ${dy}일`
    dateCell.font = { size: 11 }
    dateCell.alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getRow(dateRowNum).height = 28

    // 요청자 행
    const reqRowNum = dateRowNum + 1
    ws.mergeCells(`B${reqRowNum}:D${reqRowNum}`)
    const reqLabel = ws.getCell(`B${reqRowNum}`)
    reqLabel.value = '요청자 : 현장대리인'
    reqLabel.font = { size: 11 }
    reqLabel.alignment = { horizontal: 'center', vertical: 'middle' }
    // E열: 서명란 (비워둠)
    const reqSign = ws.getCell(`E${reqRowNum}`)
    reqSign.value = '(인)'
    reqSign.font = { size: 11 }
    reqSign.alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getRow(reqRowNum).height = 32

    // 확인자 행
    const cfmRowNum = reqRowNum + 1
    ws.mergeCells(`B${cfmRowNum}:D${cfmRowNum}`)
    const cfmLabel = ws.getCell(`B${cfmRowNum}`)
    cfmLabel.value = supervisorName ? `확인자 : 공사감독 ${supervisorName}` : '확인자 : 공 사 감 독'
    cfmLabel.font = { size: 11 }
    cfmLabel.alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getRow(cfmRowNum).height = 32

    // 감독 서명 이미지 삽입
    const hasSignature = row.supervisorConfirm && row.supervisorConfirm.startsWith('data:image')
    if (hasSignature) {
      try {
        const imgBase64 = dataUrlToBase64(row.supervisorConfirm)
        const imageId = wb.addImage({ base64: imgBase64, extension: 'png' })
        ws.addImage(imageId, {
          tl: { col: 4, row: cfmRowNum - 1 + 0.05 } as ExcelJS.Anchor,
          br: { col: 5, row: cfmRowNum - 1 + 0.95 } as ExcelJS.Anchor,
        })
      } catch {
        ws.getCell(`E${cfmRowNum}`).value = '(인)'
      }
    } else {
      ws.getCell(`E${cfmRowNum}`).value = '(인)'
      ws.getCell(`E${cfmRowNum}`).font = { size: 11 }
      ws.getCell(`E${cfmRowNum}`).alignment = { horizontal: 'center', vertical: 'middle' }
    }

    // 인쇄 설정
    ws.pageSetup = {
      paperSize: 9,
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      horizontalCentered: true,
      printArea: `A1:E${cfmRowNum}`,
      margins: {
        left: 0.7, right: 0.7,
        top: 0.6, bottom: 0.5,
        header: 0.3, footer: 0.3,
      },
    }
  })

  // 다운로드
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`
  a.href = url
  a.download = `${projectName ? projectName + '_' : ''}자재수불부_${materialName}_${dateStr}.xlsx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
