# 계약(공사·용역) 현황 서류철 — 체크리스트

- [x] 조달청 계약현황 API 실호출 검증 (공사·용역, insttNm, 월 단위 제약)
- [x] DB 마이그레이션 작성 (`project_contracts` + RLS + 인덱스 + merge_projects 21→22)
- [x] API 라우트 `/api/g2b/cntrct-list` 작성 (+ 계약명 서버 필터 nm)
- [x] 서류철 페이지 `/project/[id]/contract-status` 작성 (표 + 조달청 조회 모달)
- [x] 기타 캐비넷에 서류철 카드 + 건수 카운트 추가 (P (계획) 박스 신설)
- [x] 페이지 피드백 1차 반영 — 검색어를 기관명과 함께 조회 조건으로 적용
- [x] lint 통과 (신규 코드 — `(supabase as any)` 관례 제외 이상 없음)
- [x] 커밋
- [ ] (사용자) Supabase 웹 콘솔에서 `database/20260707-1323_add_project_contracts.sql` 실행
- [ ] (사용자) 실제 프로젝트에서 조회·등록 확인
- [x] 페이지 피드백 5차 반영 — 장기계속계약 차수 배지 + 금차준공일 표시·연도 귀속
- [ ] (사용자) Supabase 웹 콘솔에서 `database/20260707-1503_add_project_contracts_thtm_end_date.sql` 실행 (미실행 시 조달청 조회 등록이 실패함)
