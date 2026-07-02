# 단속·점검방문 일지 구현 체크리스트

계획서: `plans/20260703_단속점검방문일지.md`

- [x] 계획 산출물(plan·checklist·context-notes) 생성
- [x] `database/add_inspection_visit_logs.sql` 작성 (project_id CASCADE, RLS, 서명 base64 TEXT)
- [ ] 마이그레이션 적용 — **사용자 작업 필요**: Supabase MCP가 읽기 전용이라 SQL Editor에서 `database/add_inspection_visit_logs.sql` 실행 필요
- [x] 타입 정의 `src/lib/inspection/inspection-visit-log-types.ts` (방문자 JSONB 배열, 확인자 서명)
- [x] 폼 `InspectionVisitLogForm.tsx` (①~⑦ 섹션, 방문자 추가/삭제, SignatureModal 서명)
- [x] 목록 `InspectionVisitLogList.tsx`
- [x] 페이지 `/project/[id]/inspection-visit-log` (목록 + 작성/수정, 프로젝트 정보 프리필)
- [x] 엑셀 출력 `src/lib/excel/inspection-visit-log-export.ts` (별지 제9호 서식, 1건 1시트, A4 세로)
- [x] 시공 캐비넷 C(점검) 그룹에 서류철 추가 + docCount (`project/[id]/page.tsx`)
- [x] `bulk-sign-targets.ts` supervisor.targets에 확인 서명(confirmer_signature) 등록
- [x] 제어문자(NUL) 스캔 — 신규 파일 6개 전부 클린
- [x] 타입 검사 — `npx tsc --noEmit` 신규 파일 오류 0건
- [x] ESLint — 신규 파일 고유 오류 없음 (`(supabase as any)` 4건은 참조 구현체와 동일한 수용된 패턴)
- [ ] 수동 검증 (작성→저장→재조회→엑셀→일괄서명 목록 노출) — **마이그레이션 적용 후 가능**
- [x] 시맨틱 커밋
