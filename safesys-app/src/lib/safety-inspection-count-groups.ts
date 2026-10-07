// 정기안전점검 대장의 유형별 컬럼(해빙기·우기·종합·특별·특별(굴삭기)) 조회 그룹과 부분 조회 결과 병합 로직
import type { SafetyInspectionCountByProject } from './projects'
import { SPECIAL_287_TYPE, SPECIAL_770_TYPE } from './safety-inspection-types'

export type SafetyInspectionCountGroup = 'thawing' | 'rainy' | 'comprehensive' | 'special' | 'special770'

export const SAFETY_INSPECTION_COUNT_GROUPS: readonly SafetyInspectionCountGroup[] = [
  'thawing', 'rainy', 'comprehensive', 'special', 'special770',
]

/** 그룹마다 조회할 safety_inspections.inspection_type 값. */
export const SAFETY_INSPECTION_GROUP_TYPES: Record<SafetyInspectionCountGroup, string> = {
  thawing: '해빙기',
  rainy: '우기',
  comprehensive: '종합',
  special: SPECIAL_287_TYPE,
  special770: SPECIAL_770_TYPE,
}

type CountField = Exclude<keyof SafetyInspectionCountByProject, 'project_id' | 'project_name' | 'managing_hq' | 'managing_branch' | 'inspection_count'>

const GROUP_FIELDS: Record<SafetyInspectionCountGroup, CountField[]> = {
  thawing: ['thawing_count', 'thawing_findings', 'thawing_additional_findings', 'thawing_unresolved', 'thawing_unsigned'],
  rainy: ['rainy_count', 'rainy_findings', 'rainy_additional_findings', 'rainy_unresolved', 'rainy_unsigned'],
  comprehensive: ['comprehensive_count', 'comprehensive_findings', 'comprehensive_unresolved', 'comprehensive_unsigned'],
  special: ['special_count', 'special_findings', 'special_unresolved', 'special_unsigned'],
  special770: ['special770_count', 'special770_findings', 'special770_pending'],
}

const TOTAL_FIELDS: CountField[] = ['thawing_count', 'rainy_count', 'comprehensive_count', 'special_count', 'special770_count']

/**
 * 한 유형만 조회한 결과(incoming)를 기존 집계(base)에 덮어쓴다.
 * 해당 그룹 필드만 교체하고 다른 그룹 값은 유지하며, 총 실시 건수는 그룹별 건수 합으로 다시 계산한다.
 * 프로젝트 목록은 최신 조회 결과(incoming)를 따른다.
 */
export function mergeSafetyInspectionGroupCounts(
  base: SafetyInspectionCountByProject[],
  incoming: SafetyInspectionCountByProject[],
  group: SafetyInspectionCountGroup
): SafetyInspectionCountByProject[] {
  const baseMap = new Map(base.map(c => [c.project_id, c]))
  return incoming.map(next => {
    const prev = baseMap.get(next.project_id)
    const groupValues = Object.fromEntries(GROUP_FIELDS[group].map(f => [f, next[f]]))
    const merged: SafetyInspectionCountByProject = { ...(prev ?? next), ...groupValues }
    return { ...merged, inspection_count: TOTAL_FIELDS.reduce((sum, f) => sum + (merged[f] || 0), 0) }
  })
}
