// TBM 일괄 텔레그램 발송 — 현장별 메시지를 발주청·시공사에게 순차 발송하는 API
import { NextRequest, NextResponse } from 'next/server'
import { sendTelegramMessage } from '@/lib/telegram'
import { authenticateRequest } from '../auth'
import {
  isProjectItemRef,
  resolveProjects,
  type ProjectItemRef,
  type ResolvedProject,
} from '../resolve-projects'

interface SendItem extends ProjectItemRef {
  message: string
}

interface RecipientResult {
  attempted: boolean
  ok: boolean
  description?: string
}

interface SendResult {
  projectName: string
  client: RecipientResult | null
  contractor: RecipientResult | null
}

// sendTelegramMessage 기본 parse_mode가 HTML이므로 발송 전 특수문자를 이스케이프한다.
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function isSendItem(value: unknown): value is SendItem {
  if (!isProjectItemRef(value) || !('message' in value)) return false
  return typeof value.message === 'string' && value.message.trim().length > 0
}

async function sendToRecipient(
  project: ResolvedProject | null,
  chatId: string | null | undefined,
  message: string
): Promise<RecipientResult> {
  if (!project) {
    return { attempted: false, ok: false, description: '프로젝트 미매칭' }
  }
  if (!chatId?.trim()) {
    return { attempted: false, ok: false, description: '텔레그램 ID 미등록' }
  }
  try {
    const result = await sendTelegramMessage(chatId, message)
    return {
      attempted: true,
      ok: result.ok,
      ...(result.description ? { description: result.description } : {}),
    }
  } catch (error) {
    console.error('TBM 텔레그램 개별 수신자 발송 오류:', {
      projectId: project.id,
      projectName: project.project_name,
      error,
    })
    return {
      attempted: true,
      ok: false,
      description: '텔레그램 발송 중 오류가 발생했습니다.',
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const authentication = await authenticateRequest(request)
    if (!authentication.ok) return authentication.response

    const body: unknown = await request.json().catch(() => null)
    const input = body && typeof body === 'object'
      ? body as Record<string, unknown>
      : null
    const itemsValue = input?.items
    const recipientsValue = input?.recipients
    const recipients = recipientsValue && typeof recipientsValue === 'object'
      ? recipientsValue as Record<string, unknown>
      : null

    if (
      !Array.isArray(itemsValue) ||
      itemsValue.length === 0 ||
      !itemsValue.every(isSendItem)
    ) {
      return NextResponse.json(
        { error: '발송할 항목에는 비어 있지 않은 메시지가 필요합니다.' },
        { status: 400 }
      )
    }
    if (
      !recipients ||
      typeof recipients.client !== 'boolean' ||
      typeof recipients.contractor !== 'boolean' ||
      (!recipients.client && !recipients.contractor)
    ) {
      return NextResponse.json(
        { error: '발송할 수신자를 선택해주세요.' },
        { status: 400 }
      )
    }
    const items: SendItem[] = itemsValue

    const resolved = await resolveProjects(authentication.supabase, items)
    const results: SendResult[] = []

    // 텔레그램 rate limit을 고려해 항목별로 순차 발송한다. 개별 실패는 기록만 하고 계속 진행.
    for (const [index, item] of items.entries()) {
      const project = resolved[index]
      const message = escapeHtml(item.message || '')

      const client = recipients.client
        ? await sendToRecipient(project, project?.client_telegram_id, message)
        : null
      const contractor = recipients.contractor
        ? await sendToRecipient(project, project?.contractor_telegram_id, message)
        : null

      results.push({ projectName: item.projectName, client, contractor })
    }

    return NextResponse.json({ success: true, results })
  } catch (error) {
    console.error('TBM 텔레그램 send API 오류:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
