// 관리자용 AI 사용현황 목록 조회와 제조사·모델명·비고·원화 단가 수정을 제공하는 API 라우트
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { DEFAULT_AI_MODELS, type AiModelSetting, type AiProvider } from '@/lib/ai-models'
import { supabaseAdmin } from '@/lib/supabase-admin'

const PROVIDERS: readonly AiProvider[] = ['OpenAI', 'Google']

interface SettingRow {
  feature_key: string
  provider: string
  model: string
  remarks: string | null
  input_price_per_1m: unknown
  output_price_per_1m: unknown
}

interface AiUsageItem extends AiModelSetting {
  sortOrder: number
}

interface PatchInput {
  featureKey: string
  provider: AiProvider
  model: string
  remarks: string
  inputPricePer1m: number | null
  outputPricePer1m: number | null
}

// 단가는 NULL(미산정)이 정상 값이라 "빈 값"과 "잘못된 값"을 구분해야 한다.
const INVALID_PRICE = Symbol('invalid-price')

function isSettingRow(value: unknown): value is SettingRow {
  if (typeof value !== 'object' || value === null) return false
  const row = value as Record<string, unknown>
  return (
    typeof row.feature_key === 'string' &&
    typeof row.provider === 'string' &&
    typeof row.model === 'string' &&
    (typeof row.remarks === 'string' || row.remarks === null)
  )
}

/** DB의 NUMERIC은 드라이버에 따라 number 또는 문자열로 온다. 음수·NaN은 단가로 인정하지 않는다. */
function toPrice(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
  }
  return null
}

// 빈 문자열·null·미전송은 NULL 저장(비용 미산정), 0 이상의 숫자만 단가로 받는다.
function parsePrice(value: unknown): number | null | typeof INVALID_PRICE {
  if (value === undefined || value === null) return null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : INVALID_PRICE
  }
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : INVALID_PRICE
  return INVALID_PRICE
}

function isProvider(value: unknown): value is AiProvider {
  return typeof value === 'string' && PROVIDERS.includes(value as AiProvider)
}

// 목록은 항상 코드의 22행을 기준으로 만들고 DB 행이 있으면 제조사·모델명·비고·단가만 덮어쓴다.
// 위치·기능 설명은 코드가 진실이므로 DB 값이 낡아도 화면이 어긋나지 않는다.
function mergeWithDefaults(rows: readonly SettingRow[]): AiUsageItem[] {
  const byKey = new Map(rows.map((row) => [row.feature_key, row]))

  return DEFAULT_AI_MODELS.map((entry, index) => {
    const row = byKey.get(entry.featureKey)
    return {
      featureKey: entry.featureKey,
      provider: isProvider(row?.provider) ? row.provider : entry.provider,
      model: row?.model.trim() || entry.model,
      location: entry.location,
      feature: entry.feature,
      remarks: row ? row.remarks ?? '' : entry.remarks,
      inputPricePer1m: row ? toPrice(row.input_price_per_1m) : entry.inputPricePer1m,
      outputPricePer1m: row ? toPrice(row.output_price_per_1m) : entry.outputPricePer1m,
      sortOrder: index + 1,
    }
  })
}

function parsePatchInput(body: unknown): PatchInput | null {
  if (typeof body !== 'object' || body === null) return null
  const input = body as Record<string, unknown>

  const featureKey = typeof input.featureKey === 'string' ? input.featureKey.trim() : ''
  const model = typeof input.model === 'string' ? input.model.trim() : ''
  const remarks = typeof input.remarks === 'string' ? input.remarks.trim() : ''

  const inputPricePer1m = parsePrice(input.inputPricePer1m)
  const outputPricePer1m = parsePrice(input.outputPricePer1m)

  if (!DEFAULT_AI_MODELS.some((entry) => entry.featureKey === featureKey)) return null
  if (!isProvider(input.provider)) return null
  if (!model) return null
  if (inputPricePer1m === INVALID_PRICE || outputPricePer1m === INVALID_PRICE) return null

  return { featureKey, provider: input.provider, model, remarks, inputPricePer1m, outputPricePer1m }
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('ai_model_settings')
      .select('feature_key, provider, model, remarks, input_price_per_1m, output_price_per_1m')

    // 테이블이 아직 없으면(마이그레이션 전) 기본값 목록을 그대로 돌려주고 화면에서 안내한다.
    if (error) {
      return NextResponse.json({
        success: true,
        source: 'defaults',
        items: mergeWithDefaults([]),
      })
    }

    const rows: unknown[] = Array.isArray(data) ? data : []

    return NextResponse.json({
      success: true,
      source: 'database',
      items: mergeWithDefaults(rows.filter(isSettingRow)),
    })
  } catch (error) {
    console.error('AI 사용현황 조회 오류', error)
    return NextResponse.json(
      { success: false, error: 'AI 사용현황을 불러오지 못했습니다.' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  }

  try {
    const input = parsePatchInput(await request.json().catch(() => null))
    if (!input) {
      return NextResponse.json(
        { success: false, error: '기능 키·제조사·모델명·단가를 확인해주세요.' },
        { status: 400 }
      )
    }

    const { data, error } = await supabaseAdmin
      .from('ai_model_settings')
      .update({
        provider: input.provider,
        model: input.model,
        remarks: input.remarks || null,
        input_price_per_1m: input.inputPricePer1m,
        output_price_per_1m: input.outputPricePer1m,
        updated_at: new Date().toISOString(),
      })
      .eq('feature_key', input.featureKey)
      .select('feature_key')

    if (error) {
      console.error('AI 모델 설정 수정 오류', error)
      return NextResponse.json(
        { success: false, error: '마이그레이션(ai_model_settings) 실행 후 저장할 수 있습니다.' },
        { status: 500 }
      )
    }

    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json(
        { success: false, error: '해당 기능의 설정 행이 없습니다. 시드 INSERT를 실행해주세요.' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true, featureKey: input.featureKey })
  } catch (error) {
    console.error('AI 모델 설정 수정 오류', error)
    return NextResponse.json(
      { success: false, error: 'AI 모델 설정을 저장하지 못했습니다.' },
      { status: 500 }
    )
  }
}
