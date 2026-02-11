import { NextRequest, NextResponse } from 'next/server'

const OPENAI_API_KEY = process.env.OPENAI_API_KEY

export async function POST(request: NextRequest) {
  try {
    if (!OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API 키가 설정되지 않았습니다.' },
        { status: 500 }
      )
    }

    const { workDescription } = await request.json()

    if (!workDescription) {
      return NextResponse.json(
        { error: '작업 내용을 입력해주세요.' },
        { status: 400 }
      )
    }

    const prompt = `건설현장 일일 안전점검 체크리스트를 작성해주세요.

작업 내용: "${workDescription}"

다음 기준으로 점검항목을 작성하세요:
1. 일반적인 안전관리 기본사항 (안전모, 안전화, 안전대 등)
2. 작업환경 및 정리정돈 관련 사항
3. 안전시설물 및 안전표지 관련 사항
4. "${workDescription}" 작업에 특화된 안전점검 항목
5. 해당 공종의 법적 안전기준 및 조치사항
6. 장비, 공법, 작업환경 등에 따른 구체적 점검사항

모든 항목은 "점검표 형식(여부 체크 가능)"으로 작성하고, 각 항목은 명확하고 구체적으로 표현해주세요.

응답 형식 (총 23개):
기본안전|안전모 착용 여부
기본안전|안전화 착용 여부
기본안전|안전대 착용 및 체결 여부
...
공종안전|[구체적 점검항목]
공종안전|[구체적 점검항목]
...

카테고리는 "기본안전" 8개, "공종안전" 15개로 구분해주세요.`

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: '건설현장 안전관리 전문가로서 일일 안전점검 체크리스트를 작성해주세요.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7
      })
    })

    const data = await response.json()

    if (data.choices && data.choices[0]) {
      return NextResponse.json({ content: data.choices[0].message.content })
    }

    return NextResponse.json(
      { error: 'AI 응답을 받지 못했습니다.' },
      { status: 500 }
    )
  } catch (error) {
    console.error('Daily inspection AI error:', error)
    return NextResponse.json(
      { error: 'AI 점검항목 생성 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
