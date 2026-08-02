// 로그인 사용자의 관리자 여부를 반환하는 라우트 (관리자 화면 클라이언트 가드용)
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { hasOtpLogin, isAdminEmail } from '@/lib/admin-auth'

export async function GET(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) {
    return NextResponse.json({ success: false, isAdmin: false, error: '로그인이 필요합니다.' }, { status: 401 })
  }
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) {
    return NextResponse.json({ success: false, isAdmin: false, error: '인증에 실패했습니다.' }, { status: 401 })
  }
  return NextResponse.json({
    success: true,
    isAdmin: isAdminEmail(user.email),
    otpVerified: hasOtpLogin(token),
  })
}
