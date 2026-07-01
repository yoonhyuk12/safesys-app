// 감독(공사감독원)·현장소장(시공사 현장대리인)이 프로젝트의 미서명 문서에 일괄 서명하는 서버 라우트 (service-role, 역할 검증)
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface SignTarget {
  table: string
  signColumn: string
  // 미서명 판정 — boolean 컬럼(eq)이 있으면 사용, 없으면 null/빈문자 or 필터
  unsignedBoolColumn?: string
}

// 서명 주체별 화이트리스트 — 테이블·서명 컬럼·미서명 조건·허용 역할을 서버에서 고정한다.
// 미서명 조건을 update WHERE에 포함해 이미 서명된 문서를 덮어쓰지 않는다.
const SIGNERS: Record<string, { allowedRoles: string[]; targets: Record<string, SignTarget> }> = {
  // 감독(공사감독원) — 발주청
  supervisor: {
    allowedRoles: ['발주청'],
    targets: {
      manager_inspection: { table: 'manager_inspections', signColumn: 'signature', unsignedBoolColumn: 'has_signature' },
      tbm_safety_inspection: { table: 'tbm_safety_inspections', signColumn: 'signature' },
      inspection_request: { table: 'inspection_requests', signColumn: 'supervisor_signature' },
      quality_test_record: { table: 'quality_test_records', signColumn: 'supervision_engineer_signature' },
      quality_summary_report: { table: 'quality_summary_reports', signColumn: 'confirmer_signature' },
    },
  },
  // 현장소장(시공사) — 발주청은 관리 목적 허용
  site_manager: {
    allowedRoles: ['시공사', '발주청'],
    targets: {
      inspection_request_field_agent: { table: 'inspection_requests', signColumn: 'field_agent_signature' },
      new_worker_orientation: { table: 'new_worker_orientations', signColumn: 'manager_signature' },
      quality_test_record_engineer: { table: 'quality_test_records', signColumn: 'quality_engineer_signature' },
      quality_verification_request: { table: 'quality_verification_requests', signColumn: 'sender_signature' },
      quality_summary_report_writer: { table: 'quality_summary_reports', signColumn: 'writer_signature' },
    },
  },
}

export async function POST(request: NextRequest) {
  // 0. body 파싱·검증
  let body: { project_id?: unknown; signature_data?: unknown; signer?: unknown; items?: unknown }
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

  const signerKey = typeof body.signer === 'string' ? body.signer : ''
  const signer = SIGNERS[signerKey]
  if (!signer) {
    return NextResponse.json({ success: false, error: '유효하지 않은 서명 주체입니다.' }, { status: 400 })
  }

  if (typeof body.items !== 'object' || body.items === null) {
    return NextResponse.json({ success: false, error: '서명할 항목이 필요합니다.' }, { status: 400 })
  }

  // 타입별 ID 정규화 (화이트리스트 외 타입 무시)
  const itemsByType = new Map<string, string[]>()
  for (const type of Object.keys(signer.targets)) {
    const raw = (body.items as Record<string, unknown>)[type]
    if (!Array.isArray(raw)) continue
    const ids = Array.from(new Set(
      raw.filter((v): v is string => typeof v === 'string' && UUID_RE.test(v))
    ))
    if (ids.length > 0) itemsByType.set(type, ids)
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

  // 2. 권한 확인 — 서명 주체별 허용 역할
  const { data: profile } = await supabaseAdmin
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!profile?.role || !signer.allowedRoles.includes(profile.role)) {
    return NextResponse.json({ success: false, error: '일괄서명 권한이 없습니다.' }, { status: 403 })
  }

  // 3. 타입별 일괄 서명 (project_id + 미서명 조건을 함께 걸어 잘못된 id·기존 서명 보호)
  const updatedCounts: Record<string, number> = {}
  let totalUpdated = 0

  for (const [type, ids] of itemsByType.entries()) {
    const target = signer.targets[type]
    let query = supabaseAdmin
      .from(target.table)
      .update({ [target.signColumn]: signatureData, updated_at: new Date().toISOString() })
      .in('id', ids)
      .eq('project_id', projectId)

    if (target.unsignedBoolColumn) {
      query = query.eq(target.unsignedBoolColumn, false)
    } else {
      query = query.or(`${target.signColumn}.is.null,${target.signColumn}.eq.`)
    }

    const { data: updatedRows, error: updateError } = await query.select('id')

    if (updateError) {
      console.error(`일괄서명 오류 (${target.table}.${target.signColumn}):`, updateError)
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
