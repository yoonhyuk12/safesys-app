// 수시 위험성평가 AI 판정 — DB 원문 위험요인 중 선별·빈도·강도·장비만 Gemini에 위임 (텍스트 재작성 금지)
import { NextRequest, NextResponse } from 'next/server'
import { getAiModelChain } from '@/lib/ai-models'
import { recordAiUsage } from '@/lib/ai-usage-log'
import type { RiskAiJudgement, RiskAiRequest, RiskAiResponse, RiskHazard } from '@/lib/risk-assessment/types'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY

// 세부단위작업 1건의 위험요인은 중앙값 7·최대 19건이라 여러 작업을 골라도 이 상한 안에 들어온다.
const MAX_HAZARDS = 60
const MAX_MEASURE_CHARS = 200

/** 플래그를 강도 상향 근거로 쓸 수 있도록 한글 라벨로 편다. */
function flagLabels(hazard: RiskHazard): string[] {
  const labels: string[] = []
  if (hazard.flagSif) labels.push('SIF(중상해 유발)')
  if (hazard.flagSerious) labels.push('공사중대재해')
  if (hazard.flagAccidentCase) labels.push('공사재해사례')
  if (hazard.flagNearMiss) labels.push('아차사고')
  return labels
}

function describeHazard(hazard: RiskHazard): string {
  const flags = flagLabels(hazard)
  const measures = hazard.measures.join(' / ').slice(0, MAX_MEASURE_CHARS)
  const parts = [
    `[${hazard.id}] ${hazard.hazard}`,
    `재해유형: ${hazard.disasterType || '미분류'}`,
    flags.length > 0 ? `플래그: ${flags.join(', ')}` : '플래그: 없음',
  ]
  if (hazard.workPermit) parts.push(`안전작업허가: ${hazard.workPermit}`)
  if (measures) parts.push(`감소대책: ${measures}`)
  return parts.join(' | ')
}

/** 1~3 정수로 강제한다. 범위를 벗어나거나 숫자가 아니면 기본값으로 되돌린다. */
function clampLevel(value: unknown, fallback: number): number {
  const level = Math.round(Number(value))
  if (!Number.isFinite(level)) return fallback
  return Math.min(3, Math.max(1, level))
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<RiskAiRequest>
    const trigger = String(body.trigger || '').trim()
    const siteContext = String(body.siteContext || '').trim()
    const hazards = Array.isArray(body.hazards) ? body.hazards.slice(0, MAX_HAZARDS) : []

    if (!GEMINI_API_KEY) {
      return NextResponse.json<RiskAiResponse>(
        { success: false, error: 'AI API 키가 설정되지 않았습니다. (.env.local의 GEMINI_API_KEY)' },
        { status: 500 }
      )
    }

    if (!trigger) {
      return NextResponse.json<RiskAiResponse>(
        { success: false, error: '수시평가 사유를 입력해주세요.' },
        { status: 400 }
      )
    }

    if (hazards.length === 0) {
      return NextResponse.json<RiskAiResponse>(
        { success: false, error: '판정할 위험요인이 없습니다. 세부단위작업을 먼저 선택해주세요.' },
        { status: 400 }
      )
    }

    const knownIds = new Set(hazards.map((hazard) => hazard.id))

    const systemMessage =
      '당신은 한국 건설현장(농어촌공사 계열)의 위험성평가 전문가입니다. 제시된 유해·위험요인 DB 원문 중 이번 수시평가에 해당하는 항목을 선별하고 빈도·강도를 산정합니다. 위험요인과 감소대책 문구는 절대 새로 쓰지 말고 주어진 번호로만 참조하세요. 반드시 유효한 JSON으로만 응답하세요.'

    const prompt = `아래 "수시평가 상황"에 비추어 "위험요인 목록"의 각 항목을 판정하세요.

# 수시평가 상황
- 수시평가 사유: ${trigger}
- 현장 부가 정보: ${siteContext || '(미입력)'}

# 위험요인 목록 (DB 원문, [번호]가 hazardId)
${hazards.map(describeHazard).join('\n')}

# 판정 규칙
- 위험요인·감소대책 문구를 다시 쓰지 않는다. 출력에는 hazardId와 판정값만 담는다.
- selected: 위 수시평가 사유·현장 정보와 직접 관련된 항목만 true, 이번 작업 상황과 무관하면 false.
- frequency(빈도) 1~3 정수: 1=드물게 노출, 2=가끔 노출, 3=상시 노출. 사유에 적힌 작업 빈도와 노출 인원을 근거로 산정한다.
- intensity(강도) 1~3 정수: 1=경상, 2=휴업 재해, 3=사망·중상해. SIF·공사중대재해 플래그가 있으면 강도를 상향(원칙적으로 3)하고 그 근거를 reason에 명시한다. 공사재해사례·아차사고 플래그도 상향 근거로 쓴다.
- equipment: 해당 위험요인 작업에 쓰이는 사용장비/설비/인원을 짧게 제안한다 (예: "굴착기 0.8㎥, 신호수 1명"). 모르면 빈 문자열.
- reason: 선별·빈도·강도 판정 근거를 한 줄로 쓴다.
- 목록에 없는 hazardId를 지어내지 않는다. 목록의 모든 항목을 빠짐없이 판정한다.
- 반드시 다음 JSON 형식으로만 응답한다: {"judgements":[{"hazardId":0,"selected":true,"frequency":2,"intensity":3,"equipment":"","reason":""}]}`

    let lastError = ''
    for (const model of await getAiModelChain('ai.risk-assessment')) {
      const startedAt = Date.now()
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
              temperature: 0.2,
              responseMimeType: 'application/json',
            },
          }),
        }
      )

      if (!geminiResponse.ok) {
        const errorData = await geminiResponse.json().catch(() => ({}))
        lastError = `${geminiResponse.status} ${JSON.stringify(errorData).slice(0, 200)}`
        console.error(`Gemini API Error (${model}):`, lastError)
        recordAiUsage({ featureKey: 'ai.risk-assessment', provider: 'Google', model, success: false, errorMessage: `HTTP ${geminiResponse.status}`, durationMs: Date.now() - startedAt })
        continue // 다음 모델로 폴백
      }

      const geminiResult = await geminiResponse.json()
      recordAiUsage({ featureKey: 'ai.risk-assessment', provider: 'Google', model, response: geminiResult, durationMs: Date.now() - startedAt })
      const content = geminiResult.candidates?.[0]?.content?.parts
        ?.map((part: { text?: string }) => part.text || '')
        .join('')

      if (!content) {
        lastError = 'AI 응답 본문 없음'
        console.error(`Gemini 응답 없음 (${model}):`, JSON.stringify(geminiResult).slice(0, 300))
        continue
      }

      try {
        const parsed = JSON.parse(content)
        const rawJudgements: unknown[] = Array.isArray(parsed.judgements) ? parsed.judgements : []
        const seen = new Set<number>()
        const data: RiskAiJudgement[] = []

        for (const raw of rawJudgements) {
          if (!raw || typeof raw !== 'object') continue
          const item = raw as Record<string, unknown>
          const hazardId = Number(item.hazardId)
          // 목록에 없는 번호는 환각이므로 버린다.
          if (!knownIds.has(hazardId) || seen.has(hazardId)) continue
          seen.add(hazardId)
          data.push({
            hazardId,
            selected: item.selected !== false,
            frequency: clampLevel(item.frequency, 2),
            intensity: clampLevel(item.intensity, 2),
            equipment: String(item.equipment || '').trim(),
            reason: String(item.reason || '').trim(),
          })
        }

        if (data.length === 0) {
          return NextResponse.json<RiskAiResponse>(
            { success: false, error: 'AI가 판정한 위험요인이 없습니다.' },
            { status: 502 }
          )
        }

        return NextResponse.json<RiskAiResponse>({ success: true, data })
      } catch {
        lastError = 'JSON 파싱 실패'
        console.error(`Gemini 응답 파싱 실패 (${model}):`, content.slice(0, 300))
        continue
      }
    }

    return NextResponse.json<RiskAiResponse>(
      { success: false, error: `AI 위험성 판정에 실패했습니다. (${lastError})` },
      { status: 502 }
    )
  } catch (error) {
    console.error('수시 위험성평가 AI API 오류:', error)
    return NextResponse.json<RiskAiResponse>(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
