# 사고보고 공동 수정 구현 보고

작업일 2026-09-16. Orca dispatch ctx_e91656bf47b5에서 Advisor 역할로 수행했고, 구현은 worker-opus 두 명(SQL 갈래·UI 갈래)에게 병렬로 위임한 뒤 diff와 테스트를 직접 확인했다. 커밋·푸시·빌드·원격 DB 실행은 하지 않았다.

## 무엇을 바꿨나

수정 권한과 삭제 권한을 분리했다. 수정은 등록과 같은 기준으로 "그 현장을 볼 수 있는 로그인 사용자"면 작성자와 무관하게 허용하고, 삭제는 기존대로 작성자 본인 또는 관할 본부급 이상 발주청만 한다. 원 작성자(`created_by`)는 기존 트리거가 그대로 지킨다.

### DB (`database/20260916-1032_사고보고_현장작성_권한.sql`, 운영 미적용 원본 수정)

- UPDATE 정책 `"작성자 사고 수정"`을 `"현장 사용자 사고 수정"`으로 바꾸고, USING·WITH CHECK 양쪽에서 `created_by = auth.uid()` 조건을 뺐다. `project_id IS NOT NULL AND EXISTS (projects RLS)`만 남는다.
- 재실행 가능성을 위해 `DROP POLICY IF EXISTS`에 옛 이름과 새 이름을 둘 다 넣었다. 같은 파일을 여러 번 얹어도 옛 정책이 남지 않는 것을 Worker가 `pg_policies`로 확인했다.
- INSERT(자기 이름으로만 등록)·SELECT·DELETE(작성자 본인) 정책, 20260718 본부급 정책, 외부 미등록 현장 차단, `created_by` 불변 트리거는 손대지 않았다. 헤더 주석과 `COMMENT ON TABLE`만 새 규칙으로 고쳤다.

### 앱 (`safesys-app/`)

- `src/app/project/[id]/accident-report/page.tsx` — `canModify`를 `canEdit(accident)`(세션 있고 현장을 읽었으며 그 사고의 `project_id`가 지금 읽은 현장과 같을 때 참. 코디네이터 리뷰 반영)과 `canDelete(accident)`(본인 작성 건 또는 `canManageProjectAccidents` 관할)로 나눴다. 수정 모달 열기·저장은 `canEdit`, 삭제 확인·실행은 `canDelete`를 쓴다.
- `src/components/project/accident-report/AccidentReportList.tsx`·`AccidentReportDetail.tsx` — prop을 `canEdit`·`canDelete`로 분리해 수정 버튼과 삭제 버튼을 각각 감춘다. 목록의 관리 열은 둘 중 하나라도 참인 사고가 있으면 남긴다.
- `src/lib/accident-permissions.ts` — 로직 무변경. 주석만 "삭제 권한 판정"으로 정정했다.
- `updateProjectAccident`는 `created_by`를 보내지 않으므로 작성자 보존에 추가 코드가 필요 없었다.

### 문서

- `docs/auth.md` 사고보고 권한 절, `docs/architecture.md`(`accident-permissions.ts` 설명과 프로젝트 사고보고 문단), `docs/database.md`(`project_accidents` 설명)를 새 규칙으로 갱신했다.

## 테스트 (RED → GREEN)

두 Worker 모두 테스트를 먼저 고쳐 실패를 확인한 뒤 구현했다.

- SQL 테스트 RED — 마이그레이션 수정 전 4건 실패. 비작성자 owner의 UPDATE가 0건(`0 !== 1`), 비작성자의 `created_by` 이관·타 현장 이동·외부 현장 전환이 정책에서 0건으로 걸려 "예외가 발생하지 않았습니다"로 실패.
- SSR 테스트 RED — 컴포넌트 수정 전 7건 실패. `accidents.some(canModify)`에서 `undefined is not a function`, 상세의 `>수정<` 미렌더.

추가·변경한 테스트 (`safesys-app/tests/project-accidents-sql.test.mjs`)

- 그 현장을 볼 수 있으면 작성자가 아니어도 사고를 고친다 — owner·branchClient가 supervisor의 사고를 수정, `cause` 반영과 `created_by` 유지 확인.
- 공유받은 감리단은 남이 쓴 사고를 고치되 지우지는 못한다 — supervisor가 owner의 사고를 수정 1건, `created_by`는 owner 유지, DELETE 0건(코디네이터 리뷰 반영).
- 공유가 철회된 감리단은 남이 쓴 사고도 더는 고치지 못한다 — 철회 전 수정 성공을 먼저 확인한 뒤 철회 후 0건, 철회 전 값 유지(코디네이터 리뷰 반영).
- 작성자가 아니면 현장 소유자·지사 발주청도 남의 사고를 지우지 못한다.
- 관할 밖 사용자(outsider·otherClient)는 남의 사고를 고치지도 지우지도 못한다.
- 작성자가 아닌 수정자도 작성자 칸을 남에게 넘기지 못한다(트리거 예외).
- 작성자가 아닌 수정자도 볼 수 없는 현장으로 사고를 옮기지 못한다(자기 현장으로는 이동 가능한 대조군 포함).
- 작성자가 아닌 수정자도 사고를 외부 미등록 현장으로 바꾸지 못한다.
- 기존 본부급 이상 수정·삭제, 작성자 본인 수정·삭제, 공유 철회 작성자 차단, 외부 현장 정책, `test.todo`(가입 해지 결함) 보존.

추가·변경한 테스트 (`safesys-app/tests/project-accident-report.test.mjs`)

- 목록은 수정만 되는 사고에 삭제 버튼을 붙이지 않는다.
- 수정만 되는 사고가 있으면 관리 열을 남긴다.
- 상세는 수정 권한만 있으면 수정 버튼만 보여준다(반대 조합 포함).
- 기존 세 테스트를 `canEdit`·`canDelete`로 갱신.

## 검증 결과 (Advisor가 직접 실행)

| 명령 | 결과 |
|------|------|
| `npm run test:accident-report` | tests 47 · pass 46 · fail 0 · todo 1(기존 결함 기록) |
| `npx tsc --noEmit` | exit 0, 출력 없음 |
| `npm run lint` | exit 0, error 0. 사고보고 관련 파일 warning 없음, 기존 무관 파일 warning만 출력 |

## 남은 일 (이번 범위 밖)

- 운영 Supabase에 `database/20260916-1032_사고보고_현장작성_권한.sql` 적용과 앱 배포는 코디네이터·사용자 몫이다.
- `docs/architecture.md` 116행 근처 `AccidentEntryModal # 본부급 이상 사용자의 사고 입력·수정 폼` 설명은 이번 작업 전부터 낡은 표현이라 그대로 두었다.
- `test.todo` 가입 해지 결함(트리거 가드 부재)은 기존대로 후속 과제다.
