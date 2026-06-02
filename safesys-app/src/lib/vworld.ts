/**
 * V-World API 인증키 단일 관리 지점.
 *
 * 키 변경 시 이 파일(또는 환경변수 NEXT_PUBLIC_VWORLD_API_KEY) 한 곳만 수정하면
 * 지도 로드 / 주소 검색 / 역지오코딩 전부에 반영된다.
 *
 * - 서버 라우트(geocoding), 클라이언트 컴포넌트(VworldAddressSearch)는 이 상수를 import.
 * - 정적 iframe(public/vworld-map.html)은 환경변수를 직접 못 읽으므로
 *   VworldMapAddressModal 이 iframe src 쿼리(?key=)로 이 값을 전달한다.
 *
 * 환경변수(Vercel 등)가 설정되어 있으면 그 값이 우선하고,
 * 없으면 아래 기본 키로 폴백하여 미설정 시에도 동작이 깨지지 않는다.
 */
export const VWORLD_API_KEY: string =
  process.env.NEXT_PUBLIC_VWORLD_API_KEY || '6CC56ABA-00BE-3D0C-B544-53D5B25BC2C5'
