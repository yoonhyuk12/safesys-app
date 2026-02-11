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
  education_photo_url?: string
}

export interface TBMStats {
  totalTBM: number
  totalAttendees: number
  totalProjects: number
  averageDuration: number
  riskWorkTypes: number
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