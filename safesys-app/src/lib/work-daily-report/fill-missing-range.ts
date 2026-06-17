// 작업일보 미생성 구간 자동 채우기 — 최근 일보를 기준으로 TBM 있는 미생성 날짜(어제까지)를 준비
// 1) 최근 일보(baseline)의 인원·장비 명단을 AI 분류 시드 어휘로 삼아 기존 일보와 분류명 일관성 유지
// 2) classifyTbmForGeneration에 endDate(어제)를 넘겨 오늘 이후는 제외
// 저장은 generate-from-tbm의 saveGeneratedReports를 그대로 재사용한다.

import { supabase } from '@/lib/supabase'
import {
  classifyTbmForGeneration,
  ClassifyResult,
  GenerateProgress,
} from './generate-from-tbm'
import {
  EquipmentRow,
  PersonnelRow,
  UNCLASSIFIED_LABEL,
  isRealWorkReport,
} from './work-daily-report-types'

interface BaselineReport {
  report_date: string
  author_name: string
  checker_name: string
  equipment_rows: EquipmentRow[]
  personnel_rows: PersonnelRow[]
}

export interface MissingRangePrep {
  needsStage1: boolean        // 기준 일보가 없어 1단계 초안생성이 먼저 필요한 경우
  baselineDate?: string       // 기준이 된 최근 일보 작성일
  baselineAuthor?: string     // 생성 일보의 작성자/확인자 기본값
  result?: ClassifyResult     // 분류 결과(생성 대상 days 포함)
}

// 가장 최근의 '실제' 작업일보 1건 (명단 시드 + 작성자 기본값 출처)
// 공정률만 입력된 앵커 행은 건너뛰고, 작업내용이 있는 최근 일보를 기준으로 삼는다.
async function loadBaselineReport(projectId: string): Promise<BaselineReport | null> {
  const { data, error } = await supabase
    .from('work_daily_reports')
    .select('report_date, author_name, checker_name, today_work, tomorrow_work, participants, equipment_rows, personnel_rows')
    .eq('project_id', projectId)
    .order('report_date', { ascending: false })
  if (error) throw new Error(error.message)
  const real = (data || []).find(r => isRealWorkReport(r))
  return (real as BaselineReport | undefined) ?? null
}

// 로컬 기준 어제 날짜 (YYYY-MM-DD) — 월/연 경계는 Date 정규화로 처리
export function yesterdayStr(today: Date): string {
  const y = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  return `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`
}

export async function prepareMissingRangeFill(params: {
  projectId: string
  projectName: string
  managingHq?: string
  managingBranch?: string
  latitude?: number | null
  longitude?: number | null
  today: Date
  onProgress?: (p: GenerateProgress) => void
}): Promise<MissingRangePrep> {
  const { projectId, projectName, managingHq, managingBranch, latitude, longitude, today, onProgress } = params

  const baseline = await loadBaselineReport(projectId)
  if (!baseline) return { needsStage1: true }

  const seedEquipmentVocab = (baseline.equipment_rows ?? [])
    .map(r => (r.name || '').trim())
    .filter(n => n && n !== UNCLASSIFIED_LABEL)
  const seedPersonnelVocab = (baseline.personnel_rows ?? [])
    .map(r => (r.category || '').trim())
    .filter(n => n && n !== UNCLASSIFIED_LABEL)

  const result = await classifyTbmForGeneration({
    projectId, projectName, managingHq, managingBranch, latitude, longitude,
    endDate: yesterdayStr(today),
    seedEquipmentVocab,
    seedPersonnelVocab,
    realReportDatesOnly: true,  // 공정률 전용 앵커 날짜도 미생성으로 보고 채움(공정률 보존)
    onProgress,
  })

  return {
    needsStage1: false,
    baselineDate: baseline.report_date,
    baselineAuthor: baseline.author_name || baseline.checker_name || '',
    result,
  }
}
