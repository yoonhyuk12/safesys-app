// 품질시험 결과 관리대장 엑셀 출력 공용 유틸 (셀 스타일·병합·서명 이미지·다운로드)
// 검사/검측 대장(inspection-request-export.ts)의 헬퍼를 다열(A~Z) 대응으로 일반화한 것

import ExcelJS from 'exceljs'

const thin: ExcelJS.Border = { style: 'thin', color: { argb: 'FF000000' } }
export const allBorders: Partial<ExcelJS.Borders> = { top: thin, bottom: thin, left: thin, right: thin }
export const headerFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } }

export interface CellOpts {
  bold?: boolean
  size?: number
  fill?: ExcelJS.Fill
  align?: Partial<ExcelJS.Alignment>
  border?: boolean
  color?: string
  underline?: boolean
}

export const setCell = (
  ws: ExcelJS.Worksheet,
  addr: string,
  value: ExcelJS.CellValue,
  opts: CellOpts = {}
) => {
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

// "AB12" → { col: 28, row: 12 } (col은 1-based)
const parseAddr = (addr: string): { col: number; row: number } => {
  const match = addr.match(/^([A-Z]+)(\d+)$/)
  if (!match) throw new Error(`잘못된 셀 주소: ${addr}`)
  const letters = match[1]
  let col = 0
  for (let i = 0; i < letters.length; i++) {
    col = col * 26 + (letters.charCodeAt(i) - 64)
  }
  return { col, row: parseInt(match[2], 10) }
}

// 병합 범위의 모든 셀에 테두리 적용 (병합 셀 테두리 누락 방지)
export const borderRange = (ws: ExcelJS.Worksheet, range: string) => {
  const [start, end] = range.split(':')
  const s = parseAddr(start)
  const e = parseAddr(end)
  for (let r = s.row; r <= e.row; r++) {
    for (let c = s.col; c <= e.col; c++) {
      ws.getCell(r, c).border = allBorders
    }
  }
}

export const mergeSet = (
  ws: ExcelJS.Worksheet,
  range: string,
  value: ExcelJS.CellValue,
  opts: CellOpts = {}
) => {
  ws.mergeCells(range)
  setCell(ws, range.split(':')[0], value, opts)
  if (opts.border !== false) borderRange(ws, range)
}

// 서명 이미지 삽입 ((인) 표기 위치에 겹쳐서 배치) — col은 0-based, 소수부로 미세 조정.
// offsetXPx/offsetYPx를 주면 소수 앵커 대신 네이티브 EMU 오프셋으로 셀 안에서 정밀 이동한다
// (소수 앵커는 ExcelJS가 열 폭을 width×10000 EMU로 잘못 근사해 오프셋이 크게 축소된다 — 아래 addPhotoImageInArea 주석 참조).
export const addSignatureImage = (
  wb: ExcelJS.Workbook,
  ws: ExcelJS.Worksheet,
  signature: string | undefined,
  col: number,
  rowNum: number,
  width = 80,
  height = 28,
  offsetXPx = 0,
  offsetYPx = 0
) => {
  if (!signature || !signature.startsWith('data:image')) return
  try {
    const imageId = wb.addImage({ base64: signature.split(',')[1], extension: 'png' })
    if (offsetXPx || offsetYPx) {
      const EMU_PER_PX = 9525
      ws.addImage(imageId, {
        tl: {
          nativeCol: col,
          nativeColOff: Math.round(offsetXPx * EMU_PER_PX),
          nativeRow: rowNum - 1,
          nativeRowOff: Math.round(offsetYPx * EMU_PER_PX),
        },
        ext: { width, height },
      } as unknown as ExcelJS.ImagePosition)
      return
    }
    ws.addImage(imageId, { tl: { col, row: rowNum - 1 }, ext: { width, height } })
  } catch {
    // 이미지 삽입 실패 시 무시
  }
}

// URL 이미지를 base64 + 크기 정보로 변환
export async function fetchImageAsBase64(
  url: string
): Promise<{ base64: string; extension: 'png' | 'jpeg'; width: number; height: number } | null> {
  try {
    const response = await fetch(url)
    const blob = await response.blob()
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1]
        const ext = blob.type.includes('png') ? 'png' : 'jpeg'
        const img = document.createElement('img')
        img.onload = () => resolve({ base64, extension: ext, width: img.naturalWidth, height: img.naturalHeight })
        img.onerror = () => resolve({ base64, extension: ext, width: 800, height: 600 })
        img.src = reader.result as string
      }
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

// 지정 영역(px)에 URL 사진을 비율 유지 배치 — 가로는 항상 중앙, 세로는 center(기본)/top.
// offsetYPx: 영역 상단에서 사진 배치 구간이 시작되는 지점(px) — 텍스트 아래 배치용.
// 소수부 앵커(col: 2.5)는 ExcelJS가 열 폭을 width×10000 EMU로 잘못 근사해 오프셋이 크게
// 축소되고, colOff가 해당 열 폭을 넘으면 렌더러가 기대대로 그리지 않으므로, 오프셋을
// 실제 열 폭·행 높이대로 여러 셀에 분배해 잔여분만 EMU(px×9525)로 지정한다.
export async function addPhotoImageInArea(
  wb: ExcelJS.Workbook,
  ws: ExcelJS.Worksheet,
  url: string,
  opts: {
    col: number // 0-based 시작 열
    row: number // 1-based 시작 행
    colWidthsPx: number[] // 영역 각 열의 픽셀 폭 (합 = 영역 폭)
    rowHeightPx: number // 행 높이 픽셀 (영역 내 균일 가정)
    rowCount: number // 영역 행 수
    padding?: number
    offsetYPx?: number
    verticalAlign?: 'center' | 'top'
  }
): Promise<void> {
  const imgData = await fetchImageAsBase64(url)
  if (!imgData) return
  const imageId = wb.addImage({ base64: imgData.base64, extension: imgData.extension })
  const areaWidthPx = opts.colWidthsPx.reduce((a, b) => a + b, 0)
  const areaHeightPx = opts.rowHeightPx * opts.rowCount
  const pad = opts.padding ?? 6
  const offsetY = opts.offsetYPx ?? 0
  const availableH = areaHeightPx - offsetY
  const maxW = areaWidthPx - pad * 2
  const maxH = availableH - pad * 2
  const scale = Math.min(maxW / imgData.width, maxH / imgData.height)
  const w = imgData.width * scale
  const h = imgData.height * scale

  // 가로: 남는 폭의 절반을 열 폭대로 소진해 시작 열과 잔여 오프셋 결정
  let colIdx = opts.col
  let remX = (areaWidthPx - w) / 2
  for (const colW of opts.colWidthsPx) {
    if (remX < colW) break
    remX -= colW
    colIdx++
  }
  // 세로: 동일하게 행 높이대로 소진
  let rowIdx = opts.row - 1
  let remY = opts.verticalAlign === 'top' ? offsetY + pad : offsetY + (availableH - h) / 2
  while (remY >= opts.rowHeightPx) {
    remY -= opts.rowHeightPx
    rowIdx++
  }

  const EMU_PER_PX = 9525
  ws.addImage(imageId, {
    tl: {
      nativeCol: colIdx,
      nativeColOff: Math.round(remX * EMU_PER_PX),
      nativeRow: rowIdx,
      nativeRowOff: Math.round(remY * EMU_PER_PX),
    },
    ext: { width: w, height: h },
    editAs: 'absolute',
  } as any)
}

export const formatDateKorean = (dateStr?: string | null): string => {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return '20      .        .        .'
  }
  const [y, m, d] = dateStr.split('-')
  return `${y}.  ${m}.  ${d}.`
}

export const downloadWorkbook = async (workbook: ExcelJS.Workbook, filename: string) => {
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
