// AI 호출 1건의 기능·모델·토큰 사용량을 ai_usage_logs에 남기되 어떤 실패도 호출부로 던지지 않는 서버 전용 로거
import { after } from 'next/server'

import type { AiProvider } from '@/lib/ai-models'

interface OpenAiUsage {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
}

interface GeminiUsage {
  promptTokenCount?: number
  candidatesTokenCount?: number
  totalTokenCount?: number
}

interface TokenCounts {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

function toCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : 0
}

function isOpenAiUsage(value: unknown): value is OpenAiUsage {
  if (typeof value !== 'object' || value === null) return false
  const usage = value as Record<string, unknown>
  return (
    typeof usage.prompt_tokens === 'number' ||
    typeof usage.completion_tokens === 'number' ||
    typeof usage.total_tokens === 'number'
  )
}

function isGeminiUsage(value: unknown): value is GeminiUsage {
  if (typeof value !== 'object' || value === null) return false
  const usage = value as Record<string, unknown>
  return (
    typeof usage.promptTokenCount === 'number' ||
    typeof usage.candidatesTokenCount === 'number' ||
    typeof usage.totalTokenCount === 'number'
  )
}

/** OpenAI·Gemini 응답에서 토큰 수를 뽑는다. 둘 다 아니면 promptChars를 입력 토큰 자리에 넣는다(TTS). */
function extractUsage(response: unknown, promptChars: number | undefined): TokenCounts {
  const container = typeof response === 'object' && response !== null ? (response as Record<string, unknown>) : null

  if (container && isOpenAiUsage(container.usage)) {
    const usage = container.usage
    const promptTokens = toCount(usage.prompt_tokens)
    const completionTokens = toCount(usage.completion_tokens)
    return {
      promptTokens,
      completionTokens,
      totalTokens: toCount(usage.total_tokens) || promptTokens + completionTokens,
    }
  }

  if (container && isGeminiUsage(container.usageMetadata)) {
    const usage = container.usageMetadata
    const promptTokens = toCount(usage.promptTokenCount)
    const completionTokens = toCount(usage.candidatesTokenCount)
    return {
      promptTokens,
      completionTokens,
      totalTokens: toCount(usage.totalTokenCount) || promptTokens + completionTokens,
    }
  }

  const chars = toCount(promptChars)
  return { promptTokens: chars, completionTokens: 0, totalTokens: chars }
}

export interface RecordAiUsageParams {
  featureKey: string
  provider: AiProvider
  model: string
  /** OpenAI·Gemini 응답 JSON 원본 — 여기서 토큰을 뽑는다. */
  response?: unknown
  /** 사용량 필드가 없는 호출(TTS)용 입력 문자 수. */
  promptChars?: number
  success?: boolean
  errorMessage?: string
  durationMs?: number
  userId?: string | null
  projectId?: string | null
}

/**
 * AI 호출 기록을 남긴다. 응답 반환 뒤 after()로 INSERT하며 반환은 void다.
 * 테이블 미존재·환경 변수 누락·네트워크 실패를 전부 삼키고 절대 예외를 던지지 않는다 — 이 모듈의 핵심 계약이다.
 */
export function recordAiUsage(params: RecordAiUsageParams): void {
  try {
    const usage = extractUsage(params.response, params.promptChars)

    after(async () => {
      try {
        // 서비스 롤 환경 변수가 없는 환경에서도 이 모듈을 import한 라우트가 죽지 않도록 지연 import한다.
        const { supabaseAdmin } = await import('@/lib/supabase-admin')
        const { error } = await supabaseAdmin.from('ai_usage_logs').insert({
          feature_key: params.featureKey,
          provider: params.provider,
          model: params.model,
          prompt_tokens: usage.promptTokens,
          completion_tokens: usage.completionTokens,
          total_tokens: usage.totalTokens,
          success: params.success ?? true,
          error_message: params.errorMessage ?? null,
          duration_ms: typeof params.durationMs === 'number' ? Math.round(params.durationMs) : null,
          user_id: params.userId ?? null,
          project_id: params.projectId ?? null,
        })
        if (error) throw error
      } catch (error) {
        console.error('AI 호출 기록 저장 실패 — 기능 동작에는 영향이 없습니다.', error)
      }
    })
  } catch (error) {
    console.error('AI 호출 기록 예약 실패 — 기능 동작에는 영향이 없습니다.', error)
  }
}
