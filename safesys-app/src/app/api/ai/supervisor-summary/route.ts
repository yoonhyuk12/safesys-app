import { NextRequest, NextResponse } from 'next/server'
import { getAiModel, supportsSamplingParams } from '@/lib/ai-models'
import {
  STANDARD_EQUIPMENT_NAMES,
  STANDARD_WORKER_TYPES,
} from '@/lib/work-daily-report/standard-classifications'

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const GEMINI_API_KEY = process.env.GEMINI_API_KEY

export async function POST(request: NextRequest) {
  try {
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
    } else if (type === 'work-daily-classify') {
      // 작업일보 - TBM 투입인원/장비 텍스트를 장비와 인력으로 구분하여 구조화
      // 기존 분류 목록이 있으면 그 명칭에 우선 매칭하고, 없을 때만 새 항목 생성
      const existingEquipment: string[] = Array.isArray(data.existingEquipment) ? data.existingEquipment : []
      const existingPersonnel: string[] = Array.isArray(data.existingPersonnel) ? data.existingPersonnel : []

      systemMessage = '건설현장 데이터 정리 전문가입니다. 반드시 유효한 JSON으로만 응답하세요.'
      prompt = `
다음 건설 현장 TBM 보고의 투입인원/투입장비 텍스트를 분석하여 장비와 인력을 구분하고 JSON으로 정리해주세요.

투입인원: ${data.personnel || '없음'}
투입장비: ${data.equipment || '없음'}

${existingEquipment.length > 0 ? `기존 장비 분류 목록: ${existingEquipment.join(', ')}` : ''}
${existingPersonnel.length > 0 ? `기존 인력 분류 목록: ${existingPersonnel.join(', ')}` : ''}

표준 장비명 목록: ${STANDARD_EQUIPMENT_NAMES.join(', ')}

표준 직종 목록: ${STANDARD_WORKER_TYPES.join(', ')}

규칙:
- equipment 배열: 장비별로 {"name": "장비명", "spec": "규격(없으면 빈 문자열)", "count": "금일 투입 대수(숫자만, 알 수 없으면 1)"}
- personnel 배열: 직종별로 {"category": "구분(예: 보통인부, 특별인부, 작업반장 등)", "count": "금일 투입 인원수(숫자만)"}
- 명칭 매칭 우선순위: ① 기존 분류 목록 ② 표준 장비명/직종 목록 — 의미가 같거나 유사한 항목이 있으면 반드시 해당 명칭을 글자 그대로 사용 (예: 기존 목록에 "굴삭기"가 있으면 "굴착기", "백호"도 "굴삭기"로 표기, 표준 목록 매칭 시 "포크레인"은 "굴착기(무한궤도)"로 표기)
- 기존 분류 목록과 표준 목록 양쪽에 해당하는 항목은 반드시 기존 분류 명칭을 사용 (표준 목록은 기존 분류에 없는 항목에만 적용)
- 어느 목록에도 적합한 명칭이 없거나 구분이 애매한 항목은 "기타(미분류)"로 분류하고, 여러 개면 수량을 합산하여 하나의 "기타(미분류)" 항목으로 작성
- 직종 구분이 없는 인원 수만 있으면 ${existingPersonnel.length > 0 ? `기존 인력 분류 중 적절한 항목(기본: "${existingPersonnel[0]}")` : '"보통인부"'}로 분류
- 장비 텍스트에 섞여 있는 인력(신호수, 운전원 등)은 personnel로 분류
- 합계/총계 행은 만들지 않음
- 다음 JSON 형식으로만 응답: {"equipment":[{"name":"","spec":"","count":""}],"personnel":[{"category":"","count":""}]}
`
    } else {
      return NextResponse.json(
        { error: '잘못된 요청 타입입니다.' },
        { status: 400 }
      )
    }

    // ── 장비/인력 분류: Gemini 3.1 Flash Lite 사용 (키가 없으면 아래 OpenAI로 폴백)
    if (type === 'work-daily-classify' && GEMINI_API_KEY) {
      const classifyModel = await getAiModel('ai.supervisor-summary.classify')
      const geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${classifyModel}:generateContent`,
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
              temperature: 0.2,
              responseMimeType: 'application/json',
            },
          }),
        }
      )

      if (!geminiResponse.ok) {
        const errorData = await geminiResponse.json().catch(() => ({}))
        console.error('Gemini API Error:', geminiResponse.status, errorData)
        return NextResponse.json(
          { error: 'AI 분류 중 오류가 발생했습니다. (Gemini)' },
          { status: 500 }
        )
      }

      const geminiResult = await geminiResponse.json()
      const geminiContent = geminiResult.candidates?.[0]?.content?.parts
        ?.map((part: { text?: string }) => part.text || '')
        .join('')

      if (!geminiContent) {
        console.error('Gemini 응답 없음:', JSON.stringify(geminiResult).slice(0, 500))
        return NextResponse.json(
          { error: 'AI 응답을 받지 못했습니다. (Gemini)' },
          { status: 500 }
        )
      }

      try {
        const parsed = JSON.parse(geminiContent)
        return NextResponse.json({ success: true, content: parsed })
      } catch {
        console.error('Gemini 분류 응답 파싱 실패:', geminiContent)
        return NextResponse.json(
          { error: 'AI 분류 결과를 해석할 수 없습니다.' },
          { status: 500 }
        )
      }
    }

    if (!OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'AI API 키가 설정되지 않았습니다. (.env.local의 GEMINI_API_KEY 또는 OPENAI_API_KEY)' },
        { status: 500 }
      )
    }

    const remarksModel = await getAiModel('ai.supervisor-summary.remarks')

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: remarksModel,
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
        ...(supportsSamplingParams(remarksModel)
          ? { temperature: type === 'supervisor-instructions' ? 0.7 : type === 'work-daily-classify' ? 0.2 : 0.5 }
          : {}),
        ...(type === 'work-daily-classify' ? { response_format: { type: 'json_object' } } : {})
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

    // 구조화 분류 타입은 JSON 파싱 후 객체로 반환
    if (type === 'work-daily-classify') {
      try {
        const parsed = JSON.parse(content)
        return NextResponse.json({ success: true, content: parsed })
      } catch {
        console.error('AI 분류 응답 파싱 실패:', content)
        return NextResponse.json(
          { error: 'AI 분류 결과를 해석할 수 없습니다.' },
          { status: 500 }
        )
      }
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
