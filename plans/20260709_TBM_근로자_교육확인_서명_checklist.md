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
- [x] 사용자 마이그레이션 실행 완료 (2026-07-09 확인)

## 2차 — 서명부를 TBM일지에 동봉 (별도 다운로드 제거)

- [x] `tbm-worker-signature-export.ts` → `appendTBMWorkerSignatureSheet(workbook, ...)` 시트 추가 방식으로 리팩터링 (독립 다운로드 함수 제거)
- [x] `tbm-worker-signature-report.ts` 신설 — 서명부 PDF 페이지용 HTML (익명 입력 성명 HTML 이스케이프)
- [x] `tbm-submission-report.ts` — `appendHTMLPage` 추가, 단건·일괄 PDF에 서명부 페이지 동봉 옵션
- [x] `tbm-submission-export.ts` — 단건 `options.signatures`·일괄 `items[].signatures`로 서명부 시트 동봉
- [x] `tbm-submission/page.tsx` — 서명 일괄 조회(`in` 쿼리) 후 PDF/엑셀에 전달, "서명부 다운로드" 메뉴 제거
- [x] tsc·eslint — 신규·수정분 오류 0 (기존 오류만 잔존)
- [x] 커밋
- [ ] 로컬 확인 후 main 푸시(=운영 배포)
