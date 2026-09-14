# 본부불시점검 — 패트롤카 이용여부·지적유형 입력 추가 (2026-09-14)

## 요구
전경사진 촬영 버튼 아래에 (1) 패트롤카 이용여부 체크박스, (2) 지적유형 선택(작업중지/시정조치/해당없음, 기본 시정조치)을 두고 DB에 저장한다.

## 설계
- DB: `database/20260914-1116_add_patrol_car_finding_type_to_headquarters_inspections.sql` — `patrol_car_used boolean default false`, `finding_type text default 'corrective_action'` + CHECK.
- 순수 로직: `src/lib/inspection/headquarters-finding-type.ts` — 옵션 목록·기본값·정규화·라벨 함수. `tests/headquarters-finding-type.test.mjs`로 검증(기존 transpile 패턴).
- 페이지: `src/app/project/[id]/headquarters-inspection/page.tsx` — newRecord 상태에 두 필드 추가(초기값 4곳), 수정 로드(1곳), insert/update 저장(3곳), 전경사진 블록 아래 UI, 목록 카드에 작은 배지 표시.

## 단계
1. SQL 파일 (완료, Advisor)
2. lib + 테스트 (RED→GREEN)
3. 페이지 상태·저장·UI
4. lint·tsc·test 확인 후 커밋
