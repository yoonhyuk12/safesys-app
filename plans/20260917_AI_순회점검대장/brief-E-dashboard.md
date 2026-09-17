# Worker E 브리프 — 안전현황 대시보드 "공사감독 순회점검" 카드·현황 뷰·금주 점검 테마

너는 SafeSys(Next.js 15 · React 19 · Supabase) 저장소의 구현 Worker다. 저장소 루트는 이 파일이 있는 리포지토리이고, 모든 npm 명령은 `safesys-app/`에서 실행한다. 먼저 `CLAUDE.md`, `.claude/rules/safesys/design-system.md`, `docs/design-system.md`, `plans/20260917_AI_순회점검대장.md`, 같은 폴더의 `context-notes.md`를 읽어라. 한국어로 보고하고 문장을 콜론으로 끝내지 마라. 새 소스 파일 첫 줄에는 파일 역할을 밝히는 한국어 한 줄 주석을 단다. UI는 새로 디자인하지 말고 기존 카드·표 클래스를 복사해 쓴다. `dark:` 금지. 요청과 무관한 코드는 손대지 않는다. `npm run build` 금지. git commit·push 금지.

## 이미 있는 것 (읽기 전용)

- `safesys-app/src/lib/patrol-ledger/types.ts`, `themes.ts`(`patrolLedgerWeekStart`, `canEditPatrolLedgerTheme`, `getPatrolLedgerWeeklyTheme`, `savePatrolLedgerWeeklyTheme`, `PATROL_LEDGER_THEME_MAX`), `records.ts`.
- 테이블 `patrol_ledger_inspections`(현장 조회 RLS를 따르므로 사용자에게 보이는 현장의 기록만 읽힌다. 컬럼 `id, project_id, inspection_date, inspector_name, items(JSONB: {no, category, text, result}), finding_text, finding_photo_url, finding_photo_kind, theme`), `patrol_ledger_weekly_themes`.
- `seoulToday()`는 `src/lib/patrol-inspection-utils.ts`에 있다.

## 산출물

### 1. 카드 + 라우트 (`safesys-app/src/components/Dashboard.tsx`, `src/app/safe/**`)

- 카드 키는 `'patrol-ledger'`. `Dashboard.tsx` 539행·551행 부근의 카드 허용 목록 두 곳에 `'patrol-ledger'`를 추가한다.
- 4230행 부근 "신규지구 안전컨설팅 카드" 바로 뒤에 같은 마크업으로 "공사감독 순회점검" 카드를 추가한다. 아이콘은 lucide `ClipboardList`(`h-4 w-4`), 색은 다른 카드처럼 `bg-blue-100`/`text-blue-600`, 본문은 `현황` / `확인하기`. 클릭은 `selectedSafetyBranch`가 있으면 `/safe/branch/${encodeURIComponent(selectedSafetyBranch)}/patrol-ledger`, 없으면 `/safe/patrol-ledger`.
- 3753행 부근 `selectedSafetyCard === 'new-district-consulting'` 블록 바로 뒤에 같은 형태로 `selectedSafetyCard === 'patrol-ledger'`일 때 `<PatrolLedgerStatusView initialHq initialBranch onBack />`를 렌더한다(onBack 로직은 그대로 복사).
- 라우트 페이지 `src/app/safe/patrol-ledger/page.tsx`, `src/app/safe/branch/[branch]/patrol-ledger/page.tsx`는 `src/app/safe/patrol/page.tsx`, `src/app/safe/branch/[branch]/patrol/page.tsx`를 복사해 이름·주석만 바꾼다.

### 2. 뷰 `safesys-app/src/components/dashboard/PatrolLedgerStatusView.tsx`

`NewDistrictConsultingView.tsx`의 골격(props `initialHq`·`initialBranch`·`onBack`, `useAuth`, `getProjectsByUserBranch`로 관할 현장 목록, 뒤로가기 헤더)을 따른다. 800줄을 넘기면 표 컴포넌트를 `PatrolLedgerStatusTables.tsx`로 나눈다.

**맨 위 — 금주 점검 테마 카드.**
- `patrolLedgerWeekStart(seoulToday())`로 이번 주 월요일을 구해 `getPatrolLedgerWeeklyTheme`으로 읽는다. 제목 `금주 점검 테마 (M/D ~ M/D)`.
- `canEditPatrolLedgerTheme(userProfile)`이 참(본부급 발주청)이면 입력칸(`maxLength={PATROL_LEDGER_THEME_MAX}`, 디자인 시스템 입력 클래스)과 `저장` 주 버튼을 보여 주고 `savePatrolLedgerWeeklyTheme(weekStart, value, user.id)`로 저장한다. 저장 중 비활성, 성공·실패 메시지 표시.
- 아니면 읽기 전용 텍스트. 테마가 없으면 `아직 등록되지 않았습니다.`를 회색으로.

**기간.** 선택한 주(월~일). 기본 금주. `◀ 이전 주` `다음 주 ▶` 버튼과 `M/D ~ M/D` 표시. 주를 바꾸면 그 주의 테마도 같이 다시 읽는다(제목은 `선택 주 점검 테마`로 바뀌어도 되고, 편집은 금주만 허용해도 된다 — 판단해서 보고).

**표 3단.** `ManagerInspectionStatus.tsx`의 본부→지사→프로젝트 단계 규칙을 따른다.
- 본사급 사용자(관할 전사)는 **본부별 표**부터. 열은 `본부 | 현장 수 | 점검 건수 | 미흡 항목 수 | 지적사진 건수 | 미점검 현장 수`. 행 클릭 → 그 본부의 지사별 표.
- 본부 사용자(또는 본부 행 선택)는 **지사별 표**. 같은 열에 `지사`. 행 클릭 → 프로젝트별 표.
- 지사 사용자(또는 지사 행 선택, `initialBranch`)는 **프로젝트별 표**. 열은 `사업명 | 점검 건수 | 미흡 항목 수 | 사진 | 마지막 점검일 | 점검자 | 주요 테마`. 점검이 없는 현장도 0건으로 보이게 한다(기간 내 공사중 현장 = `getProjectsByUserBranch` 결과, 다른 뷰의 활성 판정이 있으면 따른다).
- 상위 표로 돌아가는 버튼을 둔다. 합계 행을 표 하단에 둔다.
- 데이터는 관할 현장 id 목록으로 `patrol_ledger_inspections`를 `inspection_date` 범위(선택 주)로 한 번에 읽어 메모리에서 집계한다(`.in('project_id', ids)`는 100건씩 나눠 호출). 미흡 항목 수 = `items`에서 `result === '미흡'`인 항목 수 합계, 지적사진 건수 = `finding_photo_kind === 'finding' && finding_photo_url` 인 기록 수.
- 표 클래스는 `docs/design-system.md` 5절과 `ManagerInspectionStatus.tsx`를 복사한다. 로딩은 `LoadingSpinner`, 오류는 흰 카드 안 `text-red-800`.

## 절차

끝나기 전에 `safesys-app`에서 `npx eslint <변경 파일>`, `npx tsc --noEmit`을 돌리고 결과를 사실대로 보고한다. 집계 순수 함수(주 범위 계산, 본부·지사·프로젝트 집계)는 `src/lib/patrol-ledger/status-aggregate.ts`로 빼고 `tests/patrol-ledger-status.test.mjs`에 node 테스트를 쓴다(`tests/patrol-inspection-route.test.mjs`의 `transpile` 로더). `package.json`은 건드리지 마라(다른 Worker가 같은 스크립트를 편집 중). 테스트 파일 경로만 보고에 적어라.

같은 시각에 다른 Worker가 `src/app/api/ai/patrol-ledger/route.ts`, `tests/patrol-ledger-*.test.mjs`(status 제외), `docs/database.md`, `src/components/project/patrol-ledger/*`를 만지고 있다 — 그 파일들은 건드리지 않는다.

## 완료 보고

`worker_done`에 변경 파일, lint·tsc·테스트 결과, 기간·단계 규칙에서 내린 판단을 담는다.
