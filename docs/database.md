<!-- 데이터베이스: 주요 테이블·CASCADE 규칙·일괄서명 등록 규칙·마이그레이션·Supabase MCP -->
# 데이터베이스

## 주요 테이블

- `user_profiles` — 사용자 역할/조직 구조
- `projects` — 건설 프로젝트 (행정구역, 좌표, 분기별 활성 상태)
- `heat_wave_checks` — 열중질환 안전 점검
- `manager_inspections` — 관리자 점검
- `headquarters_inspections` — 본부불시점검
- `tbm_safety_inspections` — TBM 일일 안전점검
- `project_accidents` — 프로젝트별 사고 이력과 피해·예방조치 정보. 미등록 현장은 `project_id` NULL + `external_project_name`·본부·지사 직접입력
- `workers` — 작업자 프로필/등록
- `material_ledger` — 자재 원장
- 모든 테이블에 RLS(Row Level Security) 적용

### 점검 지적사항 분류코드

정기점검의 사진 지적은 `safety_inspection_results.finding_category_code`, 본부불시점검의 두 지적 입력란은 `headquarters_inspections.issue1_category_code`와 `issue2_category_code`에 `F01_PPE`부터 `F20_WORK_METHOD`까지의 고정 코드를 저장한다. 메타·상태 문구는 `NULL`로 저장해 통계에서 제외한다.

- 분류의 권위 있는 저장 경로는 PostgreSQL `BEFORE INSERT OR UPDATE` 트리거다. 신규 입력과 지적 원문 변경 때만 재계산하며, 조치사진·상태만 수정할 때는 기존 코드를 유지한다.
- 정기점검은 `findings`가 비어 있으면 `field_item`으로 분류한다. 본부불시점검은 `issue_content1`, `issue_content2`를 각각 독립 분류한다.
- 사고 통계 화면은 저장 코드를 우선 집계하고, `NULL` 또는 무효 코드에는 동일한 TypeScript 분류 규칙을 fallback으로 사용한다. 앱 조회가 새 컬럼을 직접 선택하므로 `database/20260718-1120_add_inspection_finding_category_codes.sql`과 상태 메타 보정 `database/20260718-1200_exclude_non_finding_status_texts.sql`을 이 순서로 Supabase 콘솔에 적용한 뒤 앱을 배포한다.

### 지급자재 나라장터 정산 캐시

`materials`는 납품요구별 나라장터 지급·검사검수 결과를 저장한다. 최신 검사검수일과 최종 지급일 외에 지급문서 합계, 문서 건수, 정산연도, 마지막 조회시각을 함께 보관하며 성공 조회 후 24시간은 저장값을 사용한다.

- 최종 지급연도와 계약완료일인 납품기한 연도가 다를 때만 정산연도를 별도로 계산한다. 검사검수일이 없어도 저장된 지급합계와 최종 지급일로 계산한다.
- 지급문서가 여러 건이면 전체 지급금액 합계가 계약금액의 90% 이상인지 판단하고, 조건을 충족하면 가장 마지막 지급문서의 지급연도를 정산연도로 저장한다.
- 관련 컬럼은 `g2b_insp_date`, `g2b_pay_date`, `g2b_pay_total`, `g2b_pay_doc_count`, `g2b_settlement_year`, `g2b_pay_insp_checked_at`이다.

## 프로젝트 종속 테이블 규칙 (필수)

프로젝트에 속한 데이터를 저장하는 **새 테이블은 반드시** FK를 `project_id UUID REFERENCES projects(id) ON DELETE CASCADE`로 선언한다. 프로젝트 삭제 시 종속 등록건이 함께 삭제되도록 보장하기 위함이다.

- 프로젝트 삭제는 `/api/projects/[id]/delete` 라우트가 service-role로 `projects` 행만 직접 지우고, 자식 행 삭제는 전적으로 `ON DELETE CASCADE`에 의존한다. cascade가 없는 자식 테이블은 삭제 시 FK 위반으로 실패하거나 고아 데이터로 남는다.
- 2026-09-07 기준 `projects`를 참조하는 자식 테이블은 27개이며, 비용 귀속용 `ai_usage_logs`(`ON DELETE SET NULL`)만 예외이고 나머지 26개는 CASCADE다. `project_accidents`도 이 규칙을 따른다. 새 기능의 테이블도 빠짐없이 이 패턴을 따라야 한다. 감사는 `pg_constraint`에서 `confrelid = 'projects'`인 FK의 `confdeltype = 'c'`(=CASCADE) 여부로 확인한다.
- 새 테이블이 사진·파일을 **Storage**에 저장하고 URL 컬럼을 두면, DB 행은 cascade로 지워져도 Storage 파일은 남는다. 이때는 위 삭제 라우트의 URL 수집 로직에 그 테이블을 추가한다. (서명 등을 base64 TEXT로 DB에 저장하면 행과 함께 삭제되어 별도 작업이 불필요하다.)
- **프로젝트 병합(`merge_projects` DB 함수)도 함께 갱신한다.** 병합은 자식 테이블의 `project_id`를 target으로 UPDATE한 뒤 source를 삭제하므로, 함수의 UPDATE 목록에 없는 자식 테이블은 CASCADE로 유실된다. 함수는 실제 FK 테이블 수와 자신이 아는 개수(현재 27)가 다르면 예외로 중단하도록 되어 있으니, **새 자식 테이블 추가 시 UPDATE 목록과 개수 가드를 함께 갱신**해야 병합이 다시 동작한다.
- **프로젝트 단위 유니크 제약이 있는 서류는 폐기하지 않고 병합 전체를 중단한다.** `work_daily_reports`(같은 `report_date`)나 `quality_monthly_reports`(같은 연·월)가 하나라도 겹치면 `MERGE_REPORT_CONFLICT`(SQLSTATE `P0001`, `DETAIL`은 충돌 JSON)로 전체를 롤백해 원본 보고서를 보존한다. 유니크 제약이 있는 새 서류 테이블을 추가할 때도 삭제가 아니라 이 충돌 집계에 넣는다.
- 병합 함수는 `public.preview_project_merge_v2(source, target)`가 돌려주는 `{workDailyReports, qualityMonthlyReports, scheduleConflict}` JSON을 그대로 써서 충돌을 판정한다. 앱은 이 읽기 전용 함수로 미리보기를 하고, 실제 병합은 버전이 명시된 `public.merge_projects_safe_v2(source, target)`를 호출한다. 마이그레이션 적용 전에 앱이 배포되면 함수 부재로 병합이 안전하게 실패한다. 병합 본문은 두 `projects` 행을 `id` 순서로 `FOR UPDATE` 잠근 뒤 DB에서 최종 충돌을 확인한다.
- 병합할 때 target 프로젝트의 선택사항이 비어 있고 source에 값이 있으면 source 값으로 보충한다. target에 이미 입력된 값은 덮어쓰지 않으며, 체크박스 선택값은 어느 프로젝트에서든 `true`이면 보존한다. 개별 보충 대상은 착공·준공일, 공사종류, 위험업종, 총사업비·당해예산, 감독 직위·성명·연락처, 실제 작업주소, 명함 PDF, 텔레그램 ID 2종, 개인정보 담당자 4종, `cctv_rtsp_url`, `client_app_code`·`contractor_app_code`이며 `display_order`는 병합에서 건드리지 않는다.
- **서로 다른 현장·계약이 섞이지 않도록 일부 컬럼은 묶음으로 판단한다.** 주소 묶음(`site_address`, `site_address_detail`, `latitude`, `longitude`)은 target이 전부 비었을 때만 source 묶음 전체를 복사한다. 다만 두 프로젝트의 `site_address`가 공백 제거 후 정확히 같고 target의 `site_address_detail`만 비어 있으면 상세주소만 보충한다. 계약 묶음(`representative_contract_id`, `g2b_cntrct_no`, `g2b_ntce_no`, `g2b_corp_nm`, `g2b_tot_amt`, `g2b_thtm_amt`)도 target에 계약 식별자나 연계값이 하나라도 있으면 통째로 유지하고, 전부 비었을 때만 source 묶음 전체를 복사한다.
- `construction_schedule`은 `NULL`·JSON `null`·`{}`·`[]`·`{"items": [], "updatedAt": ...}`처럼 공종(`items`)도 공사관리번호(`contractNo`)도 없을 때만 비어 있는 것으로 본다. **source 공정표를 원본 그대로 옮길 수 없으면 `MERGE_SCHEDULE_CONFLICT`(`P0001`)로 병합 전체를 중단한다.** 두 경우다 — (1) 두 현장 모두 공정표가 있고 JSONB가 서로 다르면 한쪽이 반드시 사라지므로 막는다(내용이 같으면 잃을 것이 없어 허용한다), (2) target이 비어 source 공정표로 보충하는데 병합 후 착공·준공일이 source와 달라지면 막는다. `startIndex`/`endIndex`가 착공일 기준 상대 旬 인덱스라 기간이 바뀌면 의미가 훼손되기 때문이다.
- 병합 함수는 `preview_project_merge_v2` 응답의 세 필드(키와 JSON 타입)를 먼저 검증하고, 형식이 다르면 판정을 신뢰할 수 없으므로 병합을 중단한다. 미리보기 함수를 고칠 때 필드를 빼면 충돌 판정이 조용히 무력화되는 것을 막기 위한 가드다.
- 병합 SQL 회귀 테스트는 PGlite 인메모리 Postgres에서 실제 마이그레이션 파일을 적용해 돌린다 — `cd safesys-app && npm run test:merge-sql`. 스키마 픽스처는 `safesys-app/tests/fixtures/merge-projects-schema.sql`이며, 자식 테이블을 늘렸으면 픽스처와 개수 가드를 함께 고친다.
- 프로젝트 카드의 `is_active` 분기·준공 상태는 다섯 값이 모두 `false` 또는 누락일 때만 비어 있는 것으로 본다. target에 하나라도 `true`가 있으면 target 상태 묶음 전체를 보존하고, 비어 있을 때만 source 상태 묶음 전체를 복사한다. 프로젝트 전체 수정일인 `updated_at`은 source 값으로 바꾸지 않는다.
- source의 기존 공유자 중 발주청 계정은 관할 권한으로 접근할 수 있으므로 제거하고, 시공사·감리단 등 비발주청 공유자만 target으로 이동하면서 `shared_by`를 target 소유자로 바꾼다. source 소유자도 비발주청 계정일 때만 target 공유자로 추가하며, 동일 계정, 기존 target 공유자, target 소유자의 self-share는 중복 생성하지 않는다.

## 일괄서명 대상 등록 규칙 (필수)

새 서류 테이블에 **감독(공사감독원) 서명** 또는 **시공사(현장소장·확인자·담당자) 서명** 컬럼(base64 TEXT)을 만들면, 반드시 `src/lib/bulk-sign/bulk-sign-targets.ts` 레지스트리에 항목을 추가해 프로젝트 상세의 일괄서명(만년필 펜통 버튼)에 포함시킨다. API 라우트(`/api/bulk-sign`)와 모달(`BulkSignModal`)이 이 파일 하나를 공유하므로 항목 추가만으로 양쪽에 반영된다.

- 감독 서명 컬럼 → `supervisor.targets`, 시공사 서명 컬럼 → `contractor.targets`에 추가한다.
- `selectColumns`에 서명(base64) 컬럼을 넣지 않는다 — 목록 조회 용량 폭증. 표시용 컬럼 + `toItem` 변환만 지정한다.
- 테이블에 `project_id`가 없으면 `projectScope: { joinTable }`(부모 조인), `updated_at`이 없으면 `hasUpdatedAt: false`를 지정한다. 서명 컬럼명이 `signature`가 아닐 수 있으니 실제 컬럼명을 확인한다 (예: `material_ledger_entries.supervisor_confirm`).
- JSONB 서명 구조도 지원한다 — 역할 배열은 `jsonb: { kind: 'roleArray', role }`(예: `safety_inspections.signatures`의 공사감독원/현장대리인), 역할 객체는 `{ kind: 'keyedObject', key, field }`(예: `ptw_permits.signatures`의 permitter/confirmer/writer/applicant).
- 점검자·감시인·작업자 등 **이름이 특정된 개인의 서명**만 등록하지 않는다. 제외 판단은 모달 하단 안내 문구와 해당 plans 컨텍스트 노트에 기록한다.

## 마이그레이션

`database/` 디렉터리에 SQL 마이그레이션 파일을 둔다.

- **파일명 규칙 (필수)**: `YYYYMMDD-HHMM_설명.sql` — 맨 앞의 일자-시간 접두어로 적용 순서대로 정렬된다. 새 마이그레이션 파일은 작성 시각을 접두어로 붙인다 (예: `20260703-0618_add_inspection_visit_logs.sql`).

## Supabase MCP 주의사항

**읽기 전용** 모드 — SELECT 쿼리만 가능. DDL/DML 불가. 스키마 변경 필요 시 Supabase 웹 콘솔 사용.
