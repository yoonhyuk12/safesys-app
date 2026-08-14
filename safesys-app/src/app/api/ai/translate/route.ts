import { NextRequest, NextResponse } from 'next/server'
import { getAiModel, supportsSamplingParams, tokenLimitParam } from '@/lib/ai-models'

const OPENAI_API_KEY = process.env.OPENAI_API_KEY

const LANG_NAMES: Record<string, string> = {
  'en': 'English',
  'ja': '日本語',
  'zh-cn': '中文简体',
  'zh-tw': '中文繁體',
  'vi': 'Tiếng Việt',
  'th': 'ภาษาไทย',
  'id': 'Bahasa Indonesia',
  'tl': 'Tagalog',
  'my': 'မြန်မာ',
  'km': 'ភាសាខ្មែរ',
  'ne': 'नेपाली',
  'uz': "O'zbek",
  'mn': 'Монгол (Mongolian)',
  'ru': 'Русский (Russian)',
}

export async function POST(request: NextRequest) {
  try {
    if (!OPENAI_API_KEY) {
      return NextResponse.json({ error: 'API 키 없음' }, { status: 500 })
    }

    const { texts, language } = await request.json() as {
      texts: Record<string, string>
      language: string
    }

    if (!texts || !language || language === 'ko') {
      return NextResponse.json({ error: '잘못된 요청' }, { status: 400 })
    }

    const langName = LANG_NAMES[language] || language
    const jsonInput = JSON.stringify(texts, null, 2)
    const model = await getAiModel('ai.translate')

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: `You are a professional construction safety document translator. Translate Korean text to ${langName}. Return ONLY a valid JSON object with the same keys and translated values. Keep proper nouns, numbers, and time formats unchanged. Use simple, clear language for foreign workers.`,
          },
          {
            role: 'user',
            content: `Translate all values in this JSON to ${langName}:\n${jsonInput}`,
          },
        ],
        ...(supportsSamplingParams(model) ? { temperature: 0.2 } : {}),
        ...tokenLimitParam(model, 3000),
        response_format: { type: 'json_object' },
      }),
    })

    if (!response.ok) {
      return NextResponse.json({ error: '번역 실패' }, { status: 500 })
    }

    const result = await response.json()
    const translated = JSON.parse(result.choices[0]?.message?.content || '{}')

    return NextResponse.json({ translated })
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '번역 중 오류' },
      { status: 500 }
    )
  }
}
