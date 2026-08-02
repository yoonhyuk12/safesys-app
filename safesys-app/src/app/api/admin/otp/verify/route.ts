// 관리자 인증번호를 검증하고 세션 토큰을 반환하는 라우트
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  const loginId = process.env.ADMIN_LOGIN_ID
  const otpEmail = process.env.ADMIN_OTP_EMAIL
  if (!loginId || !otpEmail) {
    return NextResponse.json(
      { success: false, error: '관리자 로그인 설정이 완료되지 않았습니다.' },
      { status: 500 }
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { success: false, error: '요청 본문을 확인해 주세요.' },
      { status: 400 }
    )
  }

  const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
  const id = typeof record.id === 'string' ? record.id.trim() : ''
  const token = typeof record.token === 'string' ? record.token.trim() : ''

  if (id !== loginId) {
    return NextResponse.json(
      { success: false, error: '아이디 또는 인증 정보가 올바르지 않습니다.' },
      { status: 401 }
    )
  }
  if (!/^\d{6}$/.test(token)) {
    return NextResponse.json(
      { success: false, error: '6자리 인증번호를 입력해 주세요.' },
      { status: 400 }
    )
  }

  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
  const { data, error } = await anon.auth.verifyOtp({
    email: otpEmail,
    token,
    type: 'email',
  })
  if (error || !data.session) {
    return NextResponse.json(
      { success: false, error: '인증번호가 올바르지 않거나 만료되었습니다.' },
      { status: 400 }
    )
  }

  return NextResponse.json({
    success: true,
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    },
  })
}
