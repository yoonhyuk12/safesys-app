// TBM 관련 API 호출 함수들

import { supabase } from './supabase'

// 구글 시트 TBM API URL (폴백용)
const TBM_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwxu_6kwZ2aoM36G4yS_O6BdplhnHI6CNBIV60dszuIr0HsZf8DPtJKZFGIlTAfX7B2ZQ/exec'

// Supabase 사용 여부 (true: Supabase, false: 구글 시트)
const USE_SUPABASE = true

export interface TBMRecord {
  id: string
  project_id: string
  project_name: string
  managing_hq: string
  managing_branch: string
  meeting_date: string
  meeting_time: string
  attendees: string
  topics: string[]
  location: string
  leader: string
  created_at: string
  latitude?: number
  longitude?: number
  status: string
  duration: number
  construction_company: string
  today_work: string
  risk_work_type?: string
  cctv_usage?: string
  equipment_input?: string
  education_content?: string
  contact?: string
  new_workers?: string
  personnel_total_count?: number
  education_photo_url?: string
}

export interface TBMStats {
  totalTBM: number
  totalAttendees: number
  totalProjects: number
  averageDuration: number
  riskWorkTypes: number
  totalCount?: number
  totalWorkers?: number
  newWorkers?: number
  byHq?: Array<{ hq: string; total: number; workers: number; newWorkers: number }>
  byBranch?: Array<{ hq: string; branch: string; total: number; workers: number; newWorkers: number }>
}

export interface TBMResponse {
  success: boolean
  records?: TBMRecord[]
  total?: number
  message?: string
}

export interface TBMStatsResponse {
  success: boolean
  stats?: TBMStats
  message?: string
}

/**
 * TBM 기록을 조회합니다 (Supabase 또는 구글 시트)
 */
export async function getTBMRecords(
  date: string,
  hq?: string,
  branch?: string
): Promise<TBMResponse> {
  // Supabase에서 조회
  if (USE_SUPABASE) {
    try {
      console.log('TBM Supabase 조회:', date, hq, branch)
      
      let query = supabase
        .from('tbm_submissions')
        .select('*')
        .eq('meeting_date', date)
        .eq('status', 'submitted')          // 최종 제출만 조회
        .not('today_work', 'is', null)
        .neq('today_work', '작업없음')

      if (hq) query = query.eq('headquarters', hq)
      if (branch) query = query.eq('branch', branch)

      const { data, error } = await query.order('submitted_at', { ascending: false })
      
      if (error) {
        console.error('Supabase 조회 오류:', error)
        throw error
      }
      
      // Supabase 데이터를 TBMRecord 형식으로 변환
      const records: TBMRecord[] = (data || []).map(item => ({
        id: item.id,
        project_id: item.project_id || '',
        project_name: item.project_name || '',
        managing_hq: item.headquarters || '',
        managing_branch: item.branch || '',
        meeting_date: item.meeting_date,
        meeting_time: item.education_start_time || '',
        attendees: item.personnel_count || '',
        topics: [],
        location: item.address || '',
        leader: item.reporter_name || '',
        created_at: item.created_at,
        latitude: item.latitude ? parseFloat(item.latitude) : undefined,
        longitude: item.longitude ? parseFloat(item.longitude) : undefined,
        status: '완료',
        duration: item.education_duration || 0,
        construction_company: item.construction_company || '',
        today_work: item.today_work || '',
        risk_work_type: item.risk_work_type,
        cctv_usage: item.cctv_usage,
        equipment_input: item.equipment_input,
        education_content: item.other_remarks,
        contact: item.reporter_contact,
        new_workers: item.new_worker_count != null ? String(item.new_worker_count) : undefined,
        personnel_total_count: typeof item.personnel_total_count === 'number' ? item.personnel_total_count : undefined,
        education_photo_url: item.education_photo_url || undefined
      }))
      
      console.log('TBM Supabase 조회 완료:', records.length, '건')
      
      return {
        success: true,
        records: records,
        total: records.length
      }
    } catch (error) {
      console.error('TBM Supabase 조회 실패:', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.'
      }
    }
  }
  
  // 구글 시트에서 조회 (폴백)
  try {
    const params = new URLSearchParams({
      action: 'getTBMRecords',
      date: date
    })
    
    if (hq) params.append('hq', hq)
    if (branch) params.append('branch', branch)
    
    console.log('TBM API 호출:', `${TBM_SCRIPT_URL}?${params}`)
    
    const response = await fetch(`${TBM_SCRIPT_URL}?${params}`, {
      method: 'GET',
      mode: 'cors',
      cache: 'no-cache'
    })
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const data = await response.json()
    console.log('TBM API 응답:', data)
    
    return data
  } catch (error) {
    console.error('TBM 기록 조회 실패:', error)
    return {
      success: false,
      message: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.'
    }
  }
}

/**
 * TBM 통계를 조회합니다 (Supabase 또는 구글 시트)
 */
// 당해년도 본부·지사별 누적 투입인원/신규인원 집계 결과
export interface YearlyPersonnelTotals {
  byHq: Map<string, { total: number; newWorkers: number }>           // key: 본부명
  byBranch: Map<string, { total: number; newWorkers: number }>       // key: `${본부}||${지사}`
}

// 연초부터 기준일(asOfDate, YYYY-MM-DD)까지 제출된 TBM에서 본부·지사별 누적 투입인원·신규인원을 합산한다.
export async function getYearlyPersonnelByOrg(asOfDate: string): Promise<YearlyPersonnelTotals> {
  const byHq = new Map<string, { total: number; newWorkers: number }>()
  const byBranch = new Map<string, { total: number; newWorkers: number }>()
  if (!USE_SUPABASE || !asOfDate) return { byHq, byBranch }

  // 연초 ~ 기준일까지 누적 (과거 일자를 선택하면 그 날짜 기준으로 집계)
  const start = `${asOfDate.slice(0, 4)}-01-01`
  const end = asOfDate
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('tbm_submissions')
      .select('headquarters, branch, personnel_total_count, new_worker_count')
      .eq('status', 'submitted')
      .neq('today_work', '작업없음')
      .gte('meeting_date', start)
      .lte('meeting_date', end)
      .order('id', { ascending: true }) // 페이지 간 행 중복/누락 방지(안정 정렬)
      .range(from, from + pageSize - 1)

    if (error) {
      console.error('당해년도 투입인원 집계 조회 오류:', error)
      break
    }
    if (!data || data.length === 0) break

    for (const row of data) {
      const hq = row.headquarters || ''
      const branch = row.branch || ''
      const total = typeof row.personnel_total_count === 'number' ? row.personnel_total_count : 0
      const newWorkers = typeof row.new_worker_count === 'number' ? row.new_worker_count : 0

      if (hq) {
        const h = byHq.get(hq) || { total: 0, newWorkers: 0 }
        h.total += total
        h.newWorkers += newWorkers
        byHq.set(hq, h)
      }
      if (hq && branch) {
        const key = `${hq}||${branch}`
        const b = byBranch.get(key) || { total: 0, newWorkers: 0 }
        b.total += total
        b.newWorkers += newWorkers
        byBranch.set(key, b)
      }
    }
    if (data.length < pageSize) break
  }

  return { byHq, byBranch }
}

// 프로젝트별 상시근로자를 본부·지사·프로젝트로 합산한 결과
export interface RegularWorkerTotals {
  byHq: Map<string, number>       // key: 본부명
  byBranch: Map<string, number>   // key: `${본부}||${지사}`
  byProject: Map<string, number>  // key: project_id
  unregisteredByBranch: Map<string, number> // key: `${본부}||${지사}` — 프로젝트 미등록 현장분만
}

// 프로젝트별 상시근로자 = (기간 누적 투입인원) ÷ (그 프로젝트의 TBM 제출일수, distinct meeting_date).
// 제출일수가 프로젝트마다 달라 단일 분모로 나눌 수 없으므로, 프로젝트 단위로 구한 뒤 지사·본부로 더한다.
// startDate 생략 시 기준일 연도의 1/1부터(당해년도 기준) 집계한다. getYearlyPersonnelByOrg와
// 동일한 필터(submitted, 작업없음 제외)로 분자·분모를 같은 행 집합에서 산출한다.
export async function getRegularWorkersByOrg(asOfDate: string, startDate?: string): Promise<RegularWorkerTotals> {
  const byHq = new Map<string, number>()
  const byBranch = new Map<string, number>()
  const byProject = new Map<string, number>()
  const unregisteredByBranch = new Map<string, number>()
  if (!USE_SUPABASE || !asOfDate) return { byHq, byBranch, byProject, unregisteredByBranch }

  const start = startDate || `${asOfDate.slice(0, 4)}-01-01`
  const end = asOfDate
  const pageSize = 1000

  // 프로젝트별 누적인원(total)·제출일(distinct meeting_date) 집계
  const perProject = new Map<string, { projectId: string | null; hq: string; branch: string; total: number; dates: Set<string> }>()

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('tbm_submissions')
      .select('project_id, project_name, headquarters, branch, personnel_total_count, meeting_date')
      .eq('status', 'submitted')
      .neq('today_work', '작업없음')
      .gte('meeting_date', start)
      .lte('meeting_date', end)
      .order('id', { ascending: true }) // 페이지 간 행 중복/누락 방지(안정 정렬)
      .range(from, from + pageSize - 1)

    if (error) {
      console.error('상시근로자 집계 조회 오류:', error)
      break
    }
    if (!data || data.length === 0) break

    for (const row of data) {
      const hq = row.headquarters || ''
      const branch = row.branch || ''
      if (!hq) continue
      const projectId = typeof row.project_id === 'string' && row.project_id ? row.project_id : null
      const key = projectId || `${hq}||${branch}||${row.project_name || ''}`
      const total = typeof row.personnel_total_count === 'number' ? row.personnel_total_count : 0
      const entry = perProject.get(key) || { projectId, hq, branch, total: 0, dates: new Set<string>() }
      entry.total += total
      if (row.meeting_date) entry.dates.add(row.meeting_date)
      perProject.set(key, entry)
    }
    if (data.length < pageSize) break
  }

  // 프로젝트별 상시근로자를 지사·본부로 합산
  perProject.forEach(({ projectId, hq, branch, total, dates }) => {
    const days = dates.size
    if (days === 0) return
    const regular = total / days
    byHq.set(hq, (byHq.get(hq) || 0) + regular)
    if (branch) {
      const bkey = `${hq}||${branch}`
      byBranch.set(bkey, (byBranch.get(bkey) || 0) + regular)
    }
    if (projectId) {
      byProject.set(projectId, (byProject.get(projectId) || 0) + regular)
    } else {
      const ukey = `${hq}||${branch}`
      unregisteredByBranch.set(ukey, (unregisteredByBranch.get(ukey) || 0) + regular)
    }
  })

  return { byHq, byBranch, byProject, unregisteredByBranch }
}

export async function getTBMStats(
  date: string,
  hq?: string,
  branch?: string
): Promise<TBMStatsResponse> {
  // Supabase에서 통계 계산
  if (USE_SUPABASE) {
    try {
      console.log('TBM Supabase 통계 조회:', date, hq, branch)
      
      let query = supabase
        .from('tbm_submissions')
        .select('headquarters, branch, project_name, new_worker_count, personnel_count')
        .eq('meeting_date', date)
        .eq('status', 'submitted')          // 최종 제출만 통계
        .not('today_work', 'is', null)
        .neq('today_work', '작업없음')

      if (hq) query = query.eq('headquarters', hq)
      if (branch) query = query.eq('branch', branch)

      const { data, error } = await query
      
      if (error) {
        console.error('Supabase 통계 조회 오류:', error)
        throw error
      }
      
      const records = data || []
      
      // 통계 계산
      const totalCount = records.length
      let totalWorkers = 0
      let newWorkers = 0
      
      records.forEach(r => {
        // personnel_count 파싱 (예: "5명", "10")
        if (r.personnel_count) {
          const match = String(r.personnel_count).match(/(\d+)/)
          if (match) totalWorkers += parseInt(match[1], 10)
        }
        // new_worker_count
        if (r.new_worker_count) {
          newWorkers += r.new_worker_count
        }
      })
      
      // 본부별/지사별 통계 계산
      const hqMap = new Map<string, { total: number; workers: number; newWorkers: number }>()
      const branchMap = new Map<string, { hq: string; total: number; workers: number; newWorkers: number }>()
      
      records.forEach(r => {
        const hqName = r.headquarters || '미지정'
        const branchName = r.branch || '미지정'
        
        // 본부별 집계
        if (!hqMap.has(hqName)) {
          hqMap.set(hqName, { total: 0, workers: 0, newWorkers: 0 })
        }
        const hqStat = hqMap.get(hqName)!
        hqStat.total++
        if (r.personnel_count) {
          const match = String(r.personnel_count).match(/(\d+)/)
          if (match) hqStat.workers += parseInt(match[1], 10)
        }
        if (r.new_worker_count) hqStat.newWorkers += r.new_worker_count
        
        // 지사별 집계
        if (!branchMap.has(branchName)) {
          branchMap.set(branchName, { hq: hqName, total: 0, workers: 0, newWorkers: 0 })
        }
        const branchStat = branchMap.get(branchName)!
        branchStat.total++
        if (r.personnel_count) {
          const match = String(r.personnel_count).match(/(\d+)/)
          if (match) branchStat.workers += parseInt(match[1], 10)
        }
        if (r.new_worker_count) branchStat.newWorkers += r.new_worker_count
      })
      
      const byHq = Array.from(hqMap.entries()).map(([name, stat]) => ({
        hq: name,
        total: stat.total,
        workers: stat.workers,
        newWorkers: stat.newWorkers
      }))
      
      const byBranch = Array.from(branchMap.entries()).map(([name, stat]) => ({
        hq: stat.hq,
        branch: name,
        total: stat.total,
        workers: stat.workers,
        newWorkers: stat.newWorkers
      }))
      
      console.log('TBM Supabase 통계 완료:', { totalCount, totalWorkers, newWorkers })
      
      return {
        success: true,
        stats: {
          totalTBM: totalCount,
          totalAttendees: totalWorkers,
          totalProjects: new Set(records.map(record => record.project_name)).size,
          averageDuration: 0,
          riskWorkTypes: 0,
          totalCount,
          totalWorkers,
          newWorkers,
          byHq,
          byBranch
        }
      }
    } catch (error) {
      console.error('TBM Supabase 통계 조회 실패:', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.'
      }
    }
  }
  
  // 구글 시트에서 조회 (폴백)
  try {
    const params = new URLSearchParams({
      action: 'getTBMStats',
      date: date
    })
    
    if (hq) params.append('hq', hq)
    if (branch) params.append('branch', branch)
    
    console.log('TBM 통계 API 호출:', `${TBM_SCRIPT_URL}?${params}`)
    
    const response = await fetch(`${TBM_SCRIPT_URL}?${params}`, {
      method: 'GET',
      mode: 'cors',
      cache: 'no-cache'
    })
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const data = await response.json()
    console.log('TBM 통계 API 응답:', data)
    
    return data
  } catch (error) {
    console.error('TBM 통계 조회 실패:', error)
    return {
      success: false,
      message: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.'
    }
  }
}

/**
 * 개발 환경에서 사용할 모의 TBM 데이터
 */
export function getMockTBMRecords(date: string): TBMRecord[] {
  return [
    {
      id: 'tbm_1',
      project_id: 'proj_1',
      project_name: '강남 아파트 건설',
      managing_hq: '서울본부',
      managing_branch: '강남지사',
      meeting_date: date,
      meeting_time: '08:30',
      attendees: '12명',
      topics: ['안전점검', '일일작업계획', '날씨확인'],
      location: '현장사무소',
      leader: '김현장',
      created_at: '2024-01-01T08:30:00Z',
      latitude: 37.5665,
      longitude: 126.9780,
      status: '완료',
      duration: 15,
      construction_company: '(주)건설회사',
      today_work: '철근배근 작업',
      risk_work_type: '고소작업'
    },
    {
      id: 'tbm_2',
      project_id: 'proj_2',
      project_name: '서초 오피스텔',
      managing_hq: '서울본부',
      managing_branch: '서초지사',
      meeting_date: date,
      meeting_time: '09:00',
      attendees: '8명',
      topics: ['작업안전', '품질관리', '진도점검'],
      location: '1층 회의실',
      leader: '박팀장',
      created_at: '2024-01-01T09:00:00Z',
      latitude: 37.4833,
      longitude: 127.0522,
      status: '완료',
      duration: 20,
      construction_company: '(주)시공업체',
      today_work: '콘크리트 타설',
      risk_work_type: '해당없음'
    }
  ]
}

/**
 * 개발 환경에서 사용할 모의 TBM 통계
 */
export function getMockTBMStats(): TBMStats {
  return {
    totalTBM: 2,
    totalAttendees: 0, // 사용하지 않음
    totalProjects: 2,
    averageDuration: 0, // 사용하지 않음
    riskWorkTypes: 1
  }
}
