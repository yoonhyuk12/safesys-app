// 비밀번호 찾기 본인확인 정보를 검증하고 인증 비밀번호를 변경하는 API 라우트
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RE = /^01[0-9]-[0-9]{4}-[0-9]{4}$/
const MIN_PASSWORD_LENGTH = 6
const MAX_PASSWORD_LENGTH = 72

interface UpdatePasswordBody {
  email?: unknown
  name?: unknown
  phone?: unknown
  newPassword?: unknown
}

export async function POST(request: NextRequest) {
  let body: UpdatePasswordBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: '잘못된 요청입니다.' }, { status: 400 })
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const phone = typeof body.phone === 'string' ? body.phone.trim() : ''
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : ''

  if (!email || !name || !phone || !newPassword) {
    return NextResponse.json({ success: false, error: '모든 필드를 입력해주세요.' }, { status: 400 })
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ success: false, error: '올바른 이메일 주소를 입력해주세요.' }, { status: 400 })
  }
  if (!PHONE_RE.test(phone)) {
    return NextResponse.json(
      { success: false, error: '올바른 전화번호를 입력해주세요. (예: 010-1234-5678)' },
      { status: 400 }
    )
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { success: false, error: `비밀번호는 최소 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.` },
      { status: 400 }
    )
  }
  if (newPassword.length > MAX_PASSWORD_LENGTH) {
    return NextResponse.json(
      { success: false, error: `비밀번호는 최대 ${MAX_PASSWORD_LENGTH}자까지 입력할 수 있습니다.` },
      { status: 400 }
    )
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('user_profiles')
    .select('id')
    .eq('email', email)
    .eq('full_name', name)
    .eq('phone_number', phone)
    .maybeSingle()

  if (profileError) {
    console.error('비밀번호 변경 본인확인 조회 오류:', profileError)
    return NextResponse.json({ success: false, error: '사용자 정보 확인에 실패했습니다.' }, { status: 500 })
  }
  if (!profile) {
    return NextResponse.json(
      { success: false, error: '입력하신 정보와 일치하는 계정을 찾을 수 없습니다.' },
      { status: 404 }
    )
  }

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(profile.id, {
    password: newPassword,
  })

  if (updateError) {
    console.error('인증 비밀번호 변경 오류:', updateError)
    return NextResponse.json({ success: false, error: '비밀번호 변경에 실패했습니다.' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
