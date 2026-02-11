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

    const { image } = await request.json()

    if (!image) {
      return NextResponse.json(
        { error: '이미지가 없습니다.' },
        { status: 400 }
      )
    }

    const prompt = `이 이미지는 한국의 "기초안전보건교육 이수증" 카드입니다.
카드에서 다음 정보를 추출해주세요:

1. 이름 (성명)
2. 생년월일 (YYYY-MM-DD 형식으로)
3. 등록번호 (교육이수번호)
4. 이수일자 (YYYY-MM-DD 형식으로)

반드시 다음 JSON 형식으로만 응답해주세요. 다른 텍스트 없이 JSON만 출력하세요:
{
  "name": "홍길동",
  "birth_date": "1990-01-15",
  "registration_number": "ABC123456",
  "completion_date": "2024-06-01"
}

만약 특정 정보를 찾을 수 없다면 해당 필드는 빈 문자열("")로 반환하세요.
날짜는 반드시 YYYY-MM-DD 형식으로 변환해주세요. (예: 2024년 6월 1일 → 2024-06-01)`

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
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt
              },
              {
                type: 'image_url',
                image_url: {
                  url: image,
                  detail: 'high'
                }
              }
            ]
          }
        ],
        max_tokens: 500,
        temperature: 0.1
      })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('OpenAI API Error:', response.status, errorData)
      return NextResponse.json(
        { error: 'AI 분석 중 오류가 발생했습니다.' },
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

    // JSON 파싱 시도
    try {
      // JSON 블록 추출 (```json ... ``` 또는 순수 JSON)
      let jsonStr = content
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/)
      if (jsonMatch) {
        jsonStr = jsonMatch[1]
      } else {
        // { } 블록만 추출
        const braceMatch = content.match(/\{[\s\S]*\}/)
        if (braceMatch) {
          jsonStr = braceMatch[0]
        }
      }

      const result = JSON.parse(jsonStr)

      return NextResponse.json({
        success: true,
        data: {
          name: result.name || '',
          birth_date: result.birth_date || '',
          registration_number: result.registration_number || '',
          completion_date: result.completion_date || ''
        }
      })
    } catch (parseError) {
      console.error('JSON 파싱 오류:', parseError, 'Content:', content)
      return NextResponse.json(
        { error: '카드 정보를 인식하지 못했습니다. 다시 촬영해주세요.' },
        { status: 400 }
      )
    }
  } catch (error) {
    console.error('OCR API 오류:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
