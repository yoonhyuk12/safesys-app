// 사용자 권한으로 당일 제출된 TBM 작업내용을 모아 순회점검 AI 입력을 만든다.
import type { SupabaseClient } from '@supabase/supabase-js'

export interface TbmWorkRow {
  construction_company?: string | null
  today_work?: string | null
  location?: string | null
  risk_work_type?: string | null
  equipment_input?: string | null
  personnel_total_count?: number | null
}
export interface TbmWorkProject {
  id: string
  project_name: string | null
  managing_hq: string | null
  managing_branch: string | null
}
const clean = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim()
function usableRows(rows: TbmWorkRow[]): TbmWorkRow[] {
  const seen = new Set<string>()
  return rows.filter(row => {
    const work = clean(row.today_work)
    if (!work || work === '작업없음' || seen.has(work)) return false
    seen.add(work)
    return true
  })
}
export function summarizeTbmWork(rows: TbmWorkRow[]): string {
  return usableRows(rows).map(row => {
    const company = clean(row.construction_company)
    const details = [clean(row.location), clean(row.risk_work_type), clean(row.equipment_input), row.personnel_total_count != null ? `${row.personnel_total_count}명` : ''].filter(Boolean)
    return `• ${company ? `[${company}] ` : ''}${clean(row.today_work)}${details.length ? ` (${details.join(', ')})` : ''}`
  }).join('\n')
}
export async function loadTbmWorkForDate(client: SupabaseClient, project: TbmWorkProject, date: string): Promise<{ summary: string; count: number }> {
  const query = () => client.from('tbm_submissions').select('id, construction_company, today_work, address, risk_work_type, equipment_input, personnel_total_count').eq('status', 'submitted').gte('meeting_date', date).lte('meeting_date', `${date}T23:59:59`)
  const [byId, byName] = await Promise.all([
    query().eq('project_id', project.id),
    project.project_name && project.managing_hq && project.managing_branch
      ? query().eq('project_name', project.project_name).eq('headquarters', project.managing_hq).eq('branch', project.managing_branch)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (byId.error || byName.error) throw new Error('TBM 작업내용을 불러오지 못했습니다.')
  const unique = new Map<string, TbmWorkRow>()
  for (const row of [...(byId.data ?? []), ...(byName.data ?? [])]) unique.set(row.id, { ...row, location: row.address })
  const rows = usableRows([...unique.values()])
  return { summary: summarizeTbmWork(rows), count: rows.length }
}
