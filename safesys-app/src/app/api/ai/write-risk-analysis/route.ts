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

    const prompt = `
        다음 건설 현장 작업에 대해 안전관리 관점에서 분석해주세요:

        작업내용: "${todayWork}"
${personnelInput ? `        투입인원: "${personnelInput}"` : ''}
${equipmentInput ? `        투입장비: "${equipmentInput}"` : ''}

        ${personnelInput || equipmentInput ? '위 정보를 종합적으로 고려하여 작업 시 발생할 수 있는 위험요인과 안전대책을 분석해주세요.' : '위 작업에서 발생할 수 있는 위험요인과 안전대책을 분석해주세요.'}

        각각의 칸에 30자 이내로 작성해주세요. 서로 중복되지 않게 해주세요:
        1. 잠재위험요인 3가지와 각각의 대책
        2. 중점위험요인 1가지(반드시 위 잠재위험요인 3가지 중 하나를 그대로 선택)와 그에 대한 대책
        3. 잠재위험요소 3가지 — 각 잠재위험요인과 연관된 "단순 위험 요소"(위험을 유발하는 상태·대상 자체)로만 작성하세요. 제거/설치/착용 같은 대책·조치 표현은 절대 쓰지 마세요.
           (예: 잠재위험요인1이 "작업자 미끄러짐"이면 → 위험요소1은 "바닥 물기". "바닥 물기 제거"처럼 조치로 쓰면 안 됨)

        응답 형식:
        잠재위험요인1: (내용)
        대책1: (내용)
        잠재위험요인2: (내용)
        대책2: (내용)
        잠재위험요인3: (내용)
        대책3: (내용)
        중점위험요인: (내용)
        중점위험요인대책: (내용)
        위험요소1: (잠재위험요인1과 연관된 단순 위험 요소, 대책 아님)
        위험요소2: (잠재위험요인2와 연관된 단순 위험 요소, 대책 아님)
        위험요소3: (잠재위험요인3과 연관된 단순 위험 요소, 대책 아님)`

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: await getAiModel('ai.write-risk-analysis'),
        messages: [
          {
            role: 'system',
            content: '건설현장 안전관리 전문가로서 답변해주세요.'
          },
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('OpenAI API Error:', response.status, errorData)
      return NextResponse.json(
        { error: 'AI 작성 중 오류가 발생했습니다.' },
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

    // 응답 파싱
    const lines = content.split('\n')
    const result: Record<string, string> = {}

    for (const line of lines) {
      if (line.includes('잠재위험요인1:')) {
        result.potentialRisk1 = line.split(':')[1].trim()
      } else if (line.includes('대책1:')) {
        result.solution1 = line.split(':')[1].trim()
      } else if (line.includes('잠재위험요인2:')) {
        result.potentialRisk2 = line.split(':')[1].trim()
      } else if (line.includes('대책2:')) {
        result.solution2 = line.split(':')[1].trim()
      } else if (line.includes('잠재위험요인3:')) {
        result.potentialRisk3 = line.split(':')[1].trim()
      } else if (line.includes('대책3:')) {
        result.solution3 = line.split(':')[1].trim()
      } else if (line.includes('중점위험요인:')) {
        result.mainRiskSelection = line.split(':')[1].trim()
      } else if (line.includes('중점위험요인대책:')) {
        result.mainRiskSolution = line.split(':')[1].trim()
      } else if (line.includes('위험요소1:')) {
        result.riskFactor1 = line.split(':')[1].trim()
      } else if (line.includes('위험요소2:')) {
        result.riskFactor2 = line.split(':')[1].trim()
      } else if (line.includes('위험요소3:')) {
        result.riskFactor3 = line.split(':')[1].trim()
      }
    }

    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    console.error('AI 작성 API 오류:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
