// 관리자 로그인 인증번호의 발급 정책 상수와 생성·해시·타이밍 안전 비교를 담당하는 서버 전용 유틸
import { createHmac, randomInt, timingSafeEqual } from 'crypto'

// 인증번호 자릿수
export const OTP_CODE_LENGTH = 6
// 인증번호 유효시간 (분)
export const OTP_TTL_MINUTES = 5
export const OTP_TTL_MS = OTP_TTL_MINUTES * 60 * 1000
// 같은 코드에 허용하는 최대 오답 횟수 — 이를 넘기면 코드를 소각한다.
export const OTP_MAX_ATTEMPTS = 5
// 재발송 서버측 쿨다운 (초)
export const OTP_RESEND_COOLDOWN_SECONDS = 60
// 발송 빈도 상한과 그 측정 구간
export const OTP_MAX_PER_WINDOW = 10
export const OTP_RATE_WINDOW_MS = 60 * 60 * 1000
// 발급 이력 보관 기간 — 이보다 오래된 행은 발송 시 정리한다.
export const OTP_RETENTION_MS = 24 * 60 * 60 * 1000

// 앞자리 0을 허용하는 6자리 숫자 코드를 만든다.
export function generateOtpCode(): string {
  const max = 10 ** OTP_CODE_LENGTH
  return String(randomInt(0, max)).padStart(OTP_CODE_LENGTH, '0')
}

// 6자리는 평문 해시면 전수 대조가 자명하므로 서버 전용 키를 pepper로 쓴다.
export function hashOtpCode(code: string): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) {
    throw new Error('인증번호 해시 키가 없습니다. SUPABASE_SERVICE_ROLE_KEY 환경 변수를 설정해야 합니다.')
  }
  return createHmac('sha256', secret).update(code).digest('hex')
}

// 입력 코드의 해시를 저장된 해시와 타이밍 안전하게 비교한다.
export function isOtpCodeMatch(code: string, storedHash: string): boolean {
  const computed = Buffer.from(hashOtpCode(code), 'utf8')
  const stored = Buffer.from(storedHash, 'utf8')
  if (computed.length !== stored.length) return false
  return timingSafeEqual(computed, stored)
}
