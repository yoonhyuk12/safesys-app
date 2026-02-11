import { NextRequest, NextResponse } from 'next/server'

const OPENAI_API_KEY = process.env.OPENAI_API_KEY

// 언어별 번역 프롬프트
const getTranslationPrompt = (text: string, targetLang: string): string => {
  const langNames: Record<string, string> = {
    'ko': '한국어',
    'en': '영어',
    'ja': '일본어',
    'zh-cn': '중국어 간체',
    'zh-tw': '중국어 번체',
    'vi': '베트남어',
    'th': '태국어',
    'id': '인도네시아어',
    'tl': '필리핀어(타갈로그)',
    'my': '미얀마어',
    'km': '캄보디아어(크메르어)',
    'ne': '네팔어',
    'uz': '우즈베키스탄어',
    'mn': '몽골어',
    'ru': '러시아어',
  }

  const langName = langNames[targetLang] || targetLang

  return `다음 한국어 안전교육 내용을 ${langName}로 번역해주세요.
건설 현장 안전 용어를 정확하게 번역하고, 외국인 근로자가 쉽게 이해할 수 있도록 명확하게 번역해주세요.
번역만 출력하고 다른 설명은 하지 마세요.

원문:
${text}`
}

export async function POST(request: NextRequest) {
  try {
    if (!OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API 키가 설정되지 않았습니다.' },
        { status: 500 }
      )
    }

    const { text, language } = await request.json()

    if (!text) {
      return NextResponse.json(
        { error: '텍스트를 입력해주세요.' },
        { status: 400 }
      )
    }

    let textToSpeak = text

    // 한국어가 아닌 경우 GPT-4o-mini로 번역
    if (language && language !== 'ko') {
      const translationResponse = await fetch('https://api.openai.com/v1/chat/completions', {
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
              content: getTranslationPrompt(text, language)
            }
          ],
          temperature: 0.3,
          max_tokens: 2000
        })
      })

      if (!translationResponse.ok) {
        const errorData = await translationResponse.json()
        console.error('번역 API 오류:', errorData)
        // 번역 실패 시 원문 사용
      } else {
        const translationData = await translationResponse.json()
        textToSpeak = translationData.choices[0]?.message?.content || text
      }
    }

    // OpenAI TTS API 호출
    const ttsResponse = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: textToSpeak,
        voice: 'nova', // alloy, echo, fable, onyx, nova, shimmer 중 선택
        response_format: 'mp3',
        speed: 0.9 // 약간 천천히
      })
    })

    if (!ttsResponse.ok) {
      const errorData = await ttsResponse.json()
      console.error('TTS API 오류:', errorData)
      return NextResponse.json(
        { error: 'TTS 생성 중 오류가 발생했습니다.' },
        { status: 500 }
      )
    }

    // 오디오 데이터를 base64로 변환
    const audioBuffer = await ttsResponse.arrayBuffer()
    const base64Audio = Buffer.from(audioBuffer).toString('base64')

    return NextResponse.json({
      success: true,
      audio: base64Audio,
      translatedText: textToSpeak,
      format: 'mp3'
    })

  } catch (error: any) {
    console.error('TTS API 오류:', error)
    return NextResponse.json(
      { error: error.message || 'TTS 생성 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
