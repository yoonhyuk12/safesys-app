// TBM 챗봇용 투입인원 파싱·집계 유틸과 모델 참조 가이드(시스템 프롬프트 주입용)

/**
 * 자유 텍스트 personnel_count에서 총 투입인원(명)을 추정한다.
 * 현장 담당자가 직종별로 자유롭게 적은 텍스트를 합산하는 best-effort 휴리스틱이다.
 *
 * 규칙
 * 1. "총원/총인원/합계/총계/전체/총 N명"처럼 총인원이 선언된 줄이 있으면 그 값을 우선 사용한다.
 *    직종 내역과 중복 합산하지 않는다. (예: "총원 5명\n보통인부 2명" → 7이 아니라 5)
 * 2. 선언된 총인원이 없으면 직종별 숫자를 합산한다. "X인 Y조"는 X×Y로 계산한다.
 *
 * 예)
 * - "작업반장 1명\n관로공 2명\n신호수 1명" → 4
 * - "직영 1\n설비 4\n철골 1\n석공 5\n수장 14" → 25
 * - "3인 1조" → 3 (인원 = 인 × 조)
 * - "총원 5명\n보통인부 2명" → 5 (선언된 총원 우선)
 * - "" / "작업없음" → 0
 */
export function parsePersonnelCount(text?: string | null): number {
  if (!text) return 0

  // 1) 총원/합계/전체/총 N명 등 '선언된 총인원'이 있으면 그 값을 우선 사용한다.
  //    직종 내역과의 중복 합산을 막는다. ("총무"·"전공"·"합판" 등은 숫자가 인접해야 매칭되므로 오인하지 않는다.)
  const declaredRegex = /(?:총\s*원|총\s*인원|총\s*인력|총\s*계|합\s*계|전\s*체(?:\s*인원)?|총)\s*[:\-]?\s*(\d+)\s*명?/g
  let declaredTotal = 0
  let hasDeclared = false
  for (const match of text.matchAll(declaredRegex)) {
    hasDeclared = true
    declaredTotal += parseInt(match[1], 10)
  }
  if (hasDeclared) return declaredTotal

  // 2) 선언된 총인원이 없으면 직종별 숫자를 합산한다.
  //    이때 시각(07시30분, 08:30)·팀 순번(1팀)은 인원이 아니므로 먼저 제거한다.
  //    ("07시30분"의 7·30, "1팀투입"의 1을 인원으로 오인 합산하던 문제 방지)
  const cleaned = text
    .replace(/\d{1,2}[ \t]*시(?:[ \t]*\d{1,2})?(?:[ \t]*분)?/g, ' ') // 07시 / 07시30 / 07시30분
    .replace(/\d{1,2}[ \t]*분/g, ' ')                                 // 30분 (시 없이)
    .replace(/\d{1,2}[ \t]*:[ \t]*\d{2}/g, ' ')                       // 08:30
    .replace(/\d+[ \t]*팀/g, ' ')                                      // 1팀, 2팀 (RC팀 등 숫자 없는 팀명은 보존)

  let total = 0

  // "X인 Y조" 패턴은 인원 = X × Y로 계산 (예: 3인 1조 = 3명, 2인 3조 = 6명)
  const working = cleaned.replace(/(\d+)\s*인\s*(\d+)\s*조/g, (_match, perTeam: string, teams: string) => {
    total += parseInt(perTeam, 10) * parseInt(teams, 10)
    return ' '
  })

  // 나머지 직종별 숫자 합산
  const numbers = working.match(/\d+/g)
  if (numbers) {
    total += numbers.reduce((sum, n) => sum + parseInt(n, 10), 0)
  }

  return total
}

/**
 * 시스템 프롬프트에 주입할 투입인원 용어·집계 규칙 가이드.
 * 모델이 본부/지사 투입인원 질문에서 신규인원과 혼동하지 않도록 안내한다.
 */
export const TBM_PERSONNEL_GUIDE = `===== 📐 투입인원 집계 가이드 =====
- "투입인원"은 해당 현장 TBM에 실제 투입된 총 작업 인원(직종별 인원의 합)을 뜻한다.
- "신규인원"(오늘 처음 투입된 인원)과 절대 혼동하지 않는다. 두 개념은 서로 다른 숫자다.
- 본부 전체/지사 단위 투입인원을 물으면 아래 "본부별 현황"·"지사별 현황"의 투입인원 수치를 정답으로 사용한다(서버에서 미리 합산한 값이다).
- 현장별 상세 기록의 투입인원 항목은 직종 구성·세부 내역을 설명할 때만 참고한다.
- 원문은 자유 형식이라 합계는 추정치다. 합계와 원문이 어긋나면 합계를 우선하되, 필요 시 추정치임을 안내한다.
- 빈 값이거나 "작업없음"인 현장은 투입인원 0명으로 본다.`
