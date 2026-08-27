// 관리자용 AI 호출 기록을 기간·기능·모델·날짜별로 집계하고 조회 시점 단가로 추정 비용(원)을 계산하는 API 라우트
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { DEFAULT_AI_MODELS } from '@/lib/ai-models'
import { supabaseAdmin } from '@/lib/supabase-admin'

const ALLOWED_DAYS: readonly number[] = [1, 7, 30, 90]
const DEFAULT_DAYS = 30
/** 한 번에 가져오는 로그 상한. 여기에 걸리면 응답에 truncated를 실어 화면에서 안내한다. */
const MAX_ROWS = 50000
const KST_OFFSET_MS = 9 * 60 * 60 * 1000

interface LogRow {
  feature_key: string
  model: string
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  success: boolean
  created_at: string
}

interface PriceRow {
  feature_key: string
  provider: string
  model: string
  input_price_per_1m: unknown
  output_price_per_1m: unknown
}

interface FeaturePrice {
  feature: string
  provider: string
  model: string
  inputPricePer1m: number | null
  outputPricePer1m: number | null
}

interface Bucket {
  calls: number
  successCalls: number
  failedCalls: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cost: number
  unpricedCalls: number
}

interface FeatureSummary extends Bucket {
  featureKey: string
  feature: string
  provider: string
  model: string
}

interface ModelSummary extends Bucket {
  model: string
}

interface DailySummary {
  date: string
  calls: number
  totalTokens: number
  cost: number
  unpricedCalls: number
}

function isLogRow(value: unknown): value is LogRow {
  if (typeof value !== 'object' || value === null) return false
  const row = value as Record<string, unknown>
  return (
    typeof row.feature_key === 'string' &&
    typeof row.model === 'string' &&
    typeof row.prompt_tokens === 'number' &&
    typeof row.completion_tokens === 'number' &&
    typeof row.total_tokens === 'number' &&
    typeof row.success === 'boolean' &&
    typeof row.created_at === 'string'
  )
}

function isPriceRow(value: unknown): value is PriceRow {
  if (typeof value !== 'object' || value === null) return false
  const row = value as Record<string, unknown>
  return typeof row.feature_key === 'string' && typeof row.provider === 'string' && typeof row.model === 'string'
}

/** NUMERIC은 드라이버에 따라 number 또는 문자열로 온다. 음수·NaN은 단가로 인정하지 않는다. */
function toPrice(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
  }
  return null
}

function parseDays(raw: string | null): number {
  const parsed = Number(raw)
  return Number.isInteger(parsed) && ALLOWED_DAYS.includes(parsed) ? parsed : DEFAULT_DAYS
}

/** 한국 시간 기준으로 오늘을 포함한 최근 days일의 시작 시각. days=1이면 오늘 00:00(KST)이다. */
function periodStart(days: number): Date {
  const shifted = new Date(Date.now() + KST_OFFSET_MS)
  shifted.setUTCHours(0, 0, 0, 0)
  shifted.setUTCDate(shifted.getUTCDate() - (days - 1))
  return new Date(shifted.getTime() - KST_OFFSET_MS)
}

const dateKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function toDateKey(iso: string): string {
  const parsed = new Date(iso)
  return Number.isNaN(parsed.getTime()) ? iso.slice(0, 10) : dateKeyFormatter.format(parsed)
}

function emptyBucket(): Bucket {
  return {
    calls: 0,
    successCalls: 0,
    failedCalls: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    cost: 0,
    unpricedCalls: 0,
  }
}

/** 로그에는 비용이 없으므로 feature_key에 붙은 단가로 매 행 계산한다. 단가가 없으면 0을 더하지 않고 null을 돌려준다. */
function rowCost(row: LogRow, price: FeaturePrice | undefined): number | null {
  if (!price) return null
  const { inputPricePer1m, outputPricePer1m } = price
  if (inputPricePer1m === null && outputPricePer1m === null) return null

  const inputCost = (row.prompt_tokens / 1_000_000) * (inputPricePer1m ?? 0)
  const outputCost = (row.completion_tokens / 1_000_000) * (outputPricePer1m ?? 0)
  return inputCost + outputCost
}

function addRow(bucket: Bucket, row: LogRow, cost: number | null): void {
  bucket.calls += 1
  if (row.success) bucket.successCalls += 1
  else bucket.failedCalls += 1
  bucket.promptTokens += row.prompt_tokens
  bucket.completionTokens += row.completion_tokens
  bucket.totalTokens += row.total_tokens
  if (cost === null) bucket.unpricedCalls += 1
  else bucket.cost += cost
}

/** 기능별 단가·표시명 사전. 코드 기본값 22행을 뼈대로 삼고 DB 행이 있으면 제조사·모델명·단가를 덮어쓴다. */
function buildPriceMap(rows: readonly PriceRow[]): Map<string, FeaturePrice> {
  const byKey = new Map(rows.map((row) => [row.feature_key, row]))
  const map = new Map<string, FeaturePrice>()

  for (const entry of DEFAULT_AI_MODELS) {
    const row = byKey.get(entry.featureKey)
    map.set(entry.featureKey, {
      feature: entry.feature,
      provider: row?.provider.trim() || entry.provider,
      model: row?.model.trim() || entry.model,
      inputPricePer1m: row ? toPrice(row.input_price_per_1m) : null,
      outputPricePer1m: row ? toPrice(row.output_price_per_1m) : null,
    })
  }

  // 코드 기본값에 없는 기능 키가 로그에만 남아 있을 수 있으므로 DB 행도 빠짐없이 담는다.
  for (const row of rows) {
    if (map.has(row.feature_key)) continue
    map.set(row.feature_key, {
      feature: row.feature_key,
      provider: row.provider,
      model: row.model,
      inputPricePer1m: toPrice(row.input_price_per_1m),
      outputPricePer1m: toPrice(row.output_price_per_1m),
    })
  }

  return map
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  }

  try {
    const days = parseDays(request.nextUrl.searchParams.get('days'))
    const since = periodStart(days)

    const settingsResult = await supabaseAdmin
      .from('ai_model_settings')
      .select('feature_key, provider, model, input_price_per_1m, output_price_per_1m')

    const settingRows: unknown[] = Array.isArray(settingsResult.data) ? settingsResult.data : []
    const priceMap = buildPriceMap(settingRows.filter(isPriceRow))
    const priced = Array.from(priceMap.values()).some(
      (price) => price.inputPricePer1m !== null || price.outputPricePer1m !== null
    )

    const { data, error } = await supabaseAdmin
      .from('ai_usage_logs')
      .select('feature_key, model, prompt_tokens, completion_tokens, total_tokens, success, created_at')
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false })
      .limit(MAX_ROWS)

    if (error) {
      console.error('AI 호출 기록 조회 오류', error)
      return NextResponse.json(
        { success: false, error: '마이그레이션(ai_usage_logs) 실행 후 조회할 수 있습니다.' },
        { status: 500 }
      )
    }

    const raw: unknown[] = Array.isArray(data) ? data : []
    const rows = raw.filter(isLogRow)

    const totals = emptyBucket()
    const featureBuckets = new Map<string, Bucket>()
    const modelBuckets = new Map<string, Bucket>()
    const dailyBuckets = new Map<string, Bucket>()

    for (const row of rows) {
      const cost = rowCost(row, priceMap.get(row.feature_key))
      addRow(totals, row, cost)

      const featureBucket = featureBuckets.get(row.feature_key) ?? emptyBucket()
      addRow(featureBucket, row, cost)
      featureBuckets.set(row.feature_key, featureBucket)

      const modelBucket = modelBuckets.get(row.model) ?? emptyBucket()
      addRow(modelBucket, row, cost)
      modelBuckets.set(row.model, modelBucket)

      if (days > 1) {
        const dateKey = toDateKey(row.created_at)
        const dailyBucket = dailyBuckets.get(dateKey) ?? emptyBucket()
        addRow(dailyBucket, row, cost)
        dailyBuckets.set(dateKey, dailyBucket)
      }
    }

    const byFeature: FeatureSummary[] = Array.from(featureBuckets.entries())
      .map(([featureKey, bucket]) => {
        const price = priceMap.get(featureKey)
        return {
          featureKey,
          feature: price?.feature || featureKey,
          provider: price?.provider || '-',
          model: price?.model || '-',
          ...bucket,
        }
      })
      .sort((a, b) => b.cost - a.cost || b.calls - a.calls)

    const byModel: ModelSummary[] = Array.from(modelBuckets.entries())
      .map(([model, bucket]) => ({ model, ...bucket }))
      .sort((a, b) => b.cost - a.cost || b.calls - a.calls)

    const daily: DailySummary[] = Array.from(dailyBuckets.entries())
      .map(([date, bucket]) => ({
        date,
        calls: bucket.calls,
        totalTokens: bucket.totalTokens,
        cost: bucket.cost,
        unpricedCalls: bucket.unpricedCalls,
      }))
      .sort((a, b) => a.date.localeCompare(b.date))

    return NextResponse.json({
      success: true,
      days,
      since: since.toISOString(),
      priced,
      truncated: rows.length >= MAX_ROWS,
      totals,
      byFeature,
      byModel,
      daily,
    })
  } catch (error) {
    console.error('AI 호출 기록 집계 오류', error)
    return NextResponse.json(
      { success: false, error: 'AI 호출 기록을 불러오지 못했습니다.' },
      { status: 500 }
    )
  }
}
