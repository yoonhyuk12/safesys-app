# TBM 근로자 교육 확인 서명 — 컨텍스트 노트

- **익명 제출 전제.** 근로자는 비회원이므로 tbm-view QR 페이지에서 로그인 없이 제출한다. 쓰기는 `/api/tbm-view/[id]/signatures` POST가 service-role(supabaseAdmin)로 수행하고, 테이블에는 INSERT RLS 정책을 두지 않는다 (기존 `/api/tbm-view/[id]` GET과 동일 패턴).
- **projects 직접 FK 없음.** `tbm_worker_signatures.tbm_submission_id → tbm_submissions(id) ON DELETE CASCADE`만 둔다. 프로젝트 삭제·병합은 tbm_submissions를 경유해 전이되므로 `merge_projects` UPDATE 목록·개수 가드(직접 projects 참조 테이블 수)를 건드리지 않는다.
- **서명은 base64 TEXT.** Storage 미사용 → 행 삭제 시 함께 소멸, 삭제 라우트 URL 수집 로직 갱신 불필요 (database.md 규칙).
- **일괄서명 레지스트리 제외.** 근로자 본인 서명은 "이름이 특정된 개인의 서명"이므로 `bulk-sign-targets.ts`에 등록하지 않는다 (database.md 규칙에 따른 제외 판단 기록).
- **체크 6항목은 전부 필수.** 서명부는 "작업가능상태" 확인 문서이므로 모두 체크해야 제출 가능. 시트 표기 값은 PDF 예시를 따름 — 확인 / X(음주 안 함) / 150미만 / 착용 / 동의 / 이상없음.
- **서명부 다운로드는 제출 건 단위.** tbm-submission 페이지의 건별 다운로드 메뉴(PDF/엑셀)에 3번째 항목으로 추가. 벌크 다운로드 통합은 이번 범위 제외.
- **서명 카드에 `data-html2canvas-ignore`.** tbm-view "이미지로 저장하기" 캡처에서 액션 카드는 제외 (푸터 버튼과 동일 처리).
- **GET 목록은 이미지 제외.** 공개 GET은 id·worker_name·created_at만 반환해 서명 이미지 노출을 막는다. 관리자용 서명부 생성은 인증된 tbm-submission 페이지에서 supabase 클라이언트 SELECT(RLS `USING (true)`, 기존 테이블들과 동일 패턴)로 조회한다.
- **마이그레이션 사용자 실행 완료** (2026-07-09 사용자 확인).
- **(2차) 서명부는 별도 다운로드가 아니라 TBM일지에 동봉.** 사용자 피드백 — PDF는 TBM일지 다음 페이지, 엑셀은 같은 워크북의 별도 시트로 포함. 별도 "서명부 다운로드" 메뉴는 제거. 일괄 다운로드도 각 제출 건 뒤에 서명부가 끼워진다(서명 없는 날은 서명부 생략).
- **(2차) PDF 서명부는 HTML 템플릿 방식.** `PDFGenerator`에 범용 `appendHTMLPage(html)`을 추가하고 `tbm-worker-signature-report.ts`가 서명부 HTML을 생성한다. 근로자 성명은 익명 입력값이므로 innerHTML 삽입 전 반드시 HTML 이스케이프(escapeHtml) — XSS 방지.
- **(2차) 엑셀 서명부는 `appendTBMWorkerSignatureSheet(workbook, entries, meetingDate, sheetName?)`.** 시트명 31자 제한·금지문자 정리·중복 회피 내장. 일괄 다운로드에서는 `서명부_{TBM시트명}`으로 명명.
