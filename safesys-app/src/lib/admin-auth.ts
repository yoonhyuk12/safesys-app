// 관리자 API 공통 인증 유틸 — Bearer 토큰 검증 후 ADMIN_EMAILS 허용목록으로 관리자 여부 판별
import { NextRequest } from 'next/server'
import { User } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/supabase-admin'

// ADMIN_EMAILS: 콤마 구분 관리자 이메일 목록 (서버 전용 환경 변수)
function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

export function isAdminEmail(email: string | undefined): boolean {
  if (!email) return false
  return getAdminEmails().includes(email.toLowerCase())
}

export function hasOtpLogin(token: string): boolean {
  try {
    const [, encodedPayload] = token.split('.')
    if (!encodedPayload) return false

    const payload: unknown = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'))
    if (typeof payload !== 'object' || payload === null || !('amr' in payload) || !Array.isArray(payload.amr)) {
      return false
    }

    return payload.amr.some(
      (entry) => typeof entry === 'object' && entry !== null && 'method' in entry && entry.method === 'otp'
    )
  } catch {
    return false
  }
}

export type AdminAuthResult =
  | { ok: true; user: User }
  | { ok: false; status: 401 | 403; error: string }

// 요청의 Bearer 토큰을 검증하고 관리자일 때만 ok를 반환한다.
export async function requireAdmin(request: NextRequest): Promise<AdminAuthResult> {
  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) {
    return { ok: false, status: 401, error: '로그인이 필요합니다.' }
  }
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) {
    return { ok: false, status: 401, error: '인증에 실패했습니다.' }
  }
  if (!isAdminEmail(user.email)) {
    return { ok: false, status: 403, error: '관리자 권한이 없습니다.' }
  }
  if (!hasOtpLogin(token)) {
    return { ok: false, status: 403, error: '이메일 인증번호 로그인이 필요합니다.' }
  }
  return { ok: true, user }
}
