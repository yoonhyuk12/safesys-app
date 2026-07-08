// 상시 TBM QR용 API — 프로젝트의 당일(한국시간) TBM 제출건 id 조회 (공개)
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// 한국시간 기준 오늘 날짜 (YYYY-MM-DD)
function getTodayKST(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())
}

interface SubmissionRow {
  id: string
  submitted_at: string | null
  status: string | null
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params

  if (!UUID_REGEX.test(projectId)) {
    return NextResponse.json({ error: '유효하지 않은 ID입니다.' }, { status: 400 })
  }

  const { data: project, error: projectError } = await supabaseAdmin
    .from('projects')
    .select('id,project_name,managing_hq,managing_branch')
    .eq('id', projectId)
    .single<{ id: string; project_name: string; managing_hq: string | null; managing_branch: string | null }>()

  if (projectError || !project) {
    return NextResponse.json({ error: '사업을 찾을 수 없습니다.' }, { status: 404 })
  }

  const today = getTodayKST()

  // 제출건 조회 — project_id 매칭 + 레거시(프로젝트명·본부·지사) 매칭 병합 (tbm-submission 페이지와 동일 규칙)
  const [byId, byName] = await Promise.all([
    supabaseAdmin
      .from('tbm_submissions')
      .select('id,submitted_at,status')
      .eq('project_id', projectId)
      .eq('meeting_date', today),
    supabaseAdmin
      .from('tbm_submissions')
      .select('id,submitted_at,status')
      .eq('project_name', project.project_name)
      .eq('headquarters', project.managing_hq ?? '')
      .eq('branch', project.managing_branch ?? '')
      .eq('meeting_date', today),
  ])

  if (byId.error || byName.error) {
    console.error('당일 TBM 조회 오류:', byId.error || byName.error)
    return NextResponse.json({ error: '당일 TBM 조회 중 오류가 발생했습니다.' }, { status: 500 })
  }

  const combined = [...(byId.data || []), ...(byName.data || [])] as SubmissionRow[]
  const candidates = combined
    .filter((row, index, self) => index === self.findIndex(r => r.id === row.id))
    .filter(row => row.status !== 'draft')
    .sort((a, b) => (b.submitted_at || '').localeCompare(a.submitted_at || ''))

  if (candidates.length === 0) {
    return NextResponse.json(
      { error: '금일 TBM 제출건이 없습니다.', date: today, projectName: project.project_name },
      { status: 404 }
    )
  }

  return NextResponse.json({ id: candidates[0].id, date: today })
}
