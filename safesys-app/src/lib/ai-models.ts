// AI 기능별 모델명을 ai_model_settings 테이블에서 해석하고, 어떤 실패에도 기본값으로 폴백하는 서버 전용 헬퍼
import { RISK_AI_MODELS } from '@/lib/risk-assessment/types'

export type AiProvider = 'OpenAI' | 'Google'

export interface AiModelSetting {
  featureKey: string
  provider: AiProvider
  model: string
  location: string
  feature: string
  remarks: string
  inputPricePer1m: number | null
  outputPricePer1m: number | null
}

/** AI 사용 인벤토리 기본값 22행 — 시드·폴백·관리자 화면 표시의 단일 출처 (2026-08-27 관리자 DB와 폴백 동기화) */
export const DEFAULT_AI_MODELS = [
  {
    featureKey: 'chat.project-assistant',
    provider: 'OpenAI',
    model: 'gpt-5.6-luna',
    location: 'src/app/api/chat/project-assistant/route.ts',
    feature: '현장 AI 비서 챗봇',
    remarks: '',
    inputPricePer1m: null,
    outputPricePer1m: null,
  },
  {
    featureKey: 'chat.tbm',
    provider: 'OpenAI',
    model: 'gpt-5.6-luna',
    location: 'src/app/api/chat/tbm/route.ts',
    feature: 'TBM 현황 챗봇',
    remarks: '',
    inputPricePer1m: null,
    outputPricePer1m: null,
  },
  {
    featureKey: 'tbm-telegram.analyze',
    provider: 'OpenAI',
    model: 'gpt-5.6-luna',
    location: 'src/app/api/tbm-telegram/analyze/route.ts',
    feature: 'TBM 텔레그램 문안 생성',
    remarks: '',
    inputPricePer1m: null,
    outputPricePer1m: null,
  },
  {
    featureKey: 'ai.write-risk-analysis',
    provider: 'OpenAI',
    model: 'gpt-5.6-luna',
    location: 'src/app/api/ai/write-risk-analysis/route.ts',
    feature: 'TBM 위험분석 작성',
    remarks: '',
    inputPricePer1m: null,
    outputPricePer1m: null,
  },
  {
    featureKey: 'ai.translate',
    provider: 'OpenAI',
    model: 'gpt-5.6-luna',
    location: 'src/app/api/ai/translate/route.ts',
    feature: '안전교육 다국어 번역',
    remarks: '',
    inputPricePer1m: null,
    outputPricePer1m: null,
  },
  {
    featureKey: 'ai.tts.translate',
    provider: 'OpenAI',
    model: 'gpt-5.6-luna',
    location: 'src/app/api/ai/tts/route.ts',
    feature: 'TTS용 사전 번역',
    remarks: '',
    inputPricePer1m: null,
    outputPricePer1m: null,
  },
  {
    featureKey: 'ai.tts.speech',
    provider: 'OpenAI',
    model: 'tts-1',
    location: 'src/app/api/ai/tts/route.ts',
    feature: '음성 합성',
    remarks: 'OpenAI TTS 전용 모델만 지정 가능',
    inputPricePer1m: null,
    outputPricePer1m: null,
  },
  {
    featureKey: 'ai.tbm-safety-advice',
    provider: 'OpenAI',
    model: 'gpt-5.6-luna',
    location: 'src/app/api/ai/tbm-safety-advice/route.ts',
    feature: 'TBM 안전조치 확인사항',
    remarks: '',
    inputPricePer1m: null,
    outputPricePer1m: null,
  },
  {
    featureKey: 'ai.ptw-work-summary',
    provider: 'OpenAI',
    model: 'gpt-5.6-luna',
    location: 'src/app/api/ai/ptw-work-summary/route.ts',
    feature: '작업허가서 업무요약',
    remarks: '',
    inputPricePer1m: null,
    outputPricePer1m: null,
  },
  {
    featureKey: 'ai.ptw-risk-analysis',
    provider: 'OpenAI',
    model: 'gpt-5.6-luna',
    location: 'src/app/api/ai/ptw-risk-analysis/route.ts',
    feature: '작업허가서 위험분석',
    remarks: '',
    inputPricePer1m: null,
    outputPricePer1m: null,
  },
  {
    featureKey: 'ai.headquarters-remarks',
    provider: 'OpenAI',
    model: 'gpt-5.6-luna',
    location: 'src/app/api/ai/headquarters-remarks/route.ts',
    feature: '본부점검 의견 생성',
    remarks: '',
    inputPricePer1m: null,
    outputPricePer1m: null,
  },
  {
    featureKey: 'ai.extract-equipment-count',
    provider: 'OpenAI',
    model: 'gpt-5.6-luna',
    location: 'src/app/api/ai/extract-equipment-count/route.ts',
    feature: '장비 대수 추출',
    remarks: '',
    inputPricePer1m: null,
    outputPricePer1m: null,
  },
  {
    featureKey: 'ai.daily-inspection',
    provider: 'OpenAI',
    model: 'gpt-5.6-luna',
    location: 'src/app/api/ai/daily-inspection/route.ts',
    feature: '일일점검 체크리스트 생성',
    remarks: '',
    inputPricePer1m: null,
    outputPricePer1m: null,
  },
  {
    featureKey: 'ai.ocr-card',
    provider: 'OpenAI',
    model: 'gpt-5.6-luna',
    location: 'src/app/api/ai/ocr-card/route.ts',
    feature: '교육 이수증 OCR',
    remarks: '',
    inputPricePer1m: null,
    outputPricePer1m: null,
  },
  {
    featureKey: 'ai.supervisor-summary.remarks',
    provider: 'OpenAI',
    model: 'gpt-5.6-luna',
    location: 'src/app/api/ai/supervisor-summary/route.ts',
    feature: '감독일지 의견·요약',
    remarks: '',
    inputPricePer1m: null,
    outputPricePer1m: null,
  },
  {
    featureKey: 'ai.inspection-checklist',
    provider: 'Google',
    model: 'gemini-flash-lite-latest',
    location: 'src/app/api/ai/inspection-checklist/route.ts',
    feature: '검측 체크리스트 생성',
    remarks: '',
    inputPricePer1m: null,
    outputPricePer1m: null,
  },
  {
    featureKey: 'ai.work-plan',
    provider: 'Google',
    model: 'gemini-flash-lite-latest',
    location: 'src/app/api/ai/work-plan/route.ts',
    feature: 'AI 작업계획서 초안',
    remarks: '',
    inputPricePer1m: null,
    outputPricePer1m: null,
  },
  {
    featureKey: 'ai.supervisor-summary.classify',
    provider: 'Google',
    model: 'gemini-flash-lite-latest',
    location: 'src/app/api/ai/supervisor-summary/route.ts',
    feature: '감독일지 장비·인력 분류',
    remarks: '',
    inputPricePer1m: null,
    outputPricePer1m: null,
  },
  {
    featureKey: 'ai.risk-assessment',
    provider: 'Google',
    model: 'gemini-flash-lite-latest',
    location: 'src/app/api/ai/risk-assessment/route.ts',
    feature: '수시 위험성평가 AI 판정',
    remarks: '폴백 체인 gemini-3.1-flash-lite 자동 적용',
    inputPricePer1m: null,
    outputPricePer1m: null,
  },
  {
    featureKey: 'ai.risk-classify',
    provider: 'Google',
    model: 'gemini-flash-lite-latest',
    location: 'src/app/api/ai/risk-classify/route.ts',
    feature: '작업내용 분류 매칭',
    remarks: '폴백 체인 gemini-3.1-flash-lite 자동 적용',
    inputPricePer1m: null,
    outputPricePer1m: null,
  },
  {
    featureKey: 'ai.risk-row',
    provider: 'Google',
    model: 'gemini-flash-lite-latest',
    location: 'src/app/api/ai/risk-row/route.ts',
    feature: '새 위험요인 행 작성',
    remarks: '폴백 체인 gemini-3.1-flash-lite 자동 적용',
    inputPricePer1m: null,
    outputPricePer1m: null,
  },
  {
    featureKey: 'ai.tbm-risk-link',
    provider: 'Google',
    model: 'gemini-flash-lite-latest',
    location: 'src/app/api/ai/tbm-risk-link/route.ts',
    feature: 'TBM 위험요인 연계',
    remarks: '폴백 체인 gemini-3.1-flash-lite 자동 적용',
    inputPricePer1m: null,
    outputPricePer1m: null,
  },
] as const satisfies readonly AiModelSetting[]

/** 코드가 호출할 수 있는 기능 키 — 오타를 컴파일 단계에서 잡는다. */
export type AiFeatureKey = (typeof DEFAULT_AI_MODELS)[number]['featureKey']

const CACHE_TTL_MS = 60_000

let cachedModels: ReadonlyMap<string, string> | null = null
let cachedAt = 0

interface ModelRow {
  feature_key: string
  model: string
}

function isModelRow(value: unknown): value is ModelRow {
  if (typeof value !== 'object' || value === null) return false
  const row = value as Record<string, unknown>
  return typeof row.feature_key === 'string' && typeof row.model === 'string' && row.model.trim().length > 0
}

export function getDefaultAiModel(featureKey: AiFeatureKey): string {
  const setting = DEFAULT_AI_MODELS.find((entry) => entry.featureKey === featureKey)
  return setting?.model ?? ''
}

// 테이블 미존재·환경 변수 누락·네트워크 실패를 모두 삼키고 빈 맵을 캐시한다.
// 빈 맵도 TTL 동안 유지해 마이그레이션 전 환경에서 매 호출마다 재조회하지 않는다.
async function loadModelMap(): Promise<ReadonlyMap<string, string>> {
  try {
    // 서비스 롤 환경 변수가 없는 환경에서도 이 모듈을 import한 라우트가 죽지 않도록 지연 import한다.
    const { supabaseAdmin } = await import('@/lib/supabase-admin')
    const { data, error } = await supabaseAdmin.from('ai_model_settings').select('feature_key, model')
    if (error) throw error

    const rows: unknown[] = Array.isArray(data) ? data : []
    return new Map(rows.filter(isModelRow).map((row) => [row.feature_key, row.model.trim()]))
  } catch (error) {
    console.error('AI 모델 설정 조회 실패 — 기본값으로 폴백합니다.', error)
    return new Map<string, string>()
  }
}

async function getModelMap(): Promise<ReadonlyMap<string, string>> {
  if (cachedModels && Date.now() - cachedAt < CACHE_TTL_MS) return cachedModels

  const map = await loadModelMap()
  cachedModels = map
  cachedAt = Date.now()
  return map
}

/** 기능 키에 해당하는 모델명을 반환한다. DB 값이 없거나 조회에 실패하면 기본값을 쓴다. */
export async function getAiModel(featureKey: AiFeatureKey): Promise<string> {
  const fallback = getDefaultAiModel(featureKey)
  const map = await getModelMap()
  return map.get(featureKey) || fallback
}

// 샘플링 파라미터(temperature·top_p·penalty 계열)를 지원하는 구세대 모델 접두사 허용 목록.
// gpt-5 이후 추론 계열은 이 파라미터들을 전부 거부하므로, 목록에 없는 모델(향후 교체될 새 모델 포함)은
// 미전송이 항상 안전한 기본값이다. 새 모델 도입 시 이 목록만 손보면 된다.
const SAMPLING_PARAM_MODEL_PREFIXES = ['gpt-4', 'gpt-3.5']

/** temperature 등 샘플링 파라미터 전송 가능 여부를 판별한다 — 허용 목록에 없는 모델은 보내지 않는다. */
export function supportsSamplingParams(model: string): boolean {
  return SAMPLING_PARAM_MODEL_PREFIXES.some((prefix) => model.startsWith(prefix))
}

// 추론 계열 모델의 max_completion_tokens에는 눈에 보이지 않는 추론 토큰이 함께 계산된다.
// 실측상 짧은 프롬프트도 추론에만 300~400 토큰을 쓰므로, 기존 한도를 그대로 넘기면 본문이 잘려 빈 응답이 된다.
// 상한일 뿐 실제 과금은 사용량 기준이므로 넉넉히 잡아 잘림만 막는다.
const REASONING_RESERVE_TOKENS = 4000

/** 모델에 맞는 토큰 상한 파라미터를 만든다 — 구세대 모델은 max_tokens, 그 외(추론 계열·향후 모델)는 max_completion_tokens에 추론 예비분을 더한다. */
export function tokenLimitParam(
  model: string,
  limit: number
): { max_tokens: number } | { max_completion_tokens: number } {
  return supportsSamplingParams(model)
    ? { max_tokens: limit }
    : { max_completion_tokens: limit + REASONING_RESERVE_TOKENS }
}

/** 위험성평가 계열용 — DB(또는 기본값) 모델을 선두에 두고 기존 폴백 체인을 뒤에 붙인다. */
export async function getAiModelChain(featureKey: AiFeatureKey): Promise<string[]> {
  const primary = await getAiModel(featureKey)
  return [...new Set([primary, ...RISK_AI_MODELS])]
}
