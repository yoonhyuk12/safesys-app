// CSI(gcloud.csi.go.kr) 로그인·로그아웃으로 조회용 세션 쿠키를 얻는 모듈 — 자격증명은 호출 인자로만 쓰고 어디에도 남기지 않는다
const LOGIN_URL = 'https://gcloud.csi.go.kr/cmq/com/loginProc.do'
const LOGOUT_URL = 'https://gcloud.csi.go.kr/cmq/com/logoutProc.do'

// 로그인 성공 시 리다이렉트되는 화면 — 이 경로로 보내야만 성공으로 본다
const NEXT_URL = '/qtr/sample/sealng/sampleSealngList.do'

// 공개 화면과 마찬가지로 <meta charset="euc-kr"> 선언과 달리 요청·응답 본문은 모두 UTF-8이다
const FORM_CONTENT_TYPE = 'application/x-www-form-urlencoded; charset=UTF-8'
const REQUEST_TIMEOUT_MS = 20000

// 로그인 실패는 200 + <script>alert('...')</script> 로 돌아온다
const ALERT_RE = /alert\(\s*'([^']*)'\s*\)/
const DEFAULT_LOGIN_ERROR = 'CSI 로그인에 실패했습니다.'
// alert 문구는 CSI가 주는 값이라 그대로 화면에 올리기 전에 길이·제어문자를 다듬는다
const MAX_ALERT_LENGTH = 200

// 제어문자는 공백으로 바꾼 뒤 공백을 합친다 — 그냥 지우면 줄바꿈을 사이에 둔 낱말이 붙어버린다
const sanitizeAlert = (text: string): string =>
  text
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_ALERT_LENGTH)

/** CSI가 거절한 로그인 — 메시지는 CSI alert 문구 그대로라 사용자에게 보여줘도 된다. */
export class CsiLoginError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CsiLoginError'
  }
}

export interface CsiSession {
  cookie: string // Cookie 헤더에 그대로 넣는 'name=value; name=value' 문자열
}

/**
 * CSI에 로그인해 조회용 쿠키를 얻는다.
 * 계정 잠금을 피하려고 재시도하지 않는다 — 실패는 그대로 올린다.
 */
export const loginCsi = async (userId: string, password: string): Promise<CsiSession> => {
  const res = await fetch(LOGIN_URL, {
    method: 'POST',
    headers: { 'Content-Type': FORM_CONTENT_TYPE },
    body: new URLSearchParams({
      userId,
      pswd: password,
      nextUrl: NEXT_URL,
      bbsId: '',
      bbsNo: '',
      caseNo: '',
      reprtSeq: '',
    }).toString(),
    redirect: 'manual', // 302를 따라가면 성공 판정에 쓸 Location을 잃는다
    cache: 'no-store',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  const location = res.headers.get('location') || ''
  // 실패도 쿠키를 내려주므로 쿠키 유무가 아니라 302 + 목록 화면 Location으로 판정한다
  if (res.status !== 302 || !location.includes('sampleSealngList.do')) {
    const body = await res.text().catch(() => '')
    const alertMatch = body.match(ALERT_RE)
    throw new CsiLoginError(
      alertMatch ? sanitizeAlert(alertMatch[1]) || DEFAULT_LOGIN_ERROR : DEFAULT_LOGIN_ERROR
    )
  }

  const cookie = res.headers
    .getSetCookie()
    .map((raw) => raw.split(';')[0].trim())
    .filter(Boolean)
    .join('; ')
  if (!cookie) throw new CsiLoginError(DEFAULT_LOGIN_ERROR)

  return { cookie }
}

/** 조회가 끝나면 세션을 닫는다. 로그아웃 실패는 조회 결과에 영향이 없어 삼킨다. */
export const logoutCsi = async (cookie: string): Promise<void> => {
  try {
    await fetch(LOGOUT_URL, {
      method: 'POST',
      headers: { 'Content-Type': FORM_CONTENT_TYPE, Cookie: cookie },
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch {
    // 세션은 CSI 쪽 타임아웃으로도 닫힌다 — 실패해도 사용자에게 알릴 것이 없다
  }
}
