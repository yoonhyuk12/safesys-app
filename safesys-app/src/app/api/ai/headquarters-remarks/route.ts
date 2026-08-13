import { NextRequest, NextResponse } from 'next/server'
import { getAiModel } from '@/lib/ai-models'

const OPENAI_API_KEY = process.env.OPENAI_API_KEY

interface ItemInput {
  title: string
  description?: string
}

interface RequestBody {
  items: ItemInput[]
  category?: string
}

// 매 호출마다 풀에서 무작위 추출 → 프롬프트에 주입해 결과를 다양화
// (풀이 클수록 조합 가짓수가 폭발적으로 늘어남)
const TONE_POOL = [
  // 평가/상태
  '양호', '적정', '안정', '원활', '정상', '체계적', '철저', '완비', '충실',
  '모범적', '우수', '견고', '치밀', '면밀', '꼼꼼', '빈틈없이', '깔끔', '명확',
  // 이행/준수
  '이행', '준수', '부합', '충족', '실행', '운영', '시행', '집행', '실시',
  '완료', '확보', '확립', '정착', '안착', '구축',
  // 관리/조치
  '관리', '점검', '감독', '통제', '조치', '대응', '예방', '유지', '보강',
  '강화', '지도', '감리', '감시', '순찰',
  // 결과
  '문제없음', '특이사항 없음', '지적사항 없음', '미흡사항 없음', '결함 없음',
  // 보조
  '계획대로', '절차대로', '규정대로', '기준대로', '매뉴얼대로', '지침대로'
]

const STRUCTURE_POOL = [
  // 종결형
  '~확인', '~확인됨', '~확인 완료', '~점검 완료', '~조치 완료', '~이행 완료',
  '~상태 양호', '~상태 적정', '~상태 안정', '~상태 견고',
  '~정상 작동', '~정상 운영', '~정상 가동',
  '~기준 부합', '~규정 부합', '~매뉴얼 부합',
  '~안전 확보', '~품질 확보',
  '~지속 관리 중', '~상시 점검 중', '~철저 시행 중', '~원활 진행 중',
  '~문제 없이 운용', '~특이사항 없음', '~지적 없이 운영',
  '~체계적으로 관리', '~빈틈없이 점검', '~꼼꼼히 확인',
  // 보고체
  '~으로 평가', '~으로 판단', '~으로 진단', '~으로 인정',
  '~수준 도달', '~기준 달성', '~목표 달성'
]

// 작성 관점(시점) — 각 배치마다 무작위로 1개 선택해 톤을 분기시킴
const PERSPECTIVE_POOL = [
  { name: '현장 관찰 시점', hint: '실제 현장을 둘러보며 관찰한 결과를 묘사하듯 작성' },
  { name: '절차 이행 평가 시점', hint: '절차·서류·계획 이행 여부에 초점을 둔 평가 문구로 작성' },
  { name: '안전 상태 진단 시점', hint: '현재 안전 상태에 대한 진단·판정 문구로 작성' },
  { name: '관리 운영 점검 시점', hint: '관리 운영 상태와 지속성을 평가하는 문구로 작성' },
  { name: '규정 준수 확인 시점', hint: '관련 규정·기준·매뉴얼 준수 여부 확인 문구로 작성' },
  { name: '예방 조치 확인 시점', hint: '사고 예방을 위한 사전 조치 이행 여부 문구로 작성' },
  { name: '품질 확보 평가 시점', hint: '품질·완성도·정밀도 측면에서 평가 문구로 작성' },
  { name: '실무 운용 보고 시점', hint: '실무 운용 상태를 간결한 보고체로 작성' }
]

// 스타일 — 어휘 색채를 한 번 더 분기
const STYLE_POOL = [
  '간결한 평가체',
  '구체적 관찰체',
  '명료한 보고체',
  '진단형 단정체',
  '실무 점검체'
]

function pickRandom<T>(arr: T[], n: number): T[] {
  const copy = [...arr]
  const out: T[] = []
  for (let i = 0; i < n && copy.length > 0; i++) {
    const idx = Math.floor(Math.random() * copy.length)
    out.push(copy.splice(idx, 1)[0])
  }
  return out
}

function generateSeed(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

export async function POST(request: NextRequest) {
  try {
    if (!OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API 키가 설정되지 않았습니다.' },
        { status: 500 }
      )
    }

    const body = (await request.json()) as RequestBody

    if (!body?.items || !Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json(
        { error: 'items 배열이 필요합니다.' },
        { status: 400 }
      )
    }

    const total = body.items.length
    const numbered = body.items
      .map((it, idx) => {
        const desc = it.description ? ` — ${it.description}` : ''
        return `${String(idx + 1).padStart(2, '0')}. ${it.title}${desc}`
      })
      .join('\n')

    const tones = pickRandom(TONE_POOL, 12).join(', ')
    const structures = pickRandom(STRUCTURE_POOL, 10).join(', ')
    const perspective = pickRandom(PERSPECTIVE_POOL, 1)[0]
    const style = pickRandom(STYLE_POOL, 1)[0]
    const seed = generateSeed()
    const categoryHint = body.category ? `\n[카테고리] ${body.category}` : ''

    const prompt = `건설현장 본부 불시점검 항목 ${total}개에 대한 "점검 결과" 문구를 작성합니다.${categoryHint}

[이번 호출 전용 작성 가이드 — 매 호출 달라짐]
- 작성 관점: ${perspective.name} — ${perspective.hint}
- 문체 스타일: ${style}
- 권장 어휘 풀(일부만 자유롭게 활용): ${tones}
- 문장 끝맺음 변형(일부만 자유롭게 활용): ${structures}
- 변형 시드: ${seed}

[항목 목록]
${numbered}

[작성 규칙]
- 각 항목별로 18~25자(공백 포함) 한국어 긍정 단문.
- **각 항목 문구의 종결어/어미/문장 구조가 서로 달라야 합니다.** (예: 모든 문장을 "~중임", "~확인됨"으로 끝내지 말 것)
- **어휘를 풍부하게 — 같은 명사·동사를 반복하지 말고 동의어/유의어를 적극 사용.**
- 항목 제목에 등장하는 핵심 명사(예: 신호수, 안전대, PTW, TBM, 안전보건표지, 후사경 등)를 가급적 1회 이상 자연스럽게 반영해 항목별 개성을 살릴 것.
- 항목 제목을 그대로 옮기지 말고 "점검 결과 소견" 형태로 재구성.
- 위에 제시된 풀은 힌트일 뿐, 풀에 없는 표현도 자유롭게 사용해 창의적으로 작성.
- 사무적·딱딱한 표현보다 현장 점검 실무자가 작성한 듯한 자연스러움 우선.

[출력 형식 — JSON만]
{
  "results": {
    "01": "결과 문구",
    "02": "결과 문구",
    ...
    "${String(total).padStart(2, '0')}": "결과 문구"
  }
}

[엄수]
- "01"부터 "${String(total).padStart(2, '0')}"까지 ${total}개 키를 빠짐없이 채웁니다.
- 25자 절대 초과 금지. 18자 이상 권장.
- HTML/마크다운/설명/주석 금지. JSON 객체만 출력.`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 50000)

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: await getAiModel('ai.headquarters-remarks'),
        messages: [
          {
            role: 'system',
            content:
              '당신은 건설현장 안전 점검 결과 문구를 작성하는 베테랑 안전관리자입니다. 매 호출마다 주어지는 "작성 관점/문체 스타일/시드"에 따라 어휘·문장구조·종결어를 능동적으로 바꿔, 같은 항목에 대해서도 매번 새로운 표현을 만들어냅니다. 정형화된 상투구("~중임", "~확인됨")의 반복을 피하고, 항목별 핵심 키워드(신호수·안전대·PTW·TBM·보호구·후사경 등)를 살려 항목마다 개성이 드러나도록 작성합니다. 모든 응답은 한국어이며, 반드시 지정된 JSON 객체 형식만 출력합니다.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 1.0,
        top_p: 0.95,
        frequency_penalty: 0.6,
        presence_penalty: 0.4,
        max_tokens: 2000,
        response_format: { type: 'json_object' }
      }),
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('OpenAI API Error:', response.status, errorData)
      return NextResponse.json(
        { error: 'AI 결과 생성 중 오류가 발생했습니다.' },
        { status: 500 }
      )
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content

    if (!content) {
      return NextResponse.json(
        { error: 'AI 응답을 받지 못했습니다.' },
        { status: 500 }
      )
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(content)
    } catch {
      console.error('AI 응답 파싱 실패:', content)
      return NextResponse.json(
        { error: 'AI 응답 형식 오류' },
        { status: 500 }
      )
    }

    // 다양한 응답 형태를 모두 받아들임: results 객체(키=번호), 단순 배열, 또는 remarks 배열
    const root = (parsed ?? {}) as Record<string, unknown>
    const remarksRaw: unknown[] = []

    const resultsObj = root.results
    if (resultsObj && typeof resultsObj === 'object' && !Array.isArray(resultsObj)) {
      for (let i = 0; i < total; i++) {
        const key1 = String(i + 1).padStart(2, '0')
        const key2 = String(i + 1)
        const v = (resultsObj as Record<string, unknown>)[key1]
          ?? (resultsObj as Record<string, unknown>)[key2]
        remarksRaw.push(v)
      }
    } else if (Array.isArray(root.remarks)) {
      remarksRaw.push(...(root.remarks as unknown[]))
    } else if (Array.isArray(root.results)) {
      remarksRaw.push(...(root.results as unknown[]))
    } else {
      // 첫 번째로 발견되는 배열을 사용
      for (const v of Object.values(root)) {
        if (Array.isArray(v)) {
          remarksRaw.push(...(v as unknown[]))
          break
        }
      }
    }

    // 길이 맞춤: 짧으면 "특이사항 없음" 으로 패딩, 길면 잘라냄
    const cleaned: string[] = []
    for (let i = 0; i < total; i++) {
      const v = remarksRaw[i]
      const s = typeof v === 'string' ? v.trim() : ''
      cleaned.push(s.length > 0 ? s : '특이사항 없음')
    }

    return NextResponse.json({ success: true, remarks: cleaned })
  } catch (error) {
    console.error('AI 점검 결과 API 오류:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
