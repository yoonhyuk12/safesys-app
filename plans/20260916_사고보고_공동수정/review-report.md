# 사고보고 공동 수정 독립 리뷰 보고

리뷰일 2026-09-16. Orca dispatch ctx_1348f46dba8e(리뷰 전용). 기준 커밋 ff87f05 대비 작업 트리 최종 diff(11개 파일, +301/-54, 구현 측 마무리 반영 후)를 읽고 검증했다. 코드는 고치지 않았고 원격 변경·빌드·커밋도 하지 않았다.

## 판정

**승인.** 요구사항(소유자·공유받은 사용자·관할 발주청은 작성자와 무관하게 등록·수정, 삭제는 작성자 본인 또는 관할 본부급 이상만)이 SQL 정책과 UI 가드 양쪽에 같은 갈래로 구현됐다. 차단해야 할 경로(작성자 칸 변경, 볼 수 없는 현장으로 이동, 외부 미등록 현장 전환, 공유 철회, 관할 밖 사용자)는 모두 유지되고 테스트로 고정됐다. 1차 리뷰에서 낸 두 가지 권고(공유받은 사용자 긍정 테스트, `canEdit`의 현장 일치 가드)는 최종 diff에 반영됐다. 남은 참고 사항은 모두 비차단이다.

## 직접 실행한 검증 (최종 diff 기준)

| 항목 | 결과 |
|------|------|
| `node --test tests/project-accidents-sql.test.mjs tests/project-accident-report.test.mjs` | tests 47 · pass 46 · fail 0 · todo 1 (기존 트리거 결함 기록, 이번 변경과 무관) |
| `npx tsc --noEmit` | exit 0 |
| `npx eslint` (page·List·Detail·accident-permissions.ts) | exit 0, 경고 없음 |
| `grep canModify src tests` | 잔존 참조 없음 |

## 확인한 사항

### SQL (`database/20260916-1032_사고보고_현장작성_권한.sql`)

- UPDATE 정책 `현장 사용자 사고 수정`은 USING·WITH CHECK 모두 `project_id IS NOT NULL AND EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id)`로 동일하다. 작성자 조건만 빠졌고 현장 접근 조건은 그대로다.
- `DROP POLICY IF EXISTS`가 옛 이름 `작성자 사고 수정`과 새 이름을 모두 지우므로 재실행해도 옛 정책이 남지 않는다.
- SELECT·INSERT(`created_by = auth.uid()` 강제)·DELETE(작성자 본인) 정책은 변경 없음. 20260718의 본부급 이상 정책과 `prevent_project_accidents_created_by_change` 트리거도 손대지 않았다.
- 외부 미등록 현장은 `project_id IS NOT NULL` 가드로 이 정책에서 제외되어 기존 본부급 정책만 적용된다.
- 헤더 주석·삭제 정책 주석·`COMMENT ON TABLE`이 새 규칙과 일치한다.

### UI (`page.tsx` · `AccidentReportList.tsx` · `AccidentReportDetail.tsx`)

- `canEdit(accident)` = 세션 있음 AND 현장 로드 성공 AND `accident.project_id === project.id`. `canDelete(accident)` = 세션 있음 AND (작성자 본인 OR `canManageProjectAccidents`). DB 정책과 같은 갈래다.
- `openEditModal`·`handleSubmit`(수정 분기)은 `canEdit`, `askDelete`·`handleDelete`는 `canDelete`를 쓴다. 저장 단계에도 가드가 걸려 있다.
- 목록·상세는 수정 버튼과 삭제 버튼을 각각 감춘다. 관리 열은 둘 중 하나라도 참인 사고가 있으면 남는다.
- `updateProjectAccident`는 `created_by`를 페이로드에 넣지 않으므로 비작성자가 정상 수정할 때 트리거에 걸리지 않는다. `fixedProject`로 `project_id`가 고정되어 WITH CHECK도 통과한다.
- `accident-permissions.ts`는 로직 무변경, 주석만 "삭제 판정"으로 정정. 호출처는 page.tsx 한 곳뿐이다.

### 테스트

- 역할 긍정 케이스: owner·branchClient가 supervisor의 사고를 수정, supervisor(공유받은 감리단)가 owner의 사고를 수정하되 삭제는 거부. 모든 경우 `created_by` 유지 확인. 본부급·본사 발주청 수정·삭제, 작성자 본인 수정·삭제도 보존. 요구사항의 세 그룹이 모두 직접 단언된다.
- 차단 케이스: owner·branchClient의 남의 사고 삭제 거부, outsider·otherClient의 수정·삭제 거부, 비작성자의 `created_by` 이관·타 현장 이동(자기 현장 이동은 성공하는 대조군 포함)·외부 현장 전환 거부, 공유 철회된 감리단의 남의 사고 수정 거부(철회 전 성공을 먼저 확인해 정책 때문임을 가름).
- SSR 테스트: 수정만 가능한 사고에 삭제 버튼 미표시, 수정만 되는 사고가 있어도 관리 열 유지, 상세의 수정/삭제 단독 표시 조합.

### 문서

`docs/auth.md`·`docs/architecture.md`·`docs/database.md`가 SQL과 같은 규칙(수정은 현장 접근 기준, 삭제는 작성자 또는 본부급, `created_by` 트리거 불변)을 서술한다. 상호 모순 없음.

## 발견 사항 (모두 비차단, 조치 불필요)

1. **참고** — page의 `canEdit` 현장 일치 가드는 SSR 단위 테스트가 없다(page.tsx 자체가 테스트 대상이 아니다). 코디네이터의 브라우저 검증이 비작성자 수정·삭제 버튼 비표시를 확인했으므로 이번 범위에서는 충분하다.
2. **참고** — `AccidentReportDetail`은 `canEdit`·`canDelete`가 모두 거짓이어도 빈 `flex gap-2` 래퍼를 렌더한다. 레이아웃 영향 없음.
3. **범위 밖(기존 부채)** — `docs/architecture.md`의 `AccidentEntryModal # 본부급 이상 사용자의 사고 입력·수정 폼` 설명은 이번 변경 전부터 낡은 표현이다. 구현 보고서도 같은 내용을 남겼다.

## 남은 일

- 운영 Supabase에 SQL 적용, 커밋·배포는 코디네이터·사용자 몫이다.
