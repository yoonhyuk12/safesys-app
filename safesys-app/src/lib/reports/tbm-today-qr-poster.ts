// 상시 TBM QR 현장 부착용 A4 포스터 HTML 생성 (PDF 출력용)

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * 상시 TBM QR A4 포스터 1페이지 HTML을 생성
 * (generateHTMLPagePDF로 렌더링, qrDataUrl은 QR 캔버스의 PNG data URL)
 */
export function createTBMTodayQRPosterHTML(qrDataUrl: string, projectName: string): string {
  return `
    <div style="font-family: 'Malgun Gothic', '맑은 고딕', Arial, sans-serif; width: 734px; padding: 60px 30px; box-sizing: content-box; margin: 0 auto;">
      <div style="min-height: 1000px; display: flex; flex-direction: column; align-items: center; justify-content: center; border: 4px solid #1d4ed8; border-radius: 24px; padding: 40px 30px; box-sizing: border-box;">
        <div style="font-size: 16px; font-weight: bold; color: #1d4ed8; letter-spacing: 4px;">SafeSys 일일안전교육</div>
        <h1 style="margin: 12px 0 0; font-size: 44px; font-weight: bold; color: #111;">상시 TBM QR</h1>
        <div style="margin-top: 14px; font-size: 20px; font-weight: bold; color: #333; text-align: center; word-break: keep-all;">${escapeHtml(projectName)}</div>

        <img src="${qrDataUrl}" style="width: 440px; height: 440px; margin: 40px 0;" />

        <div style="font-size: 22px; font-weight: bold; color: #111; text-align: center; line-height: 1.6; word-break: keep-all;">
          휴대폰 카메라로 QR을 스캔하면<br/>오늘의 TBM(일일안전교육) 내용을 확인할 수 있습니다.
        </div>
        <div style="margin-top: 22px; font-size: 15px; color: #444; text-align: center; line-height: 1.7; word-break: keep-all;">
          교육 내용 확인 후 하단의 <b>"교육 확인 서명"</b>으로 작업가능상태 점검과 서명을 완료해주세요.<br/>
          당일 제출건이 없으면 "금일 TBM 제출건이 없습니다."가 표시됩니다.
        </div>
      </div>
    </div>
  `
}
