export interface HeadquartersInspectionReportParams {
  projectName: string
  inspections: any[]
  branchName?: string
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

export async function generateHeadquartersInspectionReport(params: HeadquartersInspectionReportParams): Promise<void> {
  const { projectName, inspections, branchName: branchNameParam } = params

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
        .cell { display: flex; align-items: center; height: 100%; min-height: 36px; padding: 3px 10px 8px; }
        .cell.center { justify-content: center; }
        .pre { white-space: pre-wrap; }
        .num { display:inline-block; width: 1.2em; margin-right: 4px; }
        .txt { display:inline; word-break: break-word; }
        .important-badge { display: inline-block; background: #dc2626; color: white; padding: 2px 6px; font-weight: bold; margin-right: 4px; font-size: 11px; vertical-align: middle; }
        /* 본문 행 기본 높이: 50px 고정 + 좌측 패딩 보정 */
        .chk-table tbody tr td { height: 50px; }
        .chk-table tbody tr .cell { min-height: 0; padding: 3px 10px; }
        /* 행 높이 고정: 1,2,8행(전체) → 30px
           tbody 기준으로 8행(전체)은 6번째(tr): 섹션1 헤더(1) + 항목5개(2~6)
        */
        .chk-table thead tr:nth-child(1) th,
        .chk-table thead tr:nth-child(2) th,
        .chk-table tbody tr:nth-child(6) td { height: 30px; }
        .chk-table thead tr:nth-child(1) .cell,
        .chk-table thead tr:nth-child(2) .cell,
        .chk-table tbody tr:nth-child(6) .cell { min-height: 0; padding: 6px 10px; }
      </style>
      <div style="text-align:center; margin-bottom: 8mm;">
        <div style="font-size:18px; font-weight:bold; text-decoration: underline;">[${branchName ? branchName + ' ' : ''}${projectName}]</div>
        <div style="font-size:18px; font-weight:bold; margin-top:3px; text-decoration: underline;">${getQuarterLabel(ins.inspection_date)} 특별 및 불시점검 결과</div>
      </div>
      <table class="chk-table" style="width:100%; border-collapse:collapse;">
        <thead>
          <tr>
            <th rowspan="2" style="border:0.5px solid #000; background:#f2f2f2; width:30%;">
              <div class="cell center" style="flex-direction:column; line-height:1.2; min-height:33px; padding:6px 10px;">
                점 검 항 목<br/>
                <span style="font-size:10px; font-weight:normal;">[3대 유형(부딪힘, 물체에맞음, 추락)]</span>
              </div>
            </th>
            <th colspan="2" style="border:0.5px solid #000; background:#f2f2f2; width:10%;">
              <div class="cell center" style="min-height:33px; padding:6px 10px;">이행여부</div>
            </th>
            <th rowspan="2" style="border:0.5px solid #000; background:#f2f2f2; width:60%;">
              <div class="cell center" style="min-height:33px; padding:6px 10px;">점검 결과</div>
            </th>
          </tr>
          <tr>
            <th style="border:0.5px solid #000; background:#f2f2f2; width:5%;"><div class="cell center">여</div></th>
            <th style="border:0.5px solid #000; background:#f2f2f2; width:5%;"><div class="cell center">부</div></th>
          </tr>
        </thead>
        <tbody>
          <tr><td colspan="4" style="border:0.5px solid #000; background:#ffedd5; font-weight:bold; height:8mm; padding:6px 10px; vertical-align:middle; line-height:1.4;"><span class="important-badge" style="display:inline-block; vertical-align:middle;">중요</span><span style="display:inline-block; vertical-align:middle;"> (부딪힘, 물체에맞음) 굴착기 등 사용 작업</span></td></tr>
          ${(ins.critical_items||[]).map((it:any,idx:number)=>`
            <tr>
              <td style="border:0.5px solid #000; height:${(230/(2 + (ins.critical_items?.length||0) + (ins.caution_items?.length||0) + (ins.other_items?.length||0))).toFixed(2)}mm;"><div class="cell"><span class="num">${(['➊','➋','➌','➍','➎','➏','➐','➑','➒','➓'][idx] || (idx+1))}</span><span class="txt">${it.title||''}</span></div></td>
              <td style="border:0.5px solid #000; height:${(230/(2 + (ins.critical_items?.length||0) + (ins.caution_items?.length||0) + (ins.other_items?.length||0))).toFixed(2)}mm;"><div class="cell center">${yesNo(it.status,'yes')}</div></td>
              <td style="border:0.5px solid #000; height:${(230/(2 + (ins.critical_items?.length||0) + (ins.caution_items?.length||0) + (ins.other_items?.length||0))).toFixed(2)}mm;"><div class="cell center">${yesNo(it.status,'no')}</div></td>
              <td style="border:0.5px solid #000; height:${(230/(2 + (ins.critical_items?.length||0) + (ins.caution_items?.length||0) + (ins.other_items?.length||0))).toFixed(2)}mm;"><div class="cell pre">${it.remarks||''}</div></td>
            </tr>
          `).join('')}
          <tr><td colspan="4" style="border:0.5px solid #000; background:#ffedd5; font-weight:bold; height:8mm; padding:6px 10px; vertical-align:middle; line-height:1.4;"><span class="important-badge" style="display:inline-block; vertical-align:middle;">중요</span><span style="display:inline-block; vertical-align:middle;"> (추락) 가설구조물, 고소작업 등</span></td></tr>
          ${(ins.caution_items||[]).map((it:any,idx:number)=>`
            <tr>
              <td style="border:0.5px solid #000; height:${(230/(2 + (ins.critical_items?.length||0) + (ins.caution_items?.length||0) + (ins.other_items?.length||0))).toFixed(2)}mm;"><div class="cell"><span class="num">${(['➊','➋','➌','➍','➎','➏','➐','➑','➒','➓'][idx] || (idx+1))}</span><span class="txt">${it.title||''}</span></div></td>
              <td style="border:0.5px solid #000; height:${(230/(2 + (ins.critical_items?.length||0) + (ins.caution_items?.length||0) + (ins.other_items?.length||0))).toFixed(2)}mm;"><div class="cell center">${yesNo(it.status,'yes')}</div></td>
              <td style="border:0.5px solid #000; height:${(230/(2 + (ins.critical_items?.length||0) + (ins.caution_items?.length||0) + (ins.other_items?.length||0))).toFixed(2)}mm;"><div class="cell center">${yesNo(it.status,'no')}</div></td>
              <td style="border:0.5px solid #000; height:${(230/(2 + (ins.critical_items?.length||0) + (ins.caution_items?.length||0) + (ins.other_items?.length||0))).toFixed(2)}mm;"><div class="cell pre">${it.remarks||''}</div></td>
            </tr>
          `).join('')}
          ${(() => {
            const others = ins.other_items||[]
            const titles = ['재해예방기술지도 지적사항 이행 확인','VAR 매뉴얼 작동성 확인','취약근로자 안전관리 확인','법적이행사항 확인']
            return others.map((it:any,idx:number)=>`
              <tr>
                <td style="border:0.5px solid #000;"><div class="cell">${titles[idx]||it.title||`기타항목 ${idx+1}`} </div></td>
                <td style="border:0.5px solid #000;"><div class="cell center">${yesNo(it.status,'yes')}</div></td>
                <td style="border:0.5px solid #000;"><div class="cell center">${yesNo(it.status,'no')}</div></td>
                <td style="border:0.5px solid #000;"><div class="cell pre">${it.remarks||''}</div></td>
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
    await new Promise(r=>setTimeout(r,300))
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
        .cell { display:flex; align-items:center; height:100%; min-height:24px; padding:6px 8px 14px; }
        .center { justify-content:center; }
        /* 전경사진: 이전 방식(셀 채우지 않음, contain) */
        .photo { height:85mm; display:flex; align-items:center; justify-content:center; padding:0; box-sizing:border-box; }
        .photo img { max-width:100%; max-height:100%; object-fit:contain; }
        /* 조치 전/후: 셀 가득 채우기(상하 포함) + 안쪽 여백 */
        .photo-small { height:55mm; display:flex; align-items:center; justify-content:center; padding:3mm; box-sizing:border-box; }
        /* 고정 비율 해제: 컨테이너를 왜곡 없이가 아니라, 여백 없이 꽉 채우기 */
        .photo-small img { width:100%; height:100%; object-fit:fill; }
      </style>
      <div style="text-align:center; margin-bottom: 6mm;">
        <div style="font-size:20px; font-weight:bold;">건설현장 점검사진</div>
      </div>
      <table>
        <tr>
          <td style="width:12%; text-align:center; font-weight:bold;"><div class="cell center">지구명</div></td>
          <td colspan="3"><div class="cell">${projectName}</div></td>
        </tr>
        <tr>
          <td style="width:12%; text-align:center; font-weight:bold;"><div class="cell center">일 시</div></td>
          <td style="width:38%;"><div class="cell">${ins.inspection_date ? new Date(ins.inspection_date).toLocaleDateString('ko-KR') : ''}</div></td>
          <td style="width:12%; text-align:center; font-weight:bold;"><div class="cell center">점 검 자</div></td>
          <td style="width:38%;"><div class="cell">${ins.inspector_name || ''}</div></td>
        </tr>
        <tr>
          <td colspan="4" style="padding:0;">
            <div class="photo">
              ${ins.site_photo_overview ? `<img src="${ins.site_photo_overview}" />` : '<span style="color:#666;">현재 작업 중인 주요 공종의 전경이 보이도록 촬영</span>'}
            </div>
          </td>
        </tr>
        <tr>
          <td style="font-weight:bold;"><div class="cell center">지적사항</div></td>
          <td style="font-weight:bold;"><div class="cell">(조치 전) ${ins.issue_content1 || ''}</div></td>
          <td colspan="2" style="font-weight:bold;"><div class="cell">(조치 후)</div></td>
        </tr>
        <tr>
          <td colspan="2" style="padding:0; width:50%;">
            <div class="photo-small">${ins.site_photo_issue1 ? `<img src="${ins.site_photo_issue1}" />` : ''}</div>
          </td>
          <td colspan="2" style="padding:0; width:50%;">
            <div class="photo-small">${ins.action_photo_issue1 === '해당 사항 없음' ? '<div style="display:flex; align-items:center; justify-content:center; height:100%; font-size:16px; font-weight:bold; color:#666;">해당 사항 없음</div>' : (ins.action_photo_issue1 ? `<img src="${ins.action_photo_issue1}" />` : '')}</div>
          </td>
        </tr>
        <tr>
          <td style="font-weight:bold;"><div class="cell center">지적사항</div></td>
          <td style="font-weight:bold;"><div class="cell">(조치 전) ${ins.issue_content2 || ''}</div></td>
          <td colspan="2" style="font-weight:bold;"><div class="cell">(조치 후)</div></td>
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
    await new Promise(r=>setTimeout(r,300))
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
  }

  pdf.save(`${projectName}_본부불시점검_보고서.pdf`)
}

export interface HeadquartersInspectionReportGroup {
  projectName: string
  inspections: any[]
  branchName?: string
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
    const { projectName, inspections, branchName } = group
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
          .cell { display: flex; align-items: center; height: 100%; min-height: 36px; padding: 3px 10px 8px; }
          .cell.center { justify-content: center; }
          .pre { white-space: pre-wrap; }
          .num { display:inline-block; width: 1.2em; margin-right: 4px; }
          .txt { display:inline; word-break: break-word; }
          .important-badge { display: inline-block; background: #dc2626; color: white; padding: 2px 6px; font-weight: bold; margin-right: 4px; font-size: 11px; vertical-align: middle; }
          .chk-table tbody tr td { height: 50px; }
          .chk-table tbody tr .cell { min-height: 0; padding: 3px 10px; }
          .chk-table thead tr:nth-child(1) th,
          .chk-table thead tr:nth-child(2) th,
          .chk-table tbody tr:nth-child(6) td { height: 30px; }
          .chk-table thead tr:nth-child(1) .cell,
          .chk-table thead tr:nth-child(2) .cell,
          .chk-table tbody tr:nth-child(6) .cell { min-height: 0; padding: 6px 10px; }
        </style>
        <div style="text-align:center; margin-bottom: 8mm;">
          <div style="font-size:18px; font-weight:bold; text-decoration: underline;">[${resolvedBranchName ? resolvedBranchName + ' ' : ''}${projectName}]</div>
          <div style="font-size:18px; font-weight:bold; margin-top:3px; text-decoration: underline;">${getQuarterLabel(ins.inspection_date)} 특별 및 불시점검 결과</div>
        </div>
        <table class="chk-table" style="width:100%; border-collapse:collapse;">
          <thead>
            <tr>
              <th rowspan="2" style="border:0.5px solid #000; background:#f2f2f2; width:30%;">
                <div class="cell center" style="flex-direction:column; line-height:1.2; min-height:33px; padding:6px 10px;">
                  점 검 항 목<br/>
                  <span style="font-size:10px; font-weight:normal;">[3대 유형(부딪힘, 물체에맞음, 추락)]</span>
                </div>
              </th>
              <th colspan="2" style="border:0.5px solid #000; background:#f2f2f2; width:10%;">
                <div class="cell center" style="min-height:33px; padding:6px 10px;">이행여부</div>
              </th>
              <th rowspan="2" style="border:0.5px solid #000; background:#f2f2f2; width:60%;">
                <div class="cell center" style="min-height:33px; padding:6px 10px;">점검 결과</div>
              </th>
            </tr>
            <tr>
              <th style="border:0.5px solid #000; background:#f2f2f2; width:5%;"><div class="cell center">여</div></th>
              <th style="border:0.5px solid #000; background:#f2f2f2; width:5%;"><div class="cell center">부</div></th>
            </tr>
          </thead>
          <tbody>
            <tr><td colspan="4" style="border:0.5px solid #000; background:#ffedd5; font-weight:bold; height:8mm; padding:6px 10px; vertical-align:middle; line-height:1.4;"><span class="important-badge" style="display:inline-block; vertical-align:middle;">중요</span><span style="display:inline-block; vertical-align:middle;"> (부딪힘, 물체에맞음) 굴착기 등 사용 작업</span></td></tr>
            ${(ins.critical_items||[]).map((it:any,idx:number)=>`
              <tr>
                <td style="border:0.5px solid #000; height:${(230/(2 + (ins.critical_items?.length||0) + (ins.caution_items?.length||0) + (ins.other_items?.length||0))).toFixed(2)}mm;"><div class="cell"><span class="num">${(['➊','➋','➌','➍','➎','➏','➐','➑','➒','➓'][idx] || (idx+1))}</span><span class="txt">${it.title||''}</span></div></td>
                <td style="border:0.5px solid #000; height:${(230/(2 + (ins.critical_items?.length||0) + (ins.caution_items?.length||0) + (ins.other_items?.length||0))).toFixed(2)}mm;"><div class="cell center">${yesNo(it.status,'yes')}</div></td>
                <td style="border:0.5px solid #000; height:${(230/(2 + (ins.critical_items?.length||0) + (ins.caution_items?.length||0) + (ins.other_items?.length||0))).toFixed(2)}mm;"><div class="cell center">${yesNo(it.status,'no')}</div></td>
                <td style="border:0.5px solid #000; height:${(230/(2 + (ins.critical_items?.length||0) + (ins.caution_items?.length||0) + (ins.other_items?.length||0))).toFixed(2)}mm;"><div class="cell pre">${it.remarks||''}</div></td>
              </tr>
            `).join('')}
            <tr><td colspan="4" style="border:0.5px solid #000; background:#ffedd5; font-weight:bold; height:8mm; padding:6px 10px; vertical-align:middle; line-height:1.4;"><span class="important-badge" style="display:inline-block; vertical-align:middle;">중요</span><span style="display:inline-block; vertical-align:middle;"> (추락) 가설구조물, 고소작업 등</span></td></tr>
            ${(ins.caution_items||[]).map((it:any,idx:number)=>`
              <tr>
                <td style="border:0.5px solid #000; height:${(230/(2 + (ins.critical_items?.length||0) + (ins.caution_items?.length||0) + (ins.other_items?.length||0))).toFixed(2)}mm;"><div class="cell"><span class="num">${(['➊','➋','➌','➍','➎','➏','➐','➑','➒','➓'][idx] || (idx+1))}</span><span class="txt">${it.title||''}</span></div></td>
                <td style="border:0.5px solid #000; height:${(230/(2 + (ins.critical_items?.length||0) + (ins.caution_items?.length||0) + (ins.other_items?.length||0))).toFixed(2)}mm;"><div class="cell center">${yesNo(it.status,'yes')}</div></td>
                <td style="border:0.5px solid #000; height:${(230/(2 + (ins.critical_items?.length||0) + (ins.caution_items?.length||0) + (ins.other_items?.length||0))).toFixed(2)}mm;"><div class="cell center">${yesNo(it.status,'no')}</div></td>
                <td style="border:0.5px solid #000; height:${(230/(2 + (ins.critical_items?.length||0) + (ins.caution_items?.length||0) + (ins.other_items?.length||0))).toFixed(2)}mm;"><div class="cell pre">${it.remarks||''}</div></td>
              </tr>
            `).join('')}
            ${(() => {
              const others = ins.other_items||[]
              const titles = ['재해예방기술지도 지적사항 이행 확인','VAR 매뉴얼 작동성 확인','취약근로자 안전관리 확인','법적이행사항 확인']
              return others.map((it:any,idx:number)=>`
                <tr>
                  <td style="border:0.5px solid #000;"><div class="cell">${titles[idx]||it.title||`기타항목 ${idx+1}`} </div></td>
                  <td style="border:0.5px solid #000;"><div class="cell center">${yesNo(it.status,'yes')}</div></td>
                  <td style="border:0.5px solid #000;"><div class="cell center">${yesNo(it.status,'no')}</div></td>
                  <td style="border:0.5px solid #000;"><div class="cell pre">${it.remarks||''}</div></td>
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
      await new Promise(r=>setTimeout(r,300))
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
          .cell { display:flex; align-items:center; height:100%; min-height:24px; padding:6px 8px 14px; }
          .center { justify-content:center; }
          .photo { height:85mm; display:flex; align-items:center; justify-content:center; padding:0; box-sizing:border-box; }
          .photo img { max-width:100%; max-height:100%; object-fit:contain; }
          .photo-small { height:55mm; display:flex; align-items:center; justify-content:center; padding:3mm; box-sizing:border-box; }
          .photo-small img { width:100%; height:100%; object-fit:fill; }
        </style>
        <div style="text-align:center; margin-bottom: 6mm;">
          <div style="font-size:20px; font-weight:bold;">건설현장 점검사진</div>
        </div>
        <table>
          <tr>
            <td style="width:12%; text-align:center; font-weight:bold;"><div class="cell center">지구명</div></td>
            <td colspan="3"><div class="cell">${projectName}</div></td>
          </tr>
          <tr>
            <td style="width:12%; text-align:center; font-weight:bold;"><div class="cell center">일 시</div></td>
            <td style="width:38%;"><div class="cell">${ins.inspection_date ? new Date(ins.inspection_date).toLocaleDateString('ko-KR') : ''}</div></td>
            <td style="width:12%; text-align:center; font-weight:bold;"><div class="cell center">점 검 자</div></td>
            <td style="width:38%;"><div class="cell">${ins.inspector_name || ''}</div></td>
          </tr>
          <tr>
            <td colspan="4" style="padding:0;">
              <div class="photo">
                ${ins.site_photo_overview ? `<img src="${ins.site_photo_overview}" />` : '<span style="color:#666;">현재 작업 중인 주요 공종의 전경이 보이도록 촬영</span>'}
              </div>
            </td>
          </tr>
          <tr>
            <td style="font-weight:bold;"><div class="cell center">지적사항</div></td>
            <td style="font-weight:bold;"><div class="cell">(조치 전) ${ins.issue_content1 || ''}</div></td>
            <td colspan="2" style="font-weight:bold;"><div class="cell">(조치 후)</div></td>
          </tr>
          <tr>
            <td colspan="2" style="padding:0; width:50%;">
              <div class="photo-small">${ins.site_photo_issue1 ? `<img src="${ins.site_photo_issue1}" />` : ''}</div>
            </td>
            <td colspan="2" style="padding:0; width:50%;">
              <div class="photo-small">${ins.action_photo_issue1 === '해당 사항 없음' ? '<div style="display:flex; align-items:center; justify-content:center; height:100%; font-size:16px; font-weight:bold; color:#666;">해당 사항 없음</div>' : (ins.action_photo_issue1 ? `<img src="${ins.action_photo_issue1}" />` : '')}</div>
            </td>
          </tr>
          <tr>
            <td style="font-weight:bold;"><div class="cell center">지적사항</div></td>
            <td style="font-weight:bold;"><div class="cell">(조치 전) ${ins.issue_content2 || ''}</div></td>
            <td colspan="2" style="font-weight:bold;"><div class="cell">(조치 후)</div></td>
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
      await new Promise(r=>setTimeout(r,300))
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
    }
  }

  const saveName = filename || '본부불시점검_보고서_통합.pdf'
  // 첫 페이지가 빈 페이지로 남지 않도록: jsPDF는 첫 addPage 호출 전 페이지 존재
  // 위에서 first 플래그로 제어했으므로 그대로 저장
  pdf.save(saveName)
}


