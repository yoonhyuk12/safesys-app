<!-- 문제 해결: 의존성 미설치·빌드 캐시·프로필 미동기화·권한·지도·html2canvas PDF 텍스트 버그 -->
# 문제 해결

- **`'cross-env' is not recognized` / `'next' is not recognized`**: `npm run dev` 첫 줄에서 바로 실패하면 `safesys-app/node_modules`가 없는 것이다. `cd safesys-app && npm install` 실행 (2026-09-02 확인). 스크립트 이름 문제가 아니므로 package.json을 고치지 않는다.
  - 설치 후 `npm warn install-scripts`로 `sharp`·`supabase`·`core-js`·`unrs-resolver`의 install 스크립트가 보류될 수 있다. dev 서버 구동에는 지장이 없고, 이미지 최적화나 Supabase CLI에서 오류가 나면 `npm install-scripts approve <패키지>`로 승인한다.
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

## 카카오맵을 조건부 렌더링으로 교체하면 화면이 사라질 때 (React DOM 재사용)

`{!frozen ? <지도 div> : <배경 div>}`처럼 카카오맵 컨테이너와 다른 `div`를 같은 자리에서 조건부 렌더링하면, React가 **카카오 SDK가 인라인 스타일·자식 DOM을 심어둔 노드를 그대로 재사용**한다. 카카오가 심은 인라인 `position: relative`가 Tailwind `absolute inset-0` 클래스를 이겨 **높이가 0으로 붕괴**하고, 배경 이미지가 있어도 아무것도 안 보인다 (2026-07-11 작업계획서 지도 고정에서 Playwright DOM 덤프로 확정 — rect 높이 0, 카카오 잔여 자식 6개).

- **해결**: 두 분기에 서로 다른 `key`를 부여해 노드 재사용을 차단한다 (`key="kakao-map"` / `key="frozen-background"`).
- **함께 적용**: 지도 초기화 effect의 cleanup에서 `mapElementRef.current?.replaceChildren()`로 카카오 잔여 DOM을 비운다 — dev StrictMode의 이중 effect로 지도가 겹겹이 생성되는 것도 막는다.

## 카카오맵 DOM 캡처가 흰 이미지로 나올 때 (벡터 SVG 지도)

카카오맵 JS SDK는 래스터 `<img>` 타일 외에 **거대한 벡터 `<svg>` 레이어**와 `<canvas>`를 함께 쓰며, html2canvas는 이런 지도를 그리지 못해 **에러 없이 흰 캔버스**를 반환할 수 있다.

- **해결**: 지도 DOM을 복제해 캔버스 픽셀을 이미지로 옮기고, 원격 이미지(`img`, SVG `image`)를 `/api/map-tile` 프록시로 받아 data URL로 인라인한 뒤 foreignObject SVG로 직렬화해 캔버스에 그린다. SVG-이미지 렌더링은 외부 네트워크 요청이 차단되므로 인라인이 필수다. 구현은 `MapDrawingEditor.tsx`의 `captureMapViaSvg()` 참고 (2026-07-11 위성 배경 실캡처 검증 완료).
- **검증**: 캡처 "성공" 후에도 픽셀 샘플링으로 빈 이미지인지 검사해야 한다 (`isMostlyBlankCanvas()`). 빈 이미지면 실패로 처리하고 다음 방식(html2canvas 직접 → 프록시)으로 폴백하며, 전부 실패하면 고정하지 않고 지도를 유지한 채 에러를 안내한다.
- **프록시 허용 목록**: 위성 타일은 `mts.daumcdn.net`에서 온다 — `/api/map-tile`의 호스트 접두사 정규식에 `mts\d*`가 포함되어야 한다 (누락 시 전부 400).
- Safari는 foreignObject가 포함된 SVG를 캔버스에 그리면 캔버스가 오염되어 `toDataURL`이 실패한다 — 이 경우도 폴백 체인이 흡수한다.
