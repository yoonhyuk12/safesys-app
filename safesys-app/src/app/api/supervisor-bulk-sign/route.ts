// 감독(공사감독원)이 프로젝트의 미서명 문서 5종에 일괄 서명하는 서버 라우트 (service-role, 발주청 권한 검증)
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// 타입 화이트리스트 — 테이블·서명 컬럼·미서명 조건을 서버에서 고정한다.
// unsignedFilter를 update WHERE에 포함해 이미 서명된 문서를 덮어쓰지 않는다.
const SIGN_TARGETS = {
  manager_inspection: {
    table: 'manager_inspections',
    signColumn: 'signature',
    unsignedFilter: { column: 'has_signature', value: false } as const,
  },
  tbm_safety_inspection: {
    table: 'tbm_safety_inspections',
    signColumn: 'signature',
    unsignedFilter: null,
  },
  inspection_request: {
    table: 'inspection_requests',
    signColumn: 'supervisor_signature',
    unsignedFilter: null,
  },
  quality_test_record: {
    table: 'quality_test_records',
    signColumn: 'supervision_engineer_signature',
    unsignedFilter: null,
  },
  quality_summary_report: {
    table: 'quality_summary_reports',
    signColumn: 'confirmer_signature',
    unsignedFilter: null,
  },
} as const

type SignTargetType = keyof typeof SIGN_TARGETS

export async function POST(request: NextRequest) {
  // 0. body 파싱·검증
  let body: { project_id?: unknown; signature_data?: unknown; items?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: '잘못된 요청입니다.' }, { status: 400 })
  }

  const projectId = body.project_id
  if (typeof projectId !== 'string' || !UUID_RE.test(projectId)) {
    return NextResponse.json({ success: false, error: '유효하지 않은 프로젝트 ID입니다.' }, { status: 400 })
  }

  const signatureData = body.signature_data
  if (typeof signatureData !== 'string' || !signatureData.startsWith('data:image/')) {
    return NextResponse.json({ success: false, error: '유효한 서명 데이터가 필요합니다.' }, { status: 400 })
  }

  if (typeof body.items !== 'object' || body.items === null) {
    return NextResponse.json({ success: false, error: '서명할 항목이 필요합니다.' }, { status: 400 })
  }

  // 타입별 ID 정규화 (화이트리스트 외 타입 무시)
  const itemsByType = new Map<SignTargetType, string[]>()
  for (const type of Object.keys(SIGN_TARGETS)) {
    const raw = (body.items as Record<string, unknown>)[type]
    if (!Array.isArray(raw)) continue
    const ids = Array.from(new Set(
      raw.filter((v): v is string => typeof v === 'string' && UUID_RE.test(v))
    ))
    if (ids.length > 0) itemsByType.set(type as SignTargetType, ids)
  }

  if (itemsByType.size === 0) {
    return NextResponse.json({ success: false, error: '서명할 항목이 없습니다.' }, { status: 400 })
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

  // 2. 권한 확인 — 감독 일괄서명은 발주청만 허용
  const { data: profile } = await supabaseAdmin
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== '발주청') {
    return NextResponse.json({ success: false, error: '일괄서명 권한이 없습니다.' }, { status: 403 })
  }

  // 3. 타입별 일괄 서명 (project_id + 미서명 조건을 함께 걸어 잘못된 id·기존 서명 보호)
  const updatedCounts: Record<string, number> = {}
  let totalUpdated = 0

  for (const [type, ids] of itemsByType.entries()) {
    const target = SIGN_TARGETS[type]
    let query = supabaseAdmin
      .from(target.table)
      .update({ [target.signColumn]: signatureData, updated_at: new Date().toISOString() })
      .in('id', ids)
      .eq('project_id', projectId)

    if (target.unsignedFilter) {
      query = query.eq(target.unsignedFilter.column, target.unsignedFilter.value)
    } else {
      query = query.or(`${target.signColumn}.is.null,${target.signColumn}.eq.`)
    }

    const { data: updatedRows, error: updateError } = await query.select('id')

    if (updateError) {
      console.error(`일괄서명 오류 (${target.table}):`, updateError)
      return NextResponse.json(
        { success: false, error: `${target.table} 서명 저장에 실패했습니다.`, details: updateError.message },
        { status: 500 }
      )
    }

    updatedCounts[type] = updatedRows?.length || 0
    totalUpdated += updatedRows?.length || 0
  }

  return NextResponse.json({
    success: true,
    message: `${totalUpdated}건의 문서에 서명이 완료되었습니다.`,
    updated_total: totalUpdated,
    updated_counts: updatedCounts,
  })
}
