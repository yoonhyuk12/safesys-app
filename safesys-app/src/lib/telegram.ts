/**
 * 텔레그램 메시지 발송 유틸리티
 *
 * 사용법:
 * - sendTelegramMessage(chatId, message) - 단일 메시지 발송
 * - sendProjectNotification(project, message) - 프로젝트 관련자에게 알림 발송
 */

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN

const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`

export interface TelegramResponse {
  ok: boolean
  result?: any
  description?: string
  error_code?: number
}

export interface SendMessageOptions {
  parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2'
  disable_notification?: boolean
  disable_web_page_preview?: boolean
}

/**
 * 텔레그램 메시지 발송
 * @param chatId - 수신자 채팅 ID
 * @param text - 발송할 메시지
 * @param options - 추가 옵션 (parse_mode 등)
 */
export async function sendTelegramMessage(
  chatId: string,
  text: string,
  options: SendMessageOptions = {}
): Promise<TelegramResponse> {
  if (!TELEGRAM_BOT_TOKEN) {
    console.error('TELEGRAM_BOT_TOKEN 환경변수가 설정되지 않았습니다.')
    return { ok: false, description: 'Bot token not configured' }
  }

  if (!chatId) {
    return { ok: false, description: 'Chat ID is required' }
  }

  const maxRetries = 2
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000)

      const response = await fetch(`${TELEGRAM_API_URL}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: options.parse_mode || 'HTML',
          disable_notification: options.disable_notification || false,
          disable_web_page_preview: options.disable_web_page_preview || true,
        }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      const result: TelegramResponse = await response.json()

      if (!result.ok) {
        console.error('텔레그램 발송 실패:', result.description)
      }

      return result
    } catch (error) {
      console.error(`텔레그램 API 호출 오류 (시도 ${attempt + 1}/${maxRetries + 1}):`, error)
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)))
        continue
      }
      return { ok: false, description: String(error) }
    }
  }

  return { ok: false, description: 'Max retries exceeded' }
}

/**
 * 여러 채팅 ID에 동시 메시지 발송
 * @param chatIds - 수신자 채팅 ID 배열
 * @param text - 발송할 메시지
 * @param options - 추가 옵션
 */
export async function sendTelegramMessageBulk(
  chatIds: string[],
  text: string,
  options: SendMessageOptions = {}
): Promise<{ chatId: string; result: TelegramResponse }[]> {
  const results = await Promise.all(
    chatIds
      .filter(id => id) // 빈 값 제외
      .map(async (chatId) => ({
        chatId,
        result: await sendTelegramMessage(chatId, text, options),
      }))
  )
  return results
}

/**
 * 프로젝트 관련 알림 발송 (발주청 + 시공사)
 * @param project - 프로젝트 정보 (client_telegram_id, contractor_telegram_id 포함)
 * @param message - 발송할 메시지
 * @param options - 추가 옵션
 */
export async function sendProjectNotification(
  project: {
    project_name?: string
    client_telegram_id?: string | null
    contractor_telegram_id?: string | null
  },
  message: string,
  options: SendMessageOptions = {}
): Promise<{
  client: TelegramResponse | null
  contractor: TelegramResponse | null
}> {
  const results = {
    client: null as TelegramResponse | null,
    contractor: null as TelegramResponse | null,
  }

  // 발주청에게 발송
  if (project.client_telegram_id) {
    results.client = await sendTelegramMessage(
      project.client_telegram_id,
      message,
      options
    )
  }

  // 시공사에게 발송
  if (project.contractor_telegram_id) {
    results.contractor = await sendTelegramMessage(
      project.contractor_telegram_id,
      message,
      options
    )
  }

  return results
}

/**
 * 안전점검 알림 메시지 생성
 */
export function createSafetyCheckMessage(params: {
  projectName: string
  checkType: '폭염점검' | '관리자점검' | '본부불시점검' | 'TBM안전점검'
  date: string
  status: '완료' | '미완료' | '점검필요'
  inspector?: string
  details?: string
}): string {
  const statusEmoji = {
    '완료': '✅',
    '미완료': '❌',
    '점검필요': '⚠️',
  }

  let message = `<b>🏗️ ${params.projectName}</b>\n\n`
  message += `📋 <b>점검유형:</b> ${params.checkType}\n`
  message += `📅 <b>점검일자:</b> ${params.date}\n`
  message += `${statusEmoji[params.status]} <b>상태:</b> ${params.status}\n`

  if (params.inspector) {
    message += `👤 <b>점검자:</b> ${params.inspector}\n`
  }

  if (params.details) {
    message += `\n📝 <b>세부사항:</b>\n${params.details}`
  }

  return message
}

/**
 * 일일 TBM 상태 알림 메시지 생성
 */
export function createTBMStatusMessage(params: {
  projectName: string
  date: string
  workers: number
  safetyItems: string[]
  weatherWarning?: string
}): string {
  let message = `<b>🏗️ ${params.projectName}</b>\n\n`
  message += `📅 <b>일자:</b> ${params.date}\n`
  message += `👷 <b>작업인원:</b> ${params.workers}명\n`

  if (params.weatherWarning) {
    message += `\n⚠️ <b>기상특보:</b> ${params.weatherWarning}\n`
  }

  if (params.safetyItems.length > 0) {
    message += `\n📋 <b>안전점검 항목:</b>\n`
    params.safetyItems.forEach((item, index) => {
      message += `  ${index + 1}. ${item}\n`
    })
  }

  return message
}

/**
 * 긴급 알림 메시지 생성
 */
export function createUrgentMessage(params: {
  projectName: string
  title: string
  content: string
}): string {
  return `🚨 <b>긴급 알림</b> 🚨\n\n` +
    `<b>🏗️ 현장:</b> ${params.projectName}\n\n` +
    `<b>📢 ${params.title}</b>\n\n` +
    `${params.content}`
}
