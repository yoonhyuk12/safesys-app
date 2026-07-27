// 작업내용 자유 텍스트를 위험요인 DB의 분류 조합(공사>단위작업>세부단위작업)으로 매칭하는 라우트 — 실존 조합만 통과시킨다
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import type { RiskClassifyMatch, RiskClassifyRequest, RiskClassifyResponse } from '@/lib/risk-assessment/types'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY

// 검측 체크리스트·위험성 판정 라우트와 같은 검증된 모델을 쓴다. 새 모델이 나오면 배열 앞에 추가하면 자동 폴백된다.
const GEMINI_MODELS = ['gemini-3.1-flash-lite']

const PAGE_SIZE = 1000
const MAX_MATCHES = 3
// 사업별 무관 모드는 조합이 2,100건이 넘어 공사부터 좁힌다.
const MAX_CONSTRUCTIONS = 6
// 프롬프트에 넣는 조합 문자열 총량 상한 (사업별 지정 시 최대 1만자 남짓이라 걸리지 않는다)
const MAX_COMBO_CHARS = 30000

interface TaxonomyCombo {
  construction: string
  unitWork: string
  detailWork: string
}

const comboLine = (combo: TaxonomyCombo) => `${combo.construction} > ${combo.unitWork} > ${combo.detailWork}`

/** PostgREST 응답 상한(1,000행)에 걸리지 않도록 뷰를 끝까지 이어 읽는다. */
async function fetchCombos(businessType: string): Promise<TaxonomyCombo[]> {
  const combos: TaxonomyCombo[] = []
  const seen = new Set<string>()

  for (let page = 0; ; page++) {
    // 정렬을 고정해야 페이지 경계에서 값이 누락되지 않는다
    let query = supabaseAdmin
      .from('risk_hazard_taxonomy')
      .select('construction, unit_work, detail_work')
      .order('construction')
      .order('unit_work')
      .order('detail_work')
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
    if (businessType) query = query.eq('business_type', businessType)

    const { data, error } = await query
    if (error) throw error

    const rows = (data ?? []) as unknown as Array<Record<string, string>>
    for (const row of rows) {
      const combo = {
        construction: row.construction || '',
        unitWork: row.unit_work || '',
        detailWork: row.detail_work || '',
      }
      if (!combo.construction || !combo.unitWork || !combo.detailWork) continue
      // 사업별 무관 모드는 여러 사업에 같은 조합이 있어 중복을 걷어낸다
      const key = comboLine(combo)
      if (seen.has(key)) continue
      seen.add(key)
      combos.push(combo)
    }
    if (rows.length < PAGE_SIZE) return combos
  }
}

/** Gemini를 모델 순서대로 시도해 JSON 객체를 받는다. 모두 실패하면 마지막 사유로 예외를 던진다. */
async function callGemini(systemMessage: string, prompt: string): Promise<Record<string, unknown>> {
  let lastError = ''
  for (const model of GEMINI_MODELS) {
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': GEMINI_API_KEY as string,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemMessage }] },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json',
          },
        }),
      }
    )

    if (!geminiResponse.ok) {
      const errorData = await geminiResponse.json().catch(() => ({}))
      lastError = `${geminiResponse.status} ${JSON.stringify(errorData).slice(0, 200)}`
      console.error(`Gemini API Error (${model}):`, lastError)
      continue // 다음 모델로 폴백
    }

    const geminiResult = await geminiResponse.json()
    const content = geminiResult.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text || '')
      .join('')

    if (!content) {
      lastError = 'AI 응답 본문 없음'
      console.error(`Gemini 응답 없음 (${model}):`, JSON.stringify(geminiResult).slice(0, 300))
      continue
    }

    try {
      return JSON.parse(content) as Record<string, unknown>
    } catch {
      lastError = 'JSON 파싱 실패'
      console.error(`Gemini 응답 파싱 실패 (${model}):`, content.slice(0, 300))
      continue
    }
  }
  throw new Error(lastError || 'AI 호출에 실패했습니다.')
}

/** 작업 상황 설명 블록 — 두 단계 프롬프트가 같은 문구를 쓴다. */
function situationBlock(workDescription: string, personnel: string, equipment: string): string {
  return `- 작업내용: ${workDescription}
- 투입 인원: ${personnel || '(미입력)'}
- 사용 장비: ${equipment || '(미입력)'}`
}

/** 1차 좁히기 — 공사 단위로 관련 후보를 고른다 (사업별 무관 모드 전용). */
async function pickConstructions(
  constructions: string[],
  situation: string
): Promise<string[]> {
  const prompt = `아래 "작업 상황"과 관련 있는 "공사"를 골라주세요.

# 작업 상황
${situation}

# 공사 목록
${constructions.join('\n')}

# 규칙
- 작업 상황에 직접 관련된 공사만 최대 ${MAX_CONSTRUCTIONS}개, 관련도 높은 순으로 고른다.
- 목록에 있는 문자열을 글자 그대로 옮긴다. 목록에 없는 공사를 지어내지 않는다.
- 반드시 다음 JSON 형식으로만 응답한다: {"constructions":["공사명"]}`

  const parsed = await callGemini(
    '당신은 한국 건설현장(농어촌공사 계열)의 위험성평가 전문가입니다. 주어진 목록에서만 고르고 반드시 유효한 JSON으로만 응답하세요.',
    prompt
  )
  const raw = Array.isArray(parsed.constructions) ? parsed.constructions : []
  const known = new Set(constructions)
  // 목록 밖 공사는 환각이므로 버린다
  return [...new Set(raw.map((value) => String(value).trim()))]
    .filter((value) => known.has(value))
    .slice(0, MAX_CONSTRUCTIONS)
}

/** 2차 선별 — 조합 번호로 최대 3건을 고르게 한다. 번호 참조라 문자열 오기입이 끼어들 수 없다. */
async function pickCombos(combos: TaxonomyCombo[], situation: string): Promise<RiskClassifyMatch[]> {
  const prompt = `아래 "작업 상황"에 해당하는 "분류 조합"을 골라주세요.

# 작업 상황
${situation}

# 분류 조합 목록 ([번호] 공사 > 단위작업 > 세부단위작업)
${combos.map((combo, index) => `[${index}] ${comboLine(combo)}`).join('\n')}

# 규칙
- 작업 상황에 직접 해당하는 조합만 최대 ${MAX_MATCHES}개, 관련도 높은 순으로 고른다.
- 애매하면 적게 고른다. 억지로 ${MAX_MATCHES}개를 채우지 않는다.
- 목록에 있는 번호만 쓴다. 목록에 없는 번호나 새 분류명을 지어내지 않는다.
- reason에는 그 조합을 고른 근거를 한 줄로 쓴다.
- 반드시 다음 JSON 형식으로만 응답한다: {"matches":[{"index":0,"reason":""}]}`

  const parsed = await callGemini(
    '당신은 한국 건설현장(농어촌공사 계열)의 위험성평가 전문가입니다. 작업내용을 유해·위험요인 DB의 분류 체계에 매칭합니다. 주어진 번호로만 답하고 반드시 유효한 JSON으로만 응답하세요.',
    prompt
  )

  const raw = Array.isArray(parsed.matches) ? parsed.matches : []
  const seen = new Set<number>()
  const matches: RiskClassifyMatch[] = []

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const index = Number(record.index)
    // 목록 밖 번호는 환각이므로 버린다
    if (!Number.isInteger(index) || index < 0 || index >= combos.length || seen.has(index)) continue
    seen.add(index)
    matches.push({ ...combos[index], reason: String(record.reason || '').trim() })
    if (matches.length >= MAX_MATCHES) break
  }
  return matches
}

export async function POST(request: NextRequest) {
  const authorization = request.headers.get('authorization')
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!token) {
    return NextResponse.json<RiskClassifyResponse>({ success: false, error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) {
    return NextResponse.json<RiskClassifyResponse>({ success: false, error: '인증에 실패했습니다.' }, { status: 401 })
  }

  try {
    const body = (await request.json()) as Partial<RiskClassifyRequest>
    const workDescription = String(body.workDescription || '').trim()
    const personnel = String(body.personnel || '').trim()
    const equipment = String(body.equipment || '').trim()
    const businessType = String(body.businessType || '').trim()

    if (!GEMINI_API_KEY) {
      return NextResponse.json<RiskClassifyResponse>(
        { success: false, error: 'AI API 키가 설정되지 않았습니다. (.env.local의 GEMINI_API_KEY)' },
        { status: 500 }
      )
    }

    if (!workDescription) {
      return NextResponse.json<RiskClassifyResponse>(
        { success: false, error: '작업내용을 입력해주세요.' },
        { status: 400 }
      )
    }

    const allCombos = await fetchCombos(businessType)
    if (allCombos.length === 0) {
      return NextResponse.json<RiskClassifyResponse>(
        { success: false, error: '분류 조합을 찾지 못했습니다. 사업별을 바꾸거나 직접 선택으로 진행해주세요.' },
        { status: 404 }
      )
    }

    const situation = situationBlock(workDescription, personnel, equipment)

    // 사업별을 지정하지 않으면 조합이 2,100건이 넘어 공사로 한 번 좁힌 뒤 선별한다
    let candidates = allCombos
    if (!businessType) {
      const constructions = [...new Set(allCombos.map((combo) => combo.construction))]
      const picked = await pickConstructions(constructions, situation)
      if (picked.length === 0) {
        return NextResponse.json<RiskClassifyResponse>(
          { success: false, error: '작업내용과 맞는 공사를 찾지 못했습니다. 작업내용을 더 구체적으로 쓰거나 사업별을 지정해주세요.' },
          { status: 422 }
        )
      }
      const pickedSet = new Set(picked)
      candidates = allCombos.filter((combo) => pickedSet.has(combo.construction))
    }

    // 그래도 프롬프트가 크면 앞에서부터 자른다 (자른 사실은 로그로 남긴다)
    let charCount = 0
    const trimmed: TaxonomyCombo[] = []
    for (const combo of candidates) {
      charCount += comboLine(combo).length + 8
      if (charCount > MAX_COMBO_CHARS) break
      trimmed.push(combo)
    }
    if (trimmed.length < candidates.length) {
      console.warn(`위험요인 분류 후보 축약: ${candidates.length}건 → ${trimmed.length}건 (프롬프트 상한)`)
    }

    const data = await pickCombos(trimmed, situation)
    if (data.length === 0) {
      return NextResponse.json<RiskClassifyResponse>(
        { success: false, error: 'AI가 작업내용에 맞는 분류를 찾지 못했습니다. 작업내용을 더 구체적으로 쓰거나 직접 선택으로 진행해주세요.' },
        { status: 422 }
      )
    }

    return NextResponse.json<RiskClassifyResponse>({ success: true, data })
  } catch (error) {
    console.error('위험요인 분류 AI API 오류:', error)
    const message = error instanceof Error ? error.message : ''
    return NextResponse.json<RiskClassifyResponse>(
      { success: false, error: `AI 자동 분류에 실패했습니다.${message ? ` (${message})` : ''}` },
      { status: 502 }
    )
  }
}
