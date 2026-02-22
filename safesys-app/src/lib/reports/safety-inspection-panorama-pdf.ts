import type { SafetyInspectionPhotoForHwpx } from '@/lib/projects'

export async function downloadPanoramaPdf(
  photoEntries: SafetyInspectionPhotoForHwpx[],
  filename: string
): Promise<void> {
  const html2canvas = (await import('html2canvas')).default
  const jsPDF = (await import('jspdf')).jsPDF

  const pdf = new jsPDF('p', 'mm', 'a4')
  const imgW = 210

  const commonStyles = `
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      th, td { border: 1px solid #000; font-size: 11px; padding: 4px 6px; word-break: break-all; }
      th { background-color: #f2f2f2; text-align: center; font-weight: bold; }
    </style>
  `

  const hiddenContainer = document.createElement('div')
  hiddenContainer.style.position = 'fixed'
  hiddenContainer.style.left = '0'
  hiddenContainer.style.top = '0'
  hiddenContainer.style.width = '210mm'
  hiddenContainer.style.overflow = 'hidden'
  hiddenContainer.style.opacity = '0'
  hiddenContainer.style.pointerEvents = 'none'
  hiddenContainer.style.zIndex = '-9999'
  document.body.appendChild(hiddenContainer)

  const renderPage = async (el: HTMLDivElement, addNewPage: boolean) => {
    hiddenContainer.appendChild(el)
    await new Promise(r => setTimeout(r, 400))
    const canvas = await html2canvas(el, { scale: 2, useCORS: true, allowTaint: true, backgroundColor: '#ffffff' })
    hiddenContainer.removeChild(el)
    const imgH = (canvas.height * imgW) / canvas.width
    if (addNewPage) pdf.addPage()
    pdf.addImage(canvas.toDataURL('image/jpeg', 1.0), 'JPEG', 0, 0, imgW, imgH, undefined, 'FAST')
  }

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

  const parseDate = (dStr: string) => {
    if (!dStr) return ''
    try {
      const d = new Date(dStr)
      return `${d.getFullYear()}. ${String(d.getMonth() + 1).padStart(2, '0')}. ${String(d.getDate()).padStart(2, '0')}`
    } catch {
      return dStr
    }
  }

  const formatSupervisor = (name: string | null) => {
    if (!name) return ''
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) {
      return `${parts[0]} ${parts.slice(1).join(' ')}`
    }
    return name
  }

  const photoBlock = (entry: SafetyInspectionPhotoForHwpx | null) => {
    if (!entry) {
      return `
        <table style="margin-bottom: 0;">
          <tr>
            <th style="width: 12%; padding: 6px 6px 15px;">지구명</th>
            <td style="width: 38%; text-align: center; padding: 6px 6px 15px;"></td>
            <th style="width: 14%; padding: 6px 6px 15px;">공사감독원</th>
            <td style="width: 36%; text-align: center; padding: 6px 6px 15px;"></td>
          </tr>
          <tr>
            <th style="padding: 6px 6px 15px;">일 &nbsp; 시</th>
            <td style="text-align: center; padding: 6px 6px 15px;"></td>
            <th style="padding: 6px 6px 15px;">설 &nbsp; 명</th>
            <td style="text-align: center; padding: 6px 6px 15px;"></td>
          </tr>
        </table>
        <table>
          <tr>
            <td style="height: 350px; text-align: center; vertical-align: middle; padding: 10px;">
              <span style="color: #aaa; font-size: 13px;">(공란)</span>
            </td>
          </tr>
        </table>
      `
    }

    return `
      <table style="margin-bottom: 0;">
        <tr>
          <th style="width: 12%; padding: 6px 6px 15px;">지구명</th>
          <td style="width: 38%; text-align: center; padding: 6px 6px 15px;">${entry.district_name || ''}</td>
          <th style="width: 14%; padding: 6px 6px 15px;">공사감독원</th>
          <td style="width: 36%; text-align: center; padding: 6px 6px 15px;">${formatSupervisor(entry.supervisor_name)}</td>
        </tr>
        <tr>
          <th style="padding: 6px 6px 15px;">일 &nbsp; 시</th>
          <td style="text-align: center; padding: 6px 6px 15px;">${parseDate(entry.inspection_date)}</td>
          <th style="padding: 6px 6px 15px;">설 &nbsp; 명</th>
          <td style="text-align: center; padding: 6px 6px 15px;">전경사진</td>
        </tr>
      </table>
      <table>
        <tr>
          <td style="height: 350px; text-align: center; vertical-align: middle; padding: 10px;">
            ${entry.photo_url ? '<img src="' + entry.photo_url + '" style="max-width: 95%; max-height: 330px; object-fit: contain; display: block; margin: 0 auto;" />' : '<span style="color: #aaa; font-size: 13px;">사진 없음</span>'}
          </td>
        </tr>
      </table>
    `
  }

  // Iterate 2 photos per page
  for (let i = 0; i < photoEntries.length; i += 2) {
    const page = createPageDiv()
    const p1 = photoEntries[i]
    const p2 = i + 1 < photoEntries.length ? photoEntries[i + 1] : null

    page.innerHTML = `
      ${commonStyles}
      <div style="text-align: center; font-size: 20px; font-weight: bold; margin-bottom: 20px; text-decoration: underline; text-underline-offset: 6px;">
        건설현장 전경사진
      </div>

      ${photoBlock(p1)}

      <div style="height: 15px;"></div>

      ${photoBlock(p2)}
    `

    await renderPage(page, i > 0)
  }

  document.body.removeChild(hiddenContainer)

  // Output filename: convert .hwpx to .pdf
  const finalFilename = filename.replace(/\.hwpx$/i, '.pdf')
  pdf.save(finalFilename)
}
