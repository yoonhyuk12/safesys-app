// TBM 일괄 텔레그램 발송 — 현장별 메시지를 발주청·시공사에게 순차 발송하는 API
import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { sendTelegramMessage } from '@/lib/telegram'
import { isOrganizationInUserScope } from '@/lib/organization-scope'
import { authenticateRequest } from '../auth'
import {
  isCanonicalUuid,
  isProjectItemRef,
  resolveProjects,
  type ProjectItemRef,
  type ResolvedProject,
} from '../resolve-projects'

const MAX_SEND_ITEMS = 30
const MAX_MESSAGE_LENGTH = 1000

interface SendItem extends ProjectItemRef {
  key: string
  message: string
  recipients: {
    client: boolean
    contractor: boolean
  }
}

interface RecipientResult {
  attempted: boolean
  ok: boolean
  description?: string
}

interface SendResult {
  key: string
  projectId: string | null
  projectName: string
  client: RecipientResult | null
  contractor: RecipientResult | null
}

type DispatchReservation =
  | { outcome: 'reserved' | 'rate_limited' | 'conflict' | 'in_progress' }
  | { outcome: 'replay'; status: 'completed' | 'failed'; result: unknown }

// sendTelegramMessage 기본 parse_mode가 HTML이므로 발송 전 특수문자를 이스케이프한다.
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function isSendItem(value: unknown): value is SendItem {
  if (
    !isProjectItemRef(value) ||
    !('key' in value) ||
    !('message' in value) ||
    !('recipients' in value)
  ) return false
  const message = typeof value.message === 'string' ? value.message.trim() : ''
  const recipients = value.recipients
  if (!recipients || typeof recipients !== 'object') return false
  const recipientSelection = recipients as Record<string, unknown>
  return (
    isCanonicalUuid(value.key) &&
    message.length > 0 &&
    message.length <= MAX_MESSAGE_LENGTH &&
    typeof recipientSelection.client === 'boolean' &&
    typeof recipientSelection.contractor === 'boolean' &&
    (recipientSelection.client || recipientSelection.contractor)
  )
}

function parseDispatchReservation(value: unknown): DispatchReservation | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  if (
    row.outcome === 'reserved' ||
    row.outcome === 'rate_limited' ||
    row.outcome === 'conflict' ||
    row.outcome === 'in_progress'
  ) {
    return { outcome: row.outcome }
  }
  if (
    row.outcome === 'replay' &&
    (row.status === 'completed' || row.status === 'failed') &&
    'result' in row
  ) {
    return { outcome: 'replay', status: row.status, result: row.result }
  }
  return null
}

function createPayloadHash(
  items: SendItem[],
  resolved: (ResolvedProject | null)[]
): string {
  const payload = {
    items: items.map((item, index) => ({
      project: resolved[index]?.id ?? item.projectName,
      key: item.key,
      message: item.message,
      recipients: item.recipients,
    })),
  }
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}

async function finishDispatch(
  supabase: Parameters<typeof resolveProjects>[0],
  requestId: string,
  status: 'completed' | 'failed',
  result: unknown
): Promise<void> {
  const { data, error } = await supabase.rpc('finish_tbm_telegram_dispatch', {
    p_request_id: requestId,
    p_status: status,
    p_result: result,
  })
  if (error || data !== true) {
    console.error('TBM 텔레그램 발송 예약 마감 오류:', { requestId, status, error, data })
    throw new Error('발송 예약을 마감하지 못했습니다.')
  }
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
    const requestId = input?.requestId
    const itemsValue = input?.items

    if (
      !isCanonicalUuid(requestId) ||
      !Array.isArray(itemsValue) ||
      itemsValue.length === 0 ||
      itemsValue.length > MAX_SEND_ITEMS ||
      !itemsValue.every(isSendItem)
    ) {
      return NextResponse.json(
        { error: 'requestId와 1~30개의 유효한 발송 항목이 필요합니다.' },
        { status: 400 }
      )
    }
    const items: SendItem[] = itemsValue.map((item) => ({
      ...item,
      projectName: item.projectName.trim(),
      message: item.message.trim(),
      recipients: {
        client: item.recipients.client,
        contractor: item.recipients.contractor,
      },
    }))
    if (new Set(items.map((item) => item.key)).size !== items.length) {
      return NextResponse.json(
        { error: '발송 항목의 key는 중복될 수 없습니다.' },
        { status: 400 }
      )
    }
    const resolved = await resolveProjects(authentication.supabase, items)
    const hasUnauthorizedProject = resolved.some(project => (
      project && !isOrganizationInUserScope(authentication.organizationScope, project)
    ))
    if (hasUnauthorizedProject) {
      return NextResponse.json(
        { error: '발송 권한이 없는 현장이 포함되어 있습니다.' },
        { status: 403 }
      )
    }
    const resolvedIds = resolved.flatMap((project) => project ? [project.id] : [])
    if (new Set(resolvedIds).size !== resolvedIds.length) {
      return NextResponse.json(
        { error: '동일한 프로젝트가 발송 항목에 중복되어 있습니다.' },
        { status: 400 }
      )
    }

    const payloadHash = createPayloadHash(items, resolved)
    const { data: reservationData, error: reservationError } = await authentication.supabase.rpc(
      'reserve_tbm_telegram_dispatch',
      { p_request_id: requestId, p_payload_hash: payloadHash }
    )
    if (reservationError) {
      console.error('TBM 텔레그램 발송 예약 오류:', { requestId, error: reservationError })
      throw new Error('발송 요청을 예약하지 못했습니다.')
    }
    const reservation = parseDispatchReservation(reservationData)
    if (!reservation) {
      console.error('TBM 텔레그램 발송 예약 응답 형식 오류:', { requestId, reservationData })
      throw new Error('발송 예약 응답을 확인할 수 없습니다.')
    }
    if (reservation.outcome === 'rate_limited') {
      return NextResponse.json(
        { error: '10분 동안 최대 2회만 발송할 수 있습니다.' },
        { status: 429 }
      )
    }
    if (reservation.outcome === 'conflict') {
      return NextResponse.json(
        { error: '같은 requestId가 다른 발송 내용에 사용되었습니다.' },
        { status: 409 }
      )
    }
    if (reservation.outcome === 'in_progress') {
      return NextResponse.json(
        { error: '동일한 발송 요청이 처리 중입니다.' },
        { status: 409 }
      )
    }
    if (reservation.outcome === 'replay') {
      return NextResponse.json(
        reservation.result,
        { status: reservation.status === 'completed' ? 200 : 500 }
      )
    }

    try {
      const results: SendResult[] = []

      // 텔레그램 rate limit을 고려해 항목별로 순차 발송한다. 개별 실패는 기록만 하고 계속 진행.
      for (const [index, item] of items.entries()) {
        const project = resolved[index]
        const message = escapeHtml(item.message)

        const client = item.recipients.client
          ? await sendToRecipient(project, project?.client_telegram_id, message)
          : null
        const contractor = item.recipients.contractor
          ? await sendToRecipient(project, project?.contractor_telegram_id, message)
          : null

        results.push({
          key: item.key,
          projectId: project?.id ?? null,
          projectName: project?.project_name ?? item.projectName,
          client,
          contractor,
        })
      }

      const responseBody = { success: true, results }
      await finishDispatch(
        authentication.supabase,
        requestId,
        'completed',
        responseBody
      )
      return NextResponse.json(responseBody)
    } catch (error) {
      console.error('TBM 텔레그램 예약 후 처리 오류:', { requestId, error })
      const failedResponse = {
        success: false,
        error: '발송 처리 중 오류가 발생해 동일 요청의 재발송을 차단했습니다.',
      }
      try {
        await finishDispatch(
          authentication.supabase,
          requestId,
          'failed',
          failedResponse
        )
      } catch (finishError) {
        console.error('TBM 텔레그램 실패 상태 저장 오류:', { requestId, finishError })
      }
      return NextResponse.json(failedResponse, { status: 500 })
    }
  } catch (error) {
    console.error('TBM 텔레그램 send API 오류:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
