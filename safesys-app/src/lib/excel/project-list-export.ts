import * as XLSX from 'xlsx'
import type { Project } from '@/lib/projects'
import { HEADQUARTERS_OPTIONS, BRANCH_OPTIONS } from '@/lib/constants'

interface ProjectExcelData {
  본부: string
  지사명: string
  사업분류: string
  사업명: string
  총사업비: string
  당해년도사업비: string
  '건진법 안전관리계획 작성대상': string
  '산안법 공사안전보건대장 작성대상': string
  '재해예방기술지도 대상': string
  공사감독직급: string
  공사감독명: string
  현장주소: string
  실제작업주소: string
  시공사명: string
  이름: string
  연락처: string
  '1분기': string
  '2분기': string
  '3분기': string
  '4분기': string
  준공여부: string
  비고: string
}

/**
 * 프로젝트 리스트를 엑셀 파일로 다운로드
 * @param projects - 프로젝트 배열 (user_profiles 조인 데이터 포함)
 * @param filename - 저장할 파일명 (기본값: '프로젝트목록_YYYYMMDD.xlsx')
 */
export function downloadProjectListExcel(
  projects: Array<Project & {
    user_profiles?: {
      full_name?: string
      phone_number?: string
      company_name?: string
    }
  }>,
  filename?: string
) {
  // 본부 순서, 지사 순서, display_order 순서로 정렬
  const sortedProjects = [...projects].sort((a, b) => {
    // 1. 본부 순서로 정렬
    const hqOrderA = HEADQUARTERS_OPTIONS.indexOf(a.managing_hq as any)
    const hqOrderB = HEADQUARTERS_OPTIONS.indexOf(b.managing_hq as any)

    // 본부가 다르면 본부 순서로 정렬
    if (hqOrderA !== hqOrderB) {
      // -1인 경우(목록에 없는 본부)는 뒤로
      if (hqOrderA === -1) return 1
      if (hqOrderB === -1) return -1
      return hqOrderA - hqOrderB
    }

    // 2. 같은 본부 내에서는 지사 순서로 정렬
    const branchOptions = BRANCH_OPTIONS[a.managing_hq] || []
    const branchOrderA = branchOptions.indexOf(a.managing_branch)
    const branchOrderB = branchOptions.indexOf(b.managing_branch)

    // 지사가 다르면 지사 순서로 정렬
    if (branchOrderA !== branchOrderB) {
      // -1인 경우(목록에 없는 지사)는 뒤로
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
    return a.project_name.localeCompare(b.project_name, 'ko-KR')
  })

  // 엑셀 데이터 매핑
  const excelData: ProjectExcelData[] = sortedProjects.map(project => {
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

    // 주소 조합
    const fullAddress = project.site_address_detail
      ? `${project.site_address} ${project.site_address_detail}`
      : project.site_address

    return {
      본부: project.managing_hq || '',
      지사명: project.managing_branch || '',
      사업분류: project.project_category || '',
      사업명: project.project_name || '',
      총사업비: (project as any).total_budget || '',
      당해년도사업비: (project as any).current_year_budget || '',
      '건진법 안전관리계획 작성대상': (project as any).construction_law_safety_plan ? 'O' : 'X',
      '산안법 공사안전보건대장 작성대상': (project as any).industrial_law_safety_ledger ? 'O' : 'X',
      '재해예방기술지도 대상': (project as any).disaster_prevention_target ? 'O' : 'X',
      공사감독직급: (project as any).supervisor_position || '',
      공사감독명: (project as any).supervisor_name || '',
      현장주소: fullAddress || '',
      실제작업주소: (project as any).actual_work_address || '',
      시공사명: project.user_profiles?.company_name || '',
      이름: project.user_profiles?.full_name || '',
      연락처: project.user_profiles?.phone_number || '',
      '1분기': q1,
      '2분기': q2,
      '3분기': q3,
      '4분기': q4,
      준공여부: completed,
      비고: ''
    }
  })

  // 워크시트 생성
  const worksheet = XLSX.utils.json_to_sheet(excelData)

  // 열 너비 설정
  worksheet['!cols'] = [
    { wch: 12 },  // 본부
    { wch: 15 },  // 지사명
    { wch: 20 },  // 사업분류
    { wch: 30 },  // 사업명
    { wch: 12 },  // 총사업비
    { wch: 15 },  // 당해년도사업비
    { wch: 12 },  // 건진법 안전관리계획 작성대상
    { wch: 12 },  // 산안법 공사안전보건대장 작성대상
    { wch: 12 },  // 재해예방기술지도 대상
    { wch: 12 },  // 공사감독직급
    { wch: 10 },  // 공사감독명
    { wch: 40 },  // 현장주소
    { wch: 40 },  // 실제작업주소
    { wch: 15 },  // 시공사명
    { wch: 10 },  // 이름
    { wch: 15 },  // 연락처
    { wch: 8 },   // 1분기
    { wch: 8 },   // 2분기
    { wch: 8 },   // 3분기
    { wch: 8 },   // 4분기
    { wch: 10 },  // 준공여부
    { wch: 20 }   // 비고
  ]

  // 워크북 생성
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, '프로젝트목록')

  // 파일명 생성 (기본값: 오늘 날짜)
  const today = new Date()
  const dateString = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`
  const finalFilename = filename || `프로젝트목록_${dateString}.xlsx`

  // 파일 다운로드
  XLSX.writeFile(workbook, finalFilename)
}
