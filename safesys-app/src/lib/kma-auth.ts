// 기상청 API 허브(apihub.kma.go.kr) 인증키를 한곳에서 관리하는 공통 헬퍼 (서버 라우트 전용)

// env 미설정 시 사용하는 폴백 키 — 기존 asos-range·historical 라우트에 하드코딩되어 있던 유효 키
const FALLBACK_HUB_KEY = '_mpe0uWTQuKqXtLlk_LinA'

/**
 * 기상청 API 허브 인증키를 반환한다.
 * 폭염점검(weather-crawl)과 동일한 우선순위로 환경변수(KMA → KMA_API_KEY → NEXT_PUBLIC_KMA_API_KEY)를
 * 읽고, 모두 비어 있으면 폴백 키를 사용한다.
 * 단, 환경변수에 data.go.kr용 장문 키(base64 88자, '=' 패딩)가 들어 있으면 허브에서 401이 나므로
 * 허브 키 형태(짧은 토큰)가 아닌 값은 무시하고 폴백 키를 쓴다.
 */
export function getKmaHubKey(): string {
  const envKey = (
    process.env.KMA ||
    process.env.KMA_API_KEY ||
    process.env.NEXT_PUBLIC_KMA_API_KEY ||
    ''
  ).replace(/\s+/g, '').trim()
  const looksLikeDataGoKrKey = envKey.length > 40 || envKey.includes('=') || envKey.includes('%')
  return envKey && !looksLikeDataGoKrKey ? envKey : FALLBACK_HUB_KEY
}
