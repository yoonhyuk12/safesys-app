# Worker C 브리프 — 순회점검대장 화면 + 캐비닛 폴더

너는 SafeSys(Next.js 15 · React 19 · Supabase) 저장소의 구현 Worker다. 저장소 루트는 이 파일이 있는 리포지토리이고, 모든 npm 명령은 `safesys-app/`에서 실행한다. 먼저 `CLAUDE.md`, `.claude/rules/safesys/design-system.md`, `docs/design-system.md`, `plans/20260917_AI_순회점검대장.md`, 같은 폴더의 `context-notes.md`를 읽어라. 한국어로 보고하고 문장을 콜론으로 끝내지 마라. 새 소스 파일 첫 줄에는 파일 역할을 밝히는 한국어 한 줄 주석을 단다. 요청과 무관한 코드는 손대지 않는다. UI는 새로 디자인하지 말고 design-system 문서의 클래스를 복사해 쓴다. `dark:` 금지. `npm run build` 금지. git commit·push 금지.

## 이미 있는 것 (읽기 전용 — 고치지 말고 import만 해라)

- 공용 타입 `safesys-app/src/lib/patrol-ledger/types.ts`.
- 데이터 모듈 `safesys-app/src/lib/patrol-ledger/records.ts` — `PatrolLedgerDraft`, `createPatrolLedgerDraft`, `buildPatrolLedgerItems`, `setPatrolLedgerItemResult`, `setPatrolLedgerItemText`, `setAllPatrolLedgerResults`, `validatePatrolLedgerDraft`, `patrolLedgerToDraft`, `getPatrolLedgerInspections`, `countPatrolLedgerInspections`, `createPatrolLedgerInspection`, `updatePatrolLedgerInspection`, `deletePatrolLedgerInspection`, `uploadPatrolLedgerPhoto`, `patrolLedgerToday`.
- TBM 조회 `safesys-app/src/lib/patrol-ledger/tbm-work.ts` — `loadTbmWorkForDate(supabase, project, date)`.
- AI 라우트 `POST /api/ai/patrol-ledger` — 본문 `PatrolLedgerAiRequest`, 응답 `PatrolLedgerAiResponse`, `Authorization: Bearer <access_token>` 필수(`supabase.auth.getSession()`의 토큰).
- HWPX `safesys-app/src/lib/hwpx/patrol-ledger-hwpx-export.ts` — `downloadPatrolLedgerHwpx(record, { projectName })`.
- 실제 시그니처는 파일을 열어 확인하고 그대로 쓴다.

## 산출물

### 1. 페이지 `safesys-app/src/app/project/[id]/patrol-ledger/page.tsx`

`safesys-app/src/app/project/[id]/equipment-inspection/page.tsx`의 골격(세션 가드, 프로젝트 로드, 목록/폼/상세 전환, 저장·삭제·다운로드 상태)을 그대로 따른다. 페이지가 커지면 컴포넌트를 `safesys-app/src/components/project/patrol-ledger/` 아래로 나눈다(200~400줄 권장).

- 상단. 뒤로가기(프로젝트 메인, `sessionStorage.setItem(\`project_${projectId}_from_subpage\`, 'true')` 패턴), 제목 `(AI) 순회점검대장`, 사업명, `새 점검` 버튼.
- 목록 `PatrolLedgerList`. 점검일 desc. 한 줄에 점검일·점검자·미흡 건수·지적사항 유무. 클릭 시 상세.
- 상세 `PatrolLedgerDetail`. 양식과 같은 순서로 표시(제목, 10행 표, 지적사진·지적사항, 점검일자·지구명·점검자·서명 이미지). 버튼 `HWPX 다운로드`, `수정`(작성자 본인만), `삭제`(확인창은 `window.confirm` 대신 앱 공통 모달이 있으면 그것 — `src/components/ui`에서 찾아라).
- 폼 `PatrolLedgerForm`. 양식 순서대로.
  1. 점검일자(date input, 기본 오늘). 날짜가 바뀔 때마다 `loadTbmWorkForDate`로 그날 TBM 작업내용을 읽어 읽기 전용 요약을 보여 준다(`○건의 TBM`). 없으면 안내와 함께 작업내용 직접 입력 textarea를 연다. 사용자가 요약을 고치고 싶으면 `직접 수정` 토글로 textarea 편집 가능.
  2. `AI 점검항목 생성` 버튼 → `/api/ai/patrol-ledger` 호출(직접 입력·수정한 경우 `workDescription` 전송). 로딩 중 버튼 비활성·스피너. 성공 시 `buildPatrolLedgerItems`로 10행 채움, `workSummary`를 `tbm_work_summary`에 보관. 실패 시 서버 메시지를 그대로 보여 준다.
  3. 점검사항 표. No / (카테고리) 본문(편집 가능 input) / 결과(`양호`·`미흡` 토글 버튼, 다시 누르면 해제). `전체 양호` 일괄 버튼.
  4. 지적사진(1장, `uploadPatrolLedgerPhoto`, 미리보기·삭제), 지적사항 textarea.
  5. 시공사명(기본 `project.contractor`류 필드가 있으면 그것 — `src/lib/projects.ts`의 `Project` 타입에서 시공사명 필드를 찾아라, 없으면 빈 값), 지구명(기본 사업명), 점검자 소속(기본 사용자 프로필의 지사/조직, 없으면 빈 값), 직급, 성명(기본 `userProfile.full_name`).
  6. 서명 캔버스. `EquipmentInspectionForm`이 쓰는 서명 캔버스 방식을 그대로 재사용. 내용이 바뀌면 기존 서명을 무효화하고 다시 받는다(장비 대장과 같은 규칙).
  7. `저장`. `validatePatrolLedgerDraft` 오류를 먼저 보여 주고, 통과하면 create/update.
- 상태 갱신은 불변 패턴(새 객체·새 배열)으로만 한다.

### 2. 캐비닛 폴더 `safesys-app/src/app/project/[id]/page.tsx`

발주청 캐비닛의 `C (점검)` 그룹(1757행 부근, `︵AI︶\n공사감독 일지` 폴더가 있는 그룹 — 안전 캐비닛의 C 그룹이 아니다)에서 `︵AI︶ 공사감독 일지` 바로 뒤에 폴더를 추가한다.

```tsx
<DocumentFolder
  title="︵AI︶
순회점검대장"
  year={new Date().getFullYear().toString()}
  isActive={false}
  projectId={projectId}
  onClick={() => router.push(`/project/${projectId}/patrol-ledger`)}
  docCount={patrolLedgerCount ?? undefined}
  pdcaCategory="C"
  bottomLabel="감독"
/>
```

`patrolLedgerCount`는 `legalComplianceCount`와 같은 방식(useState + 기존 건수 로딩 함수 안에서 `countPatrolLedgerInspections(projectId)`)으로 채운다. 그 파일의 다른 줄은 손대지 않는다.

### 3. 문서

`docs/architecture.md`의 라우트 목록(78행 부근)에 `patrol-ledger`, API 목록에 `/api/ai/patrol-ledger — (AI) 순회점검대장 점검항목 생성 (Bearer 인증·프로젝트 RLS, gpt-5.6-luna 고정)` 한 줄씩 추가한다.

## 절차

끝나기 전에 `safesys-app`에서 `npx eslint <변경 파일>`, `npx tsc --noEmit`을 돌리고 결과를 사실대로 보고한다. 브라우저 확인은 Advisor가 한다. 화면 검증용으로 필요한 최소한의 순수 함수 테스트가 있으면 `tests/patrol-ledger-ui.test.mjs`에 추가하고 `package.json`의 `test:patrol-ledger` 목록 끝에 붙인다.

## 완료 보고

`worker_done`에 변경 파일, lint·tsc 결과, 기본값을 정한 근거(시공사명·소속 필드), 판단이 필요했던 지점을 담는다.
