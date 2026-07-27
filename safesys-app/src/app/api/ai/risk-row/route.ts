// 위험성평가 표에 넣을 새 행 1건을 AI가 직접 작성하는 라우트 (DB 원문에 없는 위험요인 보충용)
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { RISK_AI_MODELS } from '@/lib/risk-assessment/types'
import type { RiskAiRowDraft, RiskAiRowRequest, RiskAiRowResponse } from '@/lib/risk-assessment/types'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY

// 프롬프트에 넣는 기존 위험요인 목록 상한 (표가 길어져도 토큰이 튀지 않게 한다)
const MAX_EXISTING = 60
const MAX_MEASURES = 4

const DISASTER_TYPES = ['떨어짐', '넘어짐', '깔림', '부딪힘', '맞음', '무너짐', '끼임', '감전', '폭발/파열', '화재', '불균형 및 무리한 동작', '이상온도 접촉', '화학물질 누출·접촉', '산소결핍·질식', '빠짐/익사', '사업장 외 교통사고']

/** 1~3 정수로 강제한다. 범위를 벗어나거나 숫자가 아니면 기본값으로 되돌린다. */
function clampLevel(value: unknown, fallback: number): number {
  const level = Math.round(Number(value))
  if (!Number.isFinite(level)) return fallback
  return Math.min(3, Math.max(1, level))
}

export async function POST(request: NextRequest) {
  const authorization = request.headers.get('authorization')
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!token) {
    return NextResponse.json<RiskAiRowResponse>({ success: false, error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) {
    return NextResponse.json<RiskAiRowResponse>({ success: false, error: '인증에 실패했습니다.' }, { status: 401 })
  }

  try {
    const body = (await request.json()) as Partial<RiskAiRowRequest>
    const trigger = String(body.trigger || '').trim()
    const siteContext = String(body.siteContext || '').trim()
    const detailWork = String(body.detailWork || '').trim()
    const existingHazards = (Array.isArray(body.existingHazards) ? body.existingHazards : [])
      .map((hazard) => String(hazard || '').trim())
      .filter(Boolean)
      .slice(0, MAX_EXISTING)

    if (!GEMINI_API_KEY) {
      return NextResponse.json<RiskAiRowResponse>(
        { success: false, error: 'AI API 키가 설정되지 않았습니다. (.env.local의 GEMINI_API_KEY)' },
        { status: 500 }
      )
    }

    if (!trigger && !detailWork) {
      return NextResponse.json<RiskAiRowResponse>(
        { success: false, error: '작업내용이나 세부작업이 있어야 행을 작성할 수 있습니다.' },
        { status: 400 }
      )
    }

    const systemMessage =
      '당신은 한국 건설현장(농어촌공사 계열)의 위험성평가 전문가입니다. 작업 상황에 맞는 유해·위험요인과 감소대책을 위험성평가표 형식으로 작성합니다. 반드시 유효한 JSON으로만 응답하세요.'

    const prompt = `아래 "작업 상황"에서 아직 표에 없는 유해·위험요인 1건을 새로 작성하세요.

# 작업 상황
- 세부작업: ${detailWork || '(미입력)'}
- 작업내용·수시평가 사유: ${trigger || '(미입력)'}
- 현장 부가 정보: ${siteContext || '(미입력)'}

# 이미 표에 있는 위험요인 (중복 금지)
${existingHazards.length > 0 ? existingHazards.map((hazard) => `- ${hazard}`).join('\n') : '- (없음)'}

# 작성 규칙
- 위 목록과 내용이 겹치지 않는 위험요인 1건만 쓴다. 표현만 바꾼 중복은 금지한다.
- hazard: 언제·무엇 때문에·어떤 재해로 이어지는지 드러나는 상황 서술형으로 쓴다 (예: "굴착면 상단 적재물 정리 중 하부 근로자 위로 자재 낙하").
- disasterType: 다음 표준 재해유형 중 정확히 1개만 고른다 — ${DISASTER_TYPES.join(', ')}.
- frequency(빈도) 1~3 정수: 1=드물게 노출, 2=가끔 노출, 3=상시 노출.
- intensity(강도) 1~3 정수: 1=경상, 2=휴업 재해, 3=사망·중상해.
- equipment: 이 작업에 쓰이는 사용장비/설비/인원을 짧게 쓴다. 모르면 빈 문자열.
- measures: 현장에서 바로 실행할 수 있는 구체적 감소대책 1~${MAX_MEASURES}개. 법령 조문 번호는 확실하지 않으면 쓰지 않는다.
- 반드시 다음 JSON 형식으로만 응답한다: {"hazard":"","disasterType":"","frequency":2,"intensity":2,"equipment":"","measures":[""]}`

    let lastError = ''
    for (const model of RISK_AI_MODELS) {
      const geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': GEMINI_API_KEY,
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemMessage }] },
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              // 매번 같은 위험요인만 나오지 않도록 판정 라우트보다 조금 높게 둔다
              temperature: 0.6,
              responseMimeType: 'application/json',
            },
          }),
        }
      )

      if (!geminiResponse.ok) {
        const errorData = await geminiResponse.json().catch(() => ({}))
        lastError = `${geminiResponse.status} ${JSON.stringify(errorData).slice(0, 200)}`
        console.error(`Gemini API Error (${model}):`, lastError)
        continue // 다음 모델로 폴백
      }

      const geminiResult = await geminiResponse.json()
      const content = geminiResult.candidates?.[0]?.content?.parts
        ?.map((part: { text?: string }) => part.text || '')
        .join('')

      if (!content) {
        lastError = 'AI 응답 본문 없음'
        console.error(`Gemini 응답 없음 (${model}):`, JSON.stringify(geminiResult).slice(0, 300))
        continue
      }

      try {
        const parsed = JSON.parse(content) as Record<string, unknown>
        const hazard = String(parsed.hazard || '').trim()
        if (!hazard) {
          lastError = '위험요인 문구 없음'
          console.error(`Gemini 위험요인 누락 (${model}):`, content.slice(0, 300))
          continue
        }

        const measures = (Array.isArray(parsed.measures) ? parsed.measures : [])
          .map((measure) => String(measure || '').trim())
          .filter(Boolean)
          .slice(0, MAX_MEASURES)

        const data: RiskAiRowDraft = {
          hazard,
          disasterType: String(parsed.disasterType || '').trim(),
          frequency: clampLevel(parsed.frequency, 2),
          intensity: clampLevel(parsed.intensity, 2),
          equipment: String(parsed.equipment || '').trim(),
          measures,
        }
        return NextResponse.json<RiskAiRowResponse>({ success: true, data })
      } catch {
        lastError = 'JSON 파싱 실패'
        console.error(`Gemini 응답 파싱 실패 (${model}):`, content.slice(0, 300))
        continue
      }
    }

    return NextResponse.json<RiskAiRowResponse>(
      { success: false, error: `AI 행 작성에 실패했습니다. (${lastError})` },
      { status: 502 }
    )
  } catch (error) {
    console.error('위험성평가 AI 행 작성 API 오류:', error)
    return NextResponse.json<RiskAiRowResponse>(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
