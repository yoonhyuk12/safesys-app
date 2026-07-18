# 굴착 작업계획서 구현 3차 브리프 (Codex 워커용) — PDF 생성기

## 사전 필독

- `plans/20260718_굴착작업계획서.md`, `safesys-app/scratch/excavation-plan-analysis.md` §2(원문 표 구조)
- `src/lib/reports/work-plan/work-plan-pdf-common.ts` — 공용 조각(CELL·LABEL·TABLE·cell·sectionTitle·colgroup·mapSection·riskControlTable·checklistTable·personBlock·signedName·buildFileName·renderWorkPlanPdf). 기존 헬퍼를 최대한 재사용한다.
- 기존 생성기 예: `work-plan-construction-pdf.ts`(86줄), `work-plan-electric-pdf.ts`(147줄) — 파일 구조·스타일을 그대로 따른다.

## 범위

**신규 `src/lib/reports/work-plan/work-plan-excavation-pdf.ts`** — `downloadExcavationWorkPlanPdf(record: WorkPlanRecord): Promise<void>` 내보내기. 그리고 스텁 교체 2곳: `WorkPlanWizard.tsx`의 `WORK_PLAN_DOWNLOADERS.excavation`, `app/project/[id]/work-plan/page.tsx`의 `workPlanPdfDownloaders.excavation`.

`record.form_data.excavation`이 없으면 `throw new Error('굴착 작업계획서 데이터가 없습니다.')`.

## 페이지 구성 (renderWorkPlanPdf의 pagesHtml 배열)

원문 42쪽을 아래 10~13쪽으로 압축 재현한다. 모든 표는 공용 CELL/LABEL/TABLE 스타일.

### 1쪽 — 표지 (전용 함수, 공용 coverPage 사용 금지)

원문 p.1 재현. 전체 2px 테두리 상자 안에.
- 상단: 파란 headerNote `지반 굴착 작업계획서_고용노동부 표준 양식(2021)`
- 중앙 제목 상자: `지반 굴착 작업계획서`
- `[목 차]` + `EXCAVATION_TOC` ①~⑨
- **[원청업체 작성 및 검토] 결재표**: 회사명(companyName)·현장명(title) 2행 + 작성일(work_start_date 기준 또는 오늘) + 작성자·검토자·검토자·현장소장 4행. 각 행 끝 `(인)` 문구 위에 해당 서명 이미지를 겹쳐 배치한다 — `signatures.approvalManager`(작성자), `approvalReviewer1`(검토자 1행), `approvalReviewer2`(검토자 2행), `approvalApprover`(현장소장). 구현: `(인)`을 `<span style="position:relative">…</span>`로 감싸고 서명 img를 `position:absolute; 중앙 정렬; 크기 약 60×36px`로 올린다. 성명·직위 텍스트는 가리지 않는다(서명은 `(인)` 위에만).
- 하단: 파란 `EXCAVATION_SAMPLE_NOTE`

### 2쪽 — 작업개요

- `1. 작업개요` 섹션 제목 + 현장 개요표: 회사명(companyName)/현장주소(record 접근 불가 시 title에 포함된 주소 그대로 두고 셀은 overview.sitePhone 옆 배치 유지)… 단순화: 4행 2열쌍 표 — 회사명·현장 전화번호(overview.sitePhone), 현장명(title)·공사규모(overview.siteScale), 공사기간(workStartDate~workEndDate, dateRange 사용)·현장관계자(workDirector personBlock)
- 굴착작업 개요표: 협력업체명·업체 전화번호, 작업담당자(overview.partnerManager personBlock), 굴착공사 기간(workStartDate~EndDate), 굴착 깊이(depth)·굴착면적(area)·터파기 물량(volume), 굴착방법(method), 사용기계 및 장비(equipmentSummary), 흙막이공법·수량·지보공법·수량(shoring.applied일 때만 행 표시, 아니면 '해당없음' 1행)
- 작업내용 공유(sharedWorkContent)가 있으면 하단에 왼쪽 정렬 셀로

### 3쪽 — 사전조사

- 지하매설물 조사표: `지중매설물/확인결과(위치)/조치여부/담당기관(연락처)` 헤더 + utilities 행
- 매설물 작업안전수칙: `EXCAVATION_UTILITY_SAFETY_RULES` 목록
- 지반 사전조사표: `조사항목/조사결과` 2열 — `CONSTRUCTION_SURVEY_ITEMS.excavation` 5항목과 surveyEntries의 finding 매칭(itemIndex)

### 4쪽 — 필요 인원 및 장비 사용계획

원문 p.9 구조: `구분/항목/규격/수량/용도/작업기간/비고` 7열. `장비` rowspan으로 equipmentRows, `인원` rowspan으로 manpowerRows(규격 열에 담당작업 task 출력). 행이 없으면 빈 행 1개.

### 5쪽 — 굴착공사 표준 절차

- 표준 흐름: `EXCAVATION_STANDARD_FLOW`를 `→`로 연결한 한 줄 상자
- `EXCAVATION_STANDARD_PROCEDURES` 5그룹을 `1) 현황조사 및 측량` 형식 제목 + 항목 리스트로. 분량상 1쪽 초과가 예상되면 2쪽으로 분할(그룹 경계에서 나눔)

### 6쪽 — 작업계획도

공용 `mapSection('굴착 작업계획도', record.map_image_url)` + 하단에 `EXCAVATION_TRAFFIC_RULES` 목록(`ㅇ 차량 운행·유도 기준` 제목).

### 7쪽 — 배수계획·단계별 안전대책

- `배수방법` 라벨 + drainagePlan 왼쪽 정렬 셀(비면 &nbsp;)
- `EXCAVATION_STAGE_SAFETY`를 `작업순서/안전작업계획` 2열 표로(stage당 1행, items는 `1. …<br/>2. …`)

### 8쪽 — 발파작업 계획 (blasting.applied일 때만 페이지 포함)

- 발파 개요표: 발파공법(method)·발파구역(area)·발파량(amount)·화약관리자(managerName)·경보·통제방법(controlMeasure)
- `EXCAVATION_BLASTING_SAFETY` 4단계 2열 표(위와 동일 형식). 분량 크면 2쪽 분할

### 9쪽 — 흙막이 및 지보공 (shoring.applied일 때만)

- 개요표: 흙막이공법·수량·지보공법·수량
- 사용재료표: `품목/규격/단위/수량` + materials 행
- `EXCAVATION_SHORING_SAFETY` — group별 소제목 + stage 2열 표. 분량이 크므로 group 단위로 페이지 분할(H-Pile 1쪽, 지보재+어스앙카 1쪽 정도)

### 10쪽 — 지반 계측계획 (instrumentation.applied일 때만)

`계측항목/설치위치/수량/측정시기/측정빈도/비고` 6열 + rows. 하단 주석 `※ 관리기준치는 구조기술자 승인값 기준`.

### 11쪽 — 작업지휘자·비상연락·경보

- `작업지휘자 배치기준`: `EXCAVATION_DIRECTOR_RULES` 목록 + 작업지휘자·운전원·유도자 personBlock 표
- `비상경보 발령조건`: EXCAVATION_ALARM_CONDITIONS 목록
- `경보방법`: EXCAVATION_ALARM_SIGNALS `구분/경보방법` 2열 표
- `경보시설`: EXCAVATION_ALARM_EQUIPMENT `구분/관리방법` 2열 표
- `비상연락망`: emergencyContacts `기관/전화번호` 2열 표(전화 빈 행도 그대로 출력)

### 12쪽 — 위험요인 및 개선대책

공용 `riskControlTable('위험요인 및 개선대책', '작업단계', riskControls)`.

### 13쪽 — 점검 체크리스트

공용 `checklistTable('굴착작업 안전점검 체크리스트', EXCAVATION_CHECKLIST, checklist)`.

## 파일명·헤더

- 파일명: 공용 `buildFileName('excavation', title, work_start_date)` 사용.
- 2쪽 상단에만 공용 `approvalHeader`를 쓰지 말 것 — 결재는 표지(1쪽)에서 처리했으므로 본문 페이지는 `sectionTitle`부터 시작.

## 제약·완료 기준

- 파일 첫 줄 한국어 역할 주석. 기존 생성기와 동일한 import·코드 스타일.
- `escapeHtml`을 모든 사용자 입력 값에 적용.
- 다른 워크스트림 파일(Dashboard.tsx 등) 수정 금지. 스텁 교체 2곳 외 기존 서식 코드 수정 금지.
- 완료 기준: `npx tsc --noEmit` 0 에러, `npm run lint` 통과. `npm run build` 금지.
- worker_done body에 tsc·lint 결과 명시, filesModified 목록 포함.
