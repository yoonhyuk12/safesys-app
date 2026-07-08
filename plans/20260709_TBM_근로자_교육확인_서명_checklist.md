# TBM 근로자 교육 확인 서명 체크리스트

- [x] 마이그레이션 `database/20260709-0634_add_tbm_worker_signatures.sql` 작성
- [x] API `src/app/api/tbm-view/[id]/signatures/route.ts` (GET/POST, 익명 제출)
- [x] 모달 `src/components/tbm-view/WorkerEducationSignModal.tsx` (체크 6개 + 이름 + WorkerSignaturePad)
- [x] 엑셀 `src/lib/excel/tbm-worker-signature-export.ts` (일일안전교육 서명부 A4, fitToHeight 0으로 다인원 페이지 나눔)
- [x] `tbm-view/[id]/page.tsx` 서명 카드 섹션 + 번역 키 추가
- [x] `tbm-submission/page.tsx` 다운로드 메뉴에 "서명부 다운로드" 추가
- [x] `npx tsc --noEmit` 통과 (신규·수정 파일 오류 0, 기존 무관 파일 오류는 종전과 동일)
- [x] `npx eslint` 신규 파일 3개 오류 0 (API 라우트 any 2건 수정), 수정 페이지 2개 신규 오류 0
- [x] Advisor diff 검증 (Worker 산출물 2개 직접 확인 + git diff 전체 검토)
- [x] 커밋
- [ ] 사용자 마이그레이션 실행 (Supabase 콘솔) → 확인 후 main 푸시(=운영 배포)
