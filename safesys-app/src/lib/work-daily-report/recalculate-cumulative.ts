// 작업일보 전체 누계 재계산 (결정적 — AI 미사용)
// 저장된 모든 일보를 날짜순으로 순회하며 분류(장비명/직종)별로
//   전일까지 = 직전까지의 누계, 누계 = 전일까지 + 금일
// 을 다시 계산해 저장한다. 금일투입 값은 절대 변경하지 않는다.
// 과거 날짜를 나중에 입력(백필)해도 이 재계산으로 이후 일보(오늘 포함)에 분류·누계가 전파된다.

import { supabase } from '@/lib/supabase'
import {
  EquipmentRow,
  PersonnelRow,
  ensureUnclassifiedEquipment,
  ensureUnclassifiedPersonnel,
} from './work-daily-report-types'

export interface RecalcResult {
  totalReports: number
  updatedReports: number
}

const toNum = (v: string | undefined): number => {
  const n = parseFloat(v || '')
  return isNaN(n) ? 0 : n
}

// 부동소수점 오차 제거 표기 (0은 빈 문자열 — 서식상 공란 유지)
const fmt = (n: number): string => (n > 0 ? String(Math.round(n * 1000) / 1000) : '')

export async function recalculateCumulativeForProject(projectId: string): Promise<RecalcResult> {
  const { data, error } = await supabase
    .from('work_daily_reports')
    .select('id, report_date, equipment_rows, personnel_rows')
    .eq('project_id', projectId)
    .order('report_date', { ascending: true })
  if (error) throw new Error(error.message)

  const reports = data || []
  // 분류별 누적 현황 (날짜순 진행)
  const equipCum = new Map<string, { cum: number; spec: string }>()
  const personCum = new Map<string, number>()
  let updatedReports = 0

  for (const report of reports) {
    // ── 장비: 기존 행 재계산
    const eqRows: EquipmentRow[] = report.equipment_rows || []
    const newEq: EquipmentRow[] = eqRows.map(row => {
      const key = (row.name || '').trim()
      if (!key) return row
      const prevInfo = equipCum.get(key)
      const prev = prevInfo?.cum ?? 0
      const cum = prev + toNum(row.todayCount)
      equipCum.set(key, { cum, spec: row.spec?.trim() || prevInfo?.spec || '' })
      return { ...row, prevCount: fmt(prev), cumulativeCount: fmt(cum) }
    })
    // 이전 일보들에 등장했지만 이 일보에 없는 분류는 누계 승계 행으로 추가
    const eqNames = new Set(newEq.map(r => r.name.trim()).filter(Boolean))
    for (const [key, info] of equipCum) {
      if (info.cum > 0 && !eqNames.has(key)) {
        newEq.push({
          name: key,
          spec: info.spec,
          prevCount: fmt(info.cum),
          todayCount: '',
          cumulativeCount: fmt(info.cum),
        })
      }
    }
    const finalEq = ensureUnclassifiedEquipment(newEq)

    // ── 인력: 동일 로직
    const personRows: PersonnelRow[] = report.personnel_rows || []
    const newPerson: PersonnelRow[] = personRows.map(row => {
      const key = (row.category || '').trim()
      if (!key) return row
      const prev = personCum.get(key) ?? 0
      const cum = prev + toNum(row.todayCount)
      personCum.set(key, cum)
      return { ...row, prevCount: fmt(prev), cumulativeCount: fmt(cum) }
    })
    const personNames = new Set(newPerson.map(r => r.category.trim()).filter(Boolean))
    for (const [key, cum] of personCum) {
      if (cum > 0 && !personNames.has(key)) {
        newPerson.push({
          category: key,
          prevCount: fmt(cum),
          todayCount: '',
          cumulativeCount: fmt(cum),
          remarks: '',
        })
      }
    }
    const finalPerson = ensureUnclassifiedPersonnel(newPerson)

    // 변경된 일보만 저장
    const changed =
      JSON.stringify(finalEq) !== JSON.stringify(report.equipment_rows) ||
      JSON.stringify(finalPerson) !== JSON.stringify(report.personnel_rows)

    if (changed) {
      const { error: updateError } = await supabase
        .from('work_daily_reports')
        .update({
          equipment_rows: finalEq,
          personnel_rows: finalPerson,
          updated_at: new Date().toISOString(),
        })
        .eq('id', report.id)
      if (updateError) throw new Error(`${report.report_date} 저장 실패: ${updateError.message}`)
      updatedReports++
    }
  }

  return { totalReports: reports.length, updatedReports }
}
