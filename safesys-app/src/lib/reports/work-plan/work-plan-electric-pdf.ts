// 붙임2-3 전기 작업계획서 PDF 생성기 (본표·작업순서·체크리스트·인계인수·첨부자료·현장사진)

import {
  ELECTRIC_CHECKLIST,
  ELECTRIC_PROTECTIVE_EQUIPMENT,
  ELECTRIC_PROTECTIVE_EQUIPMENT_NOTE,
  ELECTRIC_PRE_WORK_INSTRUCTIONS,
  ELECTRIC_ATTACHMENT_OPTIONS,
} from '../../work-plan/constants'
import type { WorkPlanRecord, ElectricWorker } from '../../work-plan/types'
import {
  TABLE,
  LABEL,
  VALUE,
  LEFT,
  cell,
  colgroup,
  escapeHtml,
  checkbox,
  personBlock,
  sectionTitle,
  approvalHeader,
  checklistTable,
  buildFileName,
  coverPage,
  renderWorkPlanPdf,
} from './work-plan-pdf-common'

type ElectricForm = NonNullable<WorkPlanRecord['form_data']['electric']>

function workerRows(workers: ElectricWorker[]): string {
  if (!workers || workers.length === 0) {
    return `<tr>${cell('', VALUE)}${cell('', VALUE, 2)}${cell('', VALUE, 2)}${cell('', VALUE)}${cell('', VALUE)}${cell('', VALUE, 2)}${cell('', VALUE, 2)}${cell('', VALUE)}</tr>`
  }
  const rows: string[] = []
  for (let i = 0; i < workers.length; i += 2) {
    const a = workers[i]
    const b = workers[i + 1]
    rows.push(
      `<tr>${cell(String(i + 1), VALUE)}${cell(escapeHtml(a.name), VALUE, 2)}${cell(escapeHtml(a.qualification), VALUE, 2)}${cell(escapeHtml(a.employmentType), VALUE)}` +
        `${cell(b ? String(i + 2) : '', VALUE)}${cell(escapeHtml(b?.name || ''), VALUE, 2)}${cell(escapeHtml(b?.qualification || ''), VALUE, 2)}${cell(escapeHtml(b?.employmentType || ''), VALUE)}</tr>`
    )
  }
  return rows.join('')
}

function protectiveBox(form: ElectricForm): string {
  const selected = new Set(form.protectiveEquipment || [])
  const boxes = ELECTRIC_PROTECTIVE_EQUIPMENT.map((item) => {
    if (item === '기타') return `${checkbox('기타', selected.has('기타'))}( ${escapeHtml(form.otherProtectiveEquipment || '')} )`
    return checkbox(item, selected.has(item))
  }).join(' &nbsp; ')
  return `<div>${boxes}</div><div style="font-size:11px; color:#444; margin-top:3px;">* ${escapeHtml(ELECTRIC_PROTECTIVE_EQUIPMENT_NOTE)}</div>`
}

function buildMainPage(form: ElectricForm): string {
  const attendee = form.education?.attendeeCount != null ? `${form.education.attendeeCount}명` : ''
  const instructions = ELECTRIC_PRE_WORK_INSTRUCTIONS.map(
    (t) => `<tr>${cell(escapeHtml(t), LEFT, 12)}</tr>`
  ).join('')
  return `
    ${approvalHeader('전기 작업계획서', '수급업체용')}
    <table style="${TABLE}">
      ${colgroup(12)}
      <tr>${cell('작업명(장소)', LABEL, 2)}${cell(escapeHtml(form.title), VALUE, 4)}${cell('작업일자', LABEL, 2)}${cell(escapeHtml(form.workDate), VALUE, 4)}</tr>
      <tr>${cell('발주처', LABEL, 2)}${cell(escapeHtml(form.clientName), VALUE, 4)}${cell('담당자', LABEL, 2)}${cell(personBlock(form.manager), VALUE, 4)}</tr>
      <tr>${cell('공사(용역)업체', LABEL, 2)}${cell(escapeHtml(form.companyName), VALUE, 4)}${cell('작업책임자', LABEL, 2)}${cell(personBlock(form.workLeader), VALUE, 4)}</tr>
      <tr>${cell('작업목적 및 내용', LABEL, 2)}${cell(escapeHtml(form.purposeAndContent), LEFT, 10)}</tr>
      <tr>${cell('공사범위', LABEL, 2)}${cell(escapeHtml(form.workScope), LEFT, 10)}</tr>
      <tr>${cell('② 작업자', LABEL, 12)}</tr>
      <tr>${cell('연번', LABEL)}${cell('성명', LABEL, 2)}${cell('보유자격', LABEL, 2)}${cell('근로형태', LABEL)}${cell('연번', LABEL)}${cell('성명', LABEL, 2)}${cell('보유자격', LABEL, 2)}${cell('근로형태', LABEL)}</tr>
      ${workerRows(form.workers)}
      <tr>${cell('안전보건교육 계획', LABEL, 12)}</tr>
      <tr>${cell('교육일자', LABEL, 2)}${cell(escapeHtml(form.education?.date || ''), VALUE, 4)}${cell('교육장소', LABEL, 2)}${cell(escapeHtml(form.education?.place || ''), VALUE, 4)}</tr>
      <tr>${cell('교육자', LABEL, 2)}${cell(escapeHtml(form.education?.instructor || ''), VALUE, 4)}${cell('인원', LABEL, 2)}${cell(escapeHtml(attendee), VALUE, 4)}</tr>
      <tr>${cell('교육내용', LABEL, 2)}${cell(escapeHtml(form.education?.content || ''), LEFT, 10)}</tr>
      <tr>${cell('보호구 지급 및 사용 장비', LABEL, 12)}</tr>
      <tr>${cell('지급보호구', LABEL, 2)}${cell(protectiveBox(form), LEFT, 10)}</tr>
      <tr>${cell('사용장비', LABEL, 2)}${cell('측정장비', LABEL, 2)}${cell(escapeHtml(form.measurementEquipment), LEFT, 8)}</tr>
      <tr>${cell('활선기구/장비', LABEL, 2)}${cell(escapeHtml(form.liveLineEquipment), LEFT, 8)}</tr>
      <tr>${cell('방호구', LABEL, 2)}${cell(escapeHtml(form.protectiveDevices), LEFT, 8)}</tr>
      <tr>${cell('기타', LABEL, 2)}${cell(escapeHtml(form.otherEquipment), LEFT, 8)}</tr>
      <tr>${cell('작업 전 지시/협의사항', LABEL, 12)}</tr>
      ${instructions}
      <tr>${cell(`담당자 : ${escapeHtml(form.instructionAcknowledgement?.managerName || '')} (인) &nbsp;&nbsp; 작업자 : ${escapeHtml(form.instructionAcknowledgement?.workerName || '')} (인)`, `${LEFT} text-align:right;`, 12)}</tr>
    </table>`
}

function buildStepsPage(form: ElectricForm): string {
  const steps = form.workSteps || []
  const stepRows =
    steps.length > 0
      ? steps
          .map(
            (s) =>
              `<tr>${cell(escapeHtml(s.workName), LEFT, 2)}${cell(escapeHtml(s.sequenceAndContent), LEFT, 4)}${cell(escapeHtml(s.riskFactor), LEFT, 2)}${cell(escapeHtml(s.safeMethod), LEFT, 3)}${cell(escapeHtml(s.note), VALUE)}</tr>`
          )
          .join('')
      : `<tr>${cell('', LEFT, 2)}${cell('', LEFT, 4)}${cell('', LEFT, 2)}${cell('', LEFT, 3)}${cell('', VALUE)}</tr>`

  const fac = ELECTRIC_ATTACHMENT_OPTIONS.facility
  const saf = ELECTRIC_ATTACHMENT_OPTIONS.safety
  const selected = new Set(form.attachments || [])
  const facBoxes = fac.map((t) => checkbox(t, selected.has(t))).join(' &nbsp; ')
  const safBoxes = saf.map((t) => checkbox(t, selected.has(t))).join(' &nbsp; ')

  return `
    ${sectionTitle('③④ 작업순서 및 안전작업 방법')}
    <table style="${TABLE}">
      ${colgroup(12)}
      <tr>${cell('작업명', LABEL, 2)}${cell('작업순서 및 작업내용', LABEL, 4)}${cell('위험요소', LABEL, 2)}${cell('안전작업방법', LABEL, 3)}${cell('비고', LABEL)}</tr>
      ${stepRows}
    </table>
    ${checklistTable('산업재해 예방을 위한 체크리스트', ELECTRIC_CHECKLIST, form.checklist || [])}
    ${sectionTitle('인계·인수사항')}
    <table style="${TABLE}">
      ${colgroup(12)}
      <tr>${cell('인계사항', LABEL, 6)}${cell('인수사항', LABEL, 6)}</tr>
      <tr>${cell(escapeHtml(form.handover?.details || ''), `${LEFT} height:24mm; vertical-align:top;`, 6)}${cell('', `${LEFT} vertical-align:top;`, 6)}</tr>
      <tr>${cell(`인계자 : ${escapeHtml(form.handover?.deliverer || '')} (인)`, `${LEFT} text-align:right;`, 6)}${cell(`인수자 : ${escapeHtml(form.handover?.receiver || '')} (인)`, `${LEFT} text-align:right;`, 6)}</tr>
    </table>
    ${sectionTitle('⑩ <첨부자료>')}
    <table style="${TABLE}">
      ${colgroup(12)}
      <tr>${cell('설  비', LABEL, 2)}${cell(facBoxes, LEFT, 10)}</tr>
      <tr>${cell('안  전', LABEL, 2)}${cell(safBoxes, LEFT, 10)}</tr>
    </table>`
}

// 현장사진·도면 — site_photo_urls 이미지 2열 격자. 없으면 페이지 생략.
function buildPhotoPage(urls: string[]): string {
  const tds = urls.map(
    (u) =>
      `<td style="border:1px solid #000; padding:6px; width:50%; height:95mm; text-align:center; vertical-align:middle;"><img src="${escapeHtml(u)}" style="max-width:100%; max-height:90mm; object-fit:contain;" crossorigin="anonymous" /></td>`
  )
  const rows: string[] = []
  for (let i = 0; i < tds.length; i += 2) {
    const second = tds[i + 1] || '<td style="border:1px solid #000; width:50%;">&nbsp;</td>'
    rows.push(`<tr>${tds[i]}${second}</tr>`)
  }
  return `
    ${sectionTitle('<전기도면, 현장사진 등>')}
    <table style="width:100%; border-collapse:collapse; table-layout:fixed; margin-top:-1px;">
      ${rows.join('')}
    </table>`
}

export async function downloadElectricWorkPlanPdf(record: WorkPlanRecord): Promise<void> {
  const form = record.form_data.electric
  if (!form) throw new Error('전기 작업계획서 데이터가 없습니다.')

  const pages = [coverPage('electric'), buildMainPage(form), buildStepsPage(form)]
  const photos = record.site_photo_urls || []
  if (photos.length > 0) pages.push(buildPhotoPage(photos))

  const fileName = buildFileName('electric', record.title, record.work_start_date)
  await renderWorkPlanPdf(pages, fileName)
}
