# 작업 체크리스트.

- [x] 양식 hwpx 구조(표 그리드·셀 주소·그림) 추출과 기존 유사 기능(장비 일일점검·패트롤 AI 라우트·공사감독일지 TBM 조회) 확인.
- [x] 공용 타입 `src/lib/patrol-ledger/types.ts`, 템플릿 `public/순회점검 양식.hwpx`.
- [x] Worker A. 마이그레이션(1700·1701)·records·tbm-work·AI 라우트·삭제 라우트 사진 정리·테스트 23건 + 병합 29건.
- [x] Worker B. HWPX 템플릿 치환 모듈·테스트 5건·한글 2022 ALIVE·PDF 4종 1쪽 확인.
- [x] Worker C. 페이지·컴포넌트·캐비닛 폴더·건수·architecture.md.
- [x] Advisor. lint·tsc·테스트 재실행, HWPX 표본 육안 검토, 로그인 가드 리다이렉트 확인, 의미 단위 커밋.
- [ ] 사용자. 운영 DB에 `database/20260917-1701_merge_projects_patrol_ledger.sql` 적용(1700은 이미 적용됨, 병합 가드 28≠29 상태).
- [ ] 사용자. 브라우저에서 TBM 있는 날짜로 AI 생성 → 체크 → 서명 → 저장 → HWPX 다운로드 확인.
