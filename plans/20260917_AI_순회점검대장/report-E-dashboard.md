# Worker E 완료 보고.

공사감독 순회점검 카드와 안전현황 뷰를 구현했다. 빌드·커밋·푸시는 실행하지 않았다.

## 변경 파일.

- `safesys-app/src/components/Dashboard.tsx` — 카드 허용 목록 두 곳, 카드, 현황 뷰 연결.
- `safesys-app/src/app/safe/patrol-ledger/page.tsx` — 전체 현황 경로.
- `safesys-app/src/app/safe/branch/[branch]/patrol-ledger/page.tsx` — 지사 현황 경로.
- `safesys-app/src/components/dashboard/PatrolLedgerStatusView.tsx` — 테마 조회·금주 편집, 주 이동, 3단 표, 합계·로딩·오류 표시.
- `safesys-app/src/lib/patrol-ledger/status-aggregate.ts` — 주 범위, 활성 판정, 현장·본부·지사 집계 순수 함수.
- `safesys-app/tests/patrol-ledger-status.test.mjs` — 집계 회귀 테스트 5건.

## 기간·단계 결정.

- 서울 오늘이 속한 월~일을 기본으로 하고 이전·다음 주를 조회한다. 테마도 선택 주에 맞춰 읽되 수정은 금주에만 허용한다. 저장 중에는 주 이동을 막고, 뒤늦은 조회 응답은 폐기한다.
- 코디네이터 답변대로 `is_active`의 구형 `true`를 활성으로 인정한다. 객체는 주에 걸친 분기 중 하나라도 `true`이면 활성이다. 값 없음·null·false는 비활성이다. 연도별 활성 이력이 없으므로 선택 주의 달력 분기값을 적용한다.
- 본사는 본부별 표, 본부는 지사별 표, 지사는 프로젝트별 표에서 시작한다. 대표 지사는 `getProjectsByUserBranch`와 동일하게 `BRANCH_OPTIONS`의 첫 항목으로 판정한다. 현장이 하나여도 단계를 생략하지 않는다.
- `initialBranch`는 현장 표로 직접 진입한다. 상위로 돌아가기는 사용자 관할 단계까지만 제공한다. 본부·지사 그룹 키는 본부를 함께 포함해 동명 지사가 합쳐지지 않는다.
- 관할 현장은 `fetchAll: true`로 읽는다. 활성 현장 ID 100개씩 점검을 조회하고 각 묶음은 ID 정렬·1000행 페이지로 끝까지 받아 기본 응답 제한에 따른 누락을 피한다.
- 현장 표의 사진은 지적사진 건수이고 설명문을 표시한다. 점검자는 마지막 점검일의 기록 기준이며 같은 날짜는 ID 역순으로 고정한다. 주요 테마는 최신 날짜 순으로 중복을 제거해 나열한다.

## 검증.

- [x] 테스트를 먼저 작성하고 미구현 모듈로 실패하는 것을 확인했다.
- [x] `node --test tests/patrol-ledger-status.test.mjs` — 5/5 통과.
- [x] 변경 파일 대상 `npx eslint` — 오류 0, 기존 Dashboard 경고 17. 새 파일 경고 없음.
- [x] 최종 수정 후 `npx tsc --noEmit` — 종료 코드 0.
- [x] Dashboard diff 직접 검토 및 `git diff --check` 통과.
- [x] `package.json` 및 타 Worker 소유 파일을 수정하지 않았다.

브라우저·실제 DB 조회는 이 작업에서 검증하지 않았다. 운영 확인 시 본사·본부·지사 계정의 진입 단계, 주 이동과 테마 저장을 확인하면 된다.
