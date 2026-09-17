// 순회점검대장의 초안·입력 검증·불변 편집과 데이터 저장을 담당한다.
import { supabase } from '@/lib/supabase'
import { PATROL_LEDGER_TABLE, type PatrolLedgerAiItem, type PatrolLedgerInspection, type PatrolLedgerItem, type PatrolLedgerPhotoKind, type PatrolLedgerResult } from '@/lib/patrol-ledger/types'

export interface PatrolLedgerDraft {
  inspection_date: string
  contractor_name: string
  district_name: string
  inspector_affiliation: string
  inspector_position: string
  inspector_name: string
  signature: string
  tbm_work_summary: string
  items: PatrolLedgerItem[]
  finding_text: string
  finding_photo_url: string | null
  finding_photo_kind: PatrolLedgerPhotoKind
  theme: string
}

export const PATROL_LEDGER_MISSING_TABLE = '순회점검대장이 아직 개설되지 않았습니다. 시스템 관리자에게 문의해주세요.'
export const PATROL_LEDGER_UPDATE_DENIED = '이 점검을 수정할 권한이 없습니다. 본인이 제출한 점검만 수정할 수 있습니다.'
const SELECT_COLUMNS = 'id, project_id, inspection_date, contractor_name, district_name, inspector_affiliation, inspector_position, inspector_name, signature, tbm_work_summary, items, finding_text, finding_photo_url, finding_photo_kind, theme, action_text, action_photo_url, action_date, created_by, created_at, updated_at'

function toError(error: { code?: string; message?: string }, fallback: string): Error {
  if (error.code === 'PGRST205' || error.code === '42P01' || /does not exist/i.test(error.message ?? '')) return new Error(PATROL_LEDGER_MISSING_TABLE)
  return new Error(error.message || fallback)
}

export function patrolLedgerToday(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function createPatrolLedgerDraft(init: { districtName: string; contractorName: string; inspectorName: string; inspectorAffiliation: string; inspectorPosition?: string }): PatrolLedgerDraft {
  return {
    inspection_date: patrolLedgerToday(), contractor_name: init.contractorName, district_name: init.districtName,
    inspector_affiliation: init.inspectorAffiliation, inspector_position: init.inspectorPosition ?? '', inspector_name: init.inspectorName,
    signature: '', tbm_work_summary: '', items: [], finding_text: '', finding_photo_url: null, finding_photo_kind: 'finding', theme: '',
  }
}

export function buildPatrolLedgerItems(aiItems: PatrolLedgerAiItem[]): PatrolLedgerItem[] {
  return aiItems.map((item, index) => ({ ...item, no: index + 1, result: '' }))
}
export function setPatrolLedgerItemResult(items: PatrolLedgerItem[], index: number, result: PatrolLedgerResult): PatrolLedgerItem[] {
  return items.map((item, at) => at === index ? { ...item, result } : item)
}
export function setPatrolLedgerItemText(items: PatrolLedgerItem[], index: number, text: string): PatrolLedgerItem[] {
  return items.map((item, at) => at === index ? { ...item, text } : item)
}
export function setAllPatrolLedgerResults(items: PatrolLedgerItem[], result: PatrolLedgerResult): PatrolLedgerItem[] {
  return items.map(item => ({ ...item, result }))
}
export function isBlankPatrolLedgerSignature(value: unknown): boolean {
  return typeof value !== 'string' || value.length < 200 || !/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(value)
}
export function validatePatrolLedgerDraft(draft: PatrolLedgerDraft): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.inspection_date) || !Number.isFinite(Date.parse(draft.inspection_date)) || new Date(draft.inspection_date).toISOString().slice(0, 10) !== draft.inspection_date) return '점검일을 올바르게 입력해주세요.'
  if (!draft.inspector_name.trim()) return '점검자 성명을 입력해주세요.'
  if (/[\r\n]/.test(draft.inspector_name)) return '점검자 성명은 한 줄로 입력해주세요.'
  if (draft.inspector_name.length > 100) return '점검자 성명은 100자 이하로 입력해주세요.'
  if (isBlankPatrolLedgerSignature(draft.signature)) return '점검자 서명을 입력해주세요.'
  if (!Array.isArray(draft.items) || draft.items.length < 1 || draft.items.length > 10) return '점검항목은 1~10건이어야 합니다.'
  for (const item of draft.items) {
    if (!item || typeof item.text !== 'string' || !item.text.trim()) return '점검항목 문구를 비워둘 수 없습니다.'
    if (!Number.isInteger(item.no) || item.no < 1 || item.no > 10 || !['작업장 공통', '테마'].includes(item.category) || !['양호', '미흡', ''].includes(item.result)) return '점검항목 형식이 올바르지 않습니다.'
  }
  return null
}

function copyDraft(record: PatrolLedgerDraft): PatrolLedgerDraft {
  return {
    inspection_date: record.inspection_date, contractor_name: record.contractor_name, district_name: record.district_name,
    inspector_affiliation: record.inspector_affiliation, inspector_position: record.inspector_position, inspector_name: record.inspector_name,
    signature: record.signature, tbm_work_summary: record.tbm_work_summary, items: record.items.map(item => ({ ...item })),
    // 전경사진이면 지적사항은 없다 — DB CHECK와 같은 규칙을 저장 전에 맞춘다.
    finding_text: record.finding_photo_kind === 'overview' ? '' : record.finding_text,
    finding_photo_url: record.finding_photo_url,
    finding_photo_kind: record.finding_photo_kind,
    theme: record.theme,
  }
}
export function patrolLedgerToDraft(record: PatrolLedgerInspection): PatrolLedgerDraft {
  return copyDraft(record)
}
export async function getPatrolLedgerInspections(projectId: string): Promise<PatrolLedgerInspection[]> {
  if (!projectId) return []
  const { data, error } = await supabase.from(PATROL_LEDGER_TABLE).select(SELECT_COLUMNS).eq('project_id', projectId).order('inspection_date', { ascending: false }).order('created_at', { ascending: false })
  if (error) throw toError(error, '순회점검대장 조회에 실패했습니다.')
  return (data ?? []) as PatrolLedgerInspection[]
}
export async function countPatrolLedgerInspections(projectId: string): Promise<number> {
  if (!projectId) return 0
  const { count, error } = await supabase.from(PATROL_LEDGER_TABLE).select('id', { count: 'exact', head: true }).eq('project_id', projectId)
  if (error) throw toError(error, '순회점검대장 건수 조회에 실패했습니다.')
  return count ?? 0
}
export async function createPatrolLedgerInspection(projectId: string, userId: string, draft: PatrolLedgerDraft): Promise<PatrolLedgerInspection> {
  const invalid = validatePatrolLedgerDraft(draft)
  if (invalid) throw new Error(invalid)
  if (!userId) throw new Error('로그인이 필요합니다.')
  if (!projectId) throw new Error('프로젝트를 찾을 수 없습니다.')
  const { data, error } = await supabase.from(PATROL_LEDGER_TABLE).insert([{ ...copyDraft(draft), project_id: projectId, created_by: userId }]).select(SELECT_COLUMNS).single()
  if (error) throw toError(error, '순회점검 제출에 실패했습니다.')
  return data as PatrolLedgerInspection
}
export async function updatePatrolLedgerInspection(id: string, draft: PatrolLedgerDraft): Promise<PatrolLedgerInspection> {
  const invalid = validatePatrolLedgerDraft(draft)
  if (invalid) throw new Error(invalid)
  const { data, error } = await supabase.from(PATROL_LEDGER_TABLE).update({ ...copyDraft(draft), updated_at: new Date().toISOString() }).eq('id', id).select(SELECT_COLUMNS).maybeSingle()
  if (error) throw toError(error, '순회점검 수정에 실패했습니다.')
  if (!data) throw new Error(PATROL_LEDGER_UPDATE_DENIED)
  return data as PatrolLedgerInspection
}
export async function deletePatrolLedgerInspection(id: string): Promise<void> {
  const { data, error } = await supabase.from(PATROL_LEDGER_TABLE).delete().eq('id', id).select('id')
  if (error) throw toError(error, '순회점검 삭제에 실패했습니다.')
  if (!data?.length) throw new Error('이 점검을 삭제할 권한이 없거나 이미 삭제되었습니다.')
}
const PHOTO_BUCKET = 'safety-inspection-photos'

/** 원본 파일이든 ImageEditor가 만든 크롭·회전 Blob이든 같은 경로 규칙으로 올린다. */
export async function uploadPatrolLedgerPhoto(projectId: string, file: File | Blob): Promise<string> {
  const rawName = file instanceof File ? file.name : 'edited.jpg'
  const safeName = rawName.replace(/[^A-Za-z0-9._-]/g, '_') || 'photo'
  const path = `patrol-ledger/${projectId}/${Date.now()}_${safeName}`
  const bucket = supabase.storage.from(PHOTO_BUCKET)
  const { error } = await bucket.upload(path, file, file instanceof File ? undefined : { contentType: file.type || 'image/jpeg' })
  if (error) throw new Error('점검사진 업로드에 실패했습니다.')
  return bucket.getPublicUrl(path).data.publicUrl
}

/** 공개 URL에서 버킷 안 경로를 꺼낸다. 이 버킷 URL이 아니면 null이다. */
export function patrolLedgerPhotoStoragePath(url: string): string | null {
  const path = url.split(`/${PHOTO_BUCKET}/`)[1]
  return path ? decodeURIComponent(path) : null
}

/** 크롭·회전으로 교체된 옛 사진을 지운다. 실패해도 저장 흐름을 막지 않도록 조용히 넘어간다. */
export async function removePatrolLedgerPhoto(url: string): Promise<void> {
  const path = patrolLedgerPhotoStoragePath(url)
  if (!path) return
  await supabase.storage.from(PHOTO_BUCKET).remove([path])
}
