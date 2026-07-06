// 본부불시점검 현황을 「건설현장 특별점검 결과표」 양식 엑셀로 내보내는 모듈
import ExcelJS from 'exceljs'
import type { Project, HeadquartersInspection } from '@/lib/projects'
import { HEADQUARTERS_OPTIONS, BRANCH_OPTIONS } from '@/lib/constants'

// 점검 항목 정의 — DB(critical/caution/other) 순서와 1:1 대응(인덱스 매핑)
const GROUP_TITLES = {
  critical: '(부딪힘, 물체에 맞음) 굴착기 등 사용 작업',
  caution: '(추락) 가설구조물, 고소작업 등',
  other: '기타사항',
}

const CRITICAL_HEADERS = [
  '① 위험공종 작업허가제 승인, 작업계획서 작성 적정성',
  '② 전조등, 후방영상장치 작동상태, 후사경의 설치상태, 운전자 안전띠',
  '③ 작업장소 지형 및 지반상태',
  '④ 건설기계 주변 접근금지, 작업지휘자, 신호수 배치',
  '⑤ 인양작업시 안전조치',
]
const CAUTION_HEADERS = [
  '① 가설통로 및 작업발판 안전조치',
  '② 비계·동바리 구조 안전',
  '③ 고소작업, 개구부 등 안전조치',
]
const OTHER_HEADERS = [
  '법적이행사항 확인',
  'VAR 매뉴얼 작동성 확인',
  '취약(신규)근로자 안전관리 확인',
  '기술지도 지적사항 확인',
  '안전보건표지 설치',
  'TBM 실시 확인',
  '기타 현장 안전관리에 관한사항',
]

// 항목별 그룹/제목 평탄화 (총 15개)
const ITEM_HEADERS: string[] = [...CRITICAL_HEADERS, ...CAUTION_HEADERS, ...OTHER_HEADERS]
const ITEM_COUNT = ITEM_HEADERS.length // 15
const GROUP_SPANS = [
  { title: GROUP_TITLES.critical, count: CRITICAL_HEADERS.length },
  { title: GROUP_TITLES.caution, count: CAUTION_HEADERS.length },
  { title: GROUP_TITLES.other, count: OTHER_HEADERS.length },
]

// 고정 좌측 컬럼 (B~G) — 1-indexed 컬럼 번호
const COL_HQ = 2           // B 본부/사업단
const COL_BRANCH = 3       // C 지사
const COL_UNIT = 4         // D 단위사업명
const COL_PROJECT = 5      // E 세부사업명
const COL_DISTRICT = 6     // F 지구명
const COL_CONSTRUCTION = 7 // G 해당분기 공사중 여부
const COL_DATE = 8         // H 점검일
const FIRST_ITEM_COL = 9   // I — 첫 점검항목(여)

// 각 항목 k(0-based)의 여/부/해당없음 컬럼 번호
const yeoCol = (k: number) => FIRST_ITEM_COL + k * 3
const buCol = (k: number) => FIRST_ITEM_COL + k * 3 + 1
const naCol = (k: number) => FIRST_ITEM_COL + k * 3 + 2

// 조치결과/비고 컬럼 (항목 영역 다음)
const COL_SUBTOTAL = FIRST_ITEM_COL + ITEM_COUNT * 3 // BA 소계
const COL_YEO_SUM = COL_SUBTOTAL + 1                  // BB 여
const COL_BU_SUM = COL_SUBTOTAL + 2                   // BC 부
const COL_NA_SUM = COL_SUBTOTAL + 3                   // BD 해당없음
const COL_REMARK = COL_SUBTOTAL + 4                   // BE 비고
const LAST_COL = COL_REMARK

const HEADER_ROW_GROUP = 4   // 그룹/좌측 헤더
const HEADER_ROW_ITEM = 5    // 항목 제목
const HEADER_ROW_YN = 6      // 여/부/해당없음
const TOTAL_ROW = 7          // 계
const FIRST_DATA_ROW = 8

// 1-indexed 컬럼 번호 → 엑셀 컬럼 문자
function colLetter(col: number): string {
  let s = ''
  let n = col
  while (n > 0) {
    const m = (n - 1) % 26
    s = String.fromCharCode(65 + m) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

interface ChecklistItem {
  title?: string
  status?: 'good' | 'bad' | ''
  remarks?: string
}

// '해당없음' 판정: status는 good이지만 점검결과 텍스트가 '해당(사항|작업) 없음' 계열이면 해당없음으로 분류
function isNaRemarks(remarks?: string): boolean {
  const normalized = (remarks || '').replace(/\s+/g, '')
  return /해당(사항|작업)?없음/.test(normalized)
}

// 지구명: 사업명의 공백 기준 첫 단어, 공백이 없으면 앞 3글자
function districtNameFrom(projectName: string): string {
  const name = (projectName || '').trim()
  if (!name) return ''
  const spaceIdx = name.indexOf(' ')
  return spaceIdx >= 0 ? name.slice(0, spaceIdx) : name.slice(0, 3)
}

// 해당 분기 공사중 여부: is_active.q{N}(JSONB), 레거시 boolean은 그 값
function isUnderConstruction(isActive: Project['is_active'], quarterNum: number): boolean {
  if (typeof isActive === 'object' && isActive !== null) {
    const key = `q${quarterNum}` as 'q1' | 'q2' | 'q3' | 'q4'
    return !!isActive[key]
  }
  if (typeof isActive === 'boolean') return isActive
  return false
}

/**
 * 본부불시점검 현황을 「특별점검 결과표」 양식 엑셀로 다운로드
 * @param projects - 프로젝트 배열 (호출부에서 본부/지사 필터 적용됨)
 * @param headquartersInspections - 본부불시점검 배열
 * @param selectedQuarter - 선택된 분기 (예: '2026Q2')
 * @param filename - 저장할 파일명
 */
export function downloadHeadquartersInspectionExcel(
  projects: Array<Project & {
    user_profiles?: { full_name?: string; phone_number?: string; company_name?: string }
  }>,
  headquartersInspections: HeadquartersInspection[],
  selectedQuarter: string,
  filename?: string
) {
  // 분기 파싱 및 날짜 범위 계산
  const [yearStr, qStr] = (selectedQuarter || '').split('Q')
  const year = parseInt(yearStr || '0', 10)
  const quarterNum = parseInt(qStr || '0', 10)
  const startMonth = (quarterNum - 1) * 3
  const start = new Date(year, startMonth, 1)
  const end = new Date(year, startMonth + 3, 0, 23, 59, 59, 999)

  // 준공(completed) 제외
  const activeProjects = projects.filter(p => {
    if (typeof p.is_active === 'object' && p.is_active !== null) {
      return !p.is_active.completed
    }
    return true // 레거시 boolean 등은 포함
  })

  // 정렬: 본부 순서 → 지사 순서 → display_order → 사업명
  const sortedProjects = [...activeProjects].sort((a, b) => {
    const hqOrderA = HEADQUARTERS_OPTIONS.indexOf(a.managing_hq as any)
    const hqOrderB = HEADQUARTERS_OPTIONS.indexOf(b.managing_hq as any)
    if (hqOrderA !== hqOrderB) {
      if (hqOrderA === -1) return 1
      if (hqOrderB === -1) return -1
      return hqOrderA - hqOrderB
    }
    const branchOptions = BRANCH_OPTIONS[a.managing_hq] || []
    const branchOrderA = branchOptions.indexOf(a.managing_branch)
    const branchOrderB = branchOptions.indexOf(b.managing_branch)
    if (branchOrderA !== branchOrderB) {
      if (branchOrderA === -1 && branchOrderB === -1) {
        return a.managing_branch.localeCompare(b.managing_branch, 'ko-KR')
      }
      if (branchOrderA === -1) return 1
      if (branchOrderB === -1) return -1
      return branchOrderA - branchOrderB
    }
    const aOrder = typeof a.display_order === 'number' ? a.display_order : Number.POSITIVE_INFINITY
    const bOrder = typeof b.display_order === 'number' ? b.display_order : Number.POSITIVE_INFINITY
    if (aOrder !== bOrder) return aOrder - bOrder
    return (a.project_name || '').localeCompare(b.project_name || '', 'ko-KR')
  })

  // 프로젝트별 해당 분기 최신 점검 매칭
  const latestInspectionOf = (projectId: string): HeadquartersInspection | undefined => {
    return headquartersInspections
      .filter(ins => {
        if (ins.project_id !== projectId) return false
        const d = ins.inspection_date ? new Date(ins.inspection_date) : null
        if (!d || Number.isNaN(d.getTime())) return false
        return d >= start && d <= end
      })
      .sort((a, b) => (b.inspection_date || '').localeCompare(a.inspection_date || ''))[0]
  }

  // 점검 1건의 항목을 15개 평탄 배열로 (critical 5 + caution 3 + other 7)
  const flattenItems = (ins?: HeadquartersInspection): ChecklistItem[] => {
    if (!ins) return []
    const critical = (ins.critical_items as ChecklistItem[] | undefined) || []
    const caution = (ins.caution_items as ChecklistItem[] | undefined) || []
    const other = (ins.other_items as ChecklistItem[] | undefined) || []
    return [...critical, ...caution, ...other]
  }

  // ===== 워크북 생성 =====
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('특별점검결과표')

  // 열 너비
  worksheet.getColumn(1).width = 3      // A 여백
  worksheet.getColumn(COL_HQ).width = 10
  worksheet.getColumn(COL_BRANCH).width = 13
  worksheet.getColumn(COL_UNIT).width = 16
  worksheet.getColumn(COL_PROJECT).width = 34
  worksheet.getColumn(COL_DISTRICT).width = 10
  worksheet.getColumn(COL_CONSTRUCTION).width = 11
  worksheet.getColumn(COL_DATE).width = 12
  for (let k = 0; k < ITEM_COUNT; k++) {
    worksheet.getColumn(yeoCol(k)).width = 5
    worksheet.getColumn(buCol(k)).width = 5
    worksheet.getColumn(naCol(k)).width = 6
  }
  worksheet.getColumn(COL_SUBTOTAL).width = 7
  worksheet.getColumn(COL_YEO_SUM).width = 6
  worksheet.getColumn(COL_BU_SUM).width = 6
  worksheet.getColumn(COL_NA_SUM).width = 8
  worksheet.getColumn(COL_REMARK).width = 18

  // ===== 제목 (R2) =====
  worksheet.mergeCells(2, COL_HQ, 2, COL_DATE)
  const titleCell = worksheet.getCell(2, COL_HQ)
  titleCell.value = `○ ${year}년 ${quarterNum}분기 건설현장 특별점검 결과표`
  titleCell.font = { bold: true, size: 16 }
  titleCell.alignment = { horizontal: 'left', vertical: 'middle' }
  worksheet.getRow(2).height = 30

  // ===== 헤더 (R4~R6) =====
  // 좌측 고정열 — R4:R6 병합
  const leftHeaders: Array<[number, string]> = [
    [COL_HQ, '본부/사업단'],
    [COL_BRANCH, '지사'],
    [COL_UNIT, '단위사업명'],
    [COL_PROJECT, '세부사업명'],
    [COL_DISTRICT, '지구명'],
    [COL_CONSTRUCTION, '공사중 여부'],
    [COL_DATE, '점검일'],
  ]
  leftHeaders.forEach(([col, label]) => {
    worksheet.mergeCells(HEADER_ROW_GROUP, col, HEADER_ROW_YN, col)
    worksheet.getCell(HEADER_ROW_GROUP, col).value = label
  })

  // 그룹 제목 (R4) — 항목 영역을 그룹 단위로 병합
  let groupStart = FIRST_ITEM_COL
  GROUP_SPANS.forEach(g => {
    const from = groupStart
    const to = groupStart + g.count * 3 - 1
    worksheet.mergeCells(HEADER_ROW_GROUP, from, HEADER_ROW_GROUP, to)
    worksheet.getCell(HEADER_ROW_GROUP, from).value = g.title
    groupStart = to + 1
  })

  // 항목 제목 (R5) — 항목별 3칸 병합
  for (let k = 0; k < ITEM_COUNT; k++) {
    worksheet.mergeCells(HEADER_ROW_ITEM, yeoCol(k), HEADER_ROW_ITEM, naCol(k))
    worksheet.getCell(HEADER_ROW_ITEM, yeoCol(k)).value = ITEM_HEADERS[k]
  }

  // 여/부/해당없음 (R6)
  for (let k = 0; k < ITEM_COUNT; k++) {
    worksheet.getCell(HEADER_ROW_YN, yeoCol(k)).value = '여'
    worksheet.getCell(HEADER_ROW_YN, buCol(k)).value = '부'
    worksheet.getCell(HEADER_ROW_YN, naCol(k)).value = '해당없음'
  }

  // 조치결과 (BA4:BD5 병합) + R6 소계/여/부/해당없음
  worksheet.mergeCells(HEADER_ROW_GROUP, COL_SUBTOTAL, HEADER_ROW_ITEM, COL_NA_SUM)
  worksheet.getCell(HEADER_ROW_GROUP, COL_SUBTOTAL).value = '조치결과'
  worksheet.getCell(HEADER_ROW_YN, COL_SUBTOTAL).value = '소계'
  worksheet.getCell(HEADER_ROW_YN, COL_YEO_SUM).value = '여'
  worksheet.getCell(HEADER_ROW_YN, COL_BU_SUM).value = '부'
  worksheet.getCell(HEADER_ROW_YN, COL_NA_SUM).value = '해당없음'

  // 비고 (BE4:BE6 병합)
  worksheet.mergeCells(HEADER_ROW_GROUP, COL_REMARK, HEADER_ROW_YN, COL_REMARK)
  worksheet.getCell(HEADER_ROW_GROUP, COL_REMARK).value = '비고'

  // 헤더 행 높이
  worksheet.getRow(HEADER_ROW_GROUP).height = 34
  worksheet.getRow(HEADER_ROW_ITEM).height = 64
  worksheet.getRow(HEADER_ROW_YN).height = 30

  // ===== 데이터 행 =====
  const dataRowCount = sortedProjects.length
  const lastDataRow = FIRST_DATA_ROW + dataRowCount - 1

  const flaggedRows = new Set<number>() // 공사중인데 해당 분기 점검 이력이 없는 행(강조 대상)
  const buTextCols = new Set<number>()  // 점검결과 텍스트가 들어간 부 항목(0-based) — 컬럼 폭 확대 대상
  sortedProjects.forEach((project, idx) => {
    const r = FIRST_DATA_ROW + idx
    const row = worksheet.getRow(r)
    const insp = latestInspectionOf(project.id)
    const items = flattenItems(insp)
    const underConstruction = isUnderConstruction(project.is_active, quarterNum)

    row.getCell(COL_HQ).value = project.managing_hq || ''
    row.getCell(COL_BRANCH).value = project.managing_branch || ''
    row.getCell(COL_UNIT).value = (project.project_category as string) || ''
    row.getCell(COL_PROJECT).value = project.project_name || ''
    row.getCell(COL_DISTRICT).value = districtNameFrom(project.project_name || '')
    // 해당 분기 공사중 여부
    row.getCell(COL_CONSTRUCTION).value = underConstruction ? 'O' : 'X'
    // 점검 없는 지구는 진짜 빈 셀(null) — 빈 문자열('')은 COUNTA가 카운트하므로 점검 건수 집계가 틀어짐
    row.getCell(COL_DATE).value = insp?.inspection_date || null
    // 공사중인데 해당 분기 점검 이력이 없으면 강조 대상
    if (underConstruction && !insp) flaggedRows.add(r)

    // 점검 이력이 있을 때만 마크
    if (insp) {
      for (let k = 0; k < ITEM_COUNT; k++) {
        const item = items[k]
        if (!item) continue // 항목 누락 시 공백 유지
        if (item.status === 'good') {
          // '여'라도 점검결과가 '해당없음' 계열이면 해당없음으로 분류
          if (isNaRemarks(item.remarks)) row.getCell(naCol(k)).value = 'O'
          else row.getCell(yeoCol(k)).value = 'O'
        } else if (item.status === 'bad') {
          // 부 셀에 점검결과 텍스트를 직접 표기 (없으면 O — COUNTA 집계 유지)
          const text = (item.remarks || '').trim()
          row.getCell(buCol(k)).value = text || 'O'
          if (text) buTextCols.add(k)
        } else {
          row.getCell(naCol(k)).value = 'O' // 미선택 → 해당없음
        }
      }
    }

    // 조치결과 행별 수식
    const yeoRefs = Array.from({ length: ITEM_COUNT }, (_, k) => `${colLetter(yeoCol(k))}${r}`).join(',')
    const buRefs = Array.from({ length: ITEM_COUNT }, (_, k) => `${colLetter(buCol(k))}${r}`).join(',')
    const naRefs = Array.from({ length: ITEM_COUNT }, (_, k) => `${colLetter(naCol(k))}${r}`).join(',')
    // 조치결과는 여/부 모두 '여'로 처리(조치완료) → 부는 0, 여에 여+부 합산
    row.getCell(COL_YEO_SUM).value = { formula: `COUNTA(${yeoRefs},${buRefs})` }
    row.getCell(COL_BU_SUM).value = 0
    row.getCell(COL_NA_SUM).value = { formula: `COUNTA(${naRefs})` }
    const bb = colLetter(COL_YEO_SUM)
    const bd = colLetter(COL_NA_SUM)
    row.getCell(COL_SUBTOTAL).value = { formula: `SUM(${bb}${r}:${bd}${r})` }
    row.getCell(COL_REMARK).value = ''
  })

  // 점검결과 텍스트가 들어간 부 컬럼은 읽을 수 있게 폭 확대
  buTextCols.forEach(k => {
    worksheet.getColumn(buCol(k)).width = 14
  })

  // ===== 계 행 (R7) =====
  const totalRow = worksheet.getRow(TOTAL_ROW)
  totalRow.getCell(COL_HQ).value = '계'
  // 세부사업명 개수
  totalRow.getCell(COL_PROJECT).value = dataRowCount > 0
    ? { formula: `COUNTA(${colLetter(COL_PROJECT)}${FIRST_DATA_ROW}:${colLetter(COL_PROJECT)}${lastDataRow})` }
    : 0
  // 공사중(O) 건수 합계
  totalRow.getCell(COL_CONSTRUCTION).value = dataRowCount > 0
    ? { formula: `COUNTIF(${colLetter(COL_CONSTRUCTION)}${FIRST_DATA_ROW}:${colLetter(COL_CONSTRUCTION)}${lastDataRow},"O")` }
    : 0
  // 점검일 개수 = 해당 분기 점검 건수
  totalRow.getCell(COL_DATE).value = dataRowCount > 0
    ? { formula: `COUNTA(${colLetter(COL_DATE)}${FIRST_DATA_ROW}:${colLetter(COL_DATE)}${lastDataRow})` }
    : 0
  // 각 점검항목 컬럼 COUNTA
  for (let c = FIRST_ITEM_COL; c < COL_SUBTOTAL; c++) {
    const L = colLetter(c)
    totalRow.getCell(c).value = dataRowCount > 0
      ? { formula: `COUNTA(${L}${FIRST_DATA_ROW}:${L}${lastDataRow})` }
      : 0
  }
  // 조치결과 합계
  ;[COL_YEO_SUM, COL_BU_SUM, COL_NA_SUM].forEach(c => {
    const L = colLetter(c)
    totalRow.getCell(c).value = dataRowCount > 0
      ? { formula: `SUM(${L}${FIRST_DATA_ROW}:${L}${lastDataRow})` }
      : 0
  })
  const bbL = colLetter(COL_YEO_SUM)
  const bdL = colLetter(COL_NA_SUM)
  totalRow.getCell(COL_SUBTOTAL).value = { formula: `SUM(${bbL}${TOTAL_ROW}:${bdL}${TOTAL_ROW})` }

  // ===== 스타일 적용 =====
  const thin = { style: 'thin' as const, color: { argb: 'FF808080' } }
  const allBorder = { top: thin, left: thin, bottom: thin, right: thin }

  // 샘플 양식 색상 — Office 표준 테마(theme)+tint 그대로 재현
  // 굴착기=accent6(9), 추락=accent2(5), 기타사항=accent5(8)
  const fillSolid = (fg: { theme: number; tint?: number }): ExcelJS.FillPattern =>
    ({ type: 'pattern', pattern: 'solid', fgColor: fg as ExcelJS.Color })
  const GRAY_FILL = fillSolid({ theme: 0, tint: -0.0499893185216834 }) // 좌측/조치결과
  const WHITE_FILL = fillSolid({ theme: 0 })                            // 비고/점검일
  // 공사중인데 점검 이력이 없는 행 강조(연한 빨강)
  const HIGHLIGHT_FILL: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF9999' } }
  const HEADER_TINT = 0.5999938962981048
  const DATA_TINT = 0.7999816888943144
  const groupThemeOf = (k: number) =>
    k < CRITICAL_HEADERS.length ? 9
      : k < CRITICAL_HEADERS.length + CAUTION_HEADERS.length ? 5
        : 8
  const colGroupTheme = (c: number) => groupThemeOf(Math.floor((c - FIRST_ITEM_COL) / 3))

  // 헤더 영역 스타일 (R4~R6)
  for (let rr = HEADER_ROW_GROUP; rr <= HEADER_ROW_YN; rr++) {
    for (let c = COL_HQ; c <= LAST_COL; c++) {
      const cell = worksheet.getCell(rr, c)
      if (c >= FIRST_ITEM_COL && c < COL_SUBTOTAL) cell.fill = fillSolid({ theme: colGroupTheme(c), tint: HEADER_TINT })
      else if (c === COL_REMARK) cell.fill = WHITE_FILL
      else cell.fill = GRAY_FILL // 좌측(B~G) + 조치결과(BA~BD)
      cell.font = { bold: true, size: 9 }
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      cell.border = allBorder
    }
  }

  // 계 행 스타일 (샘플: 채우기 없음)
  for (let c = COL_HQ; c <= LAST_COL; c++) {
    const cell = worksheet.getCell(TOTAL_ROW, c)
    cell.font = { bold: true, size: 10 }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = allBorder
  }

  // 데이터 행 스타일
  const buTextColNums = new Set([...buTextCols].map(k => buCol(k)))
  for (let idx = 0; idx < dataRowCount; idx++) {
    const r = FIRST_DATA_ROW + idx
    const isFlagged = flaggedRows.has(r)
    for (let c = COL_HQ; c <= LAST_COL; c++) {
      const cell = worksheet.getCell(r, c)
      if (isFlagged) cell.fill = HIGHLIGHT_FILL // 공사중·미점검 행 전체 강조
      else if (c >= FIRST_ITEM_COL && c < COL_SUBTOTAL) cell.fill = fillSolid({ theme: colGroupTheme(c), tint: DATA_TINT })
      else if (c >= COL_SUBTOTAL && c <= COL_NA_SUM) cell.fill = GRAY_FILL // 조치결과
      else if (c === COL_DATE) cell.fill = WHITE_FILL                     // 점검일
      cell.border = allBorder
      // 좌측 텍스트열은 좌측정렬, 나머지(마크/집계)는 가운데
      const isTextCol = c === COL_PROJECT || c === COL_UNIT
      // 텍스트가 들어간 부 컬럼은 줄바꿈 허용
      const isBuTextCol = buTextColNums.has(c)
      cell.alignment = {
        horizontal: isTextCol ? 'left' : 'center',
        vertical: 'middle',
        wrapText: isTextCol || isBuTextCol,
      }
      cell.font = isFlagged
        ? { size: 9, bold: true, color: { argb: 'FF9C0006' } }
        : { size: 9 }
    }
  }

  // 틀 고정: 헤더 7행 + 좌측 G열까지 고정
  worksheet.views = [{ state: 'frozen', xSplit: COL_DATE, ySplit: TOTAL_ROW }]

  // ===== 파일 다운로드 =====
  const today = new Date()
  const dateString = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`
  const finalFilename = filename || `특별점검결과표_${selectedQuarter}_${dateString}.xlsx`

  workbook.xlsx.writeBuffer().then((buffer) => {
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = finalFilename
    link.click()
    window.URL.revokeObjectURL(url)
  })
}
