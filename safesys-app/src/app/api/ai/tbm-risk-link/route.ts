// 수시위험성평가 행들과 TBM 금일 작업내용을 견줘 잠재위험요인·해결방안 최대 3건을 골라주는 라우트
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getAiModelChain } from '@/lib/ai-models'
import { recordAiUsage } from '@/lib/ai-usage-log'
import type { TbmRiskLinkItem, TbmRiskLinkRequest, TbmRiskLinkResponse } from '@/lib/risk-assessment/types'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY

// 프롬프트에 넣는 평가서 행 상한 (표가 길어져도 토큰이 튀지 않게 한다)
const MAX_ROWS = 60
const MAX_ITEMS = 3
const MAX_MEASURE_CHARS = 200
// 프롬프트에 넣는 "최근 사용한 잠재위험요인" 상한
const MAX_RECENT_RISKS = 30

type LinkRow = TbmRiskLinkRequest['rows'][number]

function describeRow(row: LinkRow, index: number): string {
  const measures = (row.measures || []).join(' / ').slice(0, MAX_MEASURE_CHARS)
  const parts = [
    `[${index}] ${row.hazard}`,
    `재해유형: ${row.disasterType || '미분류'}`,
    `위험성: ${row.frequency}×${row.intensity}=${row.frequency * row.intensity}`,
  ]
  if (measures) parts.push(`감소대책: ${measures}`)
  return parts.join(' | ')
}

export async function POST(request: NextRequest) {
  const authorization = request.headers.get('authorization')
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!token) {
    return NextResponse.json<TbmRiskLinkResponse>({ success: false, error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) {
    return NextResponse.json<TbmRiskLinkResponse>({ success: false, error: '인증에 실패했습니다.' }, { status: 401 })
  }

  try {
    const body = (await request.json()) as Partial<TbmRiskLinkRequest>
    const todayWork = String(body.todayWork || '').trim()
    const rows = (Array.isArray(body.rows) ? body.rows : [])
      .filter((row) => row && String(row.hazard || '').trim())
      .slice(0, MAX_ROWS)
    const recentRisks = (Array.isArray(body.recentRisks) ? body.recentRisks : [])
      .map((risk) => String(risk || '').trim())
      .filter(Boolean)
      .slice(0, MAX_RECENT_RISKS)
    // 같은 화면에서 이미 뽑은 위험요인 원문 — 다시 누르면 다른 항목이 나오게 후보에서 뺀다
    const excludeHazards = (Array.isArray(body.excludeHazards) ? body.excludeHazards : [])
      .map((hazard) => String(hazard || '').trim())
      .filter(Boolean)

    if (!GEMINI_API_KEY) {
      return NextResponse.json<TbmRiskLinkResponse>(
        { success: false, error: 'AI API 키가 설정되지 않았습니다. (.env.local의 GEMINI_API_KEY)' },
        { status: 500 }
      )
    }

    if (!todayWork) {
      return NextResponse.json<TbmRiskLinkResponse>(
        { success: false, error: '금일 작업내용을 먼저 입력해주세요.' },
        { status: 400 }
      )
    }

    if (rows.length === 0) {
      return NextResponse.json<TbmRiskLinkResponse>(
        { success: false, error: '선택한 위험성평가에 위험요인이 없습니다.' },
        { status: 400 }
      )
    }

    const systemMessage =
      '당신은 한국 건설현장(농어촌공사 계열)의 안전관리자입니다. 실시된 위험성평가 결과에서 오늘 작업과 직접 관련된 항목을 골라 TBM 일지의 잠재위험요인과 해결방안 칸을 채웁니다. 주어진 번호로만 답하고 반드시 유효한 JSON으로만 응답하세요.'

    const buildPrompt = (promptRows: LinkRow[]) => `아래 "금일 작업내용"과 직접 관련된 항목을 "위험성평가 행 목록"에서 골라 TBM 칸에 맞게 정리하세요.

# 금일 작업내용
${todayWork}

# 위험성평가 행 목록 ([번호] 위험요인 | 재해유형 | 위험성 | 감소대책)
${promptRows.map(describeRow).join('\n')}
${recentRisks.length ? `
# 최근 TBM에서 이미 다룬 잠재위험요인 (되도록 피할 것)
${recentRisks.map((risk) => `- ${risk}`).join('\n')}
` : ''}
# 규칙
- 금일 작업과 직접 관련된 행만 최대 ${MAX_ITEMS}개, 관련도 높은 순으로 고른다. 관련 항목이 적으면 적게 고른다.
- 위험성(빈도×강도)이 높은 항목을 우선한다.${recentRisks.length ? `
- "최근 TBM에서 이미 다룬 잠재위험요인"과 같거나 사실상 같은 내용인 행은 후순위로 미룬다. 매일 같은 항목만 반복되면 교육 효과가 없다.
- 다만 금일 작업과 관련된 행이 부족하면 최근에 다룬 항목이라도 고른다. 관련 없는 행으로 억지로 채우지 않는다.` : ''}
- 목록에 있는 번호만 쓴다. 목록에 없는 번호나 새 위험요인을 지어내지 않는다.
- risk: 고른 행의 위험요인 원문을 근거로, 근로자가 TBM에서 바로 알아듣도록 한 문장으로 다듬는다. 없는 내용을 보태지 않는다.
- solution: 그 행의 감소대책을 현장에서 바로 실행할 수 있게 1~2문장으로 요약한다.
- factor: 그 위험요인과 연관된 "단순 위험 요소"(위험을 유발하는 상태·대상 자체)를 30자 이내로 쓴다. 제거/설치/착용 같은 대책·조치 표현은 절대 쓰지 않는다. (예: 위험요인이 "작업자 미끄러짐"이면 factor는 "바닥 물기". "바닥 물기 제거"처럼 조치로 쓰면 안 됨)
- 반드시 다음 JSON 형식으로만 응답한다: {"items":[{"index":0,"risk":"","solution":"","factor":""}]}`

    let lastError = ''

    // 주어진 후보 행으로 한 번 고른다. 모델 폴백은 이 안에서 처리한다.
    const selectFrom = async (promptRows: LinkRow[]): Promise<{ data: TbmRiskLinkItem[]; usedHazards: string[] } | null> => {
      const prompt = buildPrompt(promptRows)

      for (const model of await getAiModelChain('ai.tbm-risk-link')) {
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
          recordAiUsage({ featureKey: 'ai.tbm-risk-link', provider: 'Google', model, success: false, errorMessage: `HTTP ${geminiResponse.status}`, durationMs: Date.now() - startedAt, userId: user.id })
          continue // 다음 모델로 폴백
        }

        const geminiResult = await geminiResponse.json()
        recordAiUsage({ featureKey: 'ai.tbm-risk-link', provider: 'Google', model, response: geminiResult, durationMs: Date.now() - startedAt, userId: user.id })
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
          const rawItems: unknown[] = Array.isArray(parsed.items) ? parsed.items : []
          const seen = new Set<number>()
          const data: TbmRiskLinkItem[] = []
          const usedHazards: string[] = []

          for (const raw of rawItems) {
            if (!raw || typeof raw !== 'object') continue
            const item = raw as Record<string, unknown>
            const index = Number(item.index)
            // 목록 밖 번호는 환각이므로 버린다
            if (!Number.isInteger(index) || index < 0 || index >= promptRows.length || seen.has(index)) continue
            seen.add(index)

            const source = promptRows[index]
            const risk = String(item.risk || '').trim() || source.hazard
            const solution = String(item.solution || '').trim() || (source.measures || []).join(' / ')
            const factor = String(item.factor || '').trim()
            data.push({ risk, solution, factor })
            usedHazards.push(source.hazard)
            if (data.length >= MAX_ITEMS) break
          }

          return { data, usedHazards }
        } catch {
          lastError = 'JSON 파싱 실패'
          console.error(`Gemini 응답 파싱 실패 (${model}):`, content.slice(0, 300))
          continue
        }
      }

      return null // 모든 모델 실패
    }

    // 이미 뽑았던 행은 후보에서 뺀다. 남은 후보가 없으면 처음부터 다시 돈다.
    const excludeSet = new Set(excludeHazards)
    const remaining = rows.filter((row) => !excludeSet.has(row.hazard))
    const isRetryable = remaining.length > 0 && remaining.length < rows.length

    let picked = await selectFrom(remaining.length > 0 ? remaining : rows)
    // 남은 후보 중엔 금일 작업과 맞는 게 없을 수도 있다. 이때도 한 바퀴 리셋해 다시 고른다.
    if (isRetryable && picked && picked.data.length === 0) {
      picked = await selectFrom(rows)
    }

    if (!picked) {
      return NextResponse.json<TbmRiskLinkResponse>(
        { success: false, error: `위험성평가 연계에 실패했습니다. (${lastError})` },
        { status: 502 }
      )
    }

    if (picked.data.length === 0) {
      return NextResponse.json<TbmRiskLinkResponse>(
        { success: false, error: '금일 작업과 연결할 위험요인을 찾지 못했습니다. 금일 작업내용을 더 구체적으로 적어주세요.' },
        { status: 422 }
      )
    }

    return NextResponse.json<TbmRiskLinkResponse>({
      success: true,
      data: picked.data,
      usedHazards: picked.usedHazards,
    })
  } catch (error) {
    console.error('TBM 위험성평가 연계 API 오류:', error)
    return NextResponse.json<TbmRiskLinkResponse>(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
