import ExcelJS from 'exceljs'
import type { Project, TBMSafetyInspection } from '@/lib/projects'
import { HEADQUARTERS_OPTIONS, BRANCH_OPTIONS } from '@/lib/constants'
import { supabase } from '@/lib/supabase'

function formatDate(date: string | null | undefined): string {
  if (!date) return ''
  const d = new Date(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}.${month}.${day}`
}

function formatDateForHeader(date: string): string {
  const d = new Date(date)
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const weekdays = ['일', '월', '화', '수', '목', '금', '토']
  const weekday = weekdays[d.getDay()]
  return `${month}/${day} (${weekday})`
}

/**
 * 날짜 범위의 모든 날짜를 생성
 */
function getDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = []
  const start = new Date(startDate)
  const end = new Date(endDate)

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().split('T')[0])
  }

  return dates
}

/**
 * 건설기계 투입 텍스트에서 총 대수를 추출
 * 예: "굴삭기1대, 펌프카1대" → 2
 * 예: "굴삭기 0.2 1대\n크레인 100톤 1대" → 2
 */
function extractEquipmentCount(text: string): number | null {
  if (!text) return null
  const matches = text.match(/(\d+)\s*대/g)
  if (!matches || matches.length === 0) return null
  return matches.reduce((sum, match) => {
    const num = match.match(/(\d+)/)
    return sum + (num ? parseInt(num[1]) : 0)
  }, 0)
}

/**
 * TBM 안전활동점검 현황을 엑셀 파일로 다운로드 (새 형식)
 * @param projects - 프로젝트 배열
 * @param tbmInspections - TBM 안전활동점검 배열
 * @param startDate - 시작일
 * @param endDate - 종료일
 * @param filename - 저장할 파일명
 * @param selectedHq - 선택된 본부 (TBM실시 데이터 조회용)
 * @param selectedBranch - 선택된 지사 (TBM실시 데이터 조회용)
 */
export async function downloadTBMSafetyInspectionExcel(
  projects: Array<Project & {
    user_profiles?: {
      company_name?: string
    }
  }>,
  tbmInspections: TBMSafetyInspection[],
  startDate?: string | null,
  endDate?: string | null,
  filename?: string,
  selectedHq?: string | null,
  selectedBranch?: string | null
) {
  // 시작일과 종료일이 없으면 기본값 사용
  const todayString = new Date().toISOString().split('T')[0]
  const finalStartDate = startDate || todayString
  const finalEndDate = endDate || todayString

  // 날짜 범위 생성
  const dateRange = getDateRange(finalStartDate, finalEndDate)

  // 프로젝트 ID로 프로젝트 맵 생성
  const projectMap = new Map<string, Project & { user_profiles?: { company_name?: string } }>()
  projects.forEach(p => {
    projectMap.set(p.id, p)
  })

  // 날짜별로 TBM 점검 데이터 매핑
  const inspectionsByDate = new Map<string, Map<string, TBMSafetyInspection>>()
  dateRange.forEach(date => {
    inspectionsByDate.set(date, new Map())
  })

  // Supabase에서 tbm_safety_inspections 데이터 직접 조회 (선택한 기간)
  console.log('🔍 TBM확인 데이터 조회 시작 (Supabase):', { finalStartDate, finalEndDate, selectedHq, selectedBranch })

  try {
    let inspectionQuery = supabase
      .from('tbm_safety_inspections')
      .select('*')
      .gte('tbm_date', finalStartDate)
      .lte('tbm_date', finalEndDate)

    const { data: fetchedInspections, error: inspectionError } = await inspectionQuery.order('tbm_date', { ascending: true })

    console.log('📥 TBM확인 Supabase 조회 완료:', fetchedInspections?.length, '건')

    if (inspectionError) {
      console.error('❌ TBM확인 Supabase 조회 실패:', inspectionError)
    } else if (fetchedInspections) {
      fetchedInspections.forEach((insp: any) => {
        if (!insp.tbm_date) return
        const inspectionDate = new Date(insp.tbm_date).toISOString().split('T')[0]
        if (inspectionsByDate.has(inspectionDate)) {
          inspectionsByDate.get(inspectionDate)!.set(insp.project_id, insp as TBMSafetyInspection)
        }
      })
    }
  } catch (error) {
    console.error('❌ TBM확인 데이터 조회 오류:', error)
    // 오류 발생 시 기존 tbmInspections 매개변수 사용 (폴백)
    tbmInspections.forEach((insp: TBMSafetyInspection) => {
      if (!insp.tbm_date) return
      const inspectionDate = new Date(insp.tbm_date).toISOString().split('T')[0]
      if (inspectionsByDate.has(inspectionDate)) {
        inspectionsByDate.get(inspectionDate)!.set(insp.project_id, insp)
      }
    })
  }

  // 지구명 추출 함수
  const extractDistrict = (projectName: string): string => {
    if (!projectName) return ''
    const districtMatch = projectName.match(/^(.+?지구)/)
    if (districtMatch) {
      return districtMatch[1]
    }
    const spaceIndex = projectName.indexOf(' ')
    if (spaceIndex > 0) {
      return projectName.substring(0, spaceIndex)
    }
    return projectName
  }

  // 준공 여부 확인 함수
  const isCompleted = (project: Project): boolean => {
    if (project.is_active === undefined || project.is_active === null) {
      return false // is_active가 없으면 활성 프로젝트로 간주
    }
    if (typeof project.is_active === 'boolean') {
      return !project.is_active // false면 준공
    }
    if (typeof project.is_active === 'object') {
      return project.is_active.completed === true // completed가 true면 준공
    }
    return false
  }

  // tbm_submissions에서 project_id가 있는 데이터 조회
  const submissionsByProjectDate = new Map<string, Map<string, { tbm시간: string, 신규인원: number | null, 대수: number | null, 주소: string }>>()

  try {
    const { data: submissionsWithProjectId, error: submErr } = await supabase
      .from('tbm_submissions')
      .select('project_id, meeting_date, education_start_time, new_worker_count, equipment_input, address')
      .gte('meeting_date', finalStartDate)
      .lte('meeting_date', finalEndDate)
      .not('project_id', 'is', null)
      .neq('today_work', '작업없음')

    if (submErr) {
      console.error('❌ tbm_submissions project_id 조회 실패:', submErr)
    } else if (submissionsWithProjectId) {
      submissionsWithProjectId.forEach((s: any) => {
        if (!s.project_id || !s.meeting_date) return
        const dateStr = new Date(s.meeting_date).toISOString().split('T')[0]
        if (!submissionsByProjectDate.has(s.project_id)) {
          submissionsByProjectDate.set(s.project_id, new Map())
        }
        // 같은 프로젝트/날짜에 여러 제출이 있을 경우 첫 번째만 사용
        if (!submissionsByProjectDate.get(s.project_id)!.has(dateStr)) {
          submissionsByProjectDate.get(s.project_id)!.set(dateStr, {
            tbm시간: s.education_start_time ? s.education_start_time.substring(0, 5) : '',
            신규인원: s.new_worker_count != null && s.new_worker_count > 0 ? s.new_worker_count : null,
            대수: s.equipment_input ? extractEquipmentCount(s.equipment_input) : null,
            주소: s.address || ''
          })
        }
      })
    }
    console.log('📥 tbm_submissions project_id 조회 완료:', submissionsWithProjectId?.length, '건')
  } catch (error) {
    console.error('❌ tbm_submissions project_id 조회 오류:', error)
  }

  // 프로젝트별 데이터 준비
  const projectDataList: Array<{
    본부명: string
    지사명: string
    지구명: string
    공사감독: string
    현장주소: string
    TBM시간: string
    날짜별데이터: Map<string, { 작업여부: string, 입회자: string, 신규인원: number | null, 대수: number | null }>
    display_order?: number
  }> = []

  // 준공지구 제외하여 필터링
  const activeProjects = projects.filter(project => !isCompleted(project))

  activeProjects.forEach(project => {
    const projectName = project?.project_name || ''
    const district = extractDistrict(projectName)

    const projSubmissions = submissionsByProjectDate.get(project.id)

    // 프로젝트의 TBM시간, 현장주소: 기간 내 첫 번째 제출 데이터에서 가져옴
    let TBM시간 = ''
    let 현장주소 = ''
    if (projSubmissions) {
      for (const date of dateRange) {
        const sub = projSubmissions.get(date)
        if (sub) {
          if (!TBM시간 && sub.tbm시간) TBM시간 = sub.tbm시간
          if (!현장주소 && sub.주소) 현장주소 = sub.주소
          if (TBM시간 && 현장주소) break
        }
      }
    }

    const 날짜별데이터 = new Map<string, { 작업여부: string, 입회자: string, 신규인원: number | null, 대수: number | null }>()

    dateRange.forEach(date => {
      const inspection = inspectionsByDate.get(date)?.get(project.id)
      const submission = projSubmissions?.get(date)

      // 입회자: tbm_safety_inspections에서
      const 입회자 = inspection?.is_attended === true ? (inspection.attendee || '') : ''
      // 작업여부: 입회자가 있거나, tbm_submissions에 해당 날짜 제출이 있으면 '여'
      const 작업여부 = (입회자 || submission) ? '여' : ''
      // 신규인원/대수: tbm_submissions에서 (project_id 있는 경우)
      const 신규인원 = submission?.신규인원 ?? null
      const 대수 = submission?.대수 ?? null

      날짜별데이터.set(date, { 작업여부, 입회자, 신규인원, 대수 })
    })

    // 공사감독: "직급 이름" 형식 (예: "3급 윤혁")
    const supervisorParts = [project?.supervisor_position, project?.supervisor_name].filter(Boolean)
    const 공사감독 = supervisorParts.join(' ')

    projectDataList.push({
      본부명: project?.managing_hq || '',
      지사명: project?.managing_branch || '',
      지구명: district,
      공사감독,
      현장주소,
      TBM시간,
      날짜별데이터,
      display_order: project?.display_order
    })
  })

  // 본부 순서, 지사 순서, display_order 순으로 정렬 (TBM확인 시트용)
  projectDataList.sort((a, b) => {
    const hqOrderA = HEADQUARTERS_OPTIONS.indexOf(a.본부명 as any)
    const hqOrderB = HEADQUARTERS_OPTIONS.indexOf(b.본부명 as any)
    if (hqOrderA !== hqOrderB) {
      if (hqOrderA === -1) return 1
      if (hqOrderB === -1) return -1
      return hqOrderA - hqOrderB
    }

    const branchOptions = BRANCH_OPTIONS[a.본부명] || []
    const branchOrderA = branchOptions.indexOf(a.지사명)
    const branchOrderB = branchOptions.indexOf(b.지사명)
    if (branchOrderA !== branchOrderB) {
      if (branchOrderA === -1 && branchOrderB === -1) {
        return a.지사명.localeCompare(b.지사명, 'ko-KR')
      }
      if (branchOrderA === -1) return 1
      if (branchOrderB === -1) return -1
      return branchOrderA - branchOrderB
    }

    // 같은 지사 내에서는 display_order로 정렬
    const aOrder = typeof a.display_order === 'number' ? a.display_order : Number.POSITIVE_INFINITY
    const bOrder = typeof b.display_order === 'number' ? b.display_order : Number.POSITIVE_INFINITY

    if (aOrder !== bOrder) {
      return aOrder - bOrder
    }

    // display_order가 같거나 둘 다 없는 경우 지구명으로 정렬
    return a.지구명.localeCompare(b.지구명, 'ko-KR')
  })

  // ExcelJS 워크북 및 워크시트 생성
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('TBM확인')

  // 1행 헤더 생성 (본부명, 지사명, 지구명, 공사감독, 현장주소, TBM 시간, TBM입회여부, 신규근로자, 건설기계, 비고)
  const headerRow1: (string | number)[] = ['본부명', '지사명', '지구명', '공사감독', '현장주소', 'TBM 시간', 'TBM입회여부']
  // TBM입회여부 병합 공간 (날짜당 2컬럼: 작업여부, 입회자)
  for (let i = 0; i < dateRange.length * 2 - 1; i++) {
    headerRow1.push('')
  }
  // 신규근로자 병합 공간 (날짜당 1컬럼: 신규인원만)
  headerRow1.push('신규근로자')
  for (let i = 0; i < dateRange.length - 1; i++) {
    headerRow1.push('')
  }
  // 건설기계 병합 공간 (날짜당 1컬럼: 대수만)
  headerRow1.push('건설기계')
  for (let i = 0; i < dateRange.length - 1; i++) {
    headerRow1.push('')
  }
  headerRow1.push('비고')

  // 2행 헤더 생성 (날짜들, 신규근로자 날짜들, 건설기계 날짜들)
  const headerRow2: (string | number)[] = ['', '', '', '', '', '']
  // TBM입회여부 날짜들 (날짜당 2컬럼)
  dateRange.forEach(date => {
    headerRow2.push(formatDateForHeader(date))
    headerRow2.push('') // 병합될 두 번째 컬럼은 빈 문자열
  })
  // 신규근로자 날짜들 (날짜당 1컬럼 - 병합 없음)
  dateRange.forEach(date => {
    headerRow2.push(formatDateForHeader(date))
  })
  // 건설기계 날짜들 (날짜당 1컬럼 - 병합 없음)
  dateRange.forEach(date => {
    headerRow2.push(formatDateForHeader(date))
  })
  headerRow2.push('')

  // 3행 헤더 생성 (작업여부/입회자, 신규인원, 대수)
  const headerRow3: (string | number)[] = ['', '', '', '', '', '']
  // TBM입회여부: 작업여부/입회자
  dateRange.forEach(() => {
    headerRow3.push('작업\n(여/부)')
    headerRow3.push('입회자')
  })
  // 신규근로자: 신규인원(명)만
  dateRange.forEach(() => {
    headerRow3.push('신규인원\n(명)')
  })
  // 건설기계: 대수(대)만
  dateRange.forEach(() => {
    headerRow3.push('대수\n(대)')
  })
  headerRow3.push('')

  // 헤더 행 추가
  worksheet.addRow(headerRow1)
  worksheet.addRow(headerRow2)
  worksheet.addRow(headerRow3)

  // 헤더 행 병합 및 스타일 적용
  // 1-3행 병합: 본부명, 지사명, 지구명, 공사감독, 현장주소, TBM 시간
  worksheet.mergeCells(1, 1, 3, 1) // 본부명
  worksheet.mergeCells(1, 2, 3, 2) // 지사명
  worksheet.mergeCells(1, 3, 3, 3) // 지구명
  worksheet.mergeCells(1, 4, 3, 4) // 공사감독
  worksheet.mergeCells(1, 5, 3, 5) // 현장주소
  worksheet.mergeCells(1, 6, 3, 6) // TBM 시간

  // 1행: TBM입회여부 (시작일자부터 종료일자 입회자까지 병합)
  const tbmStartCol = 7 // TBM 시간 다음, 첫 번째 날짜 컬럼
  const tbmEndCol = 6 + dateRange.length * 2 // 마지막 날짜의 입회자 컬럼
  worksheet.mergeCells(1, tbmStartCol, 1, tbmEndCol) // TBM입회여부

  // 1행: 신규근로자 (일자 전체 병합) - 날짜당 1컬럼만
  const workerStartCol = tbmEndCol + 1 // TBM입회여부 다음
  const workerEndCol = workerStartCol + dateRange.length - 1 // 마지막 신규근로자 컬럼
  worksheet.mergeCells(1, workerStartCol, 1, workerEndCol) // 신규근로자

  // 1행: 건설기계 (일자 전체 병합) - 날짜당 1컬럼만
  const equipmentStartCol = workerEndCol + 1 // 신규근로자 다음
  const equipmentEndCol = equipmentStartCol + dateRange.length - 1 // 마지막 건설기계 컬럼
  worksheet.mergeCells(1, equipmentStartCol, 1, equipmentEndCol) // 건설기계

  // 날짜별 컬럼 병합 (2-3행) - TBM입회여부만 (날짜당 2컬럼)
  let colIndex = 7 // TBM 시간 다음부터
  dateRange.forEach(() => {
    worksheet.mergeCells(2, colIndex, 2, colIndex + 1) // 날짜 병합
    colIndex += 2
  })

  // 신규근로자, 건설기계는 날짜당 1컬럼이므로 2-3행 병합 필요
  // 신규근로자: 2-3행 병합
  dateRange.forEach(() => {
    worksheet.mergeCells(2, colIndex, 3, colIndex) // 날짜와 신규인원 헤더 병합
    colIndex += 1
  })

  // 건설기계: 2-3행 병합
  dateRange.forEach(() => {
    worksheet.mergeCells(2, colIndex, 3, colIndex) // 날짜와 대수 헤더 병합
    colIndex += 1
  })

  worksheet.mergeCells(1, colIndex, 3, colIndex) // 비고

  // 헤더 스타일 적용
  const headerRow1Cells = worksheet.getRow(1) // 본부명, 지사명, 지구명, TBM 시간, TBM입회여부 행
  const headerRow2Cells = worksheet.getRow(2) // 날짜 행
  const headerRow3Cells = worksheet.getRow(3) // 작업여부/입회자 행

  // 1행 스타일 (본부명, 지사명, 지구명, TBM 시간, TBM입회여부)
  headerRow1Cells.eachCell((cell, colNumber) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' }
    }
    cell.font = {
      color: { argb: 'FFFFFFFF' },
      bold: true
    }
    cell.alignment = {
      horizontal: 'center',
      vertical: 'middle',
      wrapText: true // 줄바꿈 활성화
    }
    // 테두리 추가 - 섹션 구분선은 굵게
    const isSectionBorder = colNumber === 6 || colNumber === tbmEndCol || colNumber === workerEndCol || colNumber === equipmentEndCol
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: colNumber === 6 || colNumber === tbmEndCol + 1 || colNumber === workerEndCol + 1 || colNumber === equipmentEndCol + 1 ? 'medium' : 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: isSectionBorder ? 'medium' : 'thin', color: { argb: 'FF000000' } }
    }
  })

  // 2행 스타일 (날짜)
  headerRow2Cells.eachCell((cell, colNumber) => {
    if ((colNumber >= tbmStartCol && colNumber <= tbmEndCol) ||
      (colNumber >= workerStartCol && colNumber <= workerEndCol) ||
      (colNumber >= equipmentStartCol && colNumber <= equipmentEndCol)) {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' }
      }
      cell.font = {
        color: { argb: 'FFFFFFFF' },
        bold: true
      }
      cell.alignment = {
        horizontal: 'center',
        vertical: 'middle',
        wrapText: true // 줄바꿈 활성화
      }
    }
    // 테두리 추가 - 섹션 구분선은 굵게
    const isSectionBorder = colNumber === 6 || colNumber === tbmEndCol || colNumber === workerEndCol || colNumber === equipmentEndCol
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: colNumber === 6 || colNumber === tbmEndCol + 1 || colNumber === workerEndCol + 1 || colNumber === equipmentEndCol + 1 ? 'medium' : 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: isSectionBorder ? 'medium' : 'thin', color: { argb: 'FF000000' } }
    }
  })

  // 3행 스타일 (작업여부/입회자, 신규인원/안전활동, 대수/안전활동)
  headerRow3Cells.eachCell((cell, colNumber) => {
    if ((colNumber >= tbmStartCol && colNumber <= tbmEndCol) ||
      (colNumber >= workerStartCol && colNumber <= workerEndCol) ||
      (colNumber >= equipmentStartCol && colNumber <= equipmentEndCol)) {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' }
      }
      cell.font = {
        color: { argb: 'FFFFFFFF' },
        bold: true
      }
    }
    // 모든 셀에 줄바꿈 활성화
    cell.alignment = {
      horizontal: 'center',
      vertical: 'middle',
      wrapText: true // 줄바꿈 활성화
    }
    // 테두리 추가 - 섹션 구분선은 굵게
    const isSectionBorder = colNumber === 6 || colNumber === tbmEndCol || colNumber === workerEndCol || colNumber === equipmentEndCol
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: colNumber === 6 || colNumber === tbmEndCol + 1 || colNumber === workerEndCol + 1 || colNumber === equipmentEndCol + 1 ? 'medium' : 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: isSectionBorder ? 'medium' : 'thin', color: { argb: 'FF000000' } }
    }
  })

  // 소계 행 추가 (4행)
  const subtotalRow: (string | number)[] = ['소계', '', '', '', '']
  // TBM입회여부 날짜별 컬럼에 대해 빈 문자열 추가 (날짜당 2컬럼)
  dateRange.forEach(() => {
    subtotalRow.push('')
    subtotalRow.push('')
  })
  // 신규근로자 날짜별 컬럼에 대해 빈 문자열 추가 (날짜당 1컬럼)
  dateRange.forEach(() => {
    subtotalRow.push('')
  })
  // 건설기계 날짜별 컬럼에 대해 빈 문자열 추가 (날짜당 1컬럼)
  dateRange.forEach(() => {
    subtotalRow.push('')
  })
  subtotalRow.push('')

  const subtotalRowData = worksheet.addRow(subtotalRow)

  // 소계 행 스타일 적용
  subtotalRowData.eachCell((cell, colNumber) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD9E1F2' } // 연한 파란색 배경
    }
    cell.font = {
      bold: true
    }
    cell.alignment = {
      horizontal: 'center', // 가운데 정렬
      vertical: 'middle'
    }
    // 섹션 구분선: 현장주소, TBM입회여부, 신규근로자, 건설기계 사이
    const isSectionBorder = colNumber === 6 || colNumber === tbmEndCol || colNumber === workerEndCol || colNumber === equipmentEndCol
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: colNumber === 6 || colNumber === tbmEndCol + 1 || colNumber === workerEndCol + 1 || colNumber === equipmentEndCol + 1 ? 'medium' : 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: isSectionBorder ? 'medium' : 'thin', color: { argb: 'FF000000' } }
    }
  })

  // 데이터 행 추가 (5행부터)
  const dataStartRow = 5
  const totalCols = 6 + dateRange.length * 2 + dateRange.length + dateRange.length + 1 // 본부명, 지사명, 지구명, 공사감독, 현장주소, TBM 시간, TBM입회여부(2컬럼), 신규근로자(1컬럼), 건설기계(1컬럼), 비고

  projectDataList.forEach((projectData, index) => {
    const dataRow: (string | number | null)[] = [
      projectData.본부명 || null,
      projectData.지사명 || null,
      projectData.지구명 || null,
      projectData.공사감독 || null,
      projectData.현장주소 || null, // 현장주소 (tbm_submissions에서 가져옴)
      projectData.TBM시간 || null  // TBM 시간
    ]

    // TBM입회여부: 작업여부/입회자 (날짜당 2컬럼)
    dateRange.forEach(date => {
      const 날짜데이터 = projectData.날짜별데이터.get(date) || { 작업여부: '', 입회자: '', 신규인원: null, 대수: null }
      dataRow.push(날짜데이터.작업여부 || null)
      dataRow.push(날짜데이터.입회자 || null)
    })

    // 신규근로자: 신규인원(명) - tbm_submissions에서 가져옴 (날짜당 1컬럼)
    dateRange.forEach(date => {
      const 날짜데이터 = projectData.날짜별데이터.get(date) || { 작업여부: '', 입회자: '', 신규인원: null, 대수: null }
      dataRow.push(날짜데이터.신규인원 ?? null)
    })

    // 건설기계: 대수(대) - tbm_submissions에서 가져옴 (날짜당 1컬럼)
    dateRange.forEach(date => {
      const 날짜데이터 = projectData.날짜별데이터.get(date) || { 작업여부: '', 입회자: '', 신규인원: null, 대수: null }
      dataRow.push(날짜데이터.대수 ?? null)
    })

    dataRow.push(null) // 비고 (null로 설정하여 완전히 비움)

    const row = worksheet.addRow(dataRow)
    // 모든 컬럼에 대해 테두리 추가 (빈 셀 포함)
    for (let col = 1; col <= totalCols; col++) {
      const cell = row.getCell(col)
      // 테두리 추가 - 섹션 구분선은 굵게
      const isSectionBorder = col === 6 || col === tbmEndCol || col === workerEndCol || col === equipmentEndCol
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: col === 6 || col === tbmEndCol + 1 || col === workerEndCol + 1 || col === equipmentEndCol + 1 ? 'medium' : 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: isSectionBorder ? 'medium' : 'thin', color: { argb: 'FF000000' } }
      }
      // 현장주소 컬럼: 좌측정렬
      if (col === 5) {
        cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }
      }
      // 신규인원/대수 컬럼에 숫자 서식 적용
      const isNumberCol = (col >= workerStartCol && col <= workerEndCol) ||
        (col >= equipmentStartCol && col <= equipmentEndCol)
      if (isNumberCol && cell.value !== null) {
        const numValue = Number(cell.value)
        if (!isNaN(numValue)) {
          cell.value = numValue
          cell.numFmt = '0'
        }
      }
      cell.alignment = {
        horizontal: 'center',
        vertical: 'middle'
      }
    }
  })

  // 소계 행에 COUNTA 함수 추가 (빈 행 제외)
  const dataEndRow = dataStartRow + projectDataList.length - 1
  const firstColLetter = worksheet.getColumn(1).letter // 본부명 컬럼 (A)

  for (let col = 1; col <= totalCols; col++) {
    const cell = subtotalRowData.getCell(col)
    if (col === 1) {
      // 첫 번째 컬럼은 "소계" 텍스트 유지
      continue
    }
    // ExcelJS에서 수식 설정
    // 본부명 컬럼이 비어있지 않은 행만 카운트하도록 COUNTIFS 사용
    // 빈 문자열("")도 제외하기 위해 "<>" 조건 사용
    const colLetter = worksheet.getColumn(col).letter
    // 본부명이 비어있지 않고, 해당 컬럼도 비어있지 않은 행만 카운트
    // 빈 문자열과 공백도 제외하기 위해 TRIM과 LEN 함수 사용
    cell.value = { formula: `SUMPRODUCT((${firstColLetter}${dataStartRow}:${firstColLetter}${dataEndRow}<>"")*(${colLetter}${dataStartRow}:${colLetter}${dataEndRow}<>""))` }
  }

  // 컬럼 너비 설정
  worksheet.getColumn(1).width = 12 // 본부명
  worksheet.getColumn(2).width = 15 // 지사명
  worksheet.getColumn(3).width = 12 // 지구명
  worksheet.getColumn(4).width = 12 // 공사감독
  worksheet.getColumn(5).width = 30 // 현장주소
  worksheet.getColumn(6).width = 12 // TBM 시간
  let widthColIndex = 7 // TBM 시간 다음부터
  // TBM입회여부: 작업여부/입회자 (날짜당 2컬럼)
  dateRange.forEach(() => {
    worksheet.getColumn(widthColIndex).width = 10 // 작업여부
    worksheet.getColumn(widthColIndex + 1).width = 15 // 입회자
    widthColIndex += 2
  })
  // 신규근로자: 신규인원(명)만 (날짜당 1컬럼)
  dateRange.forEach(() => {
    worksheet.getColumn(widthColIndex).width = 10 // 신규인원
    widthColIndex += 1
  })
  // 건설기계: 대수(대)만 (날짜당 1컬럼)
  dateRange.forEach(() => {
    worksheet.getColumn(widthColIndex).width = 10 // 대수
    widthColIndex += 1
  })
  worksheet.getColumn(widthColIndex).width = 20 // 비고

  // 2번 시트: TBM실시 (헤더행만)
  const worksheet2 = workbook.addWorksheet('TBM실시')

  // TBM실시 시트 헤더 생성 (1행)
  const tbmPracticeHeaderRow1: (string | number)[] = ['본부명', '지사명', '지구명', '작업주소', 'TBM 시간', 'TBM입회여부']
  // TBM입회여부 병합 공간 (날짜당 2컬럼)
  for (let i = 0; i < dateRange.length * 2 - 1; i++) {
    tbmPracticeHeaderRow1.push('')
  }
  // 신규근로자 병합 공간 (날짜당 1컬럼)
  tbmPracticeHeaderRow1.push('신규근로자')
  for (let i = 0; i < dateRange.length - 1; i++) {
    tbmPracticeHeaderRow1.push('')
  }
  // 건설기계 병합 공간 (날짜당 2컬럼: 투입장비 + 대수)
  tbmPracticeHeaderRow1.push('건설기계')
  for (let i = 0; i < dateRange.length * 2 - 1; i++) {
    tbmPracticeHeaderRow1.push('')
  }
  tbmPracticeHeaderRow1.push('비고')

  // TBM실시 시트 헤더 생성 (2행)
  const tbmPracticeHeaderRow2: (string | number)[] = ['', '', '', '', '']
  // TBM입회여부 날짜들 (날짜당 2컬럼)
  dateRange.forEach(date => {
    tbmPracticeHeaderRow2.push(formatDateForHeader(date))
    tbmPracticeHeaderRow2.push('')
  })
  // 신규근로자 날짜들 (날짜당 1컬럼 - 병합 없음)
  dateRange.forEach(date => {
    tbmPracticeHeaderRow2.push(formatDateForHeader(date))
  })
  // 건설기계 날짜들 (날짜당 2컬럼: 투입장비 + 대수)
  dateRange.forEach(date => {
    tbmPracticeHeaderRow2.push(formatDateForHeader(date))
    tbmPracticeHeaderRow2.push('') // 병합될 두 번째 컬럼
  })
  tbmPracticeHeaderRow2.push('')

  // TBM실시 시트 헤더 생성 (3행)
  const tbmPracticeHeaderRow3: (string | number)[] = ['', '', '', '', '']
  // TBM입회여부: 작업여부/입회자
  dateRange.forEach(() => {
    tbmPracticeHeaderRow3.push('작업\n(여/부)')
    tbmPracticeHeaderRow3.push('입회자')
  })
  // 신규근로자: 신규인원(명)만
  dateRange.forEach(() => {
    tbmPracticeHeaderRow3.push('신규인원\n(명)')
  })
  // 건설기계: 투입장비/대수(대) (날짜당 2컬럼)
  dateRange.forEach(() => {
    tbmPracticeHeaderRow3.push('투입장비')
    tbmPracticeHeaderRow3.push('대수\n(대)')
  })
  tbmPracticeHeaderRow3.push('')

  // TBM실시 시트 헤더 행 추가
  worksheet2.addRow(tbmPracticeHeaderRow1)
  worksheet2.addRow(tbmPracticeHeaderRow2)
  worksheet2.addRow(tbmPracticeHeaderRow3)

  // TBM실시 시트 헤더 행 병합 및 스타일 적용 (1번 시트와 동일)
  worksheet2.mergeCells(1, 1, 3, 1) // 본부명
  worksheet2.mergeCells(1, 2, 3, 2) // 지사명
  worksheet2.mergeCells(1, 3, 3, 3) // 지구명
  worksheet2.mergeCells(1, 4, 3, 4) // TBM 시간
  worksheet2.mergeCells(1, 5, 3, 5) // 작업주소

  // 1행: TBM입회여부 병합
  const tbmPracticeTbmStartCol = 6
  const tbmPracticeTbmEndCol = 5 + dateRange.length * 2
  worksheet2.mergeCells(1, tbmPracticeTbmStartCol, 1, tbmPracticeTbmEndCol) // TBM입회여부

  // 1행: 신규근로자 병합 (날짜당 1컬럼)
  const tbmPracticeWorkerStartCol = tbmPracticeTbmEndCol + 1
  const tbmPracticeWorkerEndCol = tbmPracticeWorkerStartCol + dateRange.length - 1
  worksheet2.mergeCells(1, tbmPracticeWorkerStartCol, 1, tbmPracticeWorkerEndCol) // 신규근로자

  // 1행: 건설기계 병합 (날짜당 2컬럼: 투입장비 + 대수)
  const tbmPracticeEquipmentStartCol = tbmPracticeWorkerEndCol + 1
  const tbmPracticeEquipmentEndCol = tbmPracticeEquipmentStartCol + dateRange.length * 2 - 1
  worksheet2.mergeCells(1, tbmPracticeEquipmentStartCol, 1, tbmPracticeEquipmentEndCol) // 건설기계

  // 날짜별 컬럼 병합 (2-3행) - TBM입회여부만 (날짜당 2컬럼)
  let tbmPracticeColIndex = 6
  dateRange.forEach(() => {
    worksheet2.mergeCells(2, tbmPracticeColIndex, 2, tbmPracticeColIndex + 1) // 날짜 병합
    tbmPracticeColIndex += 2
  })

  // 신규근로자: 2-3행 병합 (날짜당 1컬럼)
  dateRange.forEach(() => {
    worksheet2.mergeCells(2, tbmPracticeColIndex, 3, tbmPracticeColIndex) // 날짜와 신규인원 헤더 병합
    tbmPracticeColIndex += 1
  })

  // 건설기계: 날짜당 2컬럼 (투입장비 + 대수)
  dateRange.forEach(() => {
    worksheet2.mergeCells(2, tbmPracticeColIndex, 2, tbmPracticeColIndex + 1) // 날짜 병합
    tbmPracticeColIndex += 2
  })

  worksheet2.mergeCells(1, tbmPracticeColIndex, 3, tbmPracticeColIndex) // 비고

  // TBM실시 시트 헤더 스타일 적용
  const tbmPracticeHeaderRow1Cells = worksheet2.getRow(1)
  const tbmPracticeHeaderRow2Cells = worksheet2.getRow(2)
  const tbmPracticeHeaderRow3Cells = worksheet2.getRow(3)

  // 1행 스타일
  tbmPracticeHeaderRow1Cells.eachCell((cell, colNumber) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' }
    }
    cell.font = {
      color: { argb: 'FFFFFFFF' },
      bold: true
    }
    cell.alignment = {
      horizontal: 'center',
      vertical: 'middle',
      wrapText: true
    }
    const isSectionBorder = colNumber === 4 || colNumber === tbmPracticeTbmEndCol || colNumber === tbmPracticeWorkerEndCol || colNumber === tbmPracticeEquipmentEndCol
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: colNumber === 4 || colNumber === tbmPracticeTbmEndCol + 1 || colNumber === tbmPracticeWorkerEndCol + 1 || colNumber === tbmPracticeEquipmentEndCol + 1 ? 'medium' : 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: isSectionBorder ? 'medium' : 'thin', color: { argb: 'FF000000' } }
    }
  })

  // 2행 스타일
  tbmPracticeHeaderRow2Cells.eachCell((cell, colNumber) => {
    if ((colNumber >= tbmPracticeTbmStartCol && colNumber <= tbmPracticeTbmEndCol) ||
      (colNumber >= tbmPracticeWorkerStartCol && colNumber <= tbmPracticeWorkerEndCol) ||
      (colNumber >= tbmPracticeEquipmentStartCol && colNumber <= tbmPracticeEquipmentEndCol)) {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' }
      }
      cell.font = {
        color: { argb: 'FFFFFFFF' },
        bold: true
      }
      cell.alignment = {
        horizontal: 'center',
        vertical: 'middle',
        wrapText: true
      }
    }
    const isSectionBorder = colNumber === 4 || colNumber === tbmPracticeTbmEndCol || colNumber === tbmPracticeWorkerEndCol || colNumber === tbmPracticeEquipmentEndCol
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: colNumber === 4 || colNumber === tbmPracticeTbmEndCol + 1 || colNumber === tbmPracticeWorkerEndCol + 1 || colNumber === tbmPracticeEquipmentEndCol + 1 ? 'medium' : 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: isSectionBorder ? 'medium' : 'thin', color: { argb: 'FF000000' } }
    }
  })

  // 3행 스타일
  tbmPracticeHeaderRow3Cells.eachCell((cell, colNumber) => {
    if ((colNumber >= tbmPracticeTbmStartCol && colNumber <= tbmPracticeTbmEndCol) ||
      (colNumber >= tbmPracticeWorkerStartCol && colNumber <= tbmPracticeWorkerEndCol) ||
      (colNumber >= tbmPracticeEquipmentStartCol && colNumber <= tbmPracticeEquipmentEndCol)) {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' }
      }
      cell.font = {
        color: { argb: 'FFFFFFFF' },
        bold: true
      }
    }
    cell.alignment = {
      horizontal: 'center',
      vertical: 'middle',
      wrapText: true
    }
    const isSectionBorder = colNumber === 4 || colNumber === tbmPracticeTbmEndCol || colNumber === tbmPracticeWorkerEndCol || colNumber === tbmPracticeEquipmentEndCol
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: colNumber === 4 || colNumber === tbmPracticeTbmEndCol + 1 || colNumber === tbmPracticeWorkerEndCol + 1 || colNumber === tbmPracticeEquipmentEndCol + 1 ? 'medium' : 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: isSectionBorder ? 'medium' : 'thin', color: { argb: 'FF000000' } }
    }
  })

  // TBM실시 시트 컬럼 너비 설정 (1번 시트와 동일)
  worksheet2.getColumn(1).width = 12 // 본부명
  worksheet2.getColumn(2).width = 15 // 지사명
  worksheet2.getColumn(3).width = 12 // 지구명
  worksheet2.getColumn(4).width = 30 // 작업주소
  worksheet2.getColumn(5).width = 15 // TBM 시간
  let tbmPracticeWidthColIndex = 6
  // TBM입회여부: 작업여부/입회자 (날짜당 2컬럼)
  dateRange.forEach(() => {
    worksheet2.getColumn(tbmPracticeWidthColIndex).width = 10 // 작업여부
    worksheet2.getColumn(tbmPracticeWidthColIndex + 1).width = 15 // 입회자
    tbmPracticeWidthColIndex += 2
  })
  // 신규근로자: 신규인원(명)만 (날짜당 1컬럼)
  dateRange.forEach(() => {
    worksheet2.getColumn(tbmPracticeWidthColIndex).width = 10 // 신규인원
    tbmPracticeWidthColIndex += 1
  })
  // 건설기계: 투입장비 + 대수(대) (날짜당 2컬럼)
  dateRange.forEach(() => {
    worksheet2.getColumn(tbmPracticeWidthColIndex).width = 15 // 투입장비
    worksheet2.getColumn(tbmPracticeWidthColIndex + 1).width = 8 // 대수
    tbmPracticeWidthColIndex += 2
  })
  worksheet2.getColumn(tbmPracticeWidthColIndex).width = 20 // 비고

  // TBM실시 시트 데이터 가져오기 (Supabase에서 조회)
  console.log('🔍 TBM실시 데이터 조회 시작 (Supabase):', { finalStartDate, finalEndDate, selectedHq, selectedBranch })

  try {
    // Supabase에서 TBM 제출 데이터 조회
    let query = supabase
      .from('tbm_submissions')
      .select('*')
      .gte('meeting_date', finalStartDate)
      .lte('meeting_date', finalEndDate)

    if (selectedHq) query = query.eq('headquarters', selectedHq)
    if (selectedBranch) query = query.eq('branch', selectedBranch)

    // 작업없음으로 보고된 TBM은 제외
    query = query.neq('today_work', '작업없음')

    // 프로젝트ID가 없는 건만 TBM실시 시트에 포함
    query = query.is('project_id', null)

    const { data: tbmSubmissions, error: supabaseError } = await query.order('meeting_date', { ascending: true })

    console.log('📥 TBM실시 Supabase 조회 완료:', tbmSubmissions?.length, '건')

    if (supabaseError) {
      console.error('❌ TBM실시 Supabase 조회 실패:', supabaseError)
      throw new Error(`Supabase 조회 실패: ${supabaseError.message}`)
    }

    // Supabase 데이터를 엑셀 형식으로 변환
    const projectDataMap = new Map<string, {
      본부명: string
      지사명: string
      지구명: string
      TBM시간: string
      작업주소: string
      첫보고날짜: string
      날짜별데이터: Record<string, {
        작업여부: string
        입회자: string
        신규인원: string
        신규근로자안전활동: string
        대수: string
        건설기계안전활동: string
        주소: string
      }>
    }>()

      // tbm_submissions 데이터를 프로젝트별로 그룹화
      ; (tbmSubmissions || []).forEach((item: any) => {
        const projectKey = `${item.headquarters}||${item.branch}||${item.project_name}`
        const meetingDate = item.meeting_date

        if (!projectDataMap.has(projectKey)) {
          // 지구명 추출
          const projectName = item.project_name || ''
          const districtMatch = projectName.match(/^(.+?지구)/)
          const district = districtMatch ? districtMatch[1] : (projectName.indexOf(' ') > 0 ? projectName.substring(0, projectName.indexOf(' ')) : projectName)

          projectDataMap.set(projectKey, {
            본부명: item.headquarters || '',
            지사명: item.branch || '',
            지구명: district,
            TBM시간: item.education_start_time ? item.education_start_time.substring(0, 5) : '',
            작업주소: item.address || '',
            첫보고날짜: meetingDate,
            날짜별데이터: {}
          })
        }

        const projectData = projectDataMap.get(projectKey)!

        // TBM 시간 업데이트 (가장 최근 값 사용)
        if (item.education_start_time && !projectData.TBM시간) {
          projectData.TBM시간 = item.education_start_time.substring(0, 5)
        }

        // 날짜별 데이터 설정
        projectData.날짜별데이터[meetingDate] = {
          작업여부: '여', // TBM 제출 = 작업여부 "여"
          입회자: '', // TBM실시 시트에서는 입회자 컬럼 비움
          신규인원: item.new_worker_count != null && item.new_worker_count > 0 ? String(item.new_worker_count) : '',
          신규근로자안전활동: item.new_worker_count > 0 ? '여' : '',
          대수: item.equipment_input || '',
          건설기계안전활동: item.equipment_input ? '여' : '',
          주소: item.address || ''
        }

        // 첫 보고 날짜의 주소를 작업주소로 사용 (날짜 순으로 정렬되어 있으므로 먼저 나온 것이 첫 보고)
        if (!projectData.작업주소 && item.address) {
          projectData.작업주소 = item.address
        }
      })

    // Map을 배열로 변환
    const practiceDataArray = Array.from(projectDataMap.values())

    // 정렬: 본부 → 지사 → 지구명 순
    practiceDataArray.sort((a, b) => {
      const hqOrderA = HEADQUARTERS_OPTIONS.indexOf(a.본부명 as any)
      const hqOrderB = HEADQUARTERS_OPTIONS.indexOf(b.본부명 as any)
      if (hqOrderA !== hqOrderB) {
        if (hqOrderA === -1) return 1
        if (hqOrderB === -1) return -1
        return hqOrderA - hqOrderB
      }
      const branchOptions = BRANCH_OPTIONS[a.본부명] || []
      const branchOrderA = branchOptions.indexOf(a.지사명)
      const branchOrderB = branchOptions.indexOf(b.지사명)
      if (branchOrderA !== branchOrderB) {
        if (branchOrderA === -1 && branchOrderB === -1) return a.지사명.localeCompare(b.지사명, 'ko-KR')
        if (branchOrderA === -1) return 1
        if (branchOrderB === -1) return -1
        return branchOrderA - branchOrderB
      }
      return a.지구명.localeCompare(b.지구명, 'ko-KR')
    })

    const practiceData = {
      success: true,
      data: practiceDataArray
    }

    console.log('📊 TBM실시 데이터 변환 완료:', practiceData.data.length, '개 프로젝트')

    if (practiceData.data && practiceData.data.length > 0) {
      console.log(`✅ TBM실시 데이터 ${practiceData.data.length}개 프로젝트 발견`)

      // TBM실시 시트용 총 컬럼 수 (작업주소 컬럼 추가)
      const totalCols2 = 5 + dateRange.length * 2 + dateRange.length + dateRange.length * 2 + 1

      // 소계 행 추가 (4행) - 데이터 행보다 먼저 추가해야 함
      const tbmPracticeSubtotalRow: (string | number | null)[] = ['소계']
      for (let i = 1; i < totalCols2; i++) {
        tbmPracticeSubtotalRow.push(null)
      }

      const tbmPracticeSubtotalRowData = worksheet2.addRow(tbmPracticeSubtotalRow)

      // 소계 행 스타일 적용 (모든 셀에 명시적으로 적용)
      for (let col = 1; col <= totalCols2; col++) {
        const cell = tbmPracticeSubtotalRowData.getCell(col)

        // 배경색 설정
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFD9E1F2' } // 연한 파란색 배경 (TBM확인 시트와 동일)
        }

        // 폰트 설정
        cell.font = {
          bold: true
        }

        // 정렬 설정 (모두 가운데 정렬)
        cell.alignment = {
          horizontal: 'center',
          vertical: 'middle'
        }

        // 섹션 구분선: 작업주소, TBM입회여부, 신규근로자, 건설기계 사이 (TBM실시 시트는 작업주소 컬럼이 추가됨)
        const isSectionBorder = col === 5 || col === tbmPracticeTbmEndCol || col === tbmPracticeWorkerEndCol || col === tbmPracticeEquipmentEndCol
        const isLeftSectionBorder = col === 5 || col === tbmPracticeTbmEndCol + 1 || col === tbmPracticeWorkerEndCol + 1 || col === tbmPracticeEquipmentEndCol + 1

        // 테두리 설정 (모든 셀에 명시적으로 적용)
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF000000' } },
          left: { style: isLeftSectionBorder ? 'medium' : 'thin', color: { argb: 'FF000000' } },
          bottom: { style: 'thin', color: { argb: 'FF000000' } },
          right: { style: isSectionBorder ? 'medium' : 'thin', color: { argb: 'FF000000' } }
        }
      }

      const tbmPracticeDataStartRow = 5 // 데이터 시작 행 (헤더 3행 + 소계 1행 이후)
      const tbmPracticeDataEndRow = tbmPracticeDataStartRow + practiceData.data.length - 1

      // 소계 행에 SUMPRODUCT 함수 추가 (빈 행 제외)
      const tbmPracticeFirstColLetter = worksheet2.getColumn(1).letter // 본부명 컬럼 (A)

      for (let col = 1; col <= totalCols2; col++) {
        const cell = tbmPracticeSubtotalRowData.getCell(col)
        if (col === 1) {
          // 첫 번째 컬럼은 "소계" 텍스트 유지
          continue
        }
        // ExcelJS에서 수식 설정
        // 본부명 컬럼이 비어있지 않은 행만 카운트하도록 SUMPRODUCT 사용
        const colLetter = worksheet2.getColumn(col).letter
        // 본부명이 비어있지 않고, 해당 컬럼도 비어있지 않은 행만 카운트
        cell.value = { formula: `SUMPRODUCT((${tbmPracticeFirstColLetter}${tbmPracticeDataStartRow}:${tbmPracticeFirstColLetter}${tbmPracticeDataEndRow}<>"")*(${colLetter}${tbmPracticeDataStartRow}:${colLetter}${tbmPracticeDataEndRow}<>""))` }
      }

      // TBM실시 시트 데이터 행 추가 (5행부터)
      practiceData.data.forEach((item: any, index: number) => {
        console.log(`📝 프로젝트 ${index + 1}/${practiceData.data.length}:`, {
          본부명: item.본부명,
          지사명: item.지사명,
          지구명: item.지구명,
          TBM시간: item.TBM시간,
          날짜별데이터개수: Object.keys(item.날짜별데이터 || {}).length
        })

        const dataRow: (string | number | null)[] = [
          item.본부명 || null,
          item.지사명 || null,
          item.지구명 || null,
          item.작업주소 || null, // 작업주소 (첫 보고 날짜의 주소)
          item.TBM시간 || null // TBM 시간
        ]

        // TBM입회여부: 작업여부/입회자 (날짜당 2컬럼)
        dateRange.forEach(date => {
          const dateData = item.날짜별데이터?.[date] || {}
          dataRow.push(dateData.작업여부 || null)
          dataRow.push(dateData.입회자 || null)
        })

        // 신규근로자: 신규인원(명)만 (날짜당 1컬럼)
        dateRange.forEach(date => {
          const dateData = item.날짜별데이터?.[date] || {}
          dataRow.push(dateData.신규인원 || null)
        })

        // 건설기계: 투입장비 + 대수(대) (날짜당 2컬럼)
        dateRange.forEach(date => {
          const dateData = item.날짜별데이터?.[date] || {}
          const equipText = dateData.대수 || ''
          dataRow.push(equipText || null) // 투입장비 텍스트
          dataRow.push(equipText ? extractEquipmentCount(equipText) : null) // 대수 숫자
        })

        dataRow.push(null) // 비고

        const row = worksheet2.addRow(dataRow)
        // 모든 컬럼에 대해 테두리 추가 (빈 셀 포함)
        for (let col = 1; col <= totalCols2; col++) {
          const cell = row.getCell(col)
          // 테두리 추가 - 섹션 구분선은 굵게 (TBM실시 시트는 작업주소 컬럼이 추가됨)
          const isSectionBorder = col === 5 || col === tbmPracticeTbmEndCol || col === tbmPracticeWorkerEndCol || col === tbmPracticeEquipmentEndCol
          cell.border = {
            top: { style: 'thin', color: { argb: 'FF000000' } },
            left: { style: col === 5 || col === tbmPracticeTbmEndCol + 1 || col === tbmPracticeWorkerEndCol + 1 || col === tbmPracticeEquipmentEndCol + 1 ? 'medium' : 'thin', color: { argb: 'FF000000' } },
            bottom: { style: 'thin', color: { argb: 'FF000000' } },
            right: { style: isSectionBorder ? 'medium' : 'thin', color: { argb: 'FF000000' } }
          }

          // 건설기계 컬럼: 투입장비(텍스트, 좌측정렬) + 대수(숫자, 중앙정렬)
          const isEquipmentTextCol = col >= tbmPracticeEquipmentStartCol &&
            col <= tbmPracticeEquipmentEndCol &&
            (col - tbmPracticeEquipmentStartCol) % 2 === 0

          const isEquipmentCountCol = col >= tbmPracticeEquipmentStartCol &&
            col <= tbmPracticeEquipmentEndCol &&
            (col - tbmPracticeEquipmentStartCol) % 2 === 1

          // 신규인원 컬럼: tbmPracticeWorkerStartCol ~ tbmPracticeWorkerEndCol (날짜당 1컬럼)
          const isWorkerCountCol = col >= tbmPracticeWorkerStartCol &&
            col <= tbmPracticeWorkerEndCol

          // 신규인원 컬럼에 숫자 서식 적용
          if (isWorkerCountCol && cell.value !== null && cell.value !== '') {
            const numValue = Number(cell.value)
            if (!isNaN(numValue)) {
              cell.value = numValue
              cell.numFmt = '0'
            }
          }

          // 대수(대) 컬럼에 숫자 서식 적용
          if (isEquipmentCountCol && cell.value !== null && cell.value !== '') {
            const numValue = Number(cell.value)
            if (!isNaN(numValue)) {
              cell.value = numValue
              cell.numFmt = '0'
            }
          }

          cell.alignment = {
            horizontal: isEquipmentTextCol ? 'left' : 'center',
            vertical: 'middle',
            wrapText: isEquipmentTextCol ? true : undefined
          }
        }
      })

      console.log('✅ TBM실시 시트 데이터 추가 완료')
    } else {
      console.warn('⚠️ TBM실시 데이터가 없습니다. (빈 배열)')
    }
  } catch (error) {
    console.error('❌ TBM실시 데이터 가져오기 오류:', error)
    // 오류가 발생해도 엑셀 파일은 생성됨 (데이터만 비어있음)
    // 사용자에게 알림은 하지 않음 (헤더는 이미 생성됨)
  }

  // 파일명 생성
  const startDateStr = finalStartDate.replace(/-/g, '')
  const endDateStr = finalEndDate.replace(/-/g, '')
  const finalFilename = filename || `TBM안전활동점검_${startDateStr}_${endDateStr}.xlsx`

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
