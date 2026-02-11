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

    const { type, data } = await request.json()

    let prompt = ''
    let systemMessage = ''

    if (type === 'personnel-equipment') {
      // 3. 기록사항 - 투입인원 및 투입장비 요약
      systemMessage = '건설현장 공사감독 전문가로서 간결하고 명확하게 답변해주세요.'
      prompt = `
다음 건설 현장의 투입인원과 투입장비 정보를 공사감독일지의 "기록사항" 항목에 들어갈 내용으로 간결하게 요약해주세요.

${data.personnel ? `투입인원: ${data.personnel}명` : ''}
${data.equipment ? `투입장비: ${data.equipment}` : ''}

요약 형식:
- 간결하고 명확하게 3-5줄 이내로 작성
- "○"로 시작하는 불릿 포인트 형식 사용
- 투입인원과 투입장비를 종합적으로 요약

예시:
○ 금일 현장 투입인원 총 15명 투입
○ 굴삭기 2대, 덤프트럭 3대 등 장비 운영
○ 안전관리 인력 2명 배치하여 작업 진행
`
    } else if (type === 'supervisor-instructions') {
      // 2. 공사 기록 - 감독 지시사항
      systemMessage = '건설 공사감독관으로서 간결하게 공사 기록을 작성해주세요. 반드시 6줄 이내로 작성하세요.'
      prompt = `
다음 건설 현장의 금일 작업에 대해 공사감독으로서 공사 기록을 작성해주세요.
${data.previousWork ? `\n전일 작업내용: ${data.previousWork}` : ''}

금일 작업: ${data.todayWork}

요구사항:
- 반드시 6줄 이내로 작성 (절대 초과 금지)
- 전일 작업내용과 비교하여 금일 진행된 사실 위주로 간결하게 기술 (공정률 추측 금지)
- 인력과 장비 투입이 적절했는지 간략히 평가
- "○"로 시작하는 불릿 포인트 형식 사용
`
    } else {
      return NextResponse.json(
        { error: '잘못된 요청 타입입니다.' },
        { status: 400 }
      )
    }

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
            content: systemMessage
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: type === 'supervisor-instructions' ? 0.7 : 0.5
      })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('OpenAI API Error:', response.status, errorData)
      return NextResponse.json(
        { error: 'AI 요약 생성 중 오류가 발생했습니다.' },
        { status: 500 }
      )
    }

    const result = await response.json()
    const content = result.choices?.[0]?.message?.content

    if (!content) {
      return NextResponse.json(
        { error: 'AI 응답을 받지 못했습니다.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, content: content.trim() })
  } catch (error) {
    console.error('AI 요약 API 오류:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
