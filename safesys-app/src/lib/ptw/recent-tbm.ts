// 최근 TBM 제출 내역 조회 (PTW 허가서 폼 공용)
import { supabase } from '@/lib/supabase'

export interface TbmCandidate {
  id: string
  meeting_date: string
  today_work: string | null
  personnel_count: string | null
  equipment_input: string | null
  address: string | null
  detail_address: string | null
}

const TBM_SELECT = 'id, meeting_date, today_work, personnel_count, equipment_input, address, detail_address'

export async function fetchRecentTbm(projectId: string, projectName?: string): Promise<TbmCandidate[]> {
  let { data } = await (supabase as any)
    .from('tbm_submissions')
    .select(TBM_SELECT)
    .eq('project_id', projectId)
    .eq('status', 'submitted')
    .not('today_work', 'is', null)
    .neq('today_work', '작업없음')
    .order('meeting_date', { ascending: false })
    .limit(10)

  // project_id가 비어있는 과거 제출 건은 프로젝트명으로 조회
  if ((!data || data.length === 0) && projectName) {
    const fallback = await (supabase as any)
      .from('tbm_submissions')
      .select(TBM_SELECT)
      .eq('project_name', projectName)
      .eq('status', 'submitted')
      .not('today_work', 'is', null)
      .neq('today_work', '작업없음')
      .order('meeting_date', { ascending: false })
      .limit(10)
    data = fallback.data
  }

  return (data as TbmCandidate[]) || []
}
