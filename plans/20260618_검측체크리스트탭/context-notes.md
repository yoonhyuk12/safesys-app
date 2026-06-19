# 컨텍스트 노트 — 검측 체크리스트 탭

## 결정과 근거

- **1:1 첨부 (별도 테이블 X)**: 검측요청서 붙임 항목이 "검측 체크리스트"라 요청서에 종속되는 게 자연스럽다. 사용자 확인.
- **고정 14행**: 양식과 동일. `CHECKLIST_ROW_COUNT=14`를 폼·엑셀 단일 출처로 사용. 사용자 확인.
- **엑셀은 새 파일로 분리**(`inspection-checklist-export.ts`): 기존 `inspection-request-export.ts`는 8열(A–H) 기준 `COLS`/`borderRange`에 묶여 있다. 체크리스트는 11열(A–K)이라 모듈 `COLS`를 바꾸면 기존 출력(절취선 폭 등)에 회귀가 생긴다. 작은 헬퍼 일부 중복을 감수하고 새 파일로 격리(가이드 #3 외과적 변경).
- **헤더 자동 채움**: 탭 전환 시 1회 복사(빈 값만). useEffect 양방향 동기화는 루프 위험이라 피함. 복사 후 사용자가 수정 가능.
- **서명 재사용**: 체크리스트 푸터의 현장대리인/감독원 = 요청서의 field_agent/supervisor. 별도 서명 컬럼 추가하지 않고 탭1 서명(`field_agent_signature`/`supervisor_signature`)을 재사용. 탭2에서는 미리보기만.

## 데이터 모델

추가 컬럼(`inspection_requests`):
- checklist_facility_name / checklist_location / checklist_work_type / checklist_quantity (TEXT)
- checklist_items (JSONB, ChecklistItem[])
- contractor_check_date / supervisor_check_date (DATE)

ChecklistItem = { item, standard, contractor_result, supervisor_result, action }
- contractor_result = 검사결과 상단(시공자), supervisor_result = 하단(감독원).

## 주의

- 마이그레이션 미실행 상태로 저장 시 전체 insert/update 실패(컬럼 없음). 배포 전 마이그레이션 필수.
- DATE 컬럼은 '' 불가 → 빈 값은 null로 저장(`e.target.value || null`).
- 구버전 레코드는 checklist_items가 null → `normalizeChecklistItems`로 14행 보정.

## 2차 변경 (페이지 피드백)

- **헤더 싱크**: 사용자가 "Tab1↔Tab2 헤더 내용이 같으니 싱크"를 요청. 별도 checklist_* 헤더 컬럼 4개를 제거하고 Tab2 헤더 입력을 Tab1 필드(structure_name/inspection_part/work_type/quantity)에 직접 바인딩. 마이그레이션이 아직 미실행이라 SQL도 컬럼 3개로 축소. → 양방향 편집·싱크, 중복 제거.
- **AI 자동 채우기**: 사용자가 "사용자 입력 + 위키 + AI 기본지식으로 점검 항목을 채워" 요청.
  - 그라운딩: 검사기준 위키(`wiki/검사기준/`)는 repo 루트라 배포 제외 → `src/lib/inspection/inspection-criteria-knowledge.ts` 상수로 컴파일. 위키 변경 시 이 상수 갱신 필요(현재 수동 동기화).
  - 라우트 `api/ai/inspection-checklist`: Gemini 호출(supervisor-summary 패턴 차용), responseMimeType json, item/standard만 생성(검사결과·조치사항은 사람).
  - 모델: 사용자가 말한 gemini-3.5-flash-lite는 Gemini API에 없음(404 model not found, 실테스트 확인) → 검증된 gemini-3.1-flash-lite 사용. 배열 구조라 추후 모델 추가 시 폴백 가능.
  - 실엔드포인트 테스트(철근콘크리트/아스팔트포장)에서 위키 매트릭스와 정합한 항목 생성 확인.
