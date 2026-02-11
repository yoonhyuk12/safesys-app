import { createClient } from '@supabase/supabase-js'

// Supabase 클라이언트 (lazy 초기화 - 빌드 시 환경변수 없어도 에러 방지)
let _supabase: ReturnType<typeof createClient> | null = null

function getSupabaseClient() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!url) throw new Error('Missing env.NEXT_PUBLIC_SUPABASE_URL')
    if (!key) throw new Error('Missing env.NEXT_PUBLIC_SUPABASE_ANON_KEY')

    _supabase = createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
  }
  return _supabase
}

// 기존 코드와 호환성 유지를 위한 Proxy 패턴
export const supabase = new Proxy({} as ReturnType<typeof createClient>, {
  get(_target, prop) {
    return (getSupabaseClient() as any)[prop]
  }
})

// 데이터베이스 타입 정의
export interface SafetyInspection {
  id: string
  title: string
  description: string
  inspector_id: string
  location: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  score?: number
  created_at: string
  updated_at: string
  checklist_items?: SafetyChecklistItem[]
}

export interface SafetyChecklistItem {
  id: string
  inspection_id: string
  item_name: string
  is_compliant: boolean
  notes?: string
  priority: 'low' | 'medium' | 'high' | 'critical'
}

export interface IncidentReport {
  id: string
  title: string
  description: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  reporter_id: string
  location: string
  incident_date: string
  status: 'reported' | 'investigating' | 'resolved' | 'closed'
  created_at: string
  updated_at: string
}

export interface SafetyTraining {
  id: string
  title: string
  description: string
  duration_hours: number
  required_for_roles: string[]
  completion_rate?: number
  created_at: string
  updated_at: string
}

export interface UserProfile {
  id: string
  email: string
  full_name: string
  phone_number?: string
  position: string
  role: '발주청' | '감리단' | '시공사'
  hq_division?: string
  branch_division?: string
  company_name?: string
  created_at: string
  updated_at: string
} 