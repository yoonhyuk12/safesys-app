// 품질시험 월례보고서(별지 제3호서식) PDF 생성 — A4 가로, html2canvas + jsPDF
// 오프스크린 컨테이너에 양식 HTML을 그려 캡처하는 기존 lib/reports 공통 패턴.
// 동적 값은 전부 escapeHtml로 이스케이프해 innerHTML 주입을 방지한다.

import { applyHtml2canvasTextFix } from './html2canvas-text-fix'
import {
  QualityMonthlyReportRecord,
  QualityMonthlyReportRow,
  deriveRow,
  extractUnit,
  formatNum,
} from '../quality/quality-monthly-types'

const ROWS_PER_PAGE = 10

const CELL = 'border: 1px solid #000; padding: 3px 4px; text-align: center; font-size: 12px;'
const HEAD = `${CELL} background-color: #f0f0f0; font-weight: bold;`

function escapeHtml(value: string): string {
  return (value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildDataRowHtml(row: QualityMonthlyReportRow, showWorkType: boolean): string {
  const d = deriveRow(row)
  // 누계 시공물량·시공잔량에는 년 시공계획 물량의 단위(㎥ 등), 횟수 계산 셀에는 년 시공계획 횟수의 단위를 붙여 출력
  const volumeUnit = escapeHtml(extractUnit(row.yearlyPlan))
  const countUnit = escapeHtml(extractUnit(row.yearlyPlanCount))
  const cells = [
    showWorkType ? escapeHtml(row.workType) : '',
    escapeHtml(row.testItem).replace(/\n/g, '<br/>'),
    escapeHtml(row.yearlyPlan),
    escapeHtml(row.yearlyPlanCount),
    escapeHtml(row.monthVolume),
    d.monthTotal !== null ? formatNum(d.monthTotal) + countUnit : '',
    escapeHtml(row.monthQualityTest),
    d.monthConfirmSubtotal !== null ? formatNum(d.monthConfirmSubtotal) + countUnit : '',
    escapeHtml(row.monthExpertConfirm),
    escapeHtml(row.monthOtherConfirm),
    d.cumulVolume !== null ? formatNum(d.cumulVolume) + volumeUnit : '',
    d.cumulTotal !== null ? formatNum(d.cumulTotal) + countUnit : '',
    d.cumulQualityTest !== null ? formatNum(d.cumulQualityTest) + countUnit : '',
    d.cumulConfirmSubtotal !== null ? formatNum(d.cumulConfirmSubtotal) + countUnit : '',
    d.cumulExpertConfirm !== null ? formatNum(d.cumulExpertConfirm) + countUnit : '',
    d.cumulOtherConfirm !== null ? formatNum(d.cumulOtherConfirm) + countUnit : '',
    escapeHtml(row.nextMonthPlan),
    escapeHtml(row.nextMonthPlanCount),
    d.remaining !== null ? formatNum(d.remaining) + volumeUnit : '',
    d.remainingCount !== null ? formatNum(d.remainingCount) + countUnit : '',
  ]
  return `<tr>${cells.map((c) => `<td style="${CELL} height: 30px;">${c || '&nbsp;'}</td>`).join('')}</tr>`
}

function buildEmptyRowHtml(): string {
  return `<tr>${Array(20).fill(0).map(() => `<td style="${CELL} height: 30px;">&nbsp;</td>`).join('')}</tr>`
}

function buildPageHtml(
  record: QualityMonthlyReportRecord,
  rowsForPage: QualityMonthlyReportRow[],
  pageIndex: number,
  totalPages: number
): string {
  const nextMonth = record.report_month === 12 ? 1 : record.report_month + 1
  // 같은 공종이 연속되면 페이지 내 첫 행에만 공종명 표시, 나머지는 공란
  const dataRows = rowsForPage
    .map((row, i) =>
      buildDataRowHtml(row, i === 0 || row.workType.trim() !== rowsForPage[i - 1].workType.trim())
    )
    .join('')
  const emptyRows = Array(Math.max(0, ROWS_PER_PAGE - rowsForPage.length))
    .fill(0)
    .map(buildEmptyRowHtml)
    .join('')

  // 서명란(작성자/확인자)은 첫 페이지에만 표시
  const signatureBlock =
    pageIndex === 0
      ? `
      <div style="display: flex; justify-content: flex-end; margin-top: 2px;">
        <div style="font-size: 13px; text-align: left; line-height: 1.5;">
          <div>작성자 : ${escapeHtml(record.author_name) || '&nbsp;'} &nbsp;(인)</div>
          <div>확인자 : ${escapeHtml(record.confirmer_name) || '&nbsp;'} &nbsp;(인)</div>
        </div>
      </div>`
      : ''

  // 2페이지 이상일 때만 페이지 하단 가운데에 페이지 번호 표시
  const pageIndicator =
    totalPages > 1
      ? `<div style="position: absolute; bottom: 0; left: 0; right: 0; text-align: center; font-size: 11px;">- ${pageIndex + 1} / ${totalPages} -</div>`
      : ''

  return `
    <div style="width: 100%; position: relative; min-height: 190mm; font-family: 'Malgun Gothic', '맑은 고딕', Arial, sans-serif; color: #000;">
      <div style="font-size: 11px;">(公社시험업무지침 별지 제3호서식)</div>
      <div style="text-align: center; margin: 4px 0 2px;">
        <span style="display: inline-block; font-size: 26px; font-weight: 900; border-bottom: 3px double #000; padding: 0 10px 2px;">
          ${record.report_year}년 ${record.report_month}월 품질시험 실적 및 다음월 시공계획
        </span>
      </div>
      <div style="text-align: center; font-size: 12px;">(지침 제15조 관련)</div>
      ${signatureBlock}
      <div style="font-size: 14px; font-weight: bold; margin: 0 0 4px;">지구명 : ${escapeHtml(record.district_name)}</div>

      <table style="width: 100%; border-collapse: collapse; border: 2px solid #000; table-layout: fixed;">
        <thead>
          <tr>
            <th rowspan="4" style="${HEAD} width: 6%;">공종</th>
            <th rowspan="4" style="${HEAD} width: 8%;">시 험<br/>항 목</th>
            <th colspan="2" style="${HEAD}">(${record.report_year})년<br/>시 공<br/>계 획</th>
            <th colspan="6" style="${HEAD}">(${record.report_month})월 시공내역</th>
            <th colspan="6" style="${HEAD}">이번 월까지 시공누계</th>
            <th colspan="2" style="${HEAD}">(${nextMonth})월<br/>시 공 계 획</th>
            <th colspan="2" style="${HEAD}">시공잔량③</th>
          </tr>
          <tr>
            <th rowspan="3" style="${HEAD} width: 5.5%;">물 량</th>
            <th rowspan="3" style="${HEAD} width: 5.5%;">횟 수</th>
            <th rowspan="3" style="${HEAD} width: 5.5%;">시공<br/>물량</th>
            <th rowspan="3" style="${HEAD} width: 5.5%;">계<br/>①+②</th>
            <th colspan="4" style="${HEAD}">시 험 회 수</th>
            <th rowspan="3" style="${HEAD} width: 5.5%;">시공<br/>물량</th>
            <th rowspan="3" style="${HEAD} width: 5.5%;">계<br/>①+②</th>
            <th colspan="4" style="${HEAD}">시 험 회 수</th>
            <th rowspan="3" style="${HEAD} width: 5.5%;">물 량</th>
            <th rowspan="3" style="${HEAD} width: 4.5%;">횟 수</th>
            <th rowspan="3" style="${HEAD} width: 5.5%;">물 량</th>
            <th rowspan="3" style="${HEAD} width: 4.5%;">횟 수</th>
          </tr>
          <tr>
            <th rowspan="2" style="${HEAD} width: 5.5%;">품질<br/>시험①</th>
            <th colspan="3" style="${HEAD}">확인시험②</th>
            <th rowspan="2" style="${HEAD} width: 5.5%;">품질<br/>시험①</th>
            <th colspan="3" style="${HEAD}">확인시험②</th>
          </tr>
          <tr>
            <th style="${HEAD} width: 5.5%;">소 계</th>
            <th style="${HEAD} width: 5.5%;">전문기관<br/>확 인</th>
            <th style="${HEAD} width: 5.5%;">기타확인</th>
            <th style="${HEAD} width: 5.5%;">소 계</th>
            <th style="${HEAD} width: 5.5%;">전문기관<br/>확 인</th>
            <th style="${HEAD} width: 5.5%;">기타확인</th>
          </tr>
        </thead>
        <tbody>
          ${dataRows}
          ${emptyRows}
        </tbody>
      </table>

      <div style="margin-top: 8px; font-size: 11px; line-height: 1.6;">
        <div>(기입요령)</div>
        <div>&nbsp;① 건설업자가 실시한 품질시험 및 검사 회수</div>
        <div>&nbsp;② 지침 제17조 내지 제21조에 의한 확인시험 회수로서 제17조에 의한 시험은 전문기관 확인란에 기입하고, 제18조 내지 제21조에 의한 시험은 기타확인란에 기입할 것.</div>
        <div>&nbsp;③ 시공잔량 = 년시공계획 - 이번 월까지 시공누계</div>
      </div>
      ${pageIndicator}
    </div>
  `
}

// 셀 폭 때문에 자동 줄바꿈되는 텍스트를 한 줄로 맞춤 — 글자 크기를 줄이고, 그래도 넘치면 장평(가로 스케일)을 줄인다.
// 명시적 <br/> 줄바꿈(시험항목 등)은 그대로 유지되고, 각 줄의 최대 폭 기준으로 맞춘다.
function fitCellTextToOneLine(container: HTMLElement): void {
  const MIN_FONT_PX = 7
  container.querySelectorAll<HTMLElement>('th, td').forEach((cell) => {
    cell.style.whiteSpace = 'nowrap'
    const style = window.getComputedStyle(cell)
    const available = cell.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
    if (available <= 0) return
    // 내용 폭을 정확히 재기 위해 자식들을 인라인 블록 span으로 감싼다
    const inner = document.createElement('span')
    inner.style.display = 'inline-block'
    while (cell.firstChild) inner.appendChild(cell.firstChild)
    cell.appendChild(inner)
    let size = parseFloat(style.fontSize) || 12
    while (inner.offsetWidth > available && size > MIN_FONT_PX) {
      size -= 0.5
      cell.style.fontSize = `${size}px`
    }
    if (inner.offsetWidth > available) {
      inner.style.transform = `scaleX(${available / inner.offsetWidth})`
      inner.style.transformOrigin = 'left center'
    }
  })
}

// 월례보고서 1건을 A4 가로 PDF로 다운로드. 행이 많으면 페이지 자동 분할.
export async function downloadQualityMonthlyReportPdf(
  record: QualityMonthlyReportRecord,
  projectName: string
): Promise<void> {
  const jsPDF = (await import('jspdf')).jsPDF
  const html2canvas = (await import('html2canvas')).default

  const rows = record.report_rows || []
  const pages: QualityMonthlyReportRow[][] = []
  for (let i = 0; i < rows.length; i += ROWS_PER_PAGE) {
    pages.push(rows.slice(i, i + ROWS_PER_PAGE))
  }
  if (pages.length === 0) pages.push([])

  const pdf = new jsPDF('l', 'mm', 'a4')
  const cleanupTextFix = applyHtml2canvasTextFix()

  try {
    for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
      const container = document.createElement('div')
      container.style.width = '297mm'
      container.style.minHeight = '210mm'
      container.style.padding = '10mm 12mm'
      container.style.backgroundColor = 'white'
      container.style.boxSizing = 'border-box'
      container.style.position = 'absolute'
      container.style.left = '-9999px'
      container.innerHTML = buildPageHtml(record, pages[pageIndex], pageIndex, pages.length)
      document.body.appendChild(container)
      fitCellTextToOneLine(container)

      try {
        const canvas = await html2canvas(container, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
        })
        const imgWidth = 297
        const imgHeight = Math.min(210, (canvas.height * imgWidth) / canvas.width)
        if (pageIndex > 0) pdf.addPage()
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, imgWidth, imgHeight, undefined, 'FAST')
      } finally {
        document.body.removeChild(container)
      }
    }
  } finally {
    cleanupTextFix()
  }

  const fileName = `품질시험월례보고서_${projectName || '프로젝트'}_${record.report_year}년${record.report_month}월.pdf`
  pdf.save(fileName)
}
