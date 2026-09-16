# 컨텍스트 노트.

- 기존 공통 목록 컬럼은 통계와 mutation 응답에도 쓰이므로 변경하지 않는다.
- `getProjectAccidents`만 `expected_treatment_days:report_details->>expectedTreatmentDays`를 추가한다.
- `report_details` 미조회 상태는 undefined로 보존한다. scalar 값이 없을 때만 상세 값으로 폴백한다.
- 기존 React SSR 테스트 로더와 Supabase 대역을 재사용한다. 새 라이브러리와 별도 Worker는 사용하지 않는다.
- 공식 문서·실제 DB·브라우저 검증은 코디네이터 담당이라는 명시적 분업을 따른다. 빌드·커밋·푸시·SQL은 실행하지 않는다.
- 원본 미추적 `safesys-app/public/사고/`와 `사용방법.md`는 보존한다.

## 검증 결과와 동결 상태.

- RED에서 추가·변경한 표시/selector 테스트 3개가 예상대로 실패했다.
- `node --test tests/project-accident-report.test.mjs tests/project-accident-report-ui.test.mjs tests/accident-report-details.test.mjs` 결과 69/69 통과.
- `npx tsc --noEmit`와 변경 소스 3개 대상 `npx eslint` 모두 종료 코드 0.
- `git diff --check` 통과. 행 클릭·상세 버튼·수정삭제 stopPropagation·권한 코드는 변경하지 않았다.
- 화면 `handleSubmit`은 등록·수정 성공 후 `await loadAccidents()`를 실행한다. 저장 페이로드와 재조회 scalar의 14·0·미입력 보존은 대역 테스트로 확인했으며 실제 REST/브라우저 검증은 코디네이터가 진행한다.
- 코드 3개·기존 테스트 2개·계획 산출물 3개 변경 상태를 동결했다. 공통 집계 컬럼·mutation 응답·상세 lazy loading·SQL은 변경하지 않았다.

## 코디네이터 검증.

- 공식 Supabase select 문서의 JSON 필드·alias 구문을 확인하고 실제 REST에서 `id,expected_treatment_days:report_details->>expectedTreatmentDays`를 `limit=0`으로 읽어 HTTP 200을 확인했다. 데이터 쓰기는 없다.
- 관련 테스트를 독립 재실행하여 69/69 통과했다.
- 1092×922 독립 브라우저에서 Supabase 응답을 대역 처리해 `부상 1 / 14일`, `부상 1 / 0일`, `- / -`와 산재신청 바로 다음 요양일 배치를 확인했다. 목록 1회 조회에서 사진 JSON을 제외하며 행 클릭 후에만 상세 1회를 읽었다. 브라우저 오류는 없었다.
- 사용자 Orca 탭의 snapshot/eval은 runtime_unavailable로 실패하여 실제 로그인된 탭은 확인하지 못했다. 위 화면 확인은 별도 브라우저에서 수행했다.
- 화면 캡처는 무시된 `safesys-app/scratch/accident-list-treatment.png`에 보관했다. worker 완료를 확인하고 terminal release 및 delivery ack를 마쳤다.
