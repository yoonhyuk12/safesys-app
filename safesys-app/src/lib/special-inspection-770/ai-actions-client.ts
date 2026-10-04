// 다운로드에 필요한 경우에만 로그인 세션으로 특별점검 AI 조치문구를 요청한다.
export async function requestSpecial770Actions(inspectionId: string): Promise<unknown> {
  const { supabase } = await import('@/lib/supabase')
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session?.access_token) throw new Error('로그인이 필요합니다.')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 180_000)
  try {
    const response = await fetch('/api/ai/special-770-actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
      body: JSON.stringify({ inspectionId }),
      signal: controller.signal,
    })
    const fallback = response.ok
      ? 'AI 서버의 응답 형식이 올바르지 않습니다. 다시 시도해 주세요.'
      : `AI 요청에 실패했습니다(HTTP ${response.status}). 서버 상태를 확인한 뒤 다시 시도해 주세요.`
    let body: unknown
    try { body = await response.json() } catch { throw new Error(fallback) }
    if (!body || typeof body !== 'object') throw new Error(fallback)
    const result = body as { success?: unknown; error?: unknown; results?: unknown }
    if (!response.ok || result.success !== true) {
      throw new Error(typeof result.error === 'string' && result.error.trim() ? result.error : fallback)
    }
    return result.results
  } catch (error) {
    if (controller.signal.aborted) throw new Error('AI 조치문구 요청 시간이 초과되었습니다. 다시 시도해 주세요.')
    throw error
  } finally {
    clearTimeout(timer)
  }
}
