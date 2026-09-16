// 사고 이력의 중대도·산재신청·일자를 화면 표기로 바꾸는 순수 표시 모듈
import {
  ACCIDENT_COMP_CLAIM_OPTIONS,
  ACCIDENT_SEVERITY_OPTIONS,
  type AccidentSeverity,
  type WorkersCompClaim,
} from '@/lib/accident-analysis-types'

/** 사고일자는 서울 자정으로 저장한다. 표시 시간대를 고정하지 않으면 다른 지역에서 전날로 보인다. */
const SEOUL_TIME_ZONE = 'Asia/Seoul'

const BADGE_DANGER = 'bg-red-100 text-red-800'
const BADGE_CAUTION = 'bg-amber-100 text-amber-800'
const BADGE_INFO = 'bg-blue-100 text-blue-800'
const BADGE_NEUTRAL = 'bg-gray-100 text-gray-800'

/** 중대도 배지는 색으로 위험(사망·중상)과 주의(휴업·경상) 두 단계를 나누고, 등급 이름은 글자가 말한다. */
export function severityBadgeClass(severity: AccidentSeverity | string): string {
  return severity === 'fatal' || severity === 'serious' ? BADGE_DANGER : BADGE_CAUTION
}

export function severityLabel(severity: AccidentSeverity | string): string {
  return ACCIDENT_SEVERITY_OPTIONS.find((option) => option.value === severity)?.label ?? severity
}

/** 값이 없으면 미확인으로 본다. 기존 등록분은 null이다. */
export function compClaimLabel(claim: WorkersCompClaim | null): string {
  return ACCIDENT_COMP_CLAIM_OPTIONS.find((option) => option.value === (claim ?? ''))?.label ?? '미확인'
}

export function compClaimBadgeClass(claim: WorkersCompClaim | null): string {
  return claim === 'applied' ? BADGE_INFO : BADGE_NEUTRAL
}

export function formatAccidentDate(value?: string | null): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString('ko-KR', { timeZone: SEOUL_TIME_ZONE })
}

export function formatAccidentDateTime(value?: string | null): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('ko-KR', { timeZone: SEOUL_TIME_ZONE })
}
