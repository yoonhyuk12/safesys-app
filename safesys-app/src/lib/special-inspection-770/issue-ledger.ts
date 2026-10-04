// 770 부적정 항목을 관리대장 행으로 변환하고 최신 원본 JSON의 조치만 갱신한다.
import type { SupabaseClient } from '@supabase/supabase-js'
import { inspectionFindings } from '@/lib/special-inspection-770/summary'
import type { Special770InspectionData, Special770ItemResult } from '@/lib/special-inspection-770/types'

export interface Special770IssueSource {
  kind: 'safety_770'
  inspectionId: string
  excavatorId: string
  code: string
}

type ActionPatch = Pick<Special770ItemResult, 'action' | 'after_photo_url'>

export function special770LedgerRows(inspectionId: string, data: Special770InspectionData | null | undefined) {
  return inspectionFindings(data).map(row => ({
    key: `s770-${JSON.stringify([inspectionId, row.excavatorId, row.code])}`,
    source: { kind: 'safety_770' as const, inspectionId, excavatorId: row.excavatorId, code: row.code },
    location: [row.vehicleNo, row.code, row.itemText].filter(Boolean).join(' · '),
    findingText: row.result.finding?.trim() || row.itemText,
    beforePhotoUrl: row.result.before_photo_url || null,
    actionText: row.result.action || null,
    afterPhotoUrl: row.completed ? row.result.after_photo_url! : null,
  }))
}

export function patchSpecial770Action(data: Special770InspectionData | null, excavatorId: string, code: string, patch: ActionPatch): Special770InspectionData {
  const matches = data?.excavators.filter(ex => ex.id === excavatorId) ?? []
  if (!excavatorId || matches.length !== 1 || matches[0].items[code]?.judgement !== '부적정') {
    throw new Error('원본 지적사항이 변경되었습니다. 새로고침 후 다시 시도해 주세요.')
  }
  return {
    ...data!,
    excavators: data!.excavators.map(ex => ex.id === excavatorId
      ? { ...ex, items: { ...ex.items, [code]: { ...ex.items[code], ...patch } } }
      : ex),
  }
}

export async function saveSpecial770Action(client: SupabaseClient, projectId: string, source: Omit<Special770IssueSource, 'kind'>, patch: ActionPatch) {
  const { data, error } = await client.from('safety_inspections')
    .select('excavator_inspection').eq('id', source.inspectionId).eq('project_id', projectId).single()
  if (error) throw error
  const updated = patchSpecial770Action(data?.excavator_inspection, source.excavatorId, source.code, patch)
  const { data: saved, error: saveError } = await client.from('safety_inspections')
    .update({ excavator_inspection: updated }).eq('id', source.inspectionId).eq('project_id', projectId)
    // 읽은 뒤 다른 저장이 발생했다면 전체 JSON을 덮어쓰지 않는다.
    .eq('excavator_inspection', JSON.stringify(data.excavator_inspection)).select('id').maybeSingle()
  if (saveError) throw saveError
  if (!saved) throw new Error('원본 지적사항이 변경되었습니다. 새로고침 후 다시 시도해 주세요.')
}
