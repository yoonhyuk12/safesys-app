# 체크리스트 — 수시 위험성평가 현황 카드

## Worker A — 뷰 컴포넌트

- [x] `src/components/dashboard/RiskAssessmentStatusView.tsx` 생성, 첫 줄 한국어 역할 주석
- [x] props `{ initialHq, initialBranch, onBack }` 그대로 구현, default export
- [x] `getProjectsByUserBranch` + `risk_assessments` 조회, 발주청 role 게이팅
- [x] 연도 스피너 + 데이터 있는 최신 연도 자동 초기화
- [x] 본부 표 — 대상/작성 프로젝트 + 합계 + 1~12월, 소계 행
- [x] 지사 표 — 동일 컬럼
- [x] 프로젝트 표 — 합계 + 1~12월 + 최근 작성일, 소계 행
- [x] 0인 달은 `-` 표기
- [x] 준공 프로젝트 무조건 제외 (사용자 확정으로 규칙 변경, context-notes 참조)
- [x] 프로젝트 행 클릭 → `/project/[id]/risk-assessment?returnUrl=...`
- [x] 단계별 뒤로가기(프로젝트→지사→본부→안전현황)

## Worker B — 라우트 + 배선

- [x] `src/app/safe/risk-assessment/page.tsx` 생성
- [x] `src/app/safe/branch/[branch]/risk-assessment/page.tsx` 생성
- [x] Dashboard.tsx import 추가 (`ShieldAlert` 아이콘 import 포함)
- [x] Dashboard.tsx 지사 경로 카드키 화이트리스트에 `'risk-assessment'` 추가
- [x] Dashboard.tsx 루트 경로 카드키 화이트리스트에 `'risk-assessment'` 추가
- [x] Dashboard.tsx 렌더 블록 추가
- [x] Dashboard.tsx 카드 JSX 추가 (작업계획서 카드 뒤, rose 계열)

## Advisor 검증

- [x] diff 직접 확인 — Dashboard.tsx 변경은 요청 5곳뿐, 무관한 수정 없음
- [x] `npx tsc --noEmit` 통과 (에러 0)
- [x] 신규 3개 파일 ESLint 경고 0
- [x] `colSpan` 실측 — 본부/지사 표 16, 프로젝트 표 15로 헤더 수와 일치
- [x] dev 서버(3001) 신규 라우트 2개 HTTP 200, 콘솔 에러 0
- [ ] **로그인 상태 실화면 확인 미완** — Playwright는 새 세션이라 발주청 인증이 안 돼 빈 상태만 렌더됨. 사용자 브라우저에서 3단 드릴다운·연도 전환 눈으로 확인 필요
- [x] 의미 단위 커밋
- [ ] main 푸시 (= 운영 배포) — 사용자 승인 대기
