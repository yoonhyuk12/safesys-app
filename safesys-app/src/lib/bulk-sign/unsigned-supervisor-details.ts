// 감독 미서명 문서 상세 목록 조회 — 현장 AI 비서 브리핑용(서버 전용)

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  BULK_SIGN_SIGNERS,
  isJsonbUnsigned,
  type BulkSignTarget,
} from './bulk-sign-targets'

export interface UnsignedTargetDetail {
  label: string
  count: number
  items: Array<{ id: string; date: string | null }>
}

const TARGET_DATE_COLUMNS: Record<string, string> = {
  manager_inspections: 'inspection_date',
  headquarters_inspections: 'inspection_date',
  safety_inspections: 'inspection_date',
  ptw_permits: 'permit_date',
  inspection_requests: 'request_date',
  inspection_visit_logs: 'visit_date',
  quality_test_records: 'test_date',
  quality_verification_requests: 'request_date',
  quality_summary_reports: 'report_date',
  corrective_action_issues: 'inspection_date',
  material_ledger_entries: 'receive_date',
}

const getDateColumn = (target: BulkSignTarget): string =>
  TARGET_DATE_COLUMNS[target.table] ?? 'created_at'

const toItems = (
  rows: Array<Record<string, unknown>>,
  dateColumn: string
): UnsignedTargetDetail['items'] => rows.slice(0, 10).map((row) => ({
  id: String(row.id),
  date: typeof row[dateColumn] === 'string' ? row[dateColumn] : null,
}))

async function getRoleArrayDetails(
  client: SupabaseClient,
  projectId: string,
  target: BulkSignTarget
): Promise<UnsignedTargetDetail> {
  const dateColumn = getDateColumn(target)
  const { data, error } = await client
    .from(target.table)
    .select(`id, ${dateColumn}, ${target.signColumn}`)
    .eq('project_id', projectId)
    .order(dateColumn, { ascending: false })

  if (error) throw error
  const rows = (data || []) as unknown as Array<Record<string, unknown>>
  const unsignedRows = rows.filter((row) =>
    target.jsonb ? isJsonbUnsigned(row[target.signColumn], target.jsonb) : false
  )
  return { label: target.title, count: unsignedRows.length, items: toItems(unsignedRows, dateColumn) }
}

async function getFilteredDetails(
  client: SupabaseClient,
  projectId: string,
  target: BulkSignTarget
): Promise<UnsignedTargetDetail> {
  const dateColumn = getDateColumn(target)
  const selectColumns = target.projectScope
    ? `id, ${dateColumn}, ${target.projectScope.joinTable}!inner(project_id)`
    : `id, ${dateColumn}`
  let query = client.from(target.table).select(selectColumns, { count: 'exact' })

  query = target.projectScope
    ? query.eq(`${target.projectScope.joinTable}.project_id`, projectId)
    : query.eq('project_id', projectId)

  if (target.jsonb?.kind === 'keyedObject') {
    const path = `${target.signColumn}->${target.jsonb.key}`
    query = query
      .not(path, 'is', null)
      .or(`${path}->>${target.jsonb.field}.is.null,${path}->>${target.jsonb.field}.eq.`)
  } else if (target.unsignedBoolColumn) {
    query = query.eq(target.unsignedBoolColumn, false)
  } else {
    query = query.or(`${target.signColumn}.is.null,${target.signColumn}.eq.`)
  }

  const { data, count, error } = await query
    .order(dateColumn, { ascending: false })
    .limit(10)
  if (error) throw error
  const rows = (data || []) as unknown as Array<Record<string, unknown>>
  return { label: target.title, count: count ?? 0, items: toItems(rows, dateColumn) }
}

async function getTargetDetails(
  client: SupabaseClient,
  projectId: string,
  target: BulkSignTarget
): Promise<UnsignedTargetDetail> {
  try {
    return target.jsonb?.kind === 'roleArray'
      ? await getRoleArrayDetails(client, projectId, target)
      : await getFilteredDetails(client, projectId, target)
  } catch (error) {
    console.error(`감독 미서명 상세 조회 실패 (${target.type}):`, error)
    return { label: target.title, count: 0, items: [] }
  }
}

export async function getUnsignedSupervisorDetails(
  client: SupabaseClient,
  projectId: string
): Promise<UnsignedTargetDetail[]> {
  return Promise.all(
    BULK_SIGN_SIGNERS.supervisor.targets.map((target) =>
      getTargetDetails(client, projectId, target)
    )
  )
}
