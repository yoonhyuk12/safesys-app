// 프로젝트 삭제 시 관련 Storage 사진까지 정리하는 서버 라우트 (service-role, 권한 검증 포함)
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// public URL에서 { bucket, path } 추출. base64·비URL 값은 null 반환.
function parseStorageUrl(value: unknown): { bucket: string; path: string } | null {
  if (typeof value !== 'string' || !value.startsWith('http')) return null
  const m = value.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/)
  if (!m) return null
  return { bucket: m[1], path: decodeURIComponent(m[2]) }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!UUID_RE.test(id)) {
    return NextResponse.json({ success: false, error: '유효하지 않은 프로젝트 ID입니다.' }, { status: 400 })
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

  // 2. 삭제 권한 확인 (projects DELETE RLS와 동일: 발주청 역할 또는 소유자)
  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('id, created_by')
    .eq('id', id)
    .single()
  if (!project) {
    return NextResponse.json({ success: false, error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 })
  }
  const { data: profile } = await supabaseAdmin
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  const canDelete = profile?.role === '발주청' || project.created_by === user.id
  if (!canDelete) {
    return NextResponse.json({ success: false, error: '삭제 권한이 없습니다.' }, { status: 403 })
  }

  // 3. 관련 행에서 Storage URL 수집
  const urls: unknown[] = []
  const push = (...vals: unknown[]) => {
    for (const v of vals) if (v) urls.push(v)
  }

  const { data: hwc } = await supabaseAdmin
    .from('heat_wave_checks')
    .select('photos, signature')
    .eq('project_id', id)
  hwc?.forEach((r: { photos: unknown; signature: unknown }) => {
    if (Array.isArray(r.photos)) push(...r.photos)
    push(r.signature)
  })

  const { data: mgr } = await supabaseAdmin
    .from('manager_inspections')
    .select('inspection_photo, risk_assessment_photo, disaster_prevention_report_photo')
    .eq('project_id', id)
  mgr?.forEach((r: { inspection_photo: unknown; risk_assessment_photo: unknown; disaster_prevention_report_photo: unknown }) => {
    push(r.inspection_photo, r.risk_assessment_photo, r.disaster_prevention_report_photo)
  })

  const { data: hq } = await supabaseAdmin
    .from('headquarters_inspections')
    .select('site_photo_overview, site_photo_issue1, site_photo_issue2, action_photo_issue1, action_photo_issue2')
    .eq('project_id', id)
  hq?.forEach((r: { site_photo_overview: unknown; site_photo_issue1: unknown; site_photo_issue2: unknown; action_photo_issue1: unknown; action_photo_issue2: unknown }) => {
    push(r.site_photo_overview, r.site_photo_issue1, r.site_photo_issue2, r.action_photo_issue1, r.action_photo_issue2)
  })

  const { data: tbm } = await supabaseAdmin
    .from('tbm_submissions')
    .select('education_photo_url, signature_url')
    .eq('project_id', id)
  tbm?.forEach((r: { education_photo_url: unknown; signature_url: unknown }) => {
    push(r.education_photo_url, r.signature_url)
  })

  const { data: wk } = await supabaseAdmin
    .from('workers')
    .select('id_card_url, certificate_card_url, signature_url')
    .eq('project_id', id)
  wk?.forEach((r: { id_card_url: unknown; certificate_card_url: unknown; signature_url: unknown }) => {
    push(r.id_card_url, r.certificate_card_url, r.signature_url)
  })

  // URL을 버킷별 경로로 그룹핑 (base64 등은 parseStorageUrl이 걸러냄)
  const byBucket: Record<string, Set<string>> = {}
  for (const u of urls) {
    const parsed = parseStorageUrl(u)
    if (!parsed) continue
    ;(byBucket[parsed.bucket] ??= new Set()).add(parsed.path)
  }

  // 4. safety-inspection-photos: URL 컬럼이 없어 {projectId}/ 폴더를 직접 list
  const safetyPaths = new Set<string>()
  for (let offset = 0; ; offset += 100) {
    const { data: files } = await supabaseAdmin.storage
      .from('safety-inspection-photos')
      .list(id, { limit: 100, offset })
    if (!files || files.length === 0) break
    files.forEach((f) => safetyPaths.add(`${id}/${f.name}`))
    if (files.length < 100) break
  }
  if (safetyPaths.size > 0) byBucket['safety-inspection-photos'] = safetyPaths

  // 5. 버킷별 Storage 삭제 (100개씩 청크, 실패는 로깅만 하고 계속)
  let deletedFiles = 0
  for (const [bucket, pathSet] of Object.entries(byBucket)) {
    const paths = Array.from(pathSet)
    for (let i = 0; i < paths.length; i += 100) {
      const chunk = paths.slice(i, i + 100)
      const { error } = await supabaseAdmin.storage.from(bucket).remove(chunk)
      if (error) {
        console.error(`Storage 삭제 실패 [${bucket}]:`, error.message)
      } else {
        deletedFiles += chunk.length
      }
    }
  }

  // 6. 프로젝트 삭제 (관련 행은 ON DELETE CASCADE로 함께 삭제)
  const { error: delError } = await supabaseAdmin.from('projects').delete().eq('id', id)
  if (delError) {
    console.error('프로젝트 삭제 오류:', delError)
    return NextResponse.json({ success: false, error: '프로젝트 삭제에 실패했습니다.' }, { status: 500 })
  }

  return NextResponse.json({ success: true, deletedFiles })
}
