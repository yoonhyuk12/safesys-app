// 수동 입력 공정률 기준점 조회 — 프로젝트 카드/상세 페이지의 공정률 표시를
// 작업일보의 보간 계산과 동일하게 맞추기 위한 공용 헬퍼
// 같은 틱에 들어온 요청은 하나의 쿼리로 묶고(목록 뷰에서 카드 다수 렌더링 대비),
// 결과는 모듈 캐시에 보관 — 수동 공정률 저장 시 invalidateProgressAnchors로 무효화

import { supabase } from '@/lib/supabase'
import type { ProgressAnchor } from './work-daily-report-types'
import { combineScheduleAnchors, type WorkSchedule } from '@/lib/work-schedule/work-schedule-types'

const cache = new Map<string, ProgressAnchor[]>()

let pendingIds: Set<string> | null = null
let pendingPromise: Promise<void> | null = null

const flushPending = async (ids: string[]): Promise<void> => {
  try {
    // 예정공정표(스케줄)와 수동 입력 기준점을 한 틱에 함께 조회
    const [reportsRes, projectsRes] = await Promise.all([
      supabase
        .from('work_daily_reports')
        .select('project_id, report_date, progress_rate')
        .in('project_id', ids)
        .eq('progress_rate_manual', true),
      supabase
        .from('projects')
        .select('id, construction_start_date, construction_end_date, construction_schedule')
        .in('id', ids),
    ])
    if (reportsRes.error) throw new Error(reportsRes.error.message)
    if (projectsRes.error) throw new Error(projectsRes.error.message)

    // 수동 입력 기준점(일자 조정 공정률)
    const manualByProject = new Map<string, ProgressAnchor[]>(ids.map(id => [id, []]))
    for (const row of reportsRes.data || []) {
      const rate = parseFloat(row.progress_rate)
      if (!row.report_date || isNaN(rate)) continue
      manualByProject.get(row.project_id)?.push({ date: row.report_date, rate })
    }

    // 프로젝트별 예정공정표
    type ProjRow = { id: string; construction_start_date?: string | null; construction_end_date?: string | null; construction_schedule?: WorkSchedule | null }
    const projById = new Map<string, ProjRow>()
    for (const proj of (projectsRes.data || []) as ProjRow[]) projById.set(proj.id, proj)

    // 예정공정표가 있으면 수동 점과 조합(수동 점 통과 + 공정표 형태), 없으면 수동 기준점만
    for (const id of ids) {
      const proj = projById.get(id)
      const manual = manualByProject.get(id) ?? []
      const schedule = proj?.construction_schedule
      if (schedule?.items?.length) {
        cache.set(id, combineScheduleAnchors(schedule, proj?.construction_start_date, proj?.construction_end_date, manual))
      } else {
        cache.set(id, manual)
      }
    }
  } catch (err) {
    // 실패 시 캐시하지 않음 — 호출부는 기준점 없이 날짜 비례 계산으로 폴백
    console.error('공정률 기준점 조회 오류:', err)
  }
}

export async function getProgressAnchors(projectId: string): Promise<ProgressAnchor[]> {
  const cached = cache.get(projectId)
  if (cached) return cached

  if (!pendingIds) {
    const ids = new Set<string>()
    pendingIds = ids
    pendingPromise = new Promise<void>(resolve => {
      setTimeout(() => {
        pendingIds = null
        pendingPromise = null
        flushPending(Array.from(ids)).then(resolve)
      }, 0)
    })
  }
  pendingIds.add(projectId)
  await pendingPromise
  return cache.get(projectId) ?? []
}

// 수동 공정률 저장/삭제 후 호출 — 다음 조회 시 최신 기준점 반영
export function invalidateProgressAnchors(projectId?: string): void {
  if (projectId) {
    cache.delete(projectId)
  } else {
    cache.clear()
  }
}
