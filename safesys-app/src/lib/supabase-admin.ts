import { createClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Database = any

// 서버 사이드에서만 사용할 수 있는 서비스 역할 키를 사용하는 Supabase 클라이언트
// RLS 정책을 우회할 수 있는 관리자 권한을 가집니다
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    'Supabase 관리자 클라이언트 초기화 실패: NEXT_PUBLIC_SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY 환경 변수가 필요합니다'
  )
}

const supabaseAdmin = createClient<Database>(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

export { supabaseAdmin }