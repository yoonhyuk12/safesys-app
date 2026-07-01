// 감독(공사감독원)·시공사(현장소장 및 기타 확인자)가 프로젝트의 미서명 문서에 일괄 서명하는 서버 라우트 (service-role, 역할 검증)
// 대상 서류 목록은 src/lib/bulk-sign/bulk-sign-targets.ts 단일 레지스트리를 따른다.
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { BULK_SIGN_SIGNERS, BulkSignSigner, BulkSignTarget, applyJsonbSignature } from '@/lib/bulk-sign/bulk-sign-targets'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
  const signer = (BULK_SIGN_SIGNERS as Record<string, (typeof BULK_SIGN_SIGNERS)[BulkSignSigner] | undefined>)[signerKey]
  if (!signer) {
    return NextResponse.json({ success: false, error: '유효하지 않은 서명 주체입니다.' }, { status: 400 })
  }

  if (typeof body.items !== 'object' || body.items === null) {
    return NextResponse.json({ success: false, error: '서명할 항목이 필요합니다.' }, { status: 400 })
  }

  // 타입별 ID 정규화 (레지스트리 외 타입 무시)
  const itemsByTarget = new Map<BulkSignTarget, string[]>()
  for (const target of signer.targets) {
    const raw = (body.items as Record<string, unknown>)[target.type]
    if (!Array.isArray(raw)) continue
    const ids = Array.from(new Set(
      raw.filter((v): v is string => typeof v === 'string' && UUID_RE.test(v))
    ))
    if (ids.length > 0) itemsByTarget.set(target, ids)
  }

  if (itemsByTarget.size === 0) {
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

  for (const [target, ids] of itemsByTarget.entries()) {
    // JSONB 서명(정기안전점검 역할 배열, PTW 역할 객체)은 행별 read-modify-write
    // applyJsonbSignature가 미서명 항목에만 채우므로 기존 서명은 덮어쓰지 않는다
    if (target.jsonb) {
      const { data: jsonbRows, error: jsonbSelectError } = await supabaseAdmin
        .from(target.table)
        .select(`id, ${target.signColumn}`)
        .in('id', ids)
        .eq('project_id', projectId)
      if (jsonbSelectError) {
        console.error(`일괄서명 대상 조회 오류 (${target.table}):`, jsonbSelectError)
        return NextResponse.json(
          { success: false, error: `${target.table} 대상 조회에 실패했습니다.`, details: jsonbSelectError.message },
          { status: 500 }
        )
      }

      let jsonbUpdated = 0
      for (const row of (jsonbRows || []) as unknown as Array<Record<string, unknown>>) {
        const nextValue = applyJsonbSignature(row[target.signColumn], target.jsonb, signatureData)
        if (nextValue === null) continue
        const jsonbPayload: Record<string, unknown> = { [target.signColumn]: nextValue }
        if (target.hasUpdatedAt !== false) jsonbPayload.updated_at = new Date().toISOString()
        const { error: jsonbUpdateError } = await supabaseAdmin
          .from(target.table)
          .update(jsonbPayload)
          .eq('id', String(row.id))
        if (jsonbUpdateError) {
          console.error(`일괄서명 오류 (${target.table}.${target.signColumn}):`, jsonbUpdateError)
          return NextResponse.json(
            { success: false, error: `${target.table} 서명 저장에 실패했습니다.`, details: jsonbUpdateError.message },
            { status: 500 }
          )
        }
        jsonbUpdated++
      }
      updatedCounts[target.type] = jsonbUpdated
      totalUpdated += jsonbUpdated
      continue
    }

    // project_id가 없는 테이블(projectScope)은 부모 조인으로 프로젝트 소속 id를 먼저 검증
    let validIds = ids
    if (target.projectScope) {
      const { data: scopedRows, error: scopeError } = await supabaseAdmin
        .from(target.table)
        .select(`id, ${target.projectScope.joinTable}!inner(project_id)`)
        .in('id', ids)
        .eq(`${target.projectScope.joinTable}.project_id`, projectId)
      if (scopeError) {
        console.error(`일괄서명 대상 검증 오류 (${target.table}):`, scopeError)
        return NextResponse.json(
          { success: false, error: `${target.table} 대상 검증에 실패했습니다.`, details: scopeError.message },
          { status: 500 }
        )
      }
      validIds = ((scopedRows || []) as unknown as Array<{ id: string }>).map((r) => r.id)
      if (validIds.length === 0) {
        updatedCounts[target.type] = 0
        continue
      }
    }

    const payload: Record<string, string> = { [target.signColumn]: signatureData }
    if (target.hasUpdatedAt !== false) payload.updated_at = new Date().toISOString()

    let query = supabaseAdmin
      .from(target.table)
      .update(payload)
      .in('id', validIds)

    if (!target.projectScope) {
      query = query.eq('project_id', projectId)
    }

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

    updatedCounts[target.type] = updatedRows?.length || 0
    totalUpdated += updatedRows?.length || 0
  }

  return NextResponse.json({
    success: true,
    message: `${totalUpdated}건의 문서에 서명이 완료되었습니다.`,
    updated_total: totalUpdated,
    updated_counts: updatedCounts,
  })
}
