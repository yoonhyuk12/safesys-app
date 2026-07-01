# 품질시험 월례보고서 구현 체크리스트

계획서: `plans/20260702_품질시험월례보고서.md`

- [x] 계획 산출물(plan·checklist·context-notes) 생성
- [x] `database/add_quality_monthly_reports_table.sql` 작성 (`quality_monthly_reports`, project_id CASCADE, RLS)
- [ ] **마이그레이션 적용 — 사용자 콘솔 실행 필요** (MCP 적용은 권한 분류기에서 차단됨. Supabase 웹 콘솔 SQL Editor에서 위 파일 실행)
- [x] 타입·계산 헬퍼 `src/lib/quality/quality-monthly-types.ts` (파생값 계산, 이월 로직)
- [x] 페이지 `/project/[id]/quality-monthly-report` 작성 (월 목록 + 폼)
- [x] 폼 컴포넌트 `QualityMonthlyReportForm.tsx` (행 입력 + 자동계산 표시)
- [x] 직전 월 보고서 기반 행·누계 자동 이월 (`carryOverRows`)
- [x] PDF 생성기 `src/lib/reports/quality-monthly-report.ts` (A4 가로, applyHtml2canvasTextFix, 페이지 분할)
- [x] 품질 캐비넷 C(점검) 그룹에 서류철 추가 + 건수 표시 (`project/[id]/page.tsx`)
- [x] ESLint — 신규 파일 3개 클린, 페이지의 `(supabase as any)` 4건은 기존 관례와 동일
- [x] tsc — 신규 기능 관련 타입 오류 0건 (기존 `.next/types` 사전 오류 37줄은 무관)
- [ ] 수동 검증 (마이그레이션 적용 후: 작성→저장→재조회→이월→PDF)
