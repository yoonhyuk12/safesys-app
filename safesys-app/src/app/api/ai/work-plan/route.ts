// AI 작업계획서 초안 생성 — planTypes별 위험요인·개선대책·작업순서·전기작업단계·사전조사 초안을 Gemini로 생성
import { NextRequest, NextResponse } from 'next/server'
import { CONSTRUCTION_SURVEY_ITEMS, PLAN_TYPE_OPTIONS } from '@/lib/work-plan/constants'
import type {
  ConstructionSurveyType,
  ElectricWorkStep,
  PlanType,
  RiskControlRow,
  WorkPlanAiDraft,
  WorkPlanAiResult,
} from '@/lib/work-plan/types'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY

// 검측 체크리스트 라우트와 동일하게 검증된 3.1-flash-lite를 사용한다. 상위 모델 출시 시 배열 앞에 추가하면 자동 폴백된다.
const GEMINI_MODELS = ['gemini-3.1-flash-lite']

const VALID_PLAN_TYPES: readonly PlanType[] = ['loading', 'construction', 'electric', 'heavy', 'excavation']
const VALID_SURVEY_TYPES: readonly ConstructionSurveyType[] = [
  'constructionMachine',
  'excavation',
  'tunnel',
  'demolition',
]

interface ProjectContext {
  address?: string
  workTypes?: string[]
}

interface WorkPlanRequestBody {
  planTypes?: unknown
  title?: unknown
  sharedWorkContent?: unknown
  workMethod?: unknown
  equipmentName?: unknown
  loadItemName?: unknown
  surveyType?: unknown
  projectContext?: { address?: unknown; workTypes?: unknown }
}

function planLabel(type: PlanType): string {
  return PLAN_TYPE_OPTIONS.find((o) => o.value === type)?.title ?? type
}

// 선택된 plan type별로 어떤 필드를 어떤 관점으로 생성할지 서술한 지시문
function planInstruction(type: PlanType): string {
  switch (type) {
    case 'loading':
      return `- ${planLabel(type)}(loading): 차량계 하역운반기계(카고크레인·지게차 등) 상·하차 작업. 낙하·협착·전도·근로자 접촉 예방과 운행경로·유도자 배치, 과적·편하중 방지 관점으로 위험요인·개선대책을 작성한다.`
    case 'construction':
      return `- ${planLabel(type)}(construction): 차량계 건설기계(굴착기·백호·크레인 등) 사용 작업. 운행경로 지반침하·갓길붕괴·토석낙하·협착·전도 예방과 유도자·신호수 배치 관점으로 작성한다. workSequence(작업순서)와 surveyType 사전조사 초안도 생성한다.`
    case 'electric':
      return `- ${planLabel(type)}(electric): 전기작업. 감전·아크섬광·아크폭발·접근한계거리·정전(전로차단)·활선 위험 관점으로 작성하며, 공통 riskControls에 더해 작업단계별 electricWorkSteps를 별도로 생성한다.`
    case 'heavy':
      return `- ${planLabel(type)}(heavy): 중량물 취급 작업. 인양물 낙하·협착·전도, 달기구(슬링·샤클) 점검, 인양 하부 출입금지, 편하중·적재 안정 관점으로 작성한다.`
    case 'excavation':
      return `- ${planLabel(type)}(excavation): 지반 굴착 작업. 굴착면·흙막이 붕괴, 토사 매몰, 장비 협착·충돌, 지하매설물(가스·전기·상수도) 파손, 굴착 단부 추락, 토사반출 차량 위험 관점으로 위험요인·개선대책을 작성한다.`
    default:
      return ''
  }
}

// 프롬프트에 넣을 출력 JSON 스키마 조각(선택된 type만 포함)
function schemaFragment(type: PlanType, surveyType: ConstructionSurveyType | null): string {
  const shared = '"sharedWorkContent": "작업내용 공유 문구 1~2문장"'
  const risk =
    '"riskControls": [{ "workStep": "작업순서 단계", "riskFactor": "위험요인", "improvementMeasure": "개선대책" }]  /* 3~6행 */'

  if (type === 'construction') {
    const parts = [shared, risk, '"workSequence": ["작업순서 단계 문자열"]  /* 5~8단계 */']
    if (surveyType) {
      const count = CONSTRUCTION_SURVEY_ITEMS[surveyType].length
      parts.push(`"surveyFindings": ["조사내용 문자열"]  /* 정확히 ${count}개, 아래 사전조사 항목 순서대로 */`)
    }
    return `"construction": { ${parts.join(', ')} }`
  }

  if (type === 'electric') {
    const steps =
      '"electricWorkSteps": [{ "workName": "작업명", "sequenceAndContent": "작업순서 및 내용", "riskFactor": "위험요인", "safeMethod": "안전작업방법", "note": "비고" }]  /* 3~6행 */'
    return `"electric": { ${shared}, ${risk}, ${steps} }`
  }

  return `"${type}": { ${shared}, ${risk} }`
}

function normalizeRiskControls(value: unknown): RiskControlRow[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .map((r) => ({
      workStep: String(r.workStep ?? '').trim(),
      riskFactor: String(r.riskFactor ?? '').trim(),
      improvementMeasure: String(r.improvementMeasure ?? '').trim(),
    }))
    .filter((r) => r.workStep || r.riskFactor || r.improvementMeasure)
}

function normalizeElectricSteps(value: unknown): ElectricWorkStep[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .map((r) => ({
      workName: String(r.workName ?? '').trim(),
      sequenceAndContent: String(r.sequenceAndContent ?? '').trim(),
      riskFactor: String(r.riskFactor ?? '').trim(),
      safeMethod: String(r.safeMethod ?? '').trim(),
      note: String(r.note ?? '').trim(),
    }))
    .filter((r) => r.workName || r.sequenceAndContent || r.riskFactor || r.safeMethod)
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((v) => String(v ?? '').trim()).filter((v) => v.length > 0)
}

// surveyFindings는 사전조사 항목 순서와 개수에 맞춰 길이를 보정한다(내용이 하나도 없으면 빈 배열).
function fitSurveyFindings(value: unknown, expectedLength: number): string[] {
  if (!Array.isArray(value) || value.length === 0) return []
  const trimmed = value.map((v) => String(v ?? '').trim())
  const result = trimmed.slice(0, expectedLength)
  while (result.length < expectedLength) result.push('')
  return result
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as WorkPlanRequestBody

    if (!GEMINI_API_KEY) {
      return NextResponse.json(
        { error: 'AI API 키가 설정되지 않았습니다. (.env.local의 GEMINI_API_KEY)' },
        { status: 500 }
      )
    }

    // planTypes 검증 — 유효한 값만 남기고 중복 제거, 1개 이상 필수
    const rawPlanTypes = Array.isArray(body.planTypes) ? body.planTypes : []
    const planTypes = VALID_PLAN_TYPES.filter((t) => rawPlanTypes.includes(t))
    if (planTypes.length === 0) {
      return NextResponse.json(
        { error: '작업계획서 종류(planTypes)를 1개 이상 선택해주세요.' },
        { status: 400 }
      )
    }

    const title = String(body.title ?? '').trim()
    if (!title) {
      return NextResponse.json({ error: '작업명(title)을 입력해주세요.' }, { status: 400 })
    }

    const inputSharedWorkContent = String(body.sharedWorkContent ?? '').trim()
    const workMethod = String(body.workMethod ?? '').trim()
    const equipmentName = String(body.equipmentName ?? '').trim()
    const loadItemName = String(body.loadItemName ?? '').trim()
    const surveyType: ConstructionSurveyType | null = VALID_SURVEY_TYPES.includes(
      body.surveyType as ConstructionSurveyType
    )
      ? (body.surveyType as ConstructionSurveyType)
      : null

    const ctx: ProjectContext = {
      address: String(body.projectContext?.address ?? '').trim() || undefined,
      workTypes: normalizeStringArray(body.projectContext?.workTypes) || undefined,
    }

    const systemMessage =
      '당신은 한국 건설현장의 산업안전 전문가입니다. 「산업안전보건기준에 관한 규칙」의 작업계획서 요구사항(추락·낙하·전도·협착·붕괴 예방대책, 운행경로·작업방법·유도자 배치 등)을 반영하여 현장에서 바로 쓸 수 있는 실무적이고 구체적인 한국어 초안을 작성합니다. 추측성 수치를 지어내지 말고, 반드시 유효한 JSON으로만 응답하세요.'

    const selectedInstructions = planTypes.map(planInstruction).filter(Boolean).join('\n')
    const selectedSchema = planTypes.map((t) => schemaFragment(t, surveyType)).join(',\n  ')

    const surveyBlock =
      surveyType && planTypes.includes('construction')
        ? `\n# 사전조사(surveyFindings) 항목 — 이 순서·개수 그대로 각 항목의 조사내용 초안을 작성한다\n${CONSTRUCTION_SURVEY_ITEMS[
            surveyType
          ]
            .map((item, i) => `${i + 1}. ${item}`)
            .join('\n')}`
        : ''

    const prompt = `아래 "현장 입력 정보"를 바탕으로 선택된 작업계획서 종류별 초안을 작성하세요.

# 현장 입력 정보
- 작업명: ${title}
- 선택된 작업계획서 종류: ${planTypes.join(', ')}
- 현장 주소: ${ctx.address || '(미입력)'}
- 공종: ${ctx.workTypes && ctx.workTypes.length > 0 ? ctx.workTypes.join(', ') : '(미입력)'}
- 작업방법: ${workMethod || '(미입력)'}
- 사용 장비명: ${equipmentName || '(미입력)'}
- 중량물(취급물)명: ${loadItemName || '(미입력)'}
- 작업내용 공유 초안(있으면 다듬어 사용): ${inputSharedWorkContent || '(미입력)'}
${surveyBlock}

# 종류별 작성 지침
${selectedInstructions}

# 공통 작성 규칙
- 모든 종류에 공통으로 sharedWorkContent(작업내용을 근로자에게 공유하는 문구 1~2문장)와 riskControls(작업순서 단계별 위험요인·개선대책 3~6행)를 작성한다.
- 입력된 작업내용 공유 초안이 있으면 자연스럽게 다듬고, 없으면 작업명·공종·장비를 근거로 새로 작성한다.
- riskControls의 workStep은 실제 작업 흐름 순서를 따르고, riskFactor는 구체적 재해유형(추락·낙하·전도·협착·붕괴·감전 등), improvementMeasure는 실행 가능한 예방대책으로 작성한다.
- 지어낸 허용오차·규격 수치를 임의로 넣지 않는다.

# 출력 형식 (선택된 종류의 키만 포함한 유효 JSON)
{
  ${selectedSchema}
}`

    let lastError = ''
    for (const model of GEMINI_MODELS) {
      const geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': GEMINI_API_KEY,
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
        const parsed = JSON.parse(content)
        if (!parsed || typeof parsed !== 'object') {
          lastError = 'AI 응답이 객체가 아님'
          continue
        }

        const result: WorkPlanAiResult = {}
        for (const type of planTypes) {
          const raw = (parsed[type] ?? {}) as Record<string, unknown>
          const draft: WorkPlanAiDraft = {
            riskControls: normalizeRiskControls(raw.riskControls),
          }

          const shared = String(raw.sharedWorkContent ?? '').trim() || inputSharedWorkContent
          if (shared) draft.sharedWorkContent = shared

          if (type === 'construction') {
            draft.workSequence = normalizeStringArray(raw.workSequence)
            if (surveyType) {
              draft.surveyFindings = fitSurveyFindings(
                raw.surveyFindings,
                CONSTRUCTION_SURVEY_ITEMS[surveyType].length
              )
            }
          }

          if (type === 'electric') {
            draft.electricWorkSteps = normalizeElectricSteps(raw.electricWorkSteps)
          }

          result[type] = draft
        }

        return NextResponse.json({ result })
      } catch {
        lastError = 'JSON 파싱 실패'
        console.error(`Gemini 응답 파싱 실패 (${model}):`, content.slice(0, 300))
        continue
      }
    }

    return NextResponse.json(
      { error: `AI 작업계획서 초안 생성에 실패했습니다. (${lastError})` },
      { status: 502 }
    )
  } catch (error) {
    console.error('작업계획서 AI API 오류:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
