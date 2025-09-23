import { createClient } from '@supabase/supabase-js'

// 서버 사이드에서만 사용할 수 있는 서비스 역할 키를 사용하는 Supabase 클라이언트
// RLS 정책을 우회할 수 있는 관리자 권한을 가집니다
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://hbxthrnsaijfaxnfhsas.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhieHRocm5zYWlqZmF4bmZoc2FzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Mzc3NjAxNSwiZXhwIjoyMDY5MzUyMDE1fQ.HMSAHcUYsPujeViEJwedZ-F3P3Ze7zsnPRIX0Jld39c', // 서비스 역할 키 사용
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

export { supabaseAdmin }