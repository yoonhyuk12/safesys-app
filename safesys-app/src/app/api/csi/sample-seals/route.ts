// CSI 로그인 세션으로 시료봉인 목록을 조회하는 API 라우트 — 자격증명은 요청마다 받아 쓰고 저장·기록하지 않는다
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { CsiLoginError, loginCsi, logoutCsi } from '@/lib/quality/csi-session'
import { CsiParseError, CsiSessionError, fetchSampleSeals } from '@/lib/quality/csi-sample-seal-scrape'
import type { CsiSampleSealListResponse } from '@/lib/quality/csi-sample-seal-types'

// 로그인 + 최대 10페이지 순차 조회 + 로그아웃까지 한 요청에서 끝난다
export const maxDuration = 60

// CSI 로그인 폼의 입력 상한 — 그 이상은 우리 쪽에서 막아 불필요한 CSI 요청을 만들지 않는다
const MAX_USER_ID_LENGTH = 50
const MAX_PASSWORD_LENGTH = 100

export async function POST(request: NextRequest) {
  const authorization = request.headers.get('authorization')
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!token) {
    return NextResponse.json<CsiSampleSealListResponse>(
      { success: false, error: '로그인이 필요합니다.' },
      { status: 401 }
    )
  }

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) {
    return NextResponse.json<CsiSampleSealListResponse>(
      { success: false, error: '인증에 실패했습니다.' },
      { status: 401 }
    )
  }

  const body = (await request.json().catch(() => ({}))) as {
    userId?: string
    password?: string
    constNm?: string
  }
  const userId = String(body.userId || '').trim()
  const password = String(body.password || '')
  const constNm = String(body.constNm || '').trim()
  if (
    !userId ||
    !password ||
    userId.length > MAX_USER_ID_LENGTH ||
    password.length > MAX_PASSWORD_LENGTH
  ) {
    return NextResponse.json<CsiSampleSealListResponse>(
      { success: false, error: 'CSI 아이디와 비밀번호를 입력해주세요.' },
      { status: 400 }
    )
  }

  let cookie = ''
  try {
    // 서버리스라 세션을 보관할 수 없다 — 요청마다 로그인하고 끝나면 반드시 로그아웃한다
    const session = await loginCsi(userId, password)
    cookie = session.cookie
    const result = await fetchSampleSeals(cookie, { constNm })
    return NextResponse.json<CsiSampleSealListResponse>({
      success: true,
      data: {
        totalCount: result.totalCount,
        fetchedRowCount: result.rows.length,
        rows: result.rows,
        truncated: result.truncated,
      },
    })
  } catch (err: unknown) {
    // 아래 로그·응답에는 아이디·비밀번호·쿠키를 절대 담지 않는다
    if (err instanceof CsiLoginError) {
      return NextResponse.json<CsiSampleSealListResponse>(
        { success: false, error: `CSI 로그인 실패: ${err.message}` },
        { status: 400 }
      )
    }
    if (err instanceof CsiSessionError || err instanceof CsiParseError) {
      console.error('CSI 시료봉인 목록 조회 실패:', err.name, err.message)
      return NextResponse.json<CsiSampleSealListResponse>(
        { success: false, error: err.message },
        { status: 502 }
      )
    }
    const isTimeout = err instanceof Error && err.name === 'TimeoutError'
    console.error('CSI 시료봉인 목록 조회 오류:', err instanceof Error ? err.message : '알 수 없는 오류')
    return NextResponse.json<CsiSampleSealListResponse>(
      {
        success: false,
        error: isTimeout
          ? 'CSI 응답이 지연되고 있습니다. 잠시 후 다시 시도해주세요.'
          : 'CSI 시료봉인 목록 조회 중 오류가 발생했습니다.',
      },
      { status: 502 }
    )
  } finally {
    if (cookie) await logoutCsi(cookie)
  }
}
