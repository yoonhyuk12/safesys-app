// 두 프로젝트를 병합(source→target 이전 후 source 삭제)하는 서버 라우트 (service-role, 발주청 권한 검증)
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest) {
  // 0. body 파싱·검증
  let body: { sourceId?: unknown; targetId?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: '잘못된 요청입니다.' }, { status: 400 })
  }
  const sourceId = body.sourceId
  const targetId = body.targetId
  if (typeof sourceId !== 'string' || !UUID_RE.test(sourceId) ||
      typeof targetId !== 'string' || !UUID_RE.test(targetId)) {
    return NextResponse.json({ success: false, error: '유효하지 않은 프로젝트 ID입니다.' }, { status: 400 })
  }
  if (sourceId === targetId) {
    return NextResponse.json({ success: false, error: '대상과 합산처가 같습니다.' }, { status: 400 })
  }

  // 1. 호출자 인증
  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) {
    return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 })
  }
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) {
    return NextResponse.json({ success: false, error: '인증에 실패했습니다.' }, { status: 401 })
  }

  // 2. 권한 확인 — 병합은 비가역이라 발주청만 허용(삭제 라우트보다 엄격)
  const { data: profile } = await supabaseAdmin
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== '발주청') {
    return NextResponse.json({ success: false, error: '병합 권한이 없습니다.' }, { status: 403 })
  }

  // 3. 두 프로젝트 존재 확인
  const { data: found } = await supabaseAdmin
    .from('projects')
    .select('id')
    .in('id', [sourceId, targetId])
  if (!found || found.length !== 2) {
    return NextResponse.json({ success: false, error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 })
  }

  // 4. 병합 RPC (단일 트랜잭션: 15개 자식 이전 + 충돌 폐기 + source 삭제)
  const { data: dropped, error: rpcError } = await supabaseAdmin
    .rpc('merge_projects', { p_source: sourceId, p_target: targetId })
  if (rpcError) {
    console.error('프로젝트 병합 오류:', rpcError)
    return NextResponse.json({ success: false, error: '프로젝트 병합에 실패했습니다.' }, { status: 500 })
  }

  return NextResponse.json({ success: true, dropped })
}
