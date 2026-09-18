# Codex Worker 브리프 — 공사감독 순회점검 현황 뷰를 형제 현황 뷰와 같은 강조 디자인으로

너는 SafeSys(Next.js 15 · React 19 · Supabase · Tailwind v4) 저장소의 구현 Worker다. 저장소 루트는 이 파일이 있는 리포지토리이고, 모든 npm 명령은 `safesys-app/`에서 실행한다. 먼저 `CLAUDE.md`, `.claude/rules/safesys/design-system.md`, `docs/design-system.md`를 읽어라. 한국어로 보고하고 문장을 콜론으로 끝내지 마라. 요청과 무관한 코드는 손대지 않는다. `dark:` 금지. 이모지 아이콘 금지(lucide-react만). `npm run build` 금지. git commit·push 금지.

## 배경

안전현황 대시보드 `/safe/patrol-ledger`는 `safesys-app/src/components/dashboard/PatrolLedgerStatusView.tsx`가 그린다. 같은 층위의 형제 뷰인 `RiskAssessmentStatusView.tsx`(rose 강조)·`WorkPlanStatusView.tsx`(teal 강조)는 카드 하나에 헤더 띠·강조색 제목 아이콘·소계 강조 행·강조색 행 hover·건수 배지·셀 세로 구분선이 있는데, 순회점검 현황 뷰만 흰색·회색 단색이라 사용자가 "너무 밋밋하다"고 지적했다. 안전현황 그리드의 순회점검 카드는 `bg-blue-100` + `ClipboardList text-blue-600`이므로 이 뷰의 강조색은 **blue**다.

## 목표

`PatrolLedgerStatusView.tsx` 한 파일의 **JSX 모양만** 형제 뷰와 같게 만든다. 데이터 조회·집계·상태·effect·테마 저장·권한 판정 로직은 한 줄도 바꾸지 않는다. 클래스·마크업 구조·문구 배치만 바꾼다.

## 대상 파일 (이 파일만 수정)

- `safesys-app/src/components/dashboard/PatrolLedgerStatusView.tsx`

## 기준 파일 (읽기만)

- `safesys-app/src/components/dashboard/RiskAssessmentStatusView.tsx` — 268~330행(controls·badge·statCells), 408~470행(카드 골격·헤더 띠·제목·표 헤더), 470~560행(소계 행·본부/지사 행·프로젝트 행)
- `safesys-app/src/components/dashboard/WorkPlanStatusView.tsx` — 같은 구조의 두 번째 예

## 맞출 것

1. **카드 골격.** 지금의 카드 두 장(테마 카드 + 표 카드)을 형제 뷰처럼 **카드 한 장** `bg-white rounded-lg shadow-sm border border-gray-200`으로 합친다. 안은 헤더 띠 `px-2 py-2 sm:px-6 sm:py-4 border-b border-gray-200` + 본문 `p-3 sm:p-6`.
2. **헤더 띠.** `flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between`. 왼쪽은 뒤로가기 버튼 하나(`inline-flex min-h-[44px] items-center gap-1 self-start text-sm text-gray-600 hover:text-gray-900 transition-colors`, `ArrowLeft h-4 w-4`). 형제 뷰처럼 단계에 따라 동작·문구가 바뀐다 — `canGoUp`이면 `goUp()`을 부르고 문구는 `{level === 'project' ? '지사별' : '본부별'} 통계로 돌아가기`, 아니면 `onBack()`을 부르고 문구는 `안전현황으로 돌아가기`. 이에 따라 지금 표 헤더 안에 있던 "통계로 돌아가기" 링크는 없앤다(중복). 오른쪽은 주 이동 컨트롤 — 형제 뷰의 연도 컨트롤(`flex items-center gap-1 rounded-md border border-gray-300 bg-white py-0.5 px-1`)과 같은 테두리 상자 안에 `[ChevronLeft 버튼] {연도}년 {weekLabel} [ChevronRight 버튼]`. 화살표 버튼은 lucide `ChevronLeft`/`ChevronRight` `h-4 w-4`, `aria-label="이전 주"`/`"다음 주"`, `min-h-[44px] px-2 text-gray-500 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed`. 가운데 글자는 `min-w-[44px] text-center text-sm tabular-nums text-gray-900`. 지금의 `◀ 이전 주`/`다음 주 ▶` 글자 버튼과 `BUTTON` 상수는 제거한다. `disabled={saving}` 조건은 유지.
3. **제목.** 본문 맨 위 `h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900"` + `ClipboardList className="h-5 w-5 text-blue-600"`. 문구는 형제 뷰 패턴을 따른다 — hq 단계 `본부별 공사감독 순회점검`, branch 단계 `${hqDisplay(selectedHq)} - 지사별 공사감독 순회점검`, project 단계 `${selectedBranch} - 프로젝트별 공사감독 순회점검`. `hqDisplay`는 RiskAssessmentStatusView의 것(본사·기타가 아니고 '본부'로 끝나지 않으면 '본부'를 붙임)을 이 파일에 3줄로 복사한다. `selectedHq`가 null인 branch 단계(본부 사용자)는 접두어 없이 `지사별 공사감독 순회점검`.
4. **점검 테마 패널.** 제목 아래, 표 위에 강조 영역 `mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 sm:p-4`. 첫 줄은 배지 `inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800`(문구 `금주 점검 테마` 또는 `선택 주 점검 테마`)와 그 옆 `text-xs text-gray-500`으로 `{weekLabel}`. 둘째 줄은 지금 로직 그대로 — 로딩 스피너 / 오류 `role="alert" text-sm text-red-800` / 편집 가능하면 기존 form(입력 클래스·저장 버튼 클래스·`aria-label`·`maxLength`·disabled 조건 전부 유지, `mt-2`) / 아니면 테마 글자 `text-sm font-medium text-gray-900`(없으면 `text-sm text-gray-500` `아직 등록되지 않았습니다.`). `saveMessage`(`role="status"`)·`saveError`(`role="alert"`) 문단은 패널 안에 그대로 둔다.
5. **안내 문구.** 표 바로 위 `mb-2 text-xs text-gray-500`로 기존 `level`별 안내문 그대로.
6. **표.** `overflow-x-auto` 안에 `table className="w-full min-w-[800px] divide-y divide-gray-200"`. `thead bg-gray-50`, `th px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 last:border-r-0`, `tbody divide-y divide-gray-200`, 일반 `td px-3 py-3 text-sm text-center border-r border-gray-200 last:border-r-0`. `TH`·`TD` 상수를 이 값으로 바꿔 쓰면 된다. 열 구성·순서·문구는 지금 그대로.
7. **소계 행.** 제목 행 바로 아래 유지. `tr className="bg-blue-50/70 border-b-2 border-blue-200"`, 셀은 `px-3 py-2 text-sm text-center text-blue-900 font-semibold border-r border-gray-200 last:border-r-0`. 소계 첫 셀은 `text-left`. 소계 안 숫자는 배지 없이 숫자만(0은 `-`).
8. **본부·지사 행.** `tr className="hover:bg-blue-50/50 cursor-pointer transition-colors"`, 이름 버튼 `min-h-[44px] text-sm font-medium text-blue-700 hover:text-blue-900`. onClick·stopPropagation 로직은 그대로.
9. **건수 표현(배지).** 형제 뷰의 `badge` 헬퍼처럼 이 파일에 작은 헬퍼를 둔다. 규칙은 다음과 같다.
   - `순회점검 건수`(본부·지사 표)와 `점검 건수`(프로젝트 표) — 1 이상이면 `inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800`로 `{n}건`. 0이면 본부·지사 표는 `-`(아래 10번), 프로젝트 표는 `bg-red-100 text-red-800` 배지로 `미점검`(디자인 시스템에서 미점검은 red다).
   - `미흡 항목 수`(프로젝트 표) — 1 이상이면 `bg-amber-100 text-amber-800` 배지로 `{n}`, 0이면 `-`.
   - `비고`(본부·지사 표) — `patrolStatusRemark` 문자열 대신 배지 두 개로 바꾼다. `uninspectedCount > 0`이면 `bg-red-100 text-red-800` 배지 `미점검 {n}`, `poorCount > 0`이면 `bg-amber-100 text-amber-800` 배지 `미흡 {n}`. 둘 다 0이면 `-`. 배지는 `inline-flex flex-wrap justify-center gap-1`로 나란히. `patrolStatusRemark` import는 더 이상 안 쓰면 제거한다(lint 통과 필요). 소계 행의 비고는 배지 없이 `patrolStatusRemark` 문자열을 그대로 써도 되고 배지를 써도 된다 — 하나로 정해 보고에 적어라.
   - 등록 프로젝트 수·분기 점검 대상·TBM·사진 — 배지 없이 숫자, `tabular-nums`.
10. **0 표기.** 기존 `count()` 헬퍼는 유지하되 `-`는 `text-gray-400`으로 감싼다(형제 뷰의 `<span className="text-gray-400">-</span>`). 마지막 점검일·점검자·주요 테마의 `-`도 같게.
11. **빈 행.** `px-4 py-8 text-center text-sm text-gray-500`, colSpan은 지금 그대로. 로딩은 `<LoadingSpinner />`를 `flex justify-center items-center py-12` 안에, 오류는 `py-10 text-center text-sm text-red-600`(형제 뷰와 동일) — 단 `role="alert"`는 유지한다.
12. **색.** blue-600/700/800/900·blue-50/100/200, 상태색 red·amber, 나머지 gray 스케일만 쓴다. 새 색·그림자·글꼴·임의 hex 금지.
13. **모바일.** 표는 `overflow-x-auto` 안에서만 가로 스크롤. 헤더 띠는 `sm` 미만에서 세로 쌓임. 320px에서 페이지 전체 가로 스크롤이 생기지 않아야 한다.

## 손대지 말 것

- `StatusContent` 안의 모든 `useState`·`useEffect`·`useMemo`·`fetchAllByProjects`·`saveTheme`·`goUp`·`rows/groups/projectRows/totals` 계산.
- 바깥 `PatrolLedgerStatusView`(권한 검사·scopeKey)와 `TotalCells`의 데이터 출처(클래스만 바꾼다).
- `aria-label`·`role`·`maxLength`·`disabled` 조건·`min-h-[44px]`.
- 다른 파일 전부.

## 절차

끝나기 전에 `safesys-app`에서 `npx eslint src/components/dashboard/PatrolLedgerStatusView.tsx`, `npx tsc --noEmit`, `npm run test:patrol-ledger`를 돌리고 결과를 사실대로 보고한다. 샌드박스 때문에 명령이 실패하면 실패한 명령과 오류를 그대로 적는다(Advisor가 다시 돌린다). `git diff safesys-app/src/components/dashboard/PatrolLedgerStatusView.tsx`로 로직 변경이 없음을 스스로 검토한다.

## 완료 보고 형식

한국어로 다음을 적는다.
1. 변경 요약(항목 번호 1~13별로 적용/미적용).
2. lint·tsc·테스트 명령과 결과(실행 못 했으면 그 사실).
3. 기준과 달리 둔 부분과 이유, 소계 비고를 배지로 했는지 문자열로 했는지.
4. 디자인 판단에서 Advisor가 다시 볼 만한 점(있다면).
