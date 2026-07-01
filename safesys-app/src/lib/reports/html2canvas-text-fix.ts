// Tailwind preflight의 img{display:block}가 html2canvas 텍스트 baseline 측정을 왜곡해 PDF 표 텍스트가 셀 하단으로 쏠리는 문제를 캡처 동안만 무력화하는 유틸

// html2canvas(1.4.1)는 텍스트를 그리기 전에 1x1 img를 실제 문서 body에 붙여
// img.offsetTop으로 폰트 baseline을 측정한다(FontMetrics.parseMetrics).
// 이때 img의 display를 지정하지 않아 Tailwind preflight의 img{display:block}이
// 적용되면 img가 텍스트 옆(baseline)이 아닌 다음 줄로 떨어져 baseline이
// 줄 높이만큼 과대 측정되고, 결과적으로 모든 텍스트가 셀 하단으로 쏠려 그려진다.
// (레이아웃을 table/flex/grid 무엇으로 바꿔도 동일하게 발생 — 텍스트 페인팅 단계 버그)
// 아래 data URI는 html2canvas 소스의 SMALL_IMAGE 상수로, 측정용 img에만 적용되는
// 선택자를 만들어 해당 img만 원래의 inline 배치로 되돌린다.
const H2C_SMALL_IMAGE =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

// html2canvas 캡처 전에 호출하고, 반환된 함수를 finally에서 호출해 원복한다.
export function applyHtml2canvasTextFix(): () => void {
  if (typeof document === 'undefined') return () => {}
  const style = document.createElement('style')
  style.textContent = `img[src="${H2C_SMALL_IMAGE}"] { display: inline !important; }`
  document.head.appendChild(style)
  return () => {
    style.parentNode?.removeChild(style)
  }
}
