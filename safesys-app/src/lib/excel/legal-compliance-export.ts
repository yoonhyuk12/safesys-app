// 법적이행 확인(안전활동 점검표) 엑셀 내보내기 — 원본 「안전활동 점검표」 2시트 양식 재현
// 시트1: 발주자 안전활동 점검표(B~BS), 시트2: 도급사업 안전활동 점검표(B~AC, 도급 해당분만)

import ExcelJS from 'exceljs'
import type { LegalComplianceFormData } from '@/lib/legal-compliance/compliance-utils'
import { RISK_WORK_ORDER } from '@/lib/legal-compliance/compliance-utils'

const thin: ExcelJS.Border = { style: 'thin', color: { argb: 'FF000000' } }
const allBorders: Partial<ExcelJS.Borders> = { top: thin, bottom: thin, left: thin, right: thin }
const headerFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } }

// 열 번호(1=A) ↔ 열 문자 변환
const colLetter = (n: number): string => {
  let s = ''
  let x = n
  while (x > 0) {
    const m = (x - 1) % 26
    s = String.fromCharCode(65 + m) + s
    x = Math.floor((x - 1) / 26)
  }
  return s
}
const colNum = (letters: string): number =>
  letters.split('').reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0)

interface CellOpts {
  bold?: boolean
  size?: number
  fill?: ExcelJS.Fill
  align?: Partial<ExcelJS.Alignment>
  numFmt?: string
  border?: boolean
}

const setCell = (ws: ExcelJS.Worksheet, addr: string, value: ExcelJS.CellValue, opts: CellOpts = {}) => {
  const cell = ws.getCell(addr)
  cell.value = value
  cell.font = { size: opts.size ?? 9, bold: opts.bold ?? false }
  if (opts.fill) cell.fill = opts.fill
  if (opts.numFmt) cell.numFmt = opts.numFmt
  if (opts.border !== false) cell.border = allBorders
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true, ...opts.align }
}

// 병합 범위 전체 테두리 적용(병합 셀 테두리 누락 방지)
const borderRange = (ws: ExcelJS.Worksheet, range: string) => {
  const [start, end] = range.split(':')
  const m1 = start.match(/^([A-Z]+)(\d+)$/)!
  const m2 = end.match(/^([A-Z]+)(\d+)$/)!
  const c1 = colNum(m1[1])
  const c2 = colNum(m2[1])
  const r1 = parseInt(m1[2], 10)
  const r2 = parseInt(m2[2], 10)
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      ws.getCell(`${colLetter(c)}${r}`).border = allBorders
    }
  }
}

const mergeSet = (ws: ExcelJS.Worksheet, range: string, value: ExcelJS.CellValue, opts: CellOpts = {}) => {
  ws.mergeCells(range)
  setCell(ws, range.split(':')[0], value, opts)
  if (opts.border !== false) borderRange(ws, range)
}

// 'YYYY-MM-DD'→'yy.mm.dd', 'YYYY-MM'→'yy.mm', 미기재는 빈칸, 그 외 자유입력은 원문 유지
const toYyMmDd = (v?: string): string => {
  if (!v) return ''
  const d = v.match(/^(\d{2})(\d{2})-(\d{2})-(\d{2})$/)
  if (d) return `${d[2]}.${d[3]}.${d[4]}`
  const m = v.match(/^(\d{2})(\d{2})-(\d{2})$/)
  if (m) return `${m[2]}.${m[3]}`
  return v
}
const toYyMm = (v?: string): string => {
  if (!v) return ''
  const m = v.match(/^(\d{2})(\d{2})-(\d{2})$/)
  if (m) return `${m[2]}.${m[3]}`
  const d = v.match(/^(\d{2})(\d{2})-(\d{2})-(\d{2})$/)
  if (d) return `${d[2]}.${d[3]}`
  return v
}
// 금액 문자열 → 숫자(천단위 서식용), 비어있거나 숫자 아니면 '' 반환
const toNum = (v?: string): number | '' => {
  if (!v) return ''
  const n = Number(String(v).replace(/,/g, ''))
  return Number.isFinite(n) ? n : ''
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

// 그룹 정의: 단일 열이면 leaves 생략(헤더 R3:R4 병합), 다중 열이면 leaves로 하위 라벨(R4) 지정
interface GroupDef {
  start: string
  end: string
  label: string
  leaves?: Array<[string, string]>
}

// 사업개요(B~S) — 두 시트 공통
const OVERVIEW_GROUPS: GroupDef[] = [
  { start: 'B', end: 'B', label: '본부/\n사업단' },
  { start: 'C', end: 'C', label: '사업\n시행자' },
  { start: 'D', end: 'D', label: '사업분야' },
  { start: 'E', end: 'E', label: '세부사업명' },
  { start: 'F', end: 'F', label: '지구명' },
  { start: 'G', end: 'G', label: '구분' },
  { start: 'H', end: 'H', label: '공종' },
  {
    start: 'I', end: 'M', label: '사업기간',
    leaves: [['I', '기본조사\n실시'], ['J', '설계입찰\n공고'], ['K', '착공\n계약서'], ['L', '착공\n실착공'], ['M', '준공\n(예정)']],
  },
  {
    start: 'N', end: 'P', label: '총공사비\n(백만원)',
    leaves: [['N', '합계'], ['O', '순공사비'], ['P', '자재대']],
  },
  {
    start: 'Q', end: 'R', label: '안전예산\n(천원)',
    leaves: [['Q', '산업안전\n보건관리비'], ['R', '안전관리비']],
  },
  { start: 'S', end: 'S', label: '안전관리\n계획서\n대상공종' },
]

// 시트1 안전활동 기본사항(T~AK) + 세부사항(AL~BQ)
const OWNER_BASIC_GROUPS: GroupDef[] = [
  {
    start: 'T', end: 'V', label: '기본안전보건대장',
    leaves: [['T', '해당\n여부'], ['U', '이행\n여부'], ['V', '적정성\n확인']],
  },
  {
    start: 'W', end: 'Z', label: '설계안전보건대장',
    leaves: [['W', '기본대장\n제공(공문)'], ['X', '해당\n여부'], ['Y', '이행\n여부'], ['Z', '적정성\n확인']],
  },
  {
    start: 'AA', end: 'AD', label: '공사안전보건대장',
    leaves: [['AA', '설계대장\n제공(공문)'], ['AB', '해당\n여부'], ['AC', '이행\n여부'], ['AD', '적정성\n확인']],
  },
  {
    start: 'AE', end: 'AF', label: '설계의\n안전성검토',
    leaves: [['AE', '해당\n여부'], ['AF', '이행\n여부']],
  },
  {
    start: 'AG', end: 'AH', label: '안전관리\n계획서 수립',
    leaves: [['AG', '해당\n여부'], ['AH', '이행\n여부']],
  },
  {
    start: 'AI', end: 'AK', label: '안전보건\n조정자 지정',
    leaves: [['AI', '해당\n여부'], ['AJ', '지정\n여부'], ['AK', '통보\n여부']],
  },
]
const OWNER_DETAIL_GROUPS: GroupDef[] = [
  { start: 'AL', end: 'AL', label: '일일\n자체점검' },
  {
    start: 'AM', end: 'AW', label: '위험공종 작업허가제',
    leaves: [
      ['AM', '해당\n여부'],
      ['AN', '①'], ['AO', '②'], ['AP', '③'], ['AQ', '④'], ['AR', '⑤'],
      ['AS', '⑥'], ['AT', '⑦'], ['AU', '⑧'], ['AV', '⑨'],
      ['AW', '작업계획서\n작성·확인'],
    ],
  },
  { start: 'AX', end: 'AX', label: '작업지휘자\n지정' },
  {
    start: 'AY', end: 'BA', label: '안전보건\n조정자 활동',
    leaves: [['AY', '복합공종\n시행'], ['AZ', '회의\n(최초·정기)'], ['BA', '합동점검']],
  },
  { start: 'BB', end: 'BB', label: '공사안전보건\n대장 이행' },
  { start: 'BC', end: 'BC', label: '안전관리비\n사용내역' },
  { start: 'BD', end: 'BD', label: '산업안전보건\n관리비 사용내역' },
  { start: 'BE', end: 'BE', label: '안전교육\n이행확인' },
  {
    start: 'BF', end: 'BG', label: '안전관리실태\n이행점검회의',
    leaves: [['BF', '해당\n여부'], ['BG', '이행\n여부']],
  },
  {
    start: 'BH', end: 'BL', label: '위험성평가 이행 점검',
    leaves: [['BH', '실시\n여부'], ['BI', '참여자\n적정성'], ['BJ', '아차사고\n반영'], ['BK', '감소대책\n실행'], ['BL', '결과\n공유']],
  },
  {
    start: 'BM', end: 'BQ', label: '스마트 안전장비 운영',
    leaves: [['BM', '도입\n여부'], ['BN', '정산액\n합계(천원)'], ['BO', '정산액\n산안비'], ['BP', '정산액\n안전비'], ['BQ', '도입시기\n(연월)']],
  },
]

// 시트2 도급사업 안전관리 의무사항(T~AB) — 모두 단일 열
const CONTRACT_GROUPS: GroupDef[] = [
  { start: 'T', end: 'T', label: '적격수급\n업체선정' },
  { start: 'U', end: 'U', label: '적정공사\n기간반영' },
  { start: 'V', end: 'V', label: '안전보건관리\n책임자 지정' },
  { start: 'W', end: 'W', label: '안전보건\n협의체 구성' },
  { start: 'X', end: 'X', label: '정기회의 이행\n(월별/1회)' },
  { start: 'Y', end: 'Y', label: '도급자 작업장\n순회점검\n(2일/1회)' },
  { start: 'Z', end: 'Z', label: '합동 작업장\n순회점검\n(2개월/1회)' },
  { start: 'AA', end: 'AA', label: '비상시 대피훈련\n(반기별/1회)' },
  { start: 'AB', end: 'AB', label: '안전·보건\n정보 제공' },
]

const NUM_COLS = new Set(['N', 'O', 'P', 'Q', 'R', 'BN', 'BO', 'BP'])

// 사업개요(B~S) 열 값 — 두 시트 공통
const overviewValue = (col: string, fd: LegalComplianceFormData): ExcelJS.CellValue => {
  const o = fd.overview
  switch (col) {
    case 'B': return o.hq || ''
    case 'C': return o.implementer || ''
    case 'D': return o.sector || ''
    case 'E': return o.subProject || ''
    case 'F': return o.districtName || ''
    case 'G': return o.phase || ''
    case 'H': return o.discipline || ''
    case 'I': return toYyMmDd(o.dateBasicSurvey)
    case 'J': return toYyMmDd(o.dateDesignBid)
    case 'K': return toYyMmDd(o.dateContract)
    case 'L': return toYyMmDd(o.dateActualStart)
    case 'M': return toYyMmDd(o.dateCompletion)
    case 'N': return toNum(o.costTotal)
    case 'O': return toNum(o.costNet)
    case 'P': return toNum(o.costMaterial)
    case 'Q': return toNum(o.budgetIndustrial)
    case 'R': return toNum(o.budgetSafety)
    case 'S': return o.safetyPlanTarget || ''
    default: return ''
  }
}

// 시트1 기본·세부사항(T~BS) 열 값
const ownerValue = (col: string, fd: LegalComplianceFormData): ExcelJS.CellValue => {
  const ob = fd.ownerBasic
  const od = fd.ownerDetail
  // 위험공종 대상공종 AN~AV → 선택 시 '○'
  const cn = colNum(col)
  if (cn >= colNum('AN') && cn <= colNum('AV')) {
    return od.riskWorkPermit.targetWorks.includes(RISK_WORK_ORDER[cn - colNum('AN')]) ? '○' : ''
  }
  switch (col) {
    case 'T': return ob.basicLedger.applicable
    case 'U': return ob.basicLedger.implemented
    case 'V': return ob.basicLedger.adequacy
    case 'W': return ob.designLedger.provided
    case 'X': return ob.designLedger.applicable
    case 'Y': return ob.designLedger.implemented
    case 'Z': return ob.designLedger.adequacy
    case 'AA': return ob.constructionLedger.provided
    case 'AB': return ob.constructionLedger.applicable
    case 'AC': return ob.constructionLedger.implemented
    case 'AD': return ob.constructionLedger.adequacy
    case 'AE': return ob.designSafetyReview.applicable
    case 'AF': return ob.designSafetyReview.implemented
    case 'AG': return ob.safetyMgmtPlan.applicable
    case 'AH': return ob.safetyMgmtPlan.implemented
    case 'AI': return ob.coordinator.applicable
    case 'AJ': return ob.coordinator.designated
    case 'AK': return ob.coordinator.notified
    case 'AL': return od.dailySelfCheck
    case 'AM': return od.riskWorkPermit.applicable
    case 'AW': return od.riskWorkPermit.planConfirmed
    case 'AX': return od.workDirector
    case 'AY': return od.coordinatorActivity.multiDiscipline
    case 'AZ': return od.coordinatorActivity.meeting
    case 'BA': return od.coordinatorActivity.jointInspection
    case 'BB': return od.ledgerImplCheck
    case 'BC': return od.safetyCostCheck
    case 'BD': return od.industrialCostCheck
    case 'BE': return od.educationCheck
    case 'BF': return od.implMeeting.applicable
    case 'BG': return od.implMeeting.implemented
    case 'BH': return od.riskAssessment.conducted
    case 'BI': return od.riskAssessment.participants
    case 'BJ': return od.riskAssessment.nearMiss
    case 'BK': return od.riskAssessment.reduction
    case 'BL': return od.riskAssessment.sharing
    case 'BM': return od.smartEquipment.adopted
    case 'BN': return toNum(od.smartEquipment.costTotal)
    case 'BO': return toNum(od.smartEquipment.costIndustrial)
    case 'BP': return toNum(od.smartEquipment.costSafety)
    case 'BQ': return toYyMm(od.smartEquipment.adoptedAt)
    case 'BR': return fd.isContractedWork
    case 'BS': return fd.remarks || ''
    default: return ''
  }
}

// 시트2 도급 의무사항(T~AB) 열 값
const contractValue = (col: string, fd: LegalComplianceFormData): ExcelJS.CellValue => {
  const c = fd.contractChecks
  switch (col) {
    case 'T': return c.qualifiedContractor
    case 'U': return c.adequatePeriod
    case 'V': return c.safetyManager
    case 'W': return c.council
    case 'X': return c.councilMeeting
    case 'Y': return c.contractorPatrol
    case 'Z': return c.jointPatrol
    case 'AA': return c.evacuationDrill
    case 'AB': return c.infoProvision
    case 'AC': return fd.remarks || ''
    default: return ''
  }
}

// 밴드(R2)·그룹(R3)·리프(R4) 3단 헤더 그리기. rowspanBands는 R2:R4 세로 병합할 단일 열 밴드.
const drawHeader = (
  ws: ExcelJS.Worksheet,
  lastCol: string,
  title: string,
  bands: Array<[string, string, string]>,
  groups: GroupDef[],
  rowspanBands: Array<[string, string]>
) => {
  mergeSet(ws, `B1:${lastCol}1`, title, { bold: true, size: 14, border: false })
  ws.getRow(1).height = 30
  for (const [s, e, label] of bands) {
    mergeSet(ws, `${s}2:${e}2`, label, { bold: true, fill: headerFill, size: 10 })
  }
  for (const [col, label] of rowspanBands) {
    mergeSet(ws, `${col}2:${col}4`, label, { bold: true, fill: headerFill })
  }
  for (const g of groups) {
    if (g.leaves && g.leaves.length > 0) {
      mergeSet(ws, `${g.start}3:${g.end}3`, g.label, { bold: true, fill: headerFill })
      for (const [col, leaf] of g.leaves) {
        setCell(ws, `${col}4`, leaf, { bold: true, fill: headerFill, size: 8 })
      }
    } else {
      mergeSet(ws, `${g.start}3:${g.start}4`, g.label, { bold: true, fill: headerFill, size: 8 })
    }
  }
  ws.getRow(2).height = 22
  ws.getRow(3).height = 34
  ws.getRow(4).height = 30
}

// 열 너비 설정 — 텍스트 열은 넓게, 여/부 열은 좁게
const setColumnWidths = (ws: ExcelJS.Worksheet, lastCol: string, wideMap: Record<string, number>) => {
  const last = colNum(lastCol)
  for (let c = colNum('B'); c <= last; c++) {
    const letter = colLetter(c)
    ws.getColumn(c).width = wideMap[letter] ?? 4.6
  }
}

// 시트1: 발주자 안전활동 점검표
const addOwnerSheet = (wb: ExcelJS.Workbook, list: LegalComplianceFormData[]) => {
  const ws = wb.addWorksheet('발주자 안전활동 점검표', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })
  const lastCol = 'BS'
  drawHeader(
    ws,
    lastCol,
    '□ 건설현장 발주자의 안전활동 점검표',
    [['B', 'S', '사업개요'], ['T', 'AK', '안전활동 기본사항'], ['AL', 'BQ', '안전활동 세부사항']],
    [...OVERVIEW_GROUPS, ...OWNER_BASIC_GROUPS, ...OWNER_DETAIL_GROUPS],
    [['BR', '도급사업\n해당여부'], ['BS', '비고']]
  )
  setColumnWidths(ws, lastCol, {
    B: 6, C: 7, D: 7, E: 10, F: 8, G: 4.5, H: 4.5,
    I: 7, J: 7, K: 7, L: 7, M: 7, N: 8, O: 8, P: 8, Q: 8, R: 8, S: 8, BQ: 7, BS: 20,
  })

  let r = 5
  const last = colNum(lastCol)
  for (const fd of list) {
    for (let c = colNum('B'); c <= last; c++) {
      const col = colLetter(c)
      const val = c <= colNum('S') ? overviewValue(col, fd) : ownerValue(col, fd)
      const opts: CellOpts = {}
      if (NUM_COLS.has(col)) opts.numFmt = '#,##0'
      if (col === 'E' || col === 'BS') opts.align = { horizontal: 'left' }
      setCell(ws, `${col}${r}`, val, opts)
    }
    ws.getRow(r).height = 18
    r++
  }
  if (list.length === 0) {
    mergeSet(ws, `B${r}:${lastCol}${r}`, '해당 범위·분기에 등록된 점검표가 없습니다.', { align: { horizontal: 'center' } })
  }
  return ws
}

// 시트2: 도급사업 안전활동 점검표 (isContractedWork==='여' 만)
const addContractSheet = (wb: ExcelJS.Workbook, list: LegalComplianceFormData[]) => {
  const ws = wb.addWorksheet('도급사업 안전활동 점검표', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })
  const lastCol = 'AC'
  drawHeader(
    ws,
    lastCol,
    '□ 건설현장 도급사업 안전관리 점검표',
    [['B', 'S', '사업개요'], ['T', 'AB', '도급사업 안전관리 의무사항']],
    [...OVERVIEW_GROUPS, ...CONTRACT_GROUPS],
    [['AC', '비고']]
  )
  setColumnWidths(ws, lastCol, {
    B: 6, C: 7, D: 7, E: 10, F: 8, G: 4.5, H: 4.5,
    I: 7, J: 7, K: 7, L: 7, M: 7, N: 8, O: 8, P: 8, Q: 8, R: 8, S: 8,
    T: 8, U: 8, V: 9, W: 9, X: 9, Y: 10, Z: 10, AA: 10, AB: 9, AC: 18,
  })

  const contracted = list.filter((fd) => fd.isContractedWork === '여')
  let r = 5
  const last = colNum(lastCol)
  for (const fd of contracted) {
    for (let c = colNum('B'); c <= last; c++) {
      const col = colLetter(c)
      const val = c <= colNum('S') ? overviewValue(col, fd) : contractValue(col, fd)
      const opts: CellOpts = {}
      if (NUM_COLS.has(col)) opts.numFmt = '#,##0'
      if (col === 'E' || col === 'AC') opts.align = { horizontal: 'left' }
      setCell(ws, `${col}${r}`, val, opts)
    }
    ws.getRow(r).height = 18
    r++
  }
  if (contracted.length === 0) {
    mergeSet(ws, `B${r}:${lastCol}${r}`, '도급사업 해당 점검표가 없습니다.', { align: { horizontal: 'center' } })
  }
  return ws
}

// 현재 범위(전체/본부/지사)·연도·분기의 점검표를 2시트 엑셀로 내보낸다
export async function downloadLegalComplianceExcel(
  list: LegalComplianceFormData[],
  scopeLabel: string,
  year: number,
  quarter: number
): Promise<void> {
  const wb = new ExcelJS.Workbook()
  addOwnerSheet(wb, list)
  addContractSheet(wb, list)
  const filename = `안전활동점검표_${scopeLabel}_${year}년${quarter}분기.xlsx`
  await downloadWorkbook(wb, filename)
}
