# 사고보고 UI·데이터·SQL 구현 보고

작업일 2026-09-16. Orca dispatch ctx_21e5942c2f9e (UI/데이터/SQL 담당). 구현은 worker-opus 두 명에게 위임하고 diff·테스트로 직접 검증했다. 커밋·푸시·프로덕션 빌드·운영 DB 실행은 하지 않았다.

## SQL

- 파일 `database/20260916-1418_사고보고_보고서_항목.sql`.
- 선행 조건 `20260718-0506_add_project_accidents.sql` → `20260718-0830_project_accidents_external_site.sql` → `20260831-1730_project_accidents_workers_comp_claim.sql` → `20260916-1032_사고보고_현장작성_권한.sql` 다음에 Supabase SQL Editor에서 전체 실행한다. 재실행해도 같은 결과다.
- 내용은 `project_accidents.report_details JSONB`(NULL 허용·기본값 없음) 한 컬럼과 `public.accident_report_details_valid(jsonb)` 검증 함수, `project_accidents_report_details_check` CHECK 제약, COMMENT뿐이다. RLS 정책·트리거·기존 컬럼은 손대지 않았고 새 테이블·Storage 버킷도 없다.
- CHECK 규칙은 앱 상수와 같은 숫자다. 허용 키 19개 외 거부, 짧은 칸 6개 200자, 장문 10개 4,000자, 보고일 `YYYY-MM-DD`, 사고 시각 `HH:mm`, 신고처·피해자 조치 선택지, 사진 최대 2장·`data:image/jpeg;base64,/9j/` 접두 JPEG data URL·한 장 1,400,000자 이하·설명 200자.
- 2차 강화(부모 검증 후). 사진 객체는 `dataUrl`·`caption` 외 키가 있으면 거부하고, `notifications`는 4개·`victimActions`는 3개를 넘으면 거부한다. 중첩 객체나 중복 배열로 큰 JSON을 숨기는 길을 막는다. 스칼라·JSON `null`·배열·모르는 키·문자열 칸의 숫자/null 회귀 테스트를 추가했다.
- 기존 행은 전부 NULL로 남아 CHECK를 통과한다.

## 공통 계약

- `src/lib/accident-report.ts`가 `AccidentReportDetails`(계획서 16개 문자열 + `notifications` + `victimActions` + `photos[{dataUrl, caption}]`), 옵션 상수, 한도 상수, `createEmptyAccidentReportDetails`, `normalizeAccidentReportDetails`, `validateAccidentReportDetails`, `isAccidentReportDetailsEmpty`, `isValidAccidentReportPhotoDataUrl`, `listUnfilledAccidentReportFields`를 내보낸다. API·HWPX 워커가 같은 모듈을 쓴다.
- `accident-analysis-types.ts`에 `ProjectAccident.report_details?: AccidentReportDetails | null`, `AccidentFormInput.report_details?: AccidentReportDetails`를 추가했다. undefined는 "읽지 않음/건드리지 않음", null은 "작성분 없음"이다.

## 데이터 계층 동작 (`src/lib/accident-analysis.ts`)

- 목록·집계 조회 세 곳(대시보드 미등록 현장 조회, 프로젝트 배치 조회, 프로젝트 사고 목록)은 `PROJECT_ACCIDENT_LIST_COLUMNS` 명시 컬럼만 읽어 사진 JSON을 전사 집계에 싣지 않는다.
- `getProjectAccidentDetail(id)`가 상세·수정·HWPX 다운로드 직전에만 `report_details`까지 읽고 정규화해 돌려준다.
- 저장은 `report_details`가 undefined면 페이로드에 키 자체를 넣지 않아 기존 보고서를 보존하고, 빈 보고서면 NULL, 값이 있으면 정규화 객체를 넣는다. 검증은 `validateAccidentReportDetails`를 거친다.

## 화면 동작

- 사고 입력 모달(`AccidentEntryModal`)은 선택적 `reportMode` prop을 얻었다. 기본(대시보드)에서는 마크업·동작이 그대로이고 `report_details`를 넘기지 않는다. 사고보고 서류철 페이지만 `reportMode`를 켠다.
- 보고서 모드는 보고 개요·사고 시각과 피해·신고와 조치·특이사항과 연락처·사진대지 섹션을 폼 아래에 붙인다. 모든 항목이 선택이며 각 입력에 길이 상한을 건다. 사진은 브라우저에서 긴 변 1200px JPEG로 축소해 1MB 한도에 맞을 때까지 품질을 낮추고, 3번째 사진은 UI가 거절하며 DB CHECK도 거부한다.
- 문서 업로드는 `requestAccidentPrefill`(API 워커 소유)을 부른다. 응답은 초안일 뿐이며 응답 시점의 최신 초안에 병합한다. 이미 적힌 값과 다른 항목이 있으면 모달 안 확인 패널에서 "빈 칸만 채우기 / 문서 내용으로 덮어쓰기 / 취소"를 고른다. 응답의 빈 값·프로젝트·작성자·사진은 어떤 경우에도 건드리지 않는다. 늦게 도착한 이전 요청, 닫힌 모달의 응답, 실패 응답은 초안·사진을 바꾸지 않는다.
- 2차 수정(부모 검증 후). 사진 압축·체크박스·텍스트 갱신을 전부 최신 상태 기준 함수형 업데이트로 바꿔, 사진 압축 중 다른 칸 입력·사진 설명 수정·삭제가 유실되지 않는다. 모달이 닫히거나 다른 기록으로 바뀌면 사진 필드가 다시 마운트되어 늦은 압축 결과를 버리고, 압축 중에는 저장 버튼이 잠기고 제출이 막힌다. 병합 기준(baseline)은 신규 등록의 자동 기본값(오늘 날짜·경상·0명 등)에만 쓰고 수정 모달에서는 넘기지 않아, 저장돼 있던 값(0 포함)은 충돌로 잡혀 "빈 칸만 채우기"가 보존한다. 확인 패널이 떠 있는 동안 적은 값도 최신 초안으로 합쳐진다.
- 상세는 `getProjectAccidentDetail`로 보고서 항목을 읽어 채워진 항목·신고처·피해자 조치·사진을 보여주고, 비어 있는 항목은 "아직 작성하지 않은 보고 항목"으로 라벨만 나열한다(값을 지어내지 않는다). 읽기 실패 시 재시도 버튼을 준다. "한글 다운로드" 버튼이 `downloadAccidentReportHwpx`(HWPX 워커 소유)를 부른다.
- 수정은 보고서 항목을 읽은 뒤에만 열린다. 읽기에 실패하면 수정을 열지 않고 안내해, 비어 있는 채로 저장돼 기존 보고서가 지워지는 일을 막는다.
- 기존 권한 판정(소유자·공유자·관할 발주청 수정, 작성자·본부급 삭제)과 세션 가드는 그대로다.

## 파일

- 신규 `src/lib/accident-report.ts`, `src/lib/accident-report-photo.ts`, `src/components/dashboard/AccidentProjectSearchSelect.tsx`(모달 800줄 상한을 지키려 콤보박스를 순수 이동), `src/components/project/accident-report/{AccidentPrefillPanel,AccidentReportFormSections,AccidentReportPhotoField}.tsx`, `accident-report-form-styles.ts`, `prefill-merge.ts`, `photo-list-updates.ts`(사진 목록 갱신 순수 함수).
- 수정 `src/lib/accident-analysis-types.ts`, `src/lib/accident-analysis.ts`, `src/components/dashboard/AccidentEntryModal.tsx`, `src/components/project/accident-report/AccidentReportDetail.tsx`, `src/app/project/[id]/accident-report/page.tsx`, `tests/fixtures/project-accidents-db.mjs`, `package.json`(`test:accident-report`가 UI·데이터·SQL·추출·업로드·API 라우트·HWPX 테스트 9개 파일을 한 번에 돈다).
- 테스트 신규 `tests/accident-report-details.test.mjs`(정규화·검증·select 컬럼·페이로드 키 보존), `tests/project-accident-report-details-sql.test.mjs`(PGlite 실제 마이그레이션: 기존 행 NULL, 2장 저장, 3장·PNG·길이·형식·모르는 키 거부, 키 생략 시 보존, 작성자 불변·관할 밖 0행), `tests/project-accident-report-ui.test.mjs`(기본/보고서 모드 마크업, 사진 한도, 상세 안내·재시도, 병합 순수 함수).

## 검증

```
npm run test:accident-report   → 내 담당 5개 파일 60건 전부 통과(리뷰 반영 후). 9개 파일 전체는 HWPX 양식 작업 중인 형제 파일 1건만 실패, 기존 TODO 1(범위 밖)
npx tsc --noEmit               → 오류 없음
npm run lint                   → Error 0 (경고는 기존 파일 것)
```

부모(Coordinator)의 브라우저 검증 `scratch/accident-report-extended-smoke.cjs`가 2차 수정 뒤 통과했다 — 사진 3장 선택→2장 제한, 사진 처리 중 입력 보존, 문서 응답 대기 중 직책 입력 보존, 확인 대기 중 기타사항 입력 보존, 빈 칸 병합, API 실패 시 보존, 저장 2장, 상세·한글 다운로드, 기존 저장분 재업로드 시 저장값·사진 보존, 모바일 390px 넘침 없음.

## 독립 리뷰(worker-opus, 읽기 전용) 결과와 반영

- 심각도 높음 없음. 중간 3건은 모두 반영했다.
  - M1 상세 읽기가 목록 재조회에 추월당하면 로딩 표시가 안 풀리고 "불러오지 못해 수정을 열 수 없습니다"라는 잘못된 안내가 나오던 것 → `loadDetail`이 추월과 실패를 구분해 돌려주고, 로딩 표시는 마지막 상세 읽기가 끈다(`page.tsx`).
  - M2 저장 응답 `select('*')`가 대시보드 간단 저장에도 사진 JSON을 되돌려 주던 것 → 보고서를 보낸 호출에만 `report_details`를 되받고, 읽지 않은 컬럼은 undefined로 남긴다(`accident-analysis.ts`).
  - M3 문서 초안이 본 항목(장소 200·작업 500·개요/원인/대책 2,000자)의 화면 입력 상한을 우회하던 것 → 병합 시 같은 길이로 자른다(`prefill-merge.ts`).
- 낮음 6건 중 L1(한 번 읽은 뒤 재시도 실패가 조용함)·L4(`role="alertdialog"`가 실제 대화상자가 아님 → `role="group"`+`aria-live`)를 반영했다. L2(입력 클래스 상수 중복)·L3(모달 indigo 포커스·패널 blue 버튼과 정본 차이)·L5(첫 렌더 기본 프로젝트가 정렬 전 값)·L6(수정 전 상세 읽기 보증의 이벤트 테스트 부재)는 기존 동작 유지·범위 밖으로 남겼다.
- 회귀 테스트 3건 추가 — 저장 응답 컬럼(보고서 없음/있음), 본 항목 길이 상한.

## 남은 것·알려둘 것

- 리뷰 반영(M1·M2·M3·L1·L4) 뒤 `scratch/accident-report-extended-smoke.cjs`를 부모가 한 번 더 돌리는 것이 좋다. 순수 함수·데이터 계층 테스트는 통과했다.
- 이 보고 시점에 `tests/accident-report-hwpx.test.mjs`가 "사고발생보고 양식 파일을 불러오지 못했습니다"로 실패한다. HWPX 담당이 최종 양식 작업을 진행 중이라 그 파일과 함께 바뀌는 중이며 이 범위 밖이다. 내 담당 5개 테스트 파일은 실패 0이다.
- 한글 2020 실제 열기와 최종 양식 검증은 HWPX 담당·Coordinator 몫이다. dev 서버는 건드리지 않았다.
- `photoBusy`(사진 처리 중 저장 잠금)는 정적 마크업 테스트로 재현할 수 없어 코드와 브라우저 검증으로만 확인했다.
- 정규화는 사진 3장을 조용히 2장으로 자른다. UI가 3번째를 먼저 거절하고 DB가 3장을 거부하므로 우회는 없다.
- 원본 샘플(`safesys-app/public/사고/`)과 `사용방법.md`는 열지도 Git에 넣지도 않았다.
