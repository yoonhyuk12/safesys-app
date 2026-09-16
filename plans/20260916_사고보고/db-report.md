<!-- 사고보고 DB 권한 작업 완료 보고 — 마이그레이션·테스트·검증 결과와 후속 과제 -->
# 사고보고 DB 권한 구현 보고

현장 시공사·감리단이 안전캐비넷 A(조치)에서 사고를 보고하고, 그 보고가 기존 안전대시보드 사고현황에 그대로 집계되도록 `public.project_accidents`의 RLS를 넓혔다. 테이블·컬럼·트리거·기존 정책은 하나도 바꾸지 않았다.

## 산출물

| 파일 | 내용 |
|------|------|
| `database/20260916-1032_사고보고_현장작성_권한.sql` | 마이그레이션 — 정책 4개 추가 + 테이블 COMMENT 갱신 |
| `safesys-app/tests/project-accidents-sql.test.mjs` | 실제 마이그레이션을 PGlite에 얹어 돌리는 권한 회귀 테스트 18건 |
| `safesys-app/tests/fixtures/project-accidents-db.mjs` | DB 준비·로그인 전환·사고 삽입 헬퍼 |
| `safesys-app/tests/fixtures/project-accidents-schema.sql` | `auth.uid()`와 운영 `projects` 조회 정책 3종을 재현한 최소 스키마 |
| `docs/auth.md` | "사고보고 권한" 절 추가 |
| `docs/database.md` | `project_accidents` 항목에 권한·적용 순서·알려진 결함 기록 |

## 선택한 방법 — 스키마를 건드리지 않는 정책 추가

기존 사고 정책은 `발주청 관할 사고 조회`·`본부급 이상 사고 등록/수정/삭제` 4개다. RLS의 permissive 정책은 OR로 합쳐지므로, 정책을 더하기만 하면 기존 판정은 그대로 남고 허용 범위만 넓어진다. 기존 조회·집계 질의는 보이는 행이 줄지 않으므로 회귀가 없다.

추가한 정책 4개(모두 `TO authenticated`)의 공통 조건은 두 줄이다.

```sql
project_accidents.project_id IS NOT NULL
AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_accidents.project_id)
```

- **"그 현장을 볼 수 있는가"를 `projects`의 조회 RLS에 그대로 얹었다.** 정책 안의 서브쿼리도 `projects`의 RLS를 거치므로, 소유자·공유받은 사용자·관할 발주청일 때만 참이 된다. 관할 판정 규칙을 사고 정책에 복사해 두지 않아 `projects` 권한이 바뀌면 사고도 함께 따라간다. 장비 일일점검(`20260915-0448`)이 쓴 방식과 같다.
- `현장 사용자 사고 조회` — 위 조건만.
- `현장 사용자 사고 등록` — 위 조건 + `created_by = auth.uid()`.
- `작성자 사고 수정` — 위 조건 + `created_by = auth.uid()`를 `USING`과 `WITH CHECK` 양쪽에.
- `작성자 사고 삭제` — 수정과 같은 조건.

### 우회 차단

| 우회 시도 | 막는 자리 |
|-----------|-----------|
| 볼 수 없는 현장으로 `project_id` 변경 | `WITH CHECK`의 `projects` EXISTS — SQLSTATE 42501로 예외 |
| `project_id`를 NULL로 바꿔 외부 미등록 현장으로 탈출 | `WITH CHECK`의 `project_id IS NOT NULL` |
| 남의 이름으로 등록 | INSERT `WITH CHECK`의 `created_by = auth.uid()` |
| 수정하면서 작성자 넘기기 | 기존 `project_accidents_created_by_immutable_trigger` (그대로 유지) |
| 남의 사고 수정·삭제 | `USING`의 `created_by = auth.uid()` |
| 비로그인 접근 | 정책이 전부 `TO authenticated`. `anon`에는 정책이 없어 0건 |

### 열 단위 UPDATE 권한을 쓰지 않은 이유

장비 일일점검은 `REVOKE UPDATE … FROM authenticated` 후 내용 칸만 `GRANT`해 `project_id` 변경을 막았다. 사고에는 쓰지 않았다. 열 권한은 역할 단위라 정책별로 다르게 줄 수 없고, `project_accidents`에서 이를 회수하면 **기존 본부급 이상 발주청이 사고의 현장을 옮기던 동작까지 함께 막혀 회귀**가 된다(사고 입력 모달은 수정 시 현장 선택을 허용한다). 대신 `WITH CHECK`로 "볼 수 있는 현장 사이에서만 이동"을 강제했다. 자기가 이미 사고를 등록할 수 있는 현장끼리 옮기는 것은 권한 상승이 아니다.

### 함께 넓어지는 것 (의도된 변화)

지사급 발주청(`hq_division` 있음 + `branch_division`이 지사)은 기존 `본부급 이상` 정책에 걸리지 않아 사고를 등록할 수 없었다. 이제 관할 현장을 볼 수 있으므로 등록·본인 건 수정이 가능하다. "프로젝트 접근 가능한 로그인 사용자에게 추가 허용"이라는 요구에 따른 결과이며, 외부 미등록 현장은 여전히 본부급 이상 전용이다.

## 검증

`safesys-app`에서 실행한다.

```bash
node --test tests/project-accidents-sql.test.mjs
```

결과 — **tests 18 / pass 17 / fail 0 / todo 1**.

TDD로 진행했다. 마이그레이션을 자리표시자(`SELECT 1;`)로 둔 RED에서 17건 중 13건이 실패했고, 정책을 채운 GREEN에서 전부 통과했다. RED 단계에서 이미 통과한 4건(볼 수 없는 현장 등록 거부, 위조 작성자 거부, 본부급 등록, 외부 현장 정책)은 **기존 정책이 보존되었음을 가리키는 회귀 검사**다. 이후 공유 철회 케이스 1건을 더했다.

검증한 시나리오.

- 현장 시공사가 남긴 사고가 소유자·공유 감리단·관할 지사/본부/본사 발주청 5명 모두에게 보인다
- 공유받은 감리단도 그 현장에 직접 등록한다
- 타 현장 시공사·타 본부 발주청에게는 보이지 않는다
- 볼 수 없는 현장에는 등록할 수 없다
- 다른 사람(감리단·발주청·NULL)을 작성자로 적은 등록이 거부된다
- 비로그인 — `anon` 역할과 식별자 없는 세션 둘 다 조회·등록 모두 차단
- 작성자 본인은 자기 사고를 고치고 지운다
- 작성자가 아닌 현장 소유자·지사 발주청·무관한 사용자는 고치지도 지우지도 못한다
- 작성자라도 볼 수 없는 현장으로 옮기지 못한다(자기 현장끼리는 가능 — 차단이 "정책이 통과한 적 없어서"가 아님을 가른다)
- **공유 철회** — 감리단의 현장 공유가 끊기면 자기가 쓴 사고도 조회·수정·삭제가 모두 막힌다. 같은 사고가 현장 소유자에게는 계속 보인다(권한이 사라진 것이지 행이 사라진 것이 아님을 가른다)
- 작성자가 사고를 외부 미등록 현장으로 바꾸지 못한다
- 작성자가 작성자 칸을 남에게 넘기지 못한다
- **기존 보존** — 본부급 발주청은 남의 사고도 수정, 본사 발주청은 삭제, 본부급은 관할 현장 등록 유지
- **기존 보존** — 외부 미등록 현장 사고는 본부급 이상만 남기고 현장 사용자에게 보이지 않는다
- 지사 발주청은 관할 현장에 등록하되 외부 현장 권한은 얻지 못한다
- 현장 삭제 시 사고도 CASCADE로 사라진다

기존 SQL 스위트 회귀도 확인했다.

```bash
node --test tests/equipment-inspection-sql.test.mjs tests/merge-projects-sql.test.mjs
# tests 46 / pass 46 / fail 0
```

마이그레이션 재실행(idempotency)도 확인했다. 두 번 적용해도 정책은 8개(기존 4 + 신규 4)로 유지된다.

### 테스트와 운영 현재 정책의 관계

원격 DB는 변경하지 않았다. **이 마이그레이션은 아직 운영에 적용되지 않았다.** 운영 정의는 Supabase MCP `execute_sql` **읽기 질의로만** 확인했다(`pg_policy`, `pg_get_functiondef`).

- `public.project_accidents`의 운영 정책은 `발주청 관할 사고 조회`·`본부급 이상 사고 등록/수정/삭제` 4개이며, 파일 `20260718-0830_project_accidents_external_site.sql`의 내용과 정확히 일치한다. 즉 **테스트가 PGlite에 얹는 기존 4개 정책은 운영과 같다.**
- `public.projects`의 운영 조회 정책은 `프로젝트_조회_통합정책`·`projects_select_shared`·`프로젝트 조회 권한` 3개이며, `tests/fixtures/project-accidents-schema.sql`에 이름과 조건식을 그대로 옮겼다(장비 테스트의 축약판 대신 세 정책을 다 재현했다). 사고 정책이 "그 현장을 볼 수 있는가"를 이 세 정책에 얹으므로, 재현의 정확도가 곧 판정의 정확도다.
- 네 번째 정책 `anon_can_read_projects_for_registration`(`USING true`)은 **`TO anon` 전용**이라 로그인 사용자에게는 걸리지 않는다. 신규 정책이 전부 `TO authenticated`여서 이 구멍으로 새지 않음을 스키마에 같이 재현하고 비로그인 테스트로 확인했다.
- `project_shares` 운영 SELECT 정책은 `TO PUBLIC`의 `USING true`이며 픽스처도 같다.
- `prevent_project_accidents_created_by_change`의 운영 함수 본문도 파일과 같아, 아래 후속 과제의 결함이 운영에서도 그대로 재현된다.

## 후속 과제 — 기존 트리거 결함 (이번 변경 범위 밖)

테스트를 쓰다 확인한 **기존 결함**이다. 이번 정책 추가와 무관하며 조정자 지침에 따라 고치지 않고 분리했다.

`prevent_project_accidents_created_by_change`(20260718-0506)는 가드 없이 `BEFORE UPDATE FOR EACH ROW`로 걸려 있다.

```sql
IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
  RAISE EXCEPTION 'project_accidents.created_by는 변경할 수 없습니다';
END IF;
```

그래서 `auth.users` 행을 지울 때 FK의 `ON DELETE SET NULL`이 수행하는 내부 UPDATE까지 이 예외에 걸린다. **사고 기록이 있는 계정은 가입 해지가 통째로 실패한다.** 운영 함수 정의(`pg_get_functiondef`)도 파일과 같아 운영에서도 재현된다. 이번 권한 확대로 사고 작성자가 시공사·감리단까지 늘어나므로 더 자주 부딪힐 자리다.

- 재현: `safesys-app/tests/project-accidents-sql.test.mjs`의 `test.todo('가입 해지로 계정이 사라져도 사고 기록은 남는다 …')`. `todo`를 떼면 `project_accidents.created_by는 변경할 수 없습니다`로 실패한다.
- 해법: 같은 저장소의 `database/20260914-1339_quality_preserve_created_by.sql`이 쓰는 가드를 옮기면 된다.

```sql
IF current_user = 'authenticated'
   AND pg_trigger_depth() = 1
   AND NEW.created_by IS DISTINCT FROM OLD.created_by THEN
```

트리거도 `BEFORE UPDATE OF created_by`로 좁히면 불필요한 호출이 사라진다.

## 다른 담당자에게 넘기는 사항

- UI는 사고보고 시 `project_id`를 현재 프로젝트로 고정하고 `created_by`를 로그인 사용자로 채워야 한다. 두 값이 어긋나면 INSERT가 `row-level security` 위반으로 거부된다.
- 현장 사용자 화면에서는 외부 미등록 현장 입력(직접입력 현장명)을 노출하지 않는다. 본부급 이상 발주청 전용이다.
- 수정·삭제 버튼은 작성자 본인 또는 본부급 이상 발주청에게만 보이게 한다.
- `package.json`은 다른 담당자 소관이라 건드리지 않았다. `test:accident-sql` 같은 스크립트가 필요하면 `node --test tests/project-accidents-sql.test.mjs`를 등록하면 된다.
- **운영 미적용 상태다.** 적용은 Supabase 콘솔 SQL Editor에서 `database/20260916-1032_사고보고_현장작성_권한.sql` 전체를 실행한다. 앱 배포 **전에** 적용해야 현장 사용자의 보고가 `row-level security` 위반으로 거부되지 않는다. 파일은 `BEGIN`/`COMMIT`으로 감싸 있고 재실행해도 결과가 같다.
