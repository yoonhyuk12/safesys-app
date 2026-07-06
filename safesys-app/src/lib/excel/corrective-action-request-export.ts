// 시정조치요구서 엑셀 내보내기 — 별지 6호 서식 (지침 제22조, A4 세로 1건 1시트)

import ExcelJS from 'exceljs'
import { mergeSet, headerFill, downloadWorkbook, formatDateKorean, addPhotoImageInArea } from '@/lib/excel/quality-excel-utils'

export interface CorrectiveActionRequestData {
  projectName: string
  departmentHead: string | null // 점검부서장
  inspectionType: string | null // 점검의 종류
  inspectorName: string | null // 점검자
  inspectionDate: string | null // 점검일시 YYYY-MM-DD
  content: string // 점검내용 및 시정조치 요구사항
  beforePhotoUrl: string | null // 지적(시정 전) 사진 — 내용 칸 하단에 배치
}

export async function downloadCorrectiveActionRequestExcel(data: CorrectiveActionRequestData): Promise<void> {
  const workbook = new ExcelJS.Workbook()
  const ws = workbook.addWorksheet('시정조치요구서', {
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
    { width: 8 }, // A
    { width: 8 }, // B
    { width: 11 }, // C
    { width: 11 }, // D
    { width: 8 }, // E
    { width: 8 }, // F
    { width: 11 }, // G
    { width: 11 }, // H
  ]

  let r = 1

  mergeSet(ws, `A${r}:H${r}`, '[별지 6호 서식] 시정조치요구서 (지침 제22조와 관련)', {
    size: 9, border: false, align: { horizontal: 'left' },
  })
  ws.getRow(r).height = 18
  r++

  ws.getRow(r).height = 6
  r++

  // 제목 (서식상 표 안에 포함)
  mergeSet(ws, `A${r}:H${r}`, '시 정 조 치 요 구 서', {
    size: 18, bold: true, align: { horizontal: 'center' },
  })
  ws.getRow(r).height = 44
  r++

  // 점검부서장 / 점검의 종류
  mergeSet(ws, `A${r}:B${r}`, '점검부서장', {
    bold: true, size: 10, fill: headerFill, align: { horizontal: 'center' },
  })
  mergeSet(ws, `C${r}:D${r}`, data.departmentHead || '', { size: 10, align: { horizontal: 'center' } })
  mergeSet(ws, `E${r}:F${r}`, '점검의 종류＊', {
    bold: true, size: 10, fill: headerFill, align: { horizontal: 'center' },
  })
  mergeSet(ws, `G${r}:H${r}`, data.inspectionType || '', { size: 10, align: { horizontal: 'center' } })
  ws.getRow(r).height = 30
  r++

  // 점검자 / 점검일시
  mergeSet(ws, `A${r}:B${r}`, '점 검 자', {
    bold: true, size: 10, fill: headerFill, align: { horizontal: 'center' },
  })
  mergeSet(ws, `C${r}:D${r}`, data.inspectorName || '', { size: 10, align: { horizontal: 'center' } })
  mergeSet(ws, `E${r}:F${r}`, '점검일시', {
    bold: true, size: 10, fill: headerFill, align: { horizontal: 'center' },
  })
  mergeSet(ws, `G${r}:H${r}`, formatDateKorean(data.inspectionDate), { size: 10, align: { horizontal: 'center' } })
  ws.getRow(r).height = 30
  r++

  // 공사명
  mergeSet(ws, `A${r}:B${r}`, '공 사 명', {
    bold: true, size: 10, fill: headerFill, align: { horizontal: 'center' },
  })
  mergeSet(ws, `C${r}:H${r}`, data.projectName || '', { size: 10, align: { horizontal: 'left' } })
  ws.getRow(r).height = 30
  r++

  // 점검내용 및 시정조치 요구사항 — 큰 영역 (텍스트 + 바로 아래 지적사진)
  const CONTENT_ROWS = 22
  const ROW_H = 22
  const contentStart = r
  mergeSet(ws, `A${r}:B${r + CONTENT_ROWS - 1}`, '점검내용\n및\n시정조치\n요구사항', {
    bold: true, size: 10, fill: headerFill, align: { horizontal: 'center' },
  })
  mergeSet(ws, `C${r}:H${r + CONTENT_ROWS - 1}`, data.content || '', {
    size: 10, align: { horizontal: 'left', vertical: 'top' },
  })
  for (let i = 0; i < CONTENT_ROWS; i++) ws.getRow(contentStart + i).height = ROW_H
  r += CONTENT_ROWS

  // 지적사진 — 본문 텍스트 줄 수를 추정해 글 바로 아래 가로 중앙 배치 (칸 분할 없이 이미지 플로팅)
  if (data.beforePhotoUrl) {
    const colWidthsPx = [11, 11, 8, 8, 11, 11].map((u) => u * 7.5) // C~H 열 폭
    const rowHeightPx = ROW_H * (4 / 3)
    const CHARS_PER_LINE = 32 // 10pt 한글 기준 줄바꿈 추정치
    const LINE_PX = 18
    const lines = (data.content || '')
      .split('\n')
      .reduce((acc, seg) => acc + Math.max(1, Math.ceil(seg.length / CHARS_PER_LINE)), 0)
    // 사진 최소 높이(6행 분량)는 확보하도록 텍스트 추정 높이를 제한
    const textPx = Math.min(lines * LINE_PX + 8, (CONTENT_ROWS - 6) * rowHeightPx)
    await addPhotoImageInArea(workbook, ws, data.beforePhotoUrl, {
      col: 2,
      row: contentStart,
      colWidthsPx,
      rowHeightPx,
      rowCount: CONTENT_ROWS,
      offsetYPx: textPx,
      verticalAlign: 'top',
    })
  }

  // 하단 주석
  mergeSet(ws, `A${r}:H${r}`, '＊ 점검의 종류: 지침 제19조에서 정한 종류', {
    size: 9, border: false, align: { horizontal: 'left' },
  })
  ws.getRow(r).height = 18

  const dateStr = data.inspectionDate || new Date().toISOString().split('T')[0]
  await downloadWorkbook(workbook, `시정조치요구서_${dateStr}.xlsx`)
}
