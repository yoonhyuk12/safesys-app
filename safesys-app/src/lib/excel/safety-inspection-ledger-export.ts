import ExcelJS from 'exceljs'
import type { SafetyInspectionDetailForExcel } from '@/lib/projects'
import { HEADQUARTERS_OPTIONS, BRANCH_OPTIONS } from '@/lib/constants'

const thin: ExcelJS.Border = { style: 'thin', color: { argb: 'FF000000' } }
const allBorders: Partial<ExcelJS.Borders> = {
  top: thin, bottom: thin, left: thin, right: thin,
}

const headerFill: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFD9E1F2' },
}

const subtotalFill: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFE2EFDA' },
}

const COLUMNS = [
  { header: '본부', key: 'hq', width: 15 },
  { header: '지사', key: 'branch', width: 15 },
  { header: '사업분류', key: 'category', width: 15 },
  { header: '프로젝트명', key: 'projectName', width: 30 },
  { header: '지구명', key: 'districtName', width: 20 },
  { header: '점검일', key: 'inspectionDate', width: 14 },
  { header: '가① 지적사항', key: 'core1Finding', width: 25 },
  { header: '가① 조치사항', key: 'core1Action', width: 25 },
  { header: '가② 지적사항', key: 'core2Finding', width: 25 },
  { header: '가② 조치사항', key: 'core2Action', width: 25 },
  { header: '가③ 지적사항', key: 'core3Finding', width: 25 },
  { header: '가③ 조치사항', key: 'core3Action', width: 25 },
  { header: '나 지적사항', key: 'naFinding', width: 25 },
  { header: '나 조치사항', key: 'naAction', width: 25 },
  { header: '다 지적사항', key: 'daFinding', width: 25 },
  { header: '다 조치사항', key: 'daAction', width: 25 },
  { header: '라 지적사항', key: 'raFinding', width: 25 },
  { header: '라 조치사항', key: 'raAction', width: 25 },
  { header: '마 지적사항', key: 'maFinding', width: 25 },
  { header: '마 조치사항', key: 'maAction', width: 25 },
  { header: '지적사항1', key: 'finding1', width: 25 },
  { header: '조치사항1', key: 'action1', width: 25 },
  { header: '지적사항2', key: 'finding2', width: 25 },
  { header: '조치사항2', key: 'action2', width: 25 },
  { header: '지적사항3', key: 'finding3', width: 25 },
  { header: '조치사항3', key: 'action3', width: 25 },
  { header: '조치결과(소계)', key: 'resultTotal', width: 14 },
  { header: '조치완료', key: 'actionDone', width: 10 },
  { header: '조치중', key: 'actionInProgress', width: 10 },
  { header: '조치예정일', key: 'actionDueDate', width: 14 },
  { header: '비고', key: 'note', width: 15 },
]

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getAdditionalFinding(it: { item: string; action: string } | undefined): string {
  return (it && it.action && it.action !== '해당없음') ? it.item : ''
}
function getAdditionalAction(it: { item: string; action: string } | undefined): string {
  return (it && it.action && it.action !== '해당없음') ? it.action : ''
}

function buildRow(item: SafetyInspectionDetailForExcel) {
  const results = item.results.sort((a, b) => a.sort_order - b.sort_order)

  // 조치 완료/조치중 카운트
  const totalResults = results.length
  const doneCount = results.filter(r => r.after_photo_url && r.after_photo_url.trim() !== '').length
  const inProgressCount = totalResults - doneCount

  // 추가 점검 항목 (해빙기)
  const addItems = item.additional_items || []
  const coreItems = addItems.filter(i => i.category === '가. 안전관리 5대 핵심항목 이행 여부' && i.action && i.action !== '해당없음')
  const naItem = addItems.find(i => i.category === '나. 중점사항' && i.action && i.action !== '해당없음')
  const daItem = addItems.find(i => i.category === '다. 흙막이지보공 및 거푸집동바리' && i.action && i.action !== '해당없음')
  const raItem = addItems.find(i => i.category === '라. 굴착면 및 지반' && i.action && i.action !== '해당없음')
  const maItem = addItems.find(i => i.category === '마. 주변시설' && i.action && i.action !== '해당없음')

  return {
    hq: item.managing_hq,
    branch: item.managing_branch,
    category: item.project_category,
    projectName: item.project_name,
    districtName: item.district_name,
    inspectionDate: formatDate(item.inspection_date),
    core1Finding: getAdditionalFinding(coreItems[0]),
    core1Action: getAdditionalAction(coreItems[0]),
    core2Finding: getAdditionalFinding(coreItems[1]),
    core2Action: getAdditionalAction(coreItems[1]),
    core3Finding: getAdditionalFinding(coreItems[2]),
    core3Action: getAdditionalAction(coreItems[2]),
    naFinding: getAdditionalFinding(naItem),
    naAction: getAdditionalAction(naItem),
    daFinding: getAdditionalFinding(daItem),
    daAction: getAdditionalAction(daItem),
    raFinding: getAdditionalFinding(raItem),
    raAction: getAdditionalAction(raItem),
    maFinding: getAdditionalFinding(maItem),
    maAction: getAdditionalAction(maItem),
    finding1: results[0]?.findings || '',
    action1: results[0]?.action_items || '',
    finding2: results[1]?.findings || '',
    action2: results[1]?.action_items || '',
    finding3: results[2]?.findings || '',
    action3: results[2]?.action_items || '',
    resultTotal: totalResults > 0 ? `${totalResults}건` : '',
    actionDone: doneCount > 0 ? `${doneCount}건` : '',
    actionInProgress: inProgressCount > 0 ? `${inProgressCount}건` : '',
    actionDueDate: '',
    note: '',
  }
}

function applyHeaderStyle(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = headerFill
    cell.border = allBorders
    cell.font = { bold: true, size: 10, name: '맑은 고딕' }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  })
  row.height = 30
}

function applyDataStyle(row: ExcelJS.Row) {
  row.eachCell((cell, colNumber) => {
    cell.border = allBorders
    cell.font = { size: 10, name: '맑은 고딕' }
    cell.alignment = { vertical: 'middle', wrapText: true }
    // 숫자/날짜 관련 컬럼은 가운데 정렬
    if (colNumber === 6) cell.alignment = { horizontal: 'center', vertical: 'middle' }
    if (colNumber >= 27 && colNumber <= 30) cell.alignment = { horizontal: 'center', vertical: 'middle' }
  })
}

function applySubtotalStyle(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = subtotalFill
    cell.border = allBorders
    cell.font = { bold: true, size: 10, name: '맑은 고딕' }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
  })
  row.height = 22
}

/**
 * 정기안전점검 현황 엑셀 다운로드
 * 시트: 본부별로 분리
 */
export function downloadSafetyInspectionLedgerExcel(
  data: SafetyInspectionDetailForExcel[],
  filename?: string
) {
  const workbook = new ExcelJS.Workbook()

  // 본부별 그룹핑
  const hqGroups = new Map<string, SafetyInspectionDetailForExcel[]>()
  data.forEach(item => {
    const hq = item.managing_hq || '미지정'
    const arr = hqGroups.get(hq) || []
    arr.push(item)
    hqGroups.set(hq, arr)
  })

  // HEADQUARTERS_OPTIONS 순서대로 시트 생성
  const hqOrder = [...HEADQUARTERS_OPTIONS]
  // HEADQUARTERS_OPTIONS에 없는 본부도 포함
  hqGroups.forEach((_, hq) => {
    if (!hqOrder.includes(hq)) hqOrder.push(hq)
  })

  for (const hq of hqOrder) {
    const items = hqGroups.get(hq)
    if (!items || items.length === 0) continue

    const sheetName = hq.length > 31 ? hq.slice(0, 31) : hq
    const worksheet = workbook.addWorksheet(sheetName)
    worksheet.columns = COLUMNS.map(c => ({ key: c.key, width: c.width }))

    // 1행: 카테고리 그룹 헤더
    const catRow = worksheet.getRow(1)
    // 좌측 비그룹 컬럼 (1-6) — 세로 병합 예정이므로 여기에 값 설정
    ;[1, 2, 3, 4, 5, 6].forEach(c => { catRow.getCell(c).value = COLUMNS[c - 1].header })
    // 가~마 카테고리 그룹 헤더
    catRow.getCell(7).value = '가. 안전관리 5대 핵심항목 이행 여부'
    catRow.getCell(13).value = '나. 중점사항'
    catRow.getCell(15).value = '다. 흙막이지보공 및 거푸집동바리'
    catRow.getCell(17).value = '라. 굴착면 및 지반'
    catRow.getCell(19).value = '마. 주변시설'
    // 우측 비그룹 컬럼 (21-31) — 세로 병합 예정
    for (let c = 21; c <= 31; c++) { catRow.getCell(c).value = COLUMNS[c - 1].header }
    applyHeaderStyle(catRow)
    catRow.height = 32

    // 2행: 가~마 그룹 내 개별 컬럼 헤더
    const headerRow = worksheet.getRow(2)
    for (let c = 7; c <= 20; c++) { headerRow.getCell(c).value = COLUMNS[c - 1].header }
    applyHeaderStyle(headerRow)

    // 셀 병합
    // 좌측 비그룹 세로 병합 (1행~2행)
    ;[1, 2, 3, 4, 5, 6].forEach(c => worksheet.mergeCells(1, c, 2, c))
    // 우측 비그룹 세로 병합 (1행~2행)
    for (let c = 21; c <= 31; c++) worksheet.mergeCells(1, c, 2, c)
    // 카테고리 가로 병합 (1행)
    worksheet.mergeCells(1, 7, 1, 12)   // 가: 6컬럼
    worksheet.mergeCells(1, 13, 1, 14)  // 나: 2컬럼
    worksheet.mergeCells(1, 15, 1, 16)  // 다: 2컬럼
    worksheet.mergeCells(1, 17, 1, 18)  // 라: 2컬럼
    worksheet.mergeCells(1, 19, 1, 20)  // 마: 2컬럼

    // 지사별 정렬
    const branchOrder = BRANCH_OPTIONS[hq] || []
    items.sort((a, b) => {
      const aIdx = branchOrder.indexOf(a.managing_branch)
      const bIdx = branchOrder.indexOf(b.managing_branch)
      if (aIdx !== bIdx) {
        if (aIdx === -1) return 1
        if (bIdx === -1) return -1
        return aIdx - bIdx
      }
      // 같은 지사 내에서는 점검일 순
      return (a.inspection_date || '').localeCompare(b.inspection_date || '')
    })

    // 지사별 소계를 위한 그룹핑
    const branchGroups = new Map<string, SafetyInspectionDetailForExcel[]>()
    items.forEach(item => {
      const branch = item.managing_branch || '미지정'
      const arr = branchGroups.get(branch) || []
      arr.push(item)
      branchGroups.set(branch, arr)
    })

    // 정렬된 지사 순서
    const sortedBranches: string[] = []
    branchOrder.forEach(b => { if (branchGroups.has(b)) sortedBranches.push(b) })
    branchGroups.forEach((_, b) => { if (!sortedBranches.includes(b)) sortedBranches.push(b) })

    // 전체 소계
    let totalResultCount = 0
    let totalDoneCount = 0
    let totalInProgressCount = 0

    // 소계 행 먼저 (전체)
    // 데이터 먼저 모두 계산
    const allRows: { row: ReturnType<typeof buildRow>; branch: string }[] = []
    for (const branch of sortedBranches) {
      const branchItems = branchGroups.get(branch) || []
      branchItems.forEach(item => {
        allRows.push({ row: buildRow(item), branch })
      })
    }

    // 전체 소계 계산
    allRows.forEach(({ row }) => {
      const rc = parseInt(row.resultTotal) || 0
      const dc = parseInt(row.actionDone) || 0
      const ip = parseInt(row.actionInProgress) || 0
      totalResultCount += rc
      totalDoneCount += dc
      totalInProgressCount += ip
    })

    // 전체 소계 행
    const subtotalRow = worksheet.addRow({
      hq: '소계',
      branch: `${allRows.length}건`,
      category: '',
      projectName: '',
      districtName: '',
      inspectionDate: '',
      core1Finding: '', core1Action: '', core2Finding: '', core2Action: '', core3Finding: '', core3Action: '',
      naFinding: '', naAction: '', daFinding: '', daAction: '', raFinding: '', raAction: '', maFinding: '', maAction: '',
      finding1: '', action1: '', finding2: '', action2: '', finding3: '', action3: '',
      resultTotal: totalResultCount > 0 ? `${totalResultCount}건` : '',
      actionDone: totalDoneCount > 0 ? `${totalDoneCount}건` : '',
      actionInProgress: totalInProgressCount > 0 ? `${totalInProgressCount}건` : '',
      actionDueDate: '',
      note: '',
    })
    applySubtotalStyle(subtotalRow)

    // 데이터 행 출력
    for (const branch of sortedBranches) {
      const branchItems = branchGroups.get(branch) || []
      branchItems.forEach(item => {
        const rowData = buildRow(item)
        const dataRow = worksheet.addRow(rowData)
        applyDataStyle(dataRow)
      })
    }
  }

  // 시트가 하나도 없는 경우
  if (workbook.worksheets.length === 0) {
    const ws = workbook.addWorksheet('데이터 없음')
    ws.getCell('A1').value = '조회된 점검 데이터가 없습니다.'
  }

  // 다운로드
  const now = new Date()
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  const finalFilename = filename || `정기안전점검현황_${dateStr}.xlsx`

  workbook.xlsx.writeBuffer().then(buffer => {
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = finalFilename
    a.click()
    URL.revokeObjectURL(url)
  })
}
