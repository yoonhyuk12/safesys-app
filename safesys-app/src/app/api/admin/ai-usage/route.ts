// 관리자용 AI 사용현황 목록 조회와 제조사·모델명·비고 수정을 제공하는 API 라우트
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
}

interface AiUsageItem extends AiModelSetting {
  sortOrder: number
}

interface PatchInput {
  featureKey: string
  provider: AiProvider
  model: string
  remarks: string
}

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

function isProvider(value: unknown): value is AiProvider {
  return typeof value === 'string' && PROVIDERS.includes(value as AiProvider)
}

// 목록은 항상 코드의 22행을 기준으로 만들고 DB 행이 있으면 제조사·모델명·비고만 덮어쓴다.
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
      inputPricePer1m: entry.inputPricePer1m,
      outputPricePer1m: entry.outputPricePer1m,
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

  if (!DEFAULT_AI_MODELS.some((entry) => entry.featureKey === featureKey)) return null
  if (!isProvider(input.provider)) return null
  if (!model) return null

  return { featureKey, provider: input.provider, model, remarks }
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('ai_model_settings')
      .select('feature_key, provider, model, remarks')

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
        { success: false, error: '기능 키·제조사·모델명을 확인해주세요.' },
        { status: 400 }
      )
    }

    const { data, error } = await supabaseAdmin
      .from('ai_model_settings')
      .update({
        provider: input.provider,
        model: input.model,
        remarks: input.remarks || null,
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
