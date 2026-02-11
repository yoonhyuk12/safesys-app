import ExcelJS from 'exceljs'
import type { Project, HeadquartersInspection } from '@/lib/projects'
import { HEADQUARTERS_OPTIONS, BRANCH_OPTIONS } from '@/lib/constants'

interface HeadquartersInspectionExcelData {
  [key: string]: string // 동적 컬럼을 위한 인덱스 시그니처
}

/**
 * 숫자를 1,000 단위로 구분하여 포맷팅
 */
function formatNumber(value: string | number | undefined): string {
  if (!value) return ''
  const numStr = String(value).replace(/,/g, '')
  const num = parseFloat(numStr)
  if (isNaN(num)) return String(value)
  return num.toLocaleString('ko-KR')
}

/**
 * 본부불시점검 현황을 엑셀 파일로 다운로드
 * @param projects - 프로젝트 배열
 * @param headquartersInspections - 본부불시점검 배열
 * @param selectedQuarter - 선택된 분기 (예: '2025Q1')
 * @param filename - 저장할 파일명
 */
export function downloadHeadquartersInspectionExcel(
  projects: Array<Project & {
    user_profiles?: {
      full_name?: string
      phone_number?: string
      company_name?: string
    }
  }>,
  headquartersInspections: HeadquartersInspection[],
  selectedQuarter: string,
  filename?: string
) {
  // 분기 파싱
  const [yearStr, qStr] = (selectedQuarter || '').split('Q')
  const year = parseInt(yearStr || '0', 10)
  const selectedQuarterNum = parseInt(qStr || '0', 10)

  // 동적 컬럼명 생성 (예: "1분기 점검여부", "2분기 점검여부")
  const quarterInspectionColumnName = `${selectedQuarterNum}분기 점검여부`

  // 분기 범위 계산
  const startMonth = (selectedQuarterNum - 1) * 3 // 0-indexed
  const start = new Date(year, startMonth, 1)
  const end = new Date(year, startMonth + 3, 0, 23, 59, 59, 999)

  // 지사 순서 정의 (BRANCH_OPTIONS의 모든 지사를 순서대로)
  const branchOrder: string[] = []
  Object.values(BRANCH_OPTIONS).forEach(branches => {
    branchOrder.push(...branches)
  })

  // 프로젝트 정렬: 본부 순서, 지사 순서, display_order 순서로 정렬
  const sortedProjects = [...projects].sort((a, b) => {
    // 1. 본부 순서로 정렬
    const hqOrderA = HEADQUARTERS_OPTIONS.indexOf(a.managing_hq as any)
    const hqOrderB = HEADQUARTERS_OPTIONS.indexOf(b.managing_hq as any)

    if (hqOrderA !== hqOrderB) {
      if (hqOrderA === -1) return 1
      if (hqOrderB === -1) return -1
      return hqOrderA - hqOrderB
    }

    // 2. 같은 본부 내에서는 지사 순서로 정렬
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

    // 3. 같은 지사 내에서는 display_order로 정렬
    const aOrder = typeof a.display_order === 'number' ? a.display_order : Number.POSITIVE_INFINITY
    const bOrder = typeof b.display_order === 'number' ? b.display_order : Number.POSITIVE_INFINITY
    
    if (aOrder !== bOrder) {
      return aOrder - bOrder
    }
    
    // display_order가 같거나 둘 다 없는 경우 사업명으로 정렬
    return (a.project_name || '').localeCompare(b.project_name || '', 'ko-KR')
  })

  // 엑셀 데이터 매핑
  const excelData: HeadquartersInspectionExcelData[] = sortedProjects.map(project => {
    // is_active JSONB 파싱
    let q1 = '', q2 = '', q3 = '', q4 = '', completed = ''

    if (typeof project.is_active === 'object' && project.is_active !== null) {
      q1 = project.is_active.q1 ? '○' : '×'
      q2 = project.is_active.q2 ? '○' : '×'
      q3 = project.is_active.q3 ? '○' : '×'
      q4 = project.is_active.q4 ? '○' : '×'
      completed = project.is_active.completed ? '완료' : '진행중'
    } else if (typeof project.is_active === 'boolean') {
      // 레거시 boolean 처리
      const active = project.is_active ? '○' : '×'
      q1 = q2 = q3 = q4 = active
      completed = '진행중'
    }

    // 해당 분기 점검 여부 확인
    const projectInspections = headquartersInspections.filter(ins => {
      if (ins.project_id !== project.id) return false

      const inspectionDate = ins.inspection_date ? new Date(ins.inspection_date) : null
      if (!inspectionDate || Number.isNaN(inspectionDate.getTime())) return false

      // 선택된 분기 범위 내에 있는지 확인
      return inspectionDate >= start && inspectionDate <= end
    })

    const quarterInspected = projectInspections.length > 0 ? 'O' : 'X'

    // 주소 조합
    const fullAddress = project.site_address_detail
      ? `${project.site_address} ${project.site_address_detail}`
      : project.site_address

    // 컬럼 순서를 명확히 하기 위해 순서대로 생성
    const row: HeadquartersInspectionExcelData = {}

    row['지사명'] = project.managing_branch || ''
    row['사업분류'] = project.project_category || ''
    row['사업명'] = project.project_name || ''
    row['총사업비'] = formatNumber((project as any).total_budget)
    row['당해년도사업비'] = formatNumber((project as any).current_year_budget)
    row['건진법 안전관리계획 작성대상'] = (project as any).construction_law_safety_plan ? 'O' : 'X'
    row['산안법 공사안전보건대장 작성대상'] = (project as any).industrial_law_safety_ledger ? 'O' : 'X'
    row['재해예방기술지도 대상'] = (project as any).disaster_prevention_target ? 'O' : 'X'
    row['공사감독직급'] = (project as any).supervisor_position || ''
    row['공사감독명'] = (project as any).supervisor_name || ''
    row['현장주소'] = fullAddress || ''
    row['실제작업주소'] = (project as any).actual_work_address || ''
    row['시공사명'] = project.user_profiles?.company_name || ''
    row['이름'] = project.user_profiles?.full_name || ''
    row['연락처'] = project.user_profiles?.phone_number || ''
    row['1분기'] = q1
    row['2분기'] = q2
    row['3분기'] = q3
    row['4분기'] = q4
    row[quarterInspectionColumnName] = quarterInspected  // N분기 점검여부 (4분기 다음)
    row['준공여부'] = completed
    row['비고'] = ''

    return row
  })

  // 소계 계산 함수
  const calculateSubtotal = (columnName: string): string => {
    const values = excelData.map(row => row[columnName])

    // 빈 값 제거
    const nonEmptyValues = values.filter(v => v && v.trim() !== '')

    if (nonEmptyValues.length === 0) return ''

    // 숫자 컬럼 체크 (총사업비, 당해년도사업비)
    if (columnName === '총사업비' || columnName === '당해년도사업비') {
      // 쉼표 제거 후 숫자로 변환하여 합계
      const sum = nonEmptyValues.reduce((acc, val) => {
        const numStr = String(val).replace(/,/g, '')
        const num = parseFloat(numStr)
        return acc + (isNaN(num) ? 0 : num)
      }, 0)
      return formatNumber(sum)
    }

    // O/X 컬럼 체크 (건진법, 산안법, 재해예방기술지도, 1~4분기, N분기 점검여부)
    if (columnName === '건진법 안전관리계획 작성대상' ||
        columnName === '산안법 공사안전보건대장 작성대상' ||
        columnName === '재해예방기술지도 대상' ||
        columnName === '1분기' ||
        columnName === '2분기' ||
        columnName === '3분기' ||
        columnName === '4분기' ||
        columnName === quarterInspectionColumnName) {
      // 'O' 개수만 카운트
      const oCount = values.filter(v => v === 'O' || v === 'o' || v === '○').length
      return String(oCount)
    }

    // 준공여부 컬럼
    if (columnName === '준공여부') {
      const completedCount = values.filter(v => v === '완료').length
      const inProgressCount = values.filter(v => v === '진행중').length
      return `완료:${completedCount} 진행중:${inProgressCount}`
    }

    // 텍스트 컬럼 (지사명, 사업명, 공사감독직급, 공사감독명, 현장주소, 실제작업주소, 시공사명, 이름, 연락처)
    // COUNTA: 비어있지 않은 셀의 개수
    return String(nonEmptyValues.length)
  }

  // 소계 행 생성 (각 컬럼별 소계 값)
  const subtotalRow: HeadquartersInspectionExcelData = {}

  subtotalRow['지사명'] = calculateSubtotal('지사명')
  subtotalRow['사업분류'] = calculateSubtotal('사업분류')
  subtotalRow['사업명'] = calculateSubtotal('사업명')
  subtotalRow['총사업비'] = calculateSubtotal('총사업비')
  subtotalRow['당해년도사업비'] = calculateSubtotal('당해년도사업비')
  subtotalRow['건진법 안전관리계획 작성대상'] = calculateSubtotal('건진법 안전관리계획 작성대상')
  subtotalRow['산안법 공사안전보건대장 작성대상'] = calculateSubtotal('산안법 공사안전보건대장 작성대상')
  subtotalRow['재해예방기술지도 대상'] = calculateSubtotal('재해예방기술지도 대상')
  subtotalRow['공사감독직급'] = calculateSubtotal('공사감독직급')
  subtotalRow['공사감독명'] = calculateSubtotal('공사감독명')
  subtotalRow['현장주소'] = calculateSubtotal('현장주소')
  subtotalRow['실제작업주소'] = calculateSubtotal('실제작업주소')
  subtotalRow['시공사명'] = calculateSubtotal('시공사명')
  subtotalRow['이름'] = calculateSubtotal('이름')
  subtotalRow['연락처'] = calculateSubtotal('연락처')
  subtotalRow['1분기'] = calculateSubtotal('1분기')
  subtotalRow['2분기'] = calculateSubtotal('2분기')
  subtotalRow['3분기'] = calculateSubtotal('3분기')
  subtotalRow['4분기'] = calculateSubtotal('4분기')
  subtotalRow[quarterInspectionColumnName] = calculateSubtotal(quarterInspectionColumnName)
  subtotalRow['준공여부'] = calculateSubtotal('준공여부')
  subtotalRow['비고'] = ''  // 비고는 소계 없음

  // ExcelJS 워크북 및 워크시트 생성
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('본부불시점검현황')

  // 컬럼 정의 (순서대로)
  const columns = [
    { header: '지사명', key: '지사명', width: 15 },
    { header: '사업분류', key: '사업분류', width: 20 },
    { header: '사업명', key: '사업명', width: 30 },
    { header: '총사업비', key: '총사업비', width: 15 },
    { header: '당해년도사업비', key: '당해년도사업비', width: 18 },
    { header: '건진법 안전관리계획 작성대상', key: '건진법 안전관리계획 작성대상', width: 15 },
    { header: '산안법 공사안전보건대장 작성대상', key: '산안법 공사안전보건대장 작성대상', width: 15 },
    { header: '재해예방기술지도 대상', key: '재해예방기술지도 대상', width: 15 },
    { header: '공사감독직급', key: '공사감독직급', width: 12 },
    { header: '공사감독명', key: '공사감독명', width: 12 },
    { header: '현장주소', key: '현장주소', width: 40 },
    { header: '실제작업주소', key: '실제작업주소', width: 40 },
    { header: '시공사명', key: '시공사명', width: 15 },
    { header: '이름', key: '이름', width: 10 },
    { header: '연락처', key: '연락처', width: 15 },
    { header: '1분기', key: '1분기', width: 8 },
    { header: '2분기', key: '2분기', width: 8 },
    { header: '3분기', key: '3분기', width: 8 },
    { header: '4분기', key: '4분기', width: 8 },
    { header: quarterInspectionColumnName, key: quarterInspectionColumnName, width: 12 },
    { header: '준공여부', key: '준공여부', width: 12 },
    { header: '비고', key: '비고', width: 20 }
  ]

  worksheet.columns = columns

  // 제목행 스타일 - 진한 파란색 배경, 흰색 글자
  const headerRow = worksheet.getRow(1)
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' }  // 진한 파란색
    }
    cell.font = {
      color: { argb: 'FFFFFFFF' },    // 흰색
      bold: true
    }
    cell.alignment = {
      horizontal: 'center',
      vertical: 'middle'
    }
  })

  // 소계 행 추가
  const subtotalRowData = worksheet.addRow(subtotalRow)

  // 소계행 스타일 - 연한 회색-파란색 배경
  subtotalRowData.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD9E1F2' }  // 연한 회색-파란색
    }
    cell.font = {
      bold: true
    }
    cell.alignment = {
      horizontal: 'center',
      vertical: 'middle'
    }
  })

  // 데이터 행 추가
  excelData.forEach(row => {
    worksheet.addRow(row)
  })

  // 파일명 생성
  const today = new Date()
  const dateString = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`
  const finalFilename = filename || `본부불시점검현황_${selectedQuarter}_${dateString}.xlsx`

  // 파일 다운로드
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
