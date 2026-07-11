// 붙임2-4 중량물 취급 작업계획서 PDF 생성기 (본표·운반경로·중량물/기계 제원·인양/줄걸이·위험표·체크리스트)

import { HEAVY_CHECKLIST } from '../../work-plan/constants'
import type { WorkPlanRecord } from '../../work-plan/types'
import {
  TABLE,
  LABEL,
  VALUE,
  LEFT,
  cell,
  colgroup,
  escapeHtml,
  sectionTitle,
  approvalHeader,
  mapSection,
  riskControlTable,
  checklistTable,
  liftingReviewTable,
  riggingReviewTable,
  buildFileName,
  renderWorkPlanPdf,
} from './work-plan-pdf-common'

type HeavyForm = NonNullable<WorkPlanRecord['form_data']['heavy']>

// 본표(기본정보) + 운반경로(지도)
function buildMainPage(form: HeavyForm, record: WorkPlanRecord): string {
  const workers = escapeHtml((form.workerNames || []).join(', '))
  return `
    ${approvalHeader('중량물 취급 작업계획서', '수급업체용')}
    <table style="${TABLE}">
      ${colgroup(12)}
      <tr>${cell('작업명(장소)', LABEL, 2)}${cell(escapeHtml(form.title), VALUE, 4)}${cell('작업기간', LABEL, 2)}${cell(escapeHtml([form.workStartDate, form.workEndDate].filter(Boolean).join(' ~ ')), VALUE, 4)}</tr>
      <tr>${cell('작업업체', LABEL, 2)}${cell('업체명', LABEL, 2)}${cell(escapeHtml(form.companyName), VALUE, 3)}${cell('작업자', LABEL, 2)}${cell(workers, VALUE, 3)}</tr>
      <tr>${cell('작업지휘자', LABEL, 2)}${cell('성명', LABEL)}${cell(escapeHtml(form.workDirector?.name || ''), VALUE, 4)}${cell('연락처', LABEL, 2)}${cell(escapeHtml(form.workDirector?.phone || ''), VALUE, 3)}</tr>
      <tr>${cell('운전원', LABEL, 2)}${cell('성명', LABEL)}${cell(escapeHtml(form.operator?.name || ''), VALUE, 4)}${cell('연락처', LABEL, 2)}${cell(escapeHtml(form.operator?.phone || ''), VALUE, 3)}</tr>
      <tr>${cell('유도자', LABEL, 2)}${cell('성명', LABEL)}${cell(escapeHtml(form.guide?.name || ''), VALUE, 4)}${cell('연락처', LABEL, 2)}${cell(escapeHtml(form.guide?.phone || ''), VALUE, 3)}</tr>
      <tr>${cell('작업내용 공유', LABEL, 2)}${cell(escapeHtml(form.sharedWorkContent), LEFT, 10)}</tr>
    </table>
    ${mapSection('<운반경로 등>', record.map_image_url)}`
}

// 중량물 제원 + 기계 제원 + 인양/줄걸이 + 작업별 위험요인
function buildSpecPage(form: HeavyForm): string {
  const l = form.load
  const m = form.machine
  return `
    ${sectionTitle('<중량물제원>')}
    <table style="${TABLE}">
      ${colgroup(12)}
      <tr>${cell('품 명', LABEL, 3)}${cell(escapeHtml(l.itemName), VALUE, 3)}${cell('중량물 형상', LABEL, 3)}${cell(escapeHtml(l.shape), VALUE, 3)}</tr>
      <tr>${cell('중량물 규격', LABEL, 3)}${cell(escapeHtml(l.dimensions) || '(너비)×(길이)×(높이)', LEFT, 9)}</tr>
      <tr>${cell('중량', LABEL, 3)}${cell(l.weightKg ? `${escapeHtml(l.weightKg)} kg` : '&nbsp; kg', VALUE, 3)}${cell('1회 운반중량', LABEL, 3)}${cell(l.transportWeightKg ? `${escapeHtml(l.transportWeightKg)} kg` : '&nbsp; kg', VALUE, 3)}</tr>
      <tr>${cell('고정방법', LABEL, 3)}${cell(escapeHtml(l.fixingMethod), LEFT, 9)}</tr>
    </table>
    ${sectionTitle('<기계제원(크레인 등)>')}
    <table style="${TABLE}">
      ${colgroup(12)}
      <tr>${cell('기계명(장비)', LABEL, 3)}${cell(escapeHtml(m.machineName), VALUE, 3)}${cell('형식번호', LABEL, 3)}${cell(escapeHtml(m.modelNumber), VALUE, 3)}</tr>
      <tr>${cell('거더형식', LABEL, 3)}${cell(escapeHtml(m.girderType), VALUE, 3)}${cell('기계규격', LABEL, 3)}${cell(escapeHtml(m.machineSpecification), VALUE, 3)}</tr>
      <tr>${cell('제조년월일', LABEL, 3)}${cell(escapeHtml(m.manufacturedDate), VALUE, 3)}${cell('보험가입여부', LABEL, 3)}${cell(escapeHtml(m.insured), VALUE, 3)}</tr>
      <tr>${cell('정격하중', LABEL, 3)}${cell(escapeHtml(m.ratedLoad), VALUE, 3)}${cell('조작방식', LABEL, 3)}${cell(escapeHtml(m.controlMethod), VALUE, 3)}</tr>
      <tr>${cell('검사여부', LABEL, 3)}${cell(escapeHtml(m.inspectionResult), VALUE, 3)}${cell('유효기간', LABEL, 3)}${cell(escapeHtml(m.validityPeriod), VALUE, 3)}</tr>
    </table>
    ${liftingReviewTable(form.liftingReview)}
    ${riggingReviewTable(form.riggingReview)}
    ${riskControlTable('<작업별 위험요인 및 개선대책>', '작업', form.riskControls || [])}`
}

export async function downloadHeavyWorkPlanPdf(record: WorkPlanRecord): Promise<void> {
  const form = record.form_data.heavy
  if (!form) throw new Error('중량물 취급 작업계획서 데이터가 없습니다.')

  const page1 = buildMainPage(form, record)
  const page2 = buildSpecPage(form)
  const page3 = checklistTable('<산업재해 예방을 위한 체크리스트>', HEAVY_CHECKLIST, form.checklist || [])

  const fileName = buildFileName('heavy', record.title, record.work_start_date)
  await renderWorkPlanPdf([page1, page2, page3], fileName)
}
