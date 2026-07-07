// 공사감독일지 '3. 기록사항'용 일자별 기록(지급자재 반입·각 점검 등록건)을 조회해 한 줄 텍스트 맵으로 만드는 유틸

import { supabase } from '@/lib/supabase'

/**
 * 기간 내 프로젝트의 기록사항 라인을 일자별로 수집
 * @returns Map<YYYY-MM-DD, 한 줄 텍스트 배열>
 */
export async function loadDiaryRecordLogs(
  projectId: string,
  startDate: string,
  endDate: string
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>()

  const addLine = (date: string | null | undefined, line: string) => {
    if (!date) return
    const key = date.slice(0, 10)
    const lines = map.get(key) || []
    map.set(key, [...lines, line])
  }

  const [
    materialRes,
    heatWaveRes,
    hqRes,
    managerRes,
    safetyRes,
    tbmSafetyRes,
    safeDocRes,
    inspectionReqRes,
    visitLogRes,
  ] = await Promise.all([
    // 지급자재 반입 (자재 수불부)
    supabase
      .from('material_ledger_entries')
      .select('receive_date, receive_qty, name_or_spec, materials!inner(project_id, name, unit)')
      .eq('materials.project_id', projectId)
      .not('receive_date', 'is', null)
      .gte('receive_date', startDate)
      .lte('receive_date', endDate),
    // 폭염대비점검
    supabase
      .from('heat_wave_checks')
      .select('check_time, inspector_name')
      .eq('project_id', projectId)
      .gte('check_time', `${startDate}T00:00:00`)
      .lte('check_time', `${endDate}T23:59:59`),
    // (본부) 안전점검
    supabase
      .from('headquarters_inspections')
      .select('inspection_date, inspector_name')
      .eq('project_id', projectId)
      .gte('inspection_date', startDate)
      .lte('inspection_date', endDate),
    // (지사) 안전점검
    supabase
      .from('manager_inspections')
      .select('inspection_date, inspector_name')
      .eq('project_id', projectId)
      .gte('inspection_date', startDate)
      .lte('inspection_date', endDate),
    // 정기점검 (해빙, 우기, 종합, 특별)
    supabase
      .from('safety_inspections')
      .select('inspection_date, inspection_type')
      .eq('project_id', projectId)
      .gte('inspection_date', startDate)
      .lte('inspection_date', endDate),
    // 관리자 TBM 활동 점검
    supabase
      .from('tbm_safety_inspections')
      .select('tbm_date, attendee, supervisor')
      .eq('project_id', projectId)
      .gte('tbm_date', startDate)
      .lte('tbm_date', endDate),
    // 안전서류 점검
    supabase
      .from('safe_document_inspections')
      .select('inspection_date, inspector_name')
      .eq('project_id', projectId)
      .gte('inspection_date', startDate)
      .lte('inspection_date', endDate),
    // 검사/검측 요청
    supabase
      .from('inspection_requests')
      .select('request_date, inspection_part, structure_name')
      .eq('project_id', projectId)
      .gte('request_date', startDate)
      .lte('request_date', endDate),
    // 단속·점검 방문일지
    supabase
      .from('inspection_visit_logs')
      .select('visit_date, visit_basis_purpose')
      .eq('project_id', projectId)
      .gte('visit_date', startDate)
      .lte('visit_date', endDate),
  ])

  const results = [materialRes, heatWaveRes, hqRes, managerRes, safetyRes, tbmSafetyRes, safeDocRes, inspectionReqRes, visitLogRes]
  results.forEach((res) => {
    if (res.error) console.error('기록사항 조회 오류:', res.error)
  })

  const inspectorSuffix = (name?: string | null) => (name ? ` (점검자: ${name})` : '')

  for (const row of materialRes.data || []) {
    const material = row.materials as unknown as { name?: string; unit?: string } | null
    const name = material?.name || ''
    const spec = row.name_or_spec && row.name_or_spec !== name ? ` (${row.name_or_spec})` : ''
    const qty = row.receive_qty != null ? ` ${Number(row.receive_qty).toLocaleString()}${material?.unit || ''}` : ''
    addLine(row.receive_date, `○ 지급자재 반입 : ${name}${spec}${qty}`)
  }

  for (const row of heatWaveRes.data || []) {
    const time = typeof row.check_time === 'string' ? row.check_time.slice(11, 16) : ''
    const detail = [time, row.inspector_name ? `점검자: ${row.inspector_name}` : ''].filter(Boolean).join(', ')
    addLine(row.check_time, `○ 폭염대비점검 실시${detail ? ` (${detail})` : ''}`)
  }

  for (const row of hqRes.data || []) {
    addLine(row.inspection_date, `○ 본부 안전점검 실시${inspectorSuffix(row.inspector_name)}`)
  }

  for (const row of managerRes.data || []) {
    addLine(row.inspection_date, `○ 지사 안전점검 실시${inspectorSuffix(row.inspector_name)}`)
  }

  for (const row of safetyRes.data || []) {
    addLine(row.inspection_date, `○ 정기점검${row.inspection_type ? `(${row.inspection_type})` : ''} 실시`)
  }

  for (const row of tbmSafetyRes.data || []) {
    addLine(row.tbm_date, `○ 관리자 TBM 활동 점검 실시${inspectorSuffix(row.attendee || row.supervisor)}`)
  }

  for (const row of safeDocRes.data || []) {
    addLine(row.inspection_date, `○ 안전서류 점검 실시${inspectorSuffix(row.inspector_name)}`)
  }

  for (const row of inspectionReqRes.data || []) {
    const part = row.inspection_part || row.structure_name
    addLine(row.request_date, `○ 검사/검측 요청${part ? ` : ${part}` : ''}`)
  }

  for (const row of visitLogRes.data || []) {
    addLine(row.visit_date, `○ 단속·점검 방문${row.visit_basis_purpose ? ` : ${row.visit_basis_purpose}` : ''}`)
  }

  return map
}
