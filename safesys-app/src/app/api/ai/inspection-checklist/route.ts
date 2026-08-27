// 검측 체크리스트 항목 AI 자동 생성 — 위키 검사기준 지식 + 현장 입력으로 검측항목·검사기준 생성 (Gemini)
import { NextRequest, NextResponse } from 'next/server'
import { getAiModel } from '@/lib/ai-models'
import { recordAiUsage } from '@/lib/ai-usage-log'
import { INSPECTION_CRITERIA_KNOWLEDGE } from '@/lib/inspection/inspection-criteria-knowledge'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY

const MAX_ITEMS = 14

interface ChecklistItemDraft {
  item: string
  standard: string
}

export async function POST(request: NextRequest) {
  try {
    const { workType, facilityName, location, quantity, inspectionItems } = await request.json()

    if (!GEMINI_API_KEY) {
      return NextResponse.json(
        { error: 'AI API 키가 설정되지 않았습니다. (.env.local의 GEMINI_API_KEY)' },
        { status: 500 }
      )
    }

    if (!String(workType || '').trim() && !String(facilityName || '').trim()) {
      return NextResponse.json(
        { error: '공종명 또는 시설물명을 입력해주세요.' },
        { status: 400 }
      )
    }

    const systemMessage =
      '당신은 한국 건설현장(농어촌공사 계열)의 검측 전문가입니다. 주어진 검사기준 지식과 현장 입력 정보를 바탕으로 검측 체크리스트의 점검 항목을 작성합니다. 반드시 유효한 JSON으로만 응답하세요.'

    const prompt = `아래 "검사기준 지식"과 "현장 입력 정보"를 바탕으로 검측 체크리스트의 점검 항목을 작성하세요.

# 검사기준 지식
${INSPECTION_CRITERIA_KNOWLEDGE}

# 현장 입력 정보
- 공종명: ${workType || '(미입력)'}
- 시설물명: ${facilityName || '(미입력)'}
- 위치 또는 부위: ${location || '(미입력)'}
- 물량: ${quantity || '(미입력)'}
${inspectionItems ? `- 검측 사항(요청서): ${inspectionItems}` : ''}

# 작성 규칙
- 입력된 공종/시설물에 해당하는 검측 항목을 위 지식의 "검사 대상"에서 선별·구체화한다.
- 입력 공종에 딱 맞는 시설물 분류가 없으면 [공통] 항목과 일반 토목·콘크리트 검측 상식을 활용한다.
- 각 항목은 {"item": "검측 항목(무엇을 검측하는지)", "standard": "검사기준(설계도면·표준시방서 기준; 구체 수치를 모르면 '설계도면·표준시방서 대조'처럼 기준 출처를 명시)"}.
- 항목 수는 해당 공종에 맞게 4~${MAX_ITEMS}개, 중요도 순으로 작성한다.
- 검사결과(합격/불합격)와 조치사항은 작성하지 않는다(현장에서 기록).
- 지식에 없는 허용오차·규격 수치를 임의로 지어내지 않는다.
- 반드시 다음 JSON 형식으로만 응답한다: {"items":[{"item":"","standard":""}]}`

    let lastError = ''
    const geminiModels = [await getAiModel('ai.inspection-checklist')]
    for (const model of geminiModels) {
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
              temperature: 0.3,
              responseMimeType: 'application/json',
            },
          }),
        }
      )

      if (!geminiResponse.ok) {
        const errorData = await geminiResponse.json().catch(() => ({}))
        lastError = `${geminiResponse.status} ${JSON.stringify(errorData).slice(0, 200)}`
        console.error(`Gemini API Error (${model}):`, lastError)
        recordAiUsage({ featureKey: 'ai.inspection-checklist', provider: 'Google', model, success: false, errorMessage: `HTTP ${geminiResponse.status}`, durationMs: Date.now() - startedAt })
        continue // 다음 모델로 폴백
      }

      const geminiResult = await geminiResponse.json()
      recordAiUsage({ featureKey: 'ai.inspection-checklist', provider: 'Google', model, response: geminiResult, durationMs: Date.now() - startedAt })
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
        const rawItems: ChecklistItemDraft[] = Array.isArray(parsed.items) ? parsed.items : []
        const items = rawItems
          .filter((it) => it && typeof it.item === 'string' && it.item.trim())
          .slice(0, MAX_ITEMS)
          .map((it) => ({ item: String(it.item).trim(), standard: String(it.standard || '').trim() }))

        if (items.length === 0) {
          return NextResponse.json({ error: '생성된 검측 항목이 없습니다.' }, { status: 502 })
        }
        return NextResponse.json({ success: true, items, model })
      } catch {
        lastError = 'JSON 파싱 실패'
        console.error(`Gemini 응답 파싱 실패 (${model}):`, content.slice(0, 300))
        continue
      }
    }

    return NextResponse.json(
      { error: `AI 검측 항목 생성에 실패했습니다. (${lastError})` },
      { status: 502 }
    )
  } catch (error) {
    console.error('검측 체크리스트 AI API 오류:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
