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

export const HEADQUARTERS_FINDING_TYPE_SELECTABLE_OPTIONS: ReadonlyArray<{ value: HeadquartersFindingType; label: string }> =
  HEADQUARTERS_FINDING_TYPE_OPTIONS.filter((option) => option.value !== 'not_applicable')

export const NO_ACTION_REQUIRED_TEXT = '해당 사항 없음'

export type FindingTypeAfterActionInput = {
  currentFindingType: unknown
  issue1Action: string | null | undefined
  issue2Action: string | null | undefined
  hasIssue2: boolean
}

// 조치 처리 후의 상태를 받아 저장해야 할 지적유형을 계산한다.
export function resolveFindingTypeAfterAction(input: FindingTypeAfterActionInput): HeadquartersFindingType {
  const issue1NoAction = input.issue1Action === NO_ACTION_REQUIRED_TEXT
  const issue2NoAction = input.hasIssue2 ? input.issue2Action === NO_ACTION_REQUIRED_TEXT : true

  if (issue1NoAction && issue2NoAction) {
    return 'not_applicable'
  }

  const current = normalizeHeadquartersFindingType(input.currentFindingType)
  return current === 'not_applicable' ? DEFAULT_HEADQUARTERS_FINDING_TYPE : current
}
