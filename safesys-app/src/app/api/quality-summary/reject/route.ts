// 품질시험 성과총괄표 반려 요청을 인증하고 발주청 권한으로 처리한다.
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_REASON_LENGTH = 1000

export async function POST(request: NextRequest) {
  let body: { report_id?: unknown; reason?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: '잘못된 요청입니다.' }, { status: 400 })
  }

  const reportId = body.report_id
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''

  if (typeof reportId !== 'string' || !UUID_RE.test(reportId)) {
    return NextResponse.json({ success: false, error: '유효하지 않은 성과총괄표 ID입니다.' }, { status: 400 })
  }
  if (!reason) {
    return NextResponse.json({ success: false, error: '반려 사유를 입력해주세요.' }, { status: 400 })
  }
  if (reason.length > MAX_REASON_LENGTH) {
    return NextResponse.json(
      { success: false, error: `반려 사유는 ${MAX_REASON_LENGTH}자 이내로 입력해주세요.` },
      { status: 400 }
    )
  }

  const authorization = request.headers.get('authorization')
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!token) {
    return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) {
    return NextResponse.json({ success: false, error: '인증에 실패했습니다.' }, { status: 401 })
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) {
    console.error('성과총괄표 반려 권한 조회 오류:', profileError)
    return NextResponse.json({ success: false, error: '반려 권한 확인에 실패했습니다.' }, { status: 500 })
  }
  if (profile?.role !== '발주청') {
    return NextResponse.json({ success: false, error: '성과총괄표 반려 권한이 없습니다.' }, { status: 403 })
  }

  const now = new Date().toISOString()
  const { data: updatedReport, error: updateError } = await supabaseAdmin
    .from('quality_summary_reports')
    .update({
      rejection_reason: reason,
      rejected_at: now,
      rejected_by: user.id,
      rejection_read_at: null,
      rejection_read_by: null,
      reviewer_signature: '',
      updated_at: now,
    })
    .eq('id', reportId)
    .select('id')
    .maybeSingle()

  if (updateError) {
    console.error('성과총괄표 반려 처리 오류:', updateError)
    return NextResponse.json({ success: false, error: '성과총괄표 반려 처리에 실패했습니다.' }, { status: 500 })
  }
  if (!updatedReport) {
    return NextResponse.json({ success: false, error: '성과총괄표를 찾을 수 없습니다.' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
