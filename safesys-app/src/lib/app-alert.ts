// AI CCTV 알림앱(aicctvalert) send-alert Edge Function 발송 유틸리티 (텔레그램과 병행 발송용)

const AICCTV_ALERT_FUNCTION_URL = process.env.AICCTV_ALERT_FUNCTION_URL

const AICCTV_ALERT_ANON_KEY = process.env.AICCTV_ALERT_ANON_KEY

export interface AppAlertResponse {
  ok: boolean
  description?: string
}

/**
 * 텔레그램 HTML 메시지를 태그 제거한 plain text로 변환한다.
 * <b> <i> <code> <a> 등 태그 제거 + 기본 엔티티(&lt; &gt; &amp;) 복원.
 * @param text - 텔레그램용 HTML 메시지
 */
export function stripTelegramHtml(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

/**
 * 알림앱 단일 개인코드 발송
 * @param targetCode - 수신자 앱 개인코드 (1개)
 * @param message - 발송할 plain text 메시지
 * @param projectName - 알림 제목으로 표시될 프로젝트명
 * @param imageBase64 - 첨부 이미지(JPEG 권장) base64 — Edge Function이 스토리지 업로드 후 푸시에 포함
 */
export async function sendAppAlert(
  targetCode: string,
  message: string,
  projectName?: string,
  imageBase64?: string
): Promise<AppAlertResponse> {
  if (!AICCTV_ALERT_FUNCTION_URL || !AICCTV_ALERT_ANON_KEY) {
    console.warn('AICCTV_ALERT 환경변수가 설정되지 않았습니다. 앱 알림을 건너뜁니다.')
    return { ok: false, description: '앱 알림 미설정' }
  }

  if (!targetCode) {
    return { ok: false, description: 'Target code is required' }
  }

  const maxRetries = 2
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000)

      const response = await fetch(AICCTV_ALERT_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${AICCTV_ALERT_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          target_code: targetCode,
          camera_name: projectName || '안전관리시스템',
          detection_type: '안전알림',
          message,
          source_device: 'SafeSys',
          ...(imageBase64 ? { image_base64: imageBase64 } : {}),
        }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      const result = await response.json() as {
        success?: boolean
        error?: string
        fcm_debug?: { error?: string }
      }

      if (!result.success) {
        console.error('앱 알림 발송 실패:', result.error)
        return { ok: false, description: result.error || '앱 알림 발송 실패' }
      }

      // DB 저장은 성공해도 수신 등록 기기가 없으면 실제로는 도달하지 않는다
      if (result.fcm_debug?.error === 'No FCM tokens found for target') {
        return { ok: false, description: '수신 등록된 앱 기기가 없습니다. 개인코드를 확인해주세요.' }
      }

      return { ok: true }
    } catch (error) {
      console.error(`앱 알림 API 호출 오류 (시도 ${attempt + 1}/${maxRetries + 1}):`, error)
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
 * 쉼표 구분 개인코드 목록에 병렬 발송
 * @param codesCsv - 쉼표 구분 개인코드 문자열
 * @param message - 발송할 plain text 메시지
 * @param projectName - 알림 제목으로 표시될 프로젝트명
 * @param imageBase64 - 첨부 이미지 base64 (선택)
 */
export async function sendAppAlertBulk(
  codesCsv: string | null | undefined,
  message: string,
  projectName?: string,
  imageBase64?: string
): Promise<AppAlertResponse[]> {
  const codes = (codesCsv ?? '')
    .split(',')
    .map(code => code.trim())
    .filter(Boolean)

  if (codes.length === 0) return []

  return Promise.all(
    codes.map(code => sendAppAlert(code, message, projectName, imageBase64))
  )
}

/**
 * 프로젝트 관련 앱 알림 발송 (발주청 + 시공사)
 * message는 이 함수 안에서 stripTelegramHtml로 plain text 변환된다.
 * @param project - 프로젝트 정보 (client_app_code, contractor_app_code 포함)
 * @param message - 발송할 메시지 (텔레그램 HTML 형식 허용)
 */
export async function sendProjectAppNotification(
  project: {
    project_name?: string
    client_app_code?: string | null
    contractor_app_code?: string | null
  },
  message: string
): Promise<{
  client: AppAlertResponse[]
  contractor: AppAlertResponse[]
}> {
  const plainMessage = stripTelegramHtml(message)

  const [client, contractor] = await Promise.all([
    sendAppAlertBulk(project.client_app_code, plainMessage, project.project_name),
    sendAppAlertBulk(project.contractor_app_code, plainMessage, project.project_name),
  ])

  return { client, contractor }
}
