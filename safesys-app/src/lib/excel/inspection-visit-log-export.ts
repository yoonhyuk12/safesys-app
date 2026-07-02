// 단속·점검방문 일지 엑셀 내보내기 — 건설기술 진흥법 시행규칙 제48조, 별지 제9호 서식 (A4 세로, 1건 1시트)

import ExcelJS from 'exceljs'
import {
  InspectionVisitLogRecord,
  VisitorEntry,
} from '@/lib/inspection/inspection-visit-log-types'
import {
  mergeSet,
  addSignatureImage,
  headerFill,
  downloadWorkbook,
} from '@/lib/excel/quality-excel-utils'

// 서식의 방문자 칸 수 (㉠㉡㉢) — 초과분은 별지 규정이지만 행을 이어서 출력
const VISITOR_SLOT_COUNT = 3
const VISITOR_MARKS = ['㉠', '㉡', '㉢', '㉣', '㉤', '㉥', '㉦', '㉧']

// "2026-07-03" → "2026년 07월 03일" (미입력 시 공란 서식)
const formatVisitDate = (dateStr?: string | null): string => {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return '        년      월      일'
  }
  const [y, m, d] = dateStr.split('-')
  return `${y}년 ${m}월 ${d}일`
}

const formatVisitTime = (record: InspectionVisitLogRecord): string => {
  const from = record.visit_time_from || '    :    '
  const to = record.visit_time_to || '    :    '
  return `${formatVisitDate(record.visit_date)}    ${from} 부터    ${to} 까지`
}

const visitorLine = (mark: string, visitor?: VisitorEntry): string => {
  const aff = visitor?.affiliation || ''
  const pos = visitor?.position || ''
  const name = visitor?.name || ''
  return `${mark} 소속: ${aff}      직급: ${pos}      성명: ${name}           (서명)`
}

export async function downloadInspectionVisitLogExcel(
  record: InspectionVisitLogRecord
): Promise<void> {
  const workbook = new ExcelJS.Workbook()
  const ws = workbook.addWorksheet('단속·점검방문 일지', {
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
    { width: 10 }, // A
    { width: 11 }, // B
    { width: 11 }, // C
    { width: 11 }, // D
    { width: 11 }, // E
    { width: 11 }, // F
    { width: 11 }, // G
    { width: 12 }, // H
  ]

  let r = 1

  // 서식 태그
  mergeSet(ws, `A${r}:E${r}`, '[별지 제9호 서식]', {
    size: 9, border: false, align: { horizontal: 'left' },
  })
  ws.getRow(r).height = 18
  r++

  // 제목 + 근거 조문
  mergeSet(ws, `A${r}:H${r}`, '단속·점검방문 일지', {
    size: 20, bold: true, border: false, align: { horizontal: 'center' },
  })
  ws.getRow(r).height = 40
  r++
  mergeSet(ws, `A${r}:H${r}`, '*건설기술 진흥법 시행규칙 제48조', {
    size: 9, border: false, align: { horizontal: 'center' },
  })
  ws.getRow(r).height = 18
  r++

  ws.getRow(r).height = 8
  r++

  // ① 공사명 및 발주기관 등 — 라벨 1칸(4행 병합) + 우측 4행
  const section1Rows: [string, string][] = [
    ['공사명', record.construction_name || ''],
    ['현장위치', record.site_location || ''],
    ['발주기관(건축주)', record.ordering_agency || ''],
    ['공사규모', record.construction_scale || ''],
  ]
  const section1Start = r
  section1Rows.forEach(([label, value]) => {
    mergeSet(ws, `C${r}:H${r}`, `${label} :  ${value}`, {
      size: 10, align: { horizontal: 'left' },
    })
    ws.getRow(r).height = 26
    r++
  })
  mergeSet(ws, `A${section1Start}:B${r - 1}`, '① 공사명 및\n발주기관 등', {
    bold: true, size: 10, fill: headerFill, align: { horizontal: 'center' },
  })

  // ② 방문 일시
  mergeSet(ws, `A${r}:B${r}`, '② 방문 일시', {
    bold: true, size: 10, fill: headerFill, align: { horizontal: 'center' },
  })
  mergeSet(ws, `C${r}:H${r}`, formatVisitTime(record), {
    size: 10, align: { horizontal: 'center' },
  })
  ws.getRow(r).height = 30
  r++

  // ③~⑤ 서술형 항목
  const textRows: [string, string, number][] = [
    ['③ 방문 근거 및\n목적', record.visit_basis_purpose || '', 54],
    ['④ 업무 수행내용', record.work_content || '', 60],
    ['⑤ 지시사항 또는\n특기사항', record.instructions || '', 54],
  ]
  textRows.forEach(([label, value, height]) => {
    mergeSet(ws, `A${r}:B${r}`, label, {
      bold: true, size: 10, fill: headerFill, align: { horizontal: 'center' },
    })
    mergeSet(ws, `C${r}:H${r}`, value, {
      size: 10, align: { horizontal: 'left', vertical: 'top' },
    })
    ws.getRow(r).height = height
    r++
  })

  // ⑥ 방문자 — 서식 3칸 + 초과분 행 추가
  const visitors = record.visitors || []
  const visitorRowCount = Math.max(VISITOR_SLOT_COUNT, visitors.length)
  const visitorStart = r
  const visitorSignatureRows: Array<{ row: number; signature: string }> = []
  for (let i = 0; i < visitorRowCount; i++) {
    const visitor = visitors[i]
    const mark = VISITOR_MARKS[i] || `${i + 1})`
    mergeSet(ws, `C${r}:H${r}`, visitorLine(mark, visitor), {
      size: 10, align: { horizontal: 'left' },
    })
    ws.getRow(r).height = 28
    if (visitor?.signature) visitorSignatureRows.push({ row: r, signature: visitor.signature })
    r++
  }
  mergeSet(ws, `A${visitorStart}:B${r - 1}`, '⑥ 방문자', {
    bold: true, size: 10, fill: headerFill, align: { horizontal: 'center' },
  })

  // ⑦ 확인
  mergeSet(ws, `A${r}:B${r}`, '⑦ 공사감독원(책임건설\n사업관리기술자) 또는\n건설공사의 현장에 배치\n된 건설기술자가 확인', {
    bold: true, size: 9, fill: headerFill, align: { horizontal: 'center' },
  })
  mergeSet(
    ws,
    `C${r}:H${r}`,
    `소속: ${record.confirmer_affiliation || ''}      직책: ${record.confirmer_position || ''}      성명: ${record.confirmer_name || ''}           (서명)`,
    { size: 10, align: { horizontal: 'left' } }
  )
  const confirmerRow = r
  ws.getRow(r).height = 60
  r++

  // 작성방법
  mergeSet(ws, `A${r}:H${r}`, '작성방법', {
    bold: true, size: 10, fill: headerFill, align: { horizontal: 'center' },
  })
  ws.getRow(r).height = 22
  r++
  const notes = [
    '1. ③란의 방문 근거 및 목적에는 방문의 근거가 되는 관계 법령, 지시명령 또는 행정계획과 방문 목적을 적습니다.',
    '2. ④란의 업무 수행내용에는 업무수행 내용을 개략적으로 적습니다.',
    '3. ⑥란의 방문자의 경우, 같은 목적의 방문자가 3명을 초과할 경우에는 별지에 작성하여 덧붙여야 합니다.',
    '4. ①ㆍ⑦란은 공사감독원(책임건설사업관리기술자) 또는 건설공사의 현장에 배치된 건설기술자가 적습니다.',
    '5. ②~⑥란은 방문자가 적습니다.',
  ]
  notes.forEach((note) => {
    mergeSet(ws, `A${r}:H${r}`, note, {
      size: 9, border: false, align: { horizontal: 'left' },
    })
    ws.getRow(r).height = 16
    r++
  })

  // 서명 이미지 — 각 행 우측 (서명) 표기 위에 겹침
  visitorSignatureRows.forEach(({ row, signature }) => {
    addSignatureImage(workbook, ws, signature, 6.6, row, 70, 26)
  })
  addSignatureImage(workbook, ws, record.confirmer_signature, 6.6, confirmerRow, 70, 26)

  const dateStr = record.visit_date || new Date().toISOString().split('T')[0]
  await downloadWorkbook(workbook, `단속점검방문일지_${dateStr}.xlsx`)
}
