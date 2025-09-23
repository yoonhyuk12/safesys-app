// TBM 관련 API 호출 함수들

// TBM 현황 조회 전용 구글 앱스 스크립트 URL
const TBM_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwxu_6kwZ2aoM36G4yS_O6BdplhnHI6CNBIV60dszuIr0HsZf8DPtJKZFGIlTAfX7B2ZQ/exec'

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
 * TBM 기록을 조회합니다
 */
export async function getTBMRecords(
  date: string,
  hq?: string,
  branch?: string
): Promise<TBMResponse> {
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
 * TBM 통계를 조회합니다
 */
export async function getTBMStats(
  date: string,
  hq?: string,
  branch?: string
): Promise<TBMStatsResponse> {
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