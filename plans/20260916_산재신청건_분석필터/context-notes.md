# 컨텍스트 노트.

- 기존 `selectedSeverity`, `filteredAccidents`, `resetFilters`를 확장한다. 새 추상화나 라이브러리는 필요하지 않다.
- 실제 승인 상태는 없으며 사용자가 `workers_comp_claim === 'applied'` 기준을 명시적으로 선택했다.
- 등록·미등록 현장 모두 신청 여부를 먼저 검사한다. 미신청·미입력은 체크 시 제외한다.
- 기존 분석과 월별 분석 모두 `filteredAccidents`를 소비하고 유형 순위는 분석 상세를 소비한다.
- 기존 미추적 `safesys-app/public/사고/`, `사용방법.md`는 보존한다.
- 작업 지시의 추가 Worker·커밋 금지를 우선한다. 기존 구현을 재사용하는 소규모 수정이므로 외부 검색과 새 패키지 도입 없이 진행한다.

## 검증 결과.

- RED에서 3개 중 신청 조건 관련 2개 실패를 확인한 뒤 구현했다.
- `node --test tests/accident-analysis-filter.test.mjs tests/project-accident-report-ui.test.mjs` 결과 21개 통과.
- `npx eslint src/components/dashboard/AccidentAnalysisView.tsx tests/accident-analysis-filter.test.mjs` 종료 0.
- `npx tsc --noEmit` 종료 0.
- `git diff --check` 종료 0. CRLF 변환 경고만 있다.
- 신규 테스트는 실제 `filteredAccidents` 콜백을 AST에서 읽어 등록·미등록 현장, 신청·미신청·null 및 기존 AND 조건을 검증한다. UI 클릭·초기화와 차트 표시의 브라우저 검증은 부모 담당이다.
- 검사 중 다른 작업의 `isCompApproved`와 산재승인 상세 열 등 병행 변경을 발견했고 보존하여 부모에게 알렸다. 해당 변경은 이 Worker의 구현 범위가 아니다.

## 코디네이터 검증.

- 별도 1092×922 브라우저에서 API 응답을 대역 처리해 기본 3건 → 체크 시 신청 1건으로 KPI·사고 이력·월별 사고 막대가 함께 변경되는 것을 확인했다. 중대도 AND, 체크 해제, 초기화 및 브라우저 오류 0건을 확인했다. 운영 데이터 쓰기는 없다.
- 다른 작업의 SSR 대역이 상태 순서에 의존해 한 번 실패했으나 해당 테스트의 병행 수정 후 관련 73개 테스트가 모두 통과했다.
- 병행 작업의 승인 열·조회 projection 변경은 보존하고 이번 커밋에서는 체크박스 관련 변경만 포함한다.
