import { supabase } from './supabase'
import type { UserProfile } from './supabase'
import { BRANCH_OPTIONS, DEBUG_LOGS } from './constants'
import { PERMIT_TYPE_CONFIGS, type PermitType } from './ptw/permit-types'

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
  // 선택사항
  project_category?: string
  total_budget?: string
  current_year_budget?: string
  supervisor_position?: string
  supervisor_name?: string
  supervisor_phone?: string
  actual_work_address?: string
  construction_law_safety_plan?: boolean
  industrial_law_safety_ledger?: boolean
  disaster_prevention_target?: boolean
  cctv_rtsp_url?: string
  business_card_pdf_url?: string  // 사업카드(PDF) 링크
  // 텔레그램/앱 알림 수신 대상
  client_telegram_id?: string | null
  contractor_telegram_id?: string | null
  client_app_code?: string | null  // 발주청 알림앱 개인코드 (복수: 쉼표 구분)
  contractor_app_code?: string | null  // 시공사 알림앱 개인코드 (복수: 쉼표 구분)
  display_order?: number  // 지사별 순서 번호
  // 공사기간 (작업일보 공정률 계산: 착공일 0% → 준공일 100%)
  construction_start_date?: string | null
  construction_end_date?: string | null
  // 시공 예정공정표 (공종/공사금액/旬별 일정). 공정률 곡선의 단일 출처. 타입은 WorkSchedule.
  construction_schedule?: import('@/lib/work-schedule/work-schedule-types').WorkSchedule | null
  // 개인정보 관리책임자
  privacy_manager_name?: string
  privacy_manager_position?: string
  privacy_manager_email?: string
  privacy_manager_phone?: string
  // 나라장터 계약 연계 (조달청 계약정보서비스)
  g2b_cntrct_no?: string | null
  g2b_ntce_no?: string | null
  g2b_corp_nm?: string | null
  g2b_tot_amt?: number | null
  g2b_thtm_amt?: number | null
  // 계약현황에서 지정한 대표계약 1건 (project_contracts.id)
  representative_contract_id?: string | null
  user_profiles?: {
    role?: '발주청' | '감리단' | '시공사'
    company_name?: string
    full_name?: string
    phone_number?: string
  }
}

export type ProjectRelatedCounts = {
  total: number
  safety: number
  workers: number
  work: number
  business: number
}

export interface CreateProjectData {
  project_name: string
  managing_hq: string
  managing_branch: string
  site_address: string
  site_address_detail: string
  latitude?: number
  longitude?: number
  // 선택사항
  project_category?: string
  total_budget?: string
  current_year_budget?: string
  supervisor_position?: string
  supervisor_name?: string
  supervisor_phone?: string
  actual_work_address?: string
  construction_law_safety_plan?: boolean
  industrial_law_safety_ledger?: boolean
  disaster_prevention_target?: boolean
  cctv_rtsp_url?: string
  business_card_pdf_url?: string  // 사업카드(PDF) 링크
  client_telegram_id?: string | null
  contractor_telegram_id?: string | null
  client_app_code?: string | null  // 발주청 알림앱 개인코드 (복수: 쉼표 구분)
  contractor_app_code?: string | null  // 시공사 알림앱 개인코드 (복수: 쉼표 구분)
  // 공사기간 (작업일보 공정률 계산용)
  construction_start_date?: string | null
  construction_end_date?: string | null
  // 개인정보 관리책임자
  privacy_manager_name?: string
  privacy_manager_position?: string
  privacy_manager_email?: string
  privacy_manager_phone?: string
  // 나라장터 계약 연계 (조달청 계약정보서비스)
  g2b_cntrct_no?: string | null
  g2b_ntce_no?: string | null
  g2b_corp_nm?: string | null
  g2b_tot_amt?: number | null
  g2b_thtm_amt?: number | null
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
        is_active: { q1: false, q2: false, q3: false, q4: false, completed: false },
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
      .select(`*, user_profiles ( company_name, role, full_name, phone_number )`)

    // 발주청 사용자의 관할 범위에 따른 필터링
    if (userProfile.role === '발주청') {
      // 본사 조직은 전사 데이터 조회 가능
      if (userProfile.hq_division === '본사' && userProfile.branch_division === '본사') {
        if (DEBUG_LOGS) console.log('✅ 본사 조직 사용자: 전사 프로젝트 조회')
        // query에 추가 필터링 없음 (모든 프로젝트 조회)
      } else if (userProfile.hq_division) {
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
    const { data: projects, error } = await query.order('project_name', { ascending: true })

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

// 폭염점검 건수만 조회 (카드 표시용 경량 쿼리)
export async function getHeatWaveCheckCountByUserBranch(
  userProfile: UserProfile,
  selectedDate?: string,
  selectedHq?: string,
  selectedBranch?: string
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    if (userProfile.role !== '발주청') {
      return { success: false, count: 0, error: '발주청만 접근 가능합니다.' }
    }

    const projectsResult = await getProjectsByUserBranch(userProfile)
    if (!projectsResult.success || !projectsResult.projects) {
      return { success: false, count: 0, error: '관할 프로젝트를 조회할 수 없습니다.' }
    }

    let filteredProjects = projectsResult.projects

    if (selectedHq) {
      filteredProjects = filteredProjects.filter(project => project.managing_hq === selectedHq)
    }

    if (selectedBranch !== undefined) {
      if (selectedBranch === '') {
        if (selectedHq) {
          const { BRANCH_OPTIONS } = await import('./constants')
          const branchOptions = BRANCH_OPTIONS[selectedHq] || []
          filteredProjects = filteredProjects.filter(project =>
            project.managing_branch && branchOptions.includes(project.managing_branch)
          )
        }
      } else {
        filteredProjects = filteredProjects.filter(project => project.managing_branch === selectedBranch)
      }
    }

    const projectIds = filteredProjects.map(p => p.id)
    if (projectIds.length === 0) {
      return { success: true, count: 0 }
    }

    // project_id만 조회하여 dedup 카운트 (프로젝트별 최신 1건)
    let query = supabase
      .from('heat_wave_checks')
      .select('project_id')
      .in('project_id', projectIds)

    if (selectedDate) {
      const startDateTime = `${selectedDate}T00:00:00`
      const endDateTime = `${selectedDate}T23:59:59`
      query = query.gte('check_time', startDateTime).lte('check_time', endDateTime)
    }

    const { data: checks, error } = await query

    if (error) {
      return { success: false, count: 0, error: '폭염점검 건수 조회에 실패했습니다.' }
    }

    // 프로젝트별 최신 1건만 카운트 (unique project_id 수)
    const uniqueProjects = new Set(checks?.map(c => c.project_id))
    return { success: true, count: uniqueProjects.size }
  } catch (error) {
    console.error('Get heat wave check count error:', error)
    return { success: false, count: 0, error: '폭염점검 건수 조회 중 오류가 발생했습니다.' }
  }
}

// 프로젝트 삭제 (관련 점검 데이터는 CASCADE, Storage 사진은 서버 라우트에서 함께 정리)
export async function deleteProject(projectId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      return { success: false, error: '로그인이 필요합니다.' }
    }

    // Storage 파일 삭제는 service-role 권한이 필요하므로 서버 라우트에 위임
    const response = await fetch(`/api/projects/${projectId}/delete`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    const result = await response.json()

    if (!response.ok || !result.success) {
      return { success: false, error: result.error || '프로젝트 삭제에 실패했습니다.' }
    }

    return { success: true }
  } catch (error) {
    console.error('Delete project error:', error)
    return { success: false, error: '프로젝트 삭제 중 오류가 발생했습니다.' }
  }
}

// 프로젝트 삭제 전 사용자 입력 연관 데이터 건수 조회
export async function getProjectRelatedCounts(projectId: string): Promise<{
  success: boolean
  counts?: ProjectRelatedCounts
  error?: string
}> {
  try {
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      return { success: false, error: '로그인이 필요합니다.' }
    }

    const response = await fetch(`/api/projects/${projectId}/related-counts`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: 'no-store',
    })
    const result = await response.json()

    if (!response.ok || !result.success) {
      return { success: false, error: result.error || '연관 입력정보 조회에 실패했습니다.' }
    }

    return { success: true, counts: result.counts }
  } catch (error) {
    console.error('Get project related counts error:', error)
    return { success: false, error: '연관 입력정보 조회 중 오류가 발생했습니다.' }
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
  // 현황 화면 경량 조회용: 서명 존재 여부만 보유(서명 base64는 보고서 생성 시점에만 로드)
  has_signature?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  risk_factors_json?: any[]
  // 재해예방 기술지도 관련 필드
  disaster_prevention_report_photo?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  disaster_prevention_risk_factors_json?: any[]
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
  signature?: string
  critical_items?: any[]
  caution_items?: any[]
  other_items?: any[]
  five_key_items?: any[]
}

// 발주청 사용자가 볼 수 있는 관리자 점검 현황 조회
export async function getManagerInspectionsByUserBranch(
  userProfile: UserProfile,
  quarterYear?: string, // 2025Q1 형식
  selectedHq?: string,
  selectedBranch?: string,
  options?: { includeSignature?: boolean } // 기본 false: 현황 화면은 서명 base64를 제외한 경량 조회
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

    // 서명 base64는 행당 ~20KB(전체 응답의 90%+)이지만 현황 화면은 "서명 존재 여부"만 필요하다.
    // 기본 조회에서는 signature를 제외하고, 존재 여부는 별도 경량 쿼리(id만)로 채운다.
    // 실제 서명 본문은 보고서 생성 시점에만 includeSignature 옵션으로 가져온다.
    const includeSignature = options?.includeSignature ?? false
    const baseColumns = `
        id,
        project_id,
        inspection_date,
        inspector_name,
        remarks,
        created_at,
        form_data,
        construction_supervisor,
        inspection_photo,
        risk_assessment_photo,
        risk_factors_json,
        disaster_prevention_report_photo,
        disaster_prevention_risk_factors_json,
        projects!inner (
          project_name,
          managing_hq,
          managing_branch,
          is_active
        ),
        user_profiles (
          full_name
        )`
    const selectColumns = includeSignature ? `signature,${baseColumns}` : baseColumns

    // 권한·기간·본부/지사 필터를 본 조회와 서명존재 조회에 동일하게 적용한다.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const applyScope = (q: any) => {
      if (startDate && endDate) {
        q = q.gte('inspection_date', startDate).lte('inspection_date', endDate)
      }
      if (userProfile.role === '발주청') {
        if (userProfile.hq_division === '본사' && userProfile.branch_division === '본사') {
          // 본사 조직: 전사 조회(추가 필터 없음)
        } else {
          if (userProfile.hq_division && !userProfile.branch_division?.endsWith('본부')) {
            q = q.eq('projects.managing_hq', userProfile.hq_division)
          }
          if (userProfile.branch_division && !userProfile.branch_division?.endsWith('본부')) {
            q = q.eq('projects.managing_branch', userProfile.branch_division)
          }
        }
      }
      if (selectedHq) q = q.eq('projects.managing_hq', selectedHq)
      if (selectedBranch) q = q.eq('projects.managing_branch', selectedBranch)
      return q
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = applyScope((supabase as any).from('manager_inspections').select(selectColumns))
    query = query.order('inspection_date', { ascending: false })

    const { data: inspections, error } = await query

    if (error) {
      console.error('관리자 점검 조회 오류:', error)
      return { success: false, error: error.message }
    }

    // 서명 존재 여부 경량 조회: 서명 본문 전송 없이 id만 받아 has_signature를 채운다.
    const signedIds = new Set<string>()
    if (!includeSignature && inspections && inspections.length > 0) {
      const { data: signedRows, error: signedErr } = await applyScope(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from('manager_inspections').select('id, projects!inner ( managing_hq, managing_branch )').not('signature', 'is', null)
      )
      if (signedErr) {
        console.error('서명 존재 여부 조회 오류:', signedErr)
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(signedRows || []).forEach((r: any) => signedIds.add(r.id))
      }
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
      has_signature: includeSignature ? !!(item.signature && String(item.signature).trim() !== '') : signedIds.has(item.id),
      risk_factors_json: item.risk_factors_json,
      // 재해예방 기술지도 관련 컬럼 포함
      disaster_prevention_report_photo: item.disaster_prevention_report_photo,
      disaster_prevention_risk_factors_json: item.disaster_prevention_risk_factors_json
    }))

    if (DEBUG_LOGS) console.log(`조회된 관리자 점검 수: ${transformedInspections.length}`)
    return { success: true, inspections: transformedInspections }

  } catch (error: any) {
    console.error('관리자 점검 조회 실패:', error)
    return { success: false, error: error.message || '관리자 점검 데이터를 불러오는데 실패했습니다.' }
  }
}

// 관리자 점검 건수만 조회 (카드 표시용 경량 쿼리)
export async function getManagerInspectionCountByUserBranch(
  userProfile: UserProfile,
  quarterYear?: string,
  selectedHq?: string,
  selectedBranch?: string
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    // 분기별 날짜 범위 계산
    let startDate: string | null = null
    let endDate: string | null = null

    if (quarterYear) {
      const [year, quarter] = quarterYear.split('Q')
      const yearNum = parseInt(year)
      const quarterNum = parseInt(quarter)

      switch (quarterNum) {
        case 1: startDate = `${yearNum}-01-01`; endDate = `${yearNum}-03-31`; break
        case 2: startDate = `${yearNum}-04-01`; endDate = `${yearNum}-06-30`; break
        case 3: startDate = `${yearNum}-07-01`; endDate = `${yearNum}-09-30`; break
        case 4: startDate = `${yearNum}-10-01`; endDate = `${yearNum}-12-31`; break
      }
    }

    let query = supabase
      .from('manager_inspections')
      .select('id, projects!inner(managing_hq, managing_branch)', { count: 'exact', head: true })

    if (startDate && endDate) {
      query = query.gte('inspection_date', startDate).lte('inspection_date', endDate)
    }

    if (userProfile.role === '발주청') {
      if (userProfile.hq_division === '본사' && userProfile.branch_division === '본사') {
        // 전사 조회
      } else {
        if (userProfile.hq_division && !userProfile.branch_division?.endsWith('본부')) {
          query = query.eq('projects.managing_hq', userProfile.hq_division)
        }
        if (userProfile.branch_division && !userProfile.branch_division?.endsWith('본부')) {
          query = query.eq('projects.managing_branch', userProfile.branch_division)
        }
      }
    }

    if (selectedHq) {
      query = query.eq('projects.managing_hq', selectedHq)
    }
    if (selectedBranch) {
      query = query.eq('projects.managing_branch', selectedBranch)
    }

    const { count, error } = await query

    if (error) {
      return { success: false, count: 0, error: error.message }
    }

    return { success: true, count: count || 0 }
  } catch (error: any) {
    console.error('관리자 점검 건수 조회 실패:', error)
    return { success: false, count: 0, error: error.message || '관리자 점검 건수 조회에 실패했습니다.' }
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
      // 본사 조직은 전사 데이터 조회 가능
      if (userProfile.hq_division === '본사' && userProfile.branch_division === '본사') {
        if (DEBUG_LOGS) console.log('✅ 본사 조직 사용자: 전사 본부불시점검 조회')
        // query에 추가 필터링 없음 (모든 점검 조회)
      } else {
        // 본부 단위 권한이 있는 경우
        if (userProfile.hq_division && !userProfile.branch_division?.endsWith('본부')) {
          query = query.eq('projects.managing_hq', userProfile.hq_division)
        }

        // 지사 단위 권한이 있는 경우
        if (userProfile.branch_division && !userProfile.branch_division?.endsWith('본부')) {
          query = query.eq('projects.managing_branch', userProfile.branch_division)
        }
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
      console.error('본부 불시점검 조회 오류:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        error: error
      })

      // 네트워크 에러인 경우 더 명확한 메시지 제공
      const errorMessage = error.message || '본부 불시점검 데이터를 불러오는데 실패했습니다.'
      return { success: false, error: errorMessage }
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
      signature: item.signature,
      // 보고서(점검표) 생성을 위해 필요한 항목 배열 포함
      critical_items: item.critical_items || [],
      caution_items: item.caution_items || [],
      other_items: item.other_items || [],
      // 5대 핵심 안전수칙(등급·점검결과) — 벌크 보고서 Page3에서 사용
      five_key_items: item.five_key_items || []
    }))

    if (DEBUG_LOGS) console.log(`조회된 본부 불시점검 수: ${transformedInspections.length}`)
    return { success: true, inspections: transformedInspections }

  } catch (error: any) {
    console.error('본부 불시점검 조회 실패:', {
      message: error?.message,
      name: error?.name,
      stack: error?.stack,
      error: error
    })

    // 네트워크 에러인 경우
    if (error?.message?.includes('QUIC') || error?.message?.includes('network') || error?.name === 'NetworkError') {
      return { success: false, error: '네트워크 연결 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' }
    }

    return { success: false, error: error?.message || '본부 불시점검 데이터를 불러오는데 실패했습니다.' }
  }
}

// 본부 불시점검 건수만 조회 (카드 표시용 경량 쿼리)
export async function getHeadquartersInspectionCountByUserBranch(
  userProfile: UserProfile,
  quarterYear?: string,
  selectedHq?: string,
  selectedBranch?: string
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    let startDate: string | null = null
    let endDate: string | null = null

    if (quarterYear) {
      const [year, quarter] = quarterYear.split('Q')
      const yearNum = parseInt(year)
      const quarterNum = parseInt(quarter)

      switch (quarterNum) {
        case 1: startDate = `${yearNum}-01-01`; endDate = `${yearNum}-03-31`; break
        case 2: startDate = `${yearNum}-04-01`; endDate = `${yearNum}-06-30`; break
        case 3: startDate = `${yearNum}-07-01`; endDate = `${yearNum}-09-30`; break
        case 4: startDate = `${yearNum}-10-01`; endDate = `${yearNum}-12-31`; break
      }
    }

    let query = supabase
      .from('headquarters_inspections')
      .select('id, projects!inner(managing_hq, managing_branch)', { count: 'exact', head: true })

    if (startDate && endDate) {
      query = query.gte('inspection_date', startDate).lte('inspection_date', endDate)
    }

    if (userProfile.role === '발주청') {
      if (userProfile.hq_division === '본사' && userProfile.branch_division === '본사') {
        // 전사 조회
      } else {
        if (userProfile.hq_division && !userProfile.branch_division?.endsWith('본부')) {
          query = query.eq('projects.managing_hq', userProfile.hq_division)
        }
        if (userProfile.branch_division && !userProfile.branch_division?.endsWith('본부')) {
          query = query.eq('projects.managing_branch', userProfile.branch_division)
        }
      }
    }

    if (selectedHq) {
      query = query.eq('projects.managing_hq', selectedHq)
    }
    if (selectedBranch) {
      query = query.eq('projects.managing_branch', selectedBranch)
    }

    const { count, error } = await query

    if (error) {
      return { success: false, count: 0, error: error.message }
    }

    return { success: true, count: count || 0 }
  } catch (error: any) {
    console.error('본부 불시점검 건수 조회 실패:', error)
    return { success: false, count: 0, error: error?.message || '본부 불시점검 건수 조회에 실패했습니다.' }
  }
}

// TBM 안전활동점검 데이터 인터페이스
export interface TBMSafetyInspection {
  id: string
  project_id: string
  project_name?: string
  managing_hq?: string
  managing_branch?: string
  district?: string
  supervisor?: string
  tbm_date: string
  tbm_start_time: string
  tbm_end_time: string
  is_attended: boolean
  non_attendance_reason?: string
  attendee_affiliation?: string
  attendee?: string
  work_content: string
  address?: string
  tbm_content: string
  workers?: string
  equipment?: string
  new_workers?: string
  signal_workers?: string
  site_explanation: boolean
  site_explanation_reason?: string
  risk_explanation: boolean
  risk_explanation_reason?: string
  ppe_provision: boolean
  ppe_provision_reason?: string
  health_check: boolean
  health_check_reason?: string
  attendee_opinion?: string
  affiliation?: string
  signature?: string
  tomorrow_work_status?: boolean
  tomorrow_is_attended?: boolean
  tomorrow_non_attendance_reason?: string
  tomorrow_attendee?: string
  created_at: string
  created_by?: string
}

// 발주청 사용자가 볼 수 있는 TBM 안전활동점검 현황 조회
export async function getTBMSafetyInspectionsByUserBranch(
  userProfile: UserProfile,
  selectedHq?: string,
  selectedBranch?: string,
  startDate?: string,
  endDate?: string
): Promise<{ success: boolean; inspections?: TBMSafetyInspection[]; error?: string }> {
  try {
    if (DEBUG_LOGS) console.log('TBM 안전활동점검 데이터 조회 시작:', { selectedHq, selectedBranch, startDate, endDate })

    let query = supabase
      .from('tbm_safety_inspections')
      .select(`
        *,
        projects!inner (
          project_name,
          managing_hq,
          managing_branch
        )
      `)

    // 날짜 범위 필터링
    if (startDate) {
      query = query.gte('tbm_date', startDate)
    }
    if (endDate) {
      query = query.lte('tbm_date', endDate)
    }

    // 발주청 사용자의 권한에 따른 필터링
    if (userProfile.role === '발주청') {
      // 본사 조직은 전사 데이터 조회 가능
      if (userProfile.hq_division === '본사' && userProfile.branch_division === '본사') {
        if (DEBUG_LOGS) console.log('✅ 본사 조직 사용자: 전사 TBM 안전활동점검 조회')
        // query에 추가 필터링 없음 (모든 점검 조회)
      } else {
        // 본부 단위 권한이 있는 경우
        if (userProfile.hq_division && !userProfile.branch_division?.endsWith('본부')) {
          query = query.eq('projects.managing_hq', userProfile.hq_division)
        }

        // 지사 단위 권한이 있는 경우
        if (userProfile.branch_division && !userProfile.branch_division?.endsWith('본부')) {
          query = query.eq('projects.managing_branch', userProfile.branch_division)
        }
      }
    }

    // 선택된 본부/지사 필터링
    if (selectedHq) {
      query = query.eq('projects.managing_hq', selectedHq)
    }
    if (selectedBranch) {
      query = query.eq('projects.managing_branch', selectedBranch)
    }

    query = query.order('tbm_date', { ascending: false })

    const { data: inspections, error } = await query

    if (error) {
      console.error('TBM 안전활동점검 조회 오류:', error)
      return { success: false, error: error.message }
    }

    // 데이터 변환
    const transformedInspections: TBMSafetyInspection[] = (inspections || []).map((item: any) => ({
      id: item.id,
      project_id: item.project_id,
      project_name: item.projects?.project_name,
      managing_hq: item.projects?.managing_hq,
      managing_branch: item.projects?.managing_branch,
      district: item.district,
      supervisor: item.supervisor,
      tbm_date: item.tbm_date,
      tbm_start_time: item.tbm_start_time,
      tbm_end_time: item.tbm_end_time,
      is_attended: item.is_attended ?? true,
      non_attendance_reason: item.non_attendance_reason,
      attendee_affiliation: item.attendee_affiliation,
      attendee: item.attendee,
      work_content: item.work_content,
      address: item.address,
      tbm_content: item.tbm_content,
      workers: item.workers,
      equipment: item.equipment,
      new_workers: item.new_workers,
      signal_workers: item.signal_workers,
      site_explanation: item.site_explanation ?? true,
      site_explanation_reason: item.site_explanation_reason,
      risk_explanation: item.risk_explanation ?? true,
      risk_explanation_reason: item.risk_explanation_reason,
      ppe_provision: item.ppe_provision ?? true,
      ppe_provision_reason: item.ppe_provision_reason,
      health_check: item.health_check ?? true,
      health_check_reason: item.health_check_reason,
      attendee_opinion: item.attendee_opinion,
      affiliation: item.affiliation,
      signature: item.signature,
      tomorrow_work_status: item.tomorrow_work_status,
      tomorrow_is_attended: item.tomorrow_is_attended,
      tomorrow_non_attendance_reason: item.tomorrow_non_attendance_reason,
      tomorrow_attendee: item.tomorrow_attendee,
      created_at: item.created_at,
      created_by: item.created_by
    }))

    if (DEBUG_LOGS) console.log(`조회된 TBM 안전활동점검 수: ${transformedInspections.length}`)
    return { success: true, inspections: transformedInspections }

  } catch (error: any) {
    console.error('TBM 안전활동점검 조회 실패:', error)
    return { success: false, error: error.message || 'TBM 안전활동점검 데이터를 불러오는데 실패했습니다.' }
  }
}

// TBM 안전활동점검 건수만 조회 (카드 표시용 경량 쿼리)
export async function getTBMSafetyInspectionCountByUserBranch(
  userProfile: UserProfile,
  selectedHq?: string,
  selectedBranch?: string,
  startDate?: string,
  endDate?: string
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    let query = supabase
      .from('tbm_safety_inspections')
      .select('id, projects!inner(managing_hq, managing_branch)', { count: 'exact', head: true })

    if (startDate) {
      query = query.gte('tbm_date', startDate)
    }
    if (endDate) {
      query = query.lte('tbm_date', endDate)
    }

    if (userProfile.role === '발주청') {
      if (userProfile.hq_division === '본사' && userProfile.branch_division === '본사') {
        // 전사 조회
      } else {
        if (userProfile.hq_division && !userProfile.branch_division?.endsWith('본부')) {
          query = query.eq('projects.managing_hq', userProfile.hq_division)
        }
        if (userProfile.branch_division && !userProfile.branch_division?.endsWith('본부')) {
          query = query.eq('projects.managing_branch', userProfile.branch_division)
        }
      }
    }

    if (selectedHq) {
      query = query.eq('projects.managing_hq', selectedHq)
    }
    if (selectedBranch) {
      query = query.eq('projects.managing_branch', selectedBranch)
    }

    const { count, error } = await query

    if (error) {
      return { success: false, count: 0, error: error.message }
    }

    return { success: true, count: count || 0 }
  } catch (error: any) {
    console.error('TBM 안전활동점검 건수 조회 실패:', error)
    return { success: false, count: 0, error: error.message || 'TBM 안전활동점검 건수 조회에 실패했습니다.' }
  }
}

// 안전서류 점검 타입 정의
export interface SafeDocumentInspection {
  id: string
  project_id: string
  project_name?: string
  managing_hq?: string
  managing_branch?: string
  inspection_date: string
  inspector_name: string
  inspector_affiliation: string
  construction_status: string
  construction_cost: string
  has_special_construction1: string
  has_special_construction2: string
  checklist_items: Record<string, string>
  compliant_items: number
  non_compliant_items: number
  not_applicable_items: number
  created_by?: string
  created_at: string
  updated_at: string
}

// 근로자 등록 현황 타입
export interface WorkerCountByProject {
  project_id: string
  project_name: string
  managing_hq: string
  managing_branch: string
  worker_count: number
  elderly_count: number   // 만65세 이상
  foreigner_count: number // 외국인
}

// 발주청 사용자가 볼 수 있는 근로자 등록 현황 조회
export async function getWorkerCountsByUserBranch(
  userProfile: UserProfile,
  selectedHq?: string,
  selectedBranch?: string
): Promise<{ success: boolean; workerCounts?: WorkerCountByProject[]; error?: string }> {
  try {
    if (DEBUG_LOGS) console.log('근로자 등록 현황 조회 시작:', { selectedHq, selectedBranch })

    // 1. 프로젝트 목록 조회
    let projectQuery = supabase
      .from('projects')
      .select('id, project_name, managing_hq, managing_branch, is_active')

    // 발주청 사용자의 권한에 따른 필터링
    if (userProfile.role === '발주청') {
      if (userProfile.hq_division === '본사' && userProfile.branch_division === '본사') {
        if (DEBUG_LOGS) console.log('✅ 본사 조직 사용자: 전사 근로자 현황 조회')
      } else {
        if (userProfile.hq_division && !userProfile.branch_division?.endsWith('본부')) {
          projectQuery = projectQuery.eq('managing_hq', userProfile.hq_division)
        }
        if (userProfile.branch_division && !userProfile.branch_division?.endsWith('본부')) {
          projectQuery = projectQuery.eq('managing_branch', userProfile.branch_division)
        }
      }
    }

    if (selectedHq) {
      projectQuery = projectQuery.eq('managing_hq', selectedHq)
    }
    if (selectedBranch) {
      projectQuery = projectQuery.eq('managing_branch', selectedBranch)
    }

    const { data: projects, error: projectError } = await projectQuery

    if (projectError) {
      console.error('프로젝트 조회 오류:', projectError)
      return { success: false, error: projectError.message }
    }

    if (!projects || projects.length === 0) {
      return { success: true, workerCounts: [] }
    }

    // 준공 프로젝트 제외
    const isCompleted = (p: any): boolean => {
      if (p.is_active === undefined || p.is_active === null) return false
      if (typeof p.is_active === 'boolean') return !p.is_active
      if (typeof p.is_active === 'object') return p.is_active.completed === true
      return false
    }
    const activeProjects = projects.filter(p => !isCompleted(p))

    if (activeProjects.length === 0) {
      return { success: true, workerCounts: [] }
    }

    // 2. 근로자 상세 정보 조회 (프로젝트별 집계용)
    const projectIds = activeProjects.map(p => p.id)
    const { data: workers, error: workerError } = await supabase
      .from('workers')
      .select('project_id, birth_date, is_foreigner')
      .in('project_id', projectIds)

    if (workerError) {
      console.error('근로자 조회 오류:', workerError)
      return { success: false, error: workerError.message }
    }

    // 만65세 이상 판별 함수
    const isElderly = (birthDate: string | null): boolean => {
      if (!birthDate) return false
      const today = new Date()
      const birth = new Date(birthDate)
      let age = today.getFullYear() - birth.getFullYear()
      const monthDiff = today.getMonth() - birth.getMonth()
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        age--
      }
      return age >= 65
    }

    // 프로젝트별 근로자 수 및 분류 계산
    const statsMap = new Map<string, { total: number; elderly: number; foreigner: number }>()
      ; (workers || []).forEach((w: any) => {
        const existing = statsMap.get(w.project_id) || { total: 0, elderly: 0, foreigner: 0 }
        existing.total += 1
        if (isElderly(w.birth_date)) existing.elderly += 1
        if (w.is_foreigner) existing.foreigner += 1
        statsMap.set(w.project_id, existing)
      })

    const workerCounts: WorkerCountByProject[] = activeProjects.map(p => {
      const stats = statsMap.get(p.id) || { total: 0, elderly: 0, foreigner: 0 }
      return {
        project_id: p.id,
        project_name: p.project_name,
        managing_hq: p.managing_hq || '',
        managing_branch: p.managing_branch || '',
        worker_count: stats.total,
        elderly_count: stats.elderly,
        foreigner_count: stats.foreigner,
      }
    })

    if (DEBUG_LOGS) console.log(`조회된 프로젝트 수: ${workerCounts.length}, 총 근로자: ${workerCounts.reduce((s, w) => s + w.worker_count, 0)}`)
    return { success: true, workerCounts }

  } catch (error: any) {
    console.error('근로자 등록 현황 조회 실패:', error)
    return { success: false, error: error.message || '근로자 등록 현황을 불러오는데 실패했습니다.' }
  }
}

// 정기안전점검 현황 타입
export interface SafetyInspectionCountByProject {
  project_id: string
  project_name: string
  managing_hq: string
  managing_branch: string
  inspection_count: number

  thawing_count: number   // 해빙기 점검
  thawing_findings: number   // 해빙기 일반 지적건수 (safety_inspection_results)
  thawing_additional_findings: number // 해빙기 추가 점검 항목 지적건수
  thawing_unresolved: number // 해빙기 미조치
  thawing_unsigned: number   // 해빙기 미서명

  rainy_count: number     // 우기 점검
  rainy_findings: number     // 우기 일반 지적건수
  rainy_additional_findings: number // 우기 추가 점검 항목 지적건수
  rainy_unresolved: number   // 우기 미조치
  rainy_unsigned: number     // 우기 미서명

  comprehensive_count: number // 종합 점검
  comprehensive_findings: number // 종합 지적건수
  comprehensive_unresolved: number // 종합 미조치
  comprehensive_unsigned: number   // 종합 미서명

  special_count: number   // 특별점검(안전혁신건설-287)
  special_findings: number   // 특별 지적건수
  special_unresolved: number // 특별 미조치
  special_unsigned: number   // 특별 미서명
}

// 발주청 사용자가 볼 수 있는 정기안전점검 현황 조회
export async function getSafetyInspectionCountsByUserBranch(
  userProfile: UserProfile,
  selectedHq?: string,
  selectedBranch?: string,
  selectedYear?: number
): Promise<{ success: boolean; inspectionCounts?: SafetyInspectionCountByProject[]; error?: string }> {
  try {
    if (DEBUG_LOGS) console.log('정기안전점검 현황 조회 시작:', { selectedHq, selectedBranch })

    // 1. 프로젝트 목록 조회
    let projectQuery = supabase
      .from('projects')
      .select('id, project_name, managing_hq, managing_branch, is_active')

    // 발주청 사용자의 권한에 따른 필터링
    if (userProfile.role === '발주청') {
      if (userProfile.hq_division === '본사' && userProfile.branch_division === '본사') {
        if (DEBUG_LOGS) console.log('✅ 본사 조직 사용자: 전사 정기안전점검 현황 조회')
      } else {
        if (userProfile.hq_division && !userProfile.branch_division?.endsWith('본부')) {
          projectQuery = projectQuery.eq('managing_hq', userProfile.hq_division)
        }
        if (userProfile.branch_division && !userProfile.branch_division?.endsWith('본부')) {
          projectQuery = projectQuery.eq('managing_branch', userProfile.branch_division)
        }
      }
    }

    if (selectedHq) {
      projectQuery = projectQuery.eq('managing_hq', selectedHq)
    }
    if (selectedBranch) {
      projectQuery = projectQuery.eq('managing_branch', selectedBranch)
    }

    const { data: projects, error: projectError } = await projectQuery

    if (projectError) {
      console.error('프로젝트 조회 오류:', projectError)
      return { success: false, error: projectError.message }
    }

    if (!projects || projects.length === 0) {
      return { success: true, inspectionCounts: [] }
    }

    // 준공 프로젝트 제외
    const isCompleted = (p: any): boolean => {
      if (p.is_active === undefined || p.is_active === null) return false
      if (typeof p.is_active === 'boolean') return !p.is_active
      if (typeof p.is_active === 'object') return p.is_active.completed === true
      return false
    }
    const activeProjects = projects.filter(p => !isCompleted(p))

    if (activeProjects.length === 0) {
      return { success: true, inspectionCounts: [] }
    }

    // 2. safety_inspections 테이블에서 프로젝트별 점검 건수 집계
    // 프로젝트가 많으면 타임아웃 방지를 위해 배치로 분할 조회
    const projectIds = activeProjects.map(p => p.id)
    const BATCH_SIZE = 30
    const allInspections: any[] = []

    for (let i = 0; i < projectIds.length; i += BATCH_SIZE) {
      const batchIds = projectIds.slice(i, i + BATCH_SIZE)
      let inspQuery = supabase
        .from('safety_inspections')
        .select(`
          project_id,
          inspection_type,
          signatures,
          additional_items,
          safety_inspection_results (findings, action_items, photo_url, after_photo_url)
        `)
        .in('project_id', batchIds)

      // 연도 필터링
      if (selectedYear) {
        inspQuery = inspQuery
          .gte('inspection_date', `${selectedYear}-01-01`)
          .lte('inspection_date', `${selectedYear}-12-31`)
      }

      const { data: batchData, error: inspError } = await inspQuery

      if (inspError) {
        console.error('정기안전점검 조회 오류 (배치):', inspError)
        return { success: false, error: inspError.message }
      }

      if (batchData) {
        allInspections.push(...batchData)
      }
    }

    const inspections = allInspections

    // 프로젝트별 점검 건수 및 유형별 카운트
    const statsMap = new Map<string, any>()
      ; (inspections || []).forEach((ins: any) => {
        const existing = statsMap.get(ins.project_id) || {
          total: 0,
          thawing: { total: 0, findings: 0, additionalFindings: 0, unresolved: 0, unsigned: 0 },
          rainy: { total: 0, findings: 0, additionalFindings: 0, unresolved: 0, unsigned: 0 },
          comprehensive: { total: 0, findings: 0, unresolved: 0, unsigned: 0 },
          special: { total: 0, findings: 0, unresolved: 0, unsigned: 0 }
        }
        existing.total += 1
        const type = (ins.inspection_type || '').trim()

        // 미조치 판단: 실제 지적사항이 있는 항목에 대해 조치 후 사진(after_photo_url)이 미등록이면 미조치
        // 실제 지적 = photo_url(지적사진)이 있거나, findings 텍스트가 단순 "양호/이상없음" 등이 아닌 경우
        const NO_FINDING_KEYWORDS = ['양호', '적정', '이상없음', '이상 없음', '지적없음', '지적 없음', '해당없음', '해당 없음', '없음', '특이사항 없음', '특이사항없음']
        const isRealFinding = (r: any): boolean => {
          if (r.photo_url && r.photo_url.trim() !== '') return true
          const f = (r.findings || '').trim()
          if (f && !NO_FINDING_KEYWORDS.includes(f)) return true
          return false
        }
        let findingsCount = 0
        let isUnresolved = false
        if (ins.safety_inspection_results && Array.isArray(ins.safety_inspection_results)) {
          findingsCount = ins.safety_inspection_results.filter(isRealFinding).length
          isUnresolved = ins.safety_inspection_results.some((r: any) => {
            if (!isRealFinding(r)) return false
            const hasAfterPhoto = r.after_photo_url && r.after_photo_url.trim() !== ''
            return !hasAfterPhoto
          })
        }

        // 미서명 판단: signatures 중 이름/직급이 있는데 서명(dataUrl)이 없는 항목이 1개라도 있으면 미서명
        // 또는 signatures 배열 자체가 없거나 모두 비어있으면 미서명 처리
        let isUnsigned = true
        if (ins.signatures && Array.isArray(ins.signatures) && ins.signatures.length > 0) {
          const requiredRoles = ins.signatures.filter((s: any) => s.name || s.position || s.dataUrl)
          if (requiredRoles.length > 0) {
            isUnsigned = requiredRoles.some((s: any) => !s.dataUrl)
          }
        }

        // 해빙기/우기 추가 점검 항목: action이 있고 '해당없음'이 아닌 항목을 지적으로 카운트
        let additionalFindings = 0
        if ((type === '해빙기' || type === '우기') && ins.additional_items && Array.isArray(ins.additional_items)) {
          additionalFindings = ins.additional_items.filter((item: any) => item.action && item.action !== '해당없음').length
        }

        if (type === '해빙기') {
          existing.thawing.total += 1
          existing.thawing.findings += findingsCount
          existing.thawing.additionalFindings += additionalFindings
          if (isUnresolved) existing.thawing.unresolved += 1
          if (isUnsigned) existing.thawing.unsigned += 1
        } else if (type === '우기') {
          existing.rainy.total += 1
          existing.rainy.findings += findingsCount
          existing.rainy.additionalFindings += additionalFindings
          if (isUnresolved) existing.rainy.unresolved += 1
          if (isUnsigned) existing.rainy.unsigned += 1
        } else if (type === '종합') {
          existing.comprehensive.total += 1
          existing.comprehensive.findings += findingsCount
          if (isUnresolved) existing.comprehensive.unresolved += 1
          if (isUnsigned) existing.comprehensive.unsigned += 1
        } else if (type === '특별점검(안전혁신건설-287)') {
          existing.special.total += 1
          // 특별점검: additional_items에서 지적사항(action !== '해당없음') 개수 및 조치사진 미등록 여부 판단
          let specialFindings = 0
          let specialUnresolved = false
          if (ins.additional_items && Array.isArray(ins.additional_items)) {
            const realItems = ins.additional_items.filter((item: any) => item.action && item.action !== '해당없음')
            specialFindings = realItems.length
            specialUnresolved = realItems.some((item: any) => {
              const hasAfterPhoto = item.after_photo_url && item.after_photo_url.trim() !== '' && item.after_photo_url !== 'N/A'
              return !hasAfterPhoto
            })
          }
          existing.special.findings += specialFindings
          if (specialUnresolved) existing.special.unresolved += 1
          // 특별점검은 서명이 없으므로 미서명 카운트 제외
        }

        statsMap.set(ins.project_id, existing)
      })

    const inspectionCounts: SafetyInspectionCountByProject[] = activeProjects.map(p => {
      const stats = statsMap.get(p.id) || {
        total: 0,
        thawing: { total: 0, findings: 0, additionalFindings: 0, unresolved: 0, unsigned: 0 },
        rainy: { total: 0, findings: 0, additionalFindings: 0, unresolved: 0, unsigned: 0 },
        comprehensive: { total: 0, findings: 0, unresolved: 0, unsigned: 0 },
        special: { total: 0, findings: 0, unresolved: 0, unsigned: 0 }
      }
      return {
        project_id: p.id,
        project_name: p.project_name,
        managing_hq: p.managing_hq || '',
        managing_branch: p.managing_branch || '',
        inspection_count: stats.total,
        thawing_count: stats.thawing.total,
        thawing_findings: stats.thawing.findings,
        thawing_additional_findings: stats.thawing.additionalFindings,
        thawing_unresolved: stats.thawing.unresolved,
        thawing_unsigned: stats.thawing.unsigned,
        rainy_count: stats.rainy.total,
        rainy_findings: stats.rainy.findings,
        rainy_additional_findings: stats.rainy.additionalFindings,
        rainy_unresolved: stats.rainy.unresolved,
        rainy_unsigned: stats.rainy.unsigned,
        comprehensive_count: stats.comprehensive.total,
        comprehensive_findings: stats.comprehensive.findings,
        comprehensive_unresolved: stats.comprehensive.unresolved,
        comprehensive_unsigned: stats.comprehensive.unsigned,
        special_count: stats.special.total,
        special_findings: stats.special.findings,
        special_unresolved: stats.special.unresolved,
        special_unsigned: stats.special.unsigned,
      }
    })

    if (DEBUG_LOGS) console.log(`정기안전점검 조회 완료: ${inspectionCounts.length}개 프로젝트, 총 ${inspectionCounts.reduce((s, c) => s + c.inspection_count, 0)}건`)
    return { success: true, inspectionCounts }

  } catch (error: any) {
    console.error('정기안전점검 현황 조회 실패:', error)
    return { success: false, error: error.message || '정기안전점검 현황을 불러오는데 실패했습니다.' }
  }
}

// 정기안전점검 상세 데이터 조회 (엑셀 다운로드용)
export interface SafetyInspectionDetailForExcel {
  inspection_id: string
  project_id: string
  project_name: string
  managing_hq: string
  managing_branch: string
  project_category: string
  district_name: string
  inspection_date: string
  inspection_type: string
  supervisor_name: string | null
  additional_items: { category: string; item: string; action: string }[] | null
  results: {
    field_item: string
    findings: string
    action_items: string
    photo_url: string | null
    after_photo_url: string | null
    sort_order: number
  }[]
}

export async function getSafetyInspectionDetailsForExcel(
  userProfile: UserProfile,
  selectedHq?: string,
  selectedBranch?: string,
  inspectionType?: string
): Promise<{ success: boolean; data?: SafetyInspectionDetailForExcel[]; error?: string }> {
  try {
    // 1. 프로젝트 목록 조회
    let projectQuery = supabase
      .from('projects')
      .select('id, project_name, managing_hq, managing_branch, project_category, is_active')

    if (userProfile.role === '발주청') {
      if (userProfile.hq_division === '본사' && userProfile.branch_division === '본사') {
        // 본사: 전사 조회
      } else {
        if (userProfile.hq_division && !userProfile.branch_division?.endsWith('본부')) {
          projectQuery = projectQuery.eq('managing_hq', userProfile.hq_division)
        }
        if (userProfile.branch_division && !userProfile.branch_division?.endsWith('본부')) {
          projectQuery = projectQuery.eq('managing_branch', userProfile.branch_division)
        }
      }
    }

    if (selectedHq) projectQuery = projectQuery.eq('managing_hq', selectedHq)
    if (selectedBranch) projectQuery = projectQuery.eq('managing_branch', selectedBranch)

    const { data: projects, error: projectError } = await projectQuery
    if (projectError) return { success: false, error: projectError.message }
    if (!projects || projects.length === 0) return { success: true, data: [] }

    // 준공 제외
    const isComp = (p: any): boolean => {
      if (p.is_active === undefined || p.is_active === null) return false
      if (typeof p.is_active === 'boolean') return !p.is_active
      if (typeof p.is_active === 'object') return p.is_active.completed === true
      return false
    }
    const activeProjects = projects.filter(p => !isComp(p))
    if (activeProjects.length === 0) return { success: true, data: [] }

    const projectIds = activeProjects.map(p => p.id)
    const projectMap = new Map(activeProjects.map(p => [p.id, p]))

    // 2. 점검 목록 조회
    let inspQuery = supabase
      .from('safety_inspections')
      .select('id, project_id, inspection_date, inspection_type, inspection_team, district_name, supervisor_name, additional_items, signatures')
      .in('project_id', projectIds)
    if (inspectionType) inspQuery = inspQuery.eq('inspection_type', inspectionType)
    const { data: inspections, error: inspError } = await inspQuery
      .order('inspection_date', { ascending: true })

    if (inspError) return { success: false, error: inspError.message }
    if (!inspections || inspections.length === 0) return { success: true, data: [] }

    // 3. 점검 결과 조회
    const inspectionIds = inspections.map(i => i.id)
    const { data: results, error: resError } = await supabase
      .from('safety_inspection_results')
      .select('inspection_id, field_item, findings, action_items, photo_url, after_photo_url, sort_order')
      .in('inspection_id', inspectionIds)
      .order('sort_order', { ascending: true })

    if (resError) return { success: false, error: resError.message }

    // 점검별 결과 그룹핑
    const resultsMap = new Map<string, typeof results>()
      ; (results || []).forEach(r => {
        const arr = resultsMap.get(r.inspection_id) || []
        arr.push(r)
        resultsMap.set(r.inspection_id, arr)
      })

    // 4. 데이터 조합
    const data: SafetyInspectionDetailForExcel[] = inspections.map(ins => {
      const proj = projectMap.get(ins.project_id)
      return {
        inspection_id: ins.id,
        project_id: ins.project_id,
        project_name: proj?.project_name || '',
        managing_hq: proj?.managing_hq || '',
        managing_branch: proj?.managing_branch || '',
        project_category: (proj as any)?.project_category || '',
        district_name: ins.district_name || '',
        inspection_date: ins.inspection_date || '',
        inspection_type: ins.inspection_type || '',
        supervisor_name: ins.supervisor_name || null,
        inspection_team: (ins as any).inspection_team || null,
        signatures: (ins as any).signatures || null,
        additional_items: (ins as any).additional_items || null,
        results: (resultsMap.get(ins.id) || []).map(r => ({
          field_item: r.field_item || '안전',
          findings: r.findings || '',
          action_items: r.action_items || '',
          photo_url: r.photo_url || null,
          after_photo_url: r.after_photo_url || null,
          sort_order: r.sort_order || 0,
        })),
      }
    })

    return { success: true, data }
  } catch (error: any) {
    console.error('정기안전점검 상세 조회 실패:', error)
    return { success: false, error: error.message || '데이터 조회 실패' }
  }
}

// 전경사진 HWPX 다운로드용 데이터 조회
export interface SafetyInspectionPhotoForHwpx {
  inspection_id: string
  project_name: string
  district_name: string
  inspection_date: string
  supervisor_name: string | null
  photo_url: string | null
}

export async function getSafetyInspectionPhotosForHwpx(
  userProfile: UserProfile,
  selectedHq?: string,
  selectedBranch?: string,
  inspectionType?: string
): Promise<{ success: boolean; data?: SafetyInspectionPhotoForHwpx[]; error?: string }> {
  try {
    let projectQuery = supabase
      .from('projects')
      .select('id, project_name, managing_hq, managing_branch, is_active')

    if (userProfile.role === '발주청') {
      if (!(userProfile.hq_division === '본사' && userProfile.branch_division === '본사')) {
        if (userProfile.hq_division && !userProfile.branch_division?.endsWith('본부')) {
          projectQuery = projectQuery.eq('managing_hq', userProfile.hq_division)
        }
        if (userProfile.branch_division && !userProfile.branch_division?.endsWith('본부')) {
          projectQuery = projectQuery.eq('managing_branch', userProfile.branch_division)
        }
      }
    }

    if (selectedHq) projectQuery = projectQuery.eq('managing_hq', selectedHq)
    if (selectedBranch) projectQuery = projectQuery.eq('managing_branch', selectedBranch)

    const { data: projects, error: projectError } = await projectQuery
    if (projectError) return { success: false, error: projectError.message }
    if (!projects || projects.length === 0) return { success: true, data: [] }

    const isComp = (p: any): boolean => {
      if (p.is_active === undefined || p.is_active === null) return false
      if (typeof p.is_active === 'boolean') return !p.is_active
      if (typeof p.is_active === 'object') return p.is_active.completed === true
      return false
    }
    const activeProjects = projects.filter(p => !isComp(p))
    if (activeProjects.length === 0) return { success: true, data: [] }

    const projectIds = activeProjects.map(p => p.id)
    const projectMap = new Map(activeProjects.map(p => [p.id, p]))

    let inspQuery2 = supabase
      .from('safety_inspections')
      .select('id, project_id, inspection_date, district_name, supervisor_name')
      .in('project_id', projectIds)
    if (inspectionType) inspQuery2 = inspQuery2.eq('inspection_type', inspectionType)
    const { data: inspections, error: inspError } = await inspQuery2
      .order('inspection_date', { ascending: true })

    if (inspError) return { success: false, error: inspError.message }
    if (!inspections || inspections.length === 0) return { success: true, data: [] }

    const inspectionIds = inspections.map(i => i.id)

    const { data: photos, error: photoError } = await supabase
      .from('safety_inspection_photos')
      .select('inspection_id, photo_url, sort_order')
      .in('inspection_id', inspectionIds)
      .eq('photo_type', 'site_before')
      .order('sort_order', { ascending: true })

    if (photoError) return { success: false, error: photoError.message }

    const photoMap = new Map<string, string>()
      ; (photos || []).forEach(p => {
        if (!photoMap.has(p.inspection_id)) {
          photoMap.set(p.inspection_id, p.photo_url)
        }
      })

    const data: SafetyInspectionPhotoForHwpx[] = inspections.map(ins => {
      const proj = projectMap.get(ins.project_id)
      return {
        inspection_id: ins.id,
        project_name: proj?.project_name || '',
        district_name: ins.district_name || '',
        inspection_date: ins.inspection_date || '',
        supervisor_name: ins.supervisor_name || null,
        photo_url: photoMap.get(ins.id) || null,
      }
    })

    return { success: true, data }
  } catch (error: any) {
    console.error('전경사진 조회 실패:', error)
    return { success: false, error: error.message || '데이터 조회 실패' }
  }
}

// 발주청 사용자가 볼 수 있는 안전서류 점검 현황 조회
export async function getSafeDocumentInspectionsByUserBranch(
  userProfile: UserProfile,
  quarterYear?: string, // 2025Q1 형식
  selectedHq?: string,
  selectedBranch?: string
): Promise<{ success: boolean; inspections?: SafeDocumentInspection[]; error?: string }> {
  try {
    if (DEBUG_LOGS) console.log('안전서류 점검 데이터 조회 시작:', { quarterYear, selectedHq, selectedBranch })

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
      .from('safe_document_inspections')
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
      // 본사 조직은 전사 데이터 조회 가능
      if (userProfile.hq_division === '본사' && userProfile.branch_division === '본사') {
        if (DEBUG_LOGS) console.log('✅ 본사 조직 사용자: 전사 안전서류 점검 조회')
        // query에 추가 필터링 없음 (모든 점검 조회)
      } else {
        // 본부 단위 권한이 있는 경우
        if (userProfile.hq_division && !userProfile.branch_division?.endsWith('본부')) {
          query = query.eq('projects.managing_hq', userProfile.hq_division)
        }

        // 지사 단위 권한이 있는 경우
        if (userProfile.branch_division && !userProfile.branch_division?.endsWith('본부')) {
          query = query.eq('projects.managing_branch', userProfile.branch_division)
        }
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
      console.error('안전서류 점검 조회 오류:', error)
      return { success: false, error: error.message }
    }

    // 데이터 변환
    const transformedInspections: SafeDocumentInspection[] = (inspections || []).map((item: any) => ({
      id: item.id,
      project_id: item.project_id,
      project_name: item.projects?.project_name,
      managing_hq: item.projects?.managing_hq,
      managing_branch: item.projects?.managing_branch,
      inspection_date: item.inspection_date,
      inspector_name: item.inspector_name,
      inspector_affiliation: item.inspector_affiliation,
      construction_status: item.construction_status,
      construction_cost: item.construction_cost,
      has_special_construction1: item.has_special_construction1,
      has_special_construction2: item.has_special_construction2,
      checklist_items: item.checklist_items || {},
      compliant_items: item.compliant_items || 0,
      non_compliant_items: item.non_compliant_items || 0,
      not_applicable_items: item.not_applicable_items || 0,
      created_by: item.created_by,
      created_at: item.created_at,
      updated_at: item.updated_at
    }))

    if (DEBUG_LOGS) console.log(`조회된 안전서류 점검 수: ${transformedInspections.length}`)
    return { success: true, inspections: transformedInspections }

  } catch (error: any) {
    console.error('안전서류 점검 조회 실패:', error)
    return { success: false, error: error.message || '안전서류 점검 데이터를 불러오는데 실패했습니다.' }
  }
}

// 안전서류 점검 건수만 조회 (카드 표시용 경량 쿼리)
export async function getSafeDocumentInspectionCountByUserBranch(
  userProfile: UserProfile,
  quarterYear?: string,
  selectedHq?: string,
  selectedBranch?: string
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    let startDate: string | null = null
    let endDate: string | null = null

    if (quarterYear) {
      const [year, quarter] = quarterYear.split('Q')
      const yearNum = parseInt(year)
      const quarterNum = parseInt(quarter)

      switch (quarterNum) {
        case 1: startDate = `${yearNum}-01-01`; endDate = `${yearNum}-03-31`; break
        case 2: startDate = `${yearNum}-04-01`; endDate = `${yearNum}-06-30`; break
        case 3: startDate = `${yearNum}-07-01`; endDate = `${yearNum}-09-30`; break
        case 4: startDate = `${yearNum}-10-01`; endDate = `${yearNum}-12-31`; break
      }
    }

    let query = supabase
      .from('safe_document_inspections')
      .select('id, projects!inner(managing_hq, managing_branch)', { count: 'exact', head: true })

    if (startDate && endDate) {
      query = query.gte('inspection_date', startDate).lte('inspection_date', endDate)
    }

    if (userProfile.role === '발주청') {
      if (userProfile.hq_division === '본사' && userProfile.branch_division === '본사') {
        // 전사 조회
      } else {
        if (userProfile.hq_division && !userProfile.branch_division?.endsWith('본부')) {
          query = query.eq('projects.managing_hq', userProfile.hq_division)
        }
        if (userProfile.branch_division && !userProfile.branch_division?.endsWith('본부')) {
          query = query.eq('projects.managing_branch', userProfile.branch_division)
        }
      }
    }

    if (selectedHq) {
      query = query.eq('projects.managing_hq', selectedHq)
    }
    if (selectedBranch) {
      query = query.eq('projects.managing_branch', selectedBranch)
    }

    const { count, error } = await query

    if (error) {
      return { success: false, count: 0, error: error.message }
    }

    return { success: true, count: count || 0 }
  } catch (error: any) {
    console.error('안전서류 점검 건수 조회 실패:', error)
    return { success: false, count: 0, error: error.message || '안전서류 점검 건수 조회에 실패했습니다.' }
  }
}

// ── 작업허가제(PTW) 안전현황 ──────────────────────────────
// 허가서 1건의 사인완료 여부: 종류별 필수 서명란(signRoles) 전원이 서명 이미지를 채웠는지
function isPtwFullySigned(
  permitType: PermitType,
  signatures: Record<string, { signature?: string }> | null | undefined
): boolean {
  const config = PERMIT_TYPE_CONFIGS[permitType]
  if (!config) return false
  return config.signRoles.every((role) => {
    const sig = signatures?.[role.key]
    return typeof sig?.signature === 'string' && sig.signature.trim() !== ''
  })
}

export interface PtwPermitSummary {
  id: string
  project_id: string
  project_name?: string
  managing_hq?: string
  managing_branch?: string
  permit_type: PermitType
  is_signed: boolean   // 모든 서명란 작성 완료 여부
  created_at: string
}

// PTW 허가서 목록 조회 (연도 필터, 발주청 권한 필터) — 사인완료 여부 계산 포함
export async function getPtwPermitsByUserBranch(
  userProfile: UserProfile,
  year?: number,
  selectedHq?: string,
  selectedBranch?: string
): Promise<{ success: boolean; permits?: PtwPermitSummary[]; error?: string }> {
  try {
    if (DEBUG_LOGS) console.log('작업허가제(PTW) 데이터 조회 시작:', { year, selectedHq, selectedBranch })

    // form_data(대용량 JSONB)는 제외하고 사인완료 판정에 필요한 컬럼만 select
    let query = supabase
      .from('ptw_permits')
      .select(`
        id,
        project_id,
        permit_type,
        signatures,
        created_at,
        projects!inner (
          project_name,
          managing_hq,
          managing_branch,
          is_active
        )
      `)

    // 연도 필터: 제출 시각(created_at) 기준
    if (year) {
      query = query
        .gte('created_at', `${year}-01-01`)
        .lt('created_at', `${year + 1}-01-01`)
    }

    // 발주청 권한 필터
    if (userProfile.role === '발주청') {
      if (userProfile.hq_division === '본사' && userProfile.branch_division === '본사') {
        // 전사 조회
      } else {
        if (userProfile.hq_division && !userProfile.branch_division?.endsWith('본부')) {
          query = query.eq('projects.managing_hq', userProfile.hq_division)
        }
        if (userProfile.branch_division && !userProfile.branch_division?.endsWith('본부')) {
          query = query.eq('projects.managing_branch', userProfile.branch_division)
        }
      }
    }

    if (selectedHq) {
      query = query.eq('projects.managing_hq', selectedHq)
    }
    if (selectedBranch) {
      query = query.eq('projects.managing_branch', selectedBranch)
    }

    query = query.order('created_at', { ascending: false })

    const { data, error } = await query

    if (error) {
      console.error('작업허가제(PTW) 조회 오류:', error)
      return { success: false, error: error.message }
    }

    const permits: PtwPermitSummary[] = (data || []).map((item: any) => ({
      id: item.id,
      project_id: item.project_id,
      project_name: item.projects?.project_name,
      managing_hq: item.projects?.managing_hq,
      managing_branch: item.projects?.managing_branch,
      permit_type: item.permit_type,
      is_signed: isPtwFullySigned(item.permit_type, item.signatures),
      created_at: item.created_at,
    }))

    if (DEBUG_LOGS) console.log(`조회된 작업허가제(PTW) 수: ${permits.length}`)
    return { success: true, permits }
  } catch (error: any) {
    console.error('작업허가제(PTW) 조회 실패:', error)
    return { success: false, error: error.message || '작업허가제 데이터를 불러오는데 실패했습니다.' }
  }
}

// PTW 허가서 건수만 조회 (카드 표시용 경량 쿼리)
export async function getPtwPermitCountByUserBranch(
  userProfile: UserProfile,
  year?: number,
  selectedHq?: string,
  selectedBranch?: string
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    let query = supabase
      .from('ptw_permits')
      .select('id, projects!inner(managing_hq, managing_branch)', { count: 'exact', head: true })

    if (year) {
      query = query
        .gte('created_at', `${year}-01-01`)
        .lt('created_at', `${year + 1}-01-01`)
    }

    if (userProfile.role === '발주청') {
      if (userProfile.hq_division === '본사' && userProfile.branch_division === '본사') {
        // 전사 조회
      } else {
        if (userProfile.hq_division && !userProfile.branch_division?.endsWith('본부')) {
          query = query.eq('projects.managing_hq', userProfile.hq_division)
        }
        if (userProfile.branch_division && !userProfile.branch_division?.endsWith('본부')) {
          query = query.eq('projects.managing_branch', userProfile.branch_division)
        }
      }
    }

    if (selectedHq) {
      query = query.eq('projects.managing_hq', selectedHq)
    }
    if (selectedBranch) {
      query = query.eq('projects.managing_branch', selectedBranch)
    }

    const { count, error } = await query

    if (error) {
      return { success: false, count: 0, error: error.message }
    }

    return { success: true, count: count || 0 }
  } catch (error: any) {
    console.error('작업허가제(PTW) 건수 조회 실패:', error)
    return { success: false, count: 0, error: error.message || '작업허가제 건수 조회에 실패했습니다.' }
  }
}

// 자급자재 등록 건수 조회 (프로젝트별)
export interface MaterialCountByProject {
  project_id: string
  project_name: string
  managing_hq: string
  managing_branch: string
  material_count: number
}

export async function getMaterialCountsByUserBranch(
  userProfile: UserProfile,
  selectedHq?: string,
  selectedBranch?: string
): Promise<{ success: boolean; materialCounts?: MaterialCountByProject[]; error?: string }> {
  try {
    if (DEBUG_LOGS) console.log('자급자재 등록현황 조회 시작:', { selectedHq, selectedBranch })

    let projectQuery = supabase
      .from('projects')
      .select('id, project_name, managing_hq, managing_branch, is_active')

    if (userProfile.role === '발주청') {
      if (userProfile.hq_division === '본사' && userProfile.branch_division === '본사') {
        if (DEBUG_LOGS) console.log('✅ 본사 조직 사용자: 전사 자급자재 현황 조회')
      } else {
        if (userProfile.hq_division && !userProfile.branch_division?.endsWith('본부')) {
          projectQuery = projectQuery.eq('managing_hq', userProfile.hq_division)
        }
        if (userProfile.branch_division && !userProfile.branch_division?.endsWith('본부')) {
          projectQuery = projectQuery.eq('managing_branch', userProfile.branch_division)
        }
      }
    }

    if (selectedHq) {
      projectQuery = projectQuery.eq('managing_hq', selectedHq)
    }
    if (selectedBranch) {
      projectQuery = projectQuery.eq('managing_branch', selectedBranch)
    }

    const { data: projects, error: projectError } = await projectQuery

    if (projectError) {
      console.error('프로젝트 조회 오류:', projectError)
      return { success: false, error: projectError.message }
    }

    if (!projects || projects.length === 0) {
      return { success: true, materialCounts: [] }
    }

    const isCompletedProject = (p: any): boolean => {
      if (p.is_active === undefined || p.is_active === null) return false
      if (typeof p.is_active === 'boolean') return !p.is_active
      if (typeof p.is_active === 'object') return p.is_active.completed === true
      return false
    }
    const activeProjects = projects.filter(p => !isCompletedProject(p))

    if (activeProjects.length === 0) {
      return { success: true, materialCounts: [] }
    }

    const projectIds = activeProjects.map(p => p.id)

    // materials 테이블에서 프로젝트별 건수 집계
    const { data: materials, error: materialError } = await supabase
      .from('materials')
      .select('project_id')
      .in('project_id', projectIds)

    if (materialError) {
      console.error('자급자재 조회 오류:', materialError)
      return { success: false, error: materialError.message }
    }

    // 프로젝트별 건수 집계
    const countMap = new Map<string, number>()
      ; (materials || []).forEach(m => {
        countMap.set(m.project_id, (countMap.get(m.project_id) || 0) + 1)
      })

    const materialCounts: MaterialCountByProject[] = activeProjects.map(p => ({
      project_id: p.id,
      project_name: p.project_name,
      managing_hq: p.managing_hq,
      managing_branch: p.managing_branch,
      material_count: countMap.get(p.id) || 0,
    }))

    if (DEBUG_LOGS) console.log(`자급자재 등록현황 조회 완료: ${materialCounts.length}개 프로젝트`)
    return { success: true, materialCounts }

  } catch (error: any) {
    console.error('자급자재 등록현황 조회 실패:', error)
    return { success: false, error: error.message || '자급자재 데이터를 불러오는데 실패했습니다.' }
  }
}

export interface InspectionRequestCountByProject {
  project_id: string
  project_name: string
  managing_hq: string
  managing_branch: string
  inspection_count: number
}

// 사용자 권한/선택 본부·지사 범위의 프로젝트별 검사·검측(검측요청서) 등록 건수를 집계한다.
export async function getInspectionRequestCountsByUserBranch(
  userProfile: UserProfile,
  selectedHq?: string,
  selectedBranch?: string
): Promise<{ success: boolean; inspectionCounts?: InspectionRequestCountByProject[]; error?: string }> {
  try {
    if (DEBUG_LOGS) console.log('검사/검측 등록현황 조회 시작:', { selectedHq, selectedBranch })

    let projectQuery = supabase
      .from('projects')
      .select('id, project_name, managing_hq, managing_branch, is_active')

    if (userProfile.role === '발주청') {
      if (userProfile.hq_division === '본사' && userProfile.branch_division === '본사') {
        if (DEBUG_LOGS) console.log('✅ 본사 조직 사용자: 전사 검사/검측 현황 조회')
      } else {
        if (userProfile.hq_division && !userProfile.branch_division?.endsWith('본부')) {
          projectQuery = projectQuery.eq('managing_hq', userProfile.hq_division)
        }
        if (userProfile.branch_division && !userProfile.branch_division?.endsWith('본부')) {
          projectQuery = projectQuery.eq('managing_branch', userProfile.branch_division)
        }
      }
    }

    if (selectedHq) {
      projectQuery = projectQuery.eq('managing_hq', selectedHq)
    }
    if (selectedBranch) {
      projectQuery = projectQuery.eq('managing_branch', selectedBranch)
    }

    const { data: projects, error: projectError } = await projectQuery

    if (projectError) {
      console.error('프로젝트 조회 오류:', projectError)
      return { success: false, error: projectError.message }
    }

    if (!projects || projects.length === 0) {
      return { success: true, inspectionCounts: [] }
    }

    const isCompletedProject = (p: any): boolean => {
      if (p.is_active === undefined || p.is_active === null) return false
      if (typeof p.is_active === 'boolean') return !p.is_active
      if (typeof p.is_active === 'object') return p.is_active.completed === true
      return false
    }
    const activeProjects = projects.filter(p => !isCompletedProject(p))

    if (activeProjects.length === 0) {
      return { success: true, inspectionCounts: [] }
    }

    const projectIds = activeProjects.map(p => p.id)

    // inspection_requests 테이블에서 프로젝트별 건수 집계
    const { data: requests, error: requestError } = await supabase
      .from('inspection_requests')
      .select('project_id')
      .in('project_id', projectIds)

    if (requestError) {
      console.error('검사/검측 조회 오류:', requestError)
      return { success: false, error: requestError.message }
    }

    // 프로젝트별 건수 집계
    const countMap = new Map<string, number>()
      ; (requests || []).forEach(r => {
        countMap.set(r.project_id, (countMap.get(r.project_id) || 0) + 1)
      })

    const inspectionCounts: InspectionRequestCountByProject[] = activeProjects.map(p => ({
      project_id: p.id,
      project_name: p.project_name,
      managing_hq: p.managing_hq,
      managing_branch: p.managing_branch,
      inspection_count: countMap.get(p.id) || 0,
    }))

    if (DEBUG_LOGS) console.log(`검사/검측 등록현황 조회 완료: ${inspectionCounts.length}개 프로젝트`)
    return { success: true, inspectionCounts }

  } catch (error: any) {
    console.error('검사/검측 등록현황 조회 실패:', error)
    return { success: false, error: error.message || '검사/검측 데이터를 불러오는데 실패했습니다.' }
  }
}

export interface QualityTestCountByProject {
  project_id: string
  project_name: string
  managing_hq: string
  managing_branch: string
  test_count: number
  verification_count: number
  summary_count: number
  test_supervisor_unsigned_count: number
  verification_supervisor_unsigned_count: number
  hq_unsigned_count: number
}

// 사용자 권한/선택 본부·지사 범위의 프로젝트별 품질시험 3종 서류 등록 건수를 집계한다.
export async function getQualityTestCountsByUserBranch(
  userProfile: UserProfile,
  selectedHq?: string,
  selectedBranch?: string
): Promise<{ success: boolean; testCounts?: QualityTestCountByProject[]; error?: string }> {
  try {
    if (DEBUG_LOGS) console.log('품질시험 실시대장 등록현황 조회 시작:', { selectedHq, selectedBranch })

    let projectQuery = supabase
      .from('projects')
      .select('id, project_name, managing_hq, managing_branch, is_active')

    if (userProfile.role === '발주청') {
      if (userProfile.hq_division === '본사' && userProfile.branch_division === '본사') {
        if (DEBUG_LOGS) console.log('✅ 본사 조직 사용자: 전사 품질시험 현황 조회')
      } else {
        if (userProfile.hq_division && !userProfile.branch_division?.endsWith('본부')) {
          projectQuery = projectQuery.eq('managing_hq', userProfile.hq_division)
        }
        if (userProfile.branch_division && !userProfile.branch_division?.endsWith('본부')) {
          projectQuery = projectQuery.eq('managing_branch', userProfile.branch_division)
        }
      }
    }

    if (selectedHq) {
      projectQuery = projectQuery.eq('managing_hq', selectedHq)
    }
    if (selectedBranch) {
      projectQuery = projectQuery.eq('managing_branch', selectedBranch)
    }

    const { data: projects, error: projectError } = await projectQuery

    if (projectError) {
      console.error('프로젝트 조회 오류:', projectError)
      return { success: false, error: projectError.message }
    }

    if (!projects || projects.length === 0) {
      return { success: true, testCounts: [] }
    }

    const isCompletedProject = (p: any): boolean => {
      if (p.is_active === undefined || p.is_active === null) return false
      if (typeof p.is_active === 'boolean') return !p.is_active
      if (typeof p.is_active === 'object') return p.is_active.completed === true
      return false
    }
    const activeProjects = projects.filter(p => !isCompletedProject(p))

    if (activeProjects.length === 0) {
      return { success: true, testCounts: [] }
    }

    const projectIds = activeProjects.map(p => p.id)

    const [
      recordResult,
      verificationResult,
      summaryResult,
      testSupervisorUnsignedResult,
      verificationSupervisorUnsignedResult,
      hqUnsignedResult,
    ] = await Promise.all([
      supabase
        .from('quality_test_records')
        .select('project_id')
        .in('project_id', projectIds),
      supabase
        .from('quality_verification_requests')
        .select('project_id')
        .in('project_id', projectIds),
      supabase
        .from('quality_summary_reports')
        .select('project_id')
        .in('project_id', projectIds),
      supabase
        .from('quality_test_records')
        .select('project_id')
        .in('project_id', projectIds)
        .or('supervision_engineer_signature.is.null,supervision_engineer_signature.eq.'),
      supabase
        .from('quality_verification_requests')
        .select('project_id')
        .in('project_id', projectIds)
        .or('sender_signature.is.null,sender_signature.eq.'),
      supabase
        .from('quality_summary_reports')
        .select('project_id')
        .in('project_id', projectIds)
        .or('confirmer_signature.is.null,confirmer_signature.eq.'),
    ])

    if (
      recordResult.error ||
      verificationResult.error ||
      summaryResult.error ||
      testSupervisorUnsignedResult.error ||
      verificationSupervisorUnsignedResult.error ||
      hqUnsignedResult.error
    ) {
      const queryError = recordResult.error ||
        verificationResult.error ||
        summaryResult.error ||
        testSupervisorUnsignedResult.error ||
        verificationSupervisorUnsignedResult.error ||
        hqUnsignedResult.error
      console.error('품질시험 서류 조회 오류:', queryError)
      return { success: false, error: queryError?.message }
    }

    const buildCountMap = (rows: { project_id: string }[] | null) => {
      const countMap = new Map<string, number>()
      ; (rows || []).forEach(row => {
        countMap.set(row.project_id, (countMap.get(row.project_id) || 0) + 1)
      })
      return countMap
    }

    const testCountMap = buildCountMap(recordResult.data)
    const verificationCountMap = buildCountMap(verificationResult.data)
    const summaryCountMap = buildCountMap(summaryResult.data)
    const testSupervisorUnsignedCountMap = buildCountMap(testSupervisorUnsignedResult.data)
    const verificationSupervisorUnsignedCountMap = buildCountMap(verificationSupervisorUnsignedResult.data)
    const hqUnsignedCountMap = buildCountMap(hqUnsignedResult.data)

    const testCounts: QualityTestCountByProject[] = activeProjects.map(p => ({
      project_id: p.id,
      project_name: p.project_name,
      managing_hq: p.managing_hq,
      managing_branch: p.managing_branch,
      test_count: testCountMap.get(p.id) || 0,
      verification_count: verificationCountMap.get(p.id) || 0,
      summary_count: summaryCountMap.get(p.id) || 0,
      test_supervisor_unsigned_count: testSupervisorUnsignedCountMap.get(p.id) || 0,
      verification_supervisor_unsigned_count: verificationSupervisorUnsignedCountMap.get(p.id) || 0,
      hq_unsigned_count: hqUnsignedCountMap.get(p.id) || 0,
    }))

    if (DEBUG_LOGS) console.log(`품질시험 서류 등록현황 조회 완료: ${testCounts.length}개 프로젝트`)
    return { success: true, testCounts }

  } catch (error: any) {
    console.error('품질시험 실시대장 등록현황 조회 실패:', error)
    return { success: false, error: error.message || '품질시험 데이터를 불러오는데 실패했습니다.' }
  }
}

export interface QualityReportStatusByProject {
  project_id: string
  project_name: string
  managing_hq: string
  managing_branch: string
  report_count: number // 누적 제출 건수
  current_month_submitted: boolean // 이번 달 보고서 제출 여부
  latest_report_label: string // 최근 제출 연월 표시 (예: '26.07'), 없으면 ''
  submitted_year_months: string[] // 제출 연월 목록 (YYYY-MM)
}

// 사용자 권한/선택 본부·지사 범위의 프로젝트별 품질시험 월례보고서 제출 현황을 집계한다.
export async function getQualityMonthlyReportStatusByUserBranch(
  userProfile: UserProfile,
  selectedHq?: string,
  selectedBranch?: string
): Promise<{ success: boolean; reportStatuses?: QualityReportStatusByProject[]; error?: string }> {
  try {
    if (DEBUG_LOGS) console.log('품질시험 월례보고서 제출현황 조회 시작:', { selectedHq, selectedBranch })

    let projectQuery = supabase
      .from('projects')
      .select('id, project_name, managing_hq, managing_branch, is_active')

    if (userProfile.role === '발주청') {
      if (userProfile.hq_division === '본사' && userProfile.branch_division === '본사') {
        if (DEBUG_LOGS) console.log('✅ 본사 조직 사용자: 전사 품질시험 월례보고서 현황 조회')
      } else {
        if (userProfile.hq_division && !userProfile.branch_division?.endsWith('본부')) {
          projectQuery = projectQuery.eq('managing_hq', userProfile.hq_division)
        }
        if (userProfile.branch_division && !userProfile.branch_division?.endsWith('본부')) {
          projectQuery = projectQuery.eq('managing_branch', userProfile.branch_division)
        }
      }
    }

    if (selectedHq) {
      projectQuery = projectQuery.eq('managing_hq', selectedHq)
    }
    if (selectedBranch) {
      projectQuery = projectQuery.eq('managing_branch', selectedBranch)
    }

    const { data: projects, error: projectError } = await projectQuery

    if (projectError) {
      console.error('프로젝트 조회 오류:', projectError)
      return { success: false, error: projectError.message }
    }

    if (!projects || projects.length === 0) {
      return { success: true, reportStatuses: [] }
    }

    const isCompletedProject = (p: any): boolean => {
      if (p.is_active === undefined || p.is_active === null) return false
      if (typeof p.is_active === 'boolean') return !p.is_active
      if (typeof p.is_active === 'object') return p.is_active.completed === true
      return false
    }
    const activeProjects = projects.filter(p => !isCompletedProject(p))

    if (activeProjects.length === 0) {
      return { success: true, reportStatuses: [] }
    }

    const projectIds = activeProjects.map(p => p.id)

    // quality_monthly_reports에서 프로젝트별 제출 연월 조회
    const { data: reports, error: reportError } = await supabase
      .from('quality_monthly_reports')
      .select('project_id, report_year, report_month')
      .in('project_id', projectIds)

    if (reportError) {
      console.error('품질시험 월례보고서 조회 오류:', reportError)
      return { success: false, error: reportError.message }
    }

    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth() + 1

    // 프로젝트별 집계: 누적 건수, 이번 달 제출 여부, 최근 제출 연월
    const statMap = new Map<string, { count: number; currentSubmitted: boolean; latestYm: number; submittedYearMonths: Set<string> }>()
    ;(reports || []).forEach((r: any) => {
      const existing = statMap.get(r.project_id) || {
        count: 0,
        currentSubmitted: false,
        latestYm: 0,
        submittedYearMonths: new Set<string>(),
      }
      existing.count += 1
      if (r.report_year === currentYear && r.report_month === currentMonth) {
        existing.currentSubmitted = true
      }
      const ym = r.report_year * 100 + r.report_month
      if (ym > existing.latestYm) existing.latestYm = ym
      existing.submittedYearMonths.add(`${r.report_year}-${String(r.report_month).padStart(2, '0')}`)
      statMap.set(r.project_id, existing)
    })

    const reportStatuses: QualityReportStatusByProject[] = activeProjects.map(p => {
      const stat = statMap.get(p.id)
      return {
        project_id: p.id,
        project_name: p.project_name,
        managing_hq: p.managing_hq,
        managing_branch: p.managing_branch,
        report_count: stat?.count || 0,
        current_month_submitted: stat?.currentSubmitted || false,
        latest_report_label: stat && stat.latestYm > 0
          ? `${String(Math.floor(stat.latestYm / 100)).slice(-2)}.${String(stat.latestYm % 100).padStart(2, '0')}`
          : '',
        submitted_year_months: stat ? Array.from(stat.submittedYearMonths).sort() : [],
      }
    })

    if (DEBUG_LOGS) console.log(`품질시험 월례보고서 제출현황 조회 완료: ${reportStatuses.length}개 프로젝트`)
    return { success: true, reportStatuses }

  } catch (error: any) {
    console.error('품질시험 월례보고서 제출현황 조회 실패:', error)
    return { success: false, error: error.message || '품질시험 월례보고서 데이터를 불러오는데 실패했습니다.' }
  }
}

// ===== 프로젝트 공유 기능 =====

export interface ProjectShare {
  id: string
  project_id: string
  shared_with: string
  shared_by: string
  created_at: string
  user_profiles?: {
    full_name: string
    email: string
    company_name?: string
  }
}

// 공유받은 프로젝트 목록 조회
export async function getSharedProjects(): Promise<{ success: boolean; projects?: Project[]; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: '로그인이 필요합니다.' }

    const { data: shares, error: sharesError } = await supabase
      .from('project_shares')
      .select('project_id')
      .eq('shared_with', user.id)

    if (sharesError) {
      console.error('Get shared projects error:', sharesError)
      return { success: false, error: '공유 프로젝트 조회에 실패했습니다.' }
    }

    if (!shares || shares.length === 0) {
      return { success: true, projects: [] }
    }

    const projectIds = shares.map(s => s.project_id)
    const { data: projects, error: projectsError } = await supabase
      .from('projects')
      .select('*')
      .in('id', projectIds)
      .order('created_at', { ascending: false })

    if (projectsError) {
      console.error('Get shared projects data error:', projectsError)
      return { success: false, error: '공유 프로젝트 데이터 조회에 실패했습니다.' }
    }

    return { success: true, projects: projects || [] }
  } catch (error) {
    console.error('Get shared projects error:', error)
    return { success: false, error: '공유 프로젝트 조회 중 오류가 발생했습니다.' }
  }
}

// 프로젝트 공유 (이메일로 대상자 지정)
export async function shareProject(projectId: string, recipientEmail: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: '로그인이 필요합니다.' }

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
      return { success: false, error: '본인에게 공유할 수 없습니다.' }
    }

    // 공유 레코드 생성
    const { error: insertError } = await supabase
      .from('project_shares')
      .insert({
        project_id: projectId,
        shared_with: recipient.id,
        shared_by: user.id
      })

    if (insertError) {
      if (insertError.code === '23505') {
        return { success: false, error: '이미 해당 사용자에게 공유되어 있습니다.' }
      }
      console.error('Share project error:', insertError)
      return { success: false, error: '프로젝트 공유에 실패했습니다.' }
    }

    return { success: true }
  } catch (error) {
    console.error('Share project error:', error)
    return { success: false, error: '프로젝트 공유 중 오류가 발생했습니다.' }
  }
}

// 프로젝트의 공유 목록 조회 (유저 정보 포함)
export async function getProjectShares(projectId: string): Promise<{ success: boolean; shares?: ProjectShare[]; error?: string }> {
  try {
    const { data: shares, error } = await supabase
      .from('project_shares')
      .select(`
        id,
        project_id,
        shared_with,
        shared_by,
        created_at,
        user_profiles!project_shares_shared_with_fkey (
          full_name,
          email,
          company_name
        )
      `)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Get project shares error:', error)
      return { success: false, error: '공유 목록 조회에 실패했습니다.' }
    }

    return { success: true, shares: (shares || []) as unknown as ProjectShare[] }
  } catch (error) {
    console.error('Get project shares error:', error)
    return { success: false, error: '공유 목록 조회 중 오류가 발생했습니다.' }
  }
}

// 공유 취소
export async function revokeProjectShare(shareId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('project_shares')
      .delete()
      .eq('id', shareId)

    if (error) {
      console.error('Revoke project share error:', error)
      return { success: false, error: '공유 취소에 실패했습니다.' }
    }

    return { success: true }
  } catch (error) {
    console.error('Revoke project share error:', error)
    return { success: false, error: '공유 취소 중 오류가 발생했습니다.' }
  }
}

// 본부 소속 프로젝트들의 actual_work_address를 최신 TBM 주소로 일괄 업데이트
export async function bulkUpdateActualWorkAddress(hqDivision: string): Promise<{
  success: boolean
  tbmCount: number
  fallbackCount: number
  totalCount: number
  error?: string
}> {
  try {
    const { data, error } = await supabase
      .rpc('bulk_update_actual_work_address', { hq_division: hqDivision })

    if (error) {
      console.error('Bulk update address error:', error)
      return { success: false, tbmCount: 0, fallbackCount: 0, totalCount: 0, error: error.message }
    }

    return {
      success: true,
      tbmCount: data.tbm_count,
      fallbackCount: data.fallback_count,
      totalCount: data.total_count,
    }
  } catch (error) {
    console.error('Bulk update address error:', error)
    return { success: false, tbmCount: 0, fallbackCount: 0, totalCount: 0, error: '주소 업데이트 중 오류가 발생했습니다.' }
  }
}
