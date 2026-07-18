// TBM 텔레그램 API 요청의 Bearer 토큰을 검증하고 RLS용 Supabase 클라이언트를 생성하는 헬퍼
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import type { OrganizationScopeProfile } from '@/lib/organization-scope'

type AuthenticationResult =
  | {
      ok: true
      supabase: SupabaseClient
      organizationScope: OrganizationScopeProfile
    }
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
    const errorStatus = error?.status
    console.warn('TBM AI API 인증 실패', {
      message: error?.message ?? '사용자 정보 없음',
      status: errorStatus ?? null,
    })

    const authServiceUnavailable = Boolean(
      error && (
        error.name === 'AuthRetryableFetchError' ||
        errorStatus === 0 ||
        (typeof errorStatus === 'number' && errorStatus >= 500)
      )
    )
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: authServiceUnavailable
            ? '인증 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.'
            : '유효하지 않은 인증 토큰입니다.',
        },
        { status: authServiceUnavailable ? 503 : 401 }
      ),
    }
  }

  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('role, hq_division, branch_division')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    console.error('TBM AI API 사용자 소속 조회 실패', {
      userId: user.id,
      message: profileError?.message ?? '사용자 프로필 없음',
    })
    return {
      ok: false,
      response: NextResponse.json(
        { error: '사용자 소속 정보를 확인할 수 없습니다.' },
        { status: 403 }
      ),
    }
  }

  return {
    ok: true,
    supabase,
    organizationScope: {
      role: profile.role,
      hq_division: profile.hq_division,
      branch_division: profile.branch_division,
    },
  }
}
