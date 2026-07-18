# 굴착 작업계획서 구현 1차 브리프 (Codex 워커용)

## 사전 필독

1. `plans/20260718_굴착작업계획서.md` — 확정 설계·코디네이터 결정 8건. 이 문서가 단일 기준이다.
2. `safesys-app/scratch/excavation-plan-analysis.md` — 42쪽 분석. 특히 §4 보일러플레이트 원문 발췌를 상수 원본으로 사용한다.
3. 기존 패턴: `src/lib/work-plan/types.ts`, `constants.ts`, `WorkPlanWizard.tsx`의 `createPlanForm`, `PlanTypeSelector.tsx`.

## 이번 웨이브 범위

**목표: `excavation` 타입이 컴파일 가능하게 전 코드에 등록되고, 마법사 1단계에서 카드 선택·초기값 생성까지 동작한다.** 폼 상세 UI·PDF는 다음 웨이브 — 이번엔 스텁으로 그린 상태 유지.

### 1. `src/lib/work-plan/types.ts`

- `PlanType`에 `'excavation'` 추가.
- `WorkPlanSignatureRole`에 `'approvalReviewer1' | 'approvalReviewer2'` 추가 (주석: 굴착 표지 검토자 1·2).
- 신규 타입 (계획서 "필드 설계" 표와 일치시킬 것):

```ts
export interface ExcavationUtilityRow { kind: string; finding: string; action: string; agency: string }
export interface ExcavationEquipmentRow { name: string; spec: string; quantity: string; purpose: string; period: string; note: string }
export interface ExcavationManpowerRow { role: string; task: string; count: string; period: string; note: string }
export interface ExcavationShoringMaterialRow { item: string; spec: string; unit: string; quantity: string }
export interface ExcavationInstrumentRow { item: string; location: string; quantity: string; timing: string; frequency: string; note: string }
export interface ExcavationEmergencyContact { agency: string; phone: string }

export interface ExcavationOverview {
  sitePhone: string
  siteScale: string
  partnerCompany: string
  partnerPhone: string
  partnerManager: PersonContact
  excavStartDate: string
  excavEndDate: string
  depth: string
  area: string
  volume: string
  method: string
  equipmentSummary: string
}

export interface ExcavationWorkPlanFormData extends CommonWorkPlanFields {
  planType: 'excavation'
  overview: ExcavationOverview
  utilities: ExcavationUtilityRow[]
  surveyEntries: ConstructionSurveyEntry[]
  equipmentRows: ExcavationEquipmentRow[]
  manpowerRows: ExcavationManpowerRow[]
  drainagePlan: string
  blasting: { applied: boolean; method: string; area: string; amount: string; managerName: string; controlMeasure: string }
  shoring: { applied: boolean; wallMethod: string; wallQuantity: string; supportMethod: string; supportQuantity: string; materials: ExcavationShoringMaterialRow[] }
  instrumentation: { applied: boolean; rows: ExcavationInstrumentRow[] }
  emergencyContacts: ExcavationEmergencyContact[]
  checklist: ChecklistAnswer[]
}
```

- `WorkPlanFormByType`에 `excavation: ExcavationWorkPlanFormData` 추가.

### 2. 굴착 상수 — 신규 파일 `src/lib/work-plan/excavation-constants.ts`

constants.ts가 이미 317줄이고 굴착 B 문구가 많으므로 별도 파일로 만든다(첫 줄 한국어 역할 주석 필수). 분석 보고서 §4 원문 발췌를 옮기되 **HWP 변환 오탈자는 교정**한다(계획서 결정 3). 예: 친공위치→천공위치, 발생먹제→발생억제, 후방카에라→후방카메라, 확인철저/획인→확인 철저, 안전밸트→안전벨트, 학카→샤클, 소용 발생→소음 발생, 홍진→전색(문맥 확인), 진진→지진. 의미를 바꾸지 말 것.

수록 상수(모두 `as const`).

- `EXCAVATION_TOC` — 표지 목차 ①~⑨ (보고서 §4.1).
- `EXCAVATION_SAMPLE_NOTE` — 표지 하단 ※ 안내문.
- `EXCAVATION_STANDARD_FLOW` — 도면검토→측량→부지정지→천공 및 근입→흙막이(토류판) 설치→굴착작업→지보재 설치→되메우기.
- `EXCAVATION_STANDARD_PROCEDURES` — §4.3의 5그룹(현황조사 및 측량/굴착작업/토사운반/되메우기/다짐). `{ heading, items[] }[]` 구조.
- `EXCAVATION_UTILITY_SAFETY_RULES` — §4.2 매설물 작업안전수칙(일반 수칙 부분).
- `EXCAVATION_STAGE_SAFETY` — §4.4 장비반입·장비점검·굴착·상차·토사반출 단계별 안전작업계획. `{ stage, items[] }[]`.
- `EXCAVATION_TRAFFIC_RULES` — §4.4 상단 운행속도·유도원 배치 기본문구.
- `EXCAVATION_BLASTING_SAFETY` — §4.5 천공/장약/결선/발파 4단계. `{ stage, items[] }[]`.
- `EXCAVATION_SHORING_SAFETY` — §4.6 H-Pile/지보재/어스앙카 작업순서별 안전대책. `{ group, stages: { stage, items[] }[] }[]`.
- `EXCAVATION_DIRECTOR_RULES` — §4.7 작업지휘자 배치 기준.
- `EXCAVATION_ALARM_CONDITIONS` / `EXCAVATION_ALARM_SIGNALS` — §4.7 비상경보 발령조건·경보방법 표(예: 중대재해 발생 위험 시 → 휴대용 확성기 – 사이렌 짧게 1회 …).
- `EXCAVATION_ALARM_EQUIPMENT` — 경보시설 4종.
- `EXCAVATION_EMERGENCY_AGENCY_PRESETS` — 외부기관 프리셋: 시청(건설과), 고용노동청(산재예방지도과), 소방서(119), 경찰서(112), 안전보건공단, 인근 병원, 상수도사업본부, 한국전력공사, 도시가스. `{ agency, phone: '' }` 초기행 생성용 이름 배열.
- `EXCAVATION_UTILITY_KIND_PRESETS` — 도시가스·상수도·전기·통신(광케이블).
- `EXCAVATION_CHECKLIST` — 신규 작성 ~15항목. §4.4·§4.8(p.35·40~42 화상 판독) 기반으로 "~하였는가?" 의문형. 반드시 포함: 지하매설물 확인, 굴착면 구배·소단 준수, 작업 전 지반·법면 상태 확인, 신호수·작업지휘자 배치, 후방카메라·후사경 확인, 운행속도 준수, 상차 시 접근 통제, 과적 금지, 배수 조치, 굴착 단부 안전난간, 흙막이 변위 확인(우천 후), 접근금지구역 설정, 장비 유압커플러 안전핀 확인.

### 3. `src/lib/work-plan/constants.ts`

- `PLAN_TYPE_OPTIONS`에 `{ value: 'excavation', appendix: '표준양식', title: '지반 굴착 작업계획서', shortTitle: '굴착' }` 추가.
- `WORK_PLAN_COVERS`에 excavation 키 추가(타입 충족용): headerNote `'지반 굴착 작업계획서_고용노동부 표준 양식(2021)'`, titleLines `['지반 굴착', '작업계획서']`, sections는 `[목 차]` 헤딩 + ①~⑨ 항목(EXCAVATION_TOC 재사용 가능하면 재사용), footnote는 ※ 안내문.
- `CHECKLISTS_BY_PLAN_TYPE`에 `excavation: EXCAVATION_CHECKLIST`.

### 4. DB 마이그레이션 SQL (파일 작성만, 적용 금지)

`database/20260718-<HHMM>_add_excavation_plan_type.sql` (HHMM은 현재 시각).

```sql
-- work_plans.plan_types CHECK 제약에 excavation(굴착) 서식 추가
ALTER TABLE public.work_plans DROP CONSTRAINT IF EXISTS work_plans_plan_types_check;
ALTER TABLE public.work_plans ADD CONSTRAINT work_plans_plan_types_check CHECK (
  cardinality(plan_types) > 0
  AND plan_types <@ ARRAY['loading', 'construction', 'electric', 'heavy', 'excavation']::TEXT[]
);
```

### 5. 컴파일 가능한 최소 통합

- `PlanTypeSelector.tsx`: 5번째 카드. attachment `'표준 양식'`, title `'지반 굴착'`, description `'터파기·흙막이·발파 등 지반 굴착 작업'`, 아이콘 lucide `Shovel`(없으면 `Pickaxe`), color `text-orange-700 bg-orange-50 border-orange-200`.
- `WorkPlanWizard.tsx` `createPlanForm`: excavation 분기. 기본값 — `excavStartDate/excavEndDate`는 `project.construction_start_date/end_date`(없으면 오늘), `utilities`는 `EXCAVATION_UTILITY_KIND_PRESETS`로 4행(나머지 빈칸), `emergencyContacts`는 프리셋 기관명으로 행 생성(전화 빈칸), `blasting/shoring/instrumentation.applied = false`, 나머지 빈 문자열·빈 배열. `surveyEntries`는 빈 배열.
- `WorkPlanWizard.tsx` `WORK_PLAN_DOWNLOADERS.excavation`: 임시 스텁 — `async () => { throw new Error('굴착 작업계획서 PDF는 준비 중입니다.') }` (웨이브 3에서 교체).
- `WorkPlanForm.tsx`: `TYPE_LABELS.excavation = '표준 양식 지반 굴착'` + `renderExcavation` 최소 구현: `renderCommon` 재사용이 1차 목표. `renderCommon`의 타입 시그니처 `'loading' | 'construction' | 'heavy'`를 `'loading' | 'construction' | 'heavy' | 'excavation'`으로 넓혀 공통 기본정보 섹션만 표시(굴착 전용 섹션은 웨이브 2).
- `AiReviewStep.tsx`·`DeferredInfoStep.tsx`·`SignatureStep.tsx`·`api/ai/work-plan/route.ts`: **이번 웨이브에서는 tsc가 깨지는 지점만 최소 수정**(Record<PlanType> 소비처 등). 기능 분기는 웨이브 2.
- `equipment-catalog.ts` 등 `Record<PlanType,...>` 소비처를 전수 grep해서 excavation 키를 추가한다.

## 제약·완료 기준

- 외과적 변경 — 이 브리프에 없는 코드/포맷 수정 금지.
- 새 파일 첫 줄에 한국어 역할 주석.
- `npm run build` 실행 금지. 검증은 `cd safesys-app && npx tsc --noEmit`와 `npm run lint`.
- 완료 기준: tsc 0 에러, lint 통과(기존 워닝 제외), 카드 선택→2단계 진입 시 공통 기본정보 렌더.
- worker_done body에 tsc·lint 결과를 명시하고, 수정 파일 목록을 payload.filesModified에 담을 것.
