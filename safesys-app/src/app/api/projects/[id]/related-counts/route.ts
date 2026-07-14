// 프로젝트 삭제 전에 사용자 입력 연관 데이터 건수를 집계하는 서버 라우트
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type CountCategory = 'safety' | 'workers' | 'work' | 'business'

const RELATED_TABLES: Array<{ table: string; category: CountCategory }> = [
  { table: 'heat_wave_checks', category: 'safety' },
  { table: 'manager_inspections', category: 'safety' },
  { table: 'headquarters_inspections', category: 'safety' },
  { table: 'tbm_safety_inspections', category: 'safety' },
  { table: 'safe_document_inspections', category: 'safety' },
  { table: 'safety_inspections', category: 'safety' },
  { table: 'ptw_permits', category: 'safety' },
  { table: 'inspection_requests', category: 'safety' },
  { table: 'inspection_visit_logs', category: 'safety' },
  { table: 'corrective_action_issues', category: 'safety' },
  { table: 'new_worker_orientations', category: 'safety' },
  { table: 'legal_compliance_checks', category: 'safety' },
  { table: 'workers', category: 'workers' },
  { table: 'tbm_submissions', category: 'work' },
  { table: 'work_daily_reports', category: 'work' },
  { table: 'work_plans', category: 'work' },
  { table: 'materials', category: 'business' },
  { table: 'project_contracts', category: 'business' },
  { table: 'quality_monthly_reports', category: 'business' },
  { table: 'quality_summary_reports', category: 'business' },
  { table: 'quality_test_records', category: 'business' },
  { table: 'quality_verification_requests', category: 'business' },
]

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!UUID_RE.test(id)) {
    return NextResponse.json({ success: false, error: '유효하지 않은 프로젝트 ID입니다.' }, { status: 400 })
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

  const { data: project, error: projectError } = await supabaseAdmin
    .from('projects')
    .select('id, created_by')
    .eq('id', id)
    .single()
  if (projectError) {
    if (projectError.code === 'PGRST116') {
      return NextResponse.json({ success: false, error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 })
    }
    console.error('프로젝트 연관 건수 조회 중 프로젝트 확인 오류:', projectError)
    return NextResponse.json({ success: false, error: '연관 입력정보를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.' }, { status: 500 })
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if (profileError) {
    console.error('프로젝트 연관 건수 조회 중 사용자 권한 확인 오류:', profileError)
    return NextResponse.json({ success: false, error: '연관 입력정보를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.' }, { status: 500 })
  }

  const canDelete = profile?.role === '발주청' || project.created_by === user.id
  if (!canDelete) {
    return NextResponse.json({ success: false, error: '삭제 권한이 없습니다.' }, { status: 403 })
  }

  try {
    const results = await Promise.all(
      RELATED_TABLES.map(async ({ table, category }) => {
        const { count, error } = await supabaseAdmin
          .from(table)
          .select('*', { count: 'exact', head: true })
          .eq('project_id', id)

        if (error) {
          console.error(`프로젝트 연관 건수 조회 오류 [${table}]:`, error)
          throw error
        }

        return { category, count: count ?? 0 }
      })
    )

    const counts = results.reduce(
      (acc, result) => ({ ...acc, [result.category]: acc[result.category] + result.count }),
      { safety: 0, workers: 0, work: 0, business: 0 }
    )
    const total = counts.safety + counts.workers + counts.work + counts.business

    return NextResponse.json({ success: true, counts: { total, ...counts } })
  } catch {
    return NextResponse.json(
      { success: false, error: '연관 입력정보를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 500 }
    )
  }
}
