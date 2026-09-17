# Worker F 브리프 — 순회점검 작성 폼의 "주요 테마" 칸과 AI 반영

너는 SafeSys(Next.js 15 · React 19 · Supabase) 저장소의 구현 Worker다. 저장소 루트는 이 파일이 있는 리포지토리이고, 모든 npm 명령은 `safesys-app/`에서 실행한다. 먼저 `CLAUDE.md`, `.claude/rules/safesys/design-system.md`, `plans/20260917_AI_순회점검대장.md`, 같은 폴더의 `context-notes.md`를 읽어라. 한국어로 보고하고 문장을 콜론으로 끝내지 마라. 요청과 무관한 코드는 손대지 않는다. `dark:` 금지. `npm run build` 금지. git commit·push 금지.

## 이미 있는 것 (읽기 전용)

- `safesys-app/src/lib/patrol-ledger/types.ts` — `PatrolLedgerAiRequest.theme?`, `PATROL_LEDGER_THEME_MAX`, `PatrolLedgerInspection.theme`.
- `safesys-app/src/lib/patrol-ledger/themes.ts` — `patrolLedgerWeekStart(date)`, `getPatrolLedgerWeeklyTheme(weekStart)`.
- `safesys-app/src/lib/patrol-ledger/records.ts` — `PatrolLedgerDraft.theme`(기본 ''), 저장 시 그대로 DB `theme` 컬럼에 들어간다.
- AI 라우트는 다른 Worker가 `theme`를 받도록 고치는 중이다. 계약은 "본문에 `theme`(한 줄, 200자 이하)를 넣으면 테마 5건이 그 테마에 맞춰진다"이다.

## 산출물

### 1. 폼 `safesys-app/src/components/project/patrol-ledger/PatrolLedgerForm.tsx`

- `AI 점검항목 생성` 버튼이 있는 줄을 `flex flex-wrap items-end gap-2`로 바꾸고, 버튼 **왼쪽**에 `주요 테마` 입력칸을 둔다(`label` 텍스트 `주요 테마`, `input maxLength={PATROL_LEDGER_THEME_MAX}`, placeholder `금주 점검 테마가 자동으로 채워집니다`, 디자인 시스템 입력 클래스, 모바일에서는 입력칸이 한 줄을 다 쓰고 버튼이 아래로 내려가게 `min-w-0 flex-1 basis-64`). 값은 `draft.theme`, 변경은 `edit({ theme })`.
- 금주 테마 자동 채움. 폼이 열릴 때와 `draft.inspection_date`가 바뀔 때 `getPatrolLedgerWeeklyTheme(patrolLedgerWeekStart(draft.inspection_date))`를 읽어, **테마 칸이 비어 있을 때만** 채운다(사용자가 쓴 값이나 수정 중인 기록의 저장된 값은 덮지 않는다). 조회 실패는 조용히 무시하되 콘솔에 `console.error`로 남긴다. 컴포넌트 언마운트 후 setState 금지(기존 `active`/`alive` 패턴).
- AI 호출 본문에 `theme: draft.theme.trim()`을 비어 있지 않을 때만 넣는다.
- 안내 문구 한 줄(`text-xs text-gray-500`) — `테마 항목 5건은 주요 테마와 당일 작업내용을 결합해 만듭니다.`

### 2. 상세 `safesys-app/src/components/project/patrol-ledger/PatrolLedgerDetail.tsx`

기본정보 `dl`에 `주요 테마` 항목을 추가한다(값 없으면 `—`).

### 3. 목록 `safesys-app/src/components/project/patrol-ledger/PatrolLedgerList.tsx`

`지적사항` 열 앞에 `주요 테마` 열을 추가한다(`truncate max-w-[12rem]`, 없으면 `—`). 모바일 폭에서 넘치지 않게 기존 `overflow-x-auto`를 유지한다.

## 절차

끝나기 전에 `safesys-app`에서 `npx eslint <변경 파일>`, `npx tsc --noEmit`을 돌리고 결과를 사실대로 보고한다. 같은 시각에 다른 Worker가 `src/app/api/ai/patrol-ledger/route.ts`, `tests/*`, `package.json`, `src/components/Dashboard.tsx`, `src/components/dashboard/*`를 만지고 있다 — 그 파일들은 건드리지 않는다.

## 완료 보고

`worker_done`에 변경 파일, lint·tsc 결과, 판단이 필요했던 지점을 담는다.
