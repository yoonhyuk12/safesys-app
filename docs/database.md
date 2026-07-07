<!-- 데이터베이스: 주요 테이블·CASCADE 규칙·일괄서명 등록 규칙·마이그레이션·Supabase MCP -->
# 데이터베이스

## 주요 테이블

- `user_profiles` — 사용자 역할/조직 구조
- `projects` — 건설 프로젝트 (행정구역, 좌표, 분기별 활성 상태)
- `heat_wave_checks` — 열중질환 안전 점검
- `manager_inspections` — 관리자 점검
- `headquarters_inspections` — 본부불시점검
- `tbm_safety_inspections` — TBM 일일 안전점검
- `workers` — 작업자 프로필/등록
- `material_ledger` — 자재 원장
- 모든 테이블에 RLS(Row Level Security) 적용

## 프로젝트 종속 테이블 규칙 (필수)

프로젝트에 속한 데이터를 저장하는 **새 테이블은 반드시** FK를 `project_id UUID REFERENCES projects(id) ON DELETE CASCADE`로 선언한다. 프로젝트 삭제 시 종속 등록건이 함께 삭제되도록 보장하기 위함이다.

- 프로젝트 삭제는 `/api/projects/[id]/delete` 라우트가 service-role로 `projects` 행만 직접 지우고, 자식 행 삭제는 전적으로 `ON DELETE CASCADE`에 의존한다. cascade가 없는 자식 테이블은 삭제 시 FK 위반으로 실패하거나 고아 데이터로 남는다.
- 2026-07-06 기준 `projects`를 참조하는 자식 테이블 21개 전부 CASCADE다. 새 기능의 테이블도 빠짐없이 이 패턴을 따라야 한다. 감사는 `pg_constraint`에서 `confrelid = 'projects'`인 FK의 `confdeltype = 'c'`(=CASCADE) 여부로 확인한다.
- 새 테이블이 사진·파일을 **Storage**에 저장하고 URL 컬럼을 두면, DB 행은 cascade로 지워져도 Storage 파일은 남는다. 이때는 위 삭제 라우트의 URL 수집 로직에 그 테이블을 추가한다. (서명 등을 base64 TEXT로 DB에 저장하면 행과 함께 삭제되어 별도 작업이 불필요하다.)
- **프로젝트 병합(`merge_projects` DB 함수)도 함께 갱신한다.** 병합은 자식 테이블의 `project_id`를 target으로 UPDATE한 뒤 source를 삭제하므로, 함수의 UPDATE 목록에 없는 자식 테이블은 CASCADE로 유실된다. 함수는 실제 FK 테이블 수와 자신이 아는 개수(현재 21)가 다르면 예외로 중단하도록 되어 있으니, **새 자식 테이블 추가 시 UPDATE 목록과 개수 가드를 함께 갱신**해야 병합이 다시 동작한다. 프로젝트 단위 유니크 제약이 있는 테이블(예: quality_monthly_reports의 연·월)은 target 우선 충돌 폐기 DELETE도 추가한다.

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
