// 앱이 발급한 관리자 인증번호를 검증하고 Supabase 세션 토큰을 반환하는 라우트
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { isOtpCodeMatch, OTP_MAX_ATTEMPTS } from '@/lib/admin-otp'

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

  const nowIso = new Date().toISOString()
  const { data: issued, error: lookupError } = await supabaseAdmin
    .from('admin_otp_codes')
    .select('id, code_hash, attempts')
    .is('consumed_at', null)
    .gt('expires_at', nowIso)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (lookupError) {
    console.error('관리자 인증번호 조회 오류', lookupError.message)
    return NextResponse.json(
      { success: false, error: '인증 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 500 }
    )
  }
  if (!issued) {
    return NextResponse.json(
      { success: false, error: '인증번호가 만료되었습니다. 다시 발송해 주세요.' },
      { status: 400 }
    )
  }

  if (!isOtpCodeMatch(token, issued.code_hash)) {
    const attempts = issued.attempts + 1
    const exceeded = attempts > OTP_MAX_ATTEMPTS
    const { error: attemptError } = await supabaseAdmin
      .from('admin_otp_codes')
      .update(exceeded ? { attempts, consumed_at: new Date().toISOString() } : { attempts })
      .eq('id', issued.id)
    if (attemptError) {
      console.error('관리자 인증번호 시도 횟수 갱신 오류', attemptError.message)
    }
    return NextResponse.json(
      {
        success: false,
        error: exceeded
          ? '인증번호 입력 횟수를 초과했습니다. 다시 발송해 주세요.'
          : '인증번호가 올바르지 않습니다.',
      },
      { status: 400 }
    )
  }

  // 동시 요청이 같은 코드를 두 번 쓰지 못하도록 소각에 성공한 요청만 세션을 받는다.
  const { data: consumed, error: consumeError } = await supabaseAdmin
    .from('admin_otp_codes')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', issued.id)
    .is('consumed_at', null)
    .select('id')
  if (consumeError) {
    console.error('관리자 인증번호 소각 오류', consumeError.message)
    return NextResponse.json(
      { success: false, error: '인증 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 500 }
    )
  }
  if (!consumed || consumed.length === 0) {
    return NextResponse.json(
      { success: false, error: '인증번호가 만료되었습니다. 다시 발송해 주세요.' },
      { status: 400 }
    )
  }

  // generateLink는 메일을 보내지 않고 토큰만 돌려준다. 서버 안에서 즉시 세션으로 교환한다.
  const { data: link, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email: otpEmail,
  })
  const tokenHash = link?.properties?.hashed_token
  if (linkError || !tokenHash) {
    console.error('관리자 세션 링크 생성 오류', linkError?.message ?? '토큰이 비어 있습니다.')
    return NextResponse.json(
      { success: false, error: '로그인 세션을 발급하지 못했습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 500 }
    )
  }

  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
  const { data, error } = await anon.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'magiclink',
  })
  if (error || !data.session) {
    console.error('관리자 세션 교환 오류', error?.message ?? '세션이 비어 있습니다.')
    return NextResponse.json(
      { success: false, error: '로그인 세션을 발급하지 못했습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 500 }
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
