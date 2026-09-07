// 프로젝트 병합 미리보기의 충돌 건수를 엄격히 검증하고 안내 문구·오류 종류를 판별하는 유틸.

export interface MergeConflictCounts {
  workDailyReports: number
  qualityMonthlyReports: number
  scheduleConflict: boolean
}

/** 마이그레이션 전 새 RPC가 없을 때 PostgREST·PostgreSQL이 돌려주는 코드. */
const MISSING_RPC_CODES = new Set(['PGRST202', '42883'])

/** 병합 함수가 최종 충돌에서 던지는 예외 메시지. */
const MERGE_CONFLICT_MESSAGES = ['MERGE_REPORT_CONFLICT', 'MERGE_SCHEDULE_CONFLICT']

function parseCount(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return null
  return value
}

/** 유한한 0 이상 정수 두 개와 공정표 충돌 여부를 갖춘 객체만 충돌 정보로 인정한다. */
export function parseMergeConflictCounts(value: unknown): MergeConflictCounts | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null

  const record = value as Record<string, unknown>
  const workDailyReports = parseCount(record.workDailyReports)
  const qualityMonthlyReports = parseCount(record.qualityMonthlyReports)
  const scheduleConflict = record.scheduleConflict
  if (workDailyReports === null || qualityMonthlyReports === null) return null
  if (typeof scheduleConflict !== 'boolean') return null

  return { workDailyReports, qualityMonthlyReports, scheduleConflict }
}

export function totalMergeConflicts(counts: MergeConflictCounts): number {
  return counts.workDailyReports + counts.qualityMonthlyReports
}

/** 보고서 건수든 공정표 충돌이든 하나라도 있으면 병합을 막는다. */
export function hasMergeConflict(counts: MergeConflictCounts): boolean {
  return totalMergeConflicts(counts) > 0 || counts.scheduleConflict
}

/** 새 RPC가 아직 배포되지 않아 호출이 실패했는지 판별한다. */
export function isMergeRpcMissingError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' && MISSING_RPC_CODES.has(code)
}

/** DB가 트랜잭션 안에서 최종 충돌로 중단한 오류면 그 건수를 돌려준다. */
export function parseMergeConflictError(error: unknown): MergeConflictCounts | null {
  if (typeof error !== 'object' || error === null) return null

  const { message, details } = error as { message?: unknown; details?: unknown }
  if (typeof message !== 'string') return null
  if (!MERGE_CONFLICT_MESSAGES.some((conflict) => message.includes(conflict))) return null
  if (typeof details !== 'string') return null

  try {
    return parseMergeConflictCounts(JSON.parse(details))
  } catch {
    return null
  }
}

/** 마지막 글자의 받침에 따라 주격 조사(이/가)를 고른다. */
function subjectParticle(text: string): '이' | '가' {
  const last = text.trimEnd().slice(-1)
  const code = last.charCodeAt(0)
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 === 0 ? '가' : '이'
  return '이'
}

/** 충돌 건수를 사용자에게 보여줄 한국어 문구로 만든다. */
export function describeMergeConflicts(counts: MergeConflictCounts): string {
  const parts: string[] = []
  if (counts.workDailyReports > 0) parts.push(`같은 날짜의 작업일보 ${counts.workDailyReports}건`)
  if (counts.qualityMonthlyReports > 0) {
    parts.push(`같은 연월의 품질시험 월간보고서 ${counts.qualityMonthlyReports}건`)
  }
  // 두 현장의 공정표가 서로 다른 경우와 보충 시 공사기간이 어긋나는 경우를 함께 가리킨다.
  if (counts.scheduleConflict) parts.push('그대로 옮길 수 없는 시공공정표')
  if (parts.length === 0) return '겹치는 자료가 없습니다.'

  const joined = parts.join('과 ')
  return `${joined}${subjectParticle(joined)} 있습니다. 원본 자료를 보존하기 위해 두 현장을 합칠 수 없습니다.`
}
