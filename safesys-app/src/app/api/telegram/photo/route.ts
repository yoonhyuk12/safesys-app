import { NextRequest, NextResponse } from 'next/server'

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`

/**
 * POST /api/telegram/photo
 * 텔레그램으로 사진 발송
 *
 * Body:
 * - chatId: string - 수신자 채팅 ID
 * - photoUrl: string - 사진 URL
 * - caption?: string - 사진 캡션 (선택)
 */
export async function POST(request: NextRequest) {
  try {
    if (!TELEGRAM_BOT_TOKEN) {
      return NextResponse.json(
        { ok: false, description: 'Bot token not configured' },
        { status: 500 }
      )
    }

    const body = await request.json()
    const { chatId, photoUrl, caption } = body

    if (!chatId || !photoUrl) {
      return NextResponse.json(
        { ok: false, description: 'chatId와 photoUrl이 필요합니다.' },
        { status: 400 }
      )
    }

    // 쉼표 구분 복수 ID 지원 - 일괄 발송
    const chatIds = String(chatId).split(',').map((id: string) => id.trim()).filter(Boolean)

    const results = await Promise.all(
      chatIds.map(async (id: string) => {
        const response = await fetch(`${TELEGRAM_API_URL}/sendPhoto`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            chat_id: id,
            photo: photoUrl,
            caption: caption || '',
            parse_mode: 'HTML',
          }),
        })
        return response.json()
      })
    )

    // 단일 ID면 기존과 동일한 응답 형식
    if (chatIds.length === 1) {
      if (!results[0].ok) {
        console.error('텔레그램 사진 발송 실패:', results[0].description)
      }
      return NextResponse.json(results[0])
    }

    return NextResponse.json({ ok: true, results })
  } catch (error) {
    console.error('텔레그램 사진 API 오류:', error)
    return NextResponse.json(
      { ok: false, description: String(error) },
      { status: 500 }
    )
  }
}
