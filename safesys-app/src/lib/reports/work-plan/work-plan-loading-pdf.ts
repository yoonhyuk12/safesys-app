// 붙임2-1 차량계 하역운반기계 등 사용 작업계획서 PDF 생성기 (본표·제원·인양/줄걸이·지도·위험표·체크리스트)

import { LOADING_CHECKLIST } from '../../work-plan/constants'
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

// 본표(기본정보) + 장비 제원(12필드, 원본 레이아웃대로 2필드/행)
function buildMainAndSpec(form: NonNullable<WorkPlanRecord['form_data']['loading']>): string {
  const e = form.equipment
  const workers = escapeHtml((form.workerNames || []).join(', '))
  return `
    ${approvalHeader('차량계 하역운반기계 작업계획서', '수급업체용')}
    <table style="${TABLE}">
      ${colgroup(12)}
      <tr>${cell('작업명(장소)', LABEL, 2)}${cell(escapeHtml(form.title), VALUE, 4)}${cell('작업기간', LABEL, 2)}${cell(escapeHtml([form.workStartDate, form.workEndDate].filter(Boolean).join(' ~ ')), VALUE, 4)}</tr>
      <tr>${cell('차량 번호', LABEL, 2)}${cell(escapeHtml(form.vehicleNumber), VALUE, 4)}${cell('작업시간', LABEL, 2)}${cell(escapeHtml(form.workTime), VALUE, 4)}</tr>
      <tr>${cell('작업업체', LABEL, 2)}${cell('업체명', LABEL, 2)}${cell(escapeHtml(form.companyName), VALUE, 3)}${cell('작업자', LABEL, 2)}${cell(workers, VALUE, 3)}</tr>
      <tr>${cell('작업지휘자', LABEL, 2)}${cell('성명', LABEL)}${cell(escapeHtml(form.workDirector?.name || ''), VALUE, 4)}${cell('연락처', LABEL, 2)}${cell(escapeHtml(form.workDirector?.phone || ''), VALUE, 3)}</tr>
      <tr>${cell('운전원', LABEL, 2)}${cell('성명', LABEL)}${cell(escapeHtml(form.operator?.name || ''), VALUE, 4)}${cell('연락처', LABEL, 2)}${cell(escapeHtml(form.operator?.phone || ''), VALUE, 3)}</tr>
      <tr>${cell('유도자', LABEL, 2)}${cell('성명', LABEL)}${cell(escapeHtml(form.guide?.name || ''), VALUE, 4)}${cell('연락처', LABEL, 2)}${cell(escapeHtml(form.guide?.phone || ''), VALUE, 3)}</tr>
      <tr>${cell('작업내용 공유', LABEL, 2)}${cell(escapeHtml(form.sharedWorkContent), LEFT, 10)}</tr>
    </table>
    ${sectionTitle('<차량계 하역운반기계 제원>')}
    <table style="${TABLE}">
      ${colgroup(12)}
      <tr>${cell('장비명', LABEL, 3)}${cell(escapeHtml(e.equipmentName), VALUE, 3)}${cell('차량/장비번호', LABEL, 3)}${cell(escapeHtml(e.registrationNumber), VALUE, 3)}</tr>
      <tr>${cell('모델명/생산년도', LABEL, 3)}${cell(escapeHtml(e.modelAndYear), VALUE, 3)}${cell('보험기간', LABEL, 3)}${cell(escapeHtml(e.insurancePeriod), VALUE, 3)}</tr>
      <tr>${cell('소유회사명', LABEL, 3)}${cell(escapeHtml(e.ownerCompany), VALUE, 3)}${cell('검사유효기간', LABEL, 3)}${cell(escapeHtml(e.inspectionValidity), VALUE, 3)}</tr>
      <tr>${cell('차체 중량', LABEL, 3)}${cell(e.bodyWeightTon ? `${escapeHtml(e.bodyWeightTon)} ton` : '', VALUE, 3)}${cell('장비폭', LABEL, 3)}${cell(e.widthM ? `${escapeHtml(e.widthM)} m` : '', VALUE, 3)}</tr>
      <tr>${cell('최소선회반경', LABEL, 3)}${cell(e.minimumTurningRadiusM ? `${escapeHtml(e.minimumTurningRadiusM)} m` : '', VALUE, 3)}${cell('최대인양높이', LABEL, 3)}${cell(e.maximumLiftingHeightM ? `${escapeHtml(e.maximumLiftingHeightM)} m` : '', VALUE, 3)}</tr>
      <tr>${cell('작업반경', LABEL, 3)}${cell(e.workingRadiusM ? `${escapeHtml(e.workingRadiusM)} m` : '', VALUE, 3)}${cell('인양·운반하중', LABEL, 3)}${cell(escapeHtml(e.maxAndRatedLoadTon) || '최대( )t / 정격( )t', VALUE, 3)}</tr>
    </table>
    ${liftingReviewTable(form.liftingReview)}
    ${riggingReviewTable(form.riggingReview)}`
}

export async function downloadLoadingWorkPlanPdf(record: WorkPlanRecord): Promise<void> {
  const form = record.form_data.loading
  if (!form) throw new Error('하역운반기계 작업계획서 데이터가 없습니다.')

  const page1 = buildMainAndSpec(form)
  const page2 = `
    ${mapSection('<운반경로 및 작업방법>', record.map_image_url)}
    ${riskControlTable('<위험요인 및 개선대책>', '작업순서', form.riskControls || [])}`
  const page3 = checklistTable('<산업재해 예방을 위한 체크리스트>', LOADING_CHECKLIST, form.checklist || [])

  const fileName = buildFileName('loading', record.title, record.work_start_date)
  await renderWorkPlanPdf([page1, page2, page3], fileName)
}
