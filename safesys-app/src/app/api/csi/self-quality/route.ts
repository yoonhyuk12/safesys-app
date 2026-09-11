// 요청별 CSI 로그인으로 자체 품질시험의 사업 또는 실적 목록을 반환한다.
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { CsiLoginError, loginCsi, logoutCsi } from '@/lib/quality/csi-session'
import { CsiParseError, CsiSessionError, fetchSelfQualityProjects, fetchSelfQualityRows } from '@/lib/quality/csi-self-quality-scrape'
import { isCsiDateRange } from '@/lib/quality/csi-date-range'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  const authorization = request.headers.get('authorization')
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!token) return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 })
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return NextResponse.json({ success: false, error: '인증에 실패했습니다.' }, { status: 401 })
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.userId !== 'string' || typeof body.password !== 'string' || !body.userId.trim() || !body.password || body.userId.length > 50 || body.password.length > 100 || (body.bizMngNo !== undefined && (typeof body.bizMngNo !== 'string' || !/^\d{1,30}$/.test(body.bizMngNo))) || (body.projectSearch !== undefined && (typeof body.projectSearch !== 'string' || body.projectSearch.length > 100))) {
    return NextResponse.json({ success: false, error: 'CSI 아이디·비밀번호 및 사업 선택을 확인해주세요.' }, { status: 400 })
  }
  const hasDateRange = body.startDate !== undefined || body.endDate !== undefined
  if (hasDateRange && !isCsiDateRange(body.startDate, body.endDate)) {
    return NextResponse.json({ success: false, error: '조회 시작일과 종료일을 올바른 순서의 날짜로 입력해주세요.' }, { status: 400 })
  }
  let cookie = ''
  try {
    cookie = (await loginCsi(body.userId.trim(), body.password)).cookie
    if (body.bizMngNo) {
      const result = await fetchSelfQualityRows(cookie, body.bizMngNo, hasDateRange ? { startDate: body.startDate, endDate: body.endDate } : undefined)
      return NextResponse.json({ success: true, data: { ...result, projects: [] } })
    }
    const result = await fetchSelfQualityProjects(cookie, body.projectSearch?.trim() || '')
    return NextResponse.json({ success: true, data: { projects: result.rows, rows: [], totalCount: result.totalCount, truncated: result.truncated } })
  } catch (err: unknown) {
    const known = err instanceof CsiLoginError || err instanceof CsiParseError || err instanceof CsiSessionError
    if (!known) {
      // 외부 응답·자격증명을 출력하지 않고 실행 단계 진단에 필요한 오류 종류만 남긴다.
      const cause = err instanceof Error ? err.cause as { code?: unknown } | undefined : undefined
      console.error('CSI 자체 품질시험 조회 오류', {
        stage: cookie ? 'list' : 'login',
        name: err instanceof Error ? err.name : 'UnknownError',
        code: typeof cause?.code === 'string' && /^[A-Z_0-9]+$/.test(cause.code) ? cause.code : undefined,
        reason: err instanceof Error && /getSetCookie/.test(err.message) ? 'getSetCookie unavailable' : undefined,
      })
    }
    return NextResponse.json({ success: false, error: known ? err.message : 'CSI 자체 품질시험 조회에 실패했습니다. 잠시 후 다시 시도해주세요.' }, { status: err instanceof CsiLoginError ? 400 : 502 })
  } finally {
    if (cookie) await logoutCsi(cookie)
  }
}
