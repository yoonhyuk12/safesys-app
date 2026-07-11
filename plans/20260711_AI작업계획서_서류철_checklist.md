# AI 작업계획서 체크리스트

## Phase 1 — 골격
- [x] `database/20260711-HHMM_add_work_plans.sql` 작성 (work_plans 테이블, RLS, ON DELETE CASCADE)
- [x] Storage 버킷 `work-plans` 생성 SQL/안내 포함
- [x] `src/lib/work-plan/types.ts` — PlanType·폼 데이터 타입
- [x] `src/lib/work-plan/constants.ts` — 4종 체크리스트 문항, 범례, 중점관리사항, 안전계수/장력계수
- [x] `project/[id]/page.tsx` 안전캐비넷 P 그룹에 DocumentFolder 추가 + cardCounts.workPlans
- [x] `work-plan/page.tsx` 스텁 교체 — 목록(조회·삭제) + 마법사 진입
- [x] `WorkPlanWizard.tsx` 스텝 컨테이너
- [x] `PlanTypeSelector.tsx` 4종 복수 체크
- [x] `WorkPlanForm.tsx` 공통+종류별 필드, 자동 인입(프로젝트·workers·계약·공정표), 안전율 자동계산
- [x] tsc·lint 통과, 커밋

## 보완 1 — 확인 어려운 정보 지연 입력 ([보완 계획서](./20260711_AI작업계획서_보완_지연입력.md))
- [x] 나중 확인 그룹 필드 분리 — loading·heavy의 equipment/machine·인양/줄걸이, construction의 equipment·operatorLicense, electric의 qualification
- [x] 마법사에 "나중 확인 정보" 스텝 삽입(저장 직전) + "건너뛰고 저장" 버튼
- [x] 필수 검증 완화 — title·plan_types만 필수, 나머지 전부 공란 허용
- [x] 안전율 계산 — 입력값 없으면 공란(계산·표시 로직 확인)
- [x] 목록에 "수정" 진입 — WorkPlanRecord 프리필 + UPDATE 저장
- [x] 목록 행 "입력 대기" 배지(나중 확인 그룹 공란 시)
- [x] tsc·lint 통과, 커밋

## Phase 2 — 지도 드로잉
- [ ] `MapDrawingEditor.tsx` — 전역 로드된 Kakao Maps SDK(layout.tsx) 사용, 위성(HYBRID) 기본 + 일반지도(ROADMAP) 토글, 프로젝트 좌표 중심 (기존 KakaoMap.tsx·SimpleProjectMap.tsx 패턴 참조)
- [ ] 배경 소스 선택 UI — 카카오맵 / 현장 전경 사진 업로드(카메라·파일)
- [ ] 화면 고정(지도 캡처) → 캔버스 오버레이 드로잉(장비·경로·유도자·지휘자·통제구역·표지판·라벨)
- [ ] 벡터 JSON 저장 + 재편집 로드(배경 종류·지도 뷰 상태 포함)
- [ ] 배경+드로잉 합성 PNG 생성 → Storage 업로드 (카카오 타일 CORS 확인, 필요 시 타일 프록시 `/api/map-tile`)
- [ ] 전기(2-3) 단독 선택 시 사진·도면 업로드 대체 UI
- [ ] tsc·lint 통과, 커밋

## Phase 3 — AI 초안
- [x] `api/ai/work-plan/route.ts` — Gemini JSON 강제, 종류별 출력 스키마 (커밋 dd5425e, 요청/응답 스키마는 컨텍스트 노트 참조)
- [ ] `AiReviewStep.tsx` — 생성 호출, 위험요인/개선대책·작업순서 편집 표
- [ ] 4종 각각 생성 테스트(파싱 실패 폴백 포함)
- [ ] tsc·lint 통과, 커밋

## Phase 4 — PDF·마무리
- [x] `work-plan-pdf-common.ts` — 결재란·기본정보·지도 섹션·체크리스트 표 조각 (커밋 942c701)
- [x] `work-plan-loading-pdf.ts` (2-1) — `downloadLoadingWorkPlanPdf(record)`
- [x] `work-plan-construction-pdf.ts` (2-2, 사전조사표 유형 분기) — `downloadConstructionWorkPlanPdf(record)`
- [x] `work-plan-electric-pdf.ts` (2-3) — `downloadElectricWorkPlanPdf(record)`
- [x] `work-plan-heavy-pdf.ts` (2-4) — `downloadHeavyWorkPlanPdf(record)`
- [ ] 목록·상세에서 종류별 다운로드 연결, 파일명 규칙 적용
- [ ] 원본 붙임 PDF와 페이지 단위 대조 조정
- [ ] tsc·lint 통과, 커밋

## 배포 전
- [x] 마이그레이션·버킷 사용자 실행 확인
- [ ] main 푸시(=운영 배포) 동의 확인
