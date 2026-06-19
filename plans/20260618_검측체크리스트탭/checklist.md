# 체크리스트 — 검측 체크리스트 탭

## 1차 — 탭/저장/엑셀
- [x] 마이그레이션 SQL (`database/add_inspection_request_checklist.sql`)
- [x] 타입/헬퍼 (`inspection-types.ts`) — ChecklistItem, CHECKLIST_ROW_COUNT, normalize
- [x] 엑셀 출력 (`inspection-checklist-export.ts`) — 별지 제5호 (11열)
- [x] 탭2 컴포넌트 (`InspectionChecklistTab.tsx`)
- [x] 폼 탭 바 (`InspectionRequestForm.tsx`)
- [x] 페이지 다운로드 버튼 (`page.tsx`)
- [x] 탭 라벨 "검측 체크리스트(선택사항)"

## 2차 — 피드백 반영
- [x] 헤더 싱크 — Tab2 헤더를 Tab1 필드(structure_name/inspection_part/work_type/quantity)에 바인딩, 중복 컬럼 4개 제거(마이그레이션도 축소)
- [x] AI 자동 채우기 — 검사기준 위키 번들(`inspection-criteria-knowledge.ts`) + API 라우트(`api/ai/inspection-checklist`, Gemini) + 탭2 버튼
- [x] 모델 검증 — gemini-3.5-flash-lite는 404(없음) → gemini-3.1-flash-lite 사용 (실엔드포인트 테스트 통과)
- [x] lint/tsc 통과 (변경 파일 무오류)

## 남은 일
- [ ] **사용자**: Supabase 콘솔에서 `add_inspection_request_checklist.sql` 실행 (컬럼 3개, 배포 전 필수)
