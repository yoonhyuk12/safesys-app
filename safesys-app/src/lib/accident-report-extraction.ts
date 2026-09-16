// 사고보고 문서(PDF·HWPX)에서 AI가 뽑은 값을 검증·정규화하는 순수 모듈. 서버 라우트와 브라우저가 함께 쓴다.
import {
  ACCIDENT_COMP_CLAIM_OPTIONS,
  ACCIDENT_SEVERITY_OPTIONS,
  ACCIDENT_TYPE_OPTIONS,
} from '@/lib/accident-analysis-types'
import type { AccidentFormInput, AccidentSeverity, WorkersCompClaim } from '@/lib/accident-analysis-types'
import {
  ACCIDENT_REPORT_LONG_TEXT_MAX_LENGTH,
  ACCIDENT_REPORT_SHORT_TEXT_MAX_LENGTH,
  ACCIDENT_REPORT_TEXT_KEYS,
  NOTIFICATION_TARGETS,
  VICTIM_ACTIONS,
  maxLengthOfReportText,
  isValidExpectedTreatmentDays,
} from '@/lib/accident-report'
import type { AccidentNotificationTarget, AccidentReportDetails, AccidentVictimAction } from '@/lib/accident-report'
import { cleanAccidentReportContent } from '@/lib/accident-report-content'

/** PDF 원본을 그대로 Gemini에 넘기므로 요청 본문 한도를 고려한 상한이다. */
export const ACCIDENT_IMPORT_PDF_MAX_BYTES = 4 * 1024 * 1024
/** HWPX에서 추출한 텍스트의 글자 상한. 넘으면 앞부분만 분석한다. */
export const ACCIDENT_IMPORT_TEXT_MAX_CHARS = 100_000
/** HWPX 원본(zip) 크기 상한. */
export const ACCIDENT_IMPORT_HWPX_MAX_BYTES = 15 * 1024 * 1024
/** HWPX zip 엔트리 수 상한. */
export const ACCIDENT_IMPORT_HWPX_MAX_ENTRIES = 500
/** 섹션 XML 하나의 압축해제 상한. */
export const ACCIDENT_IMPORT_HWPX_MAX_SECTION_BYTES = 8 * 1024 * 1024
/** 모든 섹션 XML 압축해제 합계 상한. */
export const ACCIDENT_IMPORT_HWPX_MAX_TOTAL_SECTION_BYTES = 24 * 1024 * 1024

/**
 * AI에서 받아도 되는 보고서 추가 항목. 사진(photos)은 사용자가 직접 첨부하므로 받지 않는다.
 * 정본 타입 AccidentReportDetails에서 파생하므로 필드 정의를 여기에 복제하지 않는다.
 */
export type ExtractedAccidentReportDetails = Omit<AccidentReportDetails, 'photos'>

/**
 * 문서에서 채울 수 있는 사고 입력 필드. 전부 선택이며 값이 없으면 키 자체가 없다 —
 * 사용자가 이미 적어 둔 초안을 빈 값으로 덮어쓰지 않으려는 것이다.
 * project_id·external_*·created_by·photos·모델 지정은 어떤 경로로도 받지 않는다.
 */
export type AccidentPrefillFields = Partial<
  Pick<
    AccidentFormInput,
    | 'accident_at'
    | 'severity'
    | 'accident_type'
    | 'location'
    | 'work_description'
    | 'description'
    | 'cause'
    | 'prevention_action'
    | 'injured_count'
    | 'fatal_count'
    | 'lost_workdays'
    | 'workers_comp_claim'
  >
> & {
  /**
   * 보고서 추가 항목 중 문서에서 찾은 것만 담는다. AccidentFormInput.report_details와 달리 Partial이므로
   * 호출자가 기존 초안과 병합해야 한다 — `{ ...draft.report_details, ...fields.report_details }`.
   */
  report_details?: Partial<ExtractedAccidentReportDetails>
}

export interface AccidentPrefillResult {
  fields: AccidentPrefillFields
  warnings: string[]
}

const SEVERITY_VALUES: readonly AccidentSeverity[] = ACCIDENT_SEVERITY_OPTIONS.map((option) => option.value)
const WORKERS_COMP_VALUES: readonly WorkersCompClaim[] = ACCIDENT_COMP_CLAIM_OPTIONS.map(
  (option) => option.value
).filter((value): value is WorkersCompClaim => value !== '')

/** 인원수·휴업일수 상한. */
const COUNT_MAX = 99_999

/**
 * 산재 신청·접수·처리 자체가 준비·예정·검토·미정이라고 적힌 경우만 미확정으로 본다. 신청 완료 뒤 치료·보상 진행 문구는 확정을 흔들지 않는다.
 * 실측에서 모델이 '산재보험처리' 라벨을 떼고 "신청 준비 중"만 돌려줬으므로, 산재 처리 항목 맨 앞의 "신청 준비·예정"도 같은 뜻으로 본다.
 * 토큰 사이 구분자는 한 클래스로 한 번만 두어 긴 공백 입력에서 백트래킹이 폭발하지 않게 한다.
 */
const UNSETTLED_COMP_CLAIM_PATTERN =
  /산재(?:[\s:：·,-]*보험)?(?:[\s:：·,-]*처리)?[\s:：·,-]*(?:(?:신청|접수)[\s:：·,-]*)?(?:(?:을|를)[\s:：·,-]*)?(?:준비|예정|검토|미정)|^(?:신청|접수)[\s:：·,-]*(?:(?:을|를)[\s:：·,-]*)?(?:준비|예정|검토|미정)/

/** 항상 마지막에 붙는 안내. 결과가 초안임을 잊지 않게 한다. */
export const ACCIDENT_PREFILL_DRAFT_NOTICE = '자동 채움 결과는 초안이며 저장 전 확인이 필요합니다.'

/** AI가 채워도 되는 최상위 키. 이 목록에 없는 키는 전부 무시한다. */
const ALLOWED_TOP_LEVEL_KEYS = [
  'accident_at',
  'severity',
  'accident_type',
  'location',
  'work_description',
  'description',
  'cause',
  'prevention_action',
  'injured_count',
  'fatal_count',
  'lost_workdays',
  'workers_comp_claim',
  'report_details',
] as const

/** 날짜·시각·일수는 형식 검증이 따로 필요하므로 문자열 일괄 처리에서 뺀다. */
const FORMATTED_REPORT_TEXT_KEYS: ReadonlySet<string> = new Set(['reportDate', 'accidentTime', 'expectedTreatmentDays'])

/** 핵심 필드가 비었을 때 사용자에게 알릴 이름. */
const CORE_FIELD_LABELS: ReadonlyArray<{ key: keyof AccidentPrefillFields; label: string }> = [
  { key: 'accident_at', label: '사고 일시' },
  { key: 'description', label: '사고 내용' },
  { key: 'location', label: '사고 장소' },
  { key: 'severity', label: '사고 정도' },
  { key: 'accident_type', label: '재해 유형' },
]

export const ACCIDENT_EXTRACTION_SYSTEM_INSTRUCTION = `당신은 한국 건설현장 안전관리 실무자를 돕는 문서 추출기다.
사고발생보고서(공문·한글 양식)를 읽고 지정된 JSON 스키마로만 답한다.
문서에서 확인된 사실만 사용하며, 없는 값은 반드시 null로 둔다.
사고 개요(description)는 별도 경위 항목이 없어도 확인된 사실을 짧은 1~3문장으로 재구성한다. 사고 사실 자체가 없으면 null로 둔다.
문서에 없는 사실을 추정·창작하거나 일반론으로 보완하지 않고 JSON 밖의 설명 문장이나 코드블록을 덧붙이지 않는다.`

/** 사용자 파트에 넣는 추출 지시문. 문서 본문은 호출부에서 뒤에 붙인다. */
export function buildAccidentExtractionPrompt(): string {
  const accidentTypes = ACCIDENT_TYPE_OPTIONS.map((option) => option.value).join(', ')

  return `아래 사고발생보고서에서 값을 뽑아 JSON으로 채운다.

[공통 규칙]
- 문서에서 확인된 사실만 쓴다. 항목 제목이 없어도 아래 필드 대응에 따라 사실을 정리하며, 근거 사실을 찾을 수 없는 항목은 null로 둔다. 빈 문자열을 넣지 않는다.
- 문서에 없는 사실을 추정하거나 일반론으로 보완하지 않는다.
- 원문 표현을 최대한 유지하되 줄바꿈·표 구조는 읽기 쉽게 정리한다.
- 개인정보는 문서에 적힌 범위를 넘어서 추가하지 않는다.

[형식 규칙]
- 날짜는 YYYY-MM-DD, 시각은 HH:mm(24시간제)로 쓴다.
- 인원수·휴업일수는 0 이상의 정수로 쓴다. 문서에 숫자가 없으면 null이다.
- 산재요양 예상 일수(expectedTreatmentDays)는 문서에 요양기간이 일 단위 숫자로 명시된 경우에만 0 이상 안전 정수의 숫자 문자열로 옮긴다. 없으면 null이며 미입력을 0으로 만들지 않는다.
- 산재요양 예상 일수와 휴업일수(lost_workdays)는 별개이므로 서로 복사하거나 추정하지 않는다. 진단 주수·입원기간·사고일로 요양 예상 일수를 계산하지 않는다.
- severity는 minor(경상)·lost_time(휴업)·serious(중상)·fatal(사망) 중 문서에 근거가 있을 때만 고르고 없으면 null이다.
- accident_type은 다음 값 중 하나와 정확히 같게 쓰거나 null로 둔다 — ${accidentTypes}
- 목록에 맞는 유형을 문서에서 판단할 수 없으면 '기타'로 임의 확정하지 않고 null로 둔다.

[체크 항목 규칙]
- notifications(신고한 곳)와 victimActions(피해자 조치)는 문서에 체크 표시(■·☑·V·O 등)나 명시된 문장이 있는 항목만 담는다. 근거가 없으면 빈 배열로 둔다.
- workers_comp_claim(산재신청 여부)은 '산재보험처리'·'산재 처리'·'산재신청' 항목의 문구만으로 판단한다. "신청 완료"·"신청함"·"접수함"은 applied, "미신청"·"신청하지 않음"은 not_applied, "신청 준비중"·"신청 예정"·"검토중"·"미정"처럼 확정되지 않은 표현은 null이다. 신청 완료 뒤에 치료·보상·지급이 진행 중이라는 문구가 있어도 applied다.
- 119·경찰서·노동관서·가족 신고 여부(notifications)는 산재신청 여부와 무관하다. 119 미신고·경찰 미신고라는 이유로 workers_comp_claim을 not_applied로 두지 않는다.
- notifications 값은 emergency119(119)·police(경찰서)·laborOffice(노동관서)·family(가족)다.
- victimActions 값은 hospital(병원 이송)·funeralHome(장례식장 안치)·home(귀가)다.

[필드 대응]
- 상위 사고내용 구역 전체를 description에 복사하지 않는다. 명시 하위 항목 작업내용은 work_description, 사고원인은 cause로 분리한다.
- 피해현황 상세는 report_details.damageDetails, 귀책사유는 report_details.responsibility로 분리한다. 피해자 인적사항과 미신고 사유도 각각 전용 필드에만 넣는다.
- description은 별도 경위 항목이 없어도 보고요지, 작업내용, 사고원인에 서술된 발생 경위, 피해사실 등 확인된 사실을 짧은 1~3문장 개요로 재구성한다. 무슨 작업 중 무엇이 발생해 어떤 피해가 있었는지 확인되는 내용만 담고, 확인되지 않은 요소는 생략한다.
- description에 원문에 없는 과실·시간·장소·피해·원인을 만들지 않는다. 사고 사실 자체가 없으면 null이다. 원인 단순 복사나 참조 문구, 중복 라벨 묶음으로 description을 채우지 않는다.
- cause는 원문에 명시된 사고 기전·발생 요인을 담는다. description은 발생 사건과 피해의 개요, cause는 발생 기전·요인으로 구분하며 원문에 없는 과실이나 책임을 추론하지 않는다.
- 사고내용·경위 → description
- 사고 원인 → cause
- 작업내용 → work_description
- 향후 추진계획·재발방지대책 → prevention_action
- 사고 장소 → location
- 사고 일시(날짜) → accident_at, 사고 시각 → report_details.accidentTime
- 보고 요지 → report_details.summary
- 피해자 인적사항 → report_details.victimDetails
- 산재요양 예상 일수·명시된 요양기간(일) → report_details.expectedTreatmentDays
- 인명피해 상세(부위·정도·병원) → report_details.damageDetails
- 인명 외 피해(물적·공정) → report_details.propertyDamage
- 책임 소재·귀책 → report_details.responsibility
- 미신고 사유 → report_details.noNotificationReason
- 보상·합의·산재 처리 내용 → report_details.compensationDetails
- 사고 후 조치사항 → report_details.actionDetails
- 특이사항 → report_details.otherNotes
- 관련 연락처 → report_details.relatedContacts
- 보고 제목 → report_details.reportTitle
- 문서 맨 위나 공문 머리의 '보고일자'·'보고일'·'작성일' → report_details.reportDate. 보고일자는 문서를 쓴 날이고 사고 일시(accident_at)는 사고가 난 날이므로 섞지 않는다.
- '보고자'·'작성자'·'담당자' 줄 → report_details.reporterName(성명) / reporterPosition(직책) / reporterPhone(연락처). "○○지사장 홍길동 (010-0000-0000)"처럼 한 줄에 직책·성명·전화가 함께 있으면 세 필드로 나눈다.`
}

/** report_details 스키마 속성 — 문자열 키는 정본 키 목록에서 만들어 누락·오타를 막는다. */
function buildReportDetailsSchemaProperties(): Record<string, unknown> {
  const properties: Record<string, unknown> = {}
  for (const key of ACCIDENT_REPORT_TEXT_KEYS) {
    properties[key] = { type: 'STRING', nullable: true }
  }
  properties.notifications = {
    type: 'ARRAY',
    nullable: true,
    items: { type: 'STRING', enum: [...NOTIFICATION_TARGETS] },
  }
  properties.victimActions = {
    type: 'ARRAY',
    nullable: true,
    items: { type: 'STRING', enum: [...VICTIM_ACTIONS] },
  }
  return properties
}

/** Gemini generationConfig.responseSchema용 OpenAPI 부분집합 스키마. */
export const ACCIDENT_EXTRACTION_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'OBJECT',
  properties: {
    accident_at: { type: 'STRING', nullable: true },
    severity: { type: 'STRING', nullable: true, enum: [...SEVERITY_VALUES] },
    accident_type: {
      type: 'STRING',
      nullable: true,
      enum: ACCIDENT_TYPE_OPTIONS.map((option) => option.value),
    },
    location: { type: 'STRING', nullable: true },
    work_description: { type: 'STRING', nullable: true },
    description: { type: 'STRING', nullable: true, description: '별도 경위 항목이 없어도 문서의 확인된 사실을 1~3문장으로 재구성한 사고 개요. 작업·발생 사건·피해 중 확인되는 내용만 담고 없는 사실은 만들지 않는다. 원인 단순 복사·참조 문구·중복 라벨 묶음은 금지하며 사고 사실 자체가 없으면 null.' },
    cause: { type: 'STRING', nullable: true, description: '원문에 명시된 사고 기전·발생 요인. 사건·피해를 정리한 개요와 구분하며 원문에 없는 과실이나 책임은 추론하지 않는다. 근거가 없으면 null.' },
    prevention_action: { type: 'STRING', nullable: true },
    injured_count: { type: 'INTEGER', nullable: true },
    fatal_count: { type: 'INTEGER', nullable: true },
    lost_workdays: { type: 'INTEGER', nullable: true },
    workers_comp_claim: { type: 'STRING', nullable: true, enum: [...WORKERS_COMP_VALUES] },
    report_details: {
      type: 'OBJECT',
      nullable: true,
      properties: buildReportDetailsSchemaProperties(),
    },
  },
}

interface GeminiPart {
  text?: unknown
}

interface GeminiCandidate {
  content?: { parts?: unknown } | null
}

/** Gemini 응답에서 candidates[0]의 텍스트 파트를 이어 붙인다. 없으면 null이다. */
export function extractGeminiJsonText(result: unknown): string | null {
  if (typeof result !== 'object' || result === null) return null

  const candidates = (result as { candidates?: unknown }).candidates
  if (!Array.isArray(candidates) || candidates.length === 0) return null

  const first = candidates[0] as GeminiCandidate | null
  const parts = first?.content?.parts
  if (!Array.isArray(parts)) return null

  const text = parts
    .map((part) => {
      const value = (part as GeminiPart | null)?.text
      return typeof value === 'string' ? value : ''
    })
    .join('')

  return text.trim().length > 0 ? text : null
}

/** 줄바꿈·탭만 남기고 제어문자를 지운다. */
function stripControlCharacters(value: string): string {
  let result = ''
  // CRLF·CR을 먼저 줄바꿈 하나로 맞춘다 — 문자 단위로 보면 CRLF가 빈 줄이 된다.
  for (const char of value.replace(/\r\n?/g, '\n')) {
    if (char === '\n' || char === '\t') {
      result += char
      continue
    }
    const code = char.codePointAt(0) ?? 0
    if (code < 0x20 || code === 0x7f) continue
    result += char
  }
  return result
}

/** 문자열 값을 정리한다. 값이 없거나 문자열이 아니면 null이다. */
function cleanText(value: unknown, limit: number): string | null {
  if (typeof value !== 'string') return null
  const cleaned = stripControlCharacters(value).trim()
  if (!cleaned) return null
  return cleaned.length > limit ? cleaned.slice(0, limit) : cleaned
}

function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/** YYYY-MM-DD·YYYY.MM.DD·YYYY/MM/DD·YYYY년 M월 D일을 YYYY-MM-DD로 맞춘다. */
function normalizeDate(value: unknown): string | null {
  const text = cleanText(value, 100)
  if (!text) return null

  const matched =
    text.match(/^(\d{4})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})\s*\.?$/) ??
    text.match(/^(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일?$/)
  if (!matched) return null

  const year = Number(matched[1])
  const month = Number(matched[2])
  const day = Number(matched[3])
  if (!isRealDate(year, month, day)) return null

  return `${year}-${pad2(month)}-${pad2(day)}`
}

/** H:mm·HH:mm·HH시 mm분을 HH:mm으로 맞춘다. */
function normalizeTime(value: unknown): string | null {
  const text = cleanText(value, 50)
  if (!text) return null

  const matched = text.match(/^(\d{1,2}):(\d{1,2})$/) ?? text.match(/^(\d{1,2})\s*시\s*(\d{1,2})\s*분?$/)
  if (!matched) return null

  const hour = Number(matched[1])
  const minute = Number(matched[2])
  if (hour > 23 || minute > 59) return null

  return `${pad2(hour)}:${pad2(minute)}`
}

/** 0 이상 정수만 받는다. 정수 문자열도 허용한다. */
function normalizeCount(value: unknown): number | null {
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 0 || value > COUNT_MAX) return null
    return value
  }
  if (typeof value !== 'string') return null

  const text = value.trim()
  if (!/^\d{1,5}$/.test(text)) return null

  const parsed = Number(text)
  return parsed <= COUNT_MAX ? parsed : null
}

/** 배열에서 허용 enum 값만 순서대로 남기고 중복을 제거한다. */
function normalizeEnumArray<T extends string>(value: unknown, allowed: ReadonlySet<string>): T[] | null {
  if (!Array.isArray(value)) return null

  const result: T[] = []
  for (const entry of value) {
    if (typeof entry !== 'string' || !allowed.has(entry) || result.includes(entry as T)) continue
    result.push(entry as T)
  }
  return result
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

/** 허용 키만 골라낸다 — project_id·created_by·photos·model 같은 키는 여기서 걸러진다. */
function pickAllowed(raw: Record<string, unknown>): Record<string, unknown> {
  const picked: Record<string, unknown> = {}
  for (const key of ALLOWED_TOP_LEVEL_KEYS) {
    if (key in raw) picked[key] = raw[key]
  }
  return picked
}

function normalizeReportDetails(
  value: unknown,
  warnings: string[]
): Partial<ExtractedAccidentReportDetails> | null {
  const raw = asRecord(value)
  if (!raw) return null

  const details: Partial<ExtractedAccidentReportDetails> = {}

  for (const key of ACCIDENT_REPORT_TEXT_KEYS) {
    if (FORMATTED_REPORT_TEXT_KEYS.has(key)) continue
    const text = cleanText(raw[key], maxLengthOfReportText(key))
    if (text) details[key] = text
  }

  if (raw.reportDate !== null && raw.reportDate !== undefined) {
    const reportDate = normalizeDate(raw.reportDate)
    if (reportDate) details.reportDate = reportDate
    else if (cleanText(raw.reportDate, 100)) warnings.push('보고일 형식을 알아볼 수 없어 비워 두었습니다.')
  }

  if (raw.accidentTime !== null && raw.accidentTime !== undefined) {
    const accidentTime = normalizeTime(raw.accidentTime)
    if (accidentTime) details.accidentTime = accidentTime
    else if (cleanText(raw.accidentTime, 50)) warnings.push('사고 시각 형식을 알아볼 수 없어 비워 두었습니다.')
  }

  if (raw.expectedTreatmentDays !== null && raw.expectedTreatmentDays !== undefined) {
    const days = typeof raw.expectedTreatmentDays === 'string' ? raw.expectedTreatmentDays.trim() : raw.expectedTreatmentDays
    if (isValidExpectedTreatmentDays(days)) {
      if (days !== '') details.expectedTreatmentDays = days
    } else {
      warnings.push('산재요양 예상 일수는 0 이상 안전한 정수의 숫자 문자열이어야 하므로 비워 두었습니다.')
    }
  }

  const notifications = normalizeEnumArray<AccidentNotificationTarget>(raw.notifications, NOTIFICATION_TARGETS)
  if (notifications && notifications.length > 0) details.notifications = notifications

  const victimActions = normalizeEnumArray<AccidentVictimAction>(raw.victimActions, VICTIM_ACTIONS)
  if (victimActions && victimActions.length > 0) details.victimActions = victimActions

  return Object.keys(details).length > 0 ? details : null
}

/**
 * AI가 돌려준 원시 객체를 사고 입력 초안으로 정규화한다.
 * 값이 없거나 형식이 틀린 항목은 키를 만들지 않고 warnings로만 알린다.
 */
export function normalizeAccidentExtraction(raw: unknown): AccidentPrefillResult {
  const warnings: string[] = []
  const source = asRecord(raw)

  if (!source) {
    warnings.push('AI 응답을 해석하지 못해 자동 채움 결과가 없습니다.')
    warnings.push(ACCIDENT_PREFILL_DRAFT_NOTICE)
    return { fields: {}, warnings }
  }

  const picked = pickAllowed(source)
  const fields: AccidentPrefillFields = {}

  if (picked.accident_at !== null && picked.accident_at !== undefined) {
    const accidentAt = normalizeDate(picked.accident_at)
    if (accidentAt) fields.accident_at = accidentAt
    else if (cleanText(picked.accident_at, 100)) {
      warnings.push('사고 일시 형식을 알아볼 수 없어 비워 두었습니다.')
    }
  }

  if (picked.severity !== null && picked.severity !== undefined) {
    const severity = SEVERITY_VALUES.find((value) => value === picked.severity)
    if (severity) fields.severity = severity
    else if (cleanText(picked.severity, ACCIDENT_REPORT_SHORT_TEXT_MAX_LENGTH)) {
      warnings.push('사고 정도를 알아볼 수 없어 비워 두었습니다.')
    }
  }

  if (picked.accident_type !== null && picked.accident_type !== undefined) {
    const rawType = cleanText(picked.accident_type, ACCIDENT_REPORT_SHORT_TEXT_MAX_LENGTH)
    const matched = ACCIDENT_TYPE_OPTIONS.find((option) => option.value === rawType)
    if (matched) fields.accident_type = matched.value
    else if (rawType) {
      warnings.push(`재해 유형 "${rawType}"이 선택 목록에 없어 비워 두었습니다. 직접 선택해 주세요.`)
    }
  }

  const location = cleanText(picked.location, ACCIDENT_REPORT_SHORT_TEXT_MAX_LENGTH)
  if (location) fields.location = location

  for (const key of ['work_description', 'description', 'cause', 'prevention_action'] as const) {
    const text = cleanText(picked[key], ACCIDENT_REPORT_LONG_TEXT_MAX_LENGTH)
    if (text) fields[key] = text
  }

  for (const key of ['injured_count', 'fatal_count', 'lost_workdays'] as const) {
    if (picked[key] === null || picked[key] === undefined) continue
    const count = normalizeCount(picked[key])
    if (count !== null) fields[key] = count
    else {
      warnings.push(
        `${key === 'lost_workdays' ? '휴업일수' : '인원수'} 값을 알아볼 수 없어 비워 두었습니다.`
      )
    }
  }

  const details = normalizeReportDetails(picked.report_details, warnings)
  if (details) fields.report_details = details

  if (picked.workers_comp_claim !== null && picked.workers_comp_claim !== undefined) {
    const claim = WORKERS_COMP_VALUES.find((value) => value === picked.workers_comp_claim)
    // "신청 준비중"처럼 확정되지 않은 문구를 AI가 미신청으로 굳히는 것을 실측에서 봤다 — 확정 표현이 아니면 비운다.
    if (claim && UNSETTLED_COMP_CLAIM_PATTERN.test(details?.compensationDetails ?? '')) {
      warnings.push('산재신청 여부가 문서에서 확정되지 않아 비워 두었습니다. 직접 선택해 주세요.')
    } else if (claim) {
      fields.workers_comp_claim = claim
    }
  }

  const cleaned = cleanAccidentReportContent(fields, fields.report_details ?? {})
  if (cleaned.description) fields.description = cleaned.description
  else delete fields.description
  if (fields.report_details) {
    const reportDetails = { ...fields.report_details }
    for (const key of ['damageDetails', 'actionDetails'] as const) {
      if (cleaned[key]) reportDetails[key] = cleaned[key]
      else delete reportDetails[key]
    }
    fields.report_details = reportDetails
  }

  for (const { key, label } of CORE_FIELD_LABELS) {
    if (fields[key] === undefined) warnings.push(`문서에서 ${label}를 찾지 못했습니다.`)
  }

  warnings.push(ACCIDENT_PREFILL_DRAFT_NOTICE)
  return { fields, warnings }
}
