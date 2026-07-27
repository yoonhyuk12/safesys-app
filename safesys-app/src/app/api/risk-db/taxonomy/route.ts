// 위험요인 DB 분류 캐스케이드(사업별→공사→단위작업→세부단위작업)의 다음 단계 옵션을 돌려주는 라우트
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import type { RiskTaxonomyResponse } from '@/lib/risk-assessment/types'

const PAGE_SIZE = 1000

// PostgREST 응답 상한(설정에 따라 1,000행)에 걸리지 않도록 끝까지 이어 읽는다
async function fetchColumn(
  column: 'business_type' | 'construction' | 'unit_work' | 'detail_work',
  filters: Array<[string, string]>
): Promise<string[]> {
  const values: string[] = []
  for (let page = 0; ; page++) {
    // 정렬을 고정해야 페이지 경계에서 값이 누락되지 않는다
    let query = supabaseAdmin
      .from('risk_hazard_taxonomy')
      .select(column)
      .order(column)
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
    for (const [key, value] of filters) query = query.eq(key, value)

    const { data, error } = await query
    if (error) throw error

    const rows = (data ?? []) as unknown as Array<Record<string, string>>
    values.push(...rows.map((row) => row[column]).filter((value) => !!value))
    if (rows.length < PAGE_SIZE) return values
  }
}

export async function GET(request: NextRequest) {
  const authorization = request.headers.get('authorization')
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!token) {
    return NextResponse.json<RiskTaxonomyResponse>({ success: false, error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) {
    return NextResponse.json<RiskTaxonomyResponse>({ success: false, error: '인증에 실패했습니다.' }, { status: 401 })
  }

  const params = request.nextUrl.searchParams
  const businessType = params.get('businessType')?.trim() || ''
  const construction = params.get('construction')?.trim() || ''
  const unitWork = params.get('unitWork')?.trim() || ''

  // 주어진 파라미터만큼 걸러 그 다음 단계 목록을 낸다
  const filters: Array<[string, string]> = []
  let column: 'business_type' | 'construction' | 'unit_work' | 'detail_work' = 'business_type'
  if (businessType) {
    filters.push(['business_type', businessType])
    column = 'construction'
  }
  if (construction) {
    filters.push(['construction', construction])
    column = 'unit_work'
  }
  if (unitWork) {
    filters.push(['unit_work', unitWork])
    column = 'detail_work'
  }

  try {
    const values = await fetchColumn(column, filters)
    const data = [...new Set(values)].sort((a, b) => a.localeCompare(b, 'ko'))
    return NextResponse.json<RiskTaxonomyResponse>({ success: true, data })
  } catch (error) {
    console.error('위험요인 분류 목록 조회 오류:', error)
    return NextResponse.json<RiskTaxonomyResponse>(
      { success: false, error: '분류 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 500 }
    )
  }
}
