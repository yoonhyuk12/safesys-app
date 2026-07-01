import { applyHtml2canvasTextFix } from './html2canvas-text-fix'

export interface HeadquartersInspectionReportParams {
  projectName: string
  inspections: any[]
  branchName?: string
  hqName?: string
}

function getQuarterLabel(dateStr?: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const m = d.getMonth() + 1
  const q = m <= 3 ? '1분기' : m <= 6 ? '2분기' : m <= 9 ? '3분기' : '4분기'
  return `${d.getFullYear()}년 ${q}`
}

function yesNo(status: 'good' | 'bad' | '' | undefined, target: 'yes' | 'no'): string {
  if (!status) return '□'
  if (status === 'good' && target === 'yes') return '☑'
  if (status === 'bad' && target === 'no') return '☑'
  return '□'
}

// 5대 핵심 안전수칙 등급별 라벨
const FIVE_KEY_GRADE_LABEL: Record<string, string> = {
  '1': '매우우수',
  '2': '우수',
  '3': '보통',
  '4': '미흡',
  '5': '불이행',
  'N/A': '해당없음'
}

// 5대 핵심 안전수칙 기본 항목 (5개 카테고리, 17개 항목)
const DEFAULT_FIVE_KEY_REPORT_ITEMS: { category: string; title: string; description: string }[] = [
  { category: '① TBM 실시', title: '1) TBM 실시', description: '· TBM 작업 시작 전 실시 여부' },
  { category: '① TBM 실시', title: '2) 위험성평가 사항 공유', description: '· 당일 작업에 대한 위험성평가 사항 공유 여부' },
  { category: '① TBM 실시', title: '3) 위험성평가 사항 대책의 적절성', description: '· 유해위험요인별 감소대책이 구체적이고 실행 가능한지 여부' },
  { category: '① TBM 실시', title: '4) 관리자 입회 횟수', description: '· 관리자 입회 횟수' },
  { category: '② 신규근로자 작업 전 현장 둘러보기', title: '1) 신규근로자 작업 전 현장 둘러보기 실시', description: '· 작업 투입 전 현장 둘러보기 실시 여부' },
  { category: '② 신규근로자 작업 전 현장 둘러보기', title: '2) 신규근로자 현장 안내 일지 작성 및 관리', description: '· 현장 안내 일지 작성 및 관리 여부' },
  { category: '② 신규근로자 작업 전 현장 둘러보기', title: '3) 관리자 동행 횟수', description: '· 관리자 동행 횟수' },
  { category: '③ 건설기계 주변 접근금지, 신호수 배치', title: '1) 건설기계 후사경 및 후방영상 표시장치 등 부착상태 및 작동상태', description: '· 후사경·후방카메라 부착 상태 및 정상 작동 여부, 화면 선명도 확인' },
  { category: '③ 건설기계 주변 접근금지, 신호수 배치', title: '2) 작업계획서 작성 및 PTW 승인', description: '· 건설기계 작업계획서 작성 여부 및 PTW 승인 절차 이행 확인' },
  { category: '③ 건설기계 주변 접근금지, 신호수 배치', title: '3) 차량동선과 근로자동선 구분 및 분리', description: '· 차량 이동경로와 보행자 통로가 분리되어 있는지 확인' },
  { category: '③ 건설기계 주변 접근금지, 신호수 배치', title: '4) 건설기계 주변 신호수 배치', description: '· 장비 작업반경 내 신호수 배치 여부' },
  { category: '④ 개인보호구 착용 철저', title: '1) 작업별 적정 개인보호구 착용', description: '· 안전모·안전화·안전대 등 작업별 적정 보호구 착용 여부 및 착용 상태(턱끈 체결 등) 확인' },
  { category: '④ 개인보호구 착용 철저', title: '2) 개인보호구 지급·관리', description: '· 보호구 지급대장 관리 여부, 마모·파손 보호구 교체 및 예비 보호구 비치 현황 확인' },
  { category: '④ 개인보호구 착용 철저', title: '3) 고소작업 시 안전대 부착설비 설치', description: '· 안전대 부착설비(구명줄·걸이설비) 설치 상태 및 안전대 정상 작동 여부 확인' },
  { category: '⑤ 안전보건표지 설치', title: '1) 현장 맞춤형 안전보건표지 제작·설치', description: '· 현장 위험요인(추락·낙하·감전 등)에 맞는 표지가 적정 위치에 설치되어 있는지 확인' },
  { category: '⑤ 안전보건표지 설치', title: '2) 훼손등에 대한 지속적 관리', description: '· 훼손·오염·탈락된 안전보건표지의 적정 관리 여부' },
  { category: '⑤ 안전보건표지 설치', title: '3) 외국인근로자 대상 다국어 표지 설치', description: '· 외국인 근로자 국적별 다국어 표기 여부' },
]

// 5대 핵심 안전수칙 페이지 HTML 빌더 (엑셀 양식과 동일 구조)
function buildFiveKeyPageHtml(
  ins: any,
  projectName: string,
  branchName: string | undefined,
  hqName: string | undefined
): string {
  // DB 데이터와 기본 항목 병합 (title 기준)
  // 등급이 비어있으면 기본값 '1'등급으로 처리
  const rawItems = (ins.five_key_items || []) as any[]
  const existingMap = new Map(rawItems.map((it: any) => [it.title, it]))
  const items = DEFAULT_FIVE_KEY_REPORT_ITEMS.map(def => {
    const existing = existingMap.get(def.title) as any
    const rawGrade = existing?.grade
    return {
      ...def,
      grade: (rawGrade && rawGrade !== '' ? rawGrade : '1') as string,
      remarks: existing?.remarks ?? '',
      count: existing?.count
    }
  })

  // 카테고리별 그룹핑 (rowspan용)
  const groups: { category: string; items: typeof items }[] = []
  items.forEach(it => {
    const last = groups[groups.length - 1]
    if (last && last.category === it.category) {
      last.items.push(it)
    } else {
      groups.push({ category: it.category, items: [it] })
    }
  })

  // 본문 총 행수: 카테고리 헤더(5) + 세부 항목(17) = 22
  const totalBodyRows = items.length + new Set(items.map(i => i.category)).size

  const check = (item: { grade: string }, target: string): string =>
    item.grade === target ? '☑' : ''

  // 횟수 입력 항목 판별 (관리자 입회/동행 횟수)
  const isCountItem = (title: string): boolean => title.trim().endsWith('횟수')

  // 엑셀 상단 체크 라인: ☑ OO본부 OO지사 OO사업
  const tag = (s: string | undefined, fallback: string) => s && s.trim() ? `${s}` : fallback
  const headerLine = `☑ ${tag(hqName, 'OO본부')} ${tag(branchName, 'OO지사')} ${tag(projectName, 'OO사업')}`

  const insDate = ins.inspection_date
    ? (() => {
        const d = new Date(ins.inspection_date)
        return `${d.getFullYear()}.    ${d.getMonth() + 1}.    ${d.getDate()}.`
      })()
    : `${new Date().getFullYear()}.    .    .`

  // 본문 행 생성: 카테고리 헤더 행 + 세부 항목 행 (모두 같은 "주요 항목" 컬럼)
  // 컬럼: 구분 / 주요 항목 / 1~5등급 / 해당없음 / 점검결과
  let bodyRows = ''
  let isFirstRowInTable = true
  groups.forEach(group => {
    // 카테고리 헤더 행 (구분 셀은 첫 행에만 rowspan으로 출력)
    const sectionCellForCat = isFirstRowInTable
      ? `<td rowspan="${totalBodyRows}" class="cell-section"><div class="fk-ci">5대<br/>핵심<br/>안전<br/>수칙</div></td>`
      : ''
    bodyRows += `
      <tr class="fk-cat-row">
        ${sectionCellForCat}
        <td class="cell-cat-row"><div class="fk-ci left">${group.category}</div></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
      </tr>
    `
    isFirstRowInTable = false

    // 세부 항목 행
    group.items.forEach(it => {
      const gradeCells = isCountItem(it.title)
        ? `<td class="cell-grade cell-count" colspan="6"><div class="fk-ci">${typeof (it as any).count === 'number' ? (it as any).count : 0}건</div></td>`
        : `
          <td class="cell-grade"><div class="fk-ci">${check(it, '1')}</div></td>
          <td class="cell-grade"><div class="fk-ci">${check(it, '2')}</div></td>
          <td class="cell-grade"><div class="fk-ci">${check(it, '3')}</div></td>
          <td class="cell-grade"><div class="fk-ci">${check(it, '4')}</div></td>
          <td class="cell-grade"><div class="fk-ci">${check(it, '5')}</div></td>
          <td class="cell-grade"><div class="fk-ci">${check(it, 'N/A')}</div></td>`

      // 점검 결과: 사용자 입력값이 있으면 입력 텍스트, 없으면 "특이사항 없음"
      const trimmedRemarks = (it.remarks || '').trim()
      const hasUserRemarks = trimmedRemarks !== '' && trimmedRemarks !== '특이사항 없음'
      const resultText = hasUserRemarks ? trimmedRemarks : '특이사항 없음'

      bodyRows += `
        <tr>
          <td class="cell-title"><div class="fk-ci left">${it.title}</div></td>
          ${gradeCells}
          <td class="cell-result"><div class="fk-ci left pre">${resultText}</div></td>
        </tr>
      `
    })
  })

  return `
    <style>
      .fk-wrap { font-family: 'Malgun Gothic', '맑은 고딕', Arial, sans-serif; color:#000; }
      .fk-attach { font-size:11px; font-weight:bold; margin-bottom:4mm; }
      .fk-title { text-align:center; font-size:18px; font-weight:bold; margin-bottom: 6mm; letter-spacing: 1px; }
      .fk-headline { font-size:12px; margin: 0 0 3mm 2mm; }
      .fk-table { border-collapse: collapse; width:100%; table-layout: fixed; }
      /* html2canvas는 td/th의 vertical-align을 신뢰성 있게 렌더링하지 못해 flex wrapper(.fk-ci)로 수직 중앙 정렬 (1·2페이지와 동일 방식) */
      .fk-table th, .fk-table td { border: 0.75px solid #000; padding: 0; }
      .fk-table th { background:#f2f2f2; font-weight: bold; }
      .fk-ci { display:flex; align-items:center; justify-content:center; width:100%; height:100%; box-sizing:border-box; padding: 1mm 1.5mm; line-height: 1.2; text-align:center; }
      .fk-ci.left { justify-content:flex-start; text-align:left; }
      .fk-ci.pre { white-space:pre-wrap; }
      .fk-table .hdr-main { height: 5mm; }
      .fk-table .hdr-grade { height: 5mm; }
      .fk-table .hdr-main .fk-ci { font-size: 11px; padding: 1mm 0.5mm; line-height: 1.1; }
      .fk-table .hdr-grade .fk-ci { font-size: 8.5px; padding: 1mm 0.5mm; line-height: 1.1; }
      /* 본문 행 균일 높이 */
      .fk-table tbody tr td { height: 9.5mm; }
      .fk-table tbody tr.fk-cat-row td { height: 7mm; background:#fff8e1; }
      .fk-table tbody tr.fk-sum td { height: 8mm; }

      .cell-section .fk-ci { font-size:11px; font-weight:bold; background:#fafafa; letter-spacing: 1px; line-height: 1.6; }
      .cell-cat-row .fk-ci { font-size:10.5px; font-weight:bold; }
      .cell-title .fk-ci { font-size:9px; }
      .cell-grade .fk-ci { font-size:13px; padding: 0.5mm; }
      .cell-count .fk-ci { font-size:11px; font-weight:bold; }
      .cell-result .fk-ci { font-size:9px; color:#222; }
      .fk-foot-note { font-size:9px; color:#444; margin-top:6px; line-height:1.4; padding-left: 2mm; }
      .fk-sign { text-align: right; margin-top: 24px; font-size: 13px; }
      .fk-sign .sign-date { margin-bottom: 12px; letter-spacing: 1px; }
      .fk-sign .sign-row { display: inline-flex; align-items: center; gap: 12px; }
      .fk-sign .sign-circle { display:inline-block; width:28px; height:28px; border:1px solid #000; border-radius:50%; vertical-align:middle; text-align:center; line-height:28px; font-size:10px; color:#888; }
    </style>
    <div class="fk-wrap">
      <div class="fk-attach">붙임 2</div>
      <div class="fk-title">건설현장&nbsp;&nbsp;5대&nbsp;&nbsp;핵심&nbsp;&nbsp;안전수칙&nbsp;&nbsp;점검표</div>
      <div class="fk-headline">${headerLine}</div>
      <table class="fk-table">
        <colgroup>
          <col style="width:4%;" />
          <col style="width:30%;" />
          <col style="width:5%;" />
          <col style="width:5%;" />
          <col style="width:5%;" />
          <col style="width:5%;" />
          <col style="width:5%;" />
          <col style="width:6%;" />
          <col style="width:35%;" />
        </colgroup>
        <thead>
          <tr>
            <th rowspan="2" class="hdr-main"><div class="fk-ci">구 분</div></th>
            <th rowspan="2" class="hdr-main"><div class="fk-ci">주 요 항 목</div></th>
            <th colspan="6" class="hdr-main"><div class="fk-ci">이행여부</div></th>
            <th rowspan="2" class="hdr-main"><div class="fk-ci">점검 결과</div></th>
          </tr>
          <tr>
            <th class="hdr-grade"><div class="fk-ci">1등급</div></th>
            <th class="hdr-grade"><div class="fk-ci">2등급</div></th>
            <th class="hdr-grade"><div class="fk-ci">3등급</div></th>
            <th class="hdr-grade"><div class="fk-ci">4등급</div></th>
            <th class="hdr-grade"><div class="fk-ci">5등급</div></th>
            <th class="hdr-grade"><div class="fk-ci">해당없음</div></th>
          </tr>
        </thead>
        <tbody>
          ${bodyRows}
        </tbody>
      </table>
      <div class="fk-foot-note">
        ※ 각 항목의 세부 평가기준은 본부별 특성 및 현장 여건에 맞게 자체 기준(1~5등급)으로 평가하며, 5등급은 미이행 또는 확인 불가한 경우 적용한다.
      </div>
      <div class="fk-sign">
        <div class="sign-date">${insDate}</div>
        <div class="sign-row">
          <span>점검자</span>
          <span>${ins.inspector_name || '홍 길 동'}</span>
          ${ins.signature
            ? `<img src="${ins.signature}" style="max-width: 80px; max-height: 36px; vertical-align: middle;" />`
            : `<span class="sign-circle">인</span>`}
        </div>
      </div>
    </div>
  `
}

// 5대 핵심 안전수칙 페이지 렌더링 헬퍼 (단일 점검 1건당 1페이지 추가)
async function appendFiveKeyPage(
  pdf: any,
  html2canvas: any,
  ins: any,
  projectName: string,
  branchName: string | undefined,
  hqName: string | undefined,
  signal?: AbortSignal
): Promise<void> {
  const page = document.createElement('div')
  page.style.width = '210mm'
  page.style.minHeight = '297mm'
  page.style.padding = '12mm 12mm'
  page.style.background = '#ffffff'
  page.style.fontFamily = 'Arial, sans-serif'
  page.style.fontSize = '11px'
  page.innerHTML = buildFiveKeyPageHtml(ins, projectName, branchName, hqName)

  page.style.position = 'absolute'
  page.style.left = '-9999px'
  document.body.appendChild(page)
  try {
    await new Promise(r => setTimeout(r, 300))
    if (signal?.aborted) throw new Error('cancelled')
    const canvas = await html2canvas(page, {
      scale: 1.9,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff'
    })
    if (signal?.aborted) throw new Error('cancelled')
    const imgW = 210
    const imgH = (canvas.height * imgW) / canvas.width
    pdf.addPage()
    pdf.addImage(canvas.toDataURL('image/jpeg', 1.0), 'JPEG', 0, 0, imgW, imgH, undefined, 'FAST')
  } finally {
    document.body.removeChild(page)
  }
}

export async function generateHeadquartersInspectionReport(params: HeadquartersInspectionReportParams): Promise<void> {
  const restoreTextFix = applyHtml2canvasTextFix()
  try {
    await generateHeadquartersInspectionReportImpl(params)
  } finally {
    restoreTextFix()
  }
}

async function generateHeadquartersInspectionReportImpl(params: HeadquartersInspectionReportParams): Promise<void> {
  const { projectName, inspections, branchName: branchNameParam, hqName: hqNameParam } = params

  const html2canvas = (await import('html2canvas')).default
  const jsPDF = (await import('jspdf')).jsPDF

  const pdf = new jsPDF('p', 'mm', 'a4')
  let first = true

  for (let i = 0; i < inspections.length; i++) {
    const ins = inspections[i]

    // ---------- Page 1: Checklist ----------
    const page1 = document.createElement('div')
    page1.style.width = '210mm'
    page1.style.minHeight = '297mm'
    page1.style.padding = '12mm 15mm'
    page1.style.background = '#ffffff'
    page1.style.fontFamily = 'Arial, sans-serif'
    page1.style.fontSize = '11px'
    const branchName = branchNameParam || (ins as any).managing_branch || (ins as any).branch || ''
    page1.innerHTML = `
      <style>
        table { border-collapse: collapse; }
        table td, table th { vertical-align: middle; padding: 0; }
        td, th { position: relative; }
        /* 셀 내부 flex 중앙 정렬 wrapper (3페이지와 동일) */
        .ci { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; box-sizing: border-box; padding: 1mm 1.5mm; line-height: 1.25; }
        .ci.left { justify-content: flex-start; text-align: left; }
        .ci.right { justify-content: flex-end; text-align: right; }
        .ci.col { flex-direction: column; line-height: 1.15; }
        .ci.tight { padding: 0.5mm 0.5mm; }
        .ci.pre { white-space: pre-wrap; }
        .num { display:inline-block; width: 1.2em; margin-right: 3px; }
        .txt { display:inline; word-break: break-word; }
        .important-badge { display: inline-block; background: #dc2626; color: white; padding: 1px 5px; font-weight: bold; margin-right: 6px; font-size: 10px; }
        .chk-table tbody tr td { font-size: 10px; }
      </style>
      <div style="text-align:center; margin-bottom: 6mm;">
        <div style="font-size:18px; font-weight:bold; text-decoration: underline;">[${branchName ? branchName + ' ' : ''}${projectName}]</div>
        <div style="font-size:18px; font-weight:bold; margin-top:3px; text-decoration: underline;">${getQuarterLabel(ins.inspection_date)} 특별 및 불시점검 결과</div>
      </div>
      <table class="chk-table" style="width:100%; border-collapse:collapse;">
        <thead>
          <tr>
            <th rowspan="2" style="border:0.5px solid #000; background:#f2f2f2; width:30%; height:10mm; font-size:11px;">
              <div class="ci col">
                <span>점 검 항 목</span>
                <span style="font-size:9px; font-weight:normal;">[3대 유형(부딪힘, 물체에맞음, 추락)]</span>
              </div>
            </th>
            <th colspan="2" style="border:0.5px solid #000; background:#f2f2f2; width:10%; height:6mm; font-size:11px;">
              <div class="ci">이행여부</div>
            </th>
            <th rowspan="2" style="border:0.5px solid #000; background:#f2f2f2; width:60%; height:10mm; font-size:11px;">
              <div class="ci">점검 결과</div>
            </th>
          </tr>
          <tr>
            <th style="border:0.5px solid #000; background:#f2f2f2; width:5%; height:4mm; font-size:10px;"><div class="ci tight">여</div></th>
            <th style="border:0.5px solid #000; background:#f2f2f2; width:5%; height:4mm; font-size:10px;"><div class="ci tight">부</div></th>
          </tr>
        </thead>
        <tbody>
          <tr><td colspan="4" style="border:0.5px solid #000; background:#ffedd5; font-weight:bold; height:10mm; font-size:10px;"><div class="ci left"><span class="important-badge">중요</span><span>(부딪힘, 물체에맞음) 굴착기 등 사용 작업</span></div></td></tr>
          ${(ins.critical_items || []).map((it: any, idx: number) => `
            <tr>
              <td style="border:0.5px solid #000; height:${(190 / (2 + (ins.critical_items?.length || 0) + (ins.caution_items?.length || 0) + 7)).toFixed(2)}mm;"><div class="ci left"><span class="num">${(['➊', '➋', '➌', '➍', '➎', '➏', '➐', '➑', '➒', '➓'][idx] || (idx + 1))}</span><span class="txt">${it.title || ''}</span></div></td>
              <td style="border:0.5px solid #000; height:${(190 / (2 + (ins.critical_items?.length || 0) + (ins.caution_items?.length || 0) + 7)).toFixed(2)}mm;"><div class="ci">${yesNo(it.status, 'yes')}</div></td>
              <td style="border:0.5px solid #000; height:${(190 / (2 + (ins.critical_items?.length || 0) + (ins.caution_items?.length || 0) + 7)).toFixed(2)}mm;"><div class="ci">${yesNo(it.status, 'no')}</div></td>
              <td style="border:0.5px solid #000; height:${(190 / (2 + (ins.critical_items?.length || 0) + (ins.caution_items?.length || 0) + 7)).toFixed(2)}mm;"><div class="ci left pre">${it.remarks || ''}</div></td>
            </tr>
          `).join('')}
          <tr><td colspan="4" style="border:0.5px solid #000; background:#ffedd5; font-weight:bold; height:10mm; font-size:10px;"><div class="ci left"><span class="important-badge">중요</span><span>(추락) 가설구조물, 고소작업 등</span></div></td></tr>
          ${(ins.caution_items || []).map((it: any, idx: number) => `
            <tr>
              <td style="border:0.5px solid #000; height:${(190 / (2 + (ins.critical_items?.length || 0) + (ins.caution_items?.length || 0) + 7)).toFixed(2)}mm;"><div class="ci left"><span class="num">${(['➊', '➋', '➌', '➍', '➎', '➏', '➐', '➑', '➒', '➓'][idx] || (idx + 1))}</span><span class="txt">${it.title || ''}</span></div></td>
              <td style="border:0.5px solid #000; height:${(190 / (2 + (ins.critical_items?.length || 0) + (ins.caution_items?.length || 0) + 7)).toFixed(2)}mm;"><div class="ci">${yesNo(it.status, 'yes')}</div></td>
              <td style="border:0.5px solid #000; height:${(190 / (2 + (ins.critical_items?.length || 0) + (ins.caution_items?.length || 0) + 7)).toFixed(2)}mm;"><div class="ci">${yesNo(it.status, 'no')}</div></td>
              <td style="border:0.5px solid #000; height:${(190 / (2 + (ins.critical_items?.length || 0) + (ins.caution_items?.length || 0) + 7)).toFixed(2)}mm;"><div class="ci left pre">${it.remarks || ''}</div></td>
            </tr>
          `).join('')}
          ${(() => {
        const defaultTitles = ['법적이행사항 확인', 'VAR 매뉴얼 작동성 확인', '취약근로자 안전관리 확인', '재해예방기술지도 지적사항 이행 확인', '안전보건표지 설치', 'TBM 실시 확인', '기타 현장 안전관리에 관한 사항 (산업안전보건 기준에 관한 규칙 등)']
        const rawOthers = ins.other_items || []
        const existingMap = new Map(rawOthers.map((it: any) => [it.title, it]))
        const others = defaultTitles.map((title: string) => {
          if (existingMap.has(title)) return existingMap.get(title)
          return { title, status: '', remarks: '' }
        })
        return others.map((it: any, idx: number) => `
              <tr>
                <td style="border:0.5px solid #000; height:${(190 / (2 + (ins.critical_items?.length || 0) + (ins.caution_items?.length || 0) + 7)).toFixed(2)}mm;"><div class="ci left">${it.title || `기타항목 ${idx + 1}`}</div></td>
                <td style="border:0.5px solid #000; height:${(190 / (2 + (ins.critical_items?.length || 0) + (ins.caution_items?.length || 0) + 7)).toFixed(2)}mm;"><div class="ci">${yesNo(it.status, 'yes')}</div></td>
                <td style="border:0.5px solid #000; height:${(190 / (2 + (ins.critical_items?.length || 0) + (ins.caution_items?.length || 0) + 7)).toFixed(2)}mm;"><div class="ci">${yesNo(it.status, 'no')}</div></td>
                <td style="border:0.5px solid #000; height:${(190 / (2 + (ins.critical_items?.length || 0) + (ins.caution_items?.length || 0) + 7)).toFixed(2)}mm;"><div class="ci left pre">${it.remarks || ''}</div></td>
              </tr>
            `).join('')
      })()}
        </tbody>
      </table>
      <div style="font-size:9px; color:#555; margin-top:8px;">※ 점검표는 항목 변경 될 수 있음(변경 시 분기 시작 전 알림 예정)</div>
      <div style="text-align: right; margin-top: 30px;">
        <div style="font-size: 13px; margin-bottom: 15px;">
          ${ins.inspection_date ? (() => {
        const d = new Date(ins.inspection_date);
        return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
      })() : new Date().getFullYear() + '. &nbsp;&nbsp;. &nbsp;&nbsp;.'}
        </div>
        <div style="display: flex; justify-content: flex-end; align-items: center; gap: 15px; font-size: 13px;">
          <span>점검자</span>
          <div style="display: inline-flex; align-items: center; gap: 10px;">
            <span>${ins.inspector_name || ''}</span>
            ${ins.signature ? `<img src="${ins.signature}" style="max-width: 80px; max-height: 40px; vertical-align: middle;" />` : '<span style="display: inline-block; width: 30px; height: 30px; border: 1px solid #333; border-radius: 50%; vertical-align: middle;"></span>'}
          </div>
        </div>
      </div>
    `

    page1.style.position = 'absolute'
    page1.style.left = '-9999px'
    document.body.appendChild(page1)
    await new Promise(r => setTimeout(r, 300))
    const canvas1 = await html2canvas(page1, {
      scale: 1.9,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff'
    })
    document.body.removeChild(page1)

    const imgW = 210
    const imgH1 = (canvas1.height * imgW) / canvas1.width
    if (!first) pdf.addPage()
    pdf.addImage(canvas1.toDataURL('image/jpeg', 1.0), 'JPEG', 0, 0, imgW, imgH1, undefined, 'FAST')
    first = false

    // ---------- Page 2: Photos ----------
    const page2 = document.createElement('div')
    page2.style.width = '210mm'
    page2.style.minHeight = '297mm'
    page2.style.padding = '12mm 15mm'
    page2.style.background = '#ffffff'
    page2.style.fontFamily = 'Arial, sans-serif'
    page2.style.fontSize = '11px'
    page2.innerHTML = `
      <style>
        table { border-collapse: collapse; width:100%; }
        td, th { border:0.5px solid #000; padding:0; vertical-align: middle; }
        /* 셀 내부 flex 중앙 정렬 wrapper (3페이지와 동일) */
        .ci { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; box-sizing: border-box; padding: 1.5mm 2mm; line-height: 1.3; }
        .ci.left { justify-content: flex-start; text-align: left; }
        .ci.right { justify-content: flex-end; text-align: right; }
        .ci.pre { white-space: pre-wrap; }
        /* 전경사진: 이전 방식(셀 채우지 않음, contain) */
        .photo { height:85mm; display:flex; align-items:center; justify-content:center; padding:0; box-sizing:border-box; }
        .photo img { max-width:100%; max-height:100%; object-fit:contain; }
        /* 조치 전/후: 셀 가득 채우기 + 안쪽 여백 */
        .photo-small { height:55mm; display:flex; align-items:center; justify-content:center; padding:3mm; box-sizing:border-box; }
        .photo-small img { width:100%; height:100%; object-fit:fill; }
      </style>
      <div style="text-align:center; margin-bottom: 6mm;">
        <div style="font-size:20px; font-weight:bold;">건설현장 점검사진</div>
      </div>
      <table>
        <tr style="height:10mm;">
          <td style="width:12%; font-weight:bold;"><div class="ci">지구명</div></td>
          <td colspan="3"><div class="ci left">${projectName}</div></td>
        </tr>
        <tr style="height:10mm;">
          <td style="width:12%; font-weight:bold;"><div class="ci">일 시</div></td>
          <td style="width:38%;"><div class="ci left">${ins.inspection_date ? new Date(ins.inspection_date).toLocaleDateString('ko-KR') : ''}</div></td>
          <td style="width:12%; font-weight:bold;"><div class="ci">점 검 자</div></td>
          <td style="width:38%;"><div class="ci left">${ins.inspector_name || ''}</div></td>
        </tr>
        <tr>
          <td colspan="4" style="padding:0;">
            <div class="photo">
              ${ins.site_photo_overview ? `<img src="${ins.site_photo_overview}" />` : '<span style="color:#666;">현재 작업 중인 주요 공종의 전경이 보이도록 촬영</span>'}
            </div>
          </td>
        </tr>
        <tr style="height:10mm;">
          <td style="font-weight:bold;"><div class="ci">지적사항</div></td>
          <td style="font-weight:bold;"><div class="ci left">(조치 전) ${ins.issue_content1 || ''}</div></td>
          <td colspan="2" style="font-weight:bold;"><div class="ci left">(조치 후)</div></td>
        </tr>
        <tr>
          <td colspan="2" style="padding:0; width:50%;">
            <div class="photo-small">${ins.site_photo_issue1 ? `<img src="${ins.site_photo_issue1}" />` : ''}</div>
          </td>
          <td colspan="2" style="padding:0; width:50%;">
            <div class="photo-small">${ins.action_photo_issue1 === '해당 사항 없음' ? '<div style="display:flex; align-items:center; justify-content:center; height:100%; font-size:16px; font-weight:bold; color:#666;">해당 사항 없음</div>' : (ins.action_photo_issue1 ? `<img src="${ins.action_photo_issue1}" />` : '')}</div>
          </td>
        </tr>
        <tr style="height:10mm;">
          <td style="font-weight:bold;"><div class="ci">지적사항</div></td>
          <td style="font-weight:bold;"><div class="ci left">(조치 전) ${ins.issue_content2 || ''}</div></td>
          <td colspan="2" style="font-weight:bold;"><div class="ci left">(조치 후)</div></td>
        </tr>
        <tr>
          <td colspan="2" style="padding:0; width:50%;">
            <div class="photo-small">${ins.site_photo_issue2 ? `<img src="${ins.site_photo_issue2}" />` : ''}</div>
          </td>
          <td colspan="2" style="padding:0; width:50%;">
            <div class="photo-small">${ins.action_photo_issue2 === '해당 사항 없음' ? '<div style="display:flex; align-items:center; justify-content:center; height:100%; font-size:16px; font-weight:bold; color:#666;">해당 사항 없음</div>' : (ins.action_photo_issue2 ? `<img src="${ins.action_photo_issue2}" />` : '')}</div>
          </td>
        </tr>
      </table>
    `

    page2.style.position = 'absolute'
    page2.style.left = '-9999px'
    document.body.appendChild(page2)
    await new Promise(r => setTimeout(r, 300))
    const canvas2 = await html2canvas(page2, {
      scale: 1.9,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff'
    })
    document.body.removeChild(page2)

    const imgH2 = (canvas2.height * imgW) / canvas2.width
    pdf.addPage()
    pdf.addImage(canvas2.toDataURL('image/jpeg', 1.0), 'JPEG', 0, 0, imgW, imgH2, undefined, 'FAST')

    // ---------- Page 3: 5대 핵심 안전수칙 점검표 ----------
    const branchNameForFiveKey = branchNameParam || (ins as any).managing_branch || (ins as any).branch || ''
    const hqNameForFiveKey = hqNameParam || (ins as any).managing_hq || ''
    await appendFiveKeyPage(pdf, html2canvas, ins, projectName, branchNameForFiveKey, hqNameForFiveKey)
  }

  pdf.save(`${projectName}_본부불시점검_보고서.pdf`)
}

export interface HeadquartersInspectionReportGroup {
  projectName: string
  inspections: any[]
  branchName?: string
  hqName?: string
}

// 여러 프로젝트/지사의 점검 결과를 하나의 PDF로 병합 생성
export type HeadquartersReportOptions = {
  signal?: AbortSignal
  onProgress?: (current: number, total: number) => void
}

function ensureNotCancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw new Error('cancelled')
}

export async function generateHeadquartersInspectionReportBulk(groups: HeadquartersInspectionReportGroup[], filename?: string, options?: HeadquartersReportOptions): Promise<void> {
  const restoreTextFix = applyHtml2canvasTextFix()
  try {
    await generateHeadquartersInspectionReportBulkImpl(groups, filename, options)
  } finally {
    restoreTextFix()
  }
}

async function generateHeadquartersInspectionReportBulkImpl(groups: HeadquartersInspectionReportGroup[], filename?: string, options?: HeadquartersReportOptions): Promise<void> {
  if (!groups || groups.length === 0) return
  const signal = options?.signal
  const onProgress = options?.onProgress

  const html2canvas = (await import('html2canvas')).default
  const jsPDF = (await import('jspdf')).jsPDF

  const pdf = new jsPDF('p', 'mm', 'a4')
  let first = true

  // 전체 점검 수 계산
  const totalInspections = groups.reduce((sum, group) => sum + group.inspections.length, 0)
  let currentInspectionIndex = 0

  for (const group of groups) {
    ensureNotCancelled(signal)
    const { projectName, inspections, branchName, hqName } = group
    for (let i = 0; i < inspections.length; i++) {
      ensureNotCancelled(signal)
      const ins = inspections[i]
      currentInspectionIndex++
      onProgress?.(currentInspectionIndex, totalInspections)

      // ---------- Page 1 ----------
      const page1 = document.createElement('div')
      page1.style.width = '210mm'
      page1.style.minHeight = '297mm'
      page1.style.padding = '12mm 15mm'
      page1.style.background = '#ffffff'
      page1.style.fontFamily = 'Arial, sans-serif'
      page1.style.fontSize = '11px'
      const resolvedBranchName = branchName || (ins as any).managing_branch || (ins as any).branch || ''
      page1.innerHTML = `
        <style>
          table { border-collapse: collapse; }
          table td, table th { vertical-align: middle; padding: 0; }
          td, th { position: relative; }
          /* 셀 내부 flex 중앙 정렬 wrapper (3페이지와 동일) */
          .ci { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; box-sizing: border-box; padding: 1mm 1.5mm; line-height: 1.25; }
          .ci.left { justify-content: flex-start; text-align: left; }
          .ci.right { justify-content: flex-end; text-align: right; }
          .ci.col { flex-direction: column; line-height: 1.15; }
          .ci.tight { padding: 0.5mm 0.5mm; }
          .ci.pre { white-space: pre-wrap; }
          .num { display:inline-block; width: 1.2em; margin-right: 3px; }
          .txt { display:inline; word-break: break-word; }
          .important-badge { display: inline-block; background: #dc2626; color: white; padding: 1px 5px; font-weight: bold; margin-right: 6px; font-size: 10px; }
          .chk-table tbody tr td { font-size: 10px; }
        </style>
        <div style="text-align:center; margin-bottom: 6mm;">
          <div style="font-size:18px; font-weight:bold; text-decoration: underline;">[${resolvedBranchName ? resolvedBranchName + ' ' : ''}${projectName}]</div>
          <div style="font-size:18px; font-weight:bold; margin-top:3px; text-decoration: underline;">${getQuarterLabel(ins.inspection_date)} 특별 및 불시점검 결과</div>
        </div>
        <table class="chk-table" style="width:100%; border-collapse:collapse;">
          <thead>
            <tr>
              <th rowspan="2" style="border:0.5px solid #000; background:#f2f2f2; width:30%; height:10mm; font-size:11px;">
                <div class="ci col">
                  <span>점 검 항 목</span>
                  <span style="font-size:9px; font-weight:normal;">[3대 유형(부딪힘, 물체에맞음, 추락)]</span>
                </div>
              </th>
              <th colspan="2" style="border:0.5px solid #000; background:#f2f2f2; width:10%; height:6mm; font-size:11px;">
                <div class="ci">이행여부</div>
              </th>
              <th rowspan="2" style="border:0.5px solid #000; background:#f2f2f2; width:60%; height:10mm; font-size:11px;">
                <div class="ci">점검 결과</div>
              </th>
            </tr>
            <tr>
              <th style="border:0.5px solid #000; background:#f2f2f2; width:5%; height:4mm; font-size:10px;"><div class="ci tight">여</div></th>
              <th style="border:0.5px solid #000; background:#f2f2f2; width:5%; height:4mm; font-size:10px;"><div class="ci tight">부</div></th>
            </tr>
          </thead>
          <tbody>
            <tr><td colspan="4" style="border:0.5px solid #000; background:#ffedd5; font-weight:bold; height:10mm; font-size:10px;"><div class="ci left"><span class="important-badge">중요</span><span>(부딪힘, 물체에맞음) 굴착기 등 사용 작업</span></div></td></tr>
            ${(ins.critical_items || []).map((it: any, idx: number) => `
              <tr>
                <td style="border:0.5px solid #000; height:${(190 / (2 + (ins.critical_items?.length || 0) + (ins.caution_items?.length || 0) + 7)).toFixed(2)}mm;"><div class="ci left"><span class="num">${(['➊', '➋', '➌', '➍', '➎', '➏', '➐', '➑', '➒', '➓'][idx] || (idx + 1))}</span><span class="txt">${it.title || ''}</span></div></td>
                <td style="border:0.5px solid #000; height:${(190 / (2 + (ins.critical_items?.length || 0) + (ins.caution_items?.length || 0) + 7)).toFixed(2)}mm;"><div class="ci">${yesNo(it.status, 'yes')}</div></td>
                <td style="border:0.5px solid #000; height:${(190 / (2 + (ins.critical_items?.length || 0) + (ins.caution_items?.length || 0) + 7)).toFixed(2)}mm;"><div class="ci">${yesNo(it.status, 'no')}</div></td>
                <td style="border:0.5px solid #000; height:${(190 / (2 + (ins.critical_items?.length || 0) + (ins.caution_items?.length || 0) + 7)).toFixed(2)}mm;"><div class="ci left pre">${it.remarks || ''}</div></td>
              </tr>
            `).join('')}
            <tr><td colspan="4" style="border:0.5px solid #000; background:#ffedd5; font-weight:bold; height:10mm; font-size:10px;"><div class="ci left"><span class="important-badge">중요</span><span>(추락) 가설구조물, 고소작업 등</span></div></td></tr>
            ${(ins.caution_items || []).map((it: any, idx: number) => `
              <tr>
                <td style="border:0.5px solid #000; height:${(190 / (2 + (ins.critical_items?.length || 0) + (ins.caution_items?.length || 0) + 7)).toFixed(2)}mm;"><div class="ci left"><span class="num">${(['➊', '➋', '➌', '➍', '➎', '➏', '➐', '➑', '➒', '➓'][idx] || (idx + 1))}</span><span class="txt">${it.title || ''}</span></div></td>
                <td style="border:0.5px solid #000; height:${(190 / (2 + (ins.critical_items?.length || 0) + (ins.caution_items?.length || 0) + 7)).toFixed(2)}mm;"><div class="ci">${yesNo(it.status, 'yes')}</div></td>
                <td style="border:0.5px solid #000; height:${(190 / (2 + (ins.critical_items?.length || 0) + (ins.caution_items?.length || 0) + 7)).toFixed(2)}mm;"><div class="ci">${yesNo(it.status, 'no')}</div></td>
                <td style="border:0.5px solid #000; height:${(190 / (2 + (ins.critical_items?.length || 0) + (ins.caution_items?.length || 0) + 7)).toFixed(2)}mm;"><div class="ci left pre">${it.remarks || ''}</div></td>
              </tr>
            `).join('')}
            ${(() => {
          const defaultTitles = ['법적이행사항 확인', 'VAR 매뉴얼 작동성 확인', '취약근로자 안전관리 확인', '재해예방기술지도 지적사항 이행 확인', '안전보건표지 설치', 'TBM 실시 확인', '기타 현장 안전관리에 관한 사항 (산업안전보건 기준에 관한 규칙 등)']
          const rawOthers = ins.other_items || []
          const existingMap = new Map(rawOthers.map((it: any) => [it.title, it]))
          const others = defaultTitles.map((title: string) => {
            if (existingMap.has(title)) return existingMap.get(title)
            return { title, status: '', remarks: '' }
          })
          return others.map((it: any, idx: number) => `
                <tr>
                  <td style="border:0.5px solid #000; height:${(190 / (2 + (ins.critical_items?.length || 0) + (ins.caution_items?.length || 0) + 7)).toFixed(2)}mm;"><div class="ci left">${it.title || `기타항목 ${idx + 1}`}</div></td>
                  <td style="border:0.5px solid #000; height:${(190 / (2 + (ins.critical_items?.length || 0) + (ins.caution_items?.length || 0) + 7)).toFixed(2)}mm;"><div class="ci">${yesNo(it.status, 'yes')}</div></td>
                  <td style="border:0.5px solid #000; height:${(190 / (2 + (ins.critical_items?.length || 0) + (ins.caution_items?.length || 0) + 7)).toFixed(2)}mm;"><div class="ci">${yesNo(it.status, 'no')}</div></td>
                  <td style="border:0.5px solid #000; height:${(190 / (2 + (ins.critical_items?.length || 0) + (ins.caution_items?.length || 0) + 7)).toFixed(2)}mm;"><div class="ci left pre">${it.remarks || ''}</div></td>
                </tr>
              `).join('')
        })()}
          </tbody>
        </table>
        <div style="font-size:9px; color:#555; margin-top:8px;">※ 점검표는 항목 변경 될 수 있음(변경 시 분기 시작 전 알림 예정)</div>
        <div style="text-align: right; margin-top: 30px;">
          <div style="font-size: 13px; margin-bottom: 15px;">
            ${ins.inspection_date ? (() => {
          const d = new Date(ins.inspection_date);
          return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
        })() : new Date().getFullYear() + '. &nbsp;&nbsp;. &nbsp;&nbsp;.'}
          </div>
          <div style="display: flex; justify-content: flex-end; align-items: center; gap: 15px; font-size: 13px;">
            <span>점검자</span>
            <div style="display: inline-flex; align-items: center; gap: 10px;">
              <span>${ins.inspector_name || ''}</span>
              ${ins.signature ? `<img src="${ins.signature}" style="max-width: 80px; max-height: 40px; vertical-align: middle;" />` : '<span style="display: inline-block; width: 30px; height: 30px; border: 1px solid #333; border-radius: 50%; vertical-align: middle;"></span>'}
            </div>
          </div>
        </div>
      `

      page1.style.position = 'absolute'
      page1.style.left = '-9999px'
      document.body.appendChild(page1)
      await new Promise(r => setTimeout(r, 300))
      ensureNotCancelled(signal)
      const canvas1 = await html2canvas(page1, {
        scale: 1.9,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff'
      })
      ensureNotCancelled(signal)
      document.body.removeChild(page1)
      const imgW = 210
      const imgH1 = (canvas1.height * imgW) / canvas1.width
      if (!first) pdf.addPage()
      pdf.addImage(canvas1.toDataURL('image/jpeg', 1.0), 'JPEG', 0, 0, imgW, imgH1, undefined, 'FAST')
      first = false

      // ---------- Page 2 ----------
      const page2 = document.createElement('div')
      page2.style.width = '210mm'
      page2.style.minHeight = '297mm'
      page2.style.padding = '12mm 15mm'
      page2.style.background = '#ffffff'
      page2.style.fontFamily = 'Arial, sans-serif'
      page2.style.fontSize = '11px'
      page2.innerHTML = `
        <style>
          table { border-collapse: collapse; width:100%; }
          td, th { border:0.5px solid #000; padding:0; vertical-align: middle; }
          /* 셀 내부 flex 중앙 정렬 wrapper (3페이지와 동일) */
          .ci { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; box-sizing: border-box; padding: 1.5mm 2mm; line-height: 1.3; }
          .ci.left { justify-content: flex-start; text-align: left; }
          .ci.right { justify-content: flex-end; text-align: right; }
          .ci.pre { white-space: pre-wrap; }
          .photo { height:85mm; display:flex; align-items:center; justify-content:center; padding:0; box-sizing:border-box; }
          .photo img { max-width:100%; max-height:100%; object-fit:contain; }
          .photo-small { height:55mm; display:flex; align-items:center; justify-content:center; padding:3mm; box-sizing:border-box; }
          .photo-small img { width:100%; height:100%; object-fit:fill; }
        </style>
        <div style="text-align:center; margin-bottom: 6mm;">
          <div style="font-size:20px; font-weight:bold;">건설현장 점검사진</div>
        </div>
        <table>
          <tr style="height:10mm;">
            <td style="width:12%; font-weight:bold;"><div class="ci">지구명</div></td>
            <td colspan="3"><div class="ci left">${projectName}</div></td>
          </tr>
          <tr style="height:10mm;">
            <td style="width:12%; font-weight:bold;"><div class="ci">일 시</div></td>
            <td style="width:38%;"><div class="ci left">${ins.inspection_date ? new Date(ins.inspection_date).toLocaleDateString('ko-KR') : ''}</div></td>
            <td style="width:12%; font-weight:bold;"><div class="ci">점 검 자</div></td>
            <td style="width:38%;"><div class="ci left">${ins.inspector_name || ''}</div></td>
          </tr>
          <tr>
            <td colspan="4" style="padding:0;">
              <div class="photo">
                ${ins.site_photo_overview ? `<img src="${ins.site_photo_overview}" />` : '<span style="color:#666;">현재 작업 중인 주요 공종의 전경이 보이도록 촬영</span>'}
              </div>
            </td>
          </tr>
          <tr style="height:10mm;">
            <td style="font-weight:bold;"><div class="ci">지적사항</div></td>
            <td style="font-weight:bold;"><div class="ci left">(조치 전) ${ins.issue_content1 || ''}</div></td>
            <td colspan="2" style="font-weight:bold;"><div class="ci left">(조치 후)</div></td>
          </tr>
          <tr>
            <td colspan="2" style="padding:0; width:50%;">
              <div class="photo-small">${ins.site_photo_issue1 ? `<img src="${ins.site_photo_issue1}" />` : ''}</div>
            </td>
            <td colspan="2" style="padding:0; width:50%;">
              <div class="photo-small">${ins.action_photo_issue1 === '해당 사항 없음' ? '<div style="display:flex; align-items:center; justify-content:center; height:100%; font-size:16px; font-weight:bold; color:#666;">해당 사항 없음</div>' : (ins.action_photo_issue1 ? `<img src="${ins.action_photo_issue1}" />` : '')}</div>
            </td>
          </tr>
          <tr style="height:10mm;">
            <td style="font-weight:bold;"><div class="ci">지적사항</div></td>
            <td style="font-weight:bold;"><div class="ci left">(조치 전) ${ins.issue_content2 || ''}</div></td>
            <td colspan="2" style="font-weight:bold;"><div class="ci left">(조치 후)</div></td>
          </tr>
          <tr>
            <td colspan="2" style="padding:0; width:50%;">
              <div class="photo-small">${ins.site_photo_issue2 ? `<img src="${ins.site_photo_issue2}" />` : ''}</div>
            </td>
            <td colspan="2" style="padding:0; width:50%;">
              <div class="photo-small">${ins.action_photo_issue2 === '해당 사항 없음' ? '<div style="display:flex; align-items:center; justify-content:center; height:100%; font-size:16px; font-weight:bold; color:#666;">해당 사항 없음</div>' : (ins.action_photo_issue2 ? `<img src="${ins.action_photo_issue2}" />` : '')}</div>
            </td>
          </tr>
        </table>
      `

      page2.style.position = 'absolute'
      page2.style.left = '-9999px'
      document.body.appendChild(page2)
      await new Promise(r => setTimeout(r, 300))
      ensureNotCancelled(signal)
      const canvas2 = await html2canvas(page2, {
        scale: 1.9,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff'
      })
      ensureNotCancelled(signal)
      document.body.removeChild(page2)

      const imgW2 = 210
      const imgH2 = (canvas2.height * imgW2) / canvas2.width
      pdf.addPage()
      pdf.addImage(canvas2.toDataURL('image/jpeg', 1.0), 'JPEG', 0, 0, imgW2, imgH2, undefined, 'FAST')

      // ---------- Page 3: 5대 핵심 안전수칙 점검표 ----------
      ensureNotCancelled(signal)
      const branchNameForFiveKey = branchName || (ins as any).managing_branch || (ins as any).branch || ''
      const hqNameForFiveKey = hqName || (ins as any).managing_hq || ''
      await appendFiveKeyPage(pdf, html2canvas, ins, projectName, branchNameForFiveKey, hqNameForFiveKey, signal)
    }
  }

  const saveName = filename || '본부불시점검_보고서_통합.pdf'
  // 첫 페이지가 빈 페이지로 남지 않도록: jsPDF는 첫 addPage 호출 전 페이지 존재
  // 위에서 first 플래그로 제어했으므로 그대로 저장
  pdf.save(saveName)
}


