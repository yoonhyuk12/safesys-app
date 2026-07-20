// 프로젝트 현장 AI 비서의 브리핑·대화·안전문서 조회를 제공하는 서버 라우트

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import {
  getUnsignedSupervisorDetails,
  type UnsignedTargetDetail,
} from '@/lib/bulk-sign/unsigned-supervisor-details'
import { PROJECT_ROUTE_MAP } from '@/lib/project-assistant/route-map'

const OPENAI_MODEL = 'gpt-5.6-luna'
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'
const MAX_TOOL_ROUNDS = 5
const DEFAULT_QUERY_LIMIT = 20
const MAX_QUERY_LIMIT = 50
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const COLUMN_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/

const PROJECT_TABLE_DATE_COLUMNS = {
  tbm_submissions: 'meeting_date',
  inspection_requests: 'request_date',
  ptw_permits: 'permit_date',
  safety_inspections: 'inspection_date',
  manager_inspections: 'inspection_date',
  headquarters_inspections: 'inspection_date',
  corrective_action_issues: 'inspection_date',
  quality_test_records: 'test_date',
  quality_verification_requests: 'request_date',
  quality_summary_reports: 'report_date',
  inspection_visit_logs: 'visit_date',
  heat_wave_checks: 'check_time',
  new_worker_orientations: 'orientation_date',
  work_daily_reports: 'report_date',
} as const

type ProjectTable = keyof typeof PROJECT_TABLE_DATE_COLUMNS
type ChatRole = 'user' | 'assistant'

interface ConversationMessage {
  role: ChatRole
  content: string
}

interface ProjectRow {
  id: string
  project_name: string
}

interface TodayTbmRow {
  id: string
  construction_company: string | null
  today_work: string | null
  personnel_count: string | null
  personnel_total_count: number | null
  equipment_input: string | null
  risk_work_type: string | null
  new_worker_count: string | number | null
  education_start_time: string | null
  reporter_name: string | null
  status: string | null
}

interface BriefingContext {
  project: ProjectRow
  today: string
  todayTbm: TodayTbmRow[]
  unsignedDetails: UnsignedTargetDetail[]
}

interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

interface OpenAIMessage {
  role: 'developer' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
}

interface OpenAIResponse {
  choices?: Array<{ message?: OpenAIMessage }>
}

interface QueryProjectTableArgs {
  table: ProjectTable
  columns: string[]
  date_from?: string
  date_to?: string
  limit: number
}

class ProjectNotFoundError extends Error {}

class OpenAIRequestError extends Error {}

let authSupabase: SupabaseClient | null = null
let adminSupabase: SupabaseClient | null = null

function getAuthSupabase(): SupabaseClient {
  if (!authSupabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !anonKey) throw new Error('Supabase 인증 환경 변수가 없습니다.')
    authSupabase = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return authSupabase
}

function getAdminSupabase(): SupabaseClient {
  if (!adminSupabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !serviceRoleKey) throw new Error('Supabase 관리자 환경 변수가 없습니다.')
    adminSupabase = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return adminSupabase
}

function getBearerToken(request: NextRequest): string | null {
  return request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null
}

async function isValidToken(token: string): Promise<boolean> {
  const { data: { user }, error } = await getAuthSupabase().auth.getUser(token)
  return !error && Boolean(user)
}

async function getProject(client: SupabaseClient, projectId: string): Promise<ProjectRow> {
  const { data, error } = await client
    .from('projects')
    .select('id, project_name')
    .eq('id', projectId)
    .single<ProjectRow>()

  if (error?.code === 'PGRST116') throw new ProjectNotFoundError()
  if (error) throw error
  if (!data) throw new ProjectNotFoundError()
  return data
}

const TBM_COLUMNS = [
  'id', 'construction_company', 'today_work', 'personnel_count',
  'personnel_total_count', 'equipment_input', 'risk_work_type',
  'new_worker_count', 'education_start_time', 'reporter_name', 'status',
].join(', ')

async function getTodayTbm(
  client: SupabaseClient,
  projectId: string,
  projectName: string,
  today: string
): Promise<TodayTbmRow[]> {
  const [directResult, legacyResult] = await Promise.all([
    client.from('tbm_submissions').select(TBM_COLUMNS)
      .eq('project_id', projectId).eq('meeting_date', today),
    client.from('tbm_submissions').select(TBM_COLUMNS)
      .is('project_id', null).eq('project_name', projectName).eq('meeting_date', today),
  ])

  if (directResult.error) throw directResult.error
  if (legacyResult.error) throw legacyResult.error
  const combinedRows: unknown = [...(directResult.data || []), ...(legacyResult.data || [])]
  const rows = combinedRows as TodayTbmRow[]
  return rows.filter((row, index, allRows) =>
    allRows.findIndex((candidate) => candidate.id === row.id) === index
  )
}

async function getBriefingContext(
  client: SupabaseClient,
  projectId: string
): Promise<BriefingContext> {
  const project = await getProject(client, projectId)
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
  const [todayTbm, unsignedDetails] = await Promise.all([
    getTodayTbm(client, projectId, project.project_name, today),
    getUnsignedSupervisorDetails(client, projectId),
  ])
  return { project, today, todayTbm, unsignedDetails }
}

function buildSystemPrompt(context: BriefingContext, mode: 'briefing' | 'chat'): string {
  const modeInstructions = mode === 'briefing'
    ? `브리핑 지침:
1. 오늘 TBM이 있으면 업체별 작업내용·인원·장비·위험공종을 브리핑하세요.
2. 오늘 TBM이 없으면 반드시 "오늘 TBM이 아직 입력되지 않았습니다"라고 안내하세요.
3. 감독 미서명 문서를 문서종류별 건수와 함께 안내하세요.
4. 감독 미서명 문서가 모두 0건이면 "모두 서명 완료"라고 격려하세요.
5. 짧고 스캔 가능한 형식으로 작성하세요.`
    : `대화 지침:
1. 아래 현장 데이터를 우선 근거로 답변하세요.
2. 추가 현장 기록이 필요하면 query_project_table 도구를 사용하세요.
3. 도구 결과에도 없는 내용은 현재 데이터에서 확인할 수 없다고 안내하세요.
4. 사용자가 화면 위치나 이동 방법을 물으면 아래 화면 목록에서 찾아 마크다운 링크 [화면명](/project/${context.project.id}/세그먼트) 형식으로 정확한 경로를 답변에 포함하세요.
5. 화면 목록에 없는 화면은 링크를 만들지 말고 해당 화면은 안내할 수 없다고 답하세요.

화면 목록(화면명 → 세그먼트):
${PROJECT_ROUTE_MAP.map((route) => `- ${route.label} → ${route.segment}`).join('\n')}`

  const data = {
    기준일: context.today,
    프로젝트: context.project,
    오늘_TBM: context.todayTbm,
    감독_미서명_문서: context.unsignedDetails,
  }

  return `당신은 이 현장(${context.project.project_name})의 안전관리 비서입니다.
한국어로 간결하게 응답하고, 제공된 데이터만 근거로 사용하세요.
데이터에 없는 내용을 추측하거나 지어내지 마세요.

${modeInstructions}

현장 데이터:
${JSON.stringify(data, null, 2)}`
}

const QUERY_PROJECT_TABLE_TOOL = {
  type: 'function',
  function: {
    name: 'query_project_table',
    description: '현재 프로젝트에 속한 안전·품질·작업 기록을 조회합니다.',
    parameters: {
      type: 'object',
      properties: {
        table: {
          type: 'string',
          enum: Object.keys(PROJECT_TABLE_DATE_COLUMNS),
          description: '조회할 프로젝트 종속 테이블',
        },
        columns: {
          type: 'array',
          items: { type: 'string' },
          description: '조회할 컬럼 목록. 생략하면 전체 컬럼을 조회합니다.',
        },
        date_from: { type: 'string', description: '조회 시작일(YYYY-MM-DD)' },
        date_to: { type: 'string', description: '조회 종료일(YYYY-MM-DD)' },
        limit: { type: 'number', default: DEFAULT_QUERY_LIMIT, maximum: MAX_QUERY_LIMIT },
      },
      required: ['table'],
      additionalProperties: false,
    },
  },
}

function parseQueryArgs(rawArguments: string): QueryProjectTableArgs {
  const raw = JSON.parse(rawArguments) as Record<string, unknown>
  const tables = Object.keys(PROJECT_TABLE_DATE_COLUMNS) as ProjectTable[]
  if (!tables.includes(raw.table as ProjectTable)) throw new Error('허용되지 않은 테이블입니다.')

  const columns = Array.isArray(raw.columns)
    ? raw.columns.filter((column): column is string =>
      typeof column === 'string' && COLUMN_PATTERN.test(column)
    ).slice(0, 30)
    : []
  const dateFrom = typeof raw.date_from === 'string' && DATE_PATTERN.test(raw.date_from)
    ? raw.date_from : undefined
  const dateTo = typeof raw.date_to === 'string' && DATE_PATTERN.test(raw.date_to)
    ? raw.date_to : undefined
  const requestedLimit = typeof raw.limit === 'number' && Number.isFinite(raw.limit)
    ? Math.floor(raw.limit) : DEFAULT_QUERY_LIMIT

  return {
    table: raw.table as ProjectTable,
    columns,
    date_from: dateFrom,
    date_to: dateTo,
    limit: Math.min(MAX_QUERY_LIMIT, Math.max(1, requestedLimit)),
  }
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.length > 300 ? `${value.slice(0, 300)}…` : value
  }
  if (Array.isArray(value)) return value.map(sanitizeValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !/(signature|photo|image)/i.test(key))
        .map(([key, nestedValue]) => [key, sanitizeValue(nestedValue)])
    )
  }
  return value
}

function sanitizeRow(row: Record<string, unknown>): Record<string, unknown> {
  return sanitizeValue(row) as Record<string, unknown>
}

async function queryProjectTable(
  client: SupabaseClient,
  projectId: string,
  rawArguments: string
): Promise<string> {
  try {
    const args = parseQueryArgs(rawArguments)
    const dateColumn = PROJECT_TABLE_DATE_COLUMNS[args.table] ?? 'created_at'
    let query = client.from(args.table)
      .select(args.columns.length > 0 ? args.columns.join(', ') : '*')
      .eq('project_id', projectId)

    if (args.date_from) query = query.gte(dateColumn, args.date_from)
    if (args.date_to) query = query.lte(dateColumn, args.date_to)
    const { data, error } = await query
      .order(dateColumn, { ascending: false })
      .limit(args.limit)
    if (error) throw error

    const rows = (data || []) as unknown as Array<Record<string, unknown>>
    return JSON.stringify({ table: args.table, rows: rows.map(sanitizeRow) })
  } catch (error) {
    console.error('프로젝트 테이블 도구 조회 실패:', error)
    return JSON.stringify({ error: '요청한 프로젝트 데이터를 조회하지 못했습니다.' })
  }
}

function getOpenAIErrorMessage(status: number): string {
  if (status === 401 || status === 403) {
    return 'OpenAI API 키가 유효하지 않습니다. 키를 확인해주세요.'
  }
  if (status === 429) return 'API 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.'
  if (status >= 500) return 'OpenAI 서버 오류가 발생했습니다.'
  return 'AI 응답 생성에 실패했습니다.'
}

async function requestOpenAI(
  messages: OpenAIMessage[],
  options?: { tools?: unknown[]; toolChoice?: 'auto' | 'none' }
): Promise<OpenAIMessage> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new OpenAIRequestError('OpenAI API 키가 설정되지 않았습니다.')

  const body: Record<string, unknown> = {
    model: OPENAI_MODEL,
    messages,
    reasoning_effort: 'none',
    max_completion_tokens: 8192,
  }
  if (options?.tools) body.tools = options.tools
  if (options?.toolChoice) body.tool_choice = options.toolChoice

  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    console.error('OpenAI API Error:', response.status, errorData)
    throw new OpenAIRequestError(getOpenAIErrorMessage(response.status))
  }

  const data = await response.json() as OpenAIResponse
  const message = data.choices?.[0]?.message
  if (!message) throw new OpenAIRequestError('AI 응답을 생성하지 못했습니다.')
  return message
}

async function generateBriefing(systemPrompt: string): Promise<string> {
  const message = await requestOpenAI([
    { role: 'developer', content: systemPrompt },
    { role: 'user', content: '오늘 현장 브리핑을 해줘' },
  ])
  return message.content || '응답을 생성하지 못했습니다.'
}

async function generateChat(
  client: SupabaseClient,
  projectId: string,
  initialMessages: OpenAIMessage[]
): Promise<string> {
  let messages = initialMessages
  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const forceFinal = round === MAX_TOOL_ROUNDS
    const assistant = await requestOpenAI(messages, {
      tools: [QUERY_PROJECT_TABLE_TOOL],
      toolChoice: forceFinal ? 'none' : 'auto',
    })
    if (forceFinal || !assistant.tool_calls?.length) {
      return assistant.content || '응답을 생성하지 못했습니다.'
    }

    const toolMessages = await Promise.all(assistant.tool_calls.map(async (toolCall) => ({
      role: 'tool' as const,
      tool_call_id: toolCall.id,
      content: toolCall.function.name === 'query_project_table'
        ? await queryProjectTable(client, projectId, toolCall.function.arguments)
        : JSON.stringify({ error: '지원하지 않는 도구입니다.' }),
    })))
    messages = [...messages, assistant, ...toolMessages]
  }
  return '응답을 생성하지 못했습니다.'
}

function getConversationMessages(value: unknown): ConversationMessage[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is ConversationMessage => {
    if (!item || typeof item !== 'object') return false
    const message = item as Record<string, unknown>
    return (message.role === 'user' || message.role === 'assistant')
      && typeof message.content === 'string'
  }).slice(-10)
}

async function parseBody(request: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json()
    return body && typeof body === 'object' && !Array.isArray(body)
      ? body as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = getBearerToken(request)
    if (!token) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
    }
    if (!await isValidToken(token)) {
      return NextResponse.json({ error: '인증에 실패했습니다.' }, { status: 401 })
    }

    const body = await parseBody(request)
    if (!body) {
      return NextResponse.json({ error: '프로젝트 ID가 필요합니다.' }, { status: 400 })
    }
    const projectId = typeof body.projectId === 'string' ? body.projectId.trim() : ''
    if (!projectId) {
      return NextResponse.json({ error: '프로젝트 ID가 필요합니다.' }, { status: 400 })
    }
    const mode = body.mode
    if (mode !== 'briefing' && mode !== 'chat') {
      return NextResponse.json({ error: '요청 모드가 올바르지 않습니다.' }, { status: 400 })
    }
    const message = typeof body.message === 'string' ? body.message.trim() : ''
    if (mode === 'chat' && !message) {
      return NextResponse.json({ error: '메시지가 필요합니다.' }, { status: 400 })
    }

    const client = getAdminSupabase()
    const context = await getBriefingContext(client, projectId)
    const systemPrompt = buildSystemPrompt(context, mode)
    const response = mode === 'briefing'
      ? await generateBriefing(systemPrompt)
      : await generateChat(client, projectId, [
        { role: 'developer', content: systemPrompt },
        ...getConversationMessages(body.conversationHistory),
        { role: 'user', content: message },
      ])
    return NextResponse.json({ response })
  } catch (error) {
    if (error instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 })
    }
    console.error('프로젝트 현장 AI 비서 오류:', error)
    const errorMessage = error instanceof OpenAIRequestError
      ? error.message
      : '서버 오류가 발생했습니다.'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
