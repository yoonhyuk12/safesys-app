// 품질검사 실시대장 일련번호(제출건)별 첨부 사진을 '사진대지' 양식(참고: 품질검사 사진대지)으로 출력하는 PDF 생성기

import { QualityTestRecord } from '@/lib/quality/quality-test-types'
import { applyHtml2canvasTextFix } from '@/lib/reports/html2canvas-text-fix'

// HTML 문자열 삽입 전 특수문자 이스케이프 (XSS 방지)
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// 컨테이너 내 모든 이미지 로드 완료 대기 (로드 실패한 이미지는 그대로 진행)
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

// 'YYYY-MM-DD' → 'YYYY년 M월 D일'
function formatDateKorean(dateStr: string | null): string {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return ''
  const [y, m, d] = dateStr.split('-').map(Number)
  return `${y}년 ${m}월 ${d}일`
}

function generatePhotoEntryHTML(record: QualityTestRecord, projectName: string): string {
  const labelCell =
    'border: 0.5px solid rgb(17, 24, 39); padding: 8px; text-align: center; vertical-align: middle; font-weight: bold; background-color: rgb(243, 244, 246); line-height: 1.4;'
  const valueCell =
    'border: 0.5px solid rgb(17, 24, 39); padding: 8px 12px; text-align: center; vertical-align: middle; line-height: 1.4;'

  return `
    <div style="margin-bottom: 22px;">
      <table style="width: 100%; border-collapse: collapse; border: 1.5px solid rgb(17, 24, 39); font-size: 13px; table-layout: fixed;">
        <colgroup>
          <col style="width: 16%;" /><col style="width: 34%;" /><col style="width: 16%;" /><col style="width: 34%;" />
        </colgroup>
        <tbody>
          <tr>
            <td style="${labelCell}">공 사 명</td>
            <td style="${valueCell}">${escapeHtml(projectName)}</td>
            <td style="${labelCell}">일련번호</td>
            <td style="${valueCell}">${record.serial_no ?? ''}</td>
          </tr>
          <tr>
            <td style="${labelCell}">타설(시공)일자</td>
            <td style="${valueCell}"></td>
            <td style="${labelCell}">시험일자</td>
            <td style="${valueCell}">${escapeHtml(formatDateKorean(record.test_date))}</td>
          </tr>
        </tbody>
      </table>
      <div style="border: 1.5px solid rgb(17, 24, 39); border-top: none;">
        <div style="height: 300px; display: flex; align-items: center; justify-content: center; background-color: rgb(249, 250, 251);">
          <img src="${escapeHtml(record.photo_url)}" style="max-width: 100%; max-height: 100%;" />
        </div>
        <div style="border-top: 0.5px solid rgb(17, 24, 39); background-color: rgb(243, 244, 246); padding: 6px 12px; font-size: 12px; font-weight: bold;">
          ${escapeHtml(record.target_material || '')}
        </div>
      </div>
    </div>`
}

function generatePhotoPageHTML(group: QualityTestRecord[], projectName: string): string {
  return `
    <div style="text-align: center; padding: 10px 0 14px; background-color: rgb(243, 244, 246); border-bottom: 2px solid rgb(17, 24, 39); margin-bottom: 20px;">
      <h1 style="font-size: 26px; font-weight: bold; letter-spacing: 6px; padding-left: 6px; margin: 0;">사진대지</h1>
    </div>
    ${group.map((r) => generatePhotoEntryHTML(r, projectName)).join('')}`
}

export async function downloadQualityTestPhotoReport(
  records: QualityTestRecord[],
  projectName: string
): Promise<void> {
  // 사진은 일련번호(제출건)당 1건 — 같은 제출건의 여러 항목 행에 동일한 photo_url이 중복 저장되므로 일련번호당 1건만 남긴다.
  const seenSerialNo = new Set<number>()
  const entries = records.filter((r) => {
    if (!r.photo_url) return false
    if (r.serial_no != null) {
      if (seenSerialNo.has(r.serial_no)) return false
      seenSerialNo.add(r.serial_no)
    }
    return true
  })
  if (entries.length === 0) throw new Error('첨부된 사진이 없습니다.')

  const restoreTextFix = applyHtml2canvasTextFix()
  try {
    const html2canvas = (await import('html2canvas')).default
    const jsPDF = (await import('jspdf')).jsPDF
    const pdf = new jsPDF('p', 'mm', 'a4')

    const groups: QualityTestRecord[][] = []
    for (let i = 0; i < entries.length; i += 2) groups.push(entries.slice(i, i + 2))

    const pageWidth = 210
    const pageHeight = 297
    const margin = 15
    const maxImgHeight = pageHeight - margin * 2

    for (let g = 0; g < groups.length; g++) {
      const container = document.createElement('div')
      container.style.cssText =
        'position: absolute; top: -9999px; left: -9999px; width: 210mm; background-color: white; padding: 24px 28px; font-family: "Malgun Gothic", sans-serif; color: rgb(17, 24, 39);'
      container.innerHTML = generatePhotoPageHTML(groups[g], projectName)
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
        let imgW = pageWidth - margin * 2
        let imgH = (canvas.height * imgW) / canvas.width
        if (imgH > maxImgHeight) {
          imgW = (imgW * maxImgHeight) / imgH
          imgH = maxImgHeight
        }
        if (g > 0) pdf.addPage()
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', margin + (pageWidth - margin * 2 - imgW) / 2, margin, imgW, imgH)
      } finally {
        document.body.removeChild(container)
      }
    }

    pdf.save(`품질검사_사진대지_${new Date().toISOString().split('T')[0]}.pdf`)
  } finally {
    restoreTextFix()
  }
}
