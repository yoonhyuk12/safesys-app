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

### 추가 기능 (2026-07-02 페이지 피드백: 일련번호 미표시, 사진 첨부 요청)

- [x] `database/add_quality_test_records_photo.sql` 작성 (photo_url 컬럼 + quality-test-photos 버킷/정책)
- [ ] 마이그레이션 적용 — **사용자 작업 필요**: Supabase MCP 읽기 전용, SQL Editor에서 직접 실행
- [x] `quality-test-types.ts`에 `photo_url` 필드 추가 (QualityTestRecordFormData, QualityTestCommonFields — 일련번호당 1건이라 공통 필드로 배치)
- [x] `QualityTestRecordsTab.tsx` 공통 항목 그리드에 일련번호 읽기 전용 필드 추가
- [x] `QualityTestRecordsTab.tsx` 공통 항목 그리드에 사진 업로드/삭제 UI 추가 (Storage 업로드, 일련번호당 1건)
- [x] `src/lib/reports/quality-test-photo-report.ts` 사진대지 PDF 출력 유틸 작성
- [x] 헤더에 "사진대지" 출력 버튼 추가 (사진 없는 프로젝트는 비활성화)
- [x] `api/projects/[id]/delete/route.ts`에 `quality_test_records.photo_url` 수집 블록 추가
- [x] 타입체크·린트 실행 — 신규 파일 오류 0건, 기존 `(supabase as any)` 경고만 존재 (수용된 패턴)
- [ ] 수동 검증 (사진 업로드→저장→사진대지 PDF 출력) — **마이그레이션 적용 후 가능**
