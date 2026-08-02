# 컨텍스트 노트 — 수시 위험성평가 현황 카드

작업 중 내린 결정과 근거를 계속 덧붙인다.

## 2026-08-03 착수

### 월 집계 기준을 `created_at`으로 정한 이유

`risk_assessments` 스키마(`database/20260727-2304_add_risk_assessments.sql`)에 날짜 컬럼은 `manage_period_start`, `manage_period_end`, `created_at`, `updated_at` 뿐이다. 점검 시행일에 해당하는 컬럼이 없다.

사용자 메모리에 "점검 건수·현황 집계는 등록일 아닌 점검 시행일 기준"이라는 원칙이 있지만, 이 테이블에는 시행일이 없다. `manage_period_start`가 의미상 가장 가깝지만 nullable이라 NULL 폴백 규칙이 추가로 필요하고, 같은 성격의 "작업계획서 현황"(`WorkPlanStatusView`)이 이미 `created_at`을 쓰고 있다. 사용자가 `created_at`으로 확정했다.

> 나중에 시행일 컬럼을 도입한다면 이 뷰의 월 배정 로직 한 곳만 바꾸면 된다.

### 3단 모두 1~12월 컬럼

사용자 확정. 본부·지사 표가 17열 정도로 넓어져 가로 스크롤이 생기지만, 어느 단계에서든 월별 흐름이 바로 보이는 쪽을 택했다. "미작성 프로젝트" 컬럼은 사용자 요청으로 제거했다(작업계획서 현황에는 있음).

### 골격을 `WorkPlanStatusView`로 잡은 이유

같은 3단 드릴다운 + 연도 스피너 + 소계 행 + 준공 프로젝트 처리 규칙을 이미 갖고 있다. `FiveKeyStatusView`는 분기 기준이라 연도 기준인 이번 요구와 안 맞는다. 새 추상화를 만들지 않고 패턴만 따라간다 — 두 뷰의 컬럼 정의가 서로 달라 공통화 이득이 적다.

### 병렬 분담의 고정점

Worker A(뷰)와 Worker B(라우트·배선)가 서로를 보지 않아도 되도록, 착수 전에 다음 3가지를 못 박았다.

- 파일 경로 `src/components/dashboard/RiskAssessmentStatusView.tsx`
- default export
- props `{ initialHq: string | null; initialBranch: string | null; onBack: () => void }`

수시 위험성평가 서류철 구현 때도 `src/lib/risk-assessment/types.ts`를 코디네이터가 선작성해 병렬 Worker의 고정점으로 삼았다. 같은 방식이다.

### 준공 현장은 무조건 제외 (구현 중 변경)

착수 시엔 `WorkPlanStatusView` 규칙(준공이어도 선택 연도에 작성 건이 있으면 표시)을 그대로 가져왔으나, 사용자가 **무조건 제외**로 확정했다.

```ts
// 변경 전 — 준공이어도 작성 이력 있으면 포함
projects.filter((p) => !isCompleted(p) || assessmentsByProject.has(p.id))
// 변경 후
projects.filter((p) => !isCompleted(p))
```

부작용을 알고 택한 것이다. 준공 직전에 작성한 평가서 건수는 합계·월별 집계에서 사라진다. "대상 프로젝트"가 현재 진행 중인 현장만 뜻해야 한다는 쪽을 우선했다. 작업계획서 현황과는 이 지점에서 규칙이 다르다.

### 알려진 함정

- Dashboard.tsx 카드키 화이트리스트가 **2곳**(지사 경로용·루트 경로용)이다. 하나만 고치면 한쪽 경로에서 카드가 안 열린다. 5대 핵심이행사항 카드 때 겪었다.
- `new Date(iso).getMonth()`는 로컬(KST) 기준이라 UTC 변환 없이 그대로 쓴다. `toISOString()`으로 날짜를 뽑으면 KST 새벽 건이 전날로 밀린다 — 수시 위험성평가 서류철에서 이미 겪어 로컬 포매터로 교체한 이력이 있다.
