// 특별점검(굴삭기 버킷 사고) 붙임4 「점검 결과 총괄표」를 ExcelJS로 원본 양식대로 그려 내려받는다.
import ExcelJS from 'exceljs'
import { excavatorFindings, excavatorStats, findingsByCategory } from '@/lib/special-inspection-770/summary'
import type { Special770InspectionData } from '@/lib/special-inspection-770/types'

/** 총괄표 원천. 점검 1건(현장 1회)과 그 현장 정보. projects.ts의 getSpecial770SummaryRows 결과와 호환된다. */
export interface Special770SummarySource {
  inspection_date: string
  district_name?: string | null
  data: Special770InspectionData | null
  project: {
    project_name: string
    project_category?: string | null
    managing_hq?: string | null
    managing_branch?: string | null
  }
}

/** 총괄표 데이터 1행 = 굴착기 1대 */
export interface Special770SummaryRow {
  hq: string
  branch: string
  /** D 사업유형(project_category). */
  unitBusiness: string
  /** E 세부사업명(현장명) */
  detailBusiness: string
  district: string
  vehicleNo: string
  /** H 점검일 'YY.MM.DD' */
  inspectionDate: string
  /** 대분류 1~4 순서의 지적·조치 문구 */
  categories: { findings: string; actions: string }[]
  findings: number
  completed: number
  pending: number
  /** T 조치예정일 YYYY-MM-DD. 미조치가 없으면 빈 문자열 */
  dueDate: string
  pinPhotoUrl: string | null
}

export interface Special770SummaryImage {
  base64: string
  extension: 'jpeg' | 'png' | 'gif'
  width: number
  height: number
}

export interface Special770SummaryBuildOptions {
  /** pinPhotoUrl → 이미지. 없거나 빠진 URL은 빈칸으로 둔다. */
  images?: Map<string, Special770SummaryImage>
}

export type Special770ImageFetcher = (url: string) => Promise<{ data: Uint8Array; contentType?: string | null }>

export const SPECIAL_770_SUMMARY_SHEET_NAME = '점검결과 총괄표'

const FONT_NAME = '맑은 고딕'
const HEADER_FILL = 'FFDBEEF3'
const TOTAL_FILL = 'FFD7E4BC'
const ACCOUNTING_FMT = '_-* #,##0_-;\\-* #,##0_-;_-* "-"_-;_-@_-'
const FIRST_DATA_ROW = 7
const TOTAL_ROW = 6
const HEADER_ROW_HEIGHT = 31.5
const DATA_ROW_HEIGHT = 114.75

/** 원본 열 너비(문자 단위). C는 원본이 기본 너비라 9로 둔다. */
const COLUMN_WIDTHS: Record<string, number> = {
  A: 13, B: 11.75, C: 9, D: 23.5, E: 23.5, F: 14.125, G: 14.125, H: 12.75,
  I: 24.75, J: 24.75, K: 27.875, L: 24.75, M: 24.75, N: 24.75, O: 24.75, P: 24.75,
  Q: 10.875, R: 10.875, S: 10.875, T: 10.875, U: 22.875,
}

const MERGES = [
  'B3:B5', 'C3:C5', 'D3:D5', 'E3:E5', 'F3:F5', 'G3:G5', 'H3:H5', 'U3:U5',
  'I3:P3', 'I4:J4', 'K4:L4', 'M4:N4', 'O4:P4', 'Q3:T4',
]

const HEADER_LABELS: Record<string, string> = {
  B3: '본부/사업단',
  C3: '지사',
  D3: '사업유형',
  E3: '세부사업명',
  F3: '지구명',
  G3: '굴착기 \n등록번호\n(차량번호)',
  H3: '점검일',
  I3: '특별점검 지적 및 조치 사항',
  I4: '1. 사전조사 및 절차 준수',
  K4: '2. 운전 시작 전 현장 확인',
  M4: '3. 운전 중 현장 확인',
  O4: '4. 기타 점검 사항',
  I5: '지적사항', J5: '조치사항',
  K5: '지적사항', L5: '조치사항',
  M5: '지적사항', N5: '조치사항',
  O5: '지적사항', P5: '조치사항',
  Q3: '조치 현황',
  Q5: '지적사항', R5: '조치완료', S5: '조치중', T5: '조치예정일',
  U3: '증빙사진\n(굴착기 안전핀)',
}

const FIRST_COL = 2 // B
const LAST_COL = 21 // U
const CENTER_COLS = new Set(['B', 'C', 'D', 'E', 'F', 'G', 'H', 'Q', 'R', 'S', 'T'])
const TEXT_COLS = ['I', 'J', 'K', 'L', 'M', 'N', 'O', 'P']

function colLetter(col: number): string {
  return String.fromCharCode(64 + col)
}

/** 'YYYY-MM-DD' → 'YY.MM.DD'. 형식이 다르면 원문을 그대로 둔다. */
export function formatSpecial770InspectionDate(date: string): string {
  const match = (date || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  return match ? `${match[1].slice(2)}.${match[2]}.${match[3]}` : (date || '')
}

/** 점검 지구명을 우선하고, 없으면 현장명에서 지구까지(없으면 첫 단어) 추출한다. */
function summaryDistrict(source: Special770SummarySource): string {
  const name = (source.district_name?.trim() || source.project.project_name || '').trim()
  return name.match(/^(.+?지구)/)?.[1] || name.split(/\s+/)[0] || ''
}

/** 점검 목록을 굴착기 1대 = 1행으로 펴고 본부 → 지사 → 현장명 → 점검일 순으로 정렬한다. */
export function toSpecial770SummaryRows(sources: Special770SummarySource[]): Special770SummaryRow[] {
  const ordered = sources
    .map((source, index) => ({ source, index }))
    .sort((a, b) => {
      const pa = a.source.project
      const pb = b.source.project
      return (pa.managing_hq || '').localeCompare(pb.managing_hq || '', 'ko')
        || (pa.managing_branch || '').localeCompare(pb.managing_branch || '', 'ko')
        || (pa.project_name || '').localeCompare(pb.project_name || '', 'ko')
        || (a.source.inspection_date || '').localeCompare(b.source.inspection_date || '')
        || a.index - b.index
    })

  return ordered.flatMap(({ source }) => (source.data?.excavators ?? []).map(excavator => {
    const stats = excavatorStats(excavator)
    const categories = findingsByCategory(excavatorFindings(excavator))
    return {
      hq: source.project.managing_hq || '',
      branch: source.project.managing_branch || '',
      unitBusiness: source.project.project_category || '',
      detailBusiness: source.project.project_name || '',
      district: summaryDistrict(source),
      vehicleNo: excavator.vehicle_no || '',
      inspectionDate: formatSpecial770InspectionDate(source.inspection_date),
      categories: categories.map(c => ({ findings: c.findings, actions: c.actions })),
      findings: stats.findings,
      completed: stats.completed,
      pending: stats.pending,
      dueDate: stats.latestDueDate ?? '',
      pinPhotoUrl: excavator.pin_photo_url && excavator.pin_photo_url !== 'N/A' ? excavator.pin_photo_url : null,
    }
  }))
}

function font(bold = false): Partial<ExcelJS.Font> {
  return { name: FONT_NAME, size: 11, bold }
}

function solidFill(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } }
}

/** 표 범위 B3:U{lastRow}에 thin 기본, 바깥 위·좌·우 medium, 헤더 하단 double 테두리를 그린다. */
function applyBorders(ws: ExcelJS.Worksheet, lastRow: number) {
  for (let row = 3; row <= lastRow; row += 1) {
    for (let col = FIRST_COL; col <= LAST_COL; col += 1) {
      ws.getCell(row, col).border = {
        top: { style: row === 3 ? 'medium' : 'thin' },
        left: { style: col === FIRST_COL ? 'medium' : 'thin' },
        right: { style: col === LAST_COL ? 'medium' : 'thin' },
        bottom: { style: row === 5 ? 'double' : 'thin' },
      }
    }
  }
}

/** 붙임4 총괄표 워크북을 만든다. 이미지는 options.images로 미리 받아 둔 것만 붙인다. */
export function buildSpecial770SummaryWorkbook(
  rows: Special770SummaryRow[],
  options: Special770SummaryBuildOptions = {}
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(SPECIAL_770_SUMMARY_SHEET_NAME, {
    properties: { tabColor: { argb: 'FFFFFF00' } },
    views: [{ state: 'frozen', xSplit: 0, ySplit: 5, topLeftCell: 'A6', zoomScale: 70 }],
    pageSetup: {
      // A3(8)는 ExcelJS PaperSize 열거에 없어 숫자를 그대로 넘긴다
      paperSize: 8 as unknown as ExcelJS.PaperSize,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
    },
  })

  for (const [letter, width] of Object.entries(COLUMN_WIDTHS)) {
    ws.getColumn(letter).width = width
  }
  for (let row = 2; row <= TOTAL_ROW; row += 1) {
    ws.getRow(row).height = HEADER_ROW_HEIGHT
  }

  // 3~5행 헤더
  for (let row = 3; row <= 5; row += 1) {
    for (let col = FIRST_COL; col <= LAST_COL; col += 1) {
      const cell = ws.getCell(row, col)
      cell.font = font(true)
      cell.fill = solidFill(HEADER_FILL)
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      const letter = colLetter(col)
      if (letter === 'G' || letter === 'H' || TEXT_COLS.includes(letter)) cell.numFmt = '@'
    }
  }
  for (const [address, label] of Object.entries(HEADER_LABELS)) {
    ws.getCell(address).value = label
  }
  // 하위 셀이 마스터 style을 공유하면 셀별 테두리(헤더 하단 double 등)가 서로 덮이므로 style 없이 병합한다
  for (const range of MERGES) ws.mergeCellsWithoutStyle(range)
  ws.getCell('T5').note = '모든 지적사항 조치 완료일'

  const lastRow = Math.max(TOTAL_ROW, FIRST_DATA_ROW + rows.length - 1)

  // 6행 계
  for (let col = FIRST_COL; col <= LAST_COL; col += 1) {
    const cell = ws.getCell(TOTAL_ROW, col)
    cell.font = font(true)
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  }
  ws.getCell(`B${TOTAL_ROW}`).value = '계'
  for (const letter of ['Q', 'R', 'S']) {
    const cell = ws.getCell(`${letter}${TOTAL_ROW}`)
    const total = rows.reduce((sum, row) => sum + (letter === 'Q' ? row.findings : letter === 'R' ? row.completed : row.pending), 0)
    cell.value = rows.length
      ? { formula: `SUM(${letter}${FIRST_DATA_ROW}:${letter}${lastRow})`, result: total }
      : 0
    cell.numFmt = ACCOUNTING_FMT
    cell.fill = solidFill(TOTAL_FILL)
  }

  // 7행부터 굴착기 1대 = 1행
  rows.forEach((row, index) => {
    const rowNumber = FIRST_DATA_ROW + index
    const excelRow = ws.getRow(rowNumber)
    excelRow.height = DATA_ROW_HEIGHT
    const values: Record<string, string | number> = {
      B: row.hq,
      C: row.branch,
      D: row.unitBusiness,
      E: row.detailBusiness,
      F: row.district,
      G: row.vehicleNo,
      H: row.inspectionDate,
      Q: row.findings,
      R: row.completed,
      S: row.pending,
      T: row.dueDate,
    }
    row.categories.forEach((category, i) => {
      values[TEXT_COLS[i * 2]] = category.findings
      values[TEXT_COLS[i * 2 + 1]] = category.actions
    })

    for (let col = FIRST_COL; col <= LAST_COL; col += 1) {
      const letter = colLetter(col)
      const cell = excelRow.getCell(col)
      cell.font = font()
      if (letter in values) cell.value = values[letter]
      if (CENTER_COLS.has(letter)) {
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      } else if (letter === 'U') {
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
      } else {
        cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }
      }
      if (letter === 'Q' || letter === 'R' || letter === 'S') cell.numFmt = ACCOUNTING_FMT
      if (letter === 'G' || letter === 'H' || letter === 'T') cell.numFmt = '@'
    }

    const image = row.pinPhotoUrl ? options.images?.get(row.pinPhotoUrl) : undefined
    if (image && Number.isFinite(image.width) && image.width > 0 && Number.isFinite(image.height) && image.height > 0) {
      const imageId = wb.addImage({ base64: image.base64, extension: image.extension })
      // 기본 글꼴 기준의 보수적인 열 폭과 실제 행 높이 안에 비율을 유지한다.
      const areaWidth = COLUMN_WIDTHS.U * 7 + 5
      const areaHeight = DATA_ROW_HEIGHT * 96 / 72
      const padding = 6
      const scale = Math.min((areaWidth - padding * 2) / image.width, (areaHeight - padding * 2) / image.height)
      const width = image.width * scale
      const height = image.height * scale
      // 사용자 지정 열의 소수 앵커는 폭이 축소되므로 실제 픽셀을 EMU로 지정한다.
      ws.addImage(imageId, {
        tl: {
          nativeCol: 20,
          nativeColOff: Math.round((areaWidth - width) / 2 * 9525),
          nativeRow: rowNumber - 1,
          nativeRowOff: Math.round((areaHeight - height) / 2 * 9525),
        },
        ext: { width, height },
        editAs: 'oneCell',
      } as unknown as ExcelJS.ImagePosition)
    }
  })

  applyBorders(ws, lastRow)
  return wb
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

function imageExtension(url: string, contentType?: string | null): Special770SummaryImage['extension'] {
  const hint = `${contentType || ''} ${url.split('?')[0]}`.toLowerCase()
  if (hint.includes('png')) return 'png'
  if (hint.includes('gif')) return 'gif'
  return 'jpeg'
}

const defaultFetchImage: Special770ImageFetcher = async (url) => {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`이미지 응답 ${response.status}`)
  return { data: new Uint8Array(await response.arrayBuffer()), contentType: response.headers.get('content-type') }
}

/** 기존 사진 출력처럼 브라우저 디코더에서 원본 크기를 읽어 사전 로드 결과에 보관한다. */
function readImageDimensions(base64: string, extension: Special770SummaryImage['extension']): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      if (image.naturalWidth > 0 && image.naturalHeight > 0) {
        resolve({ width: image.naturalWidth, height: image.naturalHeight })
      } else reject(new Error('이미지 크기를 읽을 수 없습니다.'))
    }
    image.onerror = () => reject(new Error('이미지를 해석할 수 없습니다.'))
    image.src = `data:image/${extension};base64,${base64}`
  })
}

/** 행들의 안전핀 사진을 받아 둔다. 실패한 URL은 빠지고 그 셀은 빈칸이 된다. */
export async function loadSpecial770PinImages(
  rows: Special770SummaryRow[],
  fetchImage: Special770ImageFetcher = defaultFetchImage
): Promise<Map<string, Special770SummaryImage>> {
  const urls = [...new Set(rows.map(row => row.pinPhotoUrl).filter((url): url is string => !!url))]
  const images = new Map<string, Special770SummaryImage>()
  const CONCURRENCY = 6
  for (let i = 0; i < urls.length; i += CONCURRENCY) {
    await Promise.all(urls.slice(i, i + CONCURRENCY).map(async url => {
      try {
        const { data, contentType } = await fetchImage(url)
        const base64 = bytesToBase64(data)
        const extension = imageExtension(url, contentType)
        const dimensions = await readImageDimensions(base64, extension)
        images.set(url, { base64, extension, ...dimensions })
      } catch (error) {
        console.warn('굴삭기 총괄표 안전핀 사진을 불러오지 못했습니다:', url, error)
      }
    }))
  }
  return images
}

export interface Special770SummaryDownloadOptions {
  year: number
  /** 파일명 뒤에 붙일 범위(본부·지사명 등) */
  scopeLabel?: string
  fetchImage?: Special770ImageFetcher
}

/** 엑셀 파일명. 화면·파일명에는 문서번호(770)를 쓰지 않는다. */
export function special770SummaryFileName(year: number, scopeLabel?: string): string {
  const scope = scopeLabel ? `_${scopeLabel}` : ''
  return `특별점검(굴삭기 버킷 사고)_총괄표_${year}${scope}.xlsx`
}

/** 점검 목록으로 붙임4 총괄표를 만들어 내려받는다. */
export async function downloadSpecial770SummaryExcel(
  sources: Special770SummarySource[],
  options: Special770SummaryDownloadOptions
): Promise<void> {
  const rows = toSpecial770SummaryRows(sources)
  if (rows.length === 0) {
    throw new Error('내려받을 굴삭기 특별점검 결과가 없습니다.')
  }

  const images = await loadSpecial770PinImages(rows, options.fetchImage)
  const workbook = buildSpecial770SummaryWorkbook(rows, { images })

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = special770SummaryFileName(options.year, options.scopeLabel)
  anchor.click()
  URL.revokeObjectURL(url)
}
