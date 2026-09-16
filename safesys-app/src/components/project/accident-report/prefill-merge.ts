// 문서에서 읽은 사고 초안을 현재 입력 중인 초안에 합칠 방법을 계산하는 순수 함수

import {
  ACCIDENT_COMP_CLAIM_OPTIONS,
  ACCIDENT_SEVERITY_OPTIONS,
  ACCIDENT_TYPE_OPTIONS,
  type AccidentFormInput,
} from '@/lib/accident-analysis-types'
import {
  ACCIDENT_REPORT_TEXT_KEYS,
  ACCIDENT_REPORT_TEXT_LABELS,
  normalizeAccidentReportDetails,
  type AccidentNotificationTarget,
  type AccidentReportDetails,
  type AccidentVictimAction,
} from '@/lib/accident-report'

/** 사고 입력 모달이 들고 있는 초안. 모든 입력값을 문자열로 담는다. */
export interface AccidentDraft {
  projectId: string
  externalProjectName: string
  externalManagingHq: string
  externalManagingBranch: string
  isExternal: boolean
  accidentAt: string
  severity: AccidentFormInput['severity']
  accidentType: string
  location: string
  workDescription: string
  description: string
  cause: string
  preventionAction: string
  injuredCount: string
  fatalCount: string
  lostWorkdays: string
  workersCompClaim: AccidentFormInput['workers_comp_claim']
  /** 사고발생보고서 추가 항목. 보고서 모드에서만 화면에 나온다. */
  reportDetails: AccidentReportDetails
}

/**
 * 문서에서 읽어 온 초안 값. 전부 선택이며 사진은 어떤 경로로도 받지 않으므로 report_details도 부분값이다.
 */
export type AccidentPrefillDraftFields = Partial<Omit<AccidentFormInput, 'report_details'>> & {
  report_details?: Partial<AccidentReportDetails>
}

export interface PrefillMergePlan {
  /** 이미 적혀 있는데 문서 값과 다른 항목의 라벨. 비어 있으면 바로 채워도 된다. */
  conflicts: string[]
  /** 문서에서 채울 것이 하나라도 있으면 참 */
  hasChanges: boolean
  /** 비어 있는 칸만 채운 초안 */
  fillEmpty: AccidentDraft
  /** 충돌 항목까지 문서 값으로 바꾼 초안 */
  overwrite: AccidentDraft
}

interface FieldChange {
  label: string
  conflict: boolean
  apply: (draft: AccidentDraft) => AccidentDraft
}

const DATE_PREFIX_PATTERN = /^\d{4}-\d{2}-\d{2}/

const isSeverity = (value: unknown): value is AccidentFormInput['severity'] =>
  typeof value === 'string' && ACCIDENT_SEVERITY_OPTIONS.some((option) => option.value === value)

const isCompClaim = (value: unknown): value is AccidentFormInput['workers_comp_claim'] =>
  typeof value === 'string' && ACCIDENT_COMP_CLAIM_OPTIONS.some((option) => option.value === value)

const isAccidentType = (value: unknown): value is string =>
  typeof value === 'string' && ACCIDENT_TYPE_OPTIONS.some((option) => option.value === value)

const asFilledText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/** 본 항목의 화면 입력 상한(모달 maxLength와 같은 숫자). 문서 초안이 타이핑 상한을 우회하지 않게 자른다. */
const CORE_FIELD_MAX_LENGTH = { location: 200, workDescription: 500, description: 2000, cause: 2000, preventionAction: 2000 } as const
const asCoreText = (value: unknown, key: keyof typeof CORE_FIELD_MAX_LENGTH): string =>
  asFilledText(value).slice(0, CORE_FIELD_MAX_LENGTH[key]).trim()

const asCountText = (value: unknown): string =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 ? String(value) : ''

/**
 * 사용자가 손대지 않은 칸인지 판단한다.
 * 비어 있으면 언제나 참이고, 신규 등록의 기본값(baseline)을 아는 경우에만 그 값과 같은 칸도 손대지 않은 칸으로 본다.
 * baseline이 없으면(저장된 기록을 수정하는 경우) 적혀 있는 값은 사용자가 확인한 값이므로 참이 아니다.
 */
const isUntouched = (
  current: string,
  baseline: string | undefined,
  emptyEquivalents: readonly string[] = [],
): boolean => {
  if (current.trim() === '') return true
  if (baseline === undefined) return false
  return current === baseline || emptyEquivalents.includes(current)
}

const sameMembers = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((item) => b.includes(item))

/**
 * 문서에서 읽은 fields를 draft에 합칠 두 가지 결과(빈 칸만 채우기·덮어쓰기)와 충돌 목록을 만든다.
 * project_id·미등록 현장 항목과 사진은 문서가 무엇을 주든 건드리지 않고, 값이 빈 항목도 건드리지 않는다.
 * baseline은 신규 등록에서 자동으로 채워진 기본값(오늘 날짜·경상·첫 사고 유형·0명·산재 미확인)이며,
 * 그 값 그대로인 칸은 "사용자가 적지 않은 칸"으로 본다.
 * 저장된 기록을 수정할 때는 baseline을 넘기지 않는다 — 저장돼 있던 값은 사용자가 확인한 값이라 충돌로 잡아야 한다.
 */
export function planPrefillMerge(
  draft: AccidentDraft,
  fields: AccidentPrefillDraftFields,
  baseline?: AccidentDraft,
): PrefillMergePlan {
  const changes: FieldChange[] = []

  const pushText = (
    label: string,
    value: string,
    current: string,
    baselineValue: string | undefined,
    apply: (draft: AccidentDraft, value: string) => AccidentDraft,
    emptyEquivalents: readonly string[] = [],
  ) => {
    if (!value || value === current) return
    changes.push({
      label,
      conflict: !isUntouched(current, baselineValue, emptyEquivalents),
      apply: (target) => apply(target, value),
    })
  }

  const accidentAt = asFilledText(fields.accident_at)
  if (DATE_PREFIX_PATTERN.test(accidentAt)) {
    pushText('사고일자', accidentAt.slice(0, 10), draft.accidentAt, baseline?.accidentAt, (target, value) => ({
      ...target,
      accidentAt: value,
    }))
  }

  if (isSeverity(fields.severity)) {
    const severity = fields.severity
    pushText('중대도', severity, draft.severity, baseline?.severity, (target) => ({ ...target, severity }))
  }

  if (isAccidentType(fields.accident_type)) {
    pushText('사고 유형', fields.accident_type, draft.accidentType, baseline?.accidentType, (target, value) => ({
      ...target,
      accidentType: value,
    }))
  }

  if (isCompClaim(fields.workers_comp_claim)) {
    const claim = fields.workers_comp_claim
    pushText('산재신청 여부', claim, draft.workersCompClaim, baseline?.workersCompClaim, (target) => ({
      ...target,
      workersCompClaim: claim,
    }))
  }

  pushText('사고 장소', asCoreText(fields.location, 'location'), draft.location, baseline?.location, (target, value) => ({
    ...target,
    location: value,
  }))
  pushText('사고 당시 작업', asCoreText(fields.work_description, 'workDescription'), draft.workDescription, baseline?.workDescription, (target, value) => ({
    ...target,
    workDescription: value,
  }))
  pushText('사고 개요', asCoreText(fields.description, 'description'), draft.description, baseline?.description, (target, value) => ({
    ...target,
    description: value,
  }))
  pushText('사고 원인', asCoreText(fields.cause, 'cause'), draft.cause, baseline?.cause, (target, value) => ({
    ...target,
    cause: value,
  }))
  pushText('재발방지 대책', asCoreText(fields.prevention_action, 'preventionAction'), draft.preventionAction, baseline?.preventionAction, (target, value) => ({
    ...target,
    preventionAction: value,
  }))

  // 0은 "아직 적지 않음"과 구분되지 않으므로 빈 칸으로 본다.
  pushText('부상자 수', asCountText(fields.injured_count), draft.injuredCount, baseline?.injuredCount, (target, value) => ({
    ...target,
    injuredCount: value,
  }), ['0'])
  pushText('사망자 수', asCountText(fields.fatal_count), draft.fatalCount, baseline?.fatalCount, (target, value) => ({
    ...target,
    fatalCount: value,
  }), ['0'])
  pushText('휴업일수', asCountText(fields.lost_workdays), draft.lostWorkdays, baseline?.lostWorkdays, (target, value) => ({
    ...target,
    lostWorkdays: value,
  }), ['0'])

  if (fields.report_details) {
    const incoming = normalizeAccidentReportDetails(fields.report_details)
    for (const key of ACCIDENT_REPORT_TEXT_KEYS) {
      pushText(
        ACCIDENT_REPORT_TEXT_LABELS[key],
        incoming[key],
        draft.reportDetails[key],
        baseline?.reportDetails[key],
        (target, value) => ({ ...target, reportDetails: { ...target.reportDetails, [key]: value } }),
      )
    }

    if (incoming.notifications.length > 0 && !sameMembers(incoming.notifications, draft.reportDetails.notifications)) {
      const notifications: AccidentNotificationTarget[] = [...incoming.notifications]
      changes.push({
        label: '신고처',
        conflict:
          draft.reportDetails.notifications.length > 0 &&
          (baseline === undefined || !sameMembers(draft.reportDetails.notifications, baseline.reportDetails.notifications)),
        apply: (target) => ({ ...target, reportDetails: { ...target.reportDetails, notifications } }),
      })
    }

    if (incoming.victimActions.length > 0 && !sameMembers(incoming.victimActions, draft.reportDetails.victimActions)) {
      const victimActions: AccidentVictimAction[] = [...incoming.victimActions]
      changes.push({
        label: '피해자 조치',
        conflict:
          draft.reportDetails.victimActions.length > 0 &&
          (baseline === undefined || !sameMembers(draft.reportDetails.victimActions, baseline.reportDetails.victimActions)),
        apply: (target) => ({ ...target, reportDetails: { ...target.reportDetails, victimActions } }),
      })
    }
  }

  const fillEmpty = changes.filter((change) => !change.conflict).reduce((target, change) => change.apply(target), draft)
  const overwrite = changes.reduce((target, change) => change.apply(target), draft)

  return {
    conflicts: changes.filter((change) => change.conflict).map((change) => change.label),
    hasChanges: changes.length > 0,
    fillEmpty,
    overwrite,
  }
}
