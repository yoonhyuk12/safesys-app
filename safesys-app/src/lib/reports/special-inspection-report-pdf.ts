export interface SpecialInspectionPdfParams {
  inspection: any
}

const parseDate = (dStr: string) => {
  if (!dStr) return ''
  try {
    const d = new Date(dStr)
    return `${d.getFullYear()}. ${String(d.getMonth() + 1).padStart(2, '0')}. ${String(d.getDate()).padStart(2, '0')}`
  } catch { return dStr }
}

const parseDateShort = (dStr: string) => {
  if (!dStr) return ''
  try {
    const d = new Date(dStr)
    return `${String(d.getFullYear()).slice(2)}.${String(d.getMonth() + 1).padStart(2, '0')}`
  } catch { return dStr }
}

const commonStyles = `
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { border: 1px solid #000; font-size: 11px; padding: 4px 6px; word-break: break-all; }
    th { background-color: #f2f2f2; text-align: center; font-weight: bold; }
  </style>
`

const createPageDiv = () => {
  const div = document.createElement('div')
  div.style.width = '210mm'
  div.style.minHeight = '297mm'
  div.style.padding = '15mm 20mm'
  div.style.background = '#ffffff'
  div.style.fontFamily = '"Malgun Gothic", "맑은 고딕", Arial, sans-serif'
  div.style.color = '#000000'
  div.style.fontSize = '12px'
  return div
}

const CATEGORIES = [
  { key: '가. 사전조사 및 작업 전 점검', label: '사전조사 및<br/>작업 전 점검', rows: 3 },
  { key: '나. 가설통로의 구조', label: '가설통로의<br/>구조', rows: 3 },
  { key: '다. 사다리식 통로의 구조', label: '사다리식<br/>통로의 구조', rows: 3 },
  { key: '라. 기타점검사항', label: '기타 점검 사항', rows: 2 },
]

export async function generateSpecialInspectionPdf(params: SpecialInspectionPdfParams): Promise<void> {
  const { inspection } = params
  const jsPDF = (await import('jspdf')).jsPDF
  const html2canvas = (await import('html2canvas')).default
  const pdf = new jsPDF('p', 'mm', 'a4')
  const imgW = 210

  const items: any[] = inspection.additional_items || []
  const findings = items.filter((item: any) => item.action && item.action !== '해당없음')

  // Group by category
  const grouped: Record<string, any[]> = {}
  for (const item of items) {
    if (!grouped[item.category]) grouped[item.category] = []
    grouped[item.category].push(item)
  }

  // Team
  let teamStr = inspection.inspection_team || ''
  if (inspection.signatures?.length > 0) {
    const fromSig = inspection.signatures
      .filter((s: any) => s.role === '점검자')
      .map((s: any) => `${s.position} ${s.name}`.trim())
      .filter((s: string) => s).join(', ')
    if (fromSig) teamStr = fromSig
  }

  const supervisorName = inspection.supervisor_name || ''
  let supervisorTitle = ''
  let supervisorPureName = supervisorName
  const parts = supervisorName.trim().split(/\s+/)
  if (parts.length >= 2) {
    supervisorTitle = parts[0]
    supervisorPureName = parts.slice(1).join(' ')
  }

  const districtName = inspection.district_name || ''

  // Hidden container
  const hiddenContainer = document.createElement('div')
  hiddenContainer.style.cssText = 'position:fixed;left:0;top:0;width:210mm;overflow:hidden;opacity:0;pointer-events:none;z-index:-9999'
  document.body.appendChild(hiddenContainer)

  const renderPage = async (el: HTMLDivElement, addNewPage: boolean) => {
    hiddenContainer.appendChild(el)
    await new Promise(r => setTimeout(r, 300))
    const canvas = await html2canvas(el, { scale: 2, useCORS: true, allowTaint: true, backgroundColor: '#ffffff' })
    hiddenContainer.removeChild(el)
    const imgH = (canvas.height * imgW) / canvas.width
    if (addNewPage) pdf.addPage()
    pdf.addImage(canvas.toDataURL('image/jpeg', 1.0), 'JPEG', 0, 0, imgW, imgH, undefined, 'FAST')
  }

  // Build findings table rows
  let findingsRows = ''
  for (const cat of CATEGORIES) {
    const catItems = (grouped[cat.key] || []).filter((it: any) => it.action && it.action !== '해당없음' && !it.custom)
    const customItem = (grouped[cat.key] || []).find((it: any) => it.custom && it.action && it.action !== '해당없음')
    const allFindings = [...catItems]
    if (customItem) allFindings.push(customItem)

    for (let i = 0; i < cat.rows; i++) {
      const f = allFindings[i]
      const findingText = f ? (f.item || '') : ''
      const actionText = f ? (f.action || '') : ''
      if (i === 0) {
        findingsRows += `
          <tr>
            <th rowspan="${cat.rows}" style="width: 18%; font-size: 11px; padding: 5px 4px; vertical-align: middle;">${cat.label}</th>
            <td style="width: 41%; padding: 5px 8px; text-align: left; height: 28px;">${findingText ? '- ' + findingText : ''}</td>
            <td style="width: 41%; padding: 5px 8px; text-align: left; height: 28px;">${actionText ? '- ' + actionText : ''}</td>
          </tr>`
      } else {
        findingsRows += `
          <tr>
            <td style="padding: 5px 8px; text-align: left; height: 28px;">${findingText ? '- ' + findingText : ''}</td>
            <td style="padding: 5px 8px; text-align: left; height: 28px;">${actionText ? '- ' + actionText : ''}</td>
          </tr>`
      }
    }
  }

  // ============ Page 1: 점검카드 ============
  const page1 = createPageDiv()
  page1.innerHTML = `
    ${commonStyles}

    <div style="text-align: center; font-size: 11px; color: #555; margin-bottom: 4px;">붙임 3</div>
    <div style="text-align: center; font-size: 13px; font-weight: bold; margin-bottom: 16px;">지사 및 사업단 특별점검 결과</div>

    <div style="text-align: center; font-size: 20px; font-weight: bold; margin-bottom: 20px; text-decoration: underline; text-underline-offset: 6px;">
      건설현장 점검카드(${districtName})
    </div>

    <div style="font-size: 14px; font-weight: bold; margin-bottom: 8px;">1. 점검개요</div>
    <div style="margin-left: 10px; margin-bottom: 5px; font-size: 12px;">○ 점검일시 : ${parseDate(inspection.inspection_date)}</div>
    <div style="margin-left: 10px; margin-bottom: 5px; font-size: 12px;">○ 점 검 반 : ${teamStr}</div>
    <div style="margin-left: 10px; margin-bottom: 6px; font-size: 12px;">○ 점검지구 현황</div>

    <table style="margin-bottom: 16px;">
      <tr>
        <th rowspan="2" style="width: 12%;">지구명</th>
        <th colspan="2" style="width: 16%;">위 치</th>
        <th rowspan="2" style="width: 10%;">총사업비<br/>(백만원)</th>
        <th colspan="2" style="width: 20%;">공사추진실적</th>
        <th rowspan="2" style="width: 12%;">점검공종</th>
        <th rowspan="2" style="width: 12%;">비고<br/>(시공사)</th>
      </tr>
      <tr>
        <th style="width: 8%;">도</th>
        <th style="width: 8%;">시군</th>
        <th style="width: 10%;">착공</th>
        <th style="width: 10%;">준공(예정)</th>
      </tr>
      <tr>
        <td style="text-align: center; height: 30px;">${districtName}</td>
        <td style="text-align: center;">${inspection.location_province || ''}</td>
        <td style="text-align: center;">${inspection.location_city || ''}</td>
        <td style="text-align: center;">${inspection.total_budget ? Number(inspection.total_budget).toLocaleString() : ''}</td>
        <td style="text-align: center; font-size: 10px;">${parseDateShort(inspection.construction_start)}</td>
        <td style="text-align: center; font-size: 10px;">${parseDateShort(inspection.construction_end_planned)}</td>
        <td style="text-align: center; font-size: 10px;">${inspection.major_work_type || ''}</td>
        <td style="text-align: center;">${inspection.contractor || ''}</td>
      </tr>
    </table>

    <div style="font-size: 14px; font-weight: bold; margin-bottom: 6px;">2. 점검결과</div>
    <table style="margin-bottom: 16px;">
      <tr>
        <th style="width: 18%;">항 목</th>
        <th style="width: 41%;">지적사항</th>
        <th style="width: 41%;">조치(예정) 사항</th>
      </tr>
      ${findingsRows}
    </table>
  `

  await renderPage(page1, false)

  // ============ Page 2+: 사진대지 (지적사항별) ============
  for (let i = 0; i < findings.length; i++) {
    const f = findings[i]
    const findingText = f.item || ''
    const actionText = f.action || ''

    const pageN = createPageDiv()
    pageN.innerHTML = `
      ${commonStyles}

      <div style="text-align: center; font-size: 18px; font-weight: bold; margin-bottom: 18px; text-decoration: underline; text-underline-offset: 6px;">
        &lt;지적사항 및 조치사항 사진대지&gt;
      </div>

      <table style="margin-bottom: 0;">
        <tr>
          <th style="width: 12%; padding: 6px;">지구명</th>
          <td style="width: 38%; text-align: center; padding: 6px;">${districtName}</td>
          <th style="width: 14%; padding: 6px;">공사감독원</th>
          <td style="width: 36%; text-align: center; padding: 6px;">${supervisorTitle ? supervisorTitle + ' ' : ''}${supervisorPureName}</td>
        </tr>
        <tr>
          <th style="padding: 6px;">일 &nbsp; 시</th>
          <td style="text-align: center; padding: 6px;">${parseDate(inspection.inspection_date)}</td>
          <th style="padding: 6px;">설 &nbsp; 명</th>
          <td style="padding: 6px;">(조치 전) ${findingText}</td>
        </tr>
      </table>
      <table>
        <tr>
          <td style="height: 320px; text-align: center; vertical-align: middle; padding: 8px;">
            ${f.photo_url ? '<img src="' + f.photo_url + '" style="max-width: 95%; max-height: 300px; object-fit: contain; display: block; margin: 0 auto;" />' : '<span style="color: #aaa; font-size: 13px;">사진 없음</span>'}
          </td>
        </tr>
      </table>

      <div style="height: 10px;"></div>

      <table style="margin-bottom: 0;">
        <tr>
          <th style="width: 12%; padding: 6px;">지구명</th>
          <td style="width: 38%; text-align: center; padding: 6px;">${districtName}</td>
          <th style="width: 14%; padding: 6px;">공사감독원</th>
          <td style="width: 36%; text-align: center; padding: 6px;">${supervisorTitle ? supervisorTitle + ' ' : ''}${supervisorPureName}</td>
        </tr>
        <tr>
          <th style="padding: 6px;">일 &nbsp; 시</th>
          <td style="text-align: center; padding: 6px;">${parseDate(inspection.inspection_date)}</td>
          <th style="padding: 6px;">설 &nbsp; 명</th>
          <td style="padding: 6px;">(조치 후) ${actionText}</td>
        </tr>
      </table>
      <table>
        <tr>
          <td style="height: 320px; text-align: center; vertical-align: middle; padding: 8px;">
            ${f.after_photo_url && f.after_photo_url !== 'N/A' ? '<img src="' + f.after_photo_url + '" style="max-width: 95%; max-height: 300px; object-fit: contain; display: block; margin: 0 auto;" />' : '<span style="color: #aaa; font-size: 13px;">사진 없음</span>'}
          </td>
        </tr>
      </table>
    `

    await renderPage(pageN, true)
  }

  document.body.removeChild(hiddenContainer)

  const dateStr = (inspection.inspection_date || '').replace(/-/g, '')
  pdf.save(`특별점검_${dateStr}.pdf`)
}
