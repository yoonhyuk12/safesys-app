# 컨텍스트 노트

- 작업 시작 시 `log.md`에 기존 수정이 있었다. 이 수정은 보존하고 커밋 대상에서 제외한다.
- 사용자 카드명 오타는 목적에 맞게 신규지구 안전컨설팅으로 정리한다.
- 연도 기준은 착공연도 코호트로 해석했다. 비동기 확인 질문을 전달했으며 사용자 응답이 오면 반영한다.
- 대표 계약은 그룹 최초 시작일과 프로젝트에 저장된 대표 ID·나라장터 기본 대표 연계 규칙을 확인해야 한다. 현재 프로젝트 착공일만 그대로 쓰면 대표 미지정/오래된 값 때문에 통계가 틀릴 수 있다.
- Orca run `run_53a31774d67b`로 실제 워커 작업과 리뷰를 감독한다.
- 프로덕션 빌드 및 푸시는 수행하지 않는다.

## 작업 2·3 구현 메모

- 뷰는 `PatrolInspectionView`의 구조를 그대로 본떴다. `viewLevel`/`rootLevel` 3단, `scopeAppliedRef`·`loadedScopeRef` 프로필 변경 처리, `cancelled` 비동기 취소, 재시도 배너, 연도 ChevronUp/Down이 같은 형태다.
- 집계 라이브러리는 손대지 않았다. 뷰는 `getNewDistrictConsulting` 결과를 표시만 하며, 동명 지사(본부 미지정) 진입에서 같은 이름의 지사 그룹을 합칠 때만 원수 합산 소계를 뷰에서 다시 계산한다.
- 준공 프로젝트를 제외하지 않는다. 제외하면 과거 신규지구 실적이 사라진다.
- 제외(판정 불가) 행은 선택 연도와 무관하게 항상 들어오므로 프로젝트 표에서 `<tbody>`를 나눠 연도 코호트 행과 섞이지 않게 했다.
- `NewDistrictConsultingView.tsx` 첫 줄에 `/** @jsxImportSource react */`를 달았다. 이게 없으면 Playwright가 JSX를 자체 `__pw_type` 객체로 바꿔 `renderToStaticMarkup`이 "Objects are not valid as a React child"로 실패한다. 이미 테스트되는 `src/components/admin/AdminSortControls.tsx`와 같은 처리다.
- 실시율은 라이브러리가 0~1 소수로 주므로 뷰에서 `(rate * 100).toFixed(1)%`로만 표시한다. 표 테스트는 지사 50%·100%(4개 중 2개, 1개 중 1개)로 율 평균 75%와 원수 60%가 갈리는 fixture를 쓴다.
- `package.json`에 `test:new-district-view` 스크립트를 더했다. `playwright.config.ts`의 `webServer`가 `npm run dev`를 띄우므로 실행 시 개발 서버가 함께 뜬다.

## 미반영 요구 4건 반영 메모 (2026-09-14)

### 착공연도 기준은 사용자가 확정했다 (가정 아님)

- 연도 코호트를 **대표 계약 착공연도**로 잡는 것은 사용자가 명시 확정한 기준이다. 앞의 "착공연도 코호트로 해석했다"는 추정 메모는 이 확정으로 대체된다.
- 연말 착공 지구의 **다음 해 점검도 설정 개월 이내면 착공연도 실적에 포함**한다. 실적은 점검일이 아니라 지구의 착공연도에 귀속된다. 회귀 테스트 `연말 착공 지구는 다음 해 점검도 인정한다`가 이 규칙을 지킨다.

### 1. 임의 12개월 상한 제거

- 사용자가 말한 "1년"은 착공연도 코호트를 뜻하지 인정 기간 상한이 아니다. 계획이 정한 제약은 **최소 1개월뿐**이라 `MAX_CONSULTING_MONTHS` 상수와 그 re-export·뷰 import를 전부 지웠다.
- `clampConsultingMonths`는 하한 1만 적용한다. 비유한값·비정수는 종전대로 기본값 3/절삭이다.
- 뷰의 인정 기간 증가 버튼에서 상한 `disabled`를 없앴다. 감소 버튼의 `MIN_CONSULTING_MONTHS` 하한 비활성은 남긴다.
- 점검 조회 종료일 경로를 확인했다 — `getNewDistrictConsulting`은 `cohort.maxDeadlineDate`를 `lte`로 쓰고, 그 값은 `resolveNewDistrictCohort`가 실제 설정 개월(`clampConsultingMonths(months)`)로 계산한 최대 기한이다. 상한을 없애면 조회 범위가 자동으로 넓어진다. 별도 수정이 필요 없었다.
- 12개월 상한 테스트를 지우고 13개월 회귀 테스트(`2026-01-15` 착공 + 13개월 → 기한 `2027-02-15`, `2027-02-10` 점검 인정)를 넣었다. 하한 1개월 테스트는 유지했다.

### 2. 지사 표는 기존 지사 순서 유지

- 가나다순(`localeCompare(_, 'ko')`)을 버리고 `BRANCH_OPTIONS[hq]` 배열 순서로 정렬한다. 배열에 없는 지사만 뒤에 놓고 뒤쪽끼리 가나다순이다.
- 지사 순서는 본부마다 다르므로 비교 함수가 소속 본부를 받는다 — `branchOrder(hq, branch)`/`compareBranch(hq, left, right)`로, 본부 정렬의 `hqOrder`/`compareHq` 패턴을 그대로 따랐다.
- **뷰는 재정렬하지 않는다.** 라이브러리가 준 `branches` 배열 순서를 그대로 렌더한다. 표 렌더 테스트가 이 불변식을 지킨다.
- 집계 테스트는 실제 `BRANCH_OPTIONS`로 검증한다. 상수를 테스트에 복제하면 배열이 바뀔 때 테스트가 거짓 통과하므로 `src/lib/constants.ts`를 그대로 transpile해 쓴다.

### 3. UI 테스트를 node:test로 전환

- Playwright의 JSX 변환에 기대는 구조 자체가 불안정했다(`Objects are not valid as a React child (found: object with keys {__pw_type, ...})`). `playwright.config.ts`의 `webServer`가 `npm run dev`까지 띄우는 것도 UI 순수 렌더 검증에는 과하다.
- 표 하위 컴포넌트를 `src/components/dashboard/NewDistrictConsultingTables.tsx`로 분리했다. 순수 표시 컴포넌트라 런타임 의존성이 `react/jsx-runtime` 하나뿐이고, 뷰의 `AuthContext`·`supabase`·`projects`를 스텁으로 막을 필요가 없어진다.
- 새 테스트 `tests/new-district-consulting-view.test.mjs`는 `patrol-inspection-utils.test.mjs`의 `transpileModule` 헬퍼에 `jsx: ts.JsxEmit.ReactJSX`를 더해 `.tsx`를 CommonJS로 바꾸고, `require` 스텁으로 `react`·`react/jsx-runtime`을 주입한 뒤 `renderToStaticMarkup`으로 마크업 문자열을 검증한다.
- 분리 덕분에 `/** @jsxImportSource react */` pragma가 더 이상 필요 없어 지웠다.
- 기존 6개 검증(본부 소계 원수 합산, 지사 소계, 미점검 배지, 판정 불가 별도 구역·사유, 다건 점검일, 빈 결과 문구)을 그대로 옮기고 요구 2의 지사 순서 검증을 표 렌더 수준에서 한 건 더해 7건이다.
- `package.json`의 `test:new-district-view`를 `node --test tests/new-district-consulting-view.test.mjs`로 바꿨다. 더 이상 개발 서버가 뜨지 않는다.

### 4. 디자인 정본 위반 수정

근거는 `docs/design-system.md`의 의미색 표와 현장 제약 항이다.

- **`violet` 제거** — 문서 팔레트에 없는 색이다. 소계 행을 `bg-blue-50 font-semibold border-b-2 border-blue-200`, 소계 셀 글자를 `text-blue-800`으로 바꿨다.
- **`emerald` 제거** — 문서상 `emerald`는 "계약·지급자재 계열 전용, `green`의 대체가 아니다". 신규지구 안전컨설팅은 계약 계열이 아니다. 뷰 헤더 `Sprout` 아이콘과 실시율 타일, `Dashboard.tsx`의 신규지구 카드(테두리·바탕·아이콘·"현황" 글자)를 `blue`로 바꿨다. 점검 지구 타일의 `green`은 정상·완료 뜻이라 유지했다.
- **미점검 배지는 `red`** — 문서상 `red`가 "위험·미이행 — 미점검, 부적합, 사고, 기한 초과"이고 `amber`는 "기한 임박, 승인 대기"다. `bg-amber-100 text-amber-800` → `bg-red-100 text-red-800`. 점검 `green`, 판정 불가 `gray`는 유지했다.
- **터치 영역 44px** — 장갑 낀 손으로 누르는 화면이다. 연도·인정 기간 증감 버튼을 `flex-col` 상하 배치에서 **좌우 배치**(`-` 왼쪽 / 값 / `+` 오른쪽)로 바꿔 세로 88px가 되지 않게 하면서 각 버튼이 `min-h-[44px] min-w-[44px]`를 갖게 했다. 아이콘은 `ChevronUp`/`ChevronDown` 대신 `Minus`/`Plus`를 쓰고 `aria-label`은 그대로다. 표 안의 본부·지사 선택 버튼과 뒤로가기 버튼에도 `min-h-[44px]`를 줬다.
- 남은 한계 — 점검 건수 타일과 실시율 타일이 모두 `blue`라 나란히 놓이면 구분이 약하다. 문서 팔레트 안에서 이 둘을 갈라 쓸 색이 마땅치 않아 브리프가 지정한 `blue`를 그대로 뒀다.

## 리뷰 후속 5건 반영 메모 (2026-09-14)

### 1. 결과 로딩 무한 스피너 (Critical)

- 재현 경로는 `review.md` 1번과 같다. 결과 effect가 `projectsLoading`·빈 관할 조기 종료에서 `resultLoading`을 내리지 않아, 직전 요청의 `finally`가 `cancelled` 때문에 건너뛰어진 뒤 `loading = projectsLoading || resultLoading`이 true로 굳었다.
- `cancelled` 플래그를 **요청 토큰(`resultRequestRef`)**으로 바꿨다. 요청마다 세대 번호를 받고 `isLatest()`일 때만 `setResult`·`setError`·`setResultLoading(false)`를 한다. 옛 요청이 뒤늦게 끝나도 최신 요청의 로딩을 꺼버리지 않는다.
- 조기 종료 두 경로에서도 토큰을 올려 진행 중 요청을 무효화하고 `setResultLoading(false)`를 함께 한다. cleanup은 토큰만 올려 언마운트·조건 변경 시 진행 중 요청을 버린다.
- **회귀 테스트는 넣지 못했다.** effect 실행 순서를 재현하려면 렌더러가 필요한데 `jsdom`·`react-test-renderer`·`@testing-library/react`가 없고 새 패키지가 금지다. `renderToStaticMarkup`은 effect를 돌리지 않는다. 순수 함수 추출은 분기를 그대로 옮겨 적는 동어반복이라 실제 순서 버그를 잡지 못해 하지 않았다.

### 2. 점검 0건은 `-` (사용자 지시)

- `formatInspectionCount(count)` 한 곳으로 모으고 본부 표·지사 표·프로젝트 표 본문·**모든 소계 행**·상단 "점검 건수" 요약 타일이 함께 쓴다.
- **표시만 바꿨다.** `inspectionCount` 원수와 `rate` 계산은 그대로다. 프로젝트 개수 `0개`와 실시율 `0.0%`는 지시 대상이 아니라 손대지 않았고, 테스트가 그 둘이 남아 있음을 함께 단언한다.

### 3. 제외("판정 불가") 목록 기본 접힘

- 근거는 DB 실측이다. 전체 1,034건 중 854건이 대표 id·g2b 번호가 둘 다 없고 846건은 `project_contracts` 자체가 없다. 어느 연도를 골라도 제외 행이 관할의 83%라 본표를 덮었다.
- 판정 불가 `<tbody>`를 프로젝트 표 **밖 기본 접힘 `<details>`**로 내렸다. `<summary>`는 `대표 계약 미확인으로 착공연도 판정 불가 (N개)`이고 44px 터치 영역을 지킨다. 머리글 재사용을 위해 `ProjectTableHead`를 뽑았다.
- **제외 수와 각 표의 "제외" 열은 그대로 유지**했다.
- 빈 결과 판정을 목록 길이에서 **코호트 원수(`districtCount === 0`)**로 바꿨다. 제외만 있는 본부·지사도 행으로 남기 때문에 `hqs.length === 0`으로는 안내가 나오지 않았다. 세 표가 `EmptyCohortRow`를 공유하고, 안내 행은 소계 바로 아래에 놓아 조직 행이 많아도 먼저 보이게 했다.
- 제외 수가 선택 연도와 무관한 관할 전체 기준임을 표 아래 한 줄로 명시했다. 본부·지사·프로젝트 세 단계에서 모두 보이도록 표 컨테이너 밖 뷰 쪽에 뒀다.

### 4. 이 뷰의 `isOrganizationInUserScope` 재필터 제거

- `getProjectsByUserBranch`는 `BRANCH_OPTIONS[hq][0] === branch_division`이면 본부 전체를 돌려주는데, 첫 지사가 `사업관리부`·`사업관리부외`·`토지관리부`인 본부(화안·금강·새만금·영산강·토지개발·충남서부관리단)에서는 `isOrganizationInUserScope`가 `endsWith('본부')`가 아니라며 자기 부서만 남겨 본부 전체 실적을 가렸다.
- fetchAll 경로가 `managing_hq`까지 함께 걸어 동명 지사 방어가 이미 끝나므로 이 뷰의 재필터를 지우고 import도 제거했다. 제거 사유는 코드 주석으로 남겼다.
- **`src/lib/organization-scope.ts`·`src/lib/projects.ts`는 건드리지 않았다.** 다른 화면에 영향이 가기 때문이다. `AccidentAnalysisView.tsx`도 같은 조합이라 같은 증상이 남아 있는데, 이번 범위 밖이라 그대로 뒀다.

### 5. `MIN_YEAR = 2024` 제한 해제

- 2024년 이전 시작 계약이 실측 29건이라 2023년 이하 코호트를 볼 수 없었다.
- 기존 증감 컨트롤 형태를 유지하고 하한만 `1900`으로 낮췄다. 직접 입력 방식은 입력 검증 표면이 늘고, 실사용 범위가 2023~2026이라 증감 버튼으로 충분하다고 봤다. 상한은 올해(`CURRENT_YEAR`)로 유지했다. 하한이 업무 규칙이 아니라는 점을 주석으로 남겼다.

### 그 밖

- Minor 11 — `Dashboard.tsx` 신규지구 카드의 `group-hover:bg-blue-200`은 상위에 `group`이 없어 무효라 그 클래스만 지웠다(앞선 blue 전환 때 색만 바뀌고 남아 있었다).
- Minor 7(`emptySubtotal`/`sumSubtotals` 중복)과 13(O(P×C)·청크 병렬화)은 코디네이터 결정으로 이번 범위에서 제외했다.
- 증감 버튼 아이콘이 `Minus`/`Plus`에서 `ChevronDown`/`ChevronUp`으로 되돌아와 있었다(외부 수정). 좌우 배치와 44×44 터치 영역은 그대로라 되돌리지 않았다.
