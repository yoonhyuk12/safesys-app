# 신규지구 안전컨설팅 코드 리뷰 (읽기 전용, 2026-09-14 16:48 기준 파일 상태)

> 아래는 수정 전 리뷰 기록이다. 최종 인수 시 Critical 1과 Important 2~6, 사용자 요구인 지사 순서·점검 0건 `-` 표시를 반영했다. 요약 범위, 로딩 취소, 기간 상한, 과거 연도, 관할 범위, 제외 목록, 색상·터치 영역과 테스트 실행 방식의 수정 내역은 `checklist.md`의 최종 검증 기록에 정리했다. 중복 정리·조회 성능 개선 등 선택적 제안은 이번 범위에서 제외했다.
>
> 최종 직접 검증은 관련 테스트 42/42, 전체 린트(기존 경고만), 타입 검사, diff 공백 검사, 전체·지사 라우트 HTTP 200을 통과했다. Orca 내장 브라우저는 `runtime_unavailable` 오류로 화면 자동 검증을 완료하지 못했다. 표 마크업은 렌더 테스트로 검증했고, effect 실행 순서의 회귀 테스트는 남은 한계로 기록했다.

검증 실행 결과. `npx tsc --noEmit` 통과, ESLint 신규 파일 0건(Dashboard.tsx 기존 경고 17건만), `node --test tests/new-district-consulting.test.mjs` 17/17 통과. DB 실측(Supabase 읽기 전용). `headquarters_inspections.inspection_date`·`project_contracts.start_date` 모두 `date` 타입이라 yyyy-MM-dd 문자열 비교는 안전하다.

## 강점

- 대표 계약 규칙이 계약현황 원본과 일치한다. `nameGroupKey`·`isThtmPartial`·`ctrtNoFromUrl`·g2b 기본 대표 판정(`resolveRepresentativeContractId`)이 `contract-status/page.tsx:361-383, 1759-1772`와 동일하고, 그룹 최초 시작일(`resolveRepresentativeStartDate`)도 `page.tsx:1684-1690`과 같은 규칙이다. 대표 id가 계약 행을 가리키지 않는 경우(dangling)는 DB 실측 0건.
- 달력 개월 계산(`addMonthsToDateText`)이 월말 보정·로컬 Date 사용으로 UTC 함정을 피했고, 기한 당일 포함·다음날 제외·시작일 전 제외·연말 착공 다음 해 인정·동일지구 중복 건수 구분·미점검 분모·소계 원수 재계산이 모두 테스트로 고정돼 있다.
- 조회 계층이 1000행 페이지네이션·80개 id 청크·부분 결과 대신 예외를 지키고, 점검 조회 범위가 코호트 최소 시작일~최대 기한(연도 경계 초과)으로 잡힌다. 테스트가 mock 빌더의 range·gte·lte 호출 이력을 검증해 실제 동작을 본다.
- URL 직접 진입·새로고침·뒤로가기는 patrol 카드와 같은 경로 처리(`Dashboard.tsx:539, 551`)를 재사용해 동작한다. 동명 지사 진입 시 본부를 추정하지 않고 원수 합산으로 처리하는 방어(`NewDistrictConsultingView.tsx:484-492, 558-572`)도 적절하다.

## 문제

### Critical

1. **결과 로딩 중 관할이 바뀌거나 재시도 시 프로젝트 조회가 실패/빈 결과면 스피너가 영원히 남는다.**
   - `src/components/dashboard/NewDistrictConsultingView.tsx:511-544`, `574`
   - 재현. 결과 조회 오류 → 화면의 "다시 시도" 클릭. 같은 커밋에서 관할 effect(390행)가 `setProjectsLoading(true)`를 하고 결과 effect(511행)는 그 렌더의 `projectsLoading=false`·기존 projects로 `setResultLoading(true)`·요청 시작. 다음 렌더에서 `projectsLoading=true`가 되어 결과 effect cleanup이 `cancelled=true`로 만들고 `finally`의 `setResultLoading(false)`가 건너뛰어진다. 이어 프로젝트 재조회가 실패하거나(423행 `setProjects([])`) 빈 관할이면 결과 effect가 `setResult(null); return`(513행)만 하므로 `resultLoading`이 true로 고정되고 `loading = projectsLoading || resultLoading`(574행)이 true라 오류 문구 대신 스피너만 보인다. 프로필 소속 전환(402-409행) 뒤 빈 관할도 같은 경로다.
   - 권장. 결과 effect의 조기 return 두 곳(512·513행)에서 `setResultLoading(false)`를 함께 하거나, cleanup에서 `setResultLoading(false)`를 호출한다. 또는 `resultLoading`을 별도 state 대신 요청 토큰으로 관리한다.

### Important

2. **헤더 요약 4칸이 드릴다운과 무관하게 전사 합계만 보여 표 소계와 어긋난다.**
   - `NewDistrictConsultingView.tsx:547, 657-682`
   - 지사·프로젝트 단계로 내려가도 `total = result.total`을 그대로 쓴다. 지사 단계의 표 소계(772행 `branchLevelSubtotal`)나 프로젝트 단계(780행 `projectScope.subtotal`)와 다른 숫자가 같은 화면에 나온다. 지사 사용자처럼 rootLevel이 project인 경우는 우연히 일치하지만, 본부 사용자가 지사를 고르면 즉시 불일치다.
   - 권장. `viewLevel`별로 `total` → `branchLevelSubtotal` → `projectScope.subtotal`을 골라 헤더에 넣는다.

3. **인정 기간 12개월 상한이 아직 남아 있다(이미 수정 요청된 항목의 최종 확인).**
   - `src/lib/new-district-consulting-utils.ts:12, 118`, `NewDistrictConsultingView.tsx:13, 726`, `tests/new-district-consulting.test.mjs:50, 102-105`
   - 16:48 기준 파일 수정 시각(utils 16:35, View 16:46, tests 16:34) 이후에도 `MAX_CONSULTING_MONTHS = 12`와 `disabled={months >= MAX_CONSULTING_MONTHS}`가 그대로다. 사용자 확정(상한 없음)과 어긋난다. 테스트 102-105행이 상한 12를 단언하므로 상한 제거 시 이 테스트도 함께 바꿔야 한다.

4. **지사 순서가 가나다순이라 사용자 추가 요구(BRANCH_OPTIONS 정본 순서)와 어긋난다(요청된 항목의 최종 확인).**
   - `new-district-consulting-utils.ts:402` `.sort(([left],[right]) => left.localeCompare(right,'ko'))`
   - 16:48 기준 미반영. 본부 정렬(330-339행)처럼 `BRANCH_OPTIONS[hq]` index 우선·미등재는 뒤로 가나다순으로 바꾸고, 테스트 `본부 소계는 …`(260-287행)의 `['가지사','나지사']` 단언이 가나다 정렬에 의존하므로 정본 순서 테스트로 교체해야 한다.

5. **"판정 불가" 제외 행이 연도와 무관하게 관할 전체 프로젝트의 83%를 차지해 표를 덮는다.**
   - `new-district-consulting-utils.ts:244-254`(연도 필터 없이 제외 행 유지), `NewDistrictConsultingView.tsx:334-347`
   - DB 실측. 전체 프로젝트 1,034건 중 대표 id 93건·g2b 번호 87건이고 854건은 둘 다 없다. 그중 계약 행이 하나라도 있는 프로젝트는 8건뿐이고 846건은 `project_contracts` 자체가 없다. 즉 어떤 연도를 골라도 본부 표 "제외" 열에 수백 개가 뜨고, 프로젝트 표의 "판정 불가" 구역이 코호트 행보다 훨씬 길다. 본부/지사 표에서 코호트 0·제외 N인 조직도 행으로 남아 `EMPTY_MESSAGE`가 사실상 나오지 않는다(187행 `hqs.length === 0` 조건).
   - 계획서의 "제외 사실 표시" 취지는 지키되 범위를 좁힐 것을 권장한다. 예를 들어 계약 행이 있으나 대표를 못 정한 프로젝트(8건)만 "판정 불가"로 표시하고, 계약 미등록 프로젝트는 소계의 "계약 미등록 N개"로만 집계하거나 접어 두는 방식. 계획 수준의 결정이므로 Advisor 확인 필요.

6. **관할 필터 두 규칙이 어긋나 화안·금강·새만금·영산강·토지개발·충남서부관리단 본부 대표 부서 사용자는 타 지사가 사라진다(기존 패턴 상속).**
   - `NewDistrictConsultingView.tsx:428-435` + `src/lib/projects.ts:263-268` + `src/lib/organization-scope.ts:38-45`
   - `getProjectsByUserBranch`는 `BRANCH_OPTIONS[hq][0] === branch_division`이면 본부 전체를 돌려주는데, 그 첫 지사가 '사업관리부'·'사업관리부외'·'토지관리부'인 본부에서는 `isOrganizationInUserScope`가 `endsWith('본부')`가 아니라며 자기 부서 프로젝트만 남긴다. 결과적으로 해당 본부 대표 부서 발주청 사용자는 본부 전체 실적을 못 본다. `AccidentAnalysisView.tsx:240`도 같은 조합이라 이 뷰만의 버그는 아니지만 신규 화면에서도 재현된다.
   - 권장. 두 규칙을 한 곳으로 통일하거나, 최소한 이 뷰에서는 `getProjectsByUserBranch`의 fetchAll 경로가 이미 본부까지 필터하므로 재필터를 빼는 것을 검토한다(단, 동명 지사 방어가 이유였다면 fetchAll 경로가 `managing_hq`도 같이 걸므로 중복이다).

### Minor

7. `NewDistrictConsultingView.tsx:69-93` `emptySubtotal`·`sumSubtotals`가 utils(288-328행)와 중복이다. utils에서 export해 재사용하면 된다.
8. `NewDistrictConsultingView.tsx:33` `MIN_YEAR = 2024` 하드코딩. 실측으로 2024년 이전 시작 계약이 29건 있어 2023년 이하 코호트는 조회할 수 없다. 의도라면 주석으로 남기고, 아니면 코호트 최소 연도로 낮춘다.
9. `NewDistrictConsultingView.tsx:691-739` 연도·개월 증감 버튼이 `h-3.5` 아이콘만 있는 소형 버튼이라 디자인 시스템의 44px 터치 규칙에 어긋난다(코디네이터가 이미 전달했다고 하여 확인만 기록). 본부·지사 표 행(`py-2.5`)도 44px에 못 미친다.
10. `NewDistrictConsultingView.tsx:95, 133` violet, `Dashboard.tsx` 신규 카드의 emerald는 design-system.md 의미색 표 밖의 색이다(전달 완료 항목, 확인만 기록). 소계 행은 `bg-gray-50 font-semibold text-gray-900` 정도가 정본에 가깝다.
11. `Dashboard.tsx` 신규 카드의 `group-hover:bg-emerald-200`은 상위에 `group`이 없어 무효 클래스다(기존 카드 복사 잔재).
12. 테스트 공백. `no_start_date` 사유, `unty_cntrct_no`·`cntrct_info_url` 경로의 g2b 폴백, 제외 행 정렬(뒤로 보내기), 동명 지사 원수 합산(View의 `projectScope`)은 테스트가 없다. View 쪽은 순수 함수가 아니라 어렵지만 `sumSubtotals`를 utils로 옮기면 함께 커버된다.
13. 성능. `resolveRepresentativeStartDate`가 프로젝트마다 전체 계약 배열을 `filter`해 O(P×C)다. 현재 규모(1,034×1,022)는 문제없으나 `project_id`로 Map을 한 번 만들면 단순해진다. 계약 청크 조회(80개씩 직렬)도 본사 사용자는 13회 이상 순차 왕복이라 `Promise.all`로 묶을 여지가 있다.

## 판정

**병합 가능 여부. 수정 후 가능.** 순수 집계·조회 계층은 규칙과 테스트가 잘 맞고 실제 동작 버그가 없다. 반면 뷰의 무한 스피너(1번)와 헤더 합계 불일치(2번)는 사용자에게 바로 보이는 동작 버그이고, 사용자 확정 사항 두 건(12개월 상한 제거 3번, 지사 정본 순서 4번)은 리뷰 시점까지 미반영이다. 5번은 실데이터상 화면 유용성을 좌우하므로 Advisor의 범위 결정이 필요하다.
