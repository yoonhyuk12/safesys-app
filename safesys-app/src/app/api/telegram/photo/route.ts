// 텔레그램 사진 발송 API — projectId가 있으면 알림앱(aicctvalert)에도 사진을 병행 발송한다
import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { sendAppAlertBulk, stripTelegramHtml, type AppAlertResponse } from '@/lib/app-alert'

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`

// SSRF 방지 — 앱 병행 발송용 서버측 다운로드는 safesys Supabase 스토리지 URL만 허용
function isAllowedPhotoUrl(url: string): boolean {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) return false
  try {
    return new URL(url).origin === new URL(supabaseUrl).origin
  } catch {
    return false
  }
}

async function fetchPhotoAsBase64(photoUrl: string): Promise<string | null> {
  if (!isAllowedPhotoUrl(photoUrl)) return null
  try {
    const response = await fetch(photoUrl)
    if (!response.ok) return null
    const buffer = await response.arrayBuffer()
    return Buffer.from(buffer).toString('base64')
  } catch (error) {
    console.error('앱 병행 발송용 사진 다운로드 오류:', error)
    return null
  }
}

/**
 * POST /api/telegram/photo
 * 텔레그램으로 사진 발송 (+ 알림앱 병행 발송)
 *
 * Body:
 * - chatId?: string - 텔레그램 수신자 채팅 ID (쉼표 구분 복수 가능)
 * - photoUrl: string - 사진 URL
 * - caption?: string - 사진 캡션 (선택)
 * - projectId?: string - 알림앱 병행 발송 대상 조회용 (선택)
 * - recipients?: { client?: boolean; contractor?: boolean } - 앱 발송 대상. 미지정 시 둘 다
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { chatId, photoUrl, caption, projectId, recipients } = body

    if (!photoUrl || (!chatId && !projectId)) {
      return NextResponse.json(
        { ok: false, description: 'photoUrl과 chatId 또는 projectId가 필요합니다.' },
        { status: 400 }
      )
    }

    // 앱 병행 발송 (projectId가 있을 때만). 실패해도 텔레그램 발송에는 영향을 주지 않는다.
    const wantClient = recipients?.client !== false
    const wantContractor = recipients?.contractor !== false
    const appPromise: Promise<AppAlertResponse[]> = (async () => {
      if (!projectId) return []
      const { data: project, error } = await supabase
        .from('projects')
        .select('project_name, client_app_code, contractor_app_code')
        .eq('id', projectId)
        .single()
      if (error || !project) return []
      const clientCodes = wantClient ? project.client_app_code : null
      const contractorCodes = wantContractor ? project.contractor_app_code : null
      if (!clientCodes?.trim() && !contractorCodes?.trim()) return []

      const imageBase64 = await fetchPhotoAsBase64(String(photoUrl))
      if (!imageBase64) {
        return [{ ok: false, description: '사진을 내려받지 못해 앱 발송을 건너뛰었습니다.' }]
      }
      const message = stripTelegramHtml(String(caption || '')) || '사진이 도착했습니다.'
      const results = await Promise.all([
        sendAppAlertBulk(clientCodes, message, project.project_name, imageBase64),
        sendAppAlertBulk(contractorCodes, message, project.project_name, imageBase64),
      ])
      return results.flat()
    })()

    const chatIds = String(chatId ?? '').split(',').map((id: string) => id.trim()).filter(Boolean)

    // 텔레그램 발송 대상이 없으면 앱 결과만 응답
    if (chatIds.length === 0) {
      const app = await appPromise
      return NextResponse.json({ ok: app.some(r => r.ok), app })
    }

    if (!TELEGRAM_BOT_TOKEN) {
      await appPromise
      return NextResponse.json(
        { ok: false, description: 'Bot token not configured' },
        { status: 500 }
      )
    }

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
    const app = await appPromise

    // 단일 ID면 기존과 동일한 응답 형식
    if (chatIds.length === 1) {
      if (!results[0].ok) {
        console.error('텔레그램 사진 발송 실패:', results[0].description)
      }
      return NextResponse.json({ ...results[0], ...(app.length > 0 ? { app } : {}) })
    }

    return NextResponse.json({ ok: true, results, ...(app.length > 0 ? { app } : {}) })
  } catch (error) {
    console.error('텔레그램 사진 API 오류:', error)
    return NextResponse.json(
      { ok: false, description: String(error) },
      { status: 500 }
    )
  }
}
