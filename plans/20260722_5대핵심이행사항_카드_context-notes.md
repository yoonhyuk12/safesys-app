# 5대 핵심이행사항 카드 — 컨텍스트 노트

- 2026-07-22 착수. 사용자 요청. `/safe` 카드 그리드에 5대 핵심이행사항 이행 현황 카드 추가, 점검 데이터는 본부 불시점검 등록 폼의 5대 핵심 안전수칙 탭(#1~#4 회차)에서 입력됨. Claude Fable은 기획·검수만, 구현은 codex·grok 워커에게 Orca 오케스트레이션으로 위임하라는 지시.
- 패턴 선택. 카드 뷰 구현 방식이 두 갈래였음 — (a) Dashboard가 데이터를 로딩해 props로 내려주는 방식(본부 불시점검 카드), (b) 뷰가 자체 로딩하는 방식(법적이행확인 카드). **(b) 채택.** Dashboard.tsx(5천 행 육박)의 수정 범위를 최소화하고 두 워커의 파일 충돌을 없애기 위함.
- 라우트 키는 `five-key`. `computeQuarterCard`는 경로 세그먼트를 그대로 쓰므로 추가 대응 불요. 789행 `/^\/safe\/(heatwave|manager|headquarters)$/` 정규식은 지사 사용자 자동 진입용 3개 카드 전용이라 건드리지 않음(법적이행확인도 미포함).
- 등급 집계는 카테고리 내 **최악값** 기준. 안전관리 현황판이므로 보수적 표시가 맞다고 판단. 횟수 항목(관리자 입회·동행 횟수)은 등급이 아니므로 집계 제외.
- 허위 우수 함정. `normalizeFiveKeyItems`는 빈 데이터를 grade '1'(매우우수)로 채운다. 현황 집계에서 이걸 그대로 쓰면 미점검이 전부 "매우우수"로 표시되므로, 뷰에서는 원본 five_key_items 기준으로 미점검을 판별하도록 스펙에 명시함.
- 병렬 위임을 위해 FiveKeyStatusView props 계약(initialHq·initialBranch·onBack)을 계획서에 고정. grok(배선)이 codex(뷰)보다 먼저 끝나면 tsc에서 모듈 미존재 오류가 나는 것은 예상된 중간 상태.
- 진행 기록. codex(Task A, 뷰)·grok(Task B, 배선·라우트) 병렬 디스패치. codex 터미널에서 inject 프롬프트가 입력창에 머무는 미제출 함정이 재현되어 terminal read로 감지하고 빈 Enter 전송으로 해결함. grok 약 4분, codex 약 10분 만에 worker_done 수신. 두 diff 모두 스펙 외 변경 없음 확인.
- 코디네이터 직접 보정 1건. 뷰 정렬부의 `managing_branch.localeCompare`가 레거시 null 데이터에서 예외를 낼 수 있어 `|| ''` 방어 추가(코드베이스 다른 곳도 null 방어 중이라 타입 선언만 믿을 수 없음).
- 검증 결과. `npx tsc --noEmit` 오류 0, ESLint 신규 파일 3개 무경고(Dashboard.tsx 경고 17건은 기존 미사용 import·훅 의존성 경고로 이번 변경과 무관). main 푸시는 운영 배포이므로 커밋만 하고 푸시는 사용자 결정에 맡김.
- Task D(후속, 2026-07-22). 사용자 요청으로 본부→지사→프로젝트 3단 드릴다운 전환(LegalComplianceView 패턴). 진행 중 Orca 런타임이 재시작되어 터미널 핸들이 전부 바뀌고 미기록 디스패치가 생겨, 태스크를 ready로 되돌린 뒤 재디스패치로 복구함. codex는 refresh token 폐기로 로그인 불능 상태가 되어 Task D는 grok이 수행(사용자 재로그인 전까지 codex 사용 불가). grok 작업 중 터미널이 멈춘 듯 보였으나 실제로는 진행 중이었음 — 활동 중인 워커는 재시작하지 않는다는 원칙 준수.
- Task C(후속, 2026-07-22). 사용자 요청으로 뷰를 분기 조회 형식으로 전환 — 전체 기간 최신 점검 대신 선택 분기(YYYYQN, 기본 현재 분기) 범위 내 최신 유효 점검으로 집계. codex 동일 터미널에 재디스패치, inject 미제출 함정 재재현(빈 Enter로 해결). 분기 경계는 SafetyHeadquartersView와 동일하게 로컬 분기 범위 vs Date.parse 비교(KST에서 경계일 포함 문제 없음). 데이터는 여전히 1회 조회 후 클라이언트 필터.

- Design feedback(2026-07-22). 프로젝트 테이블에서 `최근 점검일` 좌측에 `해당분기 공사중` 컬럼 추가. 값은 `is_active.q{N}`(JSONB) 기준 O/X 표시, 레거시 boolean은 분기판별 불가 → X. 평균 행은 `-`. 본부불시점검 엑셀·Manager/HeadquartersInspectionStatus와 동일 판별 규칙.
