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

    const { workType, workDetail, targetWorks, equipmentType, personnel, location } = await request.json()

    if (!workDetail && !workType) {
      return NextResponse.json(
        { error: '공종명 또는 작업세부공종을 입력해주세요.' },
        { status: 400 }
      )
    }

    const prompt = `다음 건설 현장 위험공종 작업허가서(PTW) 내용에 대해 안전관리 관점에서 분석해주세요:

${workType ? `공종명: "${workType}"` : ''}
${workDetail ? `작업세부공종: "${workDetail}"` : ''}
${Array.isArray(targetWorks) && targetWorks.length > 0 ? `해당 위험공종: "${targetWorks.join(', ')}"` : ''}
${equipmentType ? `투입 중장비: "${equipmentType}"` : ''}
${personnel ? `작업인원: "${personnel}"` : ''}
${location ? `작업위치: "${location}"` : ''}

위 작업에 대해 다음 5개 항목을 작성해주세요. 서로 중복되지 않게 해주세요:
1. 위험요소: 위험성 평가 결과 요약 (30자 이내)
2. 개선대책: 위험요소에 대한 개선대책 요약 (30자 이내)
3. 재해형태: 관련 재해 형태 (예: 비래/추락, 10자 이내)
4. 검토의견: 공사감독 입장의 검토의견 한 문장 (40자 이내)
5. 조치결과: 공사감독 입장의 조치결과 한 문장 (40자 이내)

응답 형식 (HTML 태그 없이 플레인 텍스트):
위험요소: (내용)
개선대책: (내용)
재해형태: (내용)
검토의견: (내용)
조치결과: (내용)`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 50000)

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
      if (line.includes('위험요소:')) {
        result.riskFactor = line.split(':')[1]?.trim() || ''
      } else if (line.includes('개선대책:')) {
        result.improvement = line.split(':')[1]?.trim() || ''
      } else if (line.includes('재해형태:')) {
        result.disasterType = line.split(':')[1]?.trim() || ''
      } else if (line.includes('검토의견:')) {
        result.reviewOpinion = line.split(':')[1]?.trim() || ''
      } else if (line.includes('조치결과:')) {
        result.actionResult = line.split(':')[1]?.trim() || ''
      }
    }

    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    console.error('PTW AI 작성 API 오류:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
