# 품질시험 결과 관리대장 구현 체크리스트

계획서: `plans/20260702_품질시험결과관리대장.md`

- [x] 계획 산출물(plan·checklist·context-notes) 생성
- [x] `database/add_quality_test_ledger_tables.sql` 작성 (3테이블, project_id CASCADE, RLS)
- [ ] 마이그레이션 적용 — **사용자 작업 필요**: Supabase MCP가 읽기 전용이라 SQL Editor에서 `database/add_quality_test_ledger_tables.sql` 실행 필요
- [x] `src/lib/quality/quality-test-types.ts` 타입 정의
- [x] 실시대장 탭: 목록 + 폼(서명 포함) + 대장 엑셀 출력
- [x] 성과총괄표 탭: 폼 + 실적 자동집계 + 엑셀 출력
- [x] 확인시험 의뢰서 탭: 목록 + 폼 + 엑셀 출력
- [x] 페이지 `/project/[id]/quality-test-ledger` (탭 전환)
- [x] 품질 캐비넷 C(점검) 그룹에 서류철 추가 + 건수 표시 (그룹은 월례보고서 커밋 d51d6a5에서 신설됨)
- [x] 타입 검사 — `npx tsc --noEmit` 신규 파일 오류 0건 (기존 파일의 오류만 존재)
- [x] ESLint — 신규 파일 고유 오류 없음 (`(supabase as any)` 경고는 기존 코드와 동일한 수용된 패턴)
- [ ] 수동 검증 (작성→저장→재조회→집계→엑셀) — **마이그레이션 적용 후 가능**
- [x] 시맨틱 커밋
