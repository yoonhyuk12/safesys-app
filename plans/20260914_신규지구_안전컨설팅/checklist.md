# 작업 체크리스트

- [x] 저장소 지침·기존 패턴·재사용 조사.
- [x] 계획 및 집계 기준 작성.
- [x] 집계 테스트 RED/GREEN.
- [x] 관할 데이터 조회 및 대표 계약 해석.
- [x] 안전카드·연도·월 증감·3단계 표·소계 구현.
- [x] 린트·타입·테스트·UI 검증.
- [x] 독립 리뷰와 수정.
- [x] Advisor 인수 검증. (커밋·푸시는 지시에 따라 수행하지 않음)

## 검증 결과 (2026-09-14, 작업 2·3)

- `npx tsc --noEmit` — 오류 없음(exit 0).
- `npm run lint` — exit 0. 신규 파일에 대한 오류·경고 없음. 기존 파일의 미사용 변수 경고만 남아 있다.
- `node --test tests/new-district-consulting.test.mjs` — 17/17 통과.
- `npx playwright test tests/new-district-consulting-view.spec.tsx --project=chromium` — 6/6 통과.
- `npm run build`는 실행하지 않았고 커밋·푸시도 하지 않았다.

## Advisor 인수 검증 (2026-09-14)

워커 보고를 그대로 믿지 않고 Advisor가 같은 명령을 직접 재실행했다.

- `node --test tests/new-district-consulting.test.mjs` — `tests 17 / pass 17 / fail 0`.
- `npx tsc --noEmit` — exit 0, 출력 없음.
- `npx playwright test tests/new-district-consulting-view.spec.tsx --project=chromium` — `6 passed`.
- `npx eslint` 신규 파일 5개 — 출력 없음(오류·경고 0). `Dashboard.tsx`의 경고 17건은 전부 변경 전부터 있던 줄(4·19·24·29·30·149·610·724·821·925·943·977·1146·1537)이며 추가 줄과 무관하다.
- `git diff Dashboard.tsx` — +44/−3, 다섯 군데(lucide `Sprout` import, 뷰 import, 카드 화이트리스트 2곳, 뷰 블록, 카드 블록)로 외과적이다.

### Advisor가 직접 고친 것

- 요약 타일이 드릴다운 단계와 무관하게 항상 `total`을 보여줘 표의 소계와 어긋났다. `PatrolInspectionView`가 `scopeRows` 기준인 것과도 달랐다. 현재 단계 소계(`viewLevel`에 따라 `projectScope.subtotal` / `branchLevelSubtotal` / `total`)를 쓰도록 `NewDistrictConsultingView.tsx`에 `summary`를 더하고 타일 4개를 그쪽으로 돌렸다. 수정 후 tsc·Playwright 재실행해 통과를 확인했다.

## 리뷰 후속 5건 반영 (2026-09-14, Worker)

- [x] Critical 1 — 결과 로딩 무한 스피너 수정 (요청 토큰 + 조기 종료 경로에서 `setResultLoading(false)`).
- [x] 사용자 지시 — 점검 0건은 `-`로 표시 (표·소계·요약 타일 전부, 내부 원수·실시율은 유지).
- [x] 제외("판정 불가") 목록을 본표 밖 기본 접힘 `<details>`로 이동, 빈 결과 판정을 코호트 원수 기준으로 교체, 제외 수의 성격을 한 줄 안내.
- [x] 이 뷰의 `isOrganizationInUserScope` 재필터 제거 (전역 권한 함수는 미수정).
- [x] `MIN_YEAR` 2024 제한 해제 (1900으로 하한 완화, 상한은 올해 유지).
- [x] Minor 11 — `Dashboard.tsx` 신규지구 카드의 무효 `group-hover:` 클래스 제거.
- [ ] Critical 1의 회귀 테스트 — **넣지 못했다.** 사유는 아래 검증 결과에 적었다.

### 검증 결과 (실제 출력)

- `npx tsc --noEmit` — 출력 없음, exit 0.
- `npx eslint` 신규지구 5개 파일 — exit 0, `✖ 17 problems (0 errors, 17 warnings)`. 17건 전부 `Dashboard.tsx`의 기존 경고(4·19·24·29·30·149·610·724·821·925·943·977·1146·1537줄)이고 이번 변경 줄과 무관하다. 신규지구 4개 파일은 경고 0건이다.
- `node --test tests/new-district-consulting.test.mjs` — `tests 19 / pass 19 / fail 0`.
- `node --test tests/new-district-consulting-view.test.mjs` — `tests 10 / pass 10 / fail 0` (기존 7건 + 0건 `-`, 접힘 `details`, 코호트 0 빈 안내 3건 추가).
- `grep -rn "isOrganizationInUserScope\|MIN_YEAR\|0건" src/components/dashboard/NewDistrictConsulting*.tsx` — 5건이 남았고 전부 의도한 것이다. `0건`은 주석 한 곳뿐이라 화면에 출력되는 `0건` 문자열은 없고, `isOrganizationInUserScope`도 제거 사유를 적은 주석 한 줄뿐이며 import·호출은 없다. `MIN_YEAR`는 1900으로 완화된 하한과 그 사용처 2곳이다.
- `npm run build`는 실행하지 않았고 커밋·푸시도 하지 않았다.

### 회귀 테스트를 넣지 못한 이유

무한 스피너는 "렌더 → effect cleanup → 재렌더" 순서에서만 드러나는 버그라 effect를 실제로 실행하는 렌더러가 필요하다. 저장소에 `jsdom`·`react-test-renderer`·`@testing-library/react`가 모두 없고 새 패키지 추가가 금지돼 있으며, 표 테스트가 쓰는 `renderToStaticMarkup`은 effect를 돌리지 않는다. 순수 함수로 뽑아 테스트하면 분기 자체를 그대로 옮겨 적는 동어반복이 되어 실제 순서 버그를 재현하지 못하므로, 가짜 통과를 만드는 대신 미작성으로 남긴다. 도입하려면 `jsdom` + `react-dom/client` + `act` 조합이 필요하다.

## 최종 검증 기록 (2026-09-14, Advisor 인수)

독립 리뷰 9항과 사용자 추가 지시("점검 0건은 `-`")까지 전부 반영을 마쳤다. Advisor가 워커 보고를 그대로 받지 않고 같은 명령을 직접 재실행해 확인했다.

| 검증 | 결과 |
|---|---|
| `npx tsc --noEmit` | exit 0, 출력 없음 |
| `npx eslint` 신규지구 4개 파일 | 출력 없음(오류·경고 0) |
| `node --test tests/new-district-consulting.test.mjs` | 19 / 19 pass |
| `node --test tests/new-district-consulting-view.test.mjs` | 10 / 10 pass |

root 최종 검증도 통과했다 — `npm run lint` exit 0(기존 경고만), `npx tsc --noEmit --incremental false` exit 0, 신규지구 2개 + `projects-fetch-all` + `g2b-contract-period` 합계 42/42 통과, `git diff --check` 통과, 전체·지사별 신규 라우트 HTTP 200.

### 리뷰 9항 반영 확인 (Advisor 코드 직접 확인)

1. 무한 스피너 — `cancelled` 플래그를 요청 토큰(`resultRequestRef`)으로 교체. 조기 종료 두 경로 모두 토큰을 올리고 `setResultLoading(false)`를 한다. 옛 요청이 최신 요청 로딩을 끄지 않는다. (`NewDistrictConsultingView.tsx:244-288`)
2. 요약 현재 범위 — `viewLevel`별 `total`/`branchLevelSubtotal`/`projectScope.subtotal`. Advisor가 직접 넣었고 표 분리 리팩터 뒤에도 유지됨.
3. 12개월 상한 제거 — `MAX_CONSULTING_MONTHS` 상수·export·뷰 `disabled` 전부 제거, 13개월 회귀 테스트 추가.
4. 지사 순서 — `BRANCH_OPTIONS[hq]` 배열 순서, 미등재만 뒤로. 테스트가 실제 `constants.ts`를 transpile해 검증.
5. 제외 목록 — 프로젝트 표 밖 기본 접힘 `<details>`로 이동. 빈 결과 판정을 목록 길이에서 `districtCount === 0`으로 교체(세 표 공용 `EmptyCohortRow`). 제외 수가 연도 무관 관할 전체 기준임을 화면에 명시.
6. 관할 잘림 — 이 뷰의 `isOrganizationInUserScope` 재필터·import 제거(사유 주석 존치). 전역 `organization-scope.ts`·`projects.ts`는 미변경.
7. `MIN_YEAR` — 2024 → 1900으로 완화, 상한은 올해 유지.
8. 디자인 정본 — `violet`·`emerald` 제거(blue), 미점검 배지 `red`, 증감·선택·뒤로가기 버튼 44px. 증감 아이콘은 사용자의 위아래 버튼 요구에 맞춰 Advisor가 `ChevronDown`/`ChevronUp`으로 되돌렸다.
9. UI 테스트 — Playwright `.spec.tsx` → `node:test` `.test.mjs`(`transpileModule` + `jsx: ReactJSX` + `renderToStaticMarkup`). `@jsxImportSource` pragma 제거.

사용자 추가 지시 — 점검 0건은 공용 `formatInspectionCount`로 표·모든 소계·상단 타일에서 `-`. 내부 원수·실시율 계산과 `0개`·`0.0%` 표기는 그대로.

### 남은 한계

- 무한 스피너 회귀 테스트 미작성. effect 실행 렌더러가 필요한데 `jsdom`·`react-test-renderer`·`@testing-library/react`가 없고 새 패키지 추가가 금지다. 순수 함수로 뽑아 흉내 내면 동어반복이라 가짜 통과를 만들지 않고 미작성으로 남겼다.
- `AccidentAnalysisView.tsx`에 같은 재필터 조합(리뷰 6번과 동일 증상)이 남아 있다. 이번 범위 밖이라 손대지 않았다.
- `playwright.config.ts`가 `testDir: './tests'`에 `testMatch`가 없어 인자 없는 `npx playwright test`가 `*.test.mjs`도 잡는다. 기존부터 있던 상태이고 전역 설정 변경 금지라 두었다.
- 리뷰 Minor 7(`emptySubtotal`/`sumSubtotals` 중복)과 13(O(P×C), 청크 직렬 조회)은 코디네이터 지시로 이번 범위에서 생략했다.
- `npm run build`·커밋·푸시는 지시대로 수행하지 않았다. root가 인수 커밋한다.
