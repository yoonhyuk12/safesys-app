// 수동 입력 공정률 기준점 조회 — 프로젝트 카드/상세 페이지의 공정률 표시를
// 작업일보의 보간 계산과 동일하게 맞추기 위한 공용 헬퍼
// 같은 틱에 들어온 요청은 하나의 쿼리로 묶고(목록 뷰에서 카드 다수 렌더링 대비),
// 결과는 모듈 캐시에 보관 — 수동 공정률 저장 시 invalidateProgressAnchors로 무효화

import { supabase } from '@/lib/supabase'
import type { ProgressAnchor } from './work-daily-report-types'

const cache = new Map<string, ProgressAnchor[]>()

let pendingIds: Set<string> | null = null
let pendingPromise: Promise<void> | null = null

const flushPending = async (ids: string[]): Promise<void> => {
  try {
    const { data, error } = await supabase
      .from('work_daily_reports')
      .select('project_id, report_date, progress_rate')
      .in('project_id', ids)
      .eq('progress_rate_manual', true)
    if (error) throw new Error(error.message)

    const byProject = new Map<string, ProgressAnchor[]>(ids.map(id => [id, []]))
    for (const row of data || []) {
      const rate = parseFloat(row.progress_rate)
      if (!row.report_date || isNaN(rate)) continue
      byProject.get(row.project_id)?.push({ date: row.report_date, rate })
    }
    byProject.forEach((anchors, id) => cache.set(id, anchors))
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
