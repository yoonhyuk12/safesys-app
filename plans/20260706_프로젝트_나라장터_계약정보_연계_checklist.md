# 체크리스트 — 프로젝트 나라장터 계약정보 연계

## 사용자 액션 (차단 요소)

- [x] ~~data.go.kr 활용신청~~ — 기존 키로 이미 호출 가능 확인 (2026-07-06)
- [ ] Supabase 웹 콘솔에서 마이그레이션 SQL 적용 (`g2b_cntrct_no`, `g2b_ntce_no`)

## 구현

- [x] 계획서·체크리스트·컨텍스트 노트 작성
- [x] DB 마이그레이션 파일 작성 (`database/20260706-0926_add_g2b_contract_link_to_projects.sql`)
- [x] API 라우트 `src/app/api/g2b/contract/route.ts` (계약번호 inqryDiv=2 → 공고번호 inqryDiv=4 순차 조회, 정규화·중복제거)
- [x] `Project`·`CreateProjectData` 타입에 `g2b_cntrct_no`, `g2b_ntce_no` 추가 (`src/lib/projects.ts`)
- [x] 공용 컴포넌트 `G2bContractLookup.tsx` (입력 → 조회 → 미리보기 → 적용)
- [x] ProjectRegistrationForm에 삽입 + 저장 페이로드 반영
- [x] ProjectEditForm에 삽입 + 저장 페이로드 반영 (빈 값은 페이로드 생략)

## 검증

- [x] `npx next lint` 신규·수정 파일 통과 (기존 파일의 사전 존재 any 경고는 범위 밖)
- [x] 실번호 조회 성공 — 계약번호 R25TA0061431000, 공고번호 R25BK00873577 (dev 서버 실호출)
- [x] 오류 케이스: 미존재 번호 404 메시지 확인
- [ ] 마이그레이션 적용 후: 조회 → 적용 → 저장 → DB 반영 확인 (브라우저 E2E)
