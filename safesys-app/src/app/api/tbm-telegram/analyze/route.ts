// TBM 일괄 텔레그램 발송 — 사용자 검토 요청을 Gemini로 분석해 현장별 텔레그램 문안을 생성하는 API
import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '../auth'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const GEMINI_MODEL = 'gemini-3.1-flash'
const CHUNK_SIZE = 15

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

interface GeminiGenerateResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[]
}

function isAnalyzeSite(value: unknown): value is AnalyzeSite {
  if (!value || typeof value !== 'object') return false
  const site = value as Record<string, unknown>
  return (
    typeof site.key === 'string' && site.key.trim().length > 0 &&
    typeof site.projectName === 'string' && site.projectName.trim().length > 0 &&
    typeof site.projectCategory === 'string' &&
    typeof site.todayWork === 'string' &&
    typeof site.personnel === 'string' &&
    typeof site.equipment === 'string'
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
      typeof result.message !== 'string'
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
- message: 해당 현장의 발주청과 시공사에게 보낼 텔레그램 메시지를 작성합니다.
  - 현장명과 날짜(${date})를 포함합니다.
  - 사용자 검토 요청의 취지를 반영한 당부/확인 내용을 담습니다.
  - 정중한 존댓말로 500자 이내로 작성합니다.
  - HTML 태그와 <, >, & 문자는 절대 사용하지 않습니다.

다음 JSON 형식으로만 응답하세요: {"results":[{"key":"...","analysis":"...","message":"..."}]}
- key는 입력의 key 값을 글자 그대로 반환합니다.
- results에는 입력된 모든 현장을 순서대로 포함합니다.
`

  const geminiResponse = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemMessage }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.4,
          responseMimeType: 'application/json',
        },
      }),
    }
  )

  if (!geminiResponse.ok) {
    const errorData = await geminiResponse.json().catch(() => ({}))
    console.error('Gemini API Error:', geminiResponse.status, errorData)
    return { error: 'AI 분석 중 오류가 발생했습니다. (Gemini)' }
  }

  const geminiResult = (await geminiResponse.json()) as GeminiGenerateResponse
  const geminiContent = geminiResult.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || '')
    .join('')

  if (!geminiContent) {
    console.error('Gemini 응답 없음:', JSON.stringify(geminiResult).slice(0, 500))
    return { error: 'AI 응답을 받지 못했습니다. (Gemini)' }
  }

  try {
    const parsed: unknown = JSON.parse(geminiContent)
    const parsedResults = parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>).results
      : null
    const results = validateAnalyzeResults(parsedResults, sites)
    if (!results) {
      console.error('Gemini 분석 응답 형식 오류:', geminiContent.slice(0, 500))
      return { error: 'AI 분석 결과를 해석할 수 없습니다.' }
    }
    return { results }
  } catch {
    console.error('Gemini 분석 응답 파싱 실패:', geminiContent.slice(0, 500))
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
      !date ||
      !Array.isArray(sitesValue) ||
      sitesValue.length === 0 ||
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

    if (!GEMINI_API_KEY) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY가 설정되지 않았습니다. (.env.local 확인)' },
        { status: 500 }
      )
    }

    // 출력 잘림 방지를 위해 15개 현장 단위로 나눠 순차 호출한다.
    const results: AnalyzeResult[] = []
    for (let i = 0; i < sites.length; i += CHUNK_SIZE) {
      const chunk = sites.slice(i, i + CHUNK_SIZE)
      const outcome = await analyzeChunk(GEMINI_API_KEY, userRequest, date, chunk)
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
