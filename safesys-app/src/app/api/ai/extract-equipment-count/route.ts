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

    const { texts } = await request.json()

    if (!texts || !Array.isArray(texts) || texts.length === 0) {
      return NextResponse.json(
        { error: '텍스트 배열을 입력해주세요.' },
        { status: 400 }
      )
    }

    const numberedTexts = texts.map((t: string, i: number) => `[${i + 1}] ${t}`).join('\n')

    const prompt = `아래 건설기계 투입 목록들에서 각각의 총 장비 대수만 숫자로 추출해주세요.
각 항목에서 "N대" 형태로 표기된 숫자들을 모두 합산하세요.

${numberedTexts}

응답 형식 (숫자만, 한 줄에 하나씩):
[1] 2
[2] 3`

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
            content: '건설현장 장비 투입 목록에서 총 장비 대수를 정확히 추출하는 전문가입니다. 반드시 지정된 형식으로만 응답합니다.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0
      })
    })

    const data = await response.json()

    if (data.choices && data.choices[0]) {
      const content = data.choices[0].message.content
      const counts: number[] = []
      const lines = content.split('\n').filter((l: string) => l.trim())

      for (let i = 0; i < texts.length; i++) {
        const line = lines.find((l: string) => l.includes(`[${i + 1}]`))
        if (line) {
          const match = line.match(/\d+/)
          counts.push(match ? parseInt(match[0]) : 0)
        } else {
          counts.push(0)
        }
      }

      return NextResponse.json({ counts })
    }

    return NextResponse.json(
      { error: 'AI 응답을 받지 못했습니다.' },
      { status: 500 }
    )
  } catch (error) {
    console.error('Equipment count extraction error:', error)
    return NextResponse.json(
      { error: '장비 대수 추출 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
