// 관리자 아이디 확인 후 지정된 메일로 인증번호를 발송하는 라우트 (수신 주소는 서버 env로만 관리)
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!domain) return '***'
  const visible = local.slice(0, 2)
  return `${visible}***@${domain}`
}

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

  const id = typeof body === 'object' && body !== null && 'id' in body ? body.id : null
  if (typeof id !== 'string' || id.trim() !== loginId) {
    return NextResponse.json(
      { success: false, error: '아이디 또는 인증 정보가 올바르지 않습니다.' },
      { status: 401 }
    )
  }

  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
  // Supabase 이메일 템플릿에 숫자 인증번호가 보이려면 {{ .Token }}이 포함되어야 한다.
  const { error } = await anon.auth.signInWithOtp({
    email: otpEmail,
    options: { shouldCreateUser: false },
  })
  if (error) {
    console.error('관리자 인증번호 발송 오류', error.message)
    return NextResponse.json(
      { success: false, error: '인증번호를 발송하지 못했습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true, maskedEmail: maskEmail(otpEmail) })
}
