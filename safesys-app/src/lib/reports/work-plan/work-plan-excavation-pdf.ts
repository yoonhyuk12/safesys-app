// 굴착 작업계획서 입력값을 고용노동부 표준 양식 기반 PDF 페이지로 구성하고 다운로드

import { CONSTRUCTION_SURVEY_ITEMS } from '@/lib/work-plan/constants'
import {
  EXCAVATION_ALARM_CONDITIONS,
  EXCAVATION_ALARM_EQUIPMENT,
  EXCAVATION_ALARM_SIGNALS,
  EXCAVATION_BLASTING_SAFETY,
  EXCAVATION_CHECKLIST,
  EXCAVATION_DIRECTOR_RULES,
  EXCAVATION_EMERGENCY_AGENCY_PRESETS,
  EXCAVATION_SAMPLE_NOTE,
  EXCAVATION_SHORING_SAFETY,
  EXCAVATION_STAGE_SAFETY,
  EXCAVATION_STANDARD_FLOW,
  EXCAVATION_STANDARD_PROCEDURES,
  EXCAVATION_TOC,
  EXCAVATION_TRAFFIC_RULES,
  EXCAVATION_UTILITY_SAFETY_RULES,
} from '@/lib/work-plan/excavation-constants'
import type { WorkPlanRecord } from '@/lib/work-plan/types'
import {
  LABEL,
  LEFT,
  TABLE,
  VALUE,
  buildFileName,
  cell,
  checklistTable,
  colgroup,
  dateRange,
  escapeHtml,
  mapSection,
  personBlock,
  renderWorkPlanPdfPacked,
  riskControlTable,
  sectionTitle,
  type WorkPlanPdfBlock,
} from './work-plan-pdf-common'

type ExcavationForm = NonNullable<WorkPlanRecord['form_data']['excavation']>
type StageGroup = { stage: string; items: readonly string[] }

const BORDER = '1px solid #000'
const COVER_BORDER = '2px solid #000'
const BLUE = '#1f4e78'

// 빈 표 행 수 — 출력 후 수기 작성 여유
const BLANK_EQUIPMENT_ROWS = 3
const BLANK_MANPOWER_ROWS = 3
const BLANK_RISK_ROWS = 5
const BLANK_MATERIAL_ROWS = 3
const BLANK_INSTRUMENT_ROWS = 3

function bulletList(items: readonly string[], numbered = false): string {
  return `<div style="font-size:11px; line-height:1.55; text-align:left;">
    ${items.map((item, index) => `<div style="margin:2px 0;">${numbered ? `${index + 1}.` : '•'} ${escapeHtml(item)}</div>`).join('')}
  </div>`
}

function seal(signature: string | undefined): string {
  const image = signature
    ? `<img src="${escapeHtml(signature)}" alt="서명" style="position:absolute; width:60px; height:36px; object-fit:contain; left:50%; top:50%; transform:translate(-50%, -50%); z-index:1;" />`
    : ''
  return `<span style="position:relative; display:inline-block; min-width:64px; height:36px; line-height:36px;">(인)${image}</span>`
}

function padBlankRows<T>(rows: T[], blankCount: number, blank: T): T[] {
  if (rows.length > 0) return rows
  return Array.from({ length: blankCount }, () => blank)
}

function coverPage(form: ExcavationForm, record: WorkPlanRecord): string {
  const signatures = form.signatures
  const names = form.approvalNames || {}
  const createdDate = record.work_start_date || new Date().toISOString().slice(0, 10)
  const approvalRows = [
    ['작성자', names.approvalManager || '', signatures?.approvalManager],
    ['검토자', names.approvalReviewer1 || '', signatures?.approvalReviewer1],
    ['검토자', names.approvalReviewer2 || '', signatures?.approvalReviewer2],
    ['현장소장', names.approvalApprover || '', signatures?.approvalApprover],
  ] as const

  return `<div style="min-height:260mm; border:${COVER_BORDER}; padding:10mm; box-sizing:border-box; display:flex; flex-direction:column;">
    <div style="color:${BLUE}; font-weight:bold; font-size:12px; text-align:right;">${escapeHtml('지반 굴착 작업계획서_고용노동부 표준 양식(2021)')}</div>
    <div style="font-size:31px; font-weight:bold; letter-spacing:5px; text-align:center; margin:18mm 0 11mm;">${escapeHtml('지반 굴착 작업계획서')}</div>
    <div style="font-size:18px; font-weight:bold; text-align:center; margin-bottom:7mm;">${escapeHtml('[목 차]')}</div>
    <div style="width:86%; margin:0 auto; font-size:13px; line-height:1.85;">
      ${EXCAVATION_TOC.map((item) => `<div>${escapeHtml(item)}</div>`).join('')}
    </div>
    <div style="margin-top:auto;">
      <div style="font-size:15px; font-weight:bold; margin:0 0 4mm;">${escapeHtml('[원청업체 작성 및 검토]')}</div>
      <table style="${TABLE}">
        <colgroup><col style="width:21%"><col style="width:49%"><col style="width:30%"></colgroup>
        <tr>${cell('회사명', LABEL)}${cell(escapeHtml(form.companyName), LEFT, 2)}</tr>
        <tr>${cell('현장명', LABEL)}${cell(escapeHtml(form.title), LEFT, 2)}</tr>
        <tr>${cell('작성일', LABEL)}${cell(escapeHtml(createdDate), LEFT, 2)}</tr>
        ${approvalRows.map(([role, name, signature]) => `<tr>
          ${cell(escapeHtml(role), LABEL)}
          ${cell(`직위&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;성명 ${escapeHtml(name)}`, LEFT)}
          ${cell(seal(signature), VALUE)}
        </tr>`).join('')}
      </table>
      <div style="color:${BLUE}; font-size:10px; line-height:1.45; margin-top:5mm;">${escapeHtml(EXCAVATION_SAMPLE_NOTE)}</div>
    </div>
  </div>`
}

function overviewPage(form: ExcavationForm): string {
  const overview = form.overview
  const shoring = form.shoring.applied
    ? `<tr>${cell('흙막이공법', LABEL, 2)}${cell(escapeHtml(form.shoring.wallMethod), LEFT, 4)}${cell('수량', LABEL, 2)}${cell(escapeHtml(form.shoring.wallQuantity), LEFT, 4)}</tr>
       <tr>${cell('흙막이 지보공법', LABEL, 2)}${cell(escapeHtml(form.shoring.supportMethod), LEFT, 4)}${cell('수량', LABEL, 2)}${cell(escapeHtml(form.shoring.supportQuantity), LEFT, 4)}</tr>`
    : `<tr>${cell('흙막이 가시설', LABEL, 2)}${cell('해당없음', LEFT, 10)}</tr>`
  const sharedContent = form.sharedWorkContent.trim()
    ? `<tr>${cell('공통 작업내용', LABEL, 2)}${cell(escapeHtml(form.sharedWorkContent), LEFT, 10)}</tr>`
    : ''

  return `${sectionTitle('1. 작업개요')}
    <div style="font-weight:bold; margin:4mm 0 2mm;">${escapeHtml('현장 개요')}</div>
    <table style="${TABLE}">${colgroup(12)}
      <tr>${cell('회사명', LABEL, 2)}${cell(escapeHtml(form.companyName), LEFT, 4)}${cell('현장 전화번호', LABEL, 2)}${cell(escapeHtml(overview.sitePhone), LEFT, 4)}</tr>
      <tr>${cell('현장명', LABEL, 2)}${cell(escapeHtml(form.title), LEFT, 4)}${cell('공사규모', LABEL, 2)}${cell(escapeHtml(overview.siteScale), LEFT, 4)}</tr>
      <tr>${cell('공사기간', LABEL, 2)}${cell(dateRange(form.workStartDate, form.workEndDate), LEFT, 4)}${cell('현장관계자', LABEL, 2)}${cell(personBlock(form.workDirector), LEFT, 4)}</tr>
    </table>
    <div style="font-weight:bold; margin:7mm 0 2mm;">${escapeHtml('굴착작업 개요')}</div>
    <table style="${TABLE}">${colgroup(12)}
      <tr>${cell('협력업체명', LABEL, 2)}${cell(escapeHtml(overview.partnerCompany), LEFT, 4)}${cell('업체 전화번호', LABEL, 2)}${cell(escapeHtml(overview.partnerPhone), LEFT, 4)}</tr>
      <tr>${cell('작업담당자', LABEL, 2)}${cell(personBlock(overview.partnerManager), LEFT, 10)}</tr>
      <tr>${cell('굴착공사 기간', LABEL, 2)}${cell(dateRange(form.workStartDate, form.workEndDate), LEFT, 10)}</tr>
      <tr>${cell('굴착 깊이', LABEL, 2)}${cell(escapeHtml(overview.depth), LEFT, 2)}${cell('굴착면적', LABEL, 2)}${cell(escapeHtml(overview.area), LEFT, 2)}${cell('터파기 물량', LABEL, 2)}${cell(escapeHtml(overview.volume), LEFT, 2)}</tr>
      <tr>${cell('굴착방법', LABEL, 2)}${cell(escapeHtml(overview.method), LEFT, 4)}${cell('사용기계 및 장비', LABEL, 2)}${cell(escapeHtml(overview.equipmentSummary), LEFT, 4)}</tr>
      ${shoring}
      ${sharedContent}
    </table>`
}

function surveyPage(form: ExcavationForm): string {
  const utilities = form.utilities.length > 0 ? form.utilities : [{ kind: '', finding: '', action: '', agency: '' }]
  const surveyItems = CONSTRUCTION_SURVEY_ITEMS.excavation

  // 지질·지반 조사 결과는 화면 입력 없이 출력물 빈칸으로 둔다.
  return `${sectionTitle('2. 사전조사')}
    <div style="font-weight:bold; margin:4mm 0 2mm;">${escapeHtml('지하매설물 조사')}</div>
    <table style="${TABLE}">${colgroup(4)}
      <tr>${cell('지중매설물', LABEL)}${cell('확인결과(위치)', LABEL)}${cell('조치여부', LABEL)}${cell('담당기관(연락처)', LABEL)}</tr>
      ${utilities.map((row) => `<tr>${cell(escapeHtml(row.kind))}${cell(escapeHtml(row.finding), LEFT)}${cell(escapeHtml(row.action), LEFT)}${cell(escapeHtml(row.agency), LEFT)}</tr>`).join('')}
    </table>
    <div style="font-weight:bold; margin:6mm 0 2mm;">${escapeHtml('지하매설물 작업 안전수칙')}</div>
    ${bulletList(EXCAVATION_UTILITY_SAFETY_RULES)}
    <div style="font-weight:bold; margin:6mm 0 2mm;">${escapeHtml('지질·지반 조사 결과 요약')}</div>
    <table style="${TABLE}">
      <colgroup><col style="width:40%"><col style="width:60%"></colgroup>
      <tr>${cell('조사항목', LABEL)}${cell('조사결과', LABEL)}</tr>
      ${surveyItems.map((item) => `<tr>${cell(escapeHtml(item), LEFT)}${cell('', LEFT)}</tr>`).join('')}
    </table>`
}

function equipmentAndManpowerPage(form: ExcavationForm): string {
  const equipmentRows = padBlankRows(
    form.equipmentRows,
    BLANK_EQUIPMENT_ROWS,
    { name: '', spec: '', quantity: '', purpose: '', period: '', note: '' },
  )
  const manpowerRows = padBlankRows(
    form.manpowerRows,
    BLANK_MANPOWER_ROWS,
    { role: '', task: '', count: '', period: '', note: '' },
  )

  return `${sectionTitle('3. 필요 인원 및 장비 사용계획')}
    <table style="${TABLE}">${colgroup(7)}
      <tr>${cell('구분', LABEL)}${cell('항목', LABEL)}${cell('규격', LABEL)}${cell('수량', LABEL)}${cell('용도', LABEL)}${cell('작업기간', LABEL)}${cell('비고', LABEL)}</tr>
      ${equipmentRows.map((row, index) => `<tr>
        ${index === 0 ? `<td rowspan="${equipmentRows.length}" style="${LABEL}">${escapeHtml('장비')}</td>` : ''}
        ${cell(escapeHtml(row.name))}${cell(escapeHtml(row.spec))}${cell(escapeHtml(row.quantity))}${cell(escapeHtml(row.purpose), LEFT)}${cell(escapeHtml(row.period))}${cell(escapeHtml(row.note), LEFT)}
      </tr>`).join('')}
      ${manpowerRows.map((row, index) => `<tr>
        ${index === 0 ? `<td rowspan="${manpowerRows.length}" style="${LABEL}">${escapeHtml('인원')}</td>` : ''}
        ${cell(escapeHtml(row.role))}${cell(escapeHtml(row.task))}${cell(escapeHtml(row.count))}${cell('')}${cell(escapeHtml(row.period))}${cell(escapeHtml(row.note), LEFT)}
      </tr>`).join('')}
    </table>`
}

function stageTable(title: string, stages: readonly StageGroup[]): string {
  return `<div style="font-weight:bold; margin:5mm 0 2mm;">${escapeHtml(title)}</div>
    <table style="${TABLE}">
      <colgroup><col style="width:23%"><col style="width:77%"></colgroup>
      <tr>${cell('작업순서', LABEL)}${cell('안전작업계획', LABEL)}</tr>
      ${stages.map((stage) => `<tr>${cell(escapeHtml(stage.stage), LABEL)}${cell(bulletList(stage.items, true), LEFT)}</tr>`).join('')}
    </table>`
}

function procedurePage(
  groups: readonly { heading: string; items: readonly string[] }[],
  continued = false,
  groupOffset = 0,
): string {
  const flow = continued
    ? ''
    : `<div style="font-weight:bold; margin:4mm 0 3mm;">${escapeHtml('굴착 작업 흐름')}</div>
       <div style="border:${BORDER}; padding:5mm 3mm; text-align:center; font-weight:bold; line-height:1.7;">${EXCAVATION_STANDARD_FLOW.map(escapeHtml).join(' &rarr; ')}</div>`
  return `${sectionTitle(continued ? '4. 굴착공사 계획 — 표준 절차(계속)' : '4. 굴착공사 계획 — 표준 절차')}
    ${flow}
    ${groups.map((group, index) => `<div style="font-weight:bold; margin:5mm 0 2mm;">${escapeHtml(`${groupOffset + index + 1}) ${group.heading}`)}</div>${bulletList(group.items, true)}`).join('')}`
}

// 작업계획도 전용 페이지 — 지도가 페이지를 채우므로 부가 문구는 분리한다.
function mapPage(record: WorkPlanRecord): string {
  return mapSection('4. 굴착공사 계획 — 굴착 작업계획도', record.map_image_url)
}

// 배수계획 + 차량 운행 기준 (지도 페이지에서 분리)
function drainageAndTrafficPage(form: ExcavationForm): string {
  return `${sectionTitle('4. 굴착공사 계획 — 배수·차량 운행')}
    <div style="font-weight:bold; margin:4mm 0 2mm;">${escapeHtml('배수·양수 계획')}</div>
    <table style="${TABLE}">${colgroup(4)}
      <tr>${cell('배수방법', LABEL)}${cell(escapeHtml(form.drainagePlan) || '&nbsp;', LEFT, 3)}</tr>
    </table>
    <div style="font-weight:bold; margin:7mm 0 2mm;">${escapeHtml('ㅇ 차량 운행·유도 기준')}</div>
    ${bulletList(EXCAVATION_TRAFFIC_RULES)}`
}

function stageSafetyPage(): string {
  return `${sectionTitle('4. 굴착공사 계획 — 단계별 안전대책')}
    ${stageTable('굴착 단계별 안전대책', EXCAVATION_STAGE_SAFETY)}`
}

function blastingPage(form: ExcavationForm): string {
  const blasting = form.blasting
  return `${sectionTitle('4. 굴착공사 계획 — 발파작업')}
    <table style="${TABLE}">${colgroup(4)}
      <tr>${cell('발파공법', LABEL)}${cell(escapeHtml(blasting.method), LEFT)}${cell('발파구역', LABEL)}${cell(escapeHtml(blasting.area), LEFT)}</tr>
      <tr>${cell('발파량', LABEL)}${cell(escapeHtml(blasting.amount), LEFT)}${cell('화약관리자', LABEL)}${cell(escapeHtml(blasting.managerName), LEFT)}</tr>
      <tr>${cell('통제·비산방지 대책', LABEL)}${cell(escapeHtml(blasting.controlMeasure), LEFT, 3)}</tr>
    </table>
    ${stageTable('발파작업 안전대책', EXCAVATION_BLASTING_SAFETY)}`
}

function shoringPage(form: ExcavationForm, groupIndexes: readonly number[], includeOverview: boolean): string {
  const shoring = form.shoring
  const materials = padBlankRows(
    shoring.materials,
    BLANK_MATERIAL_ROWS,
    { item: '', spec: '', unit: '', quantity: '' },
  )
  const overview = includeOverview
    ? `<table style="${TABLE}">${colgroup(4)}
         <tr>${cell('흙막이공법', LABEL)}${cell(escapeHtml(shoring.wallMethod), LEFT)}${cell('수량', LABEL)}${cell(escapeHtml(shoring.wallQuantity), LEFT)}</tr>
         <tr>${cell('지보공법', LABEL)}${cell(escapeHtml(shoring.supportMethod), LEFT)}${cell('수량', LABEL)}${cell(escapeHtml(shoring.supportQuantity), LEFT)}</tr>
       </table>
       <div style="font-weight:bold; margin:5mm 0 2mm;">${escapeHtml('사용재료')}</div>
       <table style="${TABLE}">${colgroup(4)}
         <tr>${cell('품목', LABEL)}${cell('규격', LABEL)}${cell('단위', LABEL)}${cell('수량', LABEL)}</tr>
         ${materials.map((row) => `<tr>${cell(escapeHtml(row.item))}${cell(escapeHtml(row.spec))}${cell(escapeHtml(row.unit))}${cell(escapeHtml(row.quantity))}</tr>`).join('')}
       </table>`
    : ''

  return `${sectionTitle(includeOverview ? '5. 흙막이 및 지보공 설치계획' : '5. 흙막이 및 지보공 안전대책(계속)')}
    ${overview}
    ${groupIndexes.map((index) => {
      const group = EXCAVATION_SHORING_SAFETY[index]
      return stageTable(group.group, group.stages)
    }).join('')}`
}

function instrumentationPage(form: ExcavationForm): string {
  const rows = padBlankRows(
    form.instrumentation.rows,
    BLANK_INSTRUMENT_ROWS,
    { item: '', location: '', quantity: '', timing: '', frequency: '', note: '' },
  )
  return `${sectionTitle('6. 지반 계측계획')}
    <table style="${TABLE}">${colgroup(6)}
      <tr>${cell('계측항목', LABEL)}${cell('설치위치', LABEL)}${cell('수량', LABEL)}${cell('측정시기', LABEL)}${cell('측정빈도', LABEL)}${cell('비고', LABEL)}</tr>
      ${rows.map((row) => `<tr>${cell(escapeHtml(row.item))}${cell(escapeHtml(row.location))}${cell(escapeHtml(row.quantity))}${cell(escapeHtml(row.timing))}${cell(escapeHtml(row.frequency))}${cell(escapeHtml(row.note), LEFT)}</tr>`).join('')}
    </table>
    <div style="font-size:10px; margin-top:3mm;">${escapeHtml('※ 관리기준치는 구조기술자 승인값 기준')}</div>`
}

// 7. 작업지휘자 배치계획 전용
function directorPage(form: ExcavationForm): string {
  const persons = [
    ['작업지휘자', form.workDirector],
    ['장비운전원', form.operator],
    ['유도자', form.guide],
  ] as const

  return `${sectionTitle('7. 작업지휘자 배치계획')}
    <div style="font-weight:bold; margin:4mm 0 2mm;">${escapeHtml('작업지휘자 배치기준')}</div>
    ${bulletList(EXCAVATION_DIRECTOR_RULES)}
    <table style="${TABLE}">${colgroup(2)}
      <tr>${cell('구분', LABEL)}${cell('성명·직책·연락처', LABEL)}</tr>
      ${persons.map(([role, person]) => `<tr>${cell(escapeHtml(role), LABEL)}${cell(personBlock(person), LEFT)}</tr>`).join('')}
    </table>`
}

// 8. 연락·신호·비상연락망 전용 (과밀 방지를 위해 7과 분리)
function signalAndEmergencyPage(): string {
  const contacts = EXCAVATION_EMERGENCY_AGENCY_PRESETS.map((row) => ({ agency: row.agency, phone: '' }))

  return `${sectionTitle('8. 사업장 내 연락방법 및 신호방법')}
    <div style="font-weight:bold; margin:4mm 0 2mm;">${escapeHtml('비상경보 발령조건')}</div>
    ${bulletList(EXCAVATION_ALARM_CONDITIONS)}
    <div style="font-weight:bold; margin:5mm 0 2mm;">${escapeHtml('비상경보 신호')}</div>
    <table style="${TABLE}">${colgroup(2)}
      <tr>${cell('구분', LABEL)}${cell('경보방법', LABEL)}</tr>
      ${EXCAVATION_ALARM_SIGNALS.map((row) => `<tr>${cell(escapeHtml(row.condition), LEFT)}${cell(escapeHtml(row.signal), LEFT)}</tr>`).join('')}
    </table>
    <div style="font-weight:bold; margin:5mm 0 2mm;">${escapeHtml('경보시설')}</div>
    <table style="${TABLE}">${colgroup(2)}
      <tr>${cell('구분', LABEL)}${cell('관리방법', LABEL)}</tr>
      ${EXCAVATION_ALARM_EQUIPMENT.map((row) => `<tr>${cell(escapeHtml(row.equipment), LEFT)}${cell(escapeHtml(row.management), LEFT)}</tr>`).join('')}
    </table>
    <div style="font-weight:bold; margin:5mm 0 2mm;">${escapeHtml('비상연락망')}</div>
    <table style="${TABLE}">${colgroup(2)}
      <tr>${cell('기관·업체', LABEL)}${cell('전화번호', LABEL)}</tr>
      ${contacts.map((row) => `<tr>${cell(escapeHtml(row.agency), LEFT)}${cell('', LEFT)}</tr>`).join('')}
    </table>`
}

// 위험요인 표 — 입력 없으면 수기용 빈 행을 충분히 둔다.
function riskPage(form: ExcavationForm): string {
  const rows = form.riskControls.length > 0
    ? form.riskControls
    : Array.from({ length: BLANK_RISK_ROWS }, () => ({ workStep: '', riskFactor: '', improvementMeasure: '' }))
  return riskControlTable('9. 중점 안전·보건 대책 — 위험요인 및 개선대책', '작업단계', rows)
}

// 체크리스트 15항목 — 한 페이지 예산 안에 들어가는 분량이라 한 블록으로 두고 패킹에 맡긴다.
function checklistBlock(): string {
  return checklistTable('9. 중점 안전·보건 대책 — 안전점검 체크리스트', EXCAVATION_CHECKLIST, [])
}

export async function downloadExcavationWorkPlanPdf(record: WorkPlanRecord): Promise<void> {
  const form = record.form_data.excavation
  if (!form) throw new Error('굴착 작업계획서 데이터가 없습니다.')

  // 목차 순서를 유지한 블록 목록. 표지·작업계획도만 단독 페이지로 고정하고,
  // 나머지는 실측 높이 기반 그리디 패킹으로 하단 빈 여백 없이 채운다.
  const blocks: WorkPlanPdfBlock[] = [
    { html: coverPage(form, record), standalone: true },
    { html: overviewPage(form) },
    { html: surveyPage(form) },
    { html: equipmentAndManpowerPage(form) },
    // 4. 표준 절차는 한 덩어리로 두면 페이지 예산을 넘겨 축소되므로 기존 2분할 단위를 유지한다.
    { html: procedurePage(EXCAVATION_STANDARD_PROCEDURES.slice(0, 2)) },
    { html: procedurePage(EXCAVATION_STANDARD_PROCEDURES.slice(2), true, 2) },
    { html: mapPage(record), standalone: true },
    { html: drainageAndTrafficPage(form) },
    { html: stageSafetyPage() },
  ]

  if (form.blasting.applied) blocks.push({ html: blastingPage(form) })

  if (form.shoring.applied) {
    // 흙막이 안전대책도 분량이 커 기존 분할 단위(개요+1그룹 / 2·3그룹)를 유지한다.
    blocks.push({ html: shoringPage(form, [0], true) })
    blocks.push({ html: shoringPage(form, [1, 2], false) })
  }

  if (form.instrumentation.applied) blocks.push({ html: instrumentationPage(form) })

  blocks.push(
    { html: directorPage(form) },
    { html: signalAndEmergencyPage() },
    { html: riskPage(form) },
    { html: checklistBlock() },
  )

  await renderWorkPlanPdfPacked(
    blocks,
    buildFileName('excavation', form.title, record.work_start_date),
  )
}
