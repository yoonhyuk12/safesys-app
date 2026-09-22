// 패트롤 점검 엑셀의 조치내용(재발방지대책)·재해유형을 원본 점검에서 생성하는 인증 라우트다.
import { NextRequest, NextResponse } from 'next/server'

import { recordAiUsage } from '@/lib/ai-usage-log'
import { headquartersFindingTypeLabel } from '@/lib/inspection/headquarters-finding-type'
import { isOrganizationInUserScope } from '@/lib/organization-scope'
import {
  PATROL_DISASTER_TYPES,
  PATROL_MAX_AI_ITEMS,
  normalizePatrolDisasterType,
} from '@/lib/patrol-inspection-utils'
import { supabaseAdmin } from '@/lib/supabase-admin'

const OPENAI_API_KEY = process.env.OPENAI_API_KEY

/** 이 기능은 모델을 고정한다 — 관리자 설정으로 바뀌지 않는다. */
const PATROL_AI_MODEL = 'gpt-6-luna'
const FEATURE_KEY = 'ai.patrol-inspection'

/**
 * 응답을 만들기에 충분한 출력 토큰을 건수에 비례해 잡는다.
 * low 추론 토큰도 이 한도에 함께 계산되므로 20건(16,000)까지 본문이 잘리지 않도록 여유를 둔다.
 */
const BASE_COMPLETION_TOKENS = 4000
const COMPLETION_TOKENS_PER_ITEM = 600

/** 요청 본문 상한 — 점검 id 20개면 1KB 남짓이라 넉넉한 값이다. */
const MAX_BODY_BYTES = 64 * 1024

/** OpenAI 호출부터 본문 읽기까지 이 시간 안에 끝나야 한다. */
const REQUEST_TIMEOUT_MS = 60_000

/** 프롬프트에 넣는 지적내용 한 건의 글자 상한. */
const MAX_ISSUE_CHARS = 400
/** 프롬프트로 요청하는 조치내용 권장 길이. 받은 응답을 이 길이로 자르지는 않는다. */
const MAX_ACTION_CHARS = 120

/** 1,000건을 20건씩 나누면 50회다. 정상적인 한 번의 다운로드를 스스로 막지 않는 값으로 잡는다. */
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_PER_WINDOW = 60
/** 한 사용자의 동시 요청은 1건만 처리한다 — 엑셀은 배치를 순차로 보낸다. */
const MAX_CONCURRENT_PER_USER = 1

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface PatrolAiResult {
  action: string
  disasterType: string
}

interface PatrolAiResponse {
  success: boolean
  results?: Record<string, PatrolAiResult>
  error?: string
}

interface PatrolRouteProject {
  project_name?: string | null
  managing_hq?: string | null
  managing_branch?: string | null
}

interface OriginalInspectionRow {
  id: string
  inspection_date?: string | null
  issue_content1?: string | null
  issue_content2?: string | null
  finding_type?: string | null
  projects?: PatrolRouteProject | PatrolRouteProject[] | null
}

interface OriginalInspection {
  id: string
  inspectionDate: string
  projectName: string
  findingTypeLabel: string
  issue1: string
  issue2: string
}

/** 사용자별 최근 요청 시각과 처리 중 건수. 인스턴스 메모리에만 두고 DB를 늘리지 않는다. */
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
    // 오래 쓰지 않는 사용자 항목은 남겨두지 않는다.
    if (state.inFlight === 0 && state.timestamps.length === 0) rateStates.delete(userId)
  }
}

function clip(value: unknown, limit: number): string {
  const text = typeof value === 'string' ? value.trim() : ''
  return text.length > limit ? text.slice(0, limit) : text
}

function jsonError(message: string, status: number): NextResponse<PatrolAiResponse> {
  return NextResponse.json<PatrolAiResponse>({ success: false, error: message }, { status })
}

/** 응답 형식을 모델이 지키도록 strict json_schema 로 고정한다. */
function responseFormat() {
  return {
    type: 'json_schema',
    json_schema: {
      name: 'patrol_inspection_results',
      strict: true,
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['results'],
        properties: {
          results: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['id', 'action', 'disasterType'],
              properties: {
                id: { type: 'string' },
                action: { type: 'string' },
                disasterType: { type: 'string', enum: [...PATROL_DISASTER_TYPES] },
              },
            },
          },
        },
      },
    },
  }
}

function buildPrompt(items: OriginalInspection[]): string {
  const listed = items
    .map((item, index) => {
      const lines = [
        `${index + 1}) id=${item.id}`,
        `   점검일: ${item.inspectionDate}`,
        `   사업명: ${item.projectName || '미기재'}`,
        `   지적유형: ${item.findingTypeLabel || '미기재'}`,
        `   지적내용1: ${item.issue1 || '미기재'}`,
      ]
      if (item.issue2) lines.push(`   지적내용2: ${item.issue2}`)
      return lines.join('\n')
    })
    .join('\n\n')

  return `건설현장 패트롤 점검에서 지적된 사항 ${items.length}건에 대해 "재발방지대책"과 "재해유형"을 작성합니다.

[점검 목록]
${listed}

[작성 규칙]
- 조치내용은 앞으로 같은 지적이 되풀이되지 않도록 하는 재발방지대책으로 씁니다.
- 실제로 조치가 이행되었는지는 알 수 없습니다. "조치 완료", "시정하였음"처럼 이행 사실을 단정하는 표현을 절대 쓰지 않습니다.
- 한 건당 한국어 40~${MAX_ACTION_CHARS}자 이내의 한 문장으로 쓰고, 줄바꿈을 넣지 않습니다.
- 지적내용에 없는 장비·인원·날짜를 지어내지 않습니다.
- 재해유형은 지적내용에서 예상되는 사고 유형을 다음 목록에서 하나만 고릅니다: ${PATROL_DISASTER_TYPES.join(', ')}
- 판단이 어려우면 재해유형은 "기타"로 합니다.

[엄수]
- results 배열에 목록의 ${items.length}건을 id 그대로, 중복 없이 빠짐없이 담습니다.
- id 를 새로 만들거나 바꾸지 않습니다.`
}

/**
 * 모델 응답을 요청 목록과 정확히 대조한다.
 * 잘린 JSON·빈 값·중복·누락·요청 밖 id 는 모두 실패로 보고 부분 성공을 만들지 않는다.
 */
function parseResults(
  content: string,
  items: OriginalInspection[]
): { results: Record<string, PatrolAiResult> } | { error: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return { error: 'AI 응답이 온전한 JSON이 아닙니다.' }
  }

  const root = (parsed ?? {}) as Record<string, unknown>
  if (!Array.isArray(root.results)) return { error: 'AI 응답에 결과 배열이 없습니다.' }

  const allowedIds = new Set(items.map((item) => item.id))
  const results: Record<string, PatrolAiResult> = {}

  for (const entry of root.results) {
    if (typeof entry !== 'object' || entry === null) return { error: 'AI 응답 항목 형식이 올바르지 않습니다.' }
    const row = entry as Record<string, unknown>

    const id = typeof row.id === 'string' ? row.id.trim() : ''
    if (!allowedIds.has(id)) return { error: 'AI 응답에 요청하지 않은 점검이 들어 있습니다.' }
    if (results[id]) return { error: 'AI 응답에 같은 점검이 중복으로 들어 있습니다.' }

    // 길이로 자르면 문장이 중간에 끊기므로 줄바꿈만 공백으로 정리하고 원문을 보존한다.
    const action =
      typeof row.action === 'string' ? row.action.replace(/\s*\n+\s*/g, ' ').trim() : ''
    if (!action) return { error: 'AI가 일부 지적의 조치내용을 비워 두었습니다.' }

    results[id] = { action, disasterType: normalizePatrolDisasterType(row.disasterType) }
  }

  if (Object.keys(results).length !== items.length) {
    return { error: 'AI 응답에 일부 점검이 빠져 있습니다.' }
  }

  return { results }
}

export async function POST(request: NextRequest): Promise<NextResponse<PatrolAiResponse>> {
  const authorization = request.headers.get('authorization')
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!token) return jsonError('로그인이 필요합니다.', 401)

  let user: { id: string } | null = null
  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token)
    if (error || !data?.user) return jsonError('인증에 실패했습니다.', 401)
    user = data.user
  } catch {
    return jsonError('인증에 실패했습니다.', 401)
  }

  const release = acquireSlot(user.id)
  if (!release) {
    return jsonError('AI 작성 요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.', 429)
  }

  try {
    if (!OPENAI_API_KEY) return jsonError('AI API 키가 설정되지 않았습니다.', 500)

    const rawBody = await request.text()
    if (rawBody.length > MAX_BODY_BYTES) {
      return jsonError('요청 본문이 너무 큽니다.', 413)
    }

    let body: { inspectionIds?: unknown } | null = null
    try {
      body = JSON.parse(rawBody) as { inspectionIds?: unknown }
    } catch {
      return jsonError('요청 형식이 올바르지 않습니다.', 400)
    }

    if (!Array.isArray(body?.inspectionIds)) return jsonError('점검 id 목록이 필요합니다.', 400)

    const rawIds = body.inspectionIds
    if (rawIds.length === 0) return jsonError('점검 id 목록이 필요합니다.', 400)
    if (rawIds.length > PATROL_MAX_AI_ITEMS) {
      return jsonError(`한 번에 ${PATROL_MAX_AI_ITEMS}건까지만 요청할 수 있습니다.`, 400)
    }
    if (!rawIds.every((id) => typeof id === 'string' && UUID_PATTERN.test(id.trim()))) {
      return jsonError('점검 id 형식이 올바르지 않습니다.', 400)
    }

    const requestedIds = Array.from(new Set(rawIds.map((id) => (id as string).trim())))

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .select('role, hq_division, branch_division')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError || !profile) return jsonError('사용자 정보를 확인할 수 없습니다.', 403)
    // 이 기능은 발주청 전용 화면에서만 쓴다.
    if (profile.role !== '발주청') return jsonError('조회 권한이 없습니다.', 403)

    // 클라이언트가 보낸 내용은 신뢰하지 않고 원본 점검을 서버에서 다시 읽는다.
    const { data: rows, error: loadError } = await supabaseAdmin
      .from('headquarters_inspections')
      .select(`
        id,
        inspection_date,
        issue_content1,
        issue_content2,
        patrol_car_used,
        finding_type,
        projects!inner ( project_name, managing_hq, managing_branch )
      `)
      .in('id', requestedIds)
      .eq('patrol_car_used', true)

    if (loadError) return jsonError('점검 원본을 불러오지 못했습니다.', 500)

    const loadedRows = (rows ?? []) as unknown as OriginalInspectionRow[]
    const loadedIds = new Set(loadedRows.map((row) => row.id))
    // 삭제되었거나 패트롤이 아닌 id가 하나라도 섞이면 AI를 부르기 전에 멈춘다.
    if (loadedIds.size !== requestedIds.length || requestedIds.some((id) => !loadedIds.has(id))) {
      return jsonError('요청한 패트롤 점검을 모두 찾지 못했습니다.', 404)
    }

    const items: OriginalInspection[] = []
    for (const row of loadedRows) {
      const project = (Array.isArray(row.projects) ? row.projects[0] : row.projects) ?? {}
      // 관할 밖 점검은 조용히 제외하지 않고 요청 전체를 거절한다.
      if (!isOrganizationInUserScope(profile, {
        managing_hq: project.managing_hq,
        managing_branch: project.managing_branch,
      })) {
        return jsonError('조회 권한이 없는 점검이 포함되어 있습니다.', 403)
      }

      items.push({
        id: row.id,
        inspectionDate: clip(row.inspection_date, 20),
        projectName: clip(project.project_name, 100),
        findingTypeLabel: headquartersFindingTypeLabel(row.finding_type),
        issue1: clip(row.issue_content1, MAX_ISSUE_CHARS),
        issue2: clip(row.issue_content2, MAX_ISSUE_CHARS),
      })
    }

    const startedAt = Date.now()
    const controller = new AbortController()
    // 본문 읽기까지 같은 타임아웃 안에서 끝나야 한다.
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    let data: unknown
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: PATROL_AI_MODEL,
          messages: [
            {
              role: 'system',
              content:
                '당신은 한국 건설현장 안전관리 실무자입니다. 패트롤 점검 지적사항을 읽고 재발방지대책과 예상 재해유형을 작성합니다. 조치가 이미 이행되었다고 단정하지 않으며, 주어진 지적내용에 없는 사실을 만들어내지 않습니다.',
            },
            { role: 'user', content: buildPrompt(items) },
          ],
          reasoning_effort: 'low',
          max_completion_tokens: BASE_COMPLETION_TOKENS + items.length * COMPLETION_TOKENS_PER_ITEM,
          response_format: responseFormat(),
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        recordAiUsage({
          featureKey: FEATURE_KEY,
          provider: 'OpenAI',
          model: PATROL_AI_MODEL,
          success: false,
          errorMessage: `HTTP ${response.status}`,
          durationMs: Date.now() - startedAt,
          userId: user.id,
        })
        return jsonError('AI 작성 중 오류가 발생했습니다.', 502)
      }

      data = await response.json()
    } catch {
      recordAiUsage({
        featureKey: FEATURE_KEY,
        provider: 'OpenAI',
        model: PATROL_AI_MODEL,
        success: false,
        errorMessage: '요청 시간 초과 또는 네트워크 오류',
        durationMs: Date.now() - startedAt,
        userId: user.id,
      })
      return jsonError('AI 응답이 지연되어 중단했습니다. 잠시 후 다시 시도해 주세요.', 504)
    } finally {
      clearTimeout(timeoutId)
    }

    recordAiUsage({
      featureKey: FEATURE_KEY,
      provider: 'OpenAI',
      model: PATROL_AI_MODEL,
      response: data,
      durationMs: Date.now() - startedAt,
      userId: user.id,
    })

    const choice = (data as { choices?: Array<{ message?: { content?: unknown }; finish_reason?: string }> })
      ?.choices?.[0]
    // 길이 제한으로 끊긴 응답은 JSON 파싱 전에 걸러 부분 결과를 만들지 않는다.
    if (choice?.finish_reason && choice.finish_reason !== 'stop') {
      return jsonError('AI 응답이 완성되지 않았습니다. 잠시 후 다시 시도해 주세요.', 502)
    }

    const content = choice?.message?.content
    if (typeof content !== 'string' || !content.trim()) {
      return jsonError('AI 응답을 받지 못했습니다.', 502)
    }

    const parsed = parseResults(content, items)
    if ('error' in parsed) return jsonError(parsed.error, 502)

    return NextResponse.json<PatrolAiResponse>({ success: true, results: parsed.results })
  } catch (error) {
    console.error('패트롤 점검 AI 작성 오류:', error)
    return jsonError('서버 오류가 발생했습니다.', 500)
  } finally {
    release()
  }
}
