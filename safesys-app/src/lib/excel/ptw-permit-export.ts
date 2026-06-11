// PTW(위험공종 작업허가제) 허가서 엑셀 내보내기
// 원본 서식: 붙임6. 안전작업허가제 운영 매뉴얼(26년)

import ExcelJS from 'exceljs'
import {
  PtwPermitRecord,
  HighRiskPermitFormData,
  CommonPermitFormData,
  PermitTypeConfig,
  PermitSignatures,
  PERMIT_TYPE_CONFIGS,
  HIGH_RISK_TARGET_WORKS,
  HIGH_RISK_EQUIPMENT_CHECKS,
  isHighRiskFormData,
} from '@/lib/ptw/permit-types'

const thin: ExcelJS.Border = { style: 'thin', color: { argb: 'FF000000' } }
const allBorders: Partial<ExcelJS.Borders> = { top: thin, bottom: thin, left: thin, right: thin }
const headerFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } }
const greenFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF3E6' } }

const COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

interface CellOpts {
  bold?: boolean
  size?: number
  fill?: ExcelJS.Fill
  align?: Partial<ExcelJS.Alignment>
  border?: boolean
  color?: string
}

const setCell = (ws: ExcelJS.Worksheet, addr: string, value: ExcelJS.CellValue, opts: CellOpts = {}) => {
  const cell = ws.getCell(addr)
  cell.value = value
  cell.font = {
    size: opts.size ?? 10,
    bold: opts.bold ?? false,
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

// 라벨 | 값 | 라벨 | 값 형태의 행 (A | B:D | E | F:H)
const labelValueRow = (
  ws: ExcelJS.Worksheet,
  row: number,
  label1: string,
  value1: string,
  label2: string,
  value2: string,
  height = 23
) => {
  setCell(ws, `A${row}`, label1, { bold: true, fill: headerFill, align: { horizontal: 'center' } })
  mergeSet(ws, `B${row}:D${row}`, value1, { align: { horizontal: 'center' } })
  setCell(ws, `E${row}`, label2, { bold: true, fill: headerFill, align: { horizontal: 'center' } })
  mergeSet(ws, `F${row}:H${row}`, value2, { align: { horizontal: 'center' } })
  ws.getRow(row).height = height
}

// 서명 이미지 삽입
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

// 하단 서명 행: A:F 우측정렬 텍스트 + G:H (서명) + 이미지
const addSignatureRow = (
  wb: ExcelJS.Workbook,
  ws: ExcelJS.Worksheet,
  rowNum: number,
  label: string,
  name: string,
  signature?: string
) => {
  mergeSet(ws, `A${rowNum}:F${rowNum}`, `${label} :   ${name || ''}`, {
    border: false,
    size: 11,
    align: { horizontal: 'right' },
  })
  mergeSet(ws, `G${rowNum}:H${rowNum}`, signature ? '' : '(서명)', {
    border: false,
    size: 10,
    color: 'FF888888',
    align: { horizontal: 'center' },
  })
  ws.getRow(rowNum).height = 28
  addSignatureImage(wb, ws, signature, 6.2, rowNum)
}

// 관리감독자(부장) 추가 서명 행들
const addExtraSignatureRows = (
  wb: ExcelJS.Workbook,
  ws: ExcelJS.Worksheet,
  startRow: number,
  signatures: PermitSignatures
): number => {
  let row = startRow
  Object.keys(signatures || {})
    .filter((key) => key.startsWith('extra_'))
    .sort()
    .forEach((key) => {
      addSignatureRow(wb, ws, row, '관리감독자(부장)', signatures[key]?.name || '', signatures[key]?.signature)
      row++
    })
  return row
}

// A4 세로 사용 가능 높이 (pt): 297mm - 기본 상하마진(0.75+0.75인치) ≈ 734pt
const A4_USABLE_HEIGHT = 734
const MAX_STRETCH = 1.8

// 내용이 A4보다 짧으면 각 행 높이를 비례 확대해 하단 여백 최소화
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

const formatDateKorean = (dateStr?: string | null): string => {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return '            년          월          일'
  }
  const [y, m, d] = dateStr.split('-')
  return `${y}년  ${m}월  ${d}일`
}

// ── ① 위험공종 작업허가서(PTW)
const buildHighRiskSheet = (
  wb: ExcelJS.Workbook,
  ws: ExcelJS.Worksheet,
  record: PtwPermitRecord,
  projectName: string
): number => {
  const form = record.form_data as HighRiskPermitFormData
  const sig = record.signatures || {}

  ws.columns = COLS.map(() => ({ width: 12.5 }))
  let r = 1

  // 상단 여백용 빈 행
  ws.getRow(r).height = 15
  r++

  // 제목
  mergeSet(ws, `A${r}:H${r}`, '위험공종 작업허가서(PTW)', {
    bold: true, size: 18, border: false, align: { horizontal: 'center' },
  })
  ws.getRow(r).height = 37
  r++

  // 제목 아래 여백용 빈 행
  ws.getRow(r).height = 37
  r++

  // 1. 공사개요
  mergeSet(ws, `A${r}:H${r}`, '1. 공사개요', { bold: true, size: 11, border: false })
  ws.getRow(r).height = 21
  r++
  labelValueRow(ws, r++, '관리부서', form.overview.managing_dept || '', '공사명', form.overview.project_name || projectName)
  labelValueRow(ws, r++, '작업기간', form.overview.work_period || '', '수급인', form.overview.contractor || '')
  labelValueRow(ws, r++, '공 사 비', form.overview.cost || '', '책임자', form.overview.manager || '')

  // 표 사이 여백용 빈 행
  ws.getRow(r).height = 28
  r++

  // 2. 위험공종 작업 내용
  mergeSet(ws, `A${r}:H${r}`, '2. 위험공종 작업 내용', { bold: true, size: 11, border: false })
  ws.getRow(r).height = 21
  r++
  labelValueRow(ws, r++, '공종명', form.work.work_type || '', '작업업체명\n(하도급사)', form.work.sub_contractor || '', 31)

  // 대상공종(좌) + 작업세부공종(우)
  const targetStart = r
  const targetEnd = r + HIGH_RISK_TARGET_WORKS.length - 1
  mergeSet(ws, `A${targetStart}:A${targetEnd}`, '작업허가제\n대상공종\n(관련공종√)', {
    bold: true, fill: headerFill, align: { horizontal: 'center' },
  })
  mergeSet(ws, `F${targetStart}:H${targetStart}`, '작업세부공종', {
    bold: true, fill: headerFill, align: { horizontal: 'center' },
  })
  mergeSet(ws, `F${targetStart + 1}:H${targetEnd}`, form.work.work_detail || '', {
    align: { horizontal: 'center' },
  })
  HIGH_RISK_TARGET_WORKS.forEach((work, i) => {
    const checked = form.work.target_checks?.[i]
    const extra = i === 7 && form.work.target_other ? ` (${form.work.target_other})` : ''
    mergeSet(ws, `B${r}:E${r}`, `${checked ? '■' : '□'} ${'①②③④⑤⑥⑦⑧'[i]} ${work}${extra}`, { size: 9 })
    ws.getRow(r).height = 19
    r++
  })

  labelValueRow(ws, r++, '작업인원', form.work.personnel || '', '작업위치', form.work.location || '')

  // 중장비 작업
  mergeSet(ws, `A${r}:H${r}`, '중장비 작업 (타워크레인, 차량계 하역운반기계, 차량계 건설기계 작성)', {
    bold: true, size: 9, fill: headerFill, align: { horizontal: 'center' },
  })
  ws.getRow(r).height = 19
  r++
  labelValueRow(ws, r++, '장비종류', form.equipment.equipment_type || '', '규격', form.equipment.spec || '')

  // 검토내용 (2개씩 3행)
  const checkStart = r
  const checkRows = Math.ceil(HIGH_RISK_EQUIPMENT_CHECKS.length / 2)
  mergeSet(ws, `A${checkStart}:A${checkStart + checkRows - 1}`, '검토내용', {
    bold: true, fill: headerFill, align: { horizontal: 'center' },
  })
  for (let i = 0; i < checkRows; i++) {
    const left = HIGH_RISK_EQUIPMENT_CHECKS[i * 2]
    const right = HIGH_RISK_EQUIPMENT_CHECKS[i * 2 + 1]
    mergeSet(ws, `B${r}:E${r}`, `${form.equipment.checks?.[i * 2] ? '■' : '□'} ${left}`, { size: 9 })
    if (right !== undefined) {
      mergeSet(ws, `F${r}:H${r}`, `${form.equipment.checks?.[i * 2 + 1] ? '■' : '□'} ${right}`, { size: 9 })
    } else {
      mergeSet(ws, `F${r}:H${r}`, '', {})
    }
    ws.getRow(r).height = 19
    r++
  }

  // 위험요소 / 개선대책 / 재해형태
  mergeSet(ws, `A${r}:C${r}`, '위험요소', { bold: true, fill: headerFill, align: { horizontal: 'center' } })
  mergeSet(ws, `D${r}:F${r}`, '개선대책', { bold: true, fill: headerFill, align: { horizontal: 'center' } })
  mergeSet(ws, `G${r}:H${r}`, '재해형태', { bold: true, fill: headerFill, align: { horizontal: 'center' } })
  ws.getRow(r).height = 19
  r++
  mergeSet(ws, `A${r}:C${r}`, form.risk.factor || '', { align: { horizontal: 'center' } })
  mergeSet(ws, `D${r}:F${r}`, form.risk.measure || '', { align: { horizontal: 'center' } })
  mergeSet(ws, `G${r}:H${r}`, form.risk.disaster_type || '', { align: { horizontal: 'center' } })
  ws.getRow(r).height = 39
  r++

  // 표 사이 여백용 빈 행
  ws.getRow(r).height = 26
  r++

  // 3. 공사감독 검토내용
  mergeSet(ws, `A${r}:H${r}`, '3. 공사감독 검토내용', { bold: true, size: 11, border: false })
  ws.getRow(r).height = 21
  r++
  mergeSet(ws, `A${r}:D${r}`, '검토의견', { bold: true, fill: headerFill, align: { horizontal: 'center' } })
  mergeSet(ws, `E${r}:H${r}`, '조치결과', { bold: true, fill: headerFill, align: { horizontal: 'center' } })
  ws.getRow(r).height = 19
  r++
  mergeSet(ws, `A${r}:D${r}`, form.supervisor.opinion || '', {})
  mergeSet(ws, `E${r}:H${r}`, form.supervisor.action || '', {})
  ws.getRow(r).height = 39
  r++

  // 붙임
  mergeSet(
    ws,
    `A${r}:H${r}`,
    '붙 임  1. 해당공종 수시 위험성평가표\n        2. 개선대책 확인자료(사진 등)\n        3. 차량계 건설기계 작업계획서',
    { size: 9, color: 'FF555555', border: false }
  )
  ws.getRow(r).height = 43
  r++

  // 붙임 아래 여백용 빈 행
  ws.getRow(r).height = 43
  r++

  // 날짜
  mergeSet(ws, `A${r}:H${r}`, formatDateKorean(record.permit_date), {
    size: 12, border: false, align: { horizontal: 'center' },
  })
  ws.getRow(r).height = 28
  r++

  // 날짜 아래 여백용 빈 행
  ws.getRow(r).height = 28
  r++

  // 서명
  addSignatureRow(wb, ws, r++, '작성자 : 현장대리인', sig.writer?.name || '', sig.writer?.signature)
  addSignatureRow(wb, ws, r++, '(계획확인)허가자 : 공사감독원', sig.permitter?.name || '', sig.permitter?.signature)
  addSignatureRow(wb, ws, r++, '(이행확인)확인자 : 공사감독원', sig.confirmer?.name || '', sig.confirmer?.signature)
  r = addExtraSignatureRows(wb, ws, r, sig)
  return r - 1
}

// ── ②③④ 공용 허가서 (정전/화기/밀폐공간)
const buildCommonSheet = (
  wb: ExcelJS.Workbook,
  ws: ExcelJS.Worksheet,
  record: PtwPermitRecord,
  config: PermitTypeConfig
): number => {
  const form = record.form_data as CommonPermitFormData
  const sig = record.signatures || {}

  ws.columns = COLS.map((col) => ({ width: col === 'A' ? 14 : 12 }))
  let r = 1

  // 상단 여백용 빈 행
  ws.getRow(r).height = 15
  r++

  // 제목 (박스)
  mergeSet(ws, `A${r}:H${r}`, `${config.label}${config.suffix}`, {
    bold: true, size: 16, align: { horizontal: 'center' },
  })
  ws.getRow(r).height = 32
  r++

  // 섹션 번호 (사전 필요유무 다음부터 이어서 번호 부여)
  let sec = config.preQuestions.length

  // 연녹색 섹션 헤더 (원본 서식의 번호 매겨진 띠)
  const sectionHeader = (text: string, height = 20) => {
    mergeSet(ws, `A${r}:H${r}`, text, { bold: true, fill: greenFill, size: 10 })
    ws.getRow(r).height = height
    r++
  }

  // 상단 정보 행 (ㅇ 라벨 : 값)
  const infoRow = (label: string, value: string, opts: { red?: boolean; height?: number } = {}) => {
    setCell(ws, `A${r}`, `ㅇ ${label} :`, { bold: true, size: 10 })
    mergeSet(ws, `B${r}:H${r}`, value, opts.red ? { color: 'FFFF0000', size: 10 } : { size: 10 })
    ws.getRow(r).height = opts.height ?? 24
    r++
  }

  // 신청인
  setCell(ws, `A${r}`, 'ㅇ 신 청 인 :', { bold: true, size: 10 })
  mergeSet(
    ws,
    `B${r}:H${r}`,
    `업체명: ${form.applicant.company || ''}    직책: ${form.applicant.position || ''}    성명: ${form.applicant.name || ''}  ${sig.applicant?.signature ? '' : '(서명)'}`,
    { size: 10 }
  )
  addSignatureImage(wb, ws, sig.applicant?.signature, 6.5, r)
  ws.getRow(r).height = 24
  r++

  // 감시인 (밀폐공간)
  if (config.hasWatcher) {
    setCell(ws, `A${r}`, 'ㅇ 감 시 인 :', { bold: true, size: 10 })
    mergeSet(
      ws,
      `B${r}:H${r}`,
      `부서: ${form.watcher?.dept || ''}    직책: ${form.watcher?.position || ''}    성명: ${form.watcher?.name || ''}  ${sig.watcher?.signature ? '' : '(서명)'}`,
      { size: 10 }
    )
    addSignatureImage(wb, ws, sig.watcher?.signature, 6.5, r)
    ws.getRow(r).height = 24
    r++
  }

  // 작업허가시간(빨간 글씨)/장소/내용/출입자
  infoRow(
    '작업허가시간',
    `① 시작시간: ${record.permit_date || '      년    월    일'}  ${form.start_time || '  시   분'}      ② 종료시간(사후기재): ${form.end_time || '  시   분'}`,
    { red: true }
  )
  infoRow('작 업 장 소', form.location || '')
  infoRow('작 업 내 용', form.content || '')
  infoRow('출입자 명단', form.entrants || '', { height: 28 })

  // 허가 문구
  mergeSet(ws, `A${r}:H${r}`, '위 공간에서의 작업을 다음의 조건하에서만 허가함.', {
    bold: true, align: { horizontal: 'center' },
  })
  ws.getRow(r).height = 24
  r++

  // 사전 필요유무
  config.preQuestions.forEach((question, i) => {
    const answer = form.pre_answers?.[i] || ''
    const options = question.options
      .map((option) => `${answer === option ? '■' : '□'} ${option}`)
      .join('      ')
    mergeSet(ws, `A${r}:H${r}`, `${i + 1}. ${question.label} :    ${options}`, { fill: greenFill })
    ws.getRow(r).height = 20
    r++
  })

  // 안전조치 섹션 헤더 (연녹색, 번호)
  sectionHeader(`${++sec}. ${config.checklistTitle}`)

  // 체크리스트 2단 헤더: 확인항목 | 점검결과(적정/부적정/해당없음) | 비고
  mergeSet(ws, `A${r}:D${r + 1}`, '확인항목(용역감독)', {
    bold: true, fill: headerFill, align: { horizontal: 'center' }, size: 9,
  })
  mergeSet(ws, `E${r}:G${r}`, '점검결과', { bold: true, fill: headerFill, align: { horizontal: 'center' }, size: 9 })
  mergeSet(ws, `H${r}:H${r + 1}`, '비고', { bold: true, fill: headerFill, align: { horizontal: 'center' }, size: 9 })
  ws.getRow(r).height = 16
  r++
  setCell(ws, `E${r}`, '적정', { bold: true, fill: headerFill, align: { horizontal: 'center' }, size: 9 })
  setCell(ws, `F${r}`, '부적정', { bold: true, fill: headerFill, align: { horizontal: 'center' }, size: 9 })
  setCell(ws, `G${r}`, '해당없음', { bold: true, fill: headerFill, align: { horizontal: 'center' }, size: 9 })
  ws.getRow(r).height = 16
  r++
  config.checklistItems.forEach((item, i) => {
    const entry = form.checklist?.[i]
    const mark = (value: string) => (entry?.result === value ? '■' : '□')
    mergeSet(ws, `A${r}:D${r}`, `ㅇ ${item}`, { size: 9 })
    setCell(ws, `E${r}`, mark('적정'), { align: { horizontal: 'center' }, size: 9 })
    setCell(ws, `F${r}`, mark('부적정'), { align: { horizontal: 'center' }, size: 9 })
    setCell(ws, `G${r}`, mark('해당없음'), { align: { horizontal: 'center' }, size: 9 })
    setCell(ws, `H${r}`, entry?.note || '', { size: 9 })
    ws.getRow(r).height = 19
    r++
  })

  // 화기작업: 산소 및 유해가스 농도 측정결과
  if (config.gasTable === 'hot_work') {
    sectionHeader(`${++sec}. 산소 및 유해가스 농도 측정결과`)
    mergeSet(ws, `A${r}:B${r}`, '측정물질명', { bold: true, fill: headerFill, align: { horizontal: 'center' }, size: 9 })
    setCell(ws, `C${r}`, '측정농도', { bold: true, fill: headerFill, align: { horizontal: 'center' }, size: 9 })
    setCell(ws, `D${r}`, '측정시간', { bold: true, fill: headerFill, align: { horizontal: 'center' }, size: 9 })
    mergeSet(ws, `E${r}:F${r}`, '측정자', { bold: true, fill: headerFill, align: { horizontal: 'center' }, size: 9 })
    mergeSet(ws, `G${r}:H${r}`, '감시인 확인', { bold: true, fill: headerFill, align: { horizontal: 'center' }, size: 9 })
    ws.getRow(r).height = 18
    r++
    ;(form.hot_gas_rows || []).forEach((row) => {
      mergeSet(ws, `A${r}:B${r}`, row.substance || '', { align: { horizontal: 'center' } })
      setCell(ws, `C${r}`, row.concentration || '', { align: { horizontal: 'center' } })
      setCell(ws, `D${r}`, row.time || '', { align: { horizontal: 'center' } })
      mergeSet(ws, `E${r}:F${r}`, row.measurer || '', { align: { horizontal: 'center' } })
      mergeSet(ws, `G${r}:H${r}`, row.watcher_confirm || '', { align: { horizontal: 'center' } })
      ws.getRow(r).height = 20
      r++
    })
  }

  // 밀폐공간: 산소 및 유해가스 농도 측정결과 (전/중/중)
  if (config.gasTable === 'confined_space') {
    sectionHeader(
      `${++sec}. 산소 및 유해가스 농도 측정결과\n[적정수치 O₂(18~23.5%) CO₂(1.5% 미만) H₂S(10ppm미만) CO(30ppm미만) EX(10%미만)]`,
      32
    )
    setCell(ws, `A${r}`, '구분', { bold: true, fill: headerFill, align: { horizontal: 'center' }, size: 9 })
    setCell(ws, `B${r}`, '시간', { bold: true, fill: headerFill, align: { horizontal: 'center' }, size: 9 })
    mergeSet(ws, `C${r}:E${r}`, '측정물질명 및 농도', { bold: true, fill: headerFill, align: { horizontal: 'center' }, size: 9 })
    setCell(ws, `F${r}`, '측정자', { bold: true, fill: headerFill, align: { horizontal: 'center' }, size: 9 })
    setCell(ws, `G${r}`, '입(명)', { bold: true, fill: headerFill, align: { horizontal: 'center' }, size: 9 })
    setCell(ws, `H${r}`, '출(명)', { bold: true, fill: headerFill, align: { horizontal: 'center' }, size: 9 })
    ws.getRow(r).height = 18
    r++
    ;(form.confined_gas_rows || []).forEach((row, i) => {
      setCell(ws, `A${r}`, `${row.phase || ''}${i > 0 ? '*' : ''}`, { fill: headerFill, align: { horizontal: 'center' } })
      setCell(ws, `B${r}`, row.time || '', { align: { horizontal: 'center' } })
      mergeSet(
        ws,
        `C${r}:E${r}`,
        `O₂:${row.o2 || '  '}%  CO₂:${row.co2 || '  '}%  H₂S:${row.h2s || '  '}ppm  CO:${row.co || '  '}ppm  EX:${row.ex || '  '}%`,
        { size: 9 }
      )
      setCell(ws, `F${r}`, row.measurer || '', { align: { horizontal: 'center' } })
      setCell(ws, `G${r}`, row.in_count || '', { align: { horizontal: 'center' } })
      setCell(ws, `H${r}`, row.out_count || '', { align: { horizontal: 'center' } })
      ws.getRow(r).height = 20
      r++
    })
    mergeSet(ws, `A${r}:H${r}`, '*중 : 작업을 일시 중단(작업장소 일탈)하였다가 다시 시작하기 전 재측정 필요', {
      size: 8, color: 'FF777777', border: false,
    })
    ws.getRow(r).height = 16
    r++
  }

  // 정전작업: 점검 확인 결과
  if (config.deviceTable === 'electrical') {
    sectionHeader(`${++sec}. 점검 확인 결과`)
    mergeSet(ws, `A${r}:B${r}`, '점검 기기', { bold: true, fill: headerFill, align: { horizontal: 'center' }, size: 9 })
    mergeSet(ws, `C${r}:D${r}`, '차단확인자', { bold: true, fill: headerFill, align: { horizontal: 'center' }, size: 9 })
    mergeSet(ws, `E${r}:F${r}`, '전기담당자', { bold: true, fill: headerFill, align: { horizontal: 'center' }, size: 9 })
    mergeSet(ws, `G${r}:H${r}`, '현장정비', { bold: true, fill: headerFill, align: { horizontal: 'center' }, size: 9 })
    ws.getRow(r).height = 18
    r++
    ;(form.electrical_devices || []).forEach((row) => {
      mergeSet(ws, `A${r}:B${r}`, row.device || '', { align: { horizontal: 'center' } })
      mergeSet(ws, `C${r}:D${r}`, row.breaker_confirmer || '', { align: { horizontal: 'center' } })
      mergeSet(ws, `E${r}:F${r}`, row.electric_manager || '', { align: { horizontal: 'center' } })
      mergeSet(ws, `G${r}:H${r}`, row.site_maintenance || '', { align: { horizontal: 'center' } })
      ws.getRow(r).height = 20
      r++
    })
  }

  // 화기작업: 기기점검 결과
  if (config.deviceTable === 'hot_work') {
    sectionHeader(`${++sec}. 기기점검 결과`)
    mergeSet(ws, `A${r}:B${r}`, '점검기기명', { bold: true, fill: headerFill, align: { horizontal: 'center' }, size: 9 })
    setCell(ws, `C${r}`, '점검자', { bold: true, fill: headerFill, align: { horizontal: 'center' }, size: 9 })
    setCell(ws, `D${r}`, '입회자', { bold: true, fill: headerFill, align: { horizontal: 'center' }, size: 9 })
    mergeSet(ws, `E${r}:F${r}`, '작업자', { bold: true, fill: headerFill, align: { horizontal: 'center' }, size: 9 })
    mergeSet(ws, `G${r}:H${r}`, '조치사항', { bold: true, fill: headerFill, align: { horizontal: 'center' }, size: 9 })
    ws.getRow(r).height = 18
    r++
    ;(form.hot_devices || []).forEach((row) => {
      mergeSet(ws, `A${r}:B${r}`, row.device || '', { align: { horizontal: 'center' } })
      setCell(ws, `C${r}`, row.inspector || '', { align: { horizontal: 'center' } })
      setCell(ws, `D${r}`, row.witness || '', { align: { horizontal: 'center' } })
      mergeSet(ws, `E${r}:F${r}`, row.worker || '', { align: { horizontal: 'center' } })
      mergeSet(ws, `G${r}:H${r}`, row.action || '', { align: { horizontal: 'center' } })
      ws.getRow(r).height = 20
      r++
    })
  }

  // 특별조치 필요사항
  sectionHeader(`${++sec}. 특별조치 필요사항 :`)
  mergeSet(ws, `A${r}:H${r}`, form.special_note || '', {})
  ws.getRow(r).height = 40
  r++

  // 서명 (원본 서식의 하단 표 형식: 허가자/확인자 | 부서 | 직책 | 성명 | 서명)
  const tableSigRow = (label: string, position: string, name: string, signature?: string) => {
    mergeSet(ws, `A${r}:B${r}`, label, { align: { horizontal: 'center' }, size: 10 })
    mergeSet(ws, `C${r}:D${r}`, '부서', { align: { horizontal: 'center' }, size: 9, color: 'FF999999' })
    setCell(ws, `E${r}`, position, { align: { horizontal: 'center' }, size: 10 })
    mergeSet(ws, `F${r}:G${r}`, name || '', { align: { horizontal: 'center' }, size: 10 })
    setCell(ws, `H${r}`, signature ? '' : '(서명)', { align: { horizontal: 'center' }, size: 9, color: 'FF888888' })
    addSignatureImage(wb, ws, signature, 7, r)
    ws.getRow(r).height = 26
    r++
  }
  tableSigRow('(계획확인)허가자', '용역감독', sig.permitter?.name || '', sig.permitter?.signature)
  tableSigRow('(이행확인)확인자', '용역감독', sig.confirmer?.name || '', sig.confirmer?.signature)
  Object.keys(sig)
    .filter((key) => key.startsWith('extra_'))
    .sort()
    .forEach((key) => {
      tableSigRow('관리감독자(부장)', '', sig[key]?.name || '', sig[key]?.signature)
    })

  // 하단 주석 (화기작업)
  if (config.type === 'hot_work' && config.checklistFootnote) {
    mergeSet(ws, `A${r}:H${r}`, config.checklistFootnote, { size: 8, color: 'FF777777', border: false })
    ws.getRow(r).height = 18
    r++
  }

  return r - 1
}

// ── 안전작업허가 승인대장 (붙임3 서식) 엑셀 다운로드
export async function downloadPtwLedgerExcel(
  records: PtwPermitRecord[],
  projectName: string,
  branchName: string
): Promise<void> {
  const workbook = new ExcelJS.Workbook()
  const ws = workbook.addWorksheet('안전작업허가 승인대장', {
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      // 엑셀 기본 여백
      margins: { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
    },
  })

  // 번호|신청인|작업유형|작업내용|완료여부|비고 (6열)
  ws.columns = [
    { width: 7 }, // A 번호
    { width: 14 }, // B 신청인
    { width: 16 }, // C 작업유형
    { width: 42 }, // D 작업내용
    { width: 12 }, // E 완료여부
    { width: 10 }, // F 비고
  ]

  const blueFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } }
  let r = 1

  // 상단 여백용 빈 행
  ws.getRow(r).height = 15
  r++

  // 붙임3 태그 + 제목 박스
  setCell(ws, `A${r}`, '붙임3', {
    bold: true, fill: blueFill, color: 'FFFFFFFF', align: { horizontal: 'center' }, size: 11,
  })
  mergeSet(ws, `B${r}:F${r}`, ' 안전작업허가 승인대장', { bold: true, size: 11 })
  ws.getRow(r).height = 26
  r++

  // 여백용 빈 행
  ws.getRow(r).height = 14
  r++

  // 제목
  ws.mergeCells(`A${r}:F${r}`)
  const titleCell = ws.getCell(`A${r}`)
  titleCell.value = '안전작업허가 승인대장'
  titleCell.font = { size: 18, bold: true, underline: true }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(r).height = 34
  r++

  // 소속 표기
  mergeSet(ws, `A${r}:F${r}`, `[${[branchName, projectName].filter(Boolean).join('  ')}]`, {
    size: 10, border: false,
  })
  ws.getRow(r).height = 20
  r++

  // 테이블 헤더
  const headers: [string, string][] = [
    ['A', '번호'], ['B', '신청인'], ['C', '작업유형'], ['D', '작업내용'], ['E', '완료여부'], ['F', '비고'],
  ]
  headers.forEach(([col, label]) => {
    setCell(ws, `${col}${r}`, label, { bold: true, fill: headerFill, align: { horizontal: 'center' } })
  })
  ws.getRow(r).height = 26
  r++

  // 데이터 행 (최소 13행 — 빈 칸 유지로 원본 서식 유지)
  const rowCount = Math.max(records.length, 13)
  for (let i = 0; i < rowCount; i++) {
    const record = records[i]
    const config = record ? PERMIT_TYPE_CONFIGS[record.permit_type] : null
    setCell(ws, `A${r}`, record ? i + 1 : '', { align: { horizontal: 'center' } })
    setCell(ws, `B${r}`, record?.applicant_name || '', { align: { horizontal: 'center' } })
    setCell(ws, `C${r}`, config?.short || '', { align: { horizontal: 'center' } })
    setCell(ws, `D${r}`, record?.work_content || '', {})
    setCell(ws, `E${r}`, record ? (record.is_completed ? '완료' : '') : '', { align: { horizontal: 'center' } })
    setCell(ws, `F${r}`, record?.remarks || '', { size: 9 })
    ws.getRow(r).height = 42
    r++
  }

  // 하단 여백이 남지 않도록 행 높이를 A4에 맞춰 확대
  stretchRowsToA4(ws, r - 1)

  const filename = `안전작업허가_승인대장_${new Date().toISOString().split('T')[0]}.xlsx`
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

// ── 메인 진입점: 허가서 1건 엑셀 다운로드
export async function downloadPtwPermitExcel(record: PtwPermitRecord, projectName: string): Promise<void> {
  const config = PERMIT_TYPE_CONFIGS[record.permit_type]
  const workbook = new ExcelJS.Workbook()
  const ws = workbook.addWorksheet(`${config.short} 작업허가서`, {
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      // 엑셀 기본 여백
      margins: { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
    },
  })

  const lastRow = isHighRiskFormData(record.form_data)
    ? buildHighRiskSheet(workbook, ws, record, projectName)
    : buildCommonSheet(workbook, ws, record, config)

  // 하단 여백이 남지 않도록 행 높이를 A4에 맞춰 확대
  stretchRowsToA4(ws, lastRow)

  const dateStr = record.permit_date || new Date().toISOString().split('T')[0]
  const filename = `${config.short}_작업허가서_${dateStr}.xlsx`

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
