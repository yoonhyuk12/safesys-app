// TBM 텔레그램 prepare/send 라우트 공용 — 프로젝트 해석(id 우선, 이름 정확 일치 폴백) 헬퍼
import type { SupabaseClient } from '@supabase/supabase-js'

export interface ProjectItemRef {
  projectId: string | null
  projectName: string
}

export interface ResolvedProject {
  id: string
  project_name: string
  project_category: string | null
  managing_hq: string | null
  managing_branch: string | null
  client_telegram_id: string | null
  contractor_telegram_id: string | null
  client_app_code: string | null
  contractor_app_code: string | null
}

const PROJECT_COLUMNS = 'id, project_name, project_category, managing_hq, managing_branch, client_telegram_id, contractor_telegram_id, client_app_code, contractor_app_code'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_PROJECT_NAME_LENGTH = 200

export function isCanonicalUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

export function isProjectItemRef(value: unknown): value is ProjectItemRef {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  const hasValidProjectId = item.projectId === null || isCanonicalUuid(item.projectId)
  return hasValidProjectId && (
    typeof item.projectName === 'string' &&
    item.projectName.trim().length > 0 &&
    item.projectName.length <= MAX_PROJECT_NAME_LENGTH
  )
}

/**
 * items 순서대로 프로젝트를 해석한다.
 * 매칭 우선순위는 ① projectId 일치 ② project_name 정확 일치이며, 못 찾으면 null.
 */
export async function resolveProjects(
  supabase: SupabaseClient,
  items: ProjectItemRef[]
): Promise<(ResolvedProject | null)[]> {
  const ids = [...new Set(
    items
      .map((item) => item.projectId)
      .filter(isCanonicalUuid)
  )]
  const names = [...new Set(
    items.map((item) => item.projectName)
  )]

  const rows: ResolvedProject[] = []

  if (ids.length > 0) {
    const { data, error } = await supabase
      .from('projects')
      .select(PROJECT_COLUMNS)
      .in('id', ids)
    if (error) {
      console.error('프로젝트 id 조회 오류:', error)
      throw new Error('프로젝트 조회 중 오류가 발생했습니다.')
    }
    rows.push(...((data ?? []) as ResolvedProject[]))
  }

  if (names.length > 0) {
    const { data, error } = await supabase
      .from('projects')
      .select(PROJECT_COLUMNS)
      .in('project_name', names)
    if (error) {
      console.error('프로젝트 이름 조회 오류:', error)
      throw new Error('프로젝트 조회 중 오류가 발생했습니다.')
    }
    rows.push(...((data ?? []) as ResolvedProject[]))
  }

  const uniqueRows = new Map<string, ResolvedProject>()
  for (const row of rows) {
    if (!uniqueRows.has(row.id)) uniqueRows.set(row.id, row)
  }

  const byId = new Map<string, ResolvedProject>()
  const projectsByName = new Map<string, ResolvedProject[]>()
  for (const row of uniqueRows.values()) {
    byId.set(row.id, row)
    const sameName = projectsByName.get(row.project_name) ?? []
    projectsByName.set(row.project_name, [...sameName, row])
  }

  const byUniqueName = new Map<string, ResolvedProject>()
  for (const [name, sameName] of projectsByName) {
    if (sameName.length === 1) byUniqueName.set(name, sameName[0])
  }

  return items.map((item) => {
    if (item.projectId) {
      const matched = byId.get(item.projectId)
      if (matched) return matched
    }
    return byUniqueName.get(item.projectName) ?? null
  })
}
