import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import {
  sendTelegramMessage,
  sendTelegramMessageBulk,
  sendProjectNotification,
  createSafetyCheckMessage,
  createTBMStatusMessage,
  createUrgentMessage,
} from '@/lib/telegram'
import { sendProjectAppNotification, sendAppAlertBulk, stripTelegramHtml } from '@/lib/app-alert'
import type { AppAlertResponse } from '@/lib/app-alert'

/**
 * POST /api/telegram
 * 텔레그램 메시지 발송 API (알림앱 병행 발송 지원)
 *
 * Body:
 * - type: 'direct' | 'project' | 'safety-check' | 'tbm-status' | 'urgent'
 * - chatId?: string (direct 타입, 텔레그램 발송 대상. 쉼표 구분 복수 가능)
 * - projectId?: string (project 등 타입, direct 타입에서는 앱 병행 발송 대상 조회용)
 * - recipients?: { client?: boolean, contractor?: boolean } (direct 타입, 앱 발송 대상 측. 기본값 둘 다 true)
 * - message?: string (direct, project, urgent 타입일 때)
 * - data?: object (safety-check, tbm-status, urgent 타입일 때)
 *
 * direct 타입은 chatId와 projectId 중 하나 이상 필요하다.
 * chatId가 있으면 텔레그램 발송, projectId가 있으면 recipients 측의 앱 코드로 앱 병행 발송한다.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { type, chatId, projectId, recipients, message, data } = body

    // 타입별 처리
    switch (type) {
      case 'direct': {
        // 직접 메시지 발송 (텔레그램 + 앱 병행). chatId와 projectId 중 하나 이상 필요
        if (!message) {
          return NextResponse.json(
            { error: 'message가 필요합니다.' },
            { status: 400 }
          )
        }
        if (!chatId && !projectId) {
          return NextResponse.json(
            { error: 'chatId 또는 projectId가 필요합니다.' },
            { status: 400 }
          )
        }

        const chatIds = String(chatId ?? '').split(',').map(id => id.trim()).filter(Boolean)

        // 앱 병행 발송 준비 (projectId가 있을 때만). recipients 미지정 시 발주청·시공사 둘 다
        const wantClient = recipients?.client !== false
        const wantContractor = recipients?.contractor !== false
        const appPromise: Promise<{ client: AppAlertResponse[]; contractor: AppAlertResponse[] }> = (async () => {
          if (!projectId) return { client: [], contractor: [] }
          const { data: project, error } = await supabase
            .from('projects')
            .select('project_name, client_app_code, contractor_app_code')
            .eq('id', projectId)
            .single()
          if (error || !project) {
            return { client: [], contractor: [] }
          }
          const plainMessage = stripTelegramHtml(message)
          const [client, contractor] = await Promise.all([
            wantClient ? sendAppAlertBulk(project.client_app_code, plainMessage, project.project_name) : Promise.resolve([]),
            wantContractor ? sendAppAlertBulk(project.contractor_app_code, plainMessage, project.project_name) : Promise.resolve([]),
          ])
          return { client, contractor }
        })()

        // 텔레그램 발송 (chatId가 있을 때만)
        if (chatIds.length === 0) {
          const app = await appPromise
          const anyAppSent = [...app.client, ...app.contractor].some(r => r.ok)
          if (!projectId || (app.client.length === 0 && app.contractor.length === 0)) {
            // 텔레그램도 앱도 보낼 대상이 없으면 404
            return NextResponse.json(
              { error: '발송 대상을 찾을 수 없습니다.' },
              { status: 404 }
            )
          }
          return NextResponse.json({ ok: anyAppSent, app })
        }

        if (chatIds.length === 1) {
          const [result, app] = await Promise.all([
            sendTelegramMessage(chatIds[0], message),
            appPromise,
          ])
          return NextResponse.json({ ...result, app })
        }
        const [results, app] = await Promise.all([
          sendTelegramMessageBulk(chatIds, message),
          appPromise,
        ])
        return NextResponse.json({ ok: true, results, app })
      }

      case 'project': {
        // 프로젝트 관련자에게 발송
        if (!projectId || !message) {
          return NextResponse.json(
            { error: 'projectId와 message가 필요합니다.' },
            { status: 400 }
          )
        }

        // 프로젝트 정보 조회
        const { data: project, error } = await supabase
          .from('projects')
          .select('project_name, client_telegram_id, contractor_telegram_id, client_app_code, contractor_app_code')
          .eq('id', projectId)
          .single()

        if (error || !project) {
          return NextResponse.json(
            { error: '프로젝트를 찾을 수 없습니다.' },
            { status: 404 }
          )
        }

        const [result, app] = await Promise.all([
          sendProjectNotification(project, message),
          sendProjectAppNotification(project, message),
        ])
        return NextResponse.json({ ...result, app })
      }

      case 'safety-check': {
        // 안전점검 알림
        if (!projectId || !data) {
          return NextResponse.json(
            { error: 'projectId와 data가 필요합니다.' },
            { status: 400 }
          )
        }

        const { data: project, error } = await supabase
          .from('projects')
          .select('project_name, client_telegram_id, contractor_telegram_id, client_app_code, contractor_app_code')
          .eq('id', projectId)
          .single()

        if (error || !project) {
          return NextResponse.json(
            { error: '프로젝트를 찾을 수 없습니다.' },
            { status: 404 }
          )
        }

        const safetyMessage = createSafetyCheckMessage({
          projectName: project.project_name,
          ...data,
        })

        const [result, app] = await Promise.all([
          sendProjectNotification(project, safetyMessage),
          sendProjectAppNotification(project, safetyMessage),
        ])
        return NextResponse.json({ ...result, app })
      }

      case 'tbm-status': {
        // TBM 상태 알림
        if (!projectId || !data) {
          return NextResponse.json(
            { error: 'projectId와 data가 필요합니다.' },
            { status: 400 }
          )
        }

        const { data: project, error } = await supabase
          .from('projects')
          .select('project_name, client_telegram_id, contractor_telegram_id, client_app_code, contractor_app_code')
          .eq('id', projectId)
          .single()

        if (error || !project) {
          return NextResponse.json(
            { error: '프로젝트를 찾을 수 없습니다.' },
            { status: 404 }
          )
        }

        const tbmMessage = createTBMStatusMessage({
          projectName: project.project_name,
          ...data,
        })

        const [result, app] = await Promise.all([
          sendProjectNotification(project, tbmMessage),
          sendProjectAppNotification(project, tbmMessage),
        ])
        return NextResponse.json({ ...result, app })
      }

      case 'urgent': {
        // 긴급 알림
        if (!projectId || !data) {
          return NextResponse.json(
            { error: 'projectId와 data가 필요합니다.' },
            { status: 400 }
          )
        }

        const { data: project, error } = await supabase
          .from('projects')
          .select('project_name, client_telegram_id, contractor_telegram_id, client_app_code, contractor_app_code')
          .eq('id', projectId)
          .single()

        if (error || !project) {
          return NextResponse.json(
            { error: '프로젝트를 찾을 수 없습니다.' },
            { status: 404 }
          )
        }

        const urgentMessage = createUrgentMessage({
          projectName: project.project_name,
          ...data,
        })

        const [result, app] = await Promise.all([
          sendProjectNotification(project, urgentMessage),
          sendProjectAppNotification(project, urgentMessage),
        ])
        return NextResponse.json({ ...result, app })
      }

      default:
        return NextResponse.json(
          { error: '지원하지 않는 type입니다.' },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('텔레그램 API 오류:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
