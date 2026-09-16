# 사고보고 독립 코드 리뷰

기준. HEAD `2de063657b9c4a5b2b760bd2347a4243a50f5897` 대비 작업 트리(미추적·스테이징 포함) 최종 상태.

**검증 방법.** 읽기 검토, `npm run test:accident-report`(36 pass / 1 todo / 0 fail), `npx tsc --noEmit`(오류 없음), `npm run lint`(신규 파일 경고 없음), 운영 Supabase `pg_policy`에서 `public.projects` 정책 원문을 읽어 테스트 픽스처와 대조. 편집·커밋·푸시·배포는 하지 않았다.

**결론. 미해결 CRITICAL/HIGH/MEDIUM 없음.** 리뷰 도중 지적한 HIGH 2건과 MEDIUM 4건은 최종 상태에서 모두 닫혔고(아래 "리뷰 중 지적하고 닫힌 항목"), 남은 것은 LOW 관찰 3건이다.

---

## 주요 검증 항목별 결과

### 다른 프로젝트 데이터 노출·수정 — 문제 없음

- `getProjectAccidents`(`safesys-app/src/lib/accident-analysis.ts:527-548`)는 `.eq('project_id', scopedId)` 하나로만 좁히고, 빈 문자열·공백 id는 조회 전에 예외로 막는다. `project_id IS NULL`인 외부 미등록 현장 사고는 구조상 섞일 수 없다.
- RLS 테스트에서 무관한 시공사(`outsider`)와 타 본부 발주청(`otherClient`)은 0건을 본다. 볼 수 없는 현장으로 `project_id`를 옮기는 UPDATE는 `WITH CHECK`가 예외로 거부한다(`tests/project-accidents-sql.test.mjs:161-181`).
- 화면은 `supabase.from('projects')...single()`로 현장을 읽고 실패하면 `project = null`이 되어 등록 진입점이 모두 닫힌다. 접근 권한이 없는 현장 URL을 직접 쳐도 목록은 비고 등록도 불가능하다.

### 기존 RLS 정책 보존 — 문제 없음

`database/20260916-1032_사고보고_현장작성_권한.sql`은 `CREATE POLICY` 네 개만 얹고 스키마·컬럼·트리거·기존 정책을 건드리지 않는다. permissive 정책은 OR로 합쳐지므로 기존 판정이 줄지 않는다. 테스트로 확인한 보존 항목:

- 발주청 관할 조회, 본부급 이상의 타인 보고 수정·삭제(`:247-261`), 본부급 이상의 관할 현장 등록(`:263-271`).
- 외부 미등록 현장 사고 작성은 여전히 본부급 이상 발주청 전용이고 현장 사용자에게 보이지도 않는다(`:273-293`). 지사 발주청의 관할 조회는 기존 정책대로 유지된다.
- 지사 발주청은 관할 현장 등록은 되지만 외부 미등록 현장 작성은 여전히 막힌다(`:295-304`).
- `ON DELETE CASCADE`로 현장 삭제 시 사고도 함께 사라진다(`:306-315`).

정책이 `EXISTS (SELECT 1 FROM public.projects p WHERE p.id = ...)`로 판정을 `projects`의 SELECT RLS에 위임하는 구조가 실제로 동작하는지는 PGlite에서 실제 마이그레이션을 얹어 확인했다. 픽스처의 `projects` 정책 세 개(`프로젝트_조회_통합정책`, `projects_select_shared`, `프로젝트 조회 권한`)와 `anon_can_read_projects_for_registration`은 운영 `pg_policy` 원문과 일치한다.

### 현장 사용자 등록 및 본인 수정·삭제 — 문제 없음

- DB: 그 현장을 볼 수 있으면 등록(`created_by = auth.uid()` 강제), 수정·삭제는 작성자 본인이면서 그 현장을 여전히 볼 수 있을 때. 남의 이름으로 등록 불가, `created_by` 이관 불가, 공유가 철회되면 작성자라도 즉시 차단된다.
- UI: `canCreate = Boolean(sessionUserId && project)`, `canModify(accident) = 본인 작성 || canManageProjectAccidents(userProfile, project)`(`accident-report/page.tsx:97-103`). `canManageProjectAccidents`(`lib/accident-permissions.ts:33-42`)는 전사(관리자급·본사) 또는 `branch_division`이 `본부`로 끝나면서 `project.managing_hq`가 일치할 때만 참이다. 기존 SQL의 `up.branch_division LIKE '%본부' AND p.managing_hq = up.hq_division`과 같은 갈래다.
- 목록은 `accidents.some(canModify)`로 관리 열 자체를 두고, 행별로도 다시 판정해 고칠 수 있는 사고에만 버튼을 붙인다.

### 본부급 기존 관할 권한 — 유지됨

본사·관리자급은 현장과 무관하게, 본부 소속은 자기 본부 관할 현장에서 타인 보고까지 수정·삭제한다. UI 판정과 DB 정책이 같은 조건이라 "버튼은 보이는데 눌러 보면 실패" 또는 그 반대가 생기지 않는다.

### 기존 모달 외부현장 회귀 — 없음

`AccidentEntryModal`은 `fixedProject`가 없으면 기존 그대로 `ProjectSearchSelect`와 미등록 현장 직접입력을 렌더한다(테스트로 고정). 고정 모드에서는 읽기 전용 입력과 안내 문구로 바뀌고, 제출 시 `draft.isExternal || draft.projectId !== fixedProjectId`를 다시 검사해 우회를 막는다. `createDraft` 시그니처가 바뀌었지만 호출자는 모달 내부뿐이다. 대시보드(`AccidentAnalysisView.tsx:1433-1441`)는 손대지 않았다.

### 제출 실패 데이터 보존 — 문제 없음

`modalProjects`를 `useMemo`로 고정해(`accident-report/page.tsx:111`) 부모 리렌더가 모달의 초안 재생성 effect를 깨우지 않는다. 저장 실패 시 모달은 열린 채 `submitError`만 뜨고 입력값은 그대로 남는다.

### 세션 복원 — 문제 없음

`getSession()` + `onAuthStateChange`로 화면이 스스로 세션 확인 완료를 판정하고, 확인이 끝나고 정말 비로그인일 때만 `router.replace('/login')`한다. 확인 실패도 "확인 끝"으로 처리해 무한 로딩에 갇히지 않는다. `equipment-inspection/page.tsx:61-94`의 기존 패턴과 동일하다. 토큰 갱신은 같은 사용자 id를 다시 넣어 React가 렌더를 건너뛰므로 재조회를 유발하지 않는다.

### 조회 실패 — 문제 없음

`getProjectAccidents`는 오류를 빈 배열로 감추지 않고 예외로 올리고, 화면은 목록 자리에 사유와 "다시 시도"를 낸다. 조회가 실패한 동안에도 헤더의 사고 등록 버튼은 남아 보고가 막히지 않는다.

### 삭제 실패 — 문제 없음

`deleteProjectAccident`는 RLS로 0행이 지워지면 `success: false`를 돌려주고, 화면은 그 문구를 확인 모달 **안쪽**에 렌더한다(`accident-report/page.tsx:353-358`). 오버레이에 가려 사용자가 아무 반응도 못 보는 상태가 생기지 않는다.

### 날짜 서울 표시 — 문제 없음

`accident-report-format.ts:35-47`이 `toLocaleDateString`/`toLocaleString`에 `timeZone: 'Asia/Seoul'`을 명시한다. 저장 쪽 `normalizeAccidentAt`이 `+09:00`으로 고정하는 것과 짝이 맞아, KST 밖 브라우저에서도 사고일자가 하루 어긋나지 않는다.

### 대시보드가 같은 테이블을 쓰는가 — 그렇다

안전대시보드는 `project_accidents`를 `project_id` 배치와 기간으로만 조회하고 `created_by` 필터가 없다(`accident-analysis.ts:394-404`). 새 SELECT 정책은 범위를 넓히기만 하므로 기존 집계 결과가 줄지 않는다. 현장이 서류철에서 올린 보고는 그대로 사고현황에 잡힌다.

---

## LOW (남은 관찰, 차단 사유 아님)

1. **중대도 배지 색이 두 화면에서 다르다.** `accident-report-format.ts:18-20`은 사망·중상을 `bg-red-100`, 휴업·경상을 `bg-amber-100` 두 단계로 칠한다. 같은 데이터를 보여주는 `AccidentAnalysisView.tsx:208-215`는 여전히 사망 `bg-gray-900`, 중상 `bg-red-100`, 휴업 `bg-orange-100`, 경상 `bg-yellow-100` 네 단계다. 신규 모듈이 디자인 시스템(red=위험, amber=주의)에 더 맞지만, 사망과 중상이 같은 색이 되고 화면 간 표기가 갈린다. 어느 쪽으로든 한 번에 맞추는 편이 낫다.
2. **`docs/architecture.md:144`의 설명이 함수와 어긋난다.** "본부급 이상 사고 관리 권한 판정(Dashboard 전사 보기 기준과 동일한 순수 함수)"라고 적혀 있으나, `canManageProjectAccidents`는 전사 판정에 더해 본부 소속의 `managing_hq` 관할 대조까지 한다. "타인 보고 수정·삭제 권한 판정"이 정확하다.
3. **서울 시간대 테스트가 실제로는 시간대 변경을 검증하지 못한다.** `tests/project-accident-report.test.mjs:267-280`은 `process.env.TZ`를 바꾼 뒤 확인하는데, 구현이 `timeZone`을 명시하므로 TZ 변경이 반영되지 않아도 그대로 통과한다. 같은 값을 `timeZone` 없이 포맷한 결과와 다름을 함께 확인하면 회귀를 실제로 잡는다.

---

## 리뷰 중 지적하고 닫힌 항목

| 등급 | 내용 | 최종 상태 |
|---|---|---|
| HIGH | 페이지가 `projects={project ? [project] : []}` 인라인 배열을 넘겨 부모 리렌더마다 모달 초안이 리셋 → 저장 실패 시 입력 전부 소실 | `modalProjects` `useMemo`로 해결 |
| HIGH | `canManageAccidents`가 본부급 발주청만 참이라 시공사·감리단이 현장에서 사고를 작성할 수 없었음(요구사항 미충족) | `canCreate`/`canModify` 분리로 해결 |
| MEDIUM | 삭제 실패 메시지가 `<main>`에 렌더돼 확인 모달 오버레이에 가려짐 | `deleteError`를 모달 안에 렌더 |
| MEDIUM | 단일 `canManage`가 DB의 등록/수정 권한 갈래와 어긋남 | 등록·개별 수정 권한 분리 |
| MEDIUM | 조회 실패·로딩 중에 등록 진입점이 사라짐 | 헤더 버튼 조건을 `loading \|\| loadError \|\| 목록 있음`으로 수정 |
| MEDIUM | `docs/architecture.md` 미갱신(라우트 목록·권한 서술·신규 lib) | 갱신 완료 |
| MEDIUM | 새 테스트 두 벌이 `package.json`에 없어 실행 경로가 없음 | `test:accident-report` 추가 |
| LOW | 날짜가 브라우저 로컬 시간대로 표시됨 | `Asia/Seoul` 고정으로 해결 |

## 이번 리뷰에서 제외한 것

`prevent_project_accidents_created_by_change` 트리거가 `auth.users` 삭제 시 FK의 `ON DELETE SET NULL`까지 막아 사고 기록이 있는 계정의 가입 해지가 실패하는 문제는 본 작업 범위 밖으로 합의된 기존 결함이라 신규 결함으로 보고하지 않는다. `docs/database.md`와 `tests/project-accidents-sql.test.mjs:317-333`의 `test.todo`에 근거와 해법이 기록돼 있다.

## Coordinator 최종 처리

- LOW 1은 디자인 시스템의 위험(red)·주의(amber) 규칙을 유지한다. 모든 배지에 중대도 텍스트가 함께 있으므로 구분은 유지되며, 기존 대시보드의 색 변경은 이번 범위에 넣지 않는다.
- LOW 2는 `docs/architecture.md`에 본사·관리자급 전사 권한과 본부 관할 대조를 명시해 해결했다.
- LOW 3은 시간대를 명시하지 않은 날짜가 실제로 전날로 표시되는 대조 assertion을 추가했고, 해당 테스트를 다시 실행해 통과했다.
- 외부 미등록 현장의 기존 조회 권한과 작성 권한을 구별하도록 위 설명을 보정했다.
