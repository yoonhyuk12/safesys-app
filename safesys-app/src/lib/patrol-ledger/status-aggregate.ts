// 순회점검 주간 범위·점검 대상 판정과 본부·지사·현장별 집계(등록 현장·분기 대상·TBM·순회점검)를 담당한다.
import type { Project } from '@/lib/projects'
import type { PatrolLedgerInspection } from '@/lib/patrol-ledger/types'

export type PatrolStatusProject = Pick<Project, 'id' | 'project_name' | 'managing_hq' | 'managing_branch' | 'is_active'>
export type PatrolStatusInspection = Pick<PatrolLedgerInspection,
  'id' | 'project_id' | 'inspection_date' | 'inspector_name' | 'items' | 'finding_photo_kind' | 'finding_photo_url' | 'theme'>
export interface PatrolStatusRange { start: string; end: string }
export interface PatrolStatusTotals {
  /** 등록 프로젝트 수 — 활성 여부와 무관한 관할 현장 수 */
  registeredCount: number
  /** 선택 주가 속한 분기의 점검 대상(공사중) 현장 수 */
  targetCount: number
  /** 선택 주 TBM 제출 건수 */
  tbmCount: number
  /** 선택 주 순회점검 건수 */
  inspectionCount: number
  poorCount: number
  photoCount: number
  /** 점검 대상 중 순회점검이 한 건도 없는 현장 수 */
  uninspectedCount: number
}
export interface PatrolStatusRow extends PatrolStatusTotals {
  id: string
  name: string
  hq: string
  branch: string
  isTarget: boolean
  lastInspectionDate: string
  inspectorName: string
  themes: string
}
export interface PatrolStatusGroup extends PatrolStatusTotals {
  id: string
  name: string
  hq: string
  branch: string
}

const EMPTY_TOTALS: PatrolStatusTotals = {
  registeredCount: 0, targetCount: 0, tbmCount: 0, inspectionCount: 0, poorCount: 0, photoCount: 0, uninspectedCount: 0,
}

/** 월요일 문자열을 기준으로 월~일 범위를 구한다. UTC 달력 연산으로 시간대 영향을 피한다. */
export function patrolStatusWeekRange(weekStart: string, offset = 0): PatrolStatusRange {
  const date = new Date(`${weekStart}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + offset * 7)
  const start = date.toISOString().slice(0, 10)
  date.setUTCDate(date.getUTCDate() + 6)
  return { start, end: date.toISOString().slice(0, 10) }
}

/** 선택 주가 시작하는 날의 분기(1~4). 표 머리글 "N분기 점검 대상"에 쓴다. */
export function patrolStatusQuarter(range: PatrolStatusRange): number {
  return Math.floor(Number(range.start.slice(5, 7)) / 3 - 1 / 3) + 1
}

/** 분기 경계를 지나는 주는 어느 한 분기라도 활성인 현장을 포함한다. 구형 true도 인정한다. */
export function isPatrolStatusProjectActive(project: PatrolStatusProject, range: PatrolStatusRange): boolean {
  const active = project.is_active
  if (typeof active === 'boolean') return active
  if (!active) return false
  const day = new Date(`${range.start}T00:00:00Z`)
  while (day.toISOString().slice(0, 10) <= range.end) {
    const quarter = `q${Math.floor(day.getUTCMonth() / 3) + 1}` as 'q1' | 'q2' | 'q3' | 'q4'
    if (active[quarter] === true) return true
    day.setUTCDate(day.getUTCDate() + 1)
  }
  return false
}

export function sumPatrolStatus(rows: PatrolStatusTotals[]): PatrolStatusTotals {
  return rows.reduce((sum, row) => ({
    registeredCount: sum.registeredCount + row.registeredCount,
    targetCount: sum.targetCount + row.targetCount,
    tbmCount: sum.tbmCount + row.tbmCount,
    inspectionCount: sum.inspectionCount + row.inspectionCount,
    poorCount: sum.poorCount + row.poorCount,
    photoCount: sum.photoCount + row.photoCount,
    uninspectedCount: sum.uninspectedCount + row.uninspectedCount,
  }), { ...EMPTY_TOTALS })
}

/** 비고 칸 문구. 미점검 현장과 미흡 항목이 있을 때만 적고, 없으면 '-'다. */
export function patrolStatusRemark(totals: PatrolStatusTotals): string {
  const parts: string[] = []
  if (totals.uninspectedCount > 0) parts.push(`미점검 ${totals.uninspectedCount}`)
  if (totals.poorCount > 0) parts.push(`미흡 ${totals.poorCount}`)
  return parts.join(' · ') || '-'
}

/**
 * 관할 현장 전체를 행으로 만든다. 등록 프로젝트 수는 전체, 점검 대상은 선택 주 분기에 공사중인 현장,
 * TBM·순회점검 건수는 선택 주 안의 제출·기록 수다. 미점검은 점검 대상인데 순회점검이 없는 현장이다.
 */
export function aggregatePatrolStatus(
  projects: PatrolStatusProject[],
  inspections: PatrolStatusInspection[],
  range: PatrolStatusRange,
  tbmCounts: ReadonlyMap<string, number> = new Map(),
): PatrolStatusRow[] {
  const byProject = new Map<string, PatrolStatusInspection[]>()
  for (const inspection of inspections) {
    if (inspection.inspection_date < range.start || inspection.inspection_date > range.end) continue
    const group = byProject.get(inspection.project_id) ?? []
    group.push(inspection)
    byProject.set(inspection.project_id, group)
  }
  return projects.map(project => {
    const records = (byProject.get(project.id) ?? []).sort((a, b) =>
      b.inspection_date.localeCompare(a.inspection_date) || b.id.localeCompare(a.id))
    const isTarget = isPatrolStatusProjectActive(project, range)
    return {
      id: project.id, name: project.project_name, hq: project.managing_hq || '', branch: project.managing_branch || '',
      isTarget,
      registeredCount: 1, targetCount: isTarget ? 1 : 0, tbmCount: tbmCounts.get(project.id) ?? 0,
      inspectionCount: records.length,
      poorCount: records.reduce((count, row) => count + row.items.filter(item => item.result === '미흡').length, 0),
      photoCount: records.filter(row => row.finding_photo_kind === 'finding' && row.finding_photo_url).length,
      uninspectedCount: isTarget && records.length === 0 ? 1 : 0,
      lastInspectionDate: records[0]?.inspection_date ?? '',
      inspectorName: records[0]?.inspector_name ?? '',
      themes: Array.from(new Set(records.map(row => row.theme?.trim()).filter(Boolean))).join(' / '),
    }
  })
}

/** 직제 순서. hqs는 본부 순서, branches는 본부별 지사 순서(BRANCH_OPTIONS 형태). 목록에 없는 이름은 뒤에 가나다순으로 둔다. */
export interface PatrolStatusOrgOrder {
  hqs: string[]
  branches: Record<string, string[]>
}

function orgRank(list: string[] | undefined, name: string): number {
  const index = list?.indexOf(name) ?? -1
  return index === -1 ? Number.MAX_SAFE_INTEGER : index
}

export function groupPatrolStatus(rows: PatrolStatusRow[], level: 'hq' | 'branch', order?: PatrolStatusOrgOrder): PatrolStatusGroup[] {
  const groups = new Map<string, PatrolStatusRow[]>()
  for (const row of rows) {
    const key = JSON.stringify(level === 'hq' ? [row.hq] : [row.hq, row.branch])
    const group = groups.get(key) ?? []
    group.push(row)
    groups.set(key, group)
  }
  return Array.from(groups, ([id, group]) => ({
    id, name: (level === 'hq' ? group[0].hq : group[0].branch) || '미지정',
    hq: group[0].hq, branch: level === 'hq' ? '' : group[0].branch,
    ...sumPatrolStatus(group),
  })).sort((a, b) =>
    orgRank(order?.hqs, a.hq) - orgRank(order?.hqs, b.hq)
    || a.hq.localeCompare(b.hq, 'ko')
    || orgRank(order?.branches[a.hq], a.branch) - orgRank(order?.branches[b.hq], b.branch)
    || a.name.localeCompare(b.name, 'ko'))
}
