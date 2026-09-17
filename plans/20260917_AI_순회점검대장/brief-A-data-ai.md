# Worker A 브리프 — 순회점검대장 데이터 계층 + AI 라우트

너는 SafeSys(Next.js 15 · React 19 · Supabase) 저장소의 구현 Worker다. 저장소 루트는 이 파일이 있는 리포지토리이고, 모든 npm 명령은 `safesys-app/`에서 실행한다. 먼저 `CLAUDE.md`, `plans/20260917_AI_순회점검대장.md`, 같은 폴더의 `context-notes.md`를 읽어라. 한국어로 보고하고 문장을 콜론으로 끝내지 마라. 새 소스 파일 첫 줄에는 파일 역할을 밝히는 한국어 한 줄 주석을 단다. 요청과 무관한 코드는 손대지 않는다. `npm run build`는 절대 실행하지 않는다. git commit·push 금지.

## 목표

`(AI) 순회점검대장` 기능의 DB 마이그레이션, 클라이언트 데이터 모듈, TBM 작업내용 조회 모듈, AI 점검항목 생성 라우트를 TDD로 만든다. 공용 계약은 이미 있는 `safesys-app/src/lib/patrol-ledger/types.ts`다. 이 파일은 읽기 전용이다 — 부족하면 바꾸지 말고 `ask`로 물어라.

## 산출물 (파일 경로 고정)

### 1. `database/20260917-1700_순회점검대장.sql`

장비 일일점검 대장 마이그레이션 두 개(`database/20260914-2245_장비_일일점검_대장.sql`, `database/20260915-0448_장비_일일점검_작성자_수정_정책.sql`)를 본떠 **한 파일**에 담는다.

- 테이블 `public.patrol_ledger_inspections`. 컬럼은 `types.ts`의 `PatrolLedgerInspection`과 이름·의미가 같다. `id UUID PK`, `project_id UUID NOT NULL REFERENCES projects ON DELETE CASCADE`, `inspection_date DATE NOT NULL`, `contractor_name TEXT NOT NULL DEFAULT ''`, `district_name TEXT NOT NULL DEFAULT ''`, `inspector_affiliation TEXT NOT NULL DEFAULT ''`, `inspector_position TEXT NOT NULL DEFAULT ''`, `inspector_name TEXT NOT NULL`(장비 대장과 같은 한 줄·100자 CHECK), `signature TEXT NOT NULL`(장비 대장과 같은 PNG dataURL CHECK), `tbm_work_summary TEXT NOT NULL DEFAULT ''`, `items JSONB NOT NULL CHECK (public.patrol_ledger_items_valid(items))`, `finding_text TEXT NOT NULL DEFAULT ''`, `finding_photo_url TEXT NULL`, `created_by UUID REFERENCES auth.users ON DELETE SET NULL`, `created_at`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`.
- 함수 `public.patrol_ledger_items_valid(JSONB)`. 배열이고 길이 1~10, 각 원소에 `no`(정수 1~10), `category`('작업장 공통' | '테마'), `text`(비어 있지 않은 문자열), `result`('양호' | '미흡' | '')가 있어야 참.
- 인덱스 `(project_id, inspection_date DESC, created_at DESC)`.
- RLS. SELECT는 `EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id)`. INSERT는 `auth.uid() = created_by AND` 같은 EXISTS. UPDATE는 작성자 본인만(USING·WITH CHECK 동일), 그리고 장비 대장 정책 파일처럼 테이블 UPDATE 권한을 회수한 뒤 내용 열(`inspection_date, contractor_name, district_name, inspector_affiliation, inspector_position, inspector_name, signature, tbm_work_summary, items, finding_text, finding_photo_url, updated_at`)만 열 단위로 다시 준다. DELETE는 작성자·현장 소유자(`p.created_by`)·`발주청` 역할.
- 테이블·컬럼 COMMENT를 한국어로 단다. `BEGIN; ... COMMIT;`, 다시 실행해도 안전하게 `DROP POLICY IF EXISTS`.
- `docs/database.md`의 테이블 목록에 한 줄을 추가한다(기존 줄 형식 그대로).

### 2. `safesys-app/src/lib/patrol-ledger/records.ts`

`@/lib/supabase`의 브라우저 클라이언트를 쓰는 CRUD·검증 모듈. `safesys-app/src/lib/equipment-inspections.ts`의 구조(불변 업데이트, 에러 메시지 상수, 누락 테이블 안내)를 따른다. 반드시 다음 이름으로 export 한다 — Worker C(UI)가 이 시그니처를 그대로 import 한다.

```ts
export interface PatrolLedgerDraft {
  inspection_date: string; contractor_name: string; district_name: string
  inspector_affiliation: string; inspector_position: string; inspector_name: string
  signature: string; tbm_work_summary: string; items: PatrolLedgerItem[]
  finding_text: string; finding_photo_url: string | null
}
export function patrolLedgerToday(now?: Date): string                 // 로컬 YYYY-MM-DD
export function createPatrolLedgerDraft(init: { districtName: string; contractorName: string; inspectorName: string; inspectorAffiliation: string }): PatrolLedgerDraft
export function buildPatrolLedgerItems(aiItems: PatrolLedgerAiItem[]): PatrolLedgerItem[]   // no 1..10 부여, result ''
export function setPatrolLedgerItemResult(items, index, result): PatrolLedgerItem[]        // 새 배열 반환
export function setPatrolLedgerItemText(items, index, text): PatrolLedgerItem[]
export function setAllPatrolLedgerResults(items, result): PatrolLedgerItem[]
export function isBlankPatrolLedgerSignature(value: unknown): boolean
export function validatePatrolLedgerDraft(draft: PatrolLedgerDraft): string | null          // 첫 오류 메시지(한국어) 또는 null
export function patrolLedgerToDraft(record: PatrolLedgerInspection): PatrolLedgerDraft
export async function getPatrolLedgerInspections(projectId: string): Promise<PatrolLedgerInspection[]>   // 날짜 desc, created_at desc
export async function countPatrolLedgerInspections(projectId: string): Promise<number>
export async function createPatrolLedgerInspection(projectId: string, userId: string, draft: PatrolLedgerDraft): Promise<PatrolLedgerInspection>
export async function updatePatrolLedgerInspection(id: string, draft: PatrolLedgerDraft): Promise<PatrolLedgerInspection>
export async function deletePatrolLedgerInspection(id: string): Promise<void>
export async function uploadPatrolLedgerPhoto(projectId: string, file: File): Promise<string>  // 버킷 safety-inspection-photos, 경로 patrol-ledger/{projectId}/{Date.now()}_{안전한파일명}, 공개 URL 반환
```

검증 규칙. 날짜 형식, 점검자 성명 필수·100자·줄바꿈 금지, 서명 필수, 항목 1~10건·본문 비어 있지 않음, 지적사항은 선택. `items`는 DB에 JSONB로 그대로 저장한다.

### 3. `safesys-app/src/lib/patrol-ledger/tbm-work.ts`

```ts
export interface TbmWorkRow { construction_company?: string | null; today_work?: string | null; location?: string | null; risk_work_type?: string | null; equipment_input?: string | null; personnel_total_count?: number | null }
export function summarizeTbmWork(rows: TbmWorkRow[]): string   // 순수 함수. 건별 "• [시공사] 작업내용 (장소, 위험공종, 장비, 인원)" 한 줄, 빈 값은 생략, 중복 today_work 제거, today_work 비었거나 '작업없음'이면 제외
export interface TbmWorkProject { id: string; project_name: string | null; managing_hq: string | null; managing_branch: string | null }
export async function loadTbmWorkForDate(client: SupabaseClient, project: TbmWorkProject, date: string): Promise<{ summary: string; count: number }>
```

`loadTbmWorkForDate`는 `src/app/project/[id]/supervisor-diary/page.tsx`의 `loadTbmDates`처럼 두 갈래(`project_id` 일치 / `project_name`+`headquarters`+`branch` 일치)로 `tbm_submissions`를 읽고 `meeting_date`가 그날(`${date}` ~ `${date}T23:59:59`)이며 `status = 'submitted'`인 행을 합쳐(id 중복 제거) 요약한다. 컬럼명은 `src/lib/tbm.ts`의 `TBMRecord`와 실제 조회 코드에서 확인해라 — `headquarters`/`branch` 컬럼명이 다르면 실제 코드를 따른다. `client`는 브라우저 클라이언트든 서버 토큰 클라이언트든 받을 수 있어야 한다(`import type { SupabaseClient } from '@supabase/supabase-js'`).

### 4. `safesys-app/src/app/api/ai/patrol-ledger/route.ts`

`src/app/api/ai/patrol-inspection/route.ts`의 인증·타임아웃·strict json_schema·응답 엄격 검증·`recordAiUsage` 패턴을 그대로 옮긴다. 차이점.

- 모델 고정 `const PATROL_LEDGER_AI_MODEL = 'gpt-5.6-luna'`, `FEATURE_KEY = 'ai.patrol-ledger'`, `reasoning_effort: 'low'`, `max_completion_tokens 6000`, 타임아웃 60초, 사용자당 동시 1건.
- 인증. Bearer 토큰으로 `supabaseAdmin.auth.getUser` 후, 프로젝트·TBM 조회는 **사용자 토큰을 실은 anon 클라이언트**로 한다(`src/app/api/ai/accident-report/route.ts` 87~130행의 `createClient(url, anonKey, { global: { headers: { Authorization } } })` 패턴). 프로젝트가 안 보이면 404. 역할 제한은 두지 않는다(현장을 볼 수 있으면 누구나).
- 본문은 `PatrolLedgerAiRequest`. `projectId` UUID, `inspectionDate` YYYY-MM-DD 검증. `workDescription`이 있으면(공백 제거 후 2000자 이내) TBM 대신 그걸 쓰고 `tbmCount 0`. 없으면 `loadTbmWorkForDate`로 읽고, 결과가 비면 404 `해당 일자에 제출된 TBM 작업내용이 없습니다. 작업내용을 직접 입력해 주세요.`
- 프롬프트. 한국 건설현장 안전관리 실무자 역할. 입력은 사업명, 점검일, 작업내용 요약. 출력은 정확히 10건 — 앞 5건 `작업장 공통`(당일 작업장에 공통으로 적용되는 조명·통로·정리정돈·바닥·작업공간·출입통제·표지 류), 뒤 5건 `테마`(당일 작업의 공종·장비·위험요인에 특화). 각 항목은 양식 예시처럼 `~은 양호한가`, `~되어 있는가` 꼴의 의문문 한 문장, 20~45자, 줄바꿈 없음, 앞에 `(작업장 공통)` 같은 접두어를 붙이지 않음. 작업내용에 없는 장비·공종을 지어내지 않음. 양식 원본 예시 10건을 프롬프트에 "문체 참고"로 넣어라(`plans/20260917_AI_순회점검대장/context-notes.md`와 `public/순회점검 양식.hwpx`의 Preview/PrvText.txt에 있다).
- json_schema strict. `{ items: [{ category: enum, text: string }] }`. 파싱 후 길이 10, 앞 5건 category 모두 `작업장 공통`, 뒤 5건 모두 `테마`, text 비어 있지 않음이 아니면 502로 실패. `finish_reason !== 'stop'`이면 502.
- 응답 `PatrolLedgerAiResponse` — `{ success: true, items, workSummary, tbmCount }`.

### 5. 테스트 (`node --test`) 와 `package.json` 스크립트

- `safesys-app/tests/patrol-ledger-records.test.mjs` — `records.ts`의 순수 함수(draft 생성, items 빌드, 불변 업데이트, 검증 메시지)와 `summarizeTbmWork`. `tests/patrol-inspection-route.test.mjs`의 `transpile` 로더 방식을 쓴다(`@/lib/supabase` 등은 스텁).
- `safesys-app/tests/patrol-ledger-route.test.mjs` — 라우트. 토큰 없음 401, 잘못된 본문 400, 프로젝트 안 보임 404, TBM 없음+직접입력 없음 404, 정상 경로에서 fetch 스텁이 받은 payload(model 고정·json_schema·프롬프트에 작업내용 포함) 확인, 9건/카테고리 순서 어긋남/finish_reason length 응답은 502.
- `safesys-app/tests/patrol-ledger-sql.test.mjs` + `tests/fixtures/patrol-ledger-db.mjs` — `tests/fixtures/equipment-inspection-db.mjs`와 `tests/equipment-inspection-sql.test.mjs`를 본떠 PGlite로 실제 마이그레이션을 적용해 RLS(조회 관할·작성자 INSERT·작성자만 UPDATE·발주청 DELETE)·items CHECK·서명 CHECK를 검증한다. 기존 `equipment-inspection-schema.sql` 기반 스키마를 재사용할 수 있으면 재사용한다.
- `package.json`에 `"test:patrol-ledger": "node --test tests/patrol-ledger-records.test.mjs tests/patrol-ledger-route.test.mjs tests/patrol-ledger-sql.test.mjs"` 추가.

## 절차

TDD. 테스트를 먼저 써서 실패를 본 뒤 구현한다. 끝나기 전에 `safesys-app`에서 `npm run test:patrol-ledger`, `npx eslint <변경 파일들>`, `npx tsc --noEmit`을 돌리고 결과를 사실대로 보고한다. 같은 시각에 다른 Worker가 `src/lib/hwpx/patrol-ledger-hwpx-export.ts`와 `tests/patrol-ledger-hwpx.test.mjs`를 만들고 있다 — 그 파일들은 건드리지 말고, tsc 오류가 그 파일에서만 나면 보고에 적고 넘어가라.

## 완료 보고

`worker_done`에 변경 파일 목록, 테스트 결과(통과/실패 수), lint·tsc 결과, 판단이 필요했던 지점을 담는다.
