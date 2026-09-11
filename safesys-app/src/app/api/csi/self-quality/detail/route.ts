// 요청별 CSI 로그인으로 선택한 자체 품질시험의 측정 결과를 반환한다.
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { CsiLoginError, loginCsi, logoutCsi } from '@/lib/quality/csi-session'
import { CsiParseError, CsiSessionError, fetchSelfQualityDetail } from '@/lib/quality/csi-self-quality-scrape'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  const authorization = request.headers.get('authorization')
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!token) return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 })
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return NextResponse.json({ success: false, error: '인증에 실패했습니다.' }, { status: 401 })
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.userId !== 'string' || typeof body.password !== 'string' || !body.userId.trim() || !body.password || body.userId.length > 50 || body.password.length > 100 || typeof body.bizMngNo !== 'string' || !/^\d{1,30}$/.test(body.bizMngNo) || typeof body.groupNo !== 'string' || !/^\d{1,30}$/.test(body.groupNo)) {
    return NextResponse.json({ success: false, error: 'CSI 로그인 정보와 선택한 실적을 확인해주세요.' }, { status: 400 })
  }
  let cookie = ''
  try {
    cookie = (await loginCsi(body.userId.trim(), body.password)).cookie
    const detail = await fetchSelfQualityDetail(cookie, body.groupNo, body.bizMngNo)
    return NextResponse.json({ success: true, data: detail })
  } catch (err: unknown) {
    const known = err instanceof CsiLoginError || err instanceof CsiParseError || err instanceof CsiSessionError
    if (!known) {
      const cause = err instanceof Error ? err.cause as { code?: unknown } | undefined : undefined
      console.error('CSI 자체 품질시험 상세 조회 오류', {
        stage: cookie ? 'detail' : 'login',
        name: err instanceof Error ? err.name : 'UnknownError',
        code: typeof cause?.code === 'string' && /^[A-Z_0-9]+$/.test(cause.code) ? cause.code : undefined,
        reason: err instanceof Error && /getSetCookie/.test(err.message) ? 'getSetCookie unavailable' : undefined,
      })
    }
    return NextResponse.json({ success: false, error: known ? err.message : 'CSI 자체 품질시험 상세 조회에 실패했습니다. 잠시 후 다시 시도해주세요.' }, { status: err instanceof CsiLoginError ? 400 : 502 })
  } finally {
    if (cookie) await logoutCsi(cookie)
  }
}
