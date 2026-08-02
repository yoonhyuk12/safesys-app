// 관리자가 가입자의 이메일 인증 상태를 완료로 변경하는 라우트
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request)
  if (!auth.ok) {
    return NextResponse.json(
      { success: false, error: auth.error },
      { status: auth.status }
    )
  }

  const { id } = await params
  const { error } = await supabaseAdmin.auth.admin.updateUserById(id, {
    email_confirm: true,
  })

  if (error) {
    console.error('관리자 가입자 이메일 인증 처리 오류', error)
    return NextResponse.json(
      { success: false, error: '이메일 인증 상태를 변경하지 못했습니다.' },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}
