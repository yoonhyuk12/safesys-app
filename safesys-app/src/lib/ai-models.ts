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
}

/** AI 사용 인벤토리 기본값 22행 — 시드·폴백·관리자 화면 표시의 단일 출처 (2026-08-13 전수 조사) */
export const DEFAULT_AI_MODELS = [
  {
    featureKey: 'chat.project-assistant',
    provider: 'OpenAI',
    model: 'gpt-5.6-luna',
    location: 'src/app/api/chat/project-assistant/route.ts',
    feature: '현장 AI 비서 챗봇',
    remarks: '',
  },
  {
    featureKey: 'chat.tbm',
    provider: 'OpenAI',
    model: 'gpt-5.6-luna',
    location: 'src/app/api/chat/tbm/route.ts',
    feature: 'TBM 현황 챗봇',
    remarks: '',
  },
  {
    featureKey: 'tbm-telegram.analyze',
    provider: 'OpenAI',
    model: 'gpt-5.6-luna',
    location: 'src/app/api/tbm-telegram/analyze/route.ts',
    feature: 'TBM 텔레그램 문안 생성',
    remarks: '',
  },
  {
    featureKey: 'ai.write-risk-analysis',
    provider: 'OpenAI',
    model: 'gpt-5.4-nano',
    location: 'src/app/api/ai/write-risk-analysis/route.ts',
    feature: 'TBM 위험분석 작성',
    remarks: '',
  },
  {
    featureKey: 'ai.translate',
    provider: 'OpenAI',
    model: 'gpt-4o-mini',
    location: 'src/app/api/ai/translate/route.ts',
    feature: '안전교육 다국어 번역',
    remarks: '',
  },
  {
    featureKey: 'ai.tts.translate',
    provider: 'OpenAI',
    model: 'gpt-4o-mini',
    location: 'src/app/api/ai/tts/route.ts',
    feature: 'TTS용 사전 번역',
    remarks: '',
  },
  {
    featureKey: 'ai.tts.speech',
    provider: 'OpenAI',
    model: 'tts-1',
    location: 'src/app/api/ai/tts/route.ts',
    feature: '음성 합성',
    remarks: 'OpenAI TTS 전용 모델만 지정 가능',
  },
  {
    featureKey: 'ai.tbm-safety-advice',
    provider: 'OpenAI',
    model: 'gpt-4o-mini',
    location: 'src/app/api/ai/tbm-safety-advice/route.ts',
    feature: 'TBM 안전조치 확인사항',
    remarks: '',
  },
  {
    featureKey: 'ai.ptw-work-summary',
    provider: 'OpenAI',
    model: 'gpt-4o-mini',
    location: 'src/app/api/ai/ptw-work-summary/route.ts',
    feature: '작업허가서 업무요약',
    remarks: '',
  },
  {
    featureKey: 'ai.ptw-risk-analysis',
    provider: 'OpenAI',
    model: 'gpt-4o-mini',
    location: 'src/app/api/ai/ptw-risk-analysis/route.ts',
    feature: '작업허가서 위험분석',
    remarks: '',
  },
  {
    featureKey: 'ai.headquarters-remarks',
    provider: 'OpenAI',
    model: 'gpt-4o-mini',
    location: 'src/app/api/ai/headquarters-remarks/route.ts',
    feature: '본부점검 의견 생성',
    remarks: '',
  },
  {
    featureKey: 'ai.extract-equipment-count',
    provider: 'OpenAI',
    model: 'gpt-4o-mini',
    location: 'src/app/api/ai/extract-equipment-count/route.ts',
    feature: '장비 대수 추출',
    remarks: '',
  },
  {
    featureKey: 'ai.daily-inspection',
    provider: 'OpenAI',
    model: 'gpt-4o-mini',
    location: 'src/app/api/ai/daily-inspection/route.ts',
    feature: '일일점검 체크리스트 생성',
    remarks: '',
  },
  {
    featureKey: 'ai.ocr-card',
    provider: 'OpenAI',
    model: 'gpt-4o-mini',
    location: 'src/app/api/ai/ocr-card/route.ts',
    feature: '교육 이수증 OCR',
    remarks: '',
  },
  {
    featureKey: 'ai.supervisor-summary.remarks',
    provider: 'OpenAI',
    model: 'gpt-4o-mini',
    location: 'src/app/api/ai/supervisor-summary/route.ts',
    feature: '감독일지 의견·요약',
    remarks: '',
  },
  {
    featureKey: 'ai.inspection-checklist',
    provider: 'Google',
    model: 'gemini-3.1-flash-lite',
    location: 'src/app/api/ai/inspection-checklist/route.ts',
    feature: '검측 체크리스트 생성',
    remarks: '',
  },
  {
    featureKey: 'ai.work-plan',
    provider: 'Google',
    model: 'gemini-3.1-flash-lite',
    location: 'src/app/api/ai/work-plan/route.ts',
    feature: 'AI 작업계획서 초안',
    remarks: '',
  },
  {
    featureKey: 'ai.supervisor-summary.classify',
    provider: 'Google',
    model: 'gemini-3.1-flash-lite',
    location: 'src/app/api/ai/supervisor-summary/route.ts',
    feature: '감독일지 장비·인력 분류',
    remarks: '',
  },
  {
    featureKey: 'ai.risk-assessment',
    provider: 'Google',
    model: 'gemini-flash-lite-latest',
    location: 'src/app/api/ai/risk-assessment/route.ts',
    feature: '수시 위험성평가 AI 판정',
    remarks: '폴백 체인 gemini-3.1-flash-lite 자동 적용',
  },
  {
    featureKey: 'ai.risk-classify',
    provider: 'Google',
    model: 'gemini-flash-lite-latest',
    location: 'src/app/api/ai/risk-classify/route.ts',
    feature: '작업내용 분류 매칭',
    remarks: '폴백 체인 gemini-3.1-flash-lite 자동 적용',
  },
  {
    featureKey: 'ai.risk-row',
    provider: 'Google',
    model: 'gemini-flash-lite-latest',
    location: 'src/app/api/ai/risk-row/route.ts',
    feature: '새 위험요인 행 작성',
    remarks: '폴백 체인 gemini-3.1-flash-lite 자동 적용',
  },
  {
    featureKey: 'ai.tbm-risk-link',
    provider: 'Google',
    model: 'gemini-flash-lite-latest',
    location: 'src/app/api/ai/tbm-risk-link/route.ts',
    feature: 'TBM 위험요인 연계',
    remarks: '폴백 체인 gemini-3.1-flash-lite 자동 적용',
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

/** 위험성평가 계열용 — DB(또는 기본값) 모델을 선두에 두고 기존 폴백 체인을 뒤에 붙인다. */
export async function getAiModelChain(featureKey: AiFeatureKey): Promise<string[]> {
  const primary = await getAiModel(featureKey)
  return [...new Set([primary, ...RISK_AI_MODELS])]
}
