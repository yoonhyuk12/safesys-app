# 사고보고 구현 보고

작업일 2026-09-16. worker-opus 역할로 직접 구현했다. 커밋·푸시·프로덕션 빌드는 하지 않았다.

## 변경한 파일

### 신규

| 파일 | 한 일 |
|------|-------|
| `safesys-app/src/app/project/[id]/accident-report/page.tsx` | 프로젝트 사고보고 업무형 화면. 세션 복원 가드, 현장 정보·사고 목록 조회, 목록/상세 전환, 등록·수정 모달 연결, 삭제 확인 모달 |
| `safesys-app/src/components/project/accident-report/AccidentReportList.tsx` | 목록 표. 조회 오류·빈 목록·사고 목록 세 상태를 함께 다루고, 권한이 있는 행에만 수정·삭제를 붙인다 |
| `safesys-app/src/components/project/accident-report/AccidentReportDetail.tsx` | 사고 한 건의 기존 필드 전부(장소·작업·개요·원인·재발방지·부상/사망/휴업·산재신청·등록/수정일시) 표시 |
| `safesys-app/src/lib/accident-permissions.ts` | 타인 보고 관리 권한 판정 순수 함수 `canManageProjectAccidents(profile, project)`. 본사·관리자급은 전사, 본부 소속은 관할 본부가 일치할 때만 |
| `safesys-app/src/lib/accident-report-format.ts` | 중대도·산재신청 배지 클래스와 서울 시간대 고정 날짜 표기 |
| `safesys-app/tests/project-accident-report.test.mjs` | 관련 테스트 19개 |

### 수정

| 파일 | 한 일 |
|------|-------|
| `safesys-app/src/lib/accident-analysis.ts` | `getProjectAccidents(projectId)`와 `PROJECT_ACCIDENT_PAGE_SIZE` 추가. 그 프로젝트의 `project_id`만 최신순으로 페이지를 넘겨 전부 읽고, 조회 실패는 예외로 올린다 |
| `safesys-app/src/components/dashboard/AccidentEntryModal.tsx` | 선택적 `fixedProject` 추가. 고정 모드에서는 프로젝트 검색 대신 읽기전용 현장명을 두고 미등록 현장 직접입력을 차단하며, 저장된 미등록 현장 사고도 그 프로젝트로 묶는다. `fixedProject`를 안 주면 기존 대시보드 동작 그대로다 |
| `safesys-app/src/app/project/[id]/page.tsx` | 안전캐비넷 A(조치)에 "사고보고" `DocumentFolder` 추가 → `/project/{id}/accident-report` |
| `safesys-app/package.json` | `test:accident-report` 스크립트 추가 |
| `docs/architecture.md` | 프로젝트 상세 라우트 목록, lib 표 3줄, 사고 데이터 흐름 문단, "프로젝트 사고보고" 절 추가 |
| `plans/20260916_사고보고.md` | 권한 항목을 현장 작성 확정으로 갱신 |
| `plans/20260916_사고보고/checklist.md` | 구현·권한 반영·검증 항목 완료 표시 |

건드리지 않은 것 — DB 마이그레이션, SQL 회귀 테스트, `docs/auth.md`, `docs/database.md`, `AccidentAnalysisView.tsx`, `Dashboard.tsx`.

## 권한 (2026-09-16 사용자 확정 반영)

- **등록** — 그 현장을 열 수 있는 로그인 사용자 전원. 어느 현장을 열 수 있는지는 `projects`의 SELECT RLS가 판정하므로 화면에서 직급을 다시 따지지 않는다. role만으로 다른 프로젝트로 범위를 넓히지 않는다.
- **수정·삭제** — `created_by === sessionUserId`(본인 작성 건) 또는 `canManageProjectAccidents(userProfile, project)`. 후자는 본사·관리자급이면 전사, 본부 소속이면 `project.managing_hq === profile.hq_division`일 때만 참이다. 지사 소속과 현장 사용자는 남의 보고를 고치지 못한다.
- **미등록 현장** — 고정 모드에서 입력 경로 자체를 막았다. 기존 본부급 정책 그대로 남는다.
- 화면 분기는 편의이며 실제 차단은 DB RLS가 한다.

## 코디네이터 리뷰 반영

1. 현장 작성 권한 분기 — 위 그대로 적용.
2. `projects={project ? [project] : []}` → `useMemo`로 안정화. 저장 실패 후 입력이 초기화되지 않는다.
3. 삭제 실패 오류를 확인 모달 안에 표시 (`deleteError`).
4. `formatAccidentDate`/`formatAccidentDateTime`에 `timeZone: 'Asia/Seoul'` 명시.
5. 배지를 design-system 정본으로 — 사망·중상 `bg-red-100 text-red-800`, 휴업·경상 `bg-amber-100 text-amber-800`, 산재 신청 `bg-blue-100 text-blue-800`, 그 외 `bg-gray-100 text-gray-800`. `yellow`/`orange`/`gray-900` 복제 없음. 색은 위험·주의 두 단계를 나누고 등급 이름은 배지 글자가 말한다.
6. 상세 진입을 일자 셀의 `button`으로 옮겨 키보드로 열 수 있게 했다. 수정·삭제 아이콘 버튼에 `min-h-[44px] min-w-[44px]` 적용.
7. `pageSource` 구문 복제 정규식 테스트 4개 제거 → 렌더 기반 검증으로 대체.

## 테스트

`npm run test:accident-report` — TS 테스트 19개와 병렬 작업 소유 SQL 테스트를 함께 돌린다. 아래는 TS 테스트 19개다.

1. 프로젝트 사고 조회는 그 프로젝트만 최신순으로 읽는다
2. 앞뒤 공백만 있는 프로젝트 id로는 조회하지 않는다
3. 페이지 한도를 넘는 사고도 빠짐없이 모은다
4. 조회 실패는 빈 목록으로 감추지 않고 오류로 올린다
5. 일반 모드 모달은 프로젝트 검색과 미등록 현장 직접입력을 그대로 제공한다 *(대시보드 회귀)*
6. 프로젝트 고정 모달은 그 현장만 보여주고 프로젝트 검색을 없앤다
7. 프로젝트 고정 모달은 미등록 현장으로 저장된 사고도 그 현장에 묶는다
8. 타인 보고 관리 권한은 본사·관리자급만 전사로 열린다
9. 본부 소속은 자기 본부가 관할하는 현장만 타인 보고를 고친다
10. 지사 소속과 현장 사용자는 타인 보고를 고치지 못한다
11. 사고일자는 보는 사람의 시간대와 무관하게 서울 날짜로 읽힌다
12. 목록은 조회 실패를 빈 목록이 아니라 오류와 재시도로 보여준다
13. 사고가 없으면 등록 권한이 있을 때만 등록 버튼을 준다
14. 목록의 수정·삭제는 고칠 수 있는 사고에만 붙는다
15. 고칠 수 있는 사고가 하나도 없으면 관리 열 자체를 두지 않는다
16. 목록의 상세 진입은 키보드로 누를 수 있는 버튼이다
17. 상세는 기존 사고 항목을 모두 보여준다
18. 상세의 수정·삭제는 고칠 권한이 있을 때만 보인다
19. 안전캐비넷 A(조치)에 사고보고 서류철이 있다

RED → GREEN 순서로 진행했다. 구현 전 1~7은 실패했고 나머지는 모듈 부재로 로드 자체가 실패했다.

테스트 하니스는 `@/` 별칭 모듈을 재귀 transpile하고 `@/lib/supabase`만 대역으로 바꾼 뒤 `renderToStaticMarkup`으로 검증한다. 기존 `equipment-inspection-validation.test.mjs`·`admin-controls.spec.tsx`의 방식을 합친 것이다.

### 그 밖의 검증

| 명령 | 결과 |
|------|------|
| `npm run test:accident-report` | 37개 중 36 pass / 0 fail / 1 todo. TS 19개 전부 통과, todo 1건은 병렬 소유 SQL 테스트가 표시해 둔 기존 트리거 결함 |
| `npx tsc --noEmit` | 오류 0 |
| `npm run lint` | Error 0. 신규·수정 파일에 대한 경고 없음 (기존 파일의 사전 경고만 남음) |
| `npm run build` | **실행하지 않음** (금지) |

작업 착수 시점에 `tests/` 안에 사고 관련 TS 테스트는 없었다. `project-accidents-sql.test.mjs`는 작업 도중 병렬 작업이 추가한 파일이라 `test:accident-report`에 함께 묶어 실행만 하고 내용은 손대지 않았다.

## 남은 것 / 코디네이터 판단 필요

- **브라우저 smoke 검증** — 코디네이터가 `localhost:3000`에서 별도로 진행한다고 알려왔다. 렌더 테스트는 SSR 마크업까지만 보므로 effect(세션 복원·조회)와 실제 저장 왕복은 확인하지 못했다.
- **서류철 건수 배지** — 계획의 "과설계 금지"에 따라 `docCount`를 붙이지 않았다. 다른 A 그룹 서류철(휴일작업)도 건수가 없다. 필요하면 별도 카운트 조회를 추가해야 한다.
- **배지 색 이원화** — 사망·중상이 같은 red, 휴업·경상이 같은 amber다. 안전대시보드 사고 이력 표는 여전히 4색(gray-900/red/orange/yellow)을 쓰므로 같은 개념이 두 화면에서 다르게 보인다. design-system 정본 지시를 우선했으며, 통일하려면 `AccidentAnalysisView.tsx`도 함께 고쳐야 한다(내 소유 아님).
- **미등록 현장 사고** — 이 화면에서는 보이지도 만들어지지도 않는다. 대시보드 사고현황에서만 다룬다.

## 최종 리뷰 수정 (2026-09-16, 2차)

1. **관할 본부 확인 추가.** `canManageAccidents(profile)`를 `canManageProjectAccidents(profile, project)`로 바꿨다. 예전 함수는 본부 소속이면 어느 현장이든 참이라 다른 본부 현장의 남의 보고까지 고칠 수 있었다. 이제 본사·관리자급만 전사이고, 본부 소속은 `project.managing_hq`가 자기 `hq_division`과 같을 때만 참이다. 현장을 아직 못 읽었으면(`project === null`) 관할을 확인할 수 없으므로 열지 않는다. 작성자 본인 분기는 그대로다. 주석도 "본부급만 작성한다"에서 "타인 보고를 고칠 수 있는지 판정"으로 고쳤다.
2. **헤더 등록 버튼 조건.** `accidents.length > 0` → `(loading || loadError || accidents.length > 0)`. 목록 조회가 실패해도 사고를 등록할 수 있다. 빈 목록일 때는 표 가운데 버튼이 진입점을 맡으므로 헤더에서 빠지는 동작을 유지했다.
3. **`test:accident-report`가 두 파일을 함께 돌린다.** 별도 SQL 스크립트가 없어 `tests/project-accident-report.test.mjs`와 `tests/project-accidents-sql.test.mjs`를 한 명령에 묶었다.
4. **문서 문구 정정.** `docs/architecture.md`의 미등록 현장 사고 문장을 "관할 발주청이 지사급까지 조회하고, 등록·수정·삭제는 본부급 이상만 한다"로 고쳤다. `context-notes.md`의 사용자 응답 대기 문구도 현장 작성 확정으로 갱신했다.

권한 테스트는 같은 본부·다른 본부·본사·관리자급·지사·시공사·감리단·현장 미상 케이스로 3개 테스트로 나눠 다시 썼다.

남는 지점 하나 — `canCreate`는 여전히 `project`가 있어야 참이다. 모달이 `fixedProject`로 그 현장을 고정하므로 현장 정보 없이는 등록 폼을 열 수 없기 때문이며, 현장 조회 실패 시에는 상단의 "현장 정보 다시 불러오기"가 복구 경로다.
