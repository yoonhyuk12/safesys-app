# 굴착 작업계획서 구현 2차 브리프 (Codex 워커용)

## 사전 필독

- `plans/20260718_굴착작업계획서.md` (확정 설계), `safesys-app/scratch/excavation-plan-analysis.md` (원문 구조 §2 참고)
- 1차 결과물: `excavation-constants.ts`, `types.ts`의 `ExcavationWorkPlanFormData`, `WorkPlanWizard.createPlanForm` 굴착 분기
- 기존 UI 패턴: `WorkPlanForm.tsx`의 `Field`·`Section`·`renderPerson`·`renderQuickFill`, `DeferredInfoStep.tsx`의 서식별 렌더·체크리스트 패턴, `SignatureStep.tsx`의 슬롯 패턴

## 이번 웨이브 범위

**목표: 굴착 서식의 입력 UI 전체(2단계 기본정보 + 5단계 나중 확인 + 6단계 서명)와 AI 초안 라우트 지원.** PDF는 웨이브 3.

### 1. `WorkPlanForm.tsx` — `renderExcavation` 확장 (2단계 기본정보)

`renderCommon('excavation')` 아래에 굴착 전용 섹션을 추가한다. 기존 `Section`·`Field`·`renderPerson`·`renderQuickFill` 컴포넌트를 재사용하고 새 스타일을 만들지 않는다.

**섹션 A. 굴착공사 개요** (`overview` — `updateNested('excavation', 'overview', ...)` 패턴)
- 현장 전화번호(sitePhone), 공사규모(siteScale)
- 협력업체명(partnerCompany), 업체 전화번호(partnerPhone)
- 작업담당자(partnerManager) — `renderPerson` 재사용
- 굴착 깊이(depth, placeholder "예: GL(-)4.5m"), 굴착면적(area, placeholder "예: 500㎡"), 터파기 물량(volume, placeholder "예: 2,000㎥")
- 굴착방법(method, placeholder "예: 개착식 굴착(기계식)"), 사용기계 및 장비(equipmentSummary, placeholder "예: 굴착기, 덤프트럭")
- 참고: `overview.excavStartDate/excavEndDate`는 UI에 노출하지 않는다(공통 작업 시작·종료일을 굴착 기간으로 사용, PDF도 동일 방침).

**섹션 B. 지하매설물 조사** (`utilities` 반복행)
- 각 행: 종류(kind)·확인결과/위치(finding)·조치 여부(action)·담당기관/연락처(agency) 4열 입력
- 행 추가·삭제 버튼(기존 배열 편집 패턴 참조), 각 행에 "해당없음" 퀵 버튼 → finding·action을 '해당없음'으로 채움
- 초기 4행(도시가스·상수도·전기·통신)은 createPlanForm이 이미 생성

**섹션 C. 배수·조건부 공정**
- 배수방법(drainagePlan) — textarea 1개, placeholder "예: 집수정 설치 후 양수기 2대로 우수관 배수"
- 발파 작업 토글(blasting.applied, 체크박스 "발파 작업 있음") → 켜면 공법(method)·발파구역(area)·발파량(amount)·화약관리자(managerName)·경보·통제방법(controlMeasure) 표시
- 흙막이 가시설 토글(shoring.applied, "흙막이 가시설 있음") → 켜면 흙막이공법(wallMethod, placeholder "예: H-Pile + 토류판")·수량(wallQuantity)·지보공법(supportMethod, placeholder "예: 어스앙카")·수량(supportQuantity) 표시 (재료 반복행은 5단계)
- 지반 계측 토글(instrumentation.applied, "지반 계측 있음") — 켜면 안내 문구 "계측기 상세는 5단계(나중 확인 정보)에서 입력합니다." 표시
- 토글이 꺼진 섹션의 기존 입력값은 유지한다(삭제하지 않음)

### 2. `DeferredInfoStep.tsx` — `renderExcavation` 신규 (5단계)

기존 서식 렌더 패턴(496~499행 분기)에 `{type === 'excavation' && renderExcavation()}` 추가. 내용은 나중에 확인 가능한 정보들.

- **장비 사용계획** (`equipmentRows`): 항목(name)·규격(spec)·수량(quantity)·용도(purpose)·작업기간(period)·비고(note) 반복행 + 행 추가·삭제
- **인원 투입계획** (`manpowerRows`): 직종(role)·담당작업(task)·인원(count)·작업기간(period)·비고(note) 반복행
- **흙막이 사용재료** (`shoring.materials`): shoring.applied가 true일 때만 표시. 품목(item)·규격(spec)·단위(unit)·수량(quantity) 반복행
- **지반 계측계획** (`instrumentation.rows`): applied true일 때만. 계측항목(item)·설치위치(location)·수량(quantity)·측정시기(timing)·측정빈도(frequency)·비고(note) 반복행 + 안내 문구 "관리기준치는 구조기술자 승인값을 기재하세요."
- **사전조사 결과** (`surveyEntries`): `CONSTRUCTION_SURVEY_ITEMS.excavation` 5항목 각각에 조사결과(finding) 입력 — 건설기계 서식의 surveyEntries 편집 UI가 있으면 패턴 재사용
- **비상연락망** (`emergencyContacts`): 기관명(agency)·전화번호(phone) 반복행. 프리셋 9행은 이미 초기화됨. 행 추가·삭제 가능
- **체크리스트**: 기존 서식들과 동일한 체크리스트 UI 패턴으로 `EXCAVATION_CHECKLIST` 15항목(양호/미흡/해당없음 + 비고)

### 3. `SignatureStep.tsx` — 굴착 서명 슬롯 (6단계)

- 굴착 선택 시 결재란 4단 슬롯: 작성자(approvalManager)·검토자 1(approvalReviewer1)·검토자 2(approvalReviewer2)·현장소장(approvalApprover)
- 현장 역할 슬롯: 작업지휘자(workDirector)·운전원(operator)·유도자(guide) — 기존 COMMON_ROLES 패턴 재사용
- 기존 서식과 슬롯 병합 로직(중복 역할 제거)이 있으면 그 패턴을 따른다

### 4. `api/ai/work-plan/route.ts` — AI 초안 지원

- `VALID_PLAN_TYPES`에 `'excavation'` 추가
- 서식 가이드라인 case 추가: `- ${planLabel(type)}(excavation): 지반 굴착 작업. 굴착면·흙막이 붕괴, 토사 매몰, 장비 협착·충돌, 지하매설물(가스·전기·상수도) 파손, 굴착 단부 추락, 토사반출 차량 위험 관점으로 위험요인·개선대책을 작성한다.`
- JSON 스키마: 공통 `sharedWorkContent`+`riskControls`만 사용(굴착 전용 초안 필드 없음). construction처럼 별도 필드를 만들지 않는다.
- `surveyType` 관련: 기존 `planTypes.includes('construction')` 조건이 굴착 선택 시에도 굴착 사전조사 컨텍스트를 넣을 수 있으면 최소 수정으로 반영하되, 복잡하면 생략(위험표 초안만으로 충분).

### 5. 손대지 말 것

- `AiReviewStep.tsx` — 1차에서 이미 excavation이 CommonType에 포함됨. 추가 수정 금지.
- `MapDrawingEditor`, PDF 생성기(웨이브 3), DB·storage 로직.
- 다른 워크스트림 파일(Dashboard.tsx, WorkPlanStatusView.tsx, accident-analysis 관련) 절대 수정 금지.

## 제약·완료 기준

- 외과적 변경. 이 브리프에 없는 수정 금지. 기존 스타일·컴포넌트 재사용.
- `Field`·`Section` 등 기존 헬퍼로 해결이 안 되는 반복행 편집은 각 파일 안에서 기존 배열 편집 패턴(전기 workers 등)을 따라 구현.
- 불변성 유지 — 배열·객체는 spread로 갱신(기존 updatePlan/updateNested 패턴).
- 완료 기준: `npx tsc --noEmit` 0 에러, `npm run lint` 통과(기존 워닝 제외). `npm run build` 금지.
- worker_done body에 tsc·lint 결과 명시, filesModified에 수정 파일 목록.
