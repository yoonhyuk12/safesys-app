// 붙임2-2 차량계 건설기계 등 사용 작업계획서 PDF 생성기 (사전조사표·본표·작업계획도·종류성능·위험표·체크리스트)

import {
  CONSTRUCTION_CHECKLIST,
  CONSTRUCTION_SURVEY_ITEMS,
  CONSTRUCTION_SURVEY_TYPE_OPTIONS,
} from '../../work-plan/constants'
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
  buildFileName,
  coverPage,
  renderWorkPlanPdf,
} from './work-plan-pdf-common'

type ConstructionForm = NonNullable<WorkPlanRecord['form_data']['construction']>

// 사전조사표 — 선택된 surveyType의 항목만, 조사내용=finding, photoUrl 있으면 이미지 셀
function buildSurveyPage(form: ConstructionForm): string {
  const items = CONSTRUCTION_SURVEY_ITEMS[form.surveyType] || []
  const typeLabel = CONSTRUCTION_SURVEY_TYPE_OPTIONS.find((o) => o.value === form.surveyType)?.label || ''
  const byIndex = new Map(form.surveyEntries?.map((s) => [s.itemIndex, s]) || [])
  const rows = items
    .map((label, i) => {
      const entry = byIndex.get(i)
      const photo = entry?.photoUrl
        ? `<img src="${escapeHtml(entry.photoUrl)}" style="max-width:100%; max-height:38mm; object-fit:contain;" crossorigin="anonymous" />`
        : ''
      return `<tr>${cell(`◦ ${escapeHtml(label)}`, `${LEFT} height:40mm;`, 5)}${cell(escapeHtml(entry?.finding || ''), LEFT, 4)}${cell(photo, VALUE, 3)}</tr>`
    })
    .join('')
  return `
    <div style="font-weight:bold; font-size:15px; margin-bottom:6px;">□ 사전조사표</div>
    <div style="font-size:13px; margin-bottom:4px;">❍ ${escapeHtml(typeLabel)}</div>
    <table style="${TABLE} margin-top:0;">
      ${colgroup(12)}
      <tr>${cell('사전조사 항목', LABEL, 5)}${cell('조사내용', LABEL, 4)}${cell('현장사진', LABEL, 3)}</tr>
      ${rows}
    </table>`
}

// 본표 + 작업계획도(지도) + 종류·성능
function buildMainPage(form: ConstructionForm, record: WorkPlanRecord): string {
  const e = form.equipment
  const workers = escapeHtml((form.workerNames || []).join(', '))
  const sequence = escapeHtml((form.workSequence || []).join(' → '))
  return `
    ${approvalHeader('차량계 건설기계 등 작업계획서', '수급업체용')}
    <table style="${TABLE}">
      ${colgroup(12)}
      <tr>${cell('작업명(장소)', LABEL, 2)}${cell(escapeHtml(form.title), VALUE, 4)}${cell('작업기간', LABEL, 2)}${cell(escapeHtml([form.workStartDate, form.workEndDate].filter(Boolean).join(' ~ ')), VALUE, 4)}</tr>
      <tr>${cell('차량 번호', LABEL, 2)}${cell('', VALUE, 4)}${cell('작업시간', LABEL, 2)}${cell('', VALUE, 4)}</tr>
      <tr>${cell('작업업체', LABEL, 2)}${cell('업체명', LABEL, 2)}${cell(escapeHtml(form.companyName), VALUE, 3)}${cell('작업자', LABEL, 2)}${cell(workers, VALUE, 3)}</tr>
      <tr>${cell('작업지휘자', LABEL, 2)}${cell('성명', LABEL)}${cell(escapeHtml(form.workDirector?.name || ''), VALUE, 4)}${cell('연락처', LABEL, 2)}${cell(escapeHtml(form.workDirector?.phone || ''), VALUE, 3)}</tr>
      <tr>${cell('운전원', LABEL, 2)}${cell('성명', LABEL)}${cell(escapeHtml(form.operator?.name || ''), VALUE, 3)}${cell('연락처', LABEL)}${cell(escapeHtml(form.operator?.phone || ''), VALUE, 2)}${cell('면허', LABEL)}${cell(escapeHtml(form.operatorLicense), VALUE, 2)}</tr>
      <tr>${cell('유도자', LABEL, 2)}${cell('성명', LABEL)}${cell(escapeHtml(form.guide?.name || ''), VALUE, 3)}${cell('연락처', LABEL)}${cell(escapeHtml(form.guide?.phone || ''), VALUE, 2)}${cell('신호방법', LABEL)}${cell(escapeHtml(form.guideSignalMethod), VALUE, 2)}</tr>
      <tr>${cell('작업방법', LABEL, 2)}${cell(escapeHtml(form.workMethod), LEFT, 10)}</tr>
      <tr>${cell('작업순서', LABEL, 2)}${cell(sequence, LEFT, 10)}</tr>
    </table>
    ${mapSection('차량계 건설기계 작업계획도', record.map_image_url)}
    ${sectionTitle('<차량계 건설기계 종류 및 성능>')}
    <table style="${TABLE}">
      ${colgroup(12)}
      <tr>${cell('장비명', LABEL, 3)}${cell(escapeHtml(e.equipmentName), VALUE, 3)}${cell('등록번호', LABEL, 3)}${cell(escapeHtml(e.registrationNumber), VALUE, 3)}</tr>
      <tr>${cell('차체중량', LABEL, 3)}${cell(escapeHtml(e.bodyWeight), VALUE, 3)}${cell('능력', LABEL, 3)}${cell(escapeHtml(e.capacity), VALUE, 3)}</tr>
    </table>`
}

export async function downloadConstructionWorkPlanPdf(record: WorkPlanRecord): Promise<void> {
  const form = record.form_data.construction
  if (!form) throw new Error('건설기계 작업계획서 데이터가 없습니다.')

  const page1 = buildSurveyPage(form)
  const page2 = buildMainPage(form, record)
  const page3 = `
    ${riskControlTable('<위험요인 및 개선대책>', '작업순서', form.riskControls || [])}
    ${checklistTable('<산업재해 예방을 위한 체크리스트>', CONSTRUCTION_CHECKLIST, form.checklist || [])}`

  const fileName = buildFileName('construction', record.title, record.work_start_date)
  await renderWorkPlanPdf([coverPage('construction'), page1, page2, page3], fileName)
}
