<!-- 문제 해결: 빌드 캐시·프로필 미동기화·권한·지도·html2canvas PDF 텍스트 버그 -->
# 문제 해결

- **빌드 캐시 문제**: `npm run build:no-cache` 사용
- **프로필 미동기화**: `refreshProfile()` 호출
- **중복 요청**: Dashboard.tsx의 ref 기반 캐시 확인
- **권한 오류**: RLS 정책 및 `hq_division`/`branch_division` 값 확인
- **지도 문제**: layout.tsx의 API 키 포함 여부, projects 테이블의 latitude/longitude 확인

## PDF 표 텍스트가 셀 하단에 붙어 보일 때 (html2canvas + Tailwind)

html2canvas(1.4.1)는 텍스트를 그리기 전 1×1 `<img>`를 문서 body에 붙여 `img.offsetTop`으로 폰트 baseline을 측정하는데, 이 img의 `display`를 지정하지 않는다. Tailwind 4 preflight의 `img{display:block}`이 적용되면 img가 다음 줄로 떨어져 baseline이 과대 측정되고, **모든 텍스트가 셀 하단으로 쏠려 그려진다** (2026-07-02 확정).

- 텍스트 페인팅 단계의 버그라서 셀 레이아웃(table/flex/grid)이나 vertical-align을 아무리 바꿔도 해결되지 않는다. 이미지는 baseline을 쓰지 않아 영향 없음.
- **해결**: `src/lib/reports/html2canvas-text-fix.ts`의 `applyHtml2canvasTextFix()`를 캡처 전에 호출하고 반환된 cleanup을 finally에서 호출. (manager-inspection-report.ts, headquarters-inspection.ts에 적용됨 — 새 PDF 생성기를 만들거나 같은 증상이 제보되면 이 유틸을 export 함수에 감싼다.)
- **주의**: 기존 코드의 `padding: 0 8px 8px 8px` 같은 비대칭 상하 패딩은 이 버그를 수동 보정하던 흔적이다. 유틸 적용 후에는 과보정되어 텍스트가 위로 붙으므로 대칭 패딩으로 되돌려야 한다 (일상점검표 2개 파일은 2026-07-02에 `padding: 0 8px`로 정리 완료).
