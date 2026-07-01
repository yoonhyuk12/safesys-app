// 프로젝트의 서명 주체별 미서명 총건수 집계 — 펜통 버튼 빨간 뱃지용

import { supabase } from '@/lib/supabase'
import { BULK_SIGN_SIGNERS, BulkSignSigner, BulkSignTarget, isJsonbUnsigned } from './bulk-sign-targets'

const countTarget = async (projectId: string, target: BulkSignTarget): Promise<number> => {
  // roleArray는 배열 내부 조건이라 서버 집계 불가 — 행을 받아 클라이언트 판정 (프로젝트 단위라 소량)
  if (target.jsonb?.kind === 'roleArray') {
    const spec = target.jsonb
    const { data, error } = await supabase
      .from(target.table)
      .select(`id, ${target.signColumn}`)
      .eq('project_id', projectId)
    if (error) {
      console.error(`미서명 건수 조회 실패 (${target.type}):`, error)
      return 0
    }
    return ((data || []) as unknown as Array<Record<string, unknown>>)
      .filter((row) => isJsonbUnsigned(row[target.signColumn], spec)).length
  }

  // 나머지는 head count — 행 데이터 미전송
  let query = supabase
    .from(target.table)
    .select(
      target.projectScope ? `id, ${target.projectScope.joinTable}!inner(project_id)` : 'id',
      { count: 'exact', head: true }
    )

  if (target.projectScope) {
    query = query.eq(`${target.projectScope.joinTable}.project_id`, projectId)
  } else {
    query = query.eq('project_id', projectId)
  }

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

  const { count, error } = await query
  if (error) {
    console.error(`미서명 건수 조회 실패 (${target.type}):`, error)
    return 0
  }
  return count ?? 0
}

export async function countUnsignedBySigner(projectId: string, signer: BulkSignSigner): Promise<number> {
  const counts = await Promise.all(
    BULK_SIGN_SIGNERS[signer].targets.map(async (target) => {
      try {
        return await countTarget(projectId, target)
      } catch (e) {
        console.error(`미서명 건수 조회 실패 (${target.type}):`, e)
        return 0
      }
    })
  )
  return counts.reduce((sum, c) => sum + c, 0)
}
