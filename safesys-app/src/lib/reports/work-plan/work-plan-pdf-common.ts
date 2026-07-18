// AI 작업계획서 4종 PDF의 공용 조각 — 결재란·기본정보 셀·지도·위험표·체크리스트·인양/줄걸이 검토표·오프스크린 렌더 헬퍼

import { applyHtml2canvasTextFix } from '../html2canvas-text-fix'
import {
  MAP_LEGEND,
  MAP_FOCUS_ITEMS,
  MAP_FOOTNOTE,
  LIFTING_CAPACITY_NOTES,
  LIFTING_CAPACITY_FORMULA,
  RIGGING_CAPACITY_FORMULA,
  RIGGING_SAFETY_RATIO_FORMULA,
  CAPACITY_WARNING,
  SAFETY_FACTORS,
  TENSION_FACTORS,
  PLAN_TYPE_OPTIONS,
  WORK_PLAN_COVERS,
} from '../../work-plan/constants'
import type {
  LiftingCapacityReview,
  RiggingCapacityReview,
  RiskControlRow,
  ChecklistAnswer,
  ChecklistResult,
  PersonContact,
  PlanType,
  WorkPlanSignatures,
} from '../../work-plan/types'

// ── 스타일 상수 ─────────────────────────────────────────────
export const FONT = "'Malgun Gothic', '맑은 고딕', Arial, sans-serif"
const BORDER = '1px solid #000'
export const CELL = `border:${BORDER}; padding:4px 6px; font-size:12px; vertical-align:middle; text-align:center; word-break:break-all; line-height:1.4;`
// 라벨은 정해진 짧은 문구이므로 단어 중간 줄바꿈(break-all)을 금지해 "근로형태" 등이 한 줄로 나오게 한다
export const LABEL = `${CELL} background-color:#f2f2f2; font-weight:bold; word-break:keep-all;`
export const VALUE = CELL
export const LEFT = `border:${BORDER}; padding:4px 6px; font-size:12px; vertical-align:middle; text-align:left; word-break:break-all; line-height:1.5;`
export const TABLE = 'width:100%; border-collapse:collapse; table-layout:fixed; margin-top:-1px;'
const SECTION = `border:${BORDER}; background-color:#f2f2f2; text-align:center; font-weight:bold; font-size:14px; padding:5px 4px; margin-top:-1px;`

// ── 기본 유틸 ───────────────────────────────────────────────
export function escapeHtml(value: string): string {
  return (value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function numOrBlank(n: number | null | undefined): string {
  return n === null || n === undefined || Number.isNaN(n) ? '' : String(n)
}

// 값 셀(html은 호출부가 이스케이프 책임). 빈 값이면 셀 높이 유지를 위해 &nbsp; 삽입.
export function cell(html: string, style: string = VALUE, colspan = 1): string {
  const c = html && html.length ? html : '&nbsp;'
  return `<td style="${style}"${colspan > 1 ? ` colspan="${colspan}"` : ''}>${c}</td>`
}

export function sectionTitle(text: string): string {
  return `<div style="${SECTION}">${escapeHtml(text)}</div>`
}

export function colgroup(n: number): string {
  const w = (100 / n).toFixed(4)
  return `<colgroup>${Array(n).fill(`<col style="width:${w}%"/>`).join('')}</colgroup>`
}

export function checkbox(label: string, checked: boolean): string {
  return `${checked ? '■' : '□'} ${escapeHtml(label)}`
}

// 담당자/운전원 등 이름·연락처 블록
export function personBlock(p: PersonContact | undefined): string {
  if (!p) return ''
  const head = escapeHtml([p.position, p.name].filter(Boolean).join(' '))
  const phone = p.phone ? escapeHtml(p.phone) : ''
  if (head && phone) return `${head}<br/>(${phone})`
  return head || phone
}

// 성명 텍스트 오른쪽에 손글씨 서명 이미지를 붙여 출력한다 (서명이 없으면 성명만)
export function signedName(name: string, signature: string | undefined): string {
  const escaped = escapeHtml(name)
  if (!signature) return escaped
  return `${escaped}<img src="${signature}" alt="" style="display:inline-block; vertical-align:middle; margin-left:6px; width:60px; height:32px; object-fit:contain;" />`
}

export function dateRange(start: string | null | undefined, end: string | null | undefined): string {
  const s = start || ''
  const e = end || ''
  return s || e ? `${escapeHtml(s)} ~ ${escapeHtml(e)}` : ''
}

// ── 결재란 + 제목 헤더 ──────────────────────────────────────
// 담당·승인 서명칸은 서명 단계에서 받은 이미지를 넣고, 없으면 공란(출력 후 수기 결재). 중첩 표 없이 rowspan으로 선을 맞춘다.
export function approvalHeader(mainTitle: string, subTitle: string, signatures?: WorkPlanSignatures): string {
  const sign = (dataUrl: string | undefined) =>
    dataUrl ? `<img src="${dataUrl}" alt="" style="display:block; margin:0 auto; width:76px; height:46px; object-fit:contain;" />` : ''
  return `
    <table style="width:100%; border-collapse:collapse; table-layout:fixed;">
      <colgroup><col style="width:72%"/><col style="width:5%"/><col style="width:11.5%"/><col style="width:11.5%"/></colgroup>
      <tr>
        <td rowspan="2" style="border:${BORDER}; text-align:center; padding:12px 6px;">
          <div style="font-size:22px; font-weight:900;">${escapeHtml(mainTitle)}</div>
          <div style="font-size:14px; font-weight:bold; color:#555;">(${escapeHtml(subTitle)})</div>
        </td>
        <td rowspan="2" style="border:${BORDER}; background-color:#f2f2f2; font-weight:bold; text-align:center; padding:2px;">결<br/>재</td>
        ${cell('담당', `${LABEL} height:16px; padding:1px 6px;`)}${cell('승인', `${LABEL} height:16px; padding:1px 6px;`)}
      </tr>
      <tr>${cell(sign(signatures?.approvalManager), `${VALUE} height:54px; padding:2px;`)}${cell(sign(signatures?.approvalApprover), `${VALUE} height:54px; padding:2px;`)}</tr>
    </table>`
}

// ── 표지 (원본 붙임 양식 1쪽 재현) ─────────────────────────
// 전체 테두리 상자 + 상단 파란 개정 주석 + 중앙 제목 상자 + [작업계획서 내용] 목록 + 하단 파란 ※주석.
export function coverPage(planType: PlanType): string {
  const cover = WORK_PLAN_COVERS[planType]
  const itemCount = cover.sections.reduce((n, s) => n + s.items.length, 0)
  const compact = itemCount > 6
  const titleMargin = compact ? '24mm' : '42mm'
  const firstSectionMargin = compact ? '16mm' : '38mm'
  const itemFont = compact ? '17px' : '20px'
  const title = cover.titleLines.map(escapeHtml).join('<br/>')
  const sections = cover.sections
    .map(
      (s, i) => `
      <div style="margin-top:${i === 0 ? firstSectionMargin : '16mm'}; text-align:center; font-size:20px; font-weight:bold;">${escapeHtml(s.heading)}</div>
      <div style="display:table; margin:7mm auto 0; max-width:150mm;">
        ${s.items
          .map(
            (item) =>
              `<div style="font-size:${itemFont}; line-height:1.6; margin-bottom:2.5mm; text-indent:-1.15em; padding-left:1.15em;">${escapeHtml(item)}</div>`
          )
          .join('')}
      </div>`
    )
    .join('')
  const footnote = cover.footnote
    ? `<div style="margin-top:auto; color:#0000c0; font-weight:bold; font-size:16px;">${escapeHtml(cover.footnote)}</div>`
    : ''
  return `
    <div style="border:2px solid #000; height:277mm; box-sizing:border-box; padding:8mm 10mm 10mm; display:flex; flex-direction:column;">
      <div style="color:#0000c0; font-size:13px; font-weight:bold;">${escapeHtml(cover.headerNote)}</div>
      <div style="margin:${titleMargin} auto 0; border:2px solid #000; padding:5mm 14mm; text-align:center; font-size:38px; font-weight:900; line-height:1.5; letter-spacing:2px;">${title}</div>
      ${sections}
      ${footnote}
    </div>`
}

// ── 지도 섹션 ──────────────────────────────────────────────
const LEGEND_COLORS: Record<string, string> = {
  장비: '#f97316',
  경로: '#e00000',
  '유도자(신호수)': '#ef4444',
  작업지휘자: '#2563eb',
  출입통제구역: '#8000c0',
  안전표지판: '#facc15',
  안전콘: '#f97316',
}

function legendSymbol(label: string, symbol: string): string {
  if (label === '출입통제구역') {
    return '<span style="display:inline-block; width:22px; height:16px; border:3px dashed #8000c0; border-radius:50%; box-sizing:border-box;"></span>'
  }
  if (label === '안전표지판') {
    return '<span style="display:inline-block; width:0; height:0; border-left:8px solid transparent; border-right:8px solid transparent; border-bottom:16px solid #facc15; position:relative; bottom:2px;"></span>'
  }
  if (label === '안전콘') {
    return '<span style="display:inline-block; width:0; height:0; border-left:6px solid transparent; border-right:6px solid transparent; border-bottom:14px solid #f97316;"></span>'
  }
  if (label === '장비') {
    return '<span style="display:inline-block; width:14px; height:14px; border:2px solid #f97316; border-radius:50%; box-sizing:border-box; background-color:#ffffff;"></span>'
  }
  if (label === '유도자(신호수)') {
    return '<span style="display:inline-block; width:14px; height:14px; border:2px solid #ffffff; border-radius:50%; box-sizing:border-box; background-color:#ef4444;"></span>'
  }
  if (label === '작업지휘자') {
    return '<span style="display:inline-block; width:14px; height:14px; border:2px solid #2563eb; border-radius:50%; box-sizing:border-box; background-color:#ffffff;"></span>'
  }
  return `<span style="color:${LEGEND_COLORS[label] || '#000'}; font-size:15px;">${symbol}</span>`
}

function legendTable(): string {
  const rows = MAP_LEGEND.map(
    (l) =>
      `<tr>${cell(legendSymbol(l.label, l.symbol), VALUE)}${cell(escapeHtml(l.label), VALUE)}</tr>`
  ).join('')
  return `
    <table style="width:100%; border-collapse:collapse; table-layout:fixed;">
      <tr>${cell('범  례', LABEL, 2)}</tr>
      <tr>${cell('표시', LABEL)}${cell('내  용', LABEL)}</tr>
      ${rows}
    </table>`
}

function focusList(): string {
  const items = MAP_FOCUS_ITEMS.map(
    (t, i) => `<div style="font-size:12px; margin-bottom:3px;">${i + 1}. ${escapeHtml(t)}</div>`
  ).join('')
  return `
    <div style="margin-top:10px;">
      <div style="font-weight:bold; font-size:13px; margin-bottom:5px;">ㅇ 중점관리사항</div>
      ${items}
    </div>`
}

// map_image_url이 없으면 좌측 지도 셀은 빈 칸으로 유지.
export function mapSection(mapTitle: string, imageUrl: string | null): string {
  const img = imageUrl
    ? `<img src="${escapeHtml(imageUrl)}" style="display:block; width:100%; height:auto; max-height:135mm; object-fit:contain;" crossorigin="anonymous" />`
    : ''
  return `
    ${sectionTitle(mapTitle)}
    <table style="${TABLE}">
      ${colgroup(12)}
      <tr>
        <td colspan="8" style="border:${BORDER}; vertical-align:top; padding:6px;">
          <div style="min-height:120mm; display:flex; align-items:center; justify-content:center;">${img}</div>
          <div style="text-align:center; color:#0000c0; font-weight:bold; font-size:12px; margin-top:4px;">${escapeHtml(MAP_FOOTNOTE)}</div>
        </td>
        <td colspan="4" style="border:${BORDER}; vertical-align:top; padding:6px;">
          ${legendTable()}
          ${focusList()}
        </td>
      </tr>
    </table>`
}

// ── 위험요인 및 개선대책 표 ────────────────────────────────
export function riskControlTable(title: string, firstColLabel: string, rows: RiskControlRow[]): string {
  const body =
    rows.length > 0
      ? rows
          .map(
            (r, i) =>
              `<tr>${cell(String(i + 1), VALUE)}${cell(escapeHtml(r.workStep), LEFT, 3)}${cell(escapeHtml(r.riskFactor), LEFT, 4)}${cell(escapeHtml(r.improvementMeasure), LEFT, 4)}</tr>`
          )
          .join('')
      : `<tr>${cell('', VALUE)}${cell('', LEFT, 3)}${cell('', LEFT, 4)}${cell('', LEFT, 4)}</tr>`
  return `
    ${sectionTitle(title)}
    <table style="${TABLE}">
      ${colgroup(12)}
      <tr>${cell('연번', LABEL)}${cell(escapeHtml(firstColLabel), LABEL, 3)}${cell('위험요인', LABEL, 4)}${cell('개선대책', LABEL, 4)}</tr>
      ${body}
    </table>`
}

// ── 체크리스트 표 ──────────────────────────────────────────
function mark(target: ChecklistResult, current: ChecklistResult | undefined): string {
  return current === target ? '■' : '□'
}

export function checklistTable(title: string, items: readonly string[], answers: ChecklistAnswer[]): string {
  const byIndex = new Map<number, ChecklistAnswer>(answers.map((a) => [a.itemIndex, a]))
  const rows = items
    .map((q, i) => {
      const a = byIndex.get(i)
      const note = a?.note ? `<div style="color:#444; font-size:11px; margin-top:2px;">└ ${escapeHtml(a.note)}</div>` : ''
      const question = `<div>${escapeHtml(q)}</div>${note}`
      return `<tr>${cell(question, `${LEFT} height:30px;`)}${cell(mark('양호', a?.result), VALUE)}${cell(mark('미흡', a?.result), VALUE)}${cell(mark('해당없음', a?.result), VALUE)}</tr>`
    })
    .join('')
  return `
    ${sectionTitle(title)}
    <table style="width:100%; border-collapse:collapse; table-layout:fixed; margin-top:-1px;">
      <colgroup><col style="width:76%"/><col style="width:8%"/><col style="width:8%"/><col style="width:8%"/></colgroup>
      <tr>${cell('점검사항', LABEL)}${cell('양호', LABEL)}${cell('미흡', LABEL)}${cell('해당없음', LABEL)}</tr>
      ${rows}
    </table>`
}

// ── 건설기계 인양능력 검토표 (2-1·2-4 공용) ────────────────
export function liftingReviewTable(review: LiftingCapacityReview | undefined): string {
  const total = numOrBlank(review?.totalLoadTon)
  const capacity = numOrBlank(review?.maxCapacityTon)
  const pct = numOrBlank(review?.safetyRatioPercent)
  const expr = LIFTING_CAPACITY_FORMULA.replace('안전율 = ', '')
  const notes = LIFTING_CAPACITY_NOTES.map(
    (n) => `<tr>${cell(`※ ${escapeHtml(n)}`, `${LEFT} font-size:11px;`, 12)}</tr>`
  ).join('')
  return `
    ${sectionTitle('<건설기계 인양능력 검토>')}
    <table style="${TABLE}">
      ${colgroup(12)}
      <tr>${cell('중량물 총 하중', LABEL, 3)}${cell(total ? `${total} ton` : '&nbsp; ton', `${VALUE} text-align:right;`, 3)}${cell('최대 양중능력', LABEL, 3)}${cell(capacity ? `${capacity} ton` : '&nbsp; ton', `${VALUE} text-align:right;`, 3)}</tr>
      ${notes}
      <tr>${cell('안전율', LABEL, 3)}${cell(`${escapeHtml(expr)} = ( ${pct} )% <b>※ ${escapeHtml(CAPACITY_WARNING)}</b>`, LEFT, 9)}</tr>
    </table>`
}

// ── 줄걸이 인양능력 검토표 (2-1·2-4 공용) ─────────────────
function slingCount(method: string): string {
  const m = method?.match(/(\d)/)
  return m ? m[1] : ''
}

function safetyFactorTable(): string {
  const s = SAFETY_FACTORS
  return `
    <div style="font-size:11px; font-weight:bold; margin-bottom:2px;">※ 안전계수</div>
    <table style="width:100%; border-collapse:collapse; table-layout:fixed; font-size:11px;">
      <tr>${cell('작업구분', LABEL)}${cell(escapeHtml(s.workerBoarding.label), LABEL)}${cell(escapeHtml(s.rigging.label), LABEL)}</tr>
      <tr>${cell('안전계수', LABEL)}${cell(String(s.workerBoarding.value), VALUE)}${cell(`${s.rigging.value}(섬유로프: ${s.fiberRopeRigging.value})`, VALUE)}</tr>
    </table>`
}

function tensionFactorTable(): string {
  const head = TENSION_FACTORS.map((t) => cell(`${t.angleDegree}°`, LABEL)).join('')
  const vals = TENSION_FACTORS.map((t) => cell(String(t.value), VALUE)).join('')
  return `
    <div style="font-size:11px; font-weight:bold; margin-bottom:2px;">※ 장력계수</div>
    <table style="width:100%; border-collapse:collapse; table-layout:fixed; font-size:11px;">
      <tr>${cell('각도', LABEL)}${head}</tr>
      <tr>${cell('장력계수', LABEL)}${vals}</tr>
    </table>`
}

export function riggingReviewTable(r: RiggingCapacityReview | undefined): string {
  const tools = r?.tools || []
  const toolBox = `
    ${checkbox('와이어로프', tools.includes('와이어로프'))} ${checkbox('섬유로프', tools.includes('섬유로프'))}<br/>
    ${checkbox('체인블럭', tools.includes('체인블럭'))} ${checkbox('기타', tools.includes('기타'))}( ${escapeHtml(r?.otherTool || '')} )`
  const spec = `D : ( ${numOrBlank(r?.diameterMm)} )mm, L : ( ${numOrBlank(r?.lengthM)} )m, ( ${numOrBlank(r?.quantity)} )EA<br/>각 안전하중 : ( ${numOrBlank(r?.safeLoadPerToolTon)} )ton`
  const methodBox = `
    ${checkbox('1줄걸이', r?.slingMethod === '1줄걸이')} ${checkbox('2줄걸이', r?.slingMethod === '2줄걸이')}<br/>
    ${checkbox('3줄걸이', r?.slingMethod === '3줄걸이')} ${checkbox('4줄걸이', r?.slingMethod === '4줄걸이')}`
  const hookLabel = escapeHtml(r?.hookTool || '') || '훅/샤클/아이볼트'
  const hookSpec = `${hookLabel} : D ( ${numOrBlank(r?.hookDiameterInch)} )in, ( ${numOrBlank(r?.hookQuantity)} )EA<br/>각 안전하중 : ( ${numOrBlank(r?.hookSafeLoadTon)} )ton`

  const breaking = numOrBlank(r?.breakingLoadTon)
  const safeLoad = numOrBlank(r?.safeLoadTon)
  const count = r?.slingMethod ? slingCount(r.slingMethod) : ''
  const sf = numOrBlank(r?.safetyFactor)
  const tf = numOrBlank(r?.tensionFactor)
  const pct = numOrBlank(r?.safetyRatioPercent)
  const ratioExpr = RIGGING_SAFETY_RATIO_FORMULA.replace('안전율 = ', '')

  return `
    ${sectionTitle('<줄걸이 인양능력 검토>')}
    <table style="${TABLE}">
      ${colgroup(12)}
      <tr>${cell('줄걸이 용구', LABEL, 2)}${cell(toolBox, LEFT, 4)}${cell('줄걸이 규격', LABEL, 2)}${cell(spec, LEFT, 4)}</tr>
      <tr>${cell('줄걸이 방법', LABEL, 2)}${cell(methodBox, LEFT, 4)}${cell('고리걸이용구/규격', LABEL, 2)}${cell(hookSpec, LEFT, 4)}</tr>
      <tr>${cell('줄걸이 절단하중', LABEL, 2)}${cell(breaking ? `${breaking} ton` : '&nbsp; ton', `${VALUE} text-align:right;`, 4)}${cell('줄걸이 안전하중', LABEL, 2)}${cell(safeLoad ? `${safeLoad} ton` : '&nbsp; ton', `${VALUE} text-align:right;`, 4)}</tr>
      <tr>${cell('※ 줄걸이 절단하중 : 줄걸이 제조사별 구조계산서 등 제원 확인 후 기재', `${LEFT} font-size:11px;`, 12)}</tr>
      <tr>${cell(`※ ${escapeHtml(RIGGING_CAPACITY_FORMULA)} → 절단하중 ( ${breaking} ) × 줄걸이 수 ( ${count} ) ÷ ( 안전계수 ( ${sf} ) × 장력계수 ( ${tf} ) ) = ( ${safeLoad} ) ton`, `${LEFT} font-size:11px;`, 12)}</tr>
      <tr>
        <td colspan="6" style="border:${BORDER}; padding:4px 6px; vertical-align:top;">${safetyFactorTable()}</td>
        <td colspan="6" style="border:${BORDER}; padding:4px 6px; vertical-align:top;">${tensionFactorTable()}</td>
      </tr>
      <tr>${cell('안전율', LABEL, 2)}${cell(`${escapeHtml(ratioExpr)} = ( ${pct} )% <b>※ ${escapeHtml(CAPACITY_WARNING)}</b>`, LEFT, 10)}</tr>
    </table>`
}

// ── 파일명 ─────────────────────────────────────────────────
export function buildFileName(planType: PlanType, title: string, dateStr: string | null): string {
  const opt = PLAN_TYPE_OPTIONS.find((o) => o.value === planType)
  const shortTitle = opt?.shortTitle ?? ''
  let d = new Date()
  if (dateStr && /^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    const parsed = new Date(dateStr)
    if (!Number.isNaN(parsed.getTime())) d = parsed
  }
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  return `작업계획서_${shortTitle}_${title || ''}_${ymd}.pdf`
}

// ── 오프스크린 렌더 → jsPDF (A4 세로, 페이지별 캡처) ───────
function waitForImages(el: HTMLElement): Promise<unknown> {
  return Promise.all(
    Array.from(el.querySelectorAll('img')).map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.onload = () => resolve()
            img.onerror = () => resolve()
          })
    )
  )
}

// 페이지별 HTML 문자열 배열을 받아 A4 세로 PDF로 저장.
// 하단 여백을 남기고 본문을 배치한 뒤, 모든 페이지 하단에 "현재/전체" 페이지 번호를 표기한다.
export async function renderWorkPlanPdf(pagesHtml: string[], fileName: string): Promise<void> {
  const html2canvas = (await import('html2canvas')).default
  const jsPDF = (await import('jspdf')).jsPDF

  const pdf = new jsPDF('p', 'mm', 'a4')
  const pageWidth = 210
  const pageHeight = 297
  // 페이지 번호 영역(하단) — 본문이 번호를 가리지 않도록 콘텐츠 최대 높이를 제한한다.
  const footerReserveMm = 10
  const contentMaxHeight = pageHeight - footerReserveMm
  const totalPages = pagesHtml.length
  const restoreTextFix = applyHtml2canvasTextFix()

  try {
    for (let i = 0; i < pagesHtml.length; i++) {
      const container = document.createElement('div')
      container.style.cssText = `position:absolute; top:0; left:-9999px; width:210mm; min-height:297mm; padding:10mm 10mm ${footerReserveMm}mm; background-color:#ffffff; box-sizing:border-box; font-family:${FONT}; color:#000; font-size:12px;`
      container.innerHTML = pagesHtml[i]
      document.body.appendChild(container)
      try {
        await waitForImages(container)
        const canvas = await html2canvas(container, {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#ffffff',
          logging: false,
        })
        let imgW = pageWidth
        let imgH = (canvas.height * imgW) / canvas.width
        // 한 페이지(번호 영역 제외)를 넘으면 비율을 유지하며 축소한다.
        if (imgH > contentMaxHeight) {
          imgW = (imgW * contentMaxHeight) / imgH
          imgH = contentMaxHeight
        }
        if (i > 0) pdf.addPage()
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', (pageWidth - imgW) / 2, 0, imgW, imgH, undefined, 'FAST')

        // 페이지 하단 중앙 번호 (예: 3 / 12)
        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(9)
        pdf.setTextColor(90)
        pdf.text(`${i + 1} / ${totalPages}`, pageWidth / 2, pageHeight - 5, { align: 'center' })
      } finally {
        document.body.removeChild(container)
      }
    }
    pdf.save(fileName)
  } finally {
    restoreTextFix()
  }
}
