// 두 프로젝트를 병합(source→target 이전 후 source 삭제)하는 서버 라우트 (service-role, 발주청 권한 검증)
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function verifyMergePermission(request: NextRequest): Promise<NextResponse | null> {
  const authorization = request.headers.get('authorization')
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) {
    return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) {
    return NextResponse.json({ success: false, error: '인증에 실패했습니다.' }, { status: 401 })
  }

  const { data: profile } = await supabaseAdmin
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== '발주청') {
    return NextResponse.json({ success: false, error: '병합 권한이 없습니다.' }, { status: 403 })
  }

  return null
}

export async function GET(request: NextRequest) {
  const sourceId = request.nextUrl.searchParams.get('sourceId')
  const targetId = request.nextUrl.searchParams.get('targetId')
  if (!sourceId || !UUID_RE.test(sourceId) || !targetId || !UUID_RE.test(targetId)) {
    return NextResponse.json({ success: false, error: '유효하지 않은 프로젝트 ID입니다.' }, { status: 400 })
  }
  if (sourceId === targetId) {
    return NextResponse.json({ success: false, error: '대상과 합산처가 같습니다.' }, { status: 400 })
  }

  const permissionError = await verifyMergePermission(request)
  if (permissionError) return permissionError

  const { data: projects, error: projectsError } = await supabaseAdmin
    .from('projects')
    .select('id, project_name, created_by')
    .in('id', [sourceId, targetId])
  if (projectsError) {
    console.error('병합 미리보기 프로젝트 조회 오류', projectsError)
    return NextResponse.json({ success: false, error: '프로젝트 정보를 불러오지 못했습니다.' }, { status: 500 })
  }

  const source = projects?.find((project) => project.id === sourceId)
  const target = projects?.find((project) => project.id === targetId)
  if (!source || !target) {
    return NextResponse.json({ success: false, error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 })
  }

  const { data: projectShares, error: sharesError } = await supabaseAdmin
    .from('project_shares')
    .select('project_id, shared_with')
    .in('project_id', [sourceId, targetId])
  if (sharesError) {
    console.error('병합 미리보기 공유자 조회 오류', sharesError)
    return NextResponse.json({ success: false, error: '공유자 정보를 불러오지 못했습니다.' }, { status: 500 })
  }

  const participantIds = new Set<string>()
  if (typeof source.created_by === 'string' && source.created_by !== target.created_by) {
    participantIds.add(source.created_by)
  }
  for (const share of projectShares ?? []) {
    if (share.project_id !== sourceId) continue
    if (typeof share.shared_with === 'string' && share.shared_with !== target.created_by) {
      participantIds.add(share.shared_with)
    }
  }

  const targetShareIds = new Set(
    (projectShares ?? [])
      .filter((share) => share.project_id === targetId && typeof share.shared_with === 'string')
      .map((share) => share.shared_with),
  )

  const ids = Array.from(participantIds)
  const { data: profiles, error: profilesError } = ids.length > 0
    ? await supabaseAdmin
        .from('user_profiles')
        .select('id, full_name, email, company_name, role')
        .in('id', ids)
    : { data: [], error: null }
  if (profilesError) {
    console.error('병합 미리보기 사용자 조회 오류', profilesError)
    return NextResponse.json({ success: false, error: '사용자 정보를 불러오지 못했습니다.' }, { status: 500 })
  }

  const profilesById = new Map((profiles ?? []).map((profile) => [profile.id, profile]))
  const participants = ids.flatMap((id) => {
    const profile = profilesById.get(id)
    if (!profile || (profile.role !== '시공사' && profile.role !== '감리단')) return []

    return [{
      id,
      full_name: profile.full_name ?? null,
      email: profile.email ?? null,
      company_name: profile.company_name ?? null,
      role: profile.role,
      sourceOwner: id === source.created_by,
      alreadyShared: targetShareIds.has(id),
    }]
  })

  return NextResponse.json({
    success: true,
    targetProjectName: target.project_name,
    participants,
  })
}

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

  // 1~2. 호출자 인증 및 발주청 권한 확인
  const permissionError = await verifyMergePermission(request)
  if (permissionError) return permissionError

  // 3. 두 프로젝트 존재 확인
  const { data: found } = await supabaseAdmin
    .from('projects')
    .select('id')
    .in('id', [sourceId, targetId])
  if (!found || found.length !== 2) {
    return NextResponse.json({ success: false, error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 })
  }

  // 4. 병합 RPC (단일 트랜잭션: 자식 테이블 24종 이전 + 충돌 폐기 + source 삭제.
  //    함수가 아는 테이블 수와 실제 FK 수가 다르면 유실 방지를 위해 예외로 중단됨)
  const { data: dropped, error: rpcError } = await supabaseAdmin
    .rpc('merge_projects', { p_source: sourceId, p_target: targetId })
  if (rpcError) {
    console.error('프로젝트 병합 오류:', rpcError)
    return NextResponse.json({ success: false, error: '프로젝트 병합에 실패했습니다.' }, { status: 500 })
  }

  return NextResponse.json({ success: true, dropped })
}
