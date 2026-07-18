// AI CCTV 알림앱 개인코드 테스트/직접 발송 API — 쉼표 구분 코드에 병렬 발송
import { NextRequest, NextResponse } from 'next/server'
import { sendAppAlertBulk } from '@/lib/app-alert'

/**
 * POST /api/app-alert
 * 알림앱 개인코드로 메시지 발송 API
 *
 * Body:
 * - targetCodes: string (쉼표 구분 개인코드, 필수)
 * - message: string (본문, 필수)
 * - projectName?: string (알림 제목으로 표시)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { targetCodes, message, projectName } = body

    if (!targetCodes || !message) {
      return NextResponse.json(
        { error: 'targetCodes와 message가 필요합니다.' },
        { status: 400 }
      )
    }

    const results = await sendAppAlertBulk(String(targetCodes), String(message), projectName)
    const ok = results.length > 0 && results.every(result => result.ok)

    return NextResponse.json({ ok, results })
  } catch (error) {
    console.error('앱 알림 API 오류:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
