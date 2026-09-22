# Codex Worker 브리프 — 순회점검 점검사항에 TBM 대책 이행 여부 3행 추가

너는 SafeSys(Next.js 15 · React 19 · Supabase · Tailwind v4) 저장소의 구현 Worker다. 저장소 루트는 이 파일이 있는 리포지토리이고, 모든 npm 명령은 `safesys-app/`에서 실행한다. 먼저 `CLAUDE.md`, `.claude/rules/safesys/design-system.md`, `plans/20260922_순회점검_TBM대책행.md`, `plans/20260922_순회점검_TBM대책행/context-notes.md`를 읽어라. 한국어로 보고하고 문장을 콜론으로 끝내지 마라. 요청과 무관한 코드는 손대지 않는다. `dark:` 금지. `npm run build` 금지. git commit·push 금지. 새 소스 파일 첫 줄에는 한국어 역할 주석 한 줄.

## 배경

순회점검 작성 화면(`PatrolLedgerForm.tsx`)의 점검사항은 AI가 만든 10건(작업장 공통 5 + 테마 5)만 들어간다. 사용자는 여기에 3행을 더해 **당일 TBM(없으면 가장 최근 TBM) 1건의 대책 1~3(`tbm_submissions.solution_1~3`) 이행 여부**를 점검항목으로 넣길 원한다. 총 13행이며, HWPX 양식 `safesys-app/public/순회점검 양식.hwpx`는 **이미 17행(항목 13행, 사진 행 16)으로 바뀌어 있다**(Advisor가 변환·한글 검증 완료). 양식 파일과 `scripts/patrol-ledger-template-add-rows.mjs`는 건드리지 않는다.

## 대상 파일 (이 파일들만 수정·추가)

1. `safesys-app/src/lib/patrol-ledger/types.ts`
2. `safesys-app/src/lib/patrol-ledger/tbm-work.ts`
3. `safesys-app/src/lib/patrol-ledger/records.ts`
4. `safesys-app/src/components/project/patrol-ledger/PatrolLedgerForm.tsx`
5. `safesys-app/src/components/project/patrol-ledger/PatrolLedgerDetail.tsx`
6. `safesys-app/src/lib/hwpx/patrol-ledger-hwpx-export.ts`
7. `database/20260922-1100_순회점검_TBM대책행.sql` (신규)
8. `safesys-app/tests/fixtures/patrol-ledger-db.mjs`, `safesys-app/tests/patrol-ledger-records.test.mjs`, `safesys-app/tests/patrol-ledger-sql.test.mjs`, `safesys-app/tests/patrol-ledger-hwpx.test.mjs`
9. `docs/database.md` (한 줄)

`src/app/api/ai/patrol-ledger/route.ts`와 `tests/patrol-ledger-route.test.mjs`는 **바꾸지 않는다** — AI는 계속 정확히 10건을 만든다.

## 구현 명세

### 1. types.ts

- `PATROL_LEDGER_AI_ITEM_COUNT = 10` (AI 생성 건수, 앞 10행), `PATROL_LEDGER_TBM_SOLUTION_COUNT = 3`, `PATROL_LEDGER_ITEM_COUNT = 13` (양식 총 행). 기존 `PATROL_LEDGER_ITEM_COUNT` 참조는 라우트 응답 주석(`PatrolLedgerAiResponse.items`)뿐이니 그 주석은 `PATROL_LEDGER_AI_ITEM_COUNT`로 바꾼다.
- `PATROL_LEDGER_CATEGORIES = ['작업장 공통', '테마', 'TBM 대책'] as const`.
- 상수·`PatrolLedgerItem.no` 주석을 13행 기준으로 갱신한다(양식 표는 13행, 앞 10행 AI, 뒤 3행 TBM 대책).

### 2. tbm-work.ts

기존 `summarizeTbmWork`·`loadTbmWorkForDate`는 그대로 두고 아래를 추가한다.

```ts
export interface TbmSolutionRow { meeting_date?: string | null; created_at?: string | null; solution_1?: string | null; solution_2?: string | null; solution_3?: string | null }
/** 가장 최근 제출 1건의 대책 1~3을 공백 정리·빈 값 제외·중복 제거해 최대 3건 돌려준다. 행이 없으면 빈 배열. */
export function pickTbmSolutions(rows: TbmSolutionRow[]): { solutions: string[]; meetingDate: string | null }
/** 당일(없으면 그 이전) 가장 최근 제출 TBM 1건의 대책을 사용자 권한으로 조회한다. */
export async function loadTbmSolutionsForDate(client: SupabaseClient, project: TbmWorkProject, date: string): Promise<{ solutions: string[]; meetingDate: string | null }>
/** 대책 문구를 순회점검 항목으로 바꾼다 — category 'TBM 대책', text `${대책} 이행 여부`. */
export function tbmSolutionItems(solutions: string[]): PatrolLedgerAiItem[]
```

- `pickTbmSolutions`는 `meeting_date` 내림차순, 같으면 `created_at` 내림차순으로 정렬한 첫 행만 쓴다. `meetingDate`는 그 행 `meeting_date`의 앞 10자(YYYY-MM-DD).
- `loadTbmSolutionsForDate`는 `loadTbmWorkForDate`와 같은 두 갈래 필터(project_id / project_name+headquarters+branch)를 쓰되 `gte`는 걸지 않고 `.lte('meeting_date', `${date}T23:59:59`).order('meeting_date', { ascending: false }).order('created_at', { ascending: false }).limit(1)`로 갈래당 1건씩 받아 `pickTbmSolutions`에 합쳐 넘긴다. select는 `id, meeting_date, created_at, solution_1, solution_2, solution_3`, `status = 'submitted'`. 오류면 `throw new Error('TBM 대책을 불러오지 못했습니다.')`.
- 기존 `clean` 헬퍼를 재사용한다.

### 3. records.ts

- `validatePatrolLedgerDraft` — 건수 상한을 `PATROL_LEDGER_ITEM_COUNT`로, 문구 `점검항목은 1~13건이어야 합니다.` `no` 상한도 13. 분류 검사는 하드코딩 배열 대신 `PATROL_LEDGER_CATEGORIES`를 쓴다.

### 4. PatrolLedgerForm.tsx

- state `solutions` (`{ solutions: string[]; meetingDate: string | null }`, 초기 `{ solutions: [], meetingDate: null }`). 날짜 effect 안에서 `loadTbmWorkForDate`와 `loadTbmSolutionsForDate`를 `Promise.all`로 함께 부른다. 대책 조회 실패는 작업내용 오류와 같은 `tbmError` 경로로 처리하지 말고 조용히 빈 배열로 둔다(`console.error` 한 줄). 로딩 플래그는 기존 `loadingTbm` 하나로 유지한다.
- `generate` 성공 시 `items: buildPatrolLedgerItems([...result.items!, ...tbmSolutionItems(solutions.solutions)])`.
- 작업내용 카드의 `<p className="text-xs text-gray-500">테마 항목 5건은 …</p>` 문구를 `테마 항목 5건은 주요 테마와 당일 작업내용을 결합해 만들고, 뒤 3건은 당일(없으면 최근) TBM의 대책 1~3 이행 여부로 채웁니다.`로 바꾼다. 그 아래에 로딩이 끝났을 때만 `<p className="text-xs text-gray-500">`로 `TBM 대책 {n}건 · {meetingDate} TBM` 또는 대책이 없으면 `제출된 TBM 대책이 없어 항목 11~13은 만들지 않습니다.`를 보여준다. 디자인 시스템 클래스 외 새 클래스 금지.
- 점검사항 목록 렌더는 그대로(13건도 같은 li로 그려진다).

### 5. PatrolLedgerDetail.tsx

- `Array.from({ length: 10 })` → `PATROL_LEDGER_ITEM_COUNT` import해서 사용.

### 6. patrol-ledger-hwpx-export.ts

- 항목 루프 상한 `PATROL_LEDGER_ITEM_COUNT`(행 3~15). 사진 셀 키 `'13,1'` → `'16,1'`, 지적사항 `'13,3'` → `'16,3'`. 서명 좌표 계산은 손대지 않는다(표 높이 56291 불변).

### 7. SQL — `database/20260922-1100_순회점검_TBM대책행.sql`

`database/20260921-1000_순회점검_해당없음.sql`을 본떠 `patrol_ledger_items_valid`를 `CREATE OR REPLACE`로 교체한다. 배열 길이·`no` 범위 `BETWEEN 1 AND 13`, category `IN ('작업장 공통', '테마', 'TBM 대책')`. 첫 줄 주석은 목적을 적고, 마지막에 `COMMENT ON COLUMN public.patrol_ledger_inspections.items IS '점검항목 1~13건. 번호·분류(작업장 공통/테마/TBM 대책)·본문·결과(양호/미흡/해당없음/미점검 빈 문자열).';`. BEGIN/COMMIT 감싼다.

### 8. 테스트

- 픽스처 `patrol-ledger-db.mjs`: `TBM_SOLUTION_PATH` 상수를 추가하고 `createDb`에서 `RESULT_NA_PATH` 다음에 exec.
- `patrol-ledger-sql.test.mjs` 'items CHECK' 테스트: `Array(11).fill` → `Array(14).fill`, `{ no: 11 }` → `{ no: 14 }`. 13건 배열과 `{ ...ITEMS[0], category: 'TBM 대책' }`이 통과하는 단언을 추가한다.
- `patrol-ledger-records.test.mjs`: (a) `pickTbmSolutions` — 최신 행 선택(meeting_date, created_at 정렬), 공백·빈 값·중복 제거, 빈 배열; (b) `tbmSolutionItems` — category와 `이행 여부` 접미; (c) `loadTbmSolutionsForDate` — 기존 `loadTbmWorkForDate` 테스트의 체인 mock을 본떠 `order`·`limit`·`lte`가 불리고 `gte`는 불리지 않음을 확인; (d) 검증 — 13건 통과, 14건 거부, `'TBM 대책'` 분류 통과.
- `patrol-ledger-hwpx.test.mjs`: record.items를 13건(`i < 5` 공통, `i < 10` 테마, 나머지 TBM 대책)으로, 루프 10→13, 셀 주소 13→16(사진·지적사항·`filled` 목록의 `[0,13,3]`), 빈 행 루프 `r=4..12` → `r=4..15`. 테스트 제목의 '10행'은 '13행'으로.

### 9. docs/database.md

`patrol_ledger_inspections` 항목의 `항목 1~10건` → `항목 1~13건(앞 10건 AI, 뒤 3건 TBM 대책 이행 여부)`, 적용 순서 끝에 `→ database/20260921-1000_순회점검_해당없음.sql → database/20260922-1100_순회점검_TBM대책행.sql`을 잇는다(20260921 항목이 이미 없으면 함께 추가).

## 손대지 말 것

- AI 라우트·라우트 테스트·양식 hwpx·변환 스크립트·`status-aggregate.ts`·`themes.ts`.
- 폼의 서명·사진·저장 흐름, `edit` 헬퍼, 기존 클래스 문자열.

## 절차

끝나기 전에 `safesys-app`에서 `npm run lint`, `npx tsc --noEmit`, `npm run test:patrol-ledger`를 돌리고 결과를 사실대로 보고한다. 샌드박스 때문에 실패하면 실패한 명령과 오류를 그대로 적는다. `git status`로 대상 파일 외 변경이 없음을 스스로 확인한다.

## 완료 보고 형식

한국어로 다음을 적는다.
1. 변경 요약(명세 1~9별로 적용/미적용).
2. lint·tsc·테스트 명령과 결과(실행 못 했으면 그 사실).
3. 명세와 달리 둔 부분과 이유.
4. Advisor가 다시 볼 만한 점.
