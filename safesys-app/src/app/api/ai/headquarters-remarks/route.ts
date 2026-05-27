import { NextRequest, NextResponse } from 'next/server'

const OPENAI_API_KEY = process.env.OPENAI_API_KEY

interface ItemInput {
  title: string
  description?: string
}

interface RequestBody {
  items: ItemInput[]
}

export async function POST(request: NextRequest) {
  try {
    if (!OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API 키가 설정되지 않았습니다.' },
        { status: 500 }
      )
    }

    const body = (await request.json()) as RequestBody

    if (!body?.items || !Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json(
        { error: 'items 배열이 필요합니다.' },
        { status: 400 }
      )
    }

    const total = body.items.length
    const numbered = body.items
      .map((it, idx) => {
        const desc = it.description ? ` — ${it.description}` : ''
        return `${String(idx + 1).padStart(2, '0')}. ${it.title}${desc}`
      })
      .join('\n')

    const prompt = `다음은 건설현장 본부 불시점검의 점검 항목 ${total}개 목록입니다.
각 항목의 "점검 결과"를 15자 이내의 한국어 긍정 표현으로 작성합니다.
표현은 항목마다 자연스럽게 다양화하되, 모두 "양호하게 관리 중임", "기준에 맞게 이행 중", "현장 적정 관리 양호", "특이사항 없이 양호", "지속 점검 이행 중" 과 같이 짧고 긍정적인 의미여야 합니다.

[항목 목록 - 총 ${total}개]
${numbered}

[출력 형식]
반드시 JSON 객체 한 개만 출력합니다. 키는 항목 번호 문자열("01"~"${String(total).padStart(2, '0')}")이고 값은 결과 문구입니다.
{
  "results": {
    "01": "결과 문구",
    "02": "결과 문구",
    ...
    "${String(total).padStart(2, '0')}": "결과 문구"
  }
}

[규칙]
- results 객체에는 반드시 "01"부터 "${String(total).padStart(2, '0')}"까지 ${total}개의 키가 모두 포함되어야 합니다.
- 각 값은 한국어, 공백 포함 10~15자 (최대 15자 절대 초과 금지).
- 너무 짧지 않게 의미가 충분히 전달되는 문장으로 작성합니다.
- 항목 제목을 그대로 옮기지 말고 결과 표현만 작성합니다.
- HTML/마크다운/설명/주석 금지. JSON만 출력합니다.`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 50000)

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              '건설현장 안전관리 전문가로서, 본부 불시점검 항목별 결과 문구를 짧고 긍정적인 한국어로 작성합니다. 반드시 지정한 JSON 형식만 출력하며 모든 항목 번호 키를 빠짐없이 채웁니다.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.6,
        max_tokens: 2000,
        response_format: { type: 'json_object' }
      }),
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('OpenAI API Error:', response.status, errorData)
      return NextResponse.json(
        { error: 'AI 결과 생성 중 오류가 발생했습니다.' },
        { status: 500 }
      )
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content

    if (!content) {
      return NextResponse.json(
        { error: 'AI 응답을 받지 못했습니다.' },
        { status: 500 }
      )
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(content)
    } catch {
      console.error('AI 응답 파싱 실패:', content)
      return NextResponse.json(
        { error: 'AI 응답 형식 오류' },
        { status: 500 }
      )
    }

    // 다양한 응답 형태를 모두 받아들임: results 객체(키=번호), 단순 배열, 또는 remarks 배열
    const root = (parsed ?? {}) as Record<string, unknown>
    const remarksRaw: unknown[] = []

    const resultsObj = root.results
    if (resultsObj && typeof resultsObj === 'object' && !Array.isArray(resultsObj)) {
      for (let i = 0; i < total; i++) {
        const key1 = String(i + 1).padStart(2, '0')
        const key2 = String(i + 1)
        const v = (resultsObj as Record<string, unknown>)[key1]
          ?? (resultsObj as Record<string, unknown>)[key2]
        remarksRaw.push(v)
      }
    } else if (Array.isArray(root.remarks)) {
      remarksRaw.push(...(root.remarks as unknown[]))
    } else if (Array.isArray(root.results)) {
      remarksRaw.push(...(root.results as unknown[]))
    } else {
      // 첫 번째로 발견되는 배열을 사용
      for (const v of Object.values(root)) {
        if (Array.isArray(v)) {
          remarksRaw.push(...(v as unknown[]))
          break
        }
      }
    }

    // 길이 맞춤: 짧으면 "특이사항 없음" 으로 패딩, 길면 잘라냄
    const cleaned: string[] = []
    for (let i = 0; i < total; i++) {
      const v = remarksRaw[i]
      const s = typeof v === 'string' ? v.trim() : ''
      cleaned.push(s.length > 0 ? s : '특이사항 없음')
    }

    return NextResponse.json({ success: true, remarks: cleaned })
  } catch (error) {
    console.error('AI 점검 결과 API 오류:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
