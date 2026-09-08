// 공사감독일지 AI 공사기록 생성의 기본 작성 지침 — 모달 프롬프트 입력칸과 AI API가 공유

export const SUPERVISOR_INSTRUCTIONS_DEFAULT_GUIDE = `- 반드시 6줄 이내로 작성 (절대 초과 금지)
- 전일 작업내용과 비교하여 금일 진행된 사실 위주로 간결하게 기술 (공정률 추측 금지)
- 인력과 장비 투입이 적절했는지 간략히 평가
- "○"로 시작하는 불릿 포인트 형식 사용`

/** 사용자가 입력한 지침을 정규화 — 공백뿐이면 기본 지침, 과도하게 길면 잘라낸다 */
export const SUPERVISOR_INSTRUCTIONS_GUIDE_MAX_LENGTH = 2000

export function normalizeSupervisorInstructionsGuide(guide?: unknown): string {
  if (typeof guide !== 'string') return SUPERVISOR_INSTRUCTIONS_DEFAULT_GUIDE
  const trimmed = guide.trim()
  if (!trimmed) return SUPERVISOR_INSTRUCTIONS_DEFAULT_GUIDE
  return trimmed.slice(0, SUPERVISOR_INSTRUCTIONS_GUIDE_MAX_LENGTH)
}
