// 패트롤카를 이용한 본부 불시점검을 조직 범위·분기로 조회하고 조치 판정을 함께 제공하는 모듈이다.
import { supabase } from '@/lib/supabase'
import type { HeadquartersFindingType } from '@/lib/inspection/headquarters-finding-type'
import { normalizeHeadquartersFindingType } from '@/lib/inspection/headquarters-finding-type'
import { patrolQuarterRange } from '@/lib/patrol-inspection-utils'

export type {
  PatrolActionState,
  PatrolQuarterRange,
} from '@/lib/patrol-inspection-utils'

export {
  PATROL_ACTION_OVERDUE_DAYS,
  PATROL_DISASTER_TYPES,
  PATROL_MAX_AI_ITEMS,
  PATROL_NO_ACTION_TEXT,
  buildPatrolIssueContent,
  getPatrolActionState,
  hasPatrolSecondIssue,
  normalizePatrolDisasterType,
  parseStorageUploadDate,
  patrolQuarterRange,
  seoulToday,
} from '@/lib/patrol-inspection-utils'

/** 패트롤 점검 한 건 — 본부 불시점검 원본에 패트롤·지적유형과 사업 정보를 더한다. */
export interface PatrolInspection {
  id: string
  project_id: string
  project_name?: string
  managing_hq?: string
  managing_branch?: string
  /** 사업구분 (projects.project_category) */
  project_category?: string
  /** 총사업비, 백만원 단위 문자열 (projects.total_budget) */
  total_budget?: string
  /** 시공사명 (projects → user_profiles.company_name) */
  contractor_name?: string
  supervisor_position?: string
  supervisor_name?: string
  actual_work_address?: string
  site_address?: string
  inspection_date: string
  inspector_name: string
  issue_content1: string
  issue_content2?: string
  issue1_status: 'pending' | 'in_progress' | 'completed'
  issue2_status?: 'pending' | 'in_progress' | 'completed'
  site_photo_issue1?: string | null
  site_photo_issue2?: string | null
  action_photo_issue1?: string | null
  action_photo_issue2?: string | null
  patrol_car_used: boolean
  finding_type: HeadquartersFindingType
  created_at: string
}

/** PostgREST 한 페이지 최대 행수. */
const PAGE_SIZE = 1000

/** in() 필터 URL이 지나치게 길어지지 않도록 프로젝트 id를 나눠 조회한다. */
const PROJECT_ID_CHUNK = 80

const SELECT_COLUMNS = `
  id,
  project_id,
  inspection_date,
  inspector_name,
  issue_content1,
  issue_content2,
  issue1_status,
  issue2_status,
  site_photo_issue1,
  site_photo_issue2,
  action_photo_issue1,
  action_photo_issue2,
  patrol_car_used,
  finding_type,
  created_at,
  projects!inner (
    project_name,
    managing_hq,
    managing_branch,
    project_category,
    total_budget,
    supervisor_position,
    supervisor_name,
    actual_work_address,
    site_address,
    user_profiles ( company_name )
  )
`

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

interface PatrolRowProject {
  project_name?: string | null
  managing_hq?: string | null
  managing_branch?: string | null
  project_category?: string | null
  total_budget?: string | null
  supervisor_position?: string | null
  supervisor_name?: string | null
  actual_work_address?: string | null
  site_address?: string | null
  user_profiles?: { company_name?: string | null } | Array<{ company_name?: string | null }> | null
}

/** PostgREST가 돌려주는 행 모양 — 조인 결과는 객체나 배열로 올 수 있다. */
interface PatrolInspectionRow {
  id: string
  project_id: string
  inspection_date: string
  inspector_name?: string | null
  issue_content1?: string | null
  issue_content2?: string | null
  issue1_status?: string | null
  issue2_status?: string | null
  site_photo_issue1?: string | null
  site_photo_issue2?: string | null
  action_photo_issue1?: string | null
  action_photo_issue2?: string | null
  patrol_car_used?: boolean | null
  finding_type?: string | null
  created_at: string
  projects?: PatrolRowProject | PatrolRowProject[] | null
}

type IssueStatus = PatrolInspection['issue1_status']

function normalizeIssueStatus(value: unknown): IssueStatus | undefined {
  return value === 'pending' || value === 'in_progress' || value === 'completed' ? value : undefined
}

function transform(row: PatrolInspectionRow): PatrolInspection {
  const project: PatrolRowProject = (Array.isArray(row.projects) ? row.projects[0] : row.projects) ?? {}
  const profile = Array.isArray(project.user_profiles) ? project.user_profiles[0] : project.user_profiles

  return {
    id: row.id,
    project_id: row.project_id,
    project_name: project.project_name ?? undefined,
    managing_hq: project.managing_hq ?? undefined,
    managing_branch: project.managing_branch ?? undefined,
    project_category: project.project_category ?? undefined,
    total_budget: project.total_budget ?? undefined,
    contractor_name: profile?.company_name ?? undefined,
    supervisor_position: project.supervisor_position ?? undefined,
    supervisor_name: project.supervisor_name ?? undefined,
    actual_work_address: project.actual_work_address ?? undefined,
    site_address: project.site_address ?? undefined,
    inspection_date: row.inspection_date,
    inspector_name: row.inspector_name ?? '',
    issue_content1: row.issue_content1 ?? '',
    issue_content2: row.issue_content2 ?? undefined,
    issue1_status: normalizeIssueStatus(row.issue1_status) ?? 'pending',
    issue2_status: normalizeIssueStatus(row.issue2_status),
    site_photo_issue1: row.site_photo_issue1 ?? null,
    site_photo_issue2: row.site_photo_issue2 ?? null,
    action_photo_issue1: row.action_photo_issue1 ?? null,
    action_photo_issue2: row.action_photo_issue2 ?? null,
    patrol_car_used: Boolean(row.patrol_car_used),
    finding_type: normalizeHeadquartersFindingType(row.finding_type),
    created_at: row.created_at,
  }
}

/**
 * 주어진 프로젝트들의 해당 분기 패트롤 점검을 모두 가져온다.
 * RLS가 적용된 클라이언트를 쓰므로 사용자가 볼 수 없는 행은 애초에 내려오지 않는다.
 */
export async function getPatrolInspections(
  projectIds: string[],
  quarter: string
): Promise<PatrolInspection[]> {
  const uniqueIds = Array.from(new Set((projectIds ?? []).filter(Boolean)))
  if (uniqueIds.length === 0) return []

  const range = patrolQuarterRange(quarter)
  if (!range) throw new Error('분기 형식이 올바르지 않습니다. (예: 2026Q3)')

  const collected: PatrolInspection[] = []

  for (const ids of chunk(uniqueIds, PROJECT_ID_CHUNK)) {
    for (let page = 0; ; page++) {
      const { data, error } = await supabase
        .from('headquarters_inspections')
        .select(SELECT_COLUMNS)
        .in('project_id', ids)
        .eq('patrol_car_used', true)
        .gte('inspection_date', range.startDate)
        .lte('inspection_date', range.endDate)
        .order('inspection_date', { ascending: false })
        .order('id', { ascending: true })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

      if (error) {
        throw new Error(error.message || '패트롤 점검 조회에 실패했습니다.')
      }

      const rows = (data ?? []) as unknown as PatrolInspectionRow[]
      collected.push(...rows.map(transform))
      if (rows.length < PAGE_SIZE) break
    }
  }

  // 청크 단위로 모았으므로 전체 기준으로 다시 정렬한다.
  return collected.sort((a, b) => {
    if (a.inspection_date !== b.inspection_date) return a.inspection_date < b.inspection_date ? 1 : -1
    const nameA = a.project_name ?? ''
    const nameB = b.project_name ?? ''
    if (nameA !== nameB) return nameA < nameB ? -1 : 1
    return a.id < b.id ? -1 : 1
  })
}
