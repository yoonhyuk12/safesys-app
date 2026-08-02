// 관리자 아이디 확인 후 앱이 직접 발급한 인증번호를 지정된 메일로 발송하는 라우트 (수신 주소는 서버 env로만 관리)
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendAdminOtpMail } from '@/lib/admin-mailer'
import {
  generateOtpCode,
  hashOtpCode,
  OTP_MAX_PER_WINDOW,
  OTP_RATE_WINDOW_MS,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_RETENTION_MS,
  OTP_TTL_MS,
} from '@/lib/admin-otp'

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

  const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
  const id = typeof record.id === 'string' ? record.id.trim() : ''
  const email = typeof record.email === 'string' ? record.email.trim().toLowerCase() : ''

  if (id !== loginId) {
    return NextResponse.json(
      { success: false, error: '아이디 또는 인증 정보가 올바르지 않습니다.' },
      { status: 401 }
    )
  }
  // 수신 주소를 직접 입력하게 해서 아이디만 아는 사람이 발송을 반복 트리거하지 못하게 막는다.
  if (email !== otpEmail.trim().toLowerCase()) {
    return NextResponse.json(
      { success: false, error: '관리자 이메일이 아닙니다.' },
      { status: 403 }
    )
  }

  const now = Date.now()
  const nowIso = new Date(now).toISOString()

  // 오래된 발급 이력 정리 — 실패해도 발송 자체는 진행한다.
  const { error: cleanupError } = await supabaseAdmin
    .from('admin_otp_codes')
    .delete()
    .lt('created_at', new Date(now - OTP_RETENTION_MS).toISOString())
  if (cleanupError) {
    console.error('관리자 인증번호 이력 정리 오류', cleanupError.message)
  }

  // Supabase 발송을 그만두면서 사라진 rate limit을 서버측 쿨다운·시간당 한도로 대체한다.
  const { data: recentCodes, error: recentError } = await supabaseAdmin
    .from('admin_otp_codes')
    .select('created_at')
    .gte('created_at', new Date(now - OTP_RATE_WINDOW_MS).toISOString())
    .order('created_at', { ascending: false })
  if (recentError) {
    console.error('관리자 인증번호 발송 이력 조회 오류', recentError.message)
    return NextResponse.json(
      { success: false, error: '인증번호를 발송하지 못했습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 500 }
    )
  }

  const lastSentAt = recentCodes?.[0] ? new Date(recentCodes[0].created_at).getTime() : null
  if (lastSentAt !== null && now - lastSentAt < OTP_RESEND_COOLDOWN_SECONDS * 1000) {
    return NextResponse.json(
      { success: false, error: '인증번호 발송이 너무 잦습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 429 }
    )
  }
  if ((recentCodes?.length ?? 0) >= OTP_MAX_PER_WINDOW) {
    return NextResponse.json(
      { success: false, error: '인증번호 발송 횟수를 초과했습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 429 }
    )
  }

  // 항상 최신 1건만 유효하도록 아직 살아 있는 코드를 먼저 소각한다.
  const { error: burnError } = await supabaseAdmin
    .from('admin_otp_codes')
    .update({ consumed_at: nowIso })
    .is('consumed_at', null)
    .gt('expires_at', nowIso)
  if (burnError) {
    console.error('관리자 인증번호 이전 코드 소각 오류', burnError.message)
    return NextResponse.json(
      { success: false, error: '인증번호를 발송하지 못했습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 500 }
    )
  }

  const code = generateOtpCode()
  const requestIp = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || null
  const { data: issued, error: insertError } = await supabaseAdmin
    .from('admin_otp_codes')
    .insert({
      code_hash: hashOtpCode(code),
      expires_at: new Date(now + OTP_TTL_MS).toISOString(),
      request_ip: requestIp,
    })
    .select('id')
    .single()
  if (insertError || !issued) {
    console.error('관리자 인증번호 저장 오류', insertError?.message ?? '저장 결과가 비어 있습니다.')
    return NextResponse.json(
      { success: false, error: '인증번호를 발송하지 못했습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 500 }
    )
  }

  try {
    await sendAdminOtpMail(otpEmail, code)
  } catch (error) {
    console.error('관리자 인증번호 메일 발송 오류', error instanceof Error ? error.message : error)
    // 발송되지 않은 코드는 살려 두지 않는다.
    const { error: rollbackError } = await supabaseAdmin
      .from('admin_otp_codes')
      .update({ consumed_at: new Date().toISOString() })
      .eq('id', issued.id)
    if (rollbackError) {
      console.error('발송 실패 인증번호 소각 오류', rollbackError.message)
    }
    return NextResponse.json(
      { success: false, error: '인증번호를 발송하지 못했습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true, maskedEmail: maskEmail(otpEmail) })
}
