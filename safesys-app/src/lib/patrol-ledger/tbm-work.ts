// 사용자 권한으로 TBM 작업내용(당일)과 대책(당일 없으면 최근)을 조회해 순회점검 AI 입력과 뒤 3행 항목을 만든다.
import type { SupabaseClient } from '@supabase/supabase-js'
import { PATROL_LEDGER_TBM_SOLUTION_COUNT, type PatrolLedgerAiItem } from '@/lib/patrol-ledger/types'

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

export interface TbmSolutionRow {
  meeting_date?: string | null
  created_at?: string | null
  solution_1?: string | null
  solution_2?: string | null
  solution_3?: string | null
}

/** 가장 최근 제출 1건의 대책 1~3을 공백 정리·빈 값 제외·중복 제거해 최대 3건 돌려준다. 행이 없으면 빈 배열이다. */
export function pickTbmSolutions(rows: TbmSolutionRow[]): { solutions: string[]; meetingDate: string | null } {
  const desc = (a: string, b: string) => (a === b ? 0 : b > a ? 1 : -1)
  const latest = [...rows].sort((a, b) => desc(clean(a.meeting_date), clean(b.meeting_date)) || desc(clean(a.created_at), clean(b.created_at)))[0]
  if (!latest) return { solutions: [], meetingDate: null }
  const solutions: string[] = []
  for (const value of [latest.solution_1, latest.solution_2, latest.solution_3]) {
    const solution = clean(value)
    if (solution && !solutions.includes(solution) && solutions.length < PATROL_LEDGER_TBM_SOLUTION_COUNT) solutions.push(solution)
  }
  return { solutions, meetingDate: clean(latest.meeting_date).slice(0, 10) || null }
}

/** 당일(없으면 그 이전) 가장 최근 제출 TBM 1건의 대책을 사용자 권한으로 조회한다. */
export async function loadTbmSolutionsForDate(client: SupabaseClient, project: TbmWorkProject, date: string): Promise<{ solutions: string[]; meetingDate: string | null }> {
  const query = () => client.from('tbm_submissions').select('id, meeting_date, created_at, solution_1, solution_2, solution_3').eq('status', 'submitted').lte('meeting_date', `${date}T23:59:59`).order('meeting_date', { ascending: false }).order('created_at', { ascending: false }).limit(1)
  const [byId, byName] = await Promise.all([
    query().eq('project_id', project.id),
    project.project_name && project.managing_hq && project.managing_branch
      ? query().eq('project_name', project.project_name).eq('headquarters', project.managing_hq).eq('branch', project.managing_branch)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (byId.error || byName.error) throw new Error('TBM 대책을 불러오지 못했습니다.')
  return pickTbmSolutions([...(byId.data ?? []), ...(byName.data ?? [])] as TbmSolutionRow[])
}

/** 대책 문구를 순회점검 점검항목으로 바꾼다. */
export function tbmSolutionItems(solutions: string[]): PatrolLedgerAiItem[] {
  return solutions.map(solution => ({ category: 'TBM 대책' as const, text: `${solution} 이행 여부` }))
}
