// 자재 수불부 화면 전환 중 프로젝트·자재·내역 snapshot을 미리 불러와 한 번 공유하는 캐시.

import { supabase } from '@/lib/supabase'

export type MaterialLedgerRawRecord = Record<string, unknown>

export interface MaterialLedgerSnapshot {
  project: MaterialLedgerRawRecord
  materials: MaterialLedgerRawRecord[]
  entries: MaterialLedgerRawRecord[]
}

interface SnapshotCacheEntry {
  promise: Promise<MaterialLedgerSnapshot>
  value?: MaterialLedgerSnapshot
  resolvedAt?: number
}

const SNAPSHOT_TTL_MS = 60_000
const snapshotCache = new Map<string, SnapshotCacheEntry>()

async function fetchMaterialLedgerSnapshot(projectId: string): Promise<MaterialLedgerSnapshot> {
  const [projectResult, materialsResult] = await Promise.all([
    supabase
      .from('projects')
      .select('*, user_profiles!projects_created_by_fkey(full_name)')
      .eq('id', projectId)
      .single(),
    supabase
      .from('materials')
      .select('*')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
  ])

  if (projectResult.error) throw new Error(projectResult.error.message)
  if (materialsResult.error) throw new Error(materialsResult.error.message)

  const project = projectResult.data as MaterialLedgerRawRecord
  const materials = (materialsResult.data || []) as MaterialLedgerRawRecord[]
  const materialIds = materials
    .map((material) => material.id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)

  let entries: MaterialLedgerRawRecord[] = []
  if (materialIds.length > 0) {
    const entriesResult = await supabase
      .from('material_ledger_entries')
      .select('*')
      .in('material_id', materialIds)
      .order('created_at', { ascending: true })

    if (entriesResult.error) throw new Error(entriesResult.error.message)
    entries = (entriesResult.data || []) as MaterialLedgerRawRecord[]
  }

  return { project, materials, entries }
}

export function prefetchMaterialLedgerSnapshot(
  projectId: string,
  options: { force?: boolean } = {},
): Promise<MaterialLedgerSnapshot> {
  const cached = snapshotCache.get(projectId)
  const isFresh = cached?.resolvedAt != null && Date.now() - cached.resolvedAt < SNAPSHOT_TTL_MS
  if (!options.force && cached && (cached.value ? isFresh : true)) return cached.promise
  if (cached && !isFresh) snapshotCache.delete(projectId)

  const promise = fetchMaterialLedgerSnapshot(projectId)
  const nextEntry: SnapshotCacheEntry = { promise }
  snapshotCache.set(projectId, nextEntry)

  promise.then(
    (snapshot) => {
      if (snapshotCache.get(projectId)?.promise !== promise) return
      nextEntry.value = snapshot
      nextEntry.resolvedAt = Date.now()
    },
    () => {
      if (snapshotCache.get(projectId)?.promise === promise) snapshotCache.delete(projectId)
    },
  )

  return promise
}

export function peekMaterialLedgerSnapshot(projectId: string): MaterialLedgerSnapshot | null {
  const cached = snapshotCache.get(projectId)
  if (!cached?.value || cached.resolvedAt == null) return null
  if (Date.now() - cached.resolvedAt >= SNAPSHOT_TTL_MS) {
    snapshotCache.delete(projectId)
    return null
  }
  return cached.value
}

export function invalidateMaterialLedgerSnapshot(projectId: string): void {
  snapshotCache.delete(projectId)
}
