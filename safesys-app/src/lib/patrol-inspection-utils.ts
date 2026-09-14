// 패트롤 점검의 분기 범위·조치사진 등록일 복원·조치완료 판정 같은 순수 로직을 모아둔다.
import type { PatrolInspection } from '@/lib/patrol-inspections'

/** 점검일과 조치완료일(미완료는 오늘) 차이가 이 일수를 넘으면 지연이다. */
export const PATROL_ACTION_OVERDUE_DAYS = 7

/** AI 라우트가 한 번에 받는 점검 건수 상한. 엑셀은 이 크기로 나눠 호출한다. */
export const PATROL_MAX_AI_ITEMS = 20

/** 조치 대신 저장되는 "해당 사항 없음" 표기. 사진이 아니므로 등록일이 없다. */
export const PATROL_NO_ACTION_TEXT = '해당 사항 없음'

/** 재해유형 허용 목록 — 사고 통계와 같은 분류를 쓴다. */
export const PATROL_DISASTER_TYPES: readonly string[] = [
  '추락',
  '넘어짐',
  '부딪힘',
  '물체에 맞음',
  '끼임',
  '깔림·뒤집힘',
  '절단·베임·찔림',
  '감전',
  '붕괴·도괴',
  '화재·폭발',
  '질식·중독',
  '기타',
]

export interface PatrolQuarterRange {
  startDate: string
  endDate: string
}

export interface PatrolActionState {
  /** 필요한 조치가 모두 처리되었는가. */
  completed: boolean
  /** 실제 조치사진 등록일 중 가장 늦은 날. 근거가 없으면 null(미기록)이다. */
  completedDate: string | null
  /** 점검일 기준 7일을 넘겼는가. 근거가 없으면 단정하지 않는다. */
  overdue: boolean
  /** 실제 조치가 필요 없는 건인가. 지연 판정에서 제외한다. */
  notApplicable: boolean
}

const QUARTER_PATTERN = /^(\d{4})Q([1-4])$/

const QUARTER_MONTH_RANGE: Record<string, [string, string]> = {
  '1': ['01-01', '03-31'],
  '2': ['04-01', '06-30'],
  '3': ['07-01', '09-30'],
  '4': ['10-01', '12-31'],
}

/** 2026Q3 형식을 시작·종료일로 바꾼다. 형식이 어긋나면 null이다. */
export function patrolQuarterRange(quarter: string | null | undefined): PatrolQuarterRange | null {
  const matched = typeof quarter === 'string' ? quarter.trim().match(QUARTER_PATTERN) : null
  if (!matched) return null

  const [, year, quarterNumber] = matched
  const range = QUARTER_MONTH_RANGE[quarterNumber]
  if (!range) return null

  return { startDate: `${year}-${range[0]}`, endDate: `${year}-${range[1]}` }
}

/** 서울 기준 오늘 날짜(YYYY-MM-DD). */
export function seoulToday(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
}

function toSeoulDate(value: Date): string | null {
  if (Number.isNaN(value.getTime())) return null
  return value.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
}

/** 조치사진이 올라가는 스토리지 경로. 이 경로의 파일만 등록일 근거로 쓴다. */
const ACTION_PHOTO_PATH = '/storage/v1/object/public/inspection-photos/headquarters-actions/'

// 업로드 파일명은 `${Date.now()}-${랜덤}.확장자` 규칙이라 선두 13자리가 등록 시각이다.
const STORAGE_FILENAME_EPOCH = /^(\d{13})-[^/]*$/
// 2001-09-09 ~ 2286-11-20. 이 범위를 벗어나면 파일명 규칙이 아니라고 본다.
const MIN_EPOCH_MS = 1_000_000_000_000
const MAX_EPOCH_MS = 9_999_999_999_999

/**
 * 조치사진 스토리지 URL 파일명에서 실제 업로드일(서울)을 복원한다.
 * 조치사진 경로의 epoch 파일명이 아니면 null이며, 이때 완료일은 추측하지 않는다.
 */
export function parseStorageUploadDate(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null

  const pathname = parsed.pathname
  const pathIndex = pathname.indexOf(ACTION_PHOTO_PATH)
  if (pathIndex === -1) return null

  const fileName = pathname.slice(pathIndex + ACTION_PHOTO_PATH.length)
  const matched = fileName.match(STORAGE_FILENAME_EPOCH)
  if (!matched) return null

  const epoch = Number(matched[1])
  if (!Number.isFinite(epoch) || epoch < MIN_EPOCH_MS || epoch > MAX_EPOCH_MS) return null

  return toSeoulDate(new Date(epoch))
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** 조치칸 한 개의 상태 — 비어있음 / 면제("해당 사항 없음") / 실제 사진. */
type PatrolActionKind = 'none' | 'exempt' | 'photo'

function classifyAction(value: unknown): PatrolActionKind {
  const trimmed = textOf(value)
  if (!trimmed) return 'none'
  if (trimmed === PATROL_NO_ACTION_TEXT) return 'exempt'
  // 임의 텍스트는 조치로 인정하지 않는다 — 사진 URL만 실제 조치다.
  if (/^https?:\/\//i.test(trimmed)) return 'photo'
  return 'none'
}

/** 지적2가 실제로 존재하는지 — 내용이나 현장사진 중 하나만 있어도 존재로 본다. */
export function hasPatrolSecondIssue(inspection: Partial<PatrolInspection>): boolean {
  return Boolean(textOf(inspection.issue_content2) || textOf(inspection.site_photo_issue2))
}

/** 지적내용 1·2를 한 셀에 담는다. 2건이면 번호와 줄바꿈으로 구분한다. */
export function buildPatrolIssueContent(inspection: Partial<PatrolInspection>): string {
  const first = textOf(inspection.issue_content1)
  const second = textOf(inspection.issue_content2)

  if (first && second) return `1. ${first}\n2. ${second}`
  return first || second
}

function daysBetween(fromDate: string, toDate: string): number | null {
  const from = Date.parse(`${fromDate}T00:00:00Z`)
  const to = Date.parse(`${toDate}T00:00:00Z`)
  if (Number.isNaN(from) || Number.isNaN(to)) return null
  return Math.round((to - from) / 86_400_000)
}

/**
 * 패트롤 점검 한 건의 조치 상태를 판정한다.
 * 완료는 필요한 지적이 모두 처리된 경우이고, 완료일은 실제 사진 등록일 근거가 있을 때만 채운다.
 */
export function getPatrolActionState(
  inspection: Partial<PatrolInspection>,
  today?: string
): PatrolActionState {
  const hasIssue2 = hasPatrolSecondIssue(inspection)

  const actions: Array<{ kind: PatrolActionKind; photo: unknown }> = [
    { kind: classifyAction(inspection.action_photo_issue1), photo: inspection.action_photo_issue1 },
  ]
  if (hasIssue2) {
    actions.push({ kind: classifyAction(inspection.action_photo_issue2), photo: inspection.action_photo_issue2 })
  }

  const completed = actions.every((action) => action.kind !== 'none')
  const photoActions = actions.filter((action) => action.kind === 'photo')

  // 필요한 지적이 모두 면제이거나 지적유형 자체가 해당없음이면 실제 조치가 필요 없는 건이다.
  const allExempt = completed && photoActions.length === 0
  const notApplicable = inspection.finding_type === 'not_applicable' || allExempt

  // 면제 지적은 완료일 근거에서 빼고, 남은 실제 사진의 등록일 중 가장 늦은 날을 쓴다.
  const photoDates = photoActions.map((action) => parseStorageUploadDate(action.photo))
  const completedDate =
    completed && photoDates.length > 0 && photoDates.every((date): date is string => Boolean(date))
      ? photoDates.reduce((latest, date) => (date! > latest! ? date : latest))!
      : null

  if (notApplicable) {
    return { completed, completedDate: null, overdue: false, notApplicable: true }
  }

  // 완료일을 모르는 완료 건은 지연을 단정하지 않는다.
  const compareDate = completedDate ?? (completed ? null : today ?? seoulToday())
  const inspectionDate = textOf(inspection.inspection_date)
  const elapsed = compareDate && inspectionDate ? daysBetween(inspectionDate, compareDate) : null
  const overdue = elapsed !== null && elapsed > PATROL_ACTION_OVERDUE_DAYS

  return { completed, completedDate, overdue, notApplicable: false }
}

/** AI가 돌려준 재해유형을 허용 목록으로 맞춘다. 목록 밖이면 기타다. */
export function normalizePatrolDisasterType(value: unknown): string {
  const candidate = textOf(value)
  return PATROL_DISASTER_TYPES.includes(candidate) ? candidate : '기타'
}
