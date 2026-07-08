// 일일안전교육 서명부(작업장 출입 전 근로자 작업가능상태 점검) PDF 페이지용 HTML 생성
import type { TBMWorkerSignatureEntry } from '@/lib/excel/tbm-worker-signature-export'

function getDayOfWeek(dateStr: string): string {
  const days = ['일', '월', '화', '수', '목', '금', '토']
  const d = new Date(dateStr)
  return days[d.getDay()]
}

// 근로자 입력값(성명 등)은 익명 제출이므로 반드시 이스케이프해 삽입한다
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const CELL_STYLE = 'border: 1px solid #000; height: 34px; text-align: center; vertical-align: middle; padding: 2px 4px;'
const HEADER_STYLE = 'border: 1px solid #000; padding: 4px 2px; text-align: center; vertical-align: middle; font-weight: bold;'

/**
 * TBM일지 PDF에 붙일 일일안전교육 서명부 1페이지 HTML을 생성
 * (PDFGenerator.appendHTMLPage로 렌더링)
 */
export function createWorkerSignatureSheetHTML(
  entries: TBMWorkerSignatureEntry[],
  meetingDate: string   // 'YYYY-MM-DD'
): string {
  const dow = meetingDate ? getDayOfWeek(meetingDate) : ''
  const rowCount = Math.max(entries.length, 15)

  const bodyRows: string[] = []
  for (let i = 0; i < rowCount; i++) {
    const entry = entries[i]
    const cells = entry
      ? [
          String(i + 1),
          escapeHtml(entry.worker_name || ''),
          entry.tbm_confirmed ? '확인' : '',
          entry.no_alcohol ? 'X' : '',
          entry.blood_pressure_ok ? '150미만' : '',
          entry.ppe_worn ? '착용' : '',
          entry.cctv_consent ? '동의' : '',
          entry.body_ok ? '이상없음' : '',
          entry.signature && entry.signature.startsWith('data:image')
            ? `<img src="${entry.signature}" style="height: 28px; vertical-align: middle;" />`
            : '',
        ]
      : ['', '', '', '', '', '', '', '', '']

    bodyRows.push(`<tr>${cells.map(c => `<td style="${CELL_STYLE}">${c}</td>`).join('')}</tr>`)
  }

  return `
    <div style="font-family: 'Malgun Gothic', '맑은 고딕', Arial, sans-serif; padding: 76px 30px 15px 30px; width: 734px; margin: 0 auto; box-sizing: content-box;">
      <div style="text-align: center; margin-bottom: 4px;">
        <h1 style="margin: 0; font-size: 22px; font-weight: bold;">일일안전교육 서명부</h1>
      </div>
      <div style="text-align: center; font-size: 14px; font-weight: bold; border-bottom: 3px solid #000; padding-bottom: 8px; margin-bottom: 14px;">
        작업장 출입 전 근로자 작업가능상태 점검
      </div>

      <div style="font-size: 12px; font-weight: bold; margin-bottom: 6px;">일자: ${escapeHtml(meetingDate)}(${dow})</div>

      <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
        <colgroup>
          <col style="width: 5%;" />
          <col style="width: 13%;" />
          <col style="width: 11%;" />
          <col style="width: 9%;" />
          <col style="width: 10%;" />
          <col style="width: 10%;" />
          <col style="width: 10%;" />
          <col style="width: 10%;" />
          <col style="width: 22%;" />
        </colgroup>
        <thead>
          <tr style="background-color: #f0f0f0;">
            <th style="${HEADER_STYLE}">NO.</th>
            <th style="${HEADER_STYLE}">성 명</th>
            <th style="${HEADER_STYLE}">TBM<br/>위.평확인</th>
            <th style="${HEADER_STYLE}">음주여부</th>
            <th style="${HEADER_STYLE}">혈압여부</th>
            <th style="${HEADER_STYLE}">보호구<br/>착용여부</th>
            <th style="${HEADER_STYLE}">CCTV<br/>촬영동의</th>
            <th style="${HEADER_STYLE}">몸(부상)<br/>여 부</th>
            <th style="${HEADER_STYLE}">서 명</th>
          </tr>
        </thead>
        <tbody>
          ${bodyRows.join('\n          ')}
        </tbody>
      </table>

      <div style="margin-top: 8px; font-size: 10px; color: #333;">※ 작업가능 혈압 : 수축기 150미만, 단, 의사 소견서 첨부 시 작업 가능(심혈관질환자포함)</div>
      <div style="font-size: 10px; color: #333; margin-left: 14px;">CCTV 촬영 : 근로자 재해예방 목적의 안전관리 모니터링 CCTV 촬영(개인정보 보호법 제15조 1항)</div>
    </div>
  `
}
