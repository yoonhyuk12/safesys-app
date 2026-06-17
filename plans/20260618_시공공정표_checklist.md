# 공정표 기능 체크리스트

## 1. DB
- [x] `database/add_project_construction_schedule.sql` 작성 (JSONB 컬럼)
- [x] 사용자가 Supabase 콘솔에서 SQL 실행 완료 (2026-06-18)

## 2. 타입·계산 (lib/work-schedule/work-schedule-types.ts)
- [x] WorkScheduleItem / WorkSchedule 타입
- [x] buildPeriodGrid(start, end) → 旬 period 배열 (검증: 9旬, 마지막 라벨=준공일)
- [x] computeSchedule → 가중치/旬공정율/누계/월간/공종별우측/S커브 (검증: 합계 100%)
- [x] scheduleToAnchors → ProgressAnchor[] (검증: 마지막 anchor=준공)
- [x] validateSchedule + 명시칸 외 잔여 균등분배(한 칸 조정해도 100% 유지)

## 3. Excel (lib/excel/work-schedule-export.ts)
- [x] landscape A4, 旬 컬럼 헤더(년/월/旬)
- [x] 공종 행 + 旬 셀(막대·기여%) + 우측 공정률
- [x] 하단 요약행 4종
- [x] S커브 canvas PNG 임베드
- [x] 파일명 `{사업명}_예정공정표.xlsx`

## 4. 편집 컴포넌트 (components/project/WorkScheduleEditor.tsx)
- [x] 공종 추가/삭제, 공종명·금액, 가중치 자동
- [x] 旬 그리드 드래그 막대 + 시작·종료 입력 + 셀 클릭 기여% 조정
- [x] 라이브 재계산 + SVG S커브 + 오늘 공정률(연동) + 검증 배지
- [x] 저장 → construction_schedule + invalidateProgressAnchors
- [x] Excel 다운로드 버튼

## 5. 페이지 (app/project/[id]/work-schedule/page.tsx)
- [x] 프로젝트 로드, 착공/준공 없으면 작업일보로 유도
- [x] 헤더·뒤로가기·푸터 + WorkScheduleEditor 렌더

## 6. 연동
- [x] progress-anchors.ts: 스케줄 우선, 없으면 기존 수동행 폴백
- [x] lib/projects.ts Project 타입에 construction_schedule? 추가
- [x] 시공 캐비넷 P 섹션에 공정표 DocumentFolder 추가
- [x] 캐비넷 명판·목록 카드는 getProgressAnchors 경유 → 자동 반영
- [x] 작업일보 폼 자동공정률(autoAnchors)·월간Excel을 getProgressAnchors로 연동 (예정공정표 우선, 수동 모달은 유지)

## 7. 검증
- [x] 내 파일 tsc 타입 에러 없음 (기존 코드 에러는 무관, ignoreBuildErrors)
- [x] 내 파일 ESLint 통과 (에러·경고 0)
- [x] 계산 순수함수 런타임 sanity (합계 100% 확인, 임시 스크립트)
- [ ] 프로덕션 빌드는 사용자 동의 후 / 사용자 화면 확인

## 8. 마무리
- [ ] 메모리 업데이트
- [ ] 커밋 분리 (신규 파일 + progress-anchors + projects, page.tsx는 선택 스테이징)
