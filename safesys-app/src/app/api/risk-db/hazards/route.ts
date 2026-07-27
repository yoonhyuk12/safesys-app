// 선택한 세부단위작업의 유해·위험요인과 감소대책 원문을 돌려주는 라우트
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import type { RiskHazard, RiskHazardsResponse } from '@/lib/risk-assessment/types'

// 감소대책은 sort_order 순으로 이어 붙인다
interface HazardRow {
  id: number
  excel_no: number | null
  business_type: string
  construction: string
  unit_work: string
  detail_work: string
  hazard: string
  disaster_type: string
  related_law: string
  work_permit: string
  flag_serious: boolean
  flag_accident_case: boolean
  flag_near_miss: boolean
  flag_sif: boolean
  flag_profile: boolean
  risk_hazard_measures: Array<{ measure: string; sort_order: number }>
}

const SELECT_COLUMNS =
  'id, excel_no, business_type, construction, unit_work, detail_work, hazard, disaster_type, related_law, work_permit, ' +
  'flag_serious, flag_accident_case, flag_near_miss, flag_sif, flag_profile, ' +
  'risk_hazard_measures(measure, sort_order)'

const toHazard = (row: HazardRow): RiskHazard => ({
  id: row.id,
  excelNo: row.excel_no,
  businessType: row.business_type,
  construction: row.construction,
  unitWork: row.unit_work,
  detailWork: row.detail_work,
  hazard: row.hazard,
  disasterType: row.disaster_type,
  relatedLaw: row.related_law,
  workPermit: row.work_permit,
  flagSerious: row.flag_serious,
  flagAccidentCase: row.flag_accident_case,
  flagNearMiss: row.flag_near_miss,
  flagSif: row.flag_sif,
  flagProfile: row.flag_profile,
  measures: [...(row.risk_hazard_measures ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((measure) => measure.measure),
})

export async function GET(request: NextRequest) {
  const authorization = request.headers.get('authorization')
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!token) {
    return NextResponse.json<RiskHazardsResponse>({ success: false, error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) {
    return NextResponse.json<RiskHazardsResponse>({ success: false, error: '인증에 실패했습니다.' }, { status: 401 })
  }

  const params = request.nextUrl.searchParams
  const businessType = params.get('businessType')?.trim() || ''
  const construction = params.get('construction')?.trim() || ''
  const unitWork = params.get('unitWork')?.trim() || ''
  const detailWork = params.get('detailWork')?.trim() || ''

  if (!construction || !unitWork || !detailWork) {
    return NextResponse.json<RiskHazardsResponse>(
      { success: false, error: '공사·단위작업·세부단위작업을 모두 지정해 주세요.' },
      { status: 400 }
    )
  }

  // businessType이 없으면 사업 무관(전체) 조회
  let query = supabaseAdmin
    .from('risk_hazards')
    .select(SELECT_COLUMNS)
    .eq('construction', construction)
    .eq('unit_work', unitWork)
    .eq('detail_work', detailWork)
    .order('id')
  if (businessType) query = query.eq('business_type', businessType)

  const { data, error } = await query
  if (error) {
    console.error('위험요인 조회 오류:', error)
    return NextResponse.json<RiskHazardsResponse>(
      { success: false, error: '위험요인을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 500 }
    )
  }

  const rows = (data ?? []) as unknown as HazardRow[]
  return NextResponse.json<RiskHazardsResponse>({ success: true, data: rows.map(toHazard) })
}
