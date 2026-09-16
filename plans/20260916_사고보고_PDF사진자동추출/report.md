<!-- 사고보고 PDF 사진 자동 추출 구현과 검증 인계 보고서 -->
# PDF 사진 자동 추출 작업 보고

`requestAccidentPrefill`은 기존 AI fields 정규화와 별도로 로컬 `photos`를 반환한다. PDF.js 5.6.205로 앞 8쪽의 embedded raster를 순서대로 최대 2장 JPEG로 추출하며 4MB 입력, 12MP/그림, 30,000개/쪽 연산, 15초 처리 제한을 둔다. 작은 그림과 마스크·쪽 전체 스캔은 제외한다. 출력은 기존 긴 변 1200px·JPEG data URL 길이 제한을 사용한다.

모달은 사진이 비어 있고 업로드 시작 때와 목록 참조가 같을 때만 사진을 채운다. 기존 사진·사용자가 추가/설명수정/삭제한 목록·진행 중인 수동 첨부를 우선하고, 본문 덮어쓰기 선택으로 사진을 덮어쓰지 않는다. 초안만 반영하며 처리 중 저장을 잠그고, 기존 사진대지에서 확인·삭제 후 교체한다. PDF 사진 오류가 발생해도 성공한 본문을 유지한다. HWPX 자동 사진 추출과 출력 코드 변경은 없다.

검증 명령과 결과.

- `npm run test:accident-pdf-photos` — 32개 통과. JPEG/PNG 실제 파싱, 사진 없음, 3장 중 앞 2장, 스캔/작은 패턴 제외, 암호·손상 PDF, timeout과 destroy, 본문 성공/사진 실패, 기존/최신 사진 보존을 포함한다.
- `npm run test:accident-import` — 기존 API/AI 정규화 회귀를 포함한 76개 통과.
- `node --test tests/project-accident-report-ui.test.mjs` — 18개 통과.
- `node --test tests/project-accident-report.test.mjs` — 24개 통과. 이 파일은 SSR loader의 PDF helper 경계만 추가하고 다른 작업자의 저장오류 회귀는 유지했다.
- `npx tsc --noEmit --incremental false` 및 변경 TS/TSX 5개 파일 `npx eslint` — 통과.

브라우저 재현은 사고보고 등록에서 부모의 `scratch/accident-photo-two.pdf` 또는 `three.pdf`를 올리고 AI 응답 이후 사진대지 2장을 확인한다. `none.pdf`·`scan.pdf`는 0장과 직접 첨부 안내, 기존 사진이 있는 상태에서 재업로드는 기존 목록 보존이 기대 결과다. worker 요청은 same-origin `/_next/static/media/` 아래 mjs 자산이어야 한다. 부모가 브라우저 실측과 실제 HWPX 출력 검증을 담당한다.

PDF.js 본체와 worker 모두 `new URL`의 same-origin 정적 자산이다. 본체는 `webpackIgnore` native import로 읽어 Next15 개발 번들의 PDF.js ESM 재해석 충돌을 피한다. 패키지를 exact pin했으므로 본체와 worker 버전도 함께 고정된다.

부모의 2026-09-16 17:50 KST 실제 Next 브라우저 재검증 결과, 합성 PDF 사진 없음·전체 쪽 스캔 제외·2컷 자동 채움·3컷 제한·기존 사진 보존·자동 저장 없음·사용자 저장·HWPX 2컷 반영이 통과했다. ESM asset 로딩도 정상 확인됐다. 원본 PDF와 실제 한글 COM 최종 확인은 부모가 별도로 진행한다.

한계는 사진 의미를 AI로 분류하지 않는 단순 크기/배치 후보 선별이다. 일반 사진도 너무 작거나 전체 쪽에 가깝게 배치되면 빠질 수 있고, 회전·클리핑된 사진은 원본 래스터 방향/영역으로 추출될 수 있으므로 사진대지에서 확인한다. 지원하지 않는 코덱은 수동 첨부 안내로 끝난다. build·commit·push·원격 DB·원본 PDF/양식 수정은 수행하지 않았다.

부모 최종 검증. 17:51 원본 파주 PDF의 앞 2장 추출·저장·HWPX 포함 및 추출 JPEG 육안 검증을 통과했다. 합성 사진 포함 HWPX는 한글2022 COM 등록·열기·재저장·재개방·PDF 변환 모두 true이며 2쪽 전체에서 사진 비율과 양식이 정상이다. 전체 사고 회귀 224개 중 223 PASS·기존 TODO 1, 타입·변경 파일 린트 통과.
