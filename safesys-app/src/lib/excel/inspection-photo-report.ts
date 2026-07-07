// 검측 사진대지(자율 양식) 엑셀 내보내기 — 검측건당 1페이지, 사진 최대 2컷 + 설명
// 건별 다운로드(요청서+체크리스트) 시트3와 검측대장 전체 사진대지 출력이 공유한다.

import ExcelJS from 'exceljs'
import {
  InspectionRequestRecord,
  normalizeInspectionPhotos,
  INSPECTION_PHOTO_MAX,
} from '@/lib/inspection/inspection-types'
import {
  setCell,
  mergeSet,
  headerFill,
  addPhotoImageInArea,
  formatDateKorean,
  downloadWorkbook,
} from '@/lib/excel/quality-excel-utils'

const COL_W = 15 // A~F 열 폭 (단위당 8px — 한국어 Excel 실측)
const COL_PX = COL_W * 8
const ROW_H = 22 // 행 높이 (pt)
const ROW_PX = ROW_H * (4 / 3)
const PHOTO_ROWS = 12 // 사진 1칸이 차지하는 행 수

function createPhotoSheet(wb: ExcelJS.Workbook): ExcelJS.Worksheet {
  const ws = wb.addWorksheet('사진대지', {
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'portrait',
      horizontalCentered: true,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0, // 페이지 나눔(건당 1페이지)이 그대로 유지되게 세로는 자동
      margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
    },
  })
  ws.columns = Array(6).fill({ width: COL_W })
  return ws
}

// 검측건 1건 분량(1페이지)을 startRow부터 그리고 다음 시작 행을 반환
async function addPhotoPage(
  wb: ExcelJS.Workbook,
  ws: ExcelJS.Worksheet,
  record: InspectionRequestRecord,
  projectName: string,
  startRow: number
): Promise<number> {
  const photos = normalizeInspectionPhotos(record.photos)
  let r = startRow

  // 제목
  mergeSet(ws, `A${r}:F${r}`, '검 측 사 진 대 지', {
    size: 18,
    bold: true,
    border: false,
    align: { horizontal: 'center' },
  })
  ws.getRow(r).height = 34
  r++

  // 헤더 표 — 공사명 / 번호·검측일자 / 위치 및 공종 / 검측부위
  setCell(ws, `A${r}`, '공 사 명', { bold: true, fill: headerFill, align: { horizontal: 'center' } })
  mergeSet(ws, `B${r}:F${r}`, projectName, { align: { horizontal: 'left' } })
  ws.getRow(r).height = ROW_H
  r++

  setCell(ws, `A${r}`, '번 호', { bold: true, fill: headerFill, align: { horizontal: 'center' } })
  mergeSet(ws, `B${r}:C${r}`, record.request_no || '', { align: { horizontal: 'left' } })
  setCell(ws, `D${r}`, '검측일자', { bold: true, fill: headerFill, align: { horizontal: 'center' } })
  mergeSet(ws, `E${r}:F${r}`, formatDateKorean(record.request_date), { align: { horizontal: 'center' } })
  ws.getRow(r).height = ROW_H
  r++

  setCell(ws, `A${r}`, '위치 및 공종', { bold: true, fill: headerFill, align: { horizontal: 'center' } })
  mergeSet(ws, `B${r}:F${r}`, record.location_and_type || '', { align: { horizontal: 'left' } })
  ws.getRow(r).height = ROW_H
  r++

  setCell(ws, `A${r}`, '검측부위', { bold: true, fill: headerFill, align: { horizontal: 'center' } })
  mergeSet(ws, `B${r}:F${r}`, record.inspection_part || '', { align: { horizontal: 'left' } })
  ws.getRow(r).height = ROW_H
  r++

  // 사진 칸 — 항상 2칸을 그려 양식 형태 유지, 사진이 없으면 빈 칸
  for (let i = 0; i < INSPECTION_PHOTO_MAX; i++) {
    const photo = photos[i]
    const areaStart = r
    const areaEnd = r + PHOTO_ROWS - 1
    for (let row = areaStart; row <= areaEnd; row++) ws.getRow(row).height = ROW_H
    mergeSet(ws, `A${areaStart}:F${areaEnd}`, '', { align: { horizontal: 'center' } })
    if (photo) {
      await addPhotoImageInArea(wb, ws, photo.url, {
        col: 0,
        row: areaStart,
        colWidthsPx: Array(6).fill(COL_PX),
        rowHeightPx: ROW_PX,
        rowCount: PHOTO_ROWS,
      })
    }
    r = areaEnd + 1

    // 설명 행
    setCell(ws, `A${r}`, '설 명', { bold: true, fill: headerFill, align: { horizontal: 'center' } })
    mergeSet(ws, `B${r}:F${r}`, photo?.caption || '', { align: { horizontal: 'left' } })
    ws.getRow(r).height = ROW_H
    r++
  }

  return r
}

// ── 건별 워크북(요청서+체크리스트)에 사진대지 시트 추가 — 사진이 있을 때만 호출
export async function addInspectionPhotoSheet(
  workbook: ExcelJS.Workbook,
  record: InspectionRequestRecord,
  projectName: string
): Promise<ExcelJS.Worksheet> {
  const ws = createPhotoSheet(workbook)
  await addPhotoPage(workbook, ws, record, projectName, 1)
  return ws
}

// ── 검측대장 전체 사진대지 출력 — 사진이 있는 검측건만 건당 1페이지로
export async function downloadInspectionPhotoLedgerExcel(
  records: InspectionRequestRecord[],
  projectName: string
): Promise<void> {
  const withPhotos = records.filter((rec) => normalizeInspectionPhotos(rec.photos).length > 0)
  if (withPhotos.length === 0) {
    throw new Error('업로드된 검측 사진이 없습니다.')
  }

  const workbook = new ExcelJS.Workbook()
  const ws = createPhotoSheet(workbook)
  let r = 1
  for (let i = 0; i < withPhotos.length; i++) {
    r = await addPhotoPage(workbook, ws, withPhotos[i], projectName, r)
    if (i < withPhotos.length - 1) {
      ws.getRow(r - 1).addPageBreak()
    }
  }

  const dateStr = new Date().toISOString().split('T')[0]
  await downloadWorkbook(workbook, `검측사진대지_${dateStr}.xlsx`)
}
