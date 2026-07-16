// TBM 텔레그램 API 요청의 Bearer 토큰을 검증하고 RLS용 Supabase 클라이언트를 생성하는 헬퍼
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

type AuthenticationResult =
  | { ok: true; supabase: SupabaseClient }
  | { ok: false; response: NextResponse }

export async function authenticateRequest(
  request: NextRequest
): Promise<AuthenticationResult> {
  const authorization = request.headers.get('authorization')
  const token = authorization?.match(/^Bearer ([^\s]+)$/)?.[1]

  if (!token) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: '인증 토큰이 필요합니다.' },
        { status: 401 }
      ),
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('TBM 텔레그램 API Supabase 환경변수가 설정되지 않았습니다.')
    return {
      ok: false,
      response: NextResponse.json(
        { error: '서버 인증 설정을 확인해주세요.' },
        { status: 500 }
      ),
    }
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
  const { data: { user }, error } = await supabase.auth.getUser(token)

  if (error || !user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: '유효하지 않은 인증 토큰입니다.' },
        { status: 401 }
      ),
    }
  }

  return { ok: true, supabase }
}
