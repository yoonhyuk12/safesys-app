import { supabase } from './supabase'
import type { UserProfile } from './supabase'
import { BRANCH_OPTIONS, DEBUG_LOGS } from './constants'

export interface Project {
  id: string
  project_name: string
  managing_hq: string
  managing_branch: string
  site_address: string
  site_address_detail: string
  latitude?: number
  longitude?: number
  // is_active: JSONB 구조({ q1,q2,q3,q4,completed }) 또는 과거 boolean 값(이전 호환)
  is_active?: boolean | {
    q1: boolean
    q2: boolean
    q3: boolean
    q4: boolean
    completed: boolean
  }
  created_by: string
  created_at: string
  updated_at: string
  user_profiles?: {
    role?: '발주청' | '감리단' | '시공사'
    company_name?: string
  }
}

export interface CreateProjectData {
  project_name: string
  managing_hq: string
  managing_branch: string
  site_address: string
  site_address_detail: string
  latitude?: number
  longitude?: number
}

export interface ProjectWithCoords extends Project {
  coords?: {
    lat: number
    lng: number
  }
}

export interface HeatWaveCheck {
  id: string
  project_id: string
  project_name?: string
  managing_hq?: string
  managing_branch?: string
  check_time: string
  feels_like_temp: number
  water_supply: boolean
  ventilation: boolean
  rest_time: boolean
  cooling_equipment: boolean
  emergency_care: boolean
  work_time_adjustment: boolean
  created_at: string
  created_by: string
}

export async function createProject(data: CreateProjectData): Promise<{ success: boolean; error?: string; project?: Project }> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { success: false, error: '로그인이 필요합니다.' }
    }

    const { data: project, error } = await supabase
      .from('projects')
      .insert({
        ...data,
        created_by: user.id
      })
      .select('*')
      .single()

    if (error) {
      console.error('Project creation error:', error)
      return { success: false, error: '프로젝트 생성에 실패했습니다.' }
    }

    return { success: true, project }
  } catch (error) {
    console.error('Create project error:', error)
    return { success: false, error: '프로젝트 생성 중 오류가 발생했습니다.' }
  }
}

export async function getUserProjects(): Promise<{ success: boolean; projects?: Project[]; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { success: false, error: '로그인이 필요합니다.' }
    }

    const { data: projects, error } = await supabase
      .from('projects')
      .select('*')
      .eq('created_by', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Get user projects error:', error)
      return { success: false, error: '프로젝트 조회에 실패했습니다.' }
    }

    return { success: true, projects: projects || [] }
  } catch (error) {
    console.error('Get user projects error:', error)
    return { success: false, error: '프로젝트 조회 중 오류가 발생했습니다.' }
  }
}

export async function getProjectById(id: string): Promise<{ success: boolean; project?: Project; error?: string }> {
  try {
    const { data: project, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      console.error('Get project by ID error:', error)
      return { success: false, error: '프로젝트를 찾을 수 없습니다.' }
    }

    return { success: true, project }
  } catch (error) {
    console.error('Get project by ID error:', error)
    return { success: false, error: '프로젝트 조회 중 오류가 발생했습니다.' }
  }
}

// 발주청 사용자의 관할 지사에 해당하는 프로젝트 조회
export async function getProjectsByUserBranch(userProfile: UserProfile): Promise<{ success: boolean; projects?: ProjectWithCoords[]; error?: string }> {
  try {
    if (DEBUG_LOGS) console.log('=== 프로젝트 권한 조회 시작 ===')
    if (DEBUG_LOGS) console.log('사용자 프로필:', {
      role: userProfile.role,
      hq_division: userProfile.hq_division,
      branch_division: userProfile.branch_division
    })

    let query = supabase
      .from('projects')
      .select(`*, user_profiles ( company_name, role )`)

    // 발주청 사용자의 관할 범위에 따른 필터링
    if (userProfile.role === '발주청') {
      if (userProfile.hq_division) {
        // 본부가 지정된 경우
        if (DEBUG_LOGS) console.log('본부가 지정됨:', userProfile.hq_division)
        
        if (userProfile.branch_division) {
          // 지사도 지정된 경우
          const hqBranches = BRANCH_OPTIONS[userProfile.hq_division] || []
          if (DEBUG_LOGS) console.log('해당 본부의 지사 목록:', hqBranches)
          
          // 사용자의 지사가 해당 본부의 첫 번째 지사(본부 대표 지사)인지 확인
          // 예: '경기본부', '충남본부', '강원본부' 등은 각 본부의 대표 지사
          const isHeadquarterBranch = hqBranches.length > 0 && hqBranches[0] === userProfile.branch_division
          if (DEBUG_LOGS) console.log('본부 대표 지사 여부:', isHeadquarterBranch)
          if (DEBUG_LOGS) console.log('첫 번째 지사:', hqBranches[0])
          if (DEBUG_LOGS) console.log('사용자 지사:', userProfile.branch_division)
          
          if (isHeadquarterBranch) {
            // 본부 대표 지사인 경우: 해당 본부의 모든 지사 프로젝트 조회
            if (DEBUG_LOGS) console.log(`✅ 본부 대표 지사 사용자 권한: ${userProfile.hq_division} 산하 모든 지사 프로젝트 조회`)
            query = query.eq('managing_hq', userProfile.hq_division)
          } else {
            // 일반 지사인 경우: 해당 지사 프로젝트만 조회
            if (DEBUG_LOGS) console.log(`⚠️  일반 지사 사용자 권한: ${userProfile.branch_division} 지사만 조회`)
            query = query.eq('managing_branch', userProfile.branch_division)
          }
        } else {
          // 본부만 지정되고 지사가 지정되지 않은 경우: 해당 본부의 모든 지사 프로젝트
          if (DEBUG_LOGS) console.log(`✅ 본부만 지정된 사용자 권한: ${userProfile.hq_division} 산하 모든 지사 프로젝트 조회`)
          query = query.eq('managing_hq', userProfile.hq_division)
        }
      } else {
        // 본부도 지정되지 않은 경우: 모든 프로젝트 조회 (관리자급)
        if (DEBUG_LOGS) console.log('✅ 본부 미지정 발주청 사용자: 모든 프로젝트 조회')
        // query에 추가 필터링 없음 (모든 프로젝트 조회)
      }
    } else {
      // 발주청이 아닌 경우 빈 배열 반환
      if (DEBUG_LOGS) console.log('❌ 발주청이 아닌 사용자: 프로젝트 조회 불가')
      return { success: true, projects: [] }
    }

    if (DEBUG_LOGS) console.log('=== 데이터베이스 쿼리 실행 ===')
    const { data: projects, error } = await query.order('created_at', { ascending: false })

    if (error) {
      console.error('Get projects by user branch error:', error)
      return { success: false, error: '프로젝트 조회에 실패했습니다.' }
    }

    if (DEBUG_LOGS) {
      console.log(`📊 조회된 프로젝트 수: ${projects?.length || 0}`)
      if (projects && projects.length > 0) {
        console.log('조회된 프로젝트 목록:')
        projects.forEach((project, index) => {
          console.log(`  ${index + 1}. ${project.project_name} (${project.managing_hq} - ${project.managing_branch})`)
        })
      }
      console.log('=== 프로젝트 권한 조회 완료 ===')
    }

    return { success: true, projects: projects || [] }
  } catch (error) {
    console.error('Get projects by user branch error:', error)
    return { success: false, error: '프로젝트 조회 중 오류가 발생했습니다.' }
  }
}

// 발주청 관할 프로젝트들의 폭염점검 결과 조회
export async function getHeatWaveChecksByUserBranch(
  userProfile: UserProfile,
  selectedDate?: string,
  selectedHq?: string,
  selectedBranch?: string
): Promise<{ success: boolean; checks?: HeatWaveCheck[]; error?: string }> {
  try {
    if (userProfile.role !== '발주청') {
      return { success: false, error: '발주청만 접근 가능합니다.' }
    }

    // 먼저 관할 프로젝트 목록을 가져옴
    if (DEBUG_LOGS) console.log('=== 폭염점검용 프로젝트 조회 시작 ===')
    const projectsResult = await getProjectsByUserBranch(userProfile)
    if (!projectsResult.success || !projectsResult.projects) {
      return { success: false, error: '관할 프로젝트를 조회할 수 없습니다.' }
    }

    if (DEBUG_LOGS) console.log('폭염점검용 조회된 프로젝트:', projectsResult.projects.map(p => `${p.project_name} (${p.managing_branch})`))

    // 선택된 본부/지사에 따라 프로젝트 필터링
    let filteredProjects = projectsResult.projects
    
    if (selectedHq) {
      filteredProjects = filteredProjects.filter(project => project.managing_hq === selectedHq)
    }
    
    if (selectedBranch !== undefined) {
      if (selectedBranch === '') {
        // "전체 지사" 선택: 특정 본부가 선택된 경우에만 해당 본부 산하 지사로 제한
        if (selectedHq) {
          const { BRANCH_OPTIONS } = await import('./constants')
          const branchOptions = BRANCH_OPTIONS[selectedHq] || []
          filteredProjects = filteredProjects.filter(project => 
            project.managing_branch && branchOptions.includes(project.managing_branch)
          )
        }
        // selectedHq가 비어있으면 전사(관할 전체) 유지
      } else {
        // 특정 지사인 경우: 정확히 일치하는 지사만
        filteredProjects = filteredProjects.filter(project => project.managing_branch === selectedBranch)
      }
    }

    if (DEBUG_LOGS) console.log('필터링된 프로젝트:', filteredProjects.map(p => `${p.project_name} (${p.managing_branch})`))

    const projectIds = filteredProjects.map(p => p.id)
    if (projectIds.length === 0) {
      return { success: true, checks: [] }
    }

    // 폭염점검 데이터 조회
    let query = supabase
      .from('heat_wave_checks')
      .select(`
        id,
        project_id,
        check_time,
        feels_like_temp,
        water_supply,
        ventilation,
        rest_time,
        cooling_equipment,
        emergency_care,
        work_time_adjustment,
        created_at,
        created_by
      `)
      .in('project_id', projectIds)

    // 날짜 필터링 (선택사항) - check_time 기준으로 필터링
    if (selectedDate) {
      // 해당 날짜의 시작과 끝 시간 설정
      const startDateTime = `${selectedDate}T00:00:00`
      const endDateTime = `${selectedDate}T23:59:59`
      
      if (DEBUG_LOGS) console.log(`날짜 필터링 (check_time 기준): ${selectedDate} -> ${startDateTime} ~ ${endDateTime}`)
      query = query.gte('check_time', startDateTime).lte('check_time', endDateTime)
    }

    const { data: checks, error } = await query.order('created_at', { ascending: false })

    if (error) {
      console.error('Get heat wave checks error:', error)
      return { success: false, error: '폭염점검 데이터 조회에 실패했습니다.' }
    }

    // 프로젝트별로 가장 최신 측정 시간 데이터만 필터링
    const latestChecksByProject = new Map<string, any>()
    
    checks?.forEach(check => {
      const existingCheck = latestChecksByProject.get(check.project_id)
      if (!existingCheck || new Date(check.check_time) > new Date(existingCheck.check_time)) {
        latestChecksByProject.set(check.project_id, check)
      }
    })

    // 프로젝트 이름 및 본부/지사 정보 추가
    const checksWithProjectInfo = Array.from(latestChecksByProject.values()).map(check => {
      const project = filteredProjects.find(p => p.id === check.project_id)
      return {
        ...check,
        project_name: project?.project_name || '알 수 없는 프로젝트',
        managing_hq: project?.managing_hq || '',
        managing_branch: project?.managing_branch || ''
      }
    }).sort((a, b) => new Date(b.check_time).getTime() - new Date(a.check_time).getTime()) // 최신 측정 시간순 정렬

    if (DEBUG_LOGS) {
      console.log('=== 폭염점검 최종 결과 ===')
      console.log('반환될 점검 데이터:', checksWithProjectInfo.map(c => `${c.project_name} (${new Date(c.check_time).toLocaleTimeString()}) - ${c.managing_hq} ${c.managing_branch}`))
    }

    return { success: true, checks: checksWithProjectInfo }
  } catch (error) {
    console.error('Get heat wave checks by user branch error:', error)
    return { success: false, error: '폭염점검 데이터 조회 중 오류가 발생했습니다.' }
  }
}

// 프로젝트 삭제 (관련 점검 데이터도 함께 삭제)
export async function deleteProject(projectId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { success: false, error: '로그인이 필요합니다.' }
    }

    // 트랜잭션으로 관련 데이터 순서대로 삭제
    // 1. 먼저 heat_wave_checks 삭제
    const { error: heatWaveError } = await supabase
      .from('heat_wave_checks')
      .delete()
      .eq('project_id', projectId)

    if (heatWaveError) {
      console.error('Heat wave checks deletion error:', heatWaveError)
      return { success: false, error: '점검 데이터 삭제에 실패했습니다.' }
    }

    // 2. 프로젝트 삭제
    const { error: projectError } = await supabase
      .from('projects')
      .delete()
      .eq('id', projectId)

    if (projectError) {
      console.error('Project deletion error:', projectError)
      return { success: false, error: '프로젝트 삭제에 실패했습니다.' }
    }

    return { success: true }
  } catch (error) {
    console.error('Delete project error:', error)
    return { success: false, error: '프로젝트 삭제 중 오류가 발생했습니다.' }
  }
}

// 프로젝트 수정
export async function updateProject(projectId: string, data: CreateProjectData): Promise<{ success: boolean; error?: string; project?: Project }> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { success: false, error: '로그인이 필요합니다.' }
    }

    // 프로젝트가 존재하는지 확인
    const { data: existingProject, error: checkError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single()

    if (checkError || !existingProject) {
      return { success: false, error: '프로젝트를 찾을 수 없습니다.' }
    }

    // 프로젝트 수정
    const { data: project, error } = await supabase
      .from('projects')
      .update({
        ...data,
        updated_at: new Date().toISOString()
      })
      .eq('id', projectId)
      .select('*')
      .single()

    if (error) {
      console.error('Project update error:', error)
      return { success: false, error: '프로젝트 수정에 실패했습니다.' }
    }

    return { success: true, project }
  } catch (error) {
    console.error('Update project error:', error)
    return { success: false, error: '프로젝트 수정 중 오류가 발생했습니다.' }
  }
}

// 프로젝트 인계: 현재 소유자에서 다른 사용자(이메일)로 소유권 이전
export async function transferProjectOwnership(projectId: string, recipientEmail: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, error: '로그인이 필요합니다.' }
    }

    const email = recipientEmail.trim().toLowerCase()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { success: false, error: '유효한 이메일을 입력해주세요.' }
    }

    // 수신자 프로필 조회
    const { data: recipient, error: profileError } = await supabase
      .from('user_profiles')
      .select('id, email')
      .eq('email', email)
      .single()

    if (profileError || !recipient) {
      return { success: false, error: '해당 이메일의 사용자를 찾을 수 없습니다.' }
    }

    if (recipient.id === user.id) {
      return { success: false, error: '본인에게 인계할 수 없습니다.' }
    }

    // RPC 호출로 소유권 인계 수행 (SECURITY DEFINER 함수 사용)
    const { error: rpcError } = await supabase.rpc('transfer_project_ownership', {
      p_project_id: projectId,
      p_recipient_email: email
    })

    if (rpcError) {
      console.error('Transfer ownership error:', rpcError)
      return { success: false, error: '인계에 실패했습니다. 권한을 확인해주세요.' }
    }

    return { success: true }
  } catch (error) {
    console.error('Transfer ownership exception:', error)
    return { success: false, error: '인계 처리 중 오류가 발생했습니다.' }
  }
}

// 프로젝트에 좌표 정보 추가
export async function addCoordsToProjects(projects: Project[]): Promise<ProjectWithCoords[]> {
  const projectsWithCoords: ProjectWithCoords[] = []

  for (const project of projects) {
    try {
      console.log(`좌표 변환 시도: ${project.project_name} - ${project.site_address}`)
      
      // 주소에서 괄호 부분 제거 (예: "인천광역시 부평구 무네미로 478 (구산동)" -> "인천광역시 부평구 무네미로 478")
      const cleanAddress = project.site_address.replace(/\s*\([^)]*\)\s*/g, '').trim()
      console.log(`정리된 주소: ${cleanAddress}`)
      
      // V-world API를 통해 주소를 좌표로 변환
      const response = await fetch(`/api/geocoding?address=${encodeURIComponent(cleanAddress)}`)
      
      console.log(`API 응답 상태: ${response.status}`)
      
      if (response.ok) {
        const data = await response.json()
        console.log(`API 응답 데이터:`, data)
        
        if (data.success && data.coords) {
          projectsWithCoords.push({
            ...project,
            coords: data.coords
          })
          console.log(`좌표 추가 완료: ${project.project_name} - ${data.coords.lat}, ${data.coords.lng}`)
        } else {
          // 좌표 변환 실패 시에도 프로젝트는 포함 (좌표 없이)
          projectsWithCoords.push(project)
          console.log(`좌표 변환 실패: ${project.project_name} - ${data.error || 'Unknown error'}`)
        }
      } else {
        projectsWithCoords.push(project)
        console.log(`API 호출 실패: ${project.project_name} - ${response.status} ${response.statusText}`)
      }
    } catch (error) {
      console.error(`좌표 변환 오류 - ${project.project_name}:`, error)
      projectsWithCoords.push(project)
    }
  }

  return projectsWithCoords
}

// 디버깅용: 모든 프로젝트의 본부/지사 정보 조회
export async function getAllProjectsDebug(): Promise<{ success: boolean; projects?: any[]; error?: string }> {
  try {
    const { data: projects, error } = await supabase
      .from('projects')
      .select('id, project_name, managing_hq, managing_branch, created_at')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Debug query error:', error)
      return { success: false, error: '디버그 쿼리 실패' }
    }

    console.log('=== 전체 프로젝트 데이터 (디버깅용) ===')
    projects?.forEach((project, index) => {
      console.log(`${index + 1}. "${project.project_name}"`)
      console.log(`   본부: "${project.managing_hq}"`)
      console.log(`   지사: "${project.managing_branch}"`)
      console.log(`   ID: ${project.id}`)
      console.log('---')
    })
    console.log('=== 디버깅 데이터 끝 ===')

    return { success: true, projects: projects || [] }
  } catch (error) {
    console.error('Debug query error:', error)
    return { success: false, error: '디버그 쿼리 중 오류 발생' }
  }
}

// 관리자 점검 데이터 인터페이스
export interface ManagerInspection {
  id: string
  project_id: string
  project_name?: string
  managing_hq?: string
  managing_branch?: string
  inspection_date: string
  inspector_name: string
  remarks?: string
  created_at: string
  user_profiles?: {
    full_name: string
  }
  // 원본 입력 양식 데이터 (사진/위험성평가 항목 포함)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form_data?: any
  // 개별 입력 스키마 호환을 위한 상위 필드들(과거 레코드 호환)
  construction_supervisor?: string
  inspection_photo?: string
  risk_assessment_photo?: string
  signature?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  risk_factors_json?: any[]
}

// 본부 불시점검 데이터 인터페이스
export interface HeadquartersInspection {
  id: string
  project_id: string
  project_name?: string
  managing_hq?: string
  managing_branch?: string
  inspection_date: string
  inspector_name: string
  issue_content1: string
  issue_content2?: string
  issue1_status: 'pending' | 'in_progress' | 'completed'
  issue2_status?: 'pending' | 'in_progress' | 'completed'
  action_date?: string
  action_by?: string
  created_at: string
  site_photo_overview?: string
  site_photo_issue1?: string
  site_photo_issue2?: string
  action_photo_issue1?: string
  action_photo_issue2?: string
}

// 발주청 사용자가 볼 수 있는 관리자 점검 현황 조회
export async function getManagerInspectionsByUserBranch(
  userProfile: UserProfile,
  quarterYear?: string, // 2025Q1 형식
  selectedHq?: string,
  selectedBranch?: string
): Promise<{ success: boolean; inspections?: ManagerInspection[]; error?: string }> {
  try {
    if (DEBUG_LOGS) console.log('관리자 점검 데이터 조회 시작:', { quarterYear, selectedHq, selectedBranch })

    // 분기별 날짜 범위 계산
    let startDate: string | null = null
    let endDate: string | null = null
    
    if (quarterYear) {
      const [year, quarter] = quarterYear.split('Q')
      const yearNum = parseInt(year)
      const quarterNum = parseInt(quarter)
      
      switch (quarterNum) {
        case 1:
          startDate = `${yearNum}-01-01`
          endDate = `${yearNum}-03-31`
          break
        case 2:
          startDate = `${yearNum}-04-01`
          endDate = `${yearNum}-06-30`
          break
        case 3:
          startDate = `${yearNum}-07-01`
          endDate = `${yearNum}-09-30`
          break
        case 4:
          startDate = `${yearNum}-10-01`
          endDate = `${yearNum}-12-31`
          break
      }
    }

    let query = supabase
      .from('manager_inspections')
      .select(`
        *,
        projects!inner (
          project_name,
          managing_hq,
          managing_branch,
          is_active
        ),
        user_profiles (
          full_name
        )
      `)

    // 날짜 범위 필터링
    if (startDate && endDate) {
      query = query
        .gte('inspection_date', startDate)
        .lte('inspection_date', endDate)
    }

    // 발주청 사용자의 권한에 따른 필터링
    if (userProfile.role === '발주청') {
      // 본부 단위 권한이 있는 경우
      if (userProfile.hq_division && !userProfile.branch_division?.endsWith('본부')) {
        query = query.eq('projects.managing_hq', userProfile.hq_division)
      }
      
      // 지사 단위 권한이 있는 경우
      if (userProfile.branch_division && !userProfile.branch_division?.endsWith('본부')) {
        query = query.eq('projects.managing_branch', userProfile.branch_division)
      }
    }

    // 선택된 본부/지사 필터링
    if (selectedHq) {
      query = query.eq('projects.managing_hq', selectedHq)
    }
    if (selectedBranch) {
      query = query.eq('projects.managing_branch', selectedBranch)
    }

    query = query.order('inspection_date', { ascending: false })

    const { data: inspections, error } = await query

    if (error) {
      console.error('관리자 점검 조회 오류:', error)
      return { success: false, error: error.message }
    }

    // 데이터 변환
    const transformedInspections: ManagerInspection[] = (inspections || []).map((item: any) => ({
      id: item.id,
      project_id: item.project_id,
      project_name: item.projects?.project_name,
      managing_hq: item.projects?.managing_hq,
      managing_branch: item.projects?.managing_branch,
      inspection_date: item.inspection_date,
      inspector_name: item.inspector_name,
      remarks: item.remarks,
      created_at: item.created_at,
      user_profiles: item.user_profiles,
      form_data: item.form_data,
      construction_supervisor: item.construction_supervisor,
      inspection_photo: item.inspection_photo,
      risk_assessment_photo: item.risk_assessment_photo,
      signature: item.signature,
      risk_factors_json: item.risk_factors_json
    }))

    if (DEBUG_LOGS) console.log(`조회된 관리자 점검 수: ${transformedInspections.length}`)
    return { success: true, inspections: transformedInspections }

  } catch (error: any) {
    console.error('관리자 점검 조회 실패:', error)
    return { success: false, error: error.message || '관리자 점검 데이터를 불러오는데 실패했습니다.' }
  }
}

// 발주청 사용자가 볼 수 있는 본부 불시점검 현황 조회  
export async function getHeadquartersInspectionsByUserBranch(
  userProfile: UserProfile,
  quarterYear?: string, // 2025Q1 형식
  selectedHq?: string,
  selectedBranch?: string
): Promise<{ success: boolean; inspections?: HeadquartersInspection[]; error?: string }> {
  try {
    if (DEBUG_LOGS) console.log('본부 불시점검 데이터 조회 시작:', { quarterYear, selectedHq, selectedBranch })

    // 분기별 날짜 범위 계산
    let startDate: string | null = null
    let endDate: string | null = null
    
    if (quarterYear) {
      const [year, quarter] = quarterYear.split('Q')
      const yearNum = parseInt(year)
      const quarterNum = parseInt(quarter)
      
      switch (quarterNum) {
        case 1:
          startDate = `${yearNum}-01-01`
          endDate = `${yearNum}-03-31`
          break
        case 2:
          startDate = `${yearNum}-04-01`
          endDate = `${yearNum}-06-30`
          break
        case 3:
          startDate = `${yearNum}-07-01`
          endDate = `${yearNum}-09-30`
          break
        case 4:
          startDate = `${yearNum}-10-01`
          endDate = `${yearNum}-12-31`
          break
      }
    }

    // headquarters_inspections 테이블이 있다고 가정하고 쿼리 작성
    let query = supabase
      .from('headquarters_inspections')
      .select(`
        *,
        projects!inner (
          project_name,
          managing_hq,
          managing_branch,
          is_active
        )
      `)

    // 날짜 범위 필터링
    if (startDate && endDate) {
      query = query
        .gte('inspection_date', startDate)
        .lte('inspection_date', endDate)
    }

    // 발주청 사용자의 권한에 따른 필터링
    if (userProfile.role === '발주청') {
      // 본부 단위 권한이 있는 경우
      if (userProfile.hq_division && !userProfile.branch_division?.endsWith('본부')) {
        query = query.eq('projects.managing_hq', userProfile.hq_division)
      }
      
      // 지사 단위 권한이 있는 경우
      if (userProfile.branch_division && !userProfile.branch_division?.endsWith('본부')) {
        query = query.eq('projects.managing_branch', userProfile.branch_division)
      }
    }

    // 선택된 본부/지사 필터링
    if (selectedHq) {
      query = query.eq('projects.managing_hq', selectedHq)
    }
    if (selectedBranch) {
      query = query.eq('projects.managing_branch', selectedBranch)
    }

    query = query.order('inspection_date', { ascending: false })

    const { data: inspections, error } = await query

    if (error) {
      console.error('본부 불시점검 조회 오류:', error)
      return { success: false, error: error.message }
    }

    // 데이터 변환
    const transformedInspections: HeadquartersInspection[] = (inspections || []).map((item: any) => ({
      id: item.id,
      project_id: item.project_id,
      project_name: item.projects?.project_name,
      managing_hq: item.projects?.managing_hq,
      managing_branch: item.projects?.managing_branch,
      inspection_date: item.inspection_date,
      inspector_name: item.inspector_name,
      issue_content1: item.issue_content1,
      issue_content2: item.issue_content2,
      issue1_status: item.issue1_status || 'pending',
      issue2_status: item.issue2_status,
      action_date: item.action_date,
      action_by: item.action_by,
      created_at: item.created_at,
      site_photo_overview: item.site_photo_overview,
      site_photo_issue1: item.site_photo_issue1,
      site_photo_issue2: item.site_photo_issue2,
      action_photo_issue1: item.action_photo_issue1,
      action_photo_issue2: item.action_photo_issue2,
      // 보고서(점검표) 생성을 위해 필요한 항목 배열 포함
      critical_items: item.critical_items || [],
      caution_items: item.caution_items || [],
      other_items: item.other_items || []
    }))

    if (DEBUG_LOGS) console.log(`조회된 본부 불시점검 수: ${transformedInspections.length}`)
    return { success: true, inspections: transformedInspections }

  } catch (error: any) {
    console.error('본부 불시점검 조회 실패:', error)
    return { success: false, error: error.message || '본부 불시점검 데이터를 불러오는데 실패했습니다.' }
  }
}

 