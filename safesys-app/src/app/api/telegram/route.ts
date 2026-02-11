import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import {
  sendTelegramMessage,
  sendProjectNotification,
  createSafetyCheckMessage,
  createTBMStatusMessage,
  createUrgentMessage,
} from '@/lib/telegram'

/**
 * POST /api/telegram
 * 텔레그램 메시지 발송 API
 *
 * Body:
 * - type: 'direct' | 'project' | 'safety-check' | 'tbm-status' | 'urgent'
 * - chatId?: string (direct 타입일 때)
 * - projectId?: string (project 타입일 때)
 * - message?: string (direct, project, urgent 타입일 때)
 * - data?: object (safety-check, tbm-status, urgent 타입일 때)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { type, chatId, projectId, message, data } = body

    // 타입별 처리
    switch (type) {
      case 'direct': {
        // 직접 메시지 발송
        if (!chatId || !message) {
          return NextResponse.json(
            { error: 'chatId와 message가 필요합니다.' },
            { status: 400 }
          )
        }
        const result = await sendTelegramMessage(chatId, message)
        return NextResponse.json(result)
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
          .select('project_name, client_telegram_id, contractor_telegram_id')
          .eq('id', projectId)
          .single()

        if (error || !project) {
          return NextResponse.json(
            { error: '프로젝트를 찾을 수 없습니다.' },
            { status: 404 }
          )
        }

        const result = await sendProjectNotification(project, message)
        return NextResponse.json(result)
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
          .select('project_name, client_telegram_id, contractor_telegram_id')
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

        const result = await sendProjectNotification(project, safetyMessage)
        return NextResponse.json(result)
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
          .select('project_name, client_telegram_id, contractor_telegram_id')
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

        const result = await sendProjectNotification(project, tbmMessage)
        return NextResponse.json(result)
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
          .select('project_name, client_telegram_id, contractor_telegram_id')
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

        const result = await sendProjectNotification(project, urgentMessage)
        return NextResponse.json(result)
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
