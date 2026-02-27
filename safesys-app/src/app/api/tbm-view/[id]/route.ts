import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

// 공개 반환할 필드 (민감정보 제외)
const PUBLIC_FIELDS = [
  'id',
  'project_name',
  'meeting_date',
  'education_start_time',
  'education_end_time',
  'today_work',
  'potential_risk_1', 'solution_1',
  'potential_risk_2', 'solution_2',
  'potential_risk_3', 'solution_3',
  'main_risk_selection', 'main_risk_solution',
  'risk_factor_1', 'risk_factor_2', 'risk_factor_3',
  'other_remarks',
  'personnel_count',
  'equipment_input',
  'risk_work_type',
].join(',')

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // UUID 형식 기본 검증
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(id)) {
    return NextResponse.json(
      { error: '유효하지 않은 ID입니다.' },
      { status: 400 }
    )
  }

  const { data, error } = await supabaseAdmin
    .from('tbm_submissions')
    .select(PUBLIC_FIELDS)
    .eq('id', id)
    .single()

  if (error || !data) {
    return NextResponse.json(
      { error: '데이터를 찾을 수 없습니다.' },
      { status: 404 }
    )
  }

  return NextResponse.json(data)
}
