// 본부불시점검 지적유형 코드·라벨과 정규화 로직을 모아둔다.

export type HeadquartersFindingType = 'work_stop' | 'corrective_action' | 'not_applicable'

export const DEFAULT_HEADQUARTERS_FINDING_TYPE: HeadquartersFindingType = 'corrective_action'

export const HEADQUARTERS_FINDING_TYPE_OPTIONS: ReadonlyArray<{ value: HeadquartersFindingType; label: string }> = [
  { value: 'work_stop', label: '작업중지' },
  { value: 'corrective_action', label: '시정조치' },
  { value: 'not_applicable', label: '해당없음' },
]

export function normalizeHeadquartersFindingType(value: unknown): HeadquartersFindingType {
  const matched = HEADQUARTERS_FINDING_TYPE_OPTIONS.find((option) => option.value === value)
  return matched ? matched.value : DEFAULT_HEADQUARTERS_FINDING_TYPE
}

export function headquartersFindingTypeLabel(value: unknown): string {
  const normalized = normalizeHeadquartersFindingType(value)
  const matched = HEADQUARTERS_FINDING_TYPE_OPTIONS.find((option) => option.value === normalized)
  return matched ? matched.label : ''
}
