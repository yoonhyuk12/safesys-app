// /tbm 화면이 다시 보일 때(visibilitychange) 데이터를 재조회할지 정하는 순수 정책.
// 창을 잠깐 다녀온 것만으로 서버를 다시 읽지 않도록, 마지막 로드가 자동 새로고침 주기보다 오래됐을 때만 true 를 돌려준다.

/** TBM 현황 자동 새로고침 주기(ms). TBMStatus 의 15분 타이머와 같은 값이다. */
export const TBM_AUTO_REFRESH_INTERVAL_MS = 15 * 60 * 1000

/**
 * 탭이 다시 보일 때 재조회가 필요한지 판단한다.
 * @param lastLoadedAt 마지막 로드 완료 시각(epoch ms). 없으면 아직 로드한 적이 없다.
 * @param now 현재 시각(epoch ms)
 * @param intervalMs 재조회 기준 주기(ms)
 */
export function shouldRefetchOnVisible(
  lastLoadedAt: number | null | undefined,
  now: number,
  intervalMs: number = TBM_AUTO_REFRESH_INTERVAL_MS
): boolean {
  if (lastLoadedAt == null) return true
  return now - lastLoadedAt >= intervalMs
}
