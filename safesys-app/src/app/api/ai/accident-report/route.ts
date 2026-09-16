// 사고보고 문서(PDF 원본·HWPX 추출 텍스트)를 Gemini로 읽어 사고 입력 초안 필드만 돌려주는 인증 라우트다. 저장은 하지 않는다.
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

import {
  ACCIDENT_EXTRACTION_RESPONSE_SCHEMA,
  ACCIDENT_EXTRACTION_SYSTEM_INSTRUCTION,
  ACCIDENT_IMPORT_PDF_MAX_BYTES,
  ACCIDENT_IMPORT_TEXT_MAX_CHARS,
  buildAccidentExtractionPrompt,
  extractGeminiJsonText,
  normalizeAccidentExtraction,
} from '@/lib/accident-report-extraction'
import { getAiModel } from '@/lib/ai-models'
import { recordAiUsage } from '@/lib/ai-usage-log'

const FEATURE_KEY = 'ai.accident-report'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Gemini 호출부터 본문 읽기까지 이 시간 안에 끝나야 한다. */
const REQUEST_TIMEOUT_MS = 60_000

/** 문서 한 건 분석은 몇 초가 걸린다. 사람이 손으로 올리는 속도를 막지 않는 값으로 잡는다. */
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_PER_WINDOW = 10
/** 한 사용자의 동시 요청은 1건만 처리한다. */
const MAX_CONCURRENT_PER_USER = 1

const MAX_OUTPUT_TOKENS = 4096

/** 사용자별 최근 요청 시각과 처리 중 건수. 인스턴스 메모리에만 둔다. */
interface UserRateState {
  timestamps: number[]
  inFlight: number
}

const rateStates = new Map<string, UserRateState>()

function rateStateOf(userId: string): UserRateState {
  const existing = rateStates.get(userId)
  if (existing) return existing
  const created: UserRateState = { timestamps: [], inFlight: 0 }
  rateStates.set(userId, created)
  return created
}

/** 한도 안이면 슬롯을 잡고 해제 함수를 돌려준다. 한도를 넘으면 null이다. */
function acquireSlot(userId: string): (() => void) | null {
  const now = Date.now()
  const state = rateStateOf(userId)
  state.timestamps = state.timestamps.filter((at) => now - at < RATE_LIMIT_WINDOW_MS)

  if (state.inFlight >= MAX_CONCURRENT_PER_USER) return null
  if (state.timestamps.length >= RATE_LIMIT_MAX_PER_WINDOW) return null

  state.timestamps.push(now)
  state.inFlight += 1

  let released = false
  return () => {
    if (released) return
    released = true
    state.inFlight = Math.max(0, state.inFlight - 1)
    if (state.inFlight === 0 && state.timestamps.length === 0) rateStates.delete(userId)
  }
}

function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ success: false, error: message }, { status })
}

interface GeminiPart {
  text?: string
  inlineData?: { mimeType: string; data: string }
}

/** PDF 첫 5바이트가 %PDF- 인지 본다 — 확장자만 바꾼 파일을 걸러낸다. */
function hasPdfSignature(bytes: Uint8Array): boolean {
  const signature = [0x25, 0x50, 0x44, 0x46, 0x2d]
  if (bytes.byteLength < signature.length) return false
  return signature.every((value, index) => bytes[index] === value)
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authorization = request.headers.get('authorization')
  const token = authorization?.match(/^Bearer ([^\s]+)$/)?.[1]
  if (!token) return jsonError('로그인이 필요합니다.', 401)

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('사고보고 자동 채움 API Supabase 환경변수가 설정되지 않았습니다.')
    return jsonError('서버 인증 설정을 확인해주세요.', 500)
  }

  // 사용자 JWT를 그대로 쓴다 — 현장 접근 여부는 RLS가 판단한다.
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  let userId = ''
  try {
    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data?.user) return jsonError('유효하지 않은 인증 토큰입니다.', 401)
    userId = data.user.id
  } catch {
    return jsonError('유효하지 않은 인증 토큰입니다.', 401)
  }

  const release = acquireSlot(userId)
  if (!release) {
    return jsonError('문서 분석 요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.', 429)
  }

  try {
    let formData: FormData
    try {
      formData = await request.formData()
    } catch {
      return jsonError('요청 형식이 올바르지 않습니다.', 400)
    }

    const projectId = String(formData.get('project_id') ?? '').trim()
    if (!UUID_PATTERN.test(projectId)) return jsonError('현장 정보가 올바르지 않습니다.', 400)

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .maybeSingle()

    if (projectError) {
      console.error('사고보고 자동 채움 현장 조회 실패', { status: projectError.code ?? null })
      return jsonError('현장 정보를 확인하지 못했습니다.', 500)
    }
    if (!project) return jsonError('이 현장에 접근할 수 없습니다.', 403)

    const rawFile = formData.get('file')
    const rawText = formData.get('text')
    const uploadedFile = rawFile && typeof rawFile !== 'string' ? (rawFile as Blob & { name?: string }) : null
    const documentText = typeof rawText === 'string' ? rawText : null

    if (uploadedFile && documentText !== null) {
      return jsonError('문서 파일과 추출 텍스트 중 하나만 보내야 합니다.', 400)
    }
    if (!uploadedFile && documentText === null) {
      return jsonError('분석할 문서가 없습니다.', 400)
    }

    const prompt = buildAccidentExtractionPrompt()
    const parts: GeminiPart[] = []

    if (uploadedFile) {
      const fileName = typeof uploadedFile.name === 'string' ? uploadedFile.name.toLowerCase() : ''
      if (uploadedFile.type !== 'application/pdf' && !fileName.endsWith('.pdf')) {
        return jsonError('PDF 파일만 업로드할 수 있습니다.', 400)
      }
      if (uploadedFile.size > ACCIDENT_IMPORT_PDF_MAX_BYTES) {
        return jsonError('PDF 크기가 4MB를 넘습니다.', 413)
      }

      const buffer = Buffer.from(await uploadedFile.arrayBuffer())
      if (!hasPdfSignature(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength))) {
        return jsonError('PDF 파일만 업로드할 수 있습니다.', 400)
      }

      parts.push({ inlineData: { mimeType: 'application/pdf', data: buffer.toString('base64') } })
      parts.push({ text: prompt })
    } else {
      const text = (documentText ?? '').trim()
      if (!text) return jsonError('문서에서 읽을 내용이 없습니다.', 400)
      if (text.length > ACCIDENT_IMPORT_TEXT_MAX_CHARS) {
        return jsonError('문서 내용이 너무 깁니다.', 413)
      }
      parts.push({ text: `${prompt}\n\n# 문서 본문\n${text}` })
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) return jsonError('AI API 키가 설정되지 않았습니다.', 500)

    const model = await getAiModel(FEATURE_KEY)
    const startedAt = Date.now()
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    let result: unknown
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: ACCIDENT_EXTRACTION_SYSTEM_INSTRUCTION }] },
            contents: [{ role: 'user', parts }],
            generationConfig: {
              temperature: 0.1,
              responseMimeType: 'application/json',
              responseSchema: ACCIDENT_EXTRACTION_RESPONSE_SCHEMA,
              maxOutputTokens: MAX_OUTPUT_TOKENS,
            },
          }),
          signal: controller.signal,
        }
      )

      if (!response.ok) {
        // 문서 본문은 어떤 경우에도 로그에 남기지 않는다 — 상태코드만 남긴다.
        console.error('사고보고 자동 채움 Gemini 오류', { status: response.status })
        recordAiUsage({
          featureKey: FEATURE_KEY,
          provider: 'Google',
          model,
          success: false,
          errorMessage: `HTTP ${response.status}`,
          durationMs: Date.now() - startedAt,
          userId,
          projectId,
        })
        return jsonError(`AI 서버가 오류를 반환했습니다. (HTTP ${response.status})`, 502)
      }

      result = await response.json()
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError'
      recordAiUsage({
        featureKey: FEATURE_KEY,
        provider: 'Google',
        model,
        success: false,
        errorMessage: aborted ? '요청 시간 초과' : '네트워크 오류',
        durationMs: Date.now() - startedAt,
        userId,
        projectId,
      })
      return aborted
        ? jsonError('문서 분석 시간이 초과되었습니다.', 504)
        : jsonError('AI 서버에 연결하지 못했습니다.', 502)
    } finally {
      clearTimeout(timeoutId)
    }

    recordAiUsage({
      featureKey: FEATURE_KEY,
      provider: 'Google',
      model,
      response: result,
      durationMs: Date.now() - startedAt,
      userId,
      projectId,
    })

    const jsonText = extractGeminiJsonText(result)
    if (!jsonText) return jsonError('AI 응답을 해석하지 못했습니다.', 502)

    let parsed: unknown
    try {
      parsed = JSON.parse(jsonText)
    } catch {
      return jsonError('AI 응답을 해석하지 못했습니다.', 502)
    }

    const { fields, warnings } = normalizeAccidentExtraction(parsed)

    const finishReason = (result as { candidates?: Array<{ finishReason?: unknown }> })?.candidates?.[0]
      ?.finishReason
    if (finishReason === 'MAX_TOKENS') {
      warnings.unshift('문서가 길어 일부 항목이 채워지지 않았을 수 있습니다.')
    }

    return NextResponse.json({ success: true, fields, warnings, model })
  } catch (error) {
    console.error('사고보고 자동 채움 오류', error instanceof Error ? error.name : 'unknown')
    return jsonError('서버 오류가 발생했습니다.', 500)
  } finally {
    release()
  }
}
