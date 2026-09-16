// 사고발생보고서 추가 항목(보고자·피해자·조치·사진)의 공통 타입·기본값·정규화·검증 모듈. UI/API/HWPX가 함께 쓴다.

/** 사고 발생 즉시 알린 곳. 문서에 없는 항목을 추정하지 않으므로 비어 있을 수 있다. */
export type AccidentNotificationTarget = 'emergency119' | 'police' | 'laborOffice' | 'family'

/** 피해자를 옮긴 곳. */
export type AccidentVictimAction = 'hospital' | 'funeralHome' | 'home'

/** 보고서 사진 한 장. 브라우저에서 축소한 JPEG data URL과 설명을 함께 둔다. */
export interface AccidentReportPhoto {
  dataUrl: string
  caption: string
}

/**
 * 사고발생보고서에서 통계 컬럼(project_accidents 본 컬럼)으로 담지 못하는 항목.
 * project_accidents.report_details JSONB 한 컬럼에 통째로 저장한다.
 * 기존 prevention_action이 향후 추진계획을 겸하므로 여기에 따로 두지 않는다.
 */
export interface AccidentReportDetails {
  reportTitle: string
  /** 보고일. YYYY-MM-DD 또는 빈 값. 사고일(accident_at)과 다르다. */
  reportDate: string
  reporterName: string
  reporterPosition: string
  reporterPhone: string
  /** 보고 요지 */
  summary: string
  /** 사고 시각. HH:mm 또는 빈 값 */
  accidentTime: string
  /** 피해자 인적사항(여러 명이면 줄바꿈으로 나열) */
  victimDetails: string
  /** 산재요양 예상 일수. 미입력은 빈 문자열, 입력하면 0 이상 안전 정수 문자열. 휴업일수와 별개다. */
  expectedTreatmentDays: string
  /** 인명피해 상세(부위·정도·병원 등) */
  damageDetails: string
  /** 인명 외 피해(물적·공정) */
  propertyDamage: string
  /** 책임 소재·귀책 */
  responsibility: string
  /** 미신고 사유 */
  noNotificationReason: string
  /** 보상·합의 내용 */
  compensationDetails: string
  /** 사고 후 조치 내용 */
  actionDetails: string
  /** 특이사항 */
  otherNotes: string
  /** 관련 연락처 */
  relatedContacts: string
  notifications: AccidentNotificationTarget[]
  victimActions: AccidentVictimAction[]
  photos: AccidentReportPhoto[]
}

/** 문자열 항목 키 목록. 폼·정규화·검증·HWPX가 같은 순서로 돈다. */
export const ACCIDENT_REPORT_TEXT_KEYS = [
  'reportTitle',
  'reportDate',
  'reporterName',
  'reporterPosition',
  'reporterPhone',
  'summary',
  'accidentTime',
  'victimDetails',
  'expectedTreatmentDays',
  'damageDetails',
  'propertyDamage',
  'responsibility',
  'noNotificationReason',
  'compensationDetails',
  'actionDetails',
  'otherNotes',
  'relatedContacts',
] as const

export type AccidentReportTextKey = (typeof ACCIDENT_REPORT_TEXT_KEYS)[number]

export const ACCIDENT_NOTIFICATION_OPTIONS: ReadonlyArray<{ value: AccidentNotificationTarget; label: string }> = [
  { value: 'emergency119', label: '119' },
  { value: 'police', label: '경찰서' },
  { value: 'laborOffice', label: '노동부' },
  { value: 'family', label: '가족' },
]

export const ACCIDENT_VICTIM_ACTION_OPTIONS: ReadonlyArray<{ value: AccidentVictimAction; label: string }> = [
  { value: 'hospital', label: '병원 이송' },
  { value: 'funeralHome', label: '장례식장 안치' },
  { value: 'home', label: '귀가' },
]

/** 사진 한도. UI·정규화·SQL CHECK가 같은 숫자를 쓴다. */
export const ACCIDENT_REPORT_MAX_PHOTOS = 2
/** 축소 후 JPEG 한 장의 data URL 최대 길이(약 1MB 바이너리 ≒ base64 1.4MB). */
export const ACCIDENT_REPORT_PHOTO_MAX_DATA_URL_LENGTH = 1_400_000
/** 브라우저 축소 시 긴 변 상한. */
export const ACCIDENT_REPORT_PHOTO_MAX_EDGE = 1200
export const ACCIDENT_REPORT_PHOTO_CAPTION_MAX_LENGTH = 200
/** 짧은 문자열(제목·성명·직책·연락처·시각·보고일) 상한. */
export const ACCIDENT_REPORT_SHORT_TEXT_MAX_LENGTH = 200
/** 장문(요지·피해·조치 등) 상한. */
export const ACCIDENT_REPORT_LONG_TEXT_MAX_LENGTH = 4000

const SHORT_TEXT_KEYS: ReadonlySet<AccidentReportTextKey> = new Set<AccidentReportTextKey>([
  'reportTitle',
  'reportDate',
  'reporterName',
  'reporterPosition',
  'reporterPhone',
  'accidentTime',
  'expectedTreatmentDays',
])

export const ACCIDENT_REPORT_TEXT_LABELS: Record<AccidentReportTextKey, string> = {
  reportTitle: '보고서 제목',
  reportDate: '보고일',
  reporterName: '보고자 성명',
  reporterPosition: '보고자 직책',
  reporterPhone: '보고자 연락처',
  summary: '보고 요지',
  accidentTime: '사고 시각',
  victimDetails: '피해자 인적사항',
  expectedTreatmentDays: '산재요양 예상 일수',
  damageDetails: '인명피해 상세',
  propertyDamage: '인명 외 피해',
  responsibility: '책임 소재',
  noNotificationReason: '미신고 사유',
  compensationDetails: '보상·합의 내용',
  actionDetails: '조치 내용',
  otherNotes: '특이사항',
  relatedContacts: '관련 연락처',
}

export const NOTIFICATION_TARGETS: ReadonlySet<string> = new Set(ACCIDENT_NOTIFICATION_OPTIONS.map((o) => o.value))
export const VICTIM_ACTIONS: ReadonlySet<string> = new Set(ACCIDENT_VICTIM_ACTION_OPTIONS.map((o) => o.value))

/** 항상 새 객체를 돌려준다. 호출자가 배열을 밀어 넣어도 공유 상태가 오염되지 않는다. */
export function createEmptyAccidentReportDetails(): AccidentReportDetails {
  return {
    reportTitle: '',
    reportDate: '',
    reporterName: '',
    reporterPosition: '',
    reporterPhone: '',
    summary: '',
    accidentTime: '',
    victimDetails: '',
    expectedTreatmentDays: '',
    damageDetails: '',
    propertyDamage: '',
    responsibility: '',
    noNotificationReason: '',
    compensationDetails: '',
    actionDetails: '',
    otherNotes: '',
    relatedContacts: '',
    notifications: [],
    victimActions: [],
    photos: [],
  }
}

export function maxLengthOfReportText(key: AccidentReportTextKey): number {
  return SHORT_TEXT_KEYS.has(key) ? ACCIDENT_REPORT_SHORT_TEXT_MAX_LENGTH : ACCIDENT_REPORT_LONG_TEXT_MAX_LENGTH
}

/** 미입력 또는 0 이상 안전 정수의 십진 숫자 문자열만 허용한다. */
export function isValidExpectedTreatmentDays(value: unknown): value is string {
  return typeof value === 'string' && (value === '' || (
    value.length <= ACCIDENT_REPORT_SHORT_TEXT_MAX_LENGTH &&
    /^[0-9]+$/.test(value) && Number.isSafeInteger(Number(value))
  ))
}

const JPEG_DATA_URL_PATTERN = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/
/** JPEG 바이너리 첫 3바이트 FF D8 FF의 base64 표기. */
const JPEG_BASE64_PREFIX = 'data:image/jpeg;base64,/9j/'

/** 축소된 JPEG data URL인지 형식과 길이로 판단한다. 다른 형식·과대 사진은 거짓이다. */
export function isValidAccidentReportPhotoDataUrl(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= ACCIDENT_REPORT_PHOTO_MAX_DATA_URL_LENGTH &&
    value.startsWith(JPEG_BASE64_PREFIX) &&
    JPEG_DATA_URL_PATTERN.test(value)
  )
}

const asText = (value: unknown): string => (typeof value === 'string' ? value : '')
const trimText = (value: unknown): string => asText(value).trim()

function uniqueStrings<T extends string>(value: unknown, allowed: ReadonlySet<string>): T[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const result: T[] = []
  for (const item of value) {
    if (typeof item !== 'string' || !allowed.has(item) || seen.has(item)) continue
    seen.add(item)
    result.push(item as T)
  }
  return result
}

/**
 * 부분 입력·DB JSON·AI 초안 어느 것이 와도 완전한 AccidentReportDetails로 채운다.
 * 문자열은 trim하고 알 수 없는 키·선택지·사진은 버린다. 사진은 순서를 지키되 최대 장수까지만 남긴다.
 * 길이 초과는 여기서 자르지 않는다 — 검증에서 알려 사용자가 고치게 한다.
 */
export function normalizeAccidentReportDetails(value: unknown): AccidentReportDetails {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const base = createEmptyAccidentReportDetails()
  for (const key of ACCIDENT_REPORT_TEXT_KEYS) {
    base[key] = trimText(source[key])
  }
  base.notifications = uniqueStrings<AccidentNotificationTarget>(source.notifications, NOTIFICATION_TARGETS)
  base.victimActions = uniqueStrings<AccidentVictimAction>(source.victimActions, VICTIM_ACTIONS)
  const photos = Array.isArray(source.photos) ? source.photos : []
  base.photos = photos
    .filter((photo): photo is Record<string, unknown> => Boolean(photo) && typeof photo === 'object')
    .map((photo) => ({ dataUrl: asText(photo.dataUrl), caption: trimText(photo.caption) }))
    .filter((photo) => photo.dataUrl.length > 0)
    .slice(0, ACCIDENT_REPORT_MAX_PHOTOS)
  return base
}

/** 사진 말고 적힌 내용이 하나도 없으면 참. 저장할 때 빈 보고서를 null로 두는 판단에 쓴다. */
export function isAccidentReportDetailsEmpty(details: AccidentReportDetails): boolean {
  return (
    ACCIDENT_REPORT_TEXT_KEYS.every((key) => details[key].length === 0) &&
    details.notifications.length === 0 &&
    details.victimActions.length === 0 &&
    details.photos.length === 0
  )
}

export type AccidentReportDetailsErrorKey = AccidentReportTextKey | 'notifications' | 'victimActions' | 'photos'

export interface AccidentReportDetailsValidation {
  valid: boolean
  errors: Partial<Record<AccidentReportDetailsErrorKey, string>>
}

const REPORT_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const ACCIDENT_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

/**
 * 정규화된 보고서 항목의 형식·길이·사진 수를 검증한다. 모든 항목은 선택이므로 빈 값은 통과한다.
 * 정규화되지 않은 값을 넘기면 trim 전 길이로 판정될 수 있으니 normalize 후에 부른다.
 */
export function validateAccidentReportDetails(details: AccidentReportDetails): AccidentReportDetailsValidation {
  const errors: AccidentReportDetailsValidation['errors'] = {}

  for (const key of ACCIDENT_REPORT_TEXT_KEYS) {
    const max = maxLengthOfReportText(key)
    if (details[key].length > max) {
      errors[key] = `${ACCIDENT_REPORT_TEXT_LABELS[key]}은(는) ${max.toLocaleString('ko-KR')}자 이하로 입력해 주세요.`
    }
  }
  if (details.reportDate && !REPORT_DATE_PATTERN.test(details.reportDate)) {
    errors.reportDate = '보고일은 YYYY-MM-DD 형식으로 입력해 주세요.'
  } else if (details.reportDate && Number.isNaN(new Date(`${details.reportDate}T00:00:00Z`).getTime())) {
    errors.reportDate = '보고일이 올바르지 않습니다.'
  }
  if (details.accidentTime && !ACCIDENT_TIME_PATTERN.test(details.accidentTime)) {
    errors.accidentTime = '사고 시각은 HH:mm 형식으로 입력해 주세요.'
  }
  if (!isValidExpectedTreatmentDays(details.expectedTreatmentDays)) {
    errors.expectedTreatmentDays = '산재요양 예상 일수는 0 이상의 정수로 입력해 주세요.'
  }
  if (details.notifications.some((item) => !NOTIFICATION_TARGETS.has(item))) {
    errors.notifications = '신고처 선택값이 올바르지 않습니다.'
  }
  if (details.victimActions.some((item) => !VICTIM_ACTIONS.has(item))) {
    errors.victimActions = '피해자 조치 선택값이 올바르지 않습니다.'
  }
  if (details.photos.length > ACCIDENT_REPORT_MAX_PHOTOS) {
    errors.photos = `사진은 최대 ${ACCIDENT_REPORT_MAX_PHOTOS}장까지 첨부할 수 있습니다.`
  } else {
    for (const photo of details.photos) {
      if (!isValidAccidentReportPhotoDataUrl(photo.dataUrl)) {
        errors.photos = '사진은 1MB 이하의 축소된 JPEG만 첨부할 수 있습니다.'
        break
      }
      if (photo.caption.length > ACCIDENT_REPORT_PHOTO_CAPTION_MAX_LENGTH) {
        errors.photos = `사진 설명은 ${ACCIDENT_REPORT_PHOTO_CAPTION_MAX_LENGTH}자 이하로 입력해 주세요.`
        break
      }
    }
  }

  return { valid: Object.keys(errors).length === 0, errors }
}

/**
 * 보고서 화면에서 "아직 채우지 않은 항목"을 안내하는 데 쓰는 항목 목록.
 * 값이 비어 있으면 나열할 뿐, 어떤 값도 지어내지 않는다.
 */
export function listUnfilledAccidentReportFields(details: AccidentReportDetails): AccidentReportTextKey[] {
  return ACCIDENT_REPORT_TEXT_KEYS.filter((key) => details[key].length === 0)
}
