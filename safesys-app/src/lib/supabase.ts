import { createClient } from '@supabase/supabase-js'

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error('Missing env.NEXT_PUBLIC_SUPABASE_URL')
}
if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  throw new Error('Missing env.NEXT_PUBLIC_SUPABASE_ANON_KEY')
}

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      refreshTokenRetryInterval: 2000, // 2초마다 재시도
      refreshTokenRetryAttempts: 3 // 최대 3번 재시도
    }
  }
)

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