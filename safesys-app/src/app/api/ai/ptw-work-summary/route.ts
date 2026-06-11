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

    const { todayWork, personnel, equipment, permitLabel } = await request.json()

    if (!todayWork) {
      return NextResponse.json(
        { error: '작업내용이 없습니다.' },
        { status: 400 }
      )
    }

    // 공용 허가서(정전/화기/밀폐공간): 허가서 종류에 맞는 작업내용 한 줄 정리
    const prompt = permitLabel
      ? `다음은 건설 현장 TBM(작업 전 안전회의) 보고 내용입니다:

작업내용: "${todayWork}"

위 작업내용을 분석해서 "${permitLabel}"의 작업내용 란에 적합하게 한 줄(40자 이내)로 정리해주세요.
${permitLabel} 관점에서 해당되는 작업 위주로 요약합니다.

응답 형식 (HTML 태그 없이 플레인 텍스트):
작업내용: (내용)`
      : `다음은 건설 현장 TBM(작업 전 안전회의) 보고 내용입니다:

작업내용: "${todayWork}"
${personnel ? `투입인원: "${personnel}"` : ''}
${equipment ? `투입장비: "${equipment}"` : ''}

위 내용을 위험공종 작업허가서(PTW) 양식에 맞게 정리해주세요:
1. 공종명: 작업내용에 해당하는 표준 공종 종류 1개 (예: 토공사, 철근콘크리트공사, 구조물공사 등 10자 이내)
2. 작업인원: 인원을 한 줄로 정리 (예: 총 5명(목공 2인, 보통인부 3인)) - 정보 없으면 "-"
3. 장비종류: 투입장비를 쉼표로 한 줄 정리 (예: 굴착기, 덤프트럭) - 정보 없으면 "-"
4. 규격: 장비의 일반적인 규격 추정 한 줄 (예: 0.6㎥, 15톤) - 추정 어려우면 "-"
5. 해당공종: 아래 작업허가제 대상공종 8개 중 작업내용과 관련된 항목 번호를 쉼표로 나열 (예: 1,2) - 해당 없으면 "없음"
   ① 2.0m 이상 고소작업
   ② 1.5m 이상 굴착·가설공사
   ③ 철골 구조물 공사
   ④ 2.0m이상 외부 도장공사
   ⑤ 승강기 설치공사
   ⑥ 수중 및 수면작업
   ⑦ 복통, 잠관 공사
   ⑧ 이외의 작업계획서작성 대상

응답 형식 (HTML 태그 없이 플레인 텍스트):
공종명: (내용)
작업인원: (내용)
장비종류: (내용)
규격: (내용)
해당공종: (번호 목록 또는 없음)`

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
        temperature: 0.3,
        max_tokens: 300
      }),
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('OpenAI API Error:', response.status, errorData)
      return NextResponse.json(
        { error: 'AI 정리 중 오류가 발생했습니다.' },
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
      if (line.includes('작업내용:')) {
        result.content = line.split(':')[1]?.trim() || ''
      } else if (line.includes('공종명:')) {
        result.workType = line.split(':')[1]?.trim() || ''
      } else if (line.includes('작업인원:')) {
        result.personnel = line.split(':')[1]?.trim() || ''
      } else if (line.includes('장비종류:')) {
        result.equipmentType = line.split(':')[1]?.trim() || ''
      } else if (line.includes('규격:')) {
        result.spec = line.split(':')[1]?.trim() || ''
      } else if (line.includes('해당공종:')) {
        result.targetIndices = line.split(':')[1]?.trim() || ''
      }
    }

    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    console.error('PTW 작업 정리 API 오류:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
