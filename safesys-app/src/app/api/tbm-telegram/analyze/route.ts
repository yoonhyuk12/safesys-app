// TBM 일괄 텔레그램 발송 — 사용자 검토 요청을 OpenAI로 분석해 현장별 텔레그램 문안을 생성하는 API
import { NextRequest, NextResponse } from 'next/server'
import { parsePersonnelCount } from '@/lib/chat/tbm-personnel'
import { isOrganizationInUserScope } from '@/lib/organization-scope'
import { authenticateRequest } from '../auth'
import { isCanonicalUuid, resolveProjects } from '../resolve-projects'

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const OPENAI_MODEL = 'gpt-5.6-luna'
const CHUNK_SIZE = 15
const MAX_ANALYZE_SITES = 50
const MAX_USER_REQUEST_LENGTH = 1000
const MAX_PROJECT_NAME_LENGTH = 200
const MAX_PROJECT_CATEGORY_LENGTH = 100
const MAX_SITE_DETAIL_LENGTH = 1000
const MAX_ANALYSIS_LENGTH = 2000
const MAX_MESSAGE_LENGTH = 1000
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

interface AnalyzeSite {
  key: string
  projectName: string
  projectCategory: string
  todayWork: string
  personnel: string
  equipment: string
}

interface AnalyzeResult {
  key: string
  analysis: string
  message: string
}

interface TbmSubmissionRow {
  id: string
  project_id: string | null
  project_name: string | null
  headquarters: string | null
  branch: string | null
  today_work: string | null
  personnel_total_count: number | null
  personnel_count: string | null
  equipment_input: string | null
}

interface OpenAIChatCompletionResponse {
  choices?: { message?: { content?: string | null } }[]
}

function isBoundedString(value: unknown, maxLength: number, required = false): value is string {
  return typeof value === 'string' && value.length <= maxLength && (
    !required || value.trim().length > 0
  )
}

function isIsoDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function isAnalyzeSite(value: unknown): value is AnalyzeSite {
  if (!value || typeof value !== 'object') return false
  const site = value as Record<string, unknown>
  return (
    isCanonicalUuid(site.key) &&
    isBoundedString(site.projectName, MAX_PROJECT_NAME_LENGTH, true) &&
    isBoundedString(site.projectCategory, MAX_PROJECT_CATEGORY_LENGTH) &&
    isBoundedString(site.todayWork, MAX_SITE_DETAIL_LENGTH) &&
    isBoundedString(site.personnel, MAX_SITE_DETAIL_LENGTH) &&
    isBoundedString(site.equipment, MAX_SITE_DETAIL_LENGTH)
  )
}

function validateAnalyzeResults(
  value: unknown,
  sites: AnalyzeSite[]
): AnalyzeResult[] | null {
  if (!Array.isArray(value) || value.length !== sites.length) return null

  const expectedKeys = new Set(sites.map((site) => site.key))
  const byKey = new Map<string, AnalyzeResult>()
  for (const row of value) {
    if (!row || typeof row !== 'object') return null
    const result = row as Record<string, unknown>
    if (
      typeof result.key !== 'string' ||
      !expectedKeys.has(result.key) ||
      byKey.has(result.key) ||
      typeof result.analysis !== 'string' ||
      result.analysis.length > MAX_ANALYSIS_LENGTH ||
      typeof result.message !== 'string' ||
      result.message.length > MAX_MESSAGE_LENGTH
    ) {
      return null
    }
    byKey.set(result.key, {
      key: result.key,
      analysis: result.analysis,
      message: result.message,
    })
  }

  if (byKey.size !== expectedKeys.size) return null
  return sites.map((site) => byKey.get(site.key) as AnalyzeResult)
}

async function analyzeChunk(
  apiKey: string,
  userRequest: string,
  date: string,
  sites: AnalyzeSite[]
): Promise<{ results: AnalyzeResult[] } | { error: string }> {
  const systemMessage = '건설 안전관리 전문가입니다. 반드시 유효한 JSON으로만 응답하세요.'

  const siteLines = sites
    .map(
      (site, index) =>
        `${index + 1}. key: ${site.key}
   현장명: ${site.projectName}
   소관사업: ${site.projectCategory || '미분류'}
   금일 작업내용: ${site.todayWork || '없음'}
   투입인원: ${site.personnel || '없음'}
   투입장비: ${site.equipment || '없음'}`
    )
    .join('\n')

  const prompt = `
오늘은 ${date}입니다. 아래는 건설 현장별 금일 TBM 보고 내용입니다.

사용자 검토 요청: ${userRequest}

현장 목록:
${siteLines}

각 현장에 대해 다음을 수행하세요.
- 사용자 검토 요청의 관점에서 해당 현장의 금일 작업내용·투입인원·투입장비를 검토합니다.
- analysis: 현장별 검토 결과를 1~2문장으로 요약합니다.
- message: 해당 현장의 발주청과 시공사에게 보낼 텔레그램 메시지를 아래 양식 그대로(줄바꿈 \\n 포함) 작성합니다.

  [검토 주제 요약] 현장명 (${date})

  금일 작업: 작업내용 요약 · 투입인원 · 주요 장비

  확인 당부사항
  - 첫 번째 당부
  - 두 번째 당부

  마무리 인사 한 문장

  - 첫 줄의 [검토 주제 요약]은 사용자 검토 요청을 10자 이내로 요약해 넣습니다.
  - 문단 사이에는 빈 줄을 1개 넣고, 당부 항목은 "- "로 시작하는 줄로 2~4개 작성합니다.
  - 당부 항목은 사용자 검토 요청의 취지를 반영해 해당 현장의 작업내용·장비에 맞게 구체적으로 작성합니다.
  - 한 문장은 한 줄을 넘기지 않게 짧게 끊고, 정중한 존댓말로 전체 500자 이내로 작성합니다.
  - HTML 태그와 <, >, & 문자는 절대 사용하지 않습니다.

다음 JSON 형식으로만 응답하세요: {"results":[{"key":"...","analysis":"...","message":"..."}]}
- key는 입력의 key 값을 글자 그대로 반환합니다.
- results에는 입력된 모든 현장을 순서대로 포함합니다.
`

  const openAIResponse = await fetch(
    'https://api.openai.com/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
      }),
    }
  )

  if (!openAIResponse.ok) {
    const errorData = await openAIResponse.json().catch(() => ({}))
    console.error('OpenAI API 오류:', openAIResponse.status, errorData)
    return { error: 'AI 분석 중 오류가 발생했습니다. (OpenAI)' }
  }

  const openAIResult = (await openAIResponse.json()) as OpenAIChatCompletionResponse
  const openAIContent = openAIResult.choices?.[0]?.message?.content

  if (!openAIContent) {
    console.error('OpenAI 응답 없음:', JSON.stringify(openAIResult).slice(0, 500))
    return { error: 'AI 응답을 받지 못했습니다. (OpenAI)' }
  }

  try {
    const parsed: unknown = JSON.parse(openAIContent)
    const parsedResults = parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>).results
      : null
    const results = validateAnalyzeResults(parsedResults, sites)
    if (!results) {
      console.error('OpenAI 분석 응답 형식 오류:', openAIContent.slice(0, 500))
      return { error: 'AI 분석 결과를 해석할 수 없습니다.' }
    }
    return { results }
  } catch {
    console.error('OpenAI 분석 응답 파싱 실패:', openAIContent.slice(0, 500))
    return { error: 'AI 분석 결과를 해석할 수 없습니다.' }
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
    const userRequest = typeof input?.userRequest === 'string'
      ? input.userRequest.trim()
      : ''
    const date = typeof input?.date === 'string' ? input.date.trim() : ''
    const sitesValue = input?.sites

    if (
      !userRequest ||
      userRequest.length > MAX_USER_REQUEST_LENGTH ||
      !isIsoDate(date) ||
      !Array.isArray(sitesValue) ||
      sitesValue.length === 0 ||
      sitesValue.length > MAX_ANALYZE_SITES ||
      !sitesValue.every(isAnalyzeSite)
    ) {
      return NextResponse.json(
        { error: '검토 요청, 날짜, 유효한 대상 현장이 모두 필요합니다.' },
        { status: 400 }
      )
    }
    const sites: AnalyzeSite[] = sitesValue
    if (new Set(sites.map((site) => site.key)).size !== sites.length) {
      return NextResponse.json(
        { error: '대상 현장의 key는 중복될 수 없습니다.' },
        { status: 400 }
      )
    }

    const keys = sites.map((site) => site.key)
    const { data, error } = await authentication.supabase
      .from('tbm_submissions')
      .select(
        'id, project_id, project_name, headquarters, branch, today_work, personnel_total_count, personnel_count, equipment_input'
      )
      .in('id', keys)
      .eq('meeting_date', date)
      .eq('status', 'submitted')
      .not('today_work', 'is', null)
      .neq('today_work', '작업없음')

    if (error) {
      console.error('TBM 분석 권위 데이터 조회 오류:', error)
      return NextResponse.json(
        { error: 'TBM 제출 정보를 확인하는 중 오류가 발생했습니다.' },
        { status: 500 }
      )
    }

    const submissions = (data ?? []) as TbmSubmissionRow[]
    const submissionById = new Map(submissions.map((row) => [row.id, row]))
    if (
      submissions.length !== keys.length ||
      keys.some((key) => !submissionById.has(key)) ||
      submissions.some(row => !isOrganizationInUserScope(
        authentication.organizationScope,
        { managing_hq: row.headquarters, managing_branch: row.branch }
      ))
    ) {
      return NextResponse.json(
        { error: '조회 권한이 없거나 분석할 수 없는 TBM 항목이 포함되어 있습니다.' },
        { status: 403 }
      )
    }

    const orderedSubmissions = keys.map((key) => submissionById.get(key) as TbmSubmissionRow)
    const resolvedProjects = await resolveProjects(
      authentication.supabase,
      orderedSubmissions.map((row) => ({
        projectId: row.project_id,
        projectName: row.project_name ?? '',
      }))
    )
    const authoritativeSites: AnalyzeSite[] = orderedSubmissions.map((row, index) => {
      const personnel = typeof row.personnel_total_count === 'number'
        ? row.personnel_total_count
        : parsePersonnelCount(row.personnel_count)
      return {
        key: row.id,
        projectName: (row.project_name ?? '').slice(0, MAX_PROJECT_NAME_LENGTH),
        projectCategory: (resolvedProjects[index]?.project_category ?? '')
          .slice(0, MAX_PROJECT_CATEGORY_LENGTH),
        todayWork: (row.today_work ?? '').slice(0, MAX_SITE_DETAIL_LENGTH),
        personnel: `${personnel}명`,
        equipment: (row.equipment_input ?? '').slice(0, MAX_SITE_DETAIL_LENGTH),
      }
    })

    if (!OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY가 설정되지 않았습니다. (.env.local 확인)' },
        { status: 500 }
      )
    }

    // 출력 잘림 방지를 위해 15개 현장 단위로 나눠 순차 호출한다.
    const results: AnalyzeResult[] = []
    for (let i = 0; i < authoritativeSites.length; i += CHUNK_SIZE) {
      const chunk = authoritativeSites.slice(i, i + CHUNK_SIZE)
      const outcome = await analyzeChunk(OPENAI_API_KEY, userRequest, date, chunk)
      if ('error' in outcome) {
        return NextResponse.json({ error: outcome.error }, { status: 500 })
      }
      results.push(...outcome.results)
    }

    return NextResponse.json({ success: true, results })
  } catch (error) {
    console.error('TBM 텔레그램 analyze API 오류:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
