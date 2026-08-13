import { NextRequest, NextResponse } from 'next/server'
import { getAiModel } from '@/lib/ai-models'

const OPENAI_API_KEY = process.env.OPENAI_API_KEY

export async function POST(request: NextRequest) {
  try {
    if (!OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API 키가 설정되지 않았습니다.' },
        { status: 500 }
      )
    }

    const { todayWork, personnelInput, equipmentInput } = await request.json()

    if (!todayWork) {
      return NextResponse.json(
        { error: '금일작업을 입력해주세요.' },
        { status: 400 }
      )
    }

    const prompt = `오늘 TBM 작업내용: "${todayWork}"
${personnelInput ? `투입인원: "${personnelInput}"` : ''}
${equipmentInput ? `투입장비: "${equipmentInput}"` : ''}

위 내용에 대해서, 한국농어촌공사 공사감독으로써 안전조치 확인 해야할 사항 6가지를 적어줘.
각 항목은 번호와 한 줄로 간결하게 작성해줘. HTML 태그 없이 플레인 텍스트로 작성해줘.`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 50000)

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: await getAiModel('ai.tbm-safety-advice'),
        messages: [
          {
            role: 'system',
            content: '건설현장 안전관리 전문가로서 답변해주세요. 간결하게 작성합니다.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 500
      }),
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('OpenAI API Error:', response.status, errorData)
      return NextResponse.json(
        { error: 'AI 안전조치 생성 중 오류가 발생했습니다.' },
        { status: 500 }
      )
    }

    const data = await response.json()
    const advice = data.choices?.[0]?.message?.content

    if (!advice) {
      return NextResponse.json(
        { error: 'AI 응답을 받지 못했습니다.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, advice })
  } catch (error) {
    console.error('AI 안전조치 API 오류:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
