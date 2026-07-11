# AI 작업계획서 체크리스트

## Phase 1 — 골격
- [ ] `database/20260711-HHMM_add_work_plans.sql` 작성 (work_plans 테이블, RLS, ON DELETE CASCADE)
- [ ] Storage 버킷 `work-plans` 생성 SQL/안내 포함
- [ ] `src/lib/work-plan/types.ts` — PlanType·폼 데이터 타입
- [ ] `src/lib/work-plan/constants.ts` — 4종 체크리스트 문항, 범례, 중점관리사항, 안전계수/장력계수
- [ ] `project/[id]/page.tsx` 안전캐비넷 P 그룹에 DocumentFolder 추가 + cardCounts.workPlans
- [ ] `work-plan/page.tsx` 스텁 교체 — 목록(조회·삭제) + 마법사 진입
- [ ] `WorkPlanWizard.tsx` 스텝 컨테이너
- [ ] `PlanTypeSelector.tsx` 4종 복수 체크
- [ ] `WorkPlanForm.tsx` 공통+종류별 필드, 자동 인입(프로젝트·workers·계약·공정표), 안전율 자동계산
- [ ] tsc·lint 통과, 커밋

## Phase 2 — 지도 드로잉
- [ ] `MapDrawingEditor.tsx` — 전역 로드된 Kakao Maps SDK(layout.tsx) 사용, 위성(HYBRID) 기본 + 일반지도(ROADMAP) 토글, 프로젝트 좌표 중심 (기존 KakaoMap.tsx·SimpleProjectMap.tsx 패턴 참조)
- [ ] 배경 소스 선택 UI — 카카오맵 / 현장 전경 사진 업로드(카메라·파일)
- [ ] 화면 고정(지도 캡처) → 캔버스 오버레이 드로잉(장비·경로·유도자·지휘자·통제구역·표지판·라벨)
- [ ] 벡터 JSON 저장 + 재편집 로드(배경 종류·지도 뷰 상태 포함)
- [ ] 배경+드로잉 합성 PNG 생성 → Storage 업로드 (카카오 타일 CORS 확인, 필요 시 타일 프록시 `/api/map-tile`)
- [ ] 전기(2-3) 단독 선택 시 사진·도면 업로드 대체 UI
- [ ] tsc·lint 통과, 커밋

## Phase 3 — AI 초안
- [ ] `api/ai/work-plan/route.ts` — Gemini JSON 강제, 종류별 출력 스키마
- [ ] `AiReviewStep.tsx` — 생성 호출, 위험요인/개선대책·작업순서 편집 표
- [ ] 4종 각각 생성 테스트(파싱 실패 폴백 포함)
- [ ] tsc·lint 통과, 커밋

## Phase 4 — PDF·마무리
- [ ] `work-plan-pdf-common.ts` — 결재란·기본정보·지도 섹션·체크리스트 표 조각
- [ ] `work-plan-loading-pdf.ts` (2-1)
- [ ] `work-plan-construction-pdf.ts` (2-2, 사전조사표 유형 분기)
- [ ] `work-plan-electric-pdf.ts` (2-3)
- [ ] `work-plan-heavy-pdf.ts` (2-4)
- [ ] 목록·상세에서 종류별 다운로드 연결, 파일명 규칙 적용
- [ ] 원본 붙임 PDF와 페이지 단위 대조 조정
- [ ] tsc·lint 통과, 커밋

## 배포 전
- [ ] 마이그레이션·버킷 사용자 실행 확인
- [ ] main 푸시(=운영 배포) 동의 확인
