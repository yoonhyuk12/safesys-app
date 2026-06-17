// 시공 예정공정표 엑셀 내보내기 (landscape) — 공종 행 + 旬별 일정/기여% + 우측 공정률 + 하단 요약 + S커브 이미지
// 입력 데이터는 work-schedule-types의 순수 계산 결과를 그대로 사용 — 화면 표시값과 동일(연동).

import ExcelJS from 'exceljs'
import {
  WorkSchedule,
  buildPeriodGrid,
  computeSchedule,
  combineScheduleAnchors,
} from '@/lib/work-schedule/work-schedule-types'
import { computeProgressRate, type ProgressAnchor } from '@/lib/work-daily-report/work-daily-report-types'

const thin: ExcelJS.Border = { style: 'thin', color: { argb: 'FF000000' } }
const allBorders: Partial<ExcelJS.Borders> = { top: thin, bottom: thin, left: thin, right: thin }
const headerFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } }
const barFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBFDBFE' } } // 일정 막대(연한 파랑)

interface CellOpts {
  bold?: boolean
  size?: number
  fill?: ExcelJS.Fill
  align?: Partial<ExcelJS.Alignment>
  numFmt?: string
}

const setCell = (ws: ExcelJS.Worksheet, row: number, col: number, value: ExcelJS.CellValue, opts: CellOpts = {}) => {
  const cell = ws.getCell(row, col)
  cell.value = value
  cell.font = { size: opts.size ?? 8, bold: opts.bold ?? false }
  if (opts.fill) cell.fill = opts.fill
  cell.border = allBorders
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true, ...opts.align }
  if (opts.numFmt) cell.numFmt = opts.numFmt
}

// 병합 + 값/스타일 + 병합 범위 전체 테두리
const mergeSet = (
  ws: ExcelJS.Worksheet,
  r1: number, c1: number, r2: number, c2: number,
  value: ExcelJS.CellValue, opts: CellOpts = {},
) => {
  ws.mergeCells(r1, c1, r2, c2)
  setCell(ws, r1, c1, value, opts)
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) ws.getCell(r, c).border = allBorders
  }
}

const safeFileName = (projectName: string): string =>
  (projectName || '사업명').replace(/[\\/:*?"<>|]/g, '_').trim()

const fmtPct = (n: number): string => (Math.round(n * 100) / 100).toFixed(2)

// 결합 곡선 포인트(frac 0~1, v 0~100)를 빨간 S커브 PNG(base64)로 — exceljs는 네이티브 차트를 못 만들어 이미지로 임베드
const makeCurvePng = (points: { frac: number; v: number }[], width = 1400, height = 320): string | null => {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  if (points.length === 0) return null

  // 가로 그리드(0/25/50/75/100%)
  ctx.strokeStyle = '#e5e7eb'
  ctx.lineWidth = 1
  for (const r of [0, 25, 50, 75, 100]) {
    const y = height - (r / 100) * height
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(width, y)
    ctx.stroke()
  }

  const xAt = (frac: number) => Math.min(1, Math.max(0, frac)) * (width - 8) + 4
  const yAt = (v: number) => height - (Math.min(100, Math.max(0, v)) / 100) * (height - 8) - 4

  ctx.strokeStyle = '#dc2626'
  ctx.lineWidth = 3
  ctx.beginPath()
  points.forEach((pt, i) => {
    const x = xAt(pt.frac)
    const y = yAt(pt.v)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.stroke()

  ctx.fillStyle = '#dc2626'
  points.forEach(pt => {
    ctx.beginPath()
    ctx.arc(xAt(pt.frac), yAt(pt.v), 3.5, 0, Math.PI * 2)
    ctx.fill()
  })
  return canvas.toDataURL('image/png')
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

export async function downloadWorkScheduleExcel(
  schedule: WorkSchedule,
  projectName: string,
  constructionStart: string | null | undefined,
  constructionEnd: string | null | undefined,
  manualAnchors: ProgressAnchor[] = [],
): Promise<void> {
  const grid = buildPeriodGrid(constructionStart, constructionEnd)
  if (!grid.length) {
    alert('착공일·준공일이 설정되어 있지 않아 공정표를 출력할 수 없습니다.')
    return
  }
  const comp = computeSchedule(schedule, grid)
  const items = schedule.items ?? []
  const n = grid.length

  // 화면과 동일한 결합 곡선(수동 점 통과 + 사이 공정표 형태)을 시간비례 좌표로 샘플
  const combined = combineScheduleAnchors(schedule, constructionStart, constructionEnd, manualAnchors)
  const startMs = new Date(constructionStart as string).getTime()
  const endMs = new Date(constructionEnd as string).getTime()
  const fracOf = (date: string) => (endMs > startMs ? (new Date(date).getTime() - startMs) / (endMs - startMs) : 0)
  const curveSamples: { frac: number; v: number }[] = [
    { frac: 0, v: 0 },
    ...combined.map(a => ({ frac: fracOf(a.date), v: a.rate })).filter(pt => pt.frac > 0.0001 && pt.frac < 0.9999),
    { frac: 1, v: 100 },
  ]
  // 旬별 결합 누계(그래프 곡선과 동일) — 누계 행이 곡선과 일치하도록 사용
  const combinedCum = grid.map(p => {
    const v = computeProgressRate(constructionStart, constructionEnd, p.endDate, combined)
    return v === '' ? 0 : parseFloat(v)
  })

  // 열 배치: 1=공사종류, 2=공사금액, 3=가중치, 4..(3+n)=旬, (4+n)=공정률
  const COL_NAME = 1
  const COL_AMOUNT = 2
  const COL_WEIGHT = 3
  const COL_SUN0 = 4              // 첫 旬 열(1-based)
  const COL_RATE = 4 + n          // 우측 공정률 열(1-based)
  const lastCol = COL_RATE

  const workbook = new ExcelJS.Workbook()
  const ws = workbook.addWorksheet('예정공정표', {
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    },
  })

  // 열 너비
  ws.getColumn(COL_NAME).width = 16
  ws.getColumn(COL_AMOUNT).width = 13
  ws.getColumn(COL_WEIGHT).width = 8
  for (let i = 0; i < n; i++) ws.getColumn(COL_SUN0 + i).width = 4.5
  ws.getColumn(COL_RATE).width = 8

  let r = 1
  // 제목
  mergeSet(ws, r, COL_NAME, r, lastCol, '예 정 공 정 표', { size: 18, bold: true, align: { horizontal: 'center' } })
  ws.getRow(r).height = 30
  r++
  // 공사명 / 공사관리번호 / 공사기간
  const periodLabel = `착공 ${constructionStart}  ~  준공 ${constructionEnd}`
  mergeSet(ws, r, COL_NAME, r, COL_WEIGHT, `공사명: ${projectName || ''}`, { size: 9, bold: true, align: { horizontal: 'left' } })
  mergeSet(ws, r, COL_SUN0, r, COL_SUN0 + Math.max(0, Math.floor(n / 2) - 1), schedule.contractNo ? `공사관리번호: ${schedule.contractNo}` : '', { size: 9, align: { horizontal: 'left' } })
  mergeSet(ws, r, COL_SUN0 + Math.floor(n / 2), r, COL_RATE, periodLabel, { size: 9, align: { horizontal: 'right' } })
  ws.getRow(r).height = 18
  r++

  // ── S커브 이미지 (표 위 별도 밴드) — 화면과 동일한 결합 곡선
  const png = makeCurvePng(curveSamples)
  if (png) {
    const bandStart = r
    const bandRows = 12
    for (let k = 0; k < bandRows; k++) ws.getRow(bandStart + k).height = 16
    mergeSet(ws, bandStart, COL_NAME, bandStart, COL_WEIGHT, '공정 곡선', { bold: true, size: 9 })
    const imgId = workbook.addImage({ base64: png, extension: 'png' })
    // tl/br 는 0-based. 旬 첫 열 ~ 공정률 직전 열 범위에 배치
    ws.addImage(imgId, {
      tl: { col: COL_SUN0 - 1, row: bandStart - 1 } as ExcelJS.Anchor,
      br: { col: COL_RATE - 1, row: bandStart - 1 + bandRows } as ExcelJS.Anchor,
    })
    r = bandStart + bandRows
  }

  // ── 표 헤더 3행 (년 / 월 / 旬)
  const hYear = r
  const hMonth = r + 1
  const hSun = r + 2
  // 좌측 라벨 (3행 병합)
  mergeSet(ws, hYear, COL_NAME, hSun, COL_NAME, '공사종류', { bold: true, fill: headerFill })
  mergeSet(ws, hYear, COL_AMOUNT, hSun, COL_AMOUNT, '공사금액(백만원)', { bold: true, fill: headerFill })
  mergeSet(ws, hYear, COL_WEIGHT, hSun, COL_WEIGHT, '가중치', { bold: true, fill: headerFill })
  mergeSet(ws, hYear, COL_RATE, hSun, COL_RATE, '공정률', { bold: true, fill: headerFill })

  // 년 병합 (연속된 같은 year 구간)
  let segStart = 0
  for (let i = 1; i <= n; i++) {
    if (i === n || grid[i].year !== grid[segStart].year) {
      mergeSet(ws, hYear, COL_SUN0 + segStart, hYear, COL_SUN0 + i - 1, `${grid[segStart].year}년`, { bold: true, fill: headerFill, size: 8 })
      segStart = i
    }
  }
  // 월 병합 (연속된 같은 monthKey 구간)
  segStart = 0
  for (let i = 1; i <= n; i++) {
    if (i === n || grid[i].monthKey !== grid[segStart].monthKey) {
      mergeSet(ws, hMonth, COL_SUN0 + segStart, hMonth, COL_SUN0 + i - 1, `${grid[segStart].month}월`, { bold: true, fill: headerFill, size: 8 })
      segStart = i
    }
  }
  // 旬 (dayLabel)
  for (let i = 0; i < n; i++) {
    setCell(ws, hSun, COL_SUN0 + i, grid[i].dayLabel, { bold: true, fill: headerFill, size: 7 })
  }
  ws.getRow(hYear).height = 16
  ws.getRow(hMonth).height = 16
  ws.getRow(hSun).height = 16
  r = hSun + 1

  // ── 공종 행
  const firstItemRow = r
  for (const it of items) {
    const weight = comp.weights.get(it.id) ?? 0
    const arr = comp.contrib.get(it.id) ?? []
    setCell(ws, r, COL_NAME, it.name || '', { align: { horizontal: 'left' }, size: 8 })
    setCell(ws, r, COL_AMOUNT, Number(it.amount) || 0, { numFmt: '#,##0', align: { horizontal: 'right' }, size: 8 })
    setCell(ws, r, COL_WEIGHT, `${fmtPct(weight)}%`, { size: 8 })
    const s = Math.max(0, Math.min(n - 1, it.startIndex))
    const e = Math.max(s, Math.min(n - 1, it.endIndex))
    for (let p = 0; p < n; p++) {
      const inBar = p >= s && p <= e
      const c = arr[p] || 0
      setCell(ws, r, COL_SUN0 + p, inBar && c > 0 ? fmtPct(c) : (inBar ? '' : ''), {
        fill: inBar ? barFill : undefined,
        size: 6,
      })
    }
    setCell(ws, r, COL_RATE, `${fmtPct(comp.itemCumAtEnd.get(it.id) ?? 0)}%`, { size: 8, bold: true })
    ws.getRow(r).height = 16
    r++
  }
  const lastItemRow = r - 1

  // ── 하단 요약행
  // 주간(旬)공정율
  mergeSet(ws, r, COL_NAME, r, COL_WEIGHT, '주간공정율', { bold: true, fill: headerFill, size: 8, align: { horizontal: 'center' } })
  for (let p = 0; p < n; p++) setCell(ws, r, COL_SUN0 + p, fmtPct(comp.colRate[p]), { size: 6 })
  setCell(ws, r, COL_RATE, '', {})
  ws.getRow(r).height = 15
  r++
  // 주간공정 누계 (그래프 결합 곡선과 동일)
  mergeSet(ws, r, COL_NAME, r, COL_WEIGHT, '주간공정 누계', { bold: true, fill: headerFill, size: 8, align: { horizontal: 'center' } })
  for (let p = 0; p < n; p++) setCell(ws, r, COL_SUN0 + p, fmtPct(combinedCum[p] ?? 0), { size: 6 })
  setCell(ws, r, COL_RATE, `${fmtPct(combinedCum[n - 1] ?? 100)}%`, { size: 8, bold: true })
  ws.getRow(r).height = 15
  r++
  // 월간공정율 (월 병합)
  mergeSet(ws, r, COL_NAME, r, COL_WEIGHT, '월간공정율', { bold: true, fill: headerFill, size: 8, align: { horizontal: 'center' } })
  for (const mo of comp.monthly) {
    mergeSet(ws, r, COL_SUN0 + mo.firstIndex, r, COL_SUN0 + mo.firstIndex + mo.span - 1, fmtPct(mo.rate), { size: 7 })
  }
  setCell(ws, r, COL_RATE, '', {})
  ws.getRow(r).height = 15
  r++
  // 월간공정율 누계 (월 병합, 그래프 결합 곡선과 동일)
  mergeSet(ws, r, COL_NAME, r, COL_WEIGHT, '월간공정율 누계', { bold: true, fill: headerFill, size: 8, align: { horizontal: 'center' } })
  for (const mo of comp.monthly) {
    mergeSet(ws, r, COL_SUN0 + mo.firstIndex, r, COL_SUN0 + mo.firstIndex + mo.span - 1, fmtPct(combinedCum[mo.firstIndex + mo.span - 1] ?? 0), { size: 7 })
  }
  setCell(ws, r, COL_RATE, `${fmtPct(combinedCum[n - 1] ?? 100)}%`, { size: 8, bold: true })
  ws.getRow(r).height = 15
  r++

  // 인쇄 영역
  ws.pageSetup.printArea = `${ws.getCell(1, 1).address}:${ws.getCell(r - 1, lastCol).address}`
  void firstItemRow
  void lastItemRow

  await downloadWorkbook(workbook, `${safeFileName(projectName)}_예정공정표.xlsx`)
}
