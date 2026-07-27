// 수시 위험성평가 저장 레코드(risk_assessments 행)와 표 행·엑셀 입력 변환 헬퍼

import type {
  RiskAiJudgement,
  RiskAiRowDraft,
  RiskAssessmentExportData,
  RiskAssessmentRow,
  RiskAssessmentSignatures,
  RiskHazard,
} from '@/lib/risk-assessment/types'
import { riskGrade } from '@/lib/risk-assessment/types'

/** risk_assessments 테이블 행 — types.ts RiskAssessment의 snake_case 매핑 */
export interface RiskAssessmentRecord {
  id: string
  project_id: string
  assessment_type: '수시'
  title: string
  business_type: string | null
  trigger: string
  author_name: string
  manage_period_start: string | null
  manage_period_end: string | null
  rows: RiskAssessmentRow[]
  signatures: RiskAssessmentSignatures
  created_by: string | null
  created_at: string
  updated_at: string
}

/** 사업별 선택에서 "사업 무관(전체)"를 나타내는 센티널 (저장 시 null) */
export const BUSINESS_TYPE_ALL = '__all__'

/** 개선 후 위험성은 3 이하 관리가 목표라 현재 점수와 3 중 작은 값을 기본으로 둔다. */
function defaultImprovedRisk(frequency: number, intensity: number): number {
  return Math.min(3, riskGrade(frequency, intensity).score)
}

/** DB 위험요인 원문 + AI 판정값을 평가서 표의 1행으로 만든다. 텍스트는 원문 그대로 옮긴다. */
export function createRowFromHazard(
  hazard: RiskHazard,
  judgement: RiskAiJudgement | undefined,
  detailWork: string
): RiskAssessmentRow {
  const frequency = judgement?.frequency ?? 2
  const intensity = judgement?.intensity ?? 2
  return {
    hazardId: hazard.id,
    detailWork: detailWork || hazard.detailWork,
    workLocation: '',
    equipment: judgement?.equipment || '',
    hazard: hazard.hazard,
    disasterType: hazard.disasterType,
    frequency,
    intensity,
    measures: [...hazard.measures],
    reviewNote: '',
    improvedRisk: defaultImprovedRisk(frequency, intensity),
    improveDate: '',
    managerSub: '',
    managerMain: '',
  }
}

/** AI가 작성한 행 초안을 표 행으로 바꾼다. hazardId는 null이라 DB 원문 행과 구분된다. */
export function createRowFromDraft(
  draft: RiskAiRowDraft,
  detailWork: string,
  workLocation: string
): RiskAssessmentRow {
  return {
    hazardId: null,
    detailWork,
    workLocation,
    equipment: draft.equipment,
    hazard: draft.hazard,
    disasterType: draft.disasterType,
    frequency: draft.frequency,
    intensity: draft.intensity,
    measures: [...draft.measures],
    reviewNote: '',
    improvedRisk: defaultImprovedRisk(draft.frequency, draft.intensity),
    improveDate: '',
    managerSub: '',
    managerMain: '',
  }
}

/** 인원·장비 입력을 AI에 넘길 현장 부가 정보 한 줄로 합친다. */
export function buildSiteContext(personnel: string, equipment: string): string {
  return [
    personnel.trim() ? `인원: ${personnel.trim()}` : '',
    equipment.trim() ? `장비: ${equipment.trim()}` : '',
  ].filter(Boolean).join(' / ')
}

/** 사용자가 직접 추가하는 빈 행 */
export function createEmptyRow(detailWork: string): RiskAssessmentRow {
  return {
    hazardId: null,
    detailWork,
    workLocation: '',
    equipment: '',
    hazard: '',
    disasterType: '',
    frequency: 1,
    intensity: 1,
    measures: [],
    reviewNote: '',
    improvedRisk: 1,
    improveDate: '',
    managerSub: '',
    managerMain: '',
  }
}

/** YYYY-MM-DD → YY.MM.DD */
function toShortDate(value: string): string {
  const parts = value.slice(0, 10).split('-')
  if (parts.length !== 3) return value
  return `${parts[0].slice(2)}.${parts[1]}.${parts[2]}`
}

/** 관리기간 표기 (예: 26.07.27~26.08.02(7일간)) */
export function formatManagePeriod(start: string | null, end: string | null): string {
  if (!start || !end) return start || end || ''
  const startDate = new Date(`${start.slice(0, 10)}T00:00:00`)
  const endDate = new Date(`${end.slice(0, 10)}T00:00:00`)
  const range = `${toShortDate(start)}~${toShortDate(end)}`
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return range
  const days = Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1
  return days > 0 ? `${range}(${days}일간)` : range
}

/** YYYY-MM-DD(또는 ISO) → YYYY.MM.DD */
function toDotDate(value: string): string {
  return value.slice(0, 10).replace(/-/g, '.')
}

/** 저장된 평가서를 엑셀 출력 입력으로 변환한다. */
export function toExportData(record: RiskAssessmentRecord, siteName: string): RiskAssessmentExportData {
  return {
    siteName,
    writtenDate: toDotDate(record.created_at),
    authorName: record.author_name,
    managePeriod: formatManagePeriod(record.manage_period_start, record.manage_period_end),
    rows: record.rows,
    signatures: record.signatures,
  }
}
