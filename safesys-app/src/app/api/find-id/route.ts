import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(request: NextRequest) {
  try {
    const { fullName, phone } = await request.json()

    // 입력값 검증
    if (!fullName || !phone) {
      return NextResponse.json(
        { error: '이름과 전화번호를 모두 입력해주세요.' },
        { status: 400 }
      )
    }

    // 전화번호에서 하이픈 제거한 버전도 준비
    const phoneWithoutHyphen = phone.replace(/\D/g, '')
    const phoneWithHyphen = phone.trim()

    // 이름과 전화번호로 사용자 찾기 (하이픈 있는 버전과 없는 버전 모두 검색)
    // 서비스 계정을 사용하여 RLS 우회
    const { data: users, error } = await supabaseAdmin
      .from('user_profiles')
      .select('email, full_name, phone_number')
      .eq('full_name', fullName.trim())
      .or(`phone_number.eq.${phoneWithHyphen},phone_number.eq.${phoneWithoutHyphen}`)
      .limit(1)

    if (error) {
      console.error('Find ID error:', error)
      return NextResponse.json(
        { error: '데이터베이스 오류가 발생했습니다.' },
        { status: 500 }
      )
    }

    // 일치하는 사용자가 없는 경우
    if (!users || users.length === 0) {
      return NextResponse.json(
        { error: '입력하신 정보와 일치하는 계정을 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    const user = users[0]

    // 이메일 일부 마스킹 (선택사항)
    // const maskedEmail = maskEmail(user.email)

    return NextResponse.json({
      email: user.email,
      success: true
    })

  } catch (error) {
    console.error('Find ID API error:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}

// 이메일 마스킹 함수 (선택사항)
function maskEmail(email: string): string {
  const [localPart, domain] = email.split('@')
  if (localPart.length <= 3) {
    return `${localPart[0]}${'*'.repeat(localPart.length - 1)}@${domain}`
  }
  const visibleChars = Math.ceil(localPart.length / 3)
  const maskedChars = localPart.length - visibleChars
  return `${localPart.substring(0, visibleChars)}${'*'.repeat(maskedChars)}@${domain}`
}