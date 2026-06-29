# 프로젝트 합치기(병합) 구현 — 컨텍스트 노트

계획서: `plans/20260629_프로젝트합치기.md` (검증 완료, DB 조사 정확)

## 결정·근거

- **마이그레이션 위치/이름**: 계획서의 `database/16_...` 대신 `database/migrations/add_merge_projects_function.sql`로 작성. 저장소에 번호 체계가 없고 함수 마이그레이션은 `database/migrations/`에 서술형 이름(`add_*_function.sql`, `fix_transfer_project_ownership.sql`)으로 두는 실제 컨벤션을 따름.
- **RPC 권한**: `revoke execute from public, anon, authenticated` + `grant execute to service_role`. 이 프로젝트 Supabase의 `pg_default_acl`이 새 함수에 service_role EXECUTE를 명시 부여하므로 revoke만으로도 동작하나, 암묵 전제에 기대지 않도록 명시 grant 추가.
- **API 권한**: `role === '발주청'`만 허용(삭제 라우트는 `발주청 || created_by` 이지만 병합은 비가역이라 더 엄격). delete 라우트(`api/projects/[id]/delete/route.ts`) 구조를 그대로 따름.
- **지사 스코프**: API 별도 검증 없음(결정 6-5). 발주청에게 보이는 프로젝트만 모달 목록(`getProjectsByUserBranch` → Dashboard `projects` state)에 뜨므로 선택 대상이 자연히 가시 범위로 제한됨.
- **충돌 처리**: `work_daily_reports(project_id,report_date)`·`project_shares(project_id,shared_with)` 2곳만 유니크 충돌 가능(제약·인덱스 전수 조회로 확인). target 우선으로 source 중복 행 사전삭제, 폐기 건수를 RPC가 jsonb로 반환.
- **새로고침**: 병합 성공 후 Dashboard `loadBranchProjects()` 재호출(발주청 로딩 경로, `getProjectsByUserBranch` → `setProjects`).

## 모달 UX

- source(1줄, 삭제될 쪽)·target(2줄, 유지될 쪽)을 각각 검색 가능한 리스트에서 선택. 같은 프로젝트 동시 선택 방지.
- 확인 단계 필수: 삭제될/유지될 프로젝트명 명시(삭제는 빨강), 겹치는 작업일보 날짜 수를 client에서 사전 조회해 "N건은 대상 것만 남고 나머지 삭제" 경고, "되돌릴 수 없음" 표시.
- 겹치는 날짜 조회: client `supabase`로 두 프로젝트의 `work_daily_reports.report_date` 교집합 count(발주청 RLS로 조회 가능).

## 2026-06-29 인시던트 — 사리현 TBM 화면에서 사라짐 (복구 완료)

- **증상**: 사용자가 합치기 1건(사리현벽제지구 → 사리현벽제) 실행 후 사리현 TBM 일지가 화면에서 모두 사라짐.
- **원인**: 합치기 v1은 `project_id`로만 자식 이전. 그런데 옛 `/tbm` 제출분(`tbm_submissions`) 75건은 **project_id가 NULL**이고 TBM 현황이 이를 **project_name+headquarters+branch 텍스트로 매칭**해 표시. source 프로젝트가 삭제되자 그 이름("사리현벽제지구...")에 매칭되던 NULL 행들이 표시할 프로젝트를 잃어 화면에서 사라짐. **데이터는 삭제 안 됨**(행 그대로, project_id만 NULL).
- **복구**: service-role 일회용 스크립트로 NULL 75건의 project_id를 생존 프로젝트(a3be1237)로 설정. 검증 결과 사리현 TBM 77건 전부 a3be1237 연결, NULL 0. (MCP는 읽기 전용이라 UPDATE 불가 → `.env.local` service-role 키 스크립트 사용)
- **근본 수정**: `merge_projects` RPC에 "source 이름·본부·지사로 매칭되는 NULL project_id TBM도 target으로 이전" 블록 추가(`moved_legacy_tbm` 반환). `tbm_safety_inspections`는 601건 전부 project_id 보유 → 무관(수정 불필요).

## 남은 일

- **사용자가 보완된 `database/migrations/add_merge_projects_function.sql`를 Supabase 콘솔에서 재실행**해야 함(create or replace, 재적용 안전).
- 재적용 전까지 "합치기" 버튼 사용 금지(레거시 TBM 또 사라짐).
- 재적용 후 테스트용 두 프로젝트(레거시 TBM 포함)로 병합 검증.
