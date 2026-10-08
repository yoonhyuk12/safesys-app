<!-- SafeSys 아키텍처: 기술스택·Dashboard 중심 라우팅·라우트/API 구조·컴포넌트·유틸·타입 -->
# 아키텍처

SafeSys는 Next.js 15, React 19, Supabase로 구축된 한국의 건설 안전관리 시스템이다. 건설 프로젝트의 안전 점검(폭염, 관리자, 본부불시, TBM), 작업자 관리, 자재 원장, 문서 생성(PDF/Excel/HWPX)을 관리한다. PWA로 설계되어 모바일 현장 사용을 지원한다.

## 기술 스택

- **프론트엔드**: Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS 4
- **백엔드**: Supabase (PostgreSQL + Auth + Realtime)
- **지도**: Kakao Maps API, VWorld Map API, Leaflet
- **인증**: 역할 기반 접근 제어가 있는 Supabase Auth
- **문서 생성**: jsPDF + html2canvas (PDF), exceljs + xlsx (Excel), HWPX 내보내기
- **AI**: Claude API 연동 (일일점검, OCR, 번역, TTS, 위험분석, TBM 안전조언)
- **알림**: Telegram 봇 연동

## 핵심 패턴: Dashboard 중심 라우팅

**Dashboard.tsx** (`src/components/Dashboard.tsx`, ~4,300줄)가 전체 앱의 중앙 오케스트레이터다. 모든 뷰 전환, 데이터 로딩, 상태 관리가 이 컴포넌트에서 이루어진다.

```
layout.tsx (Root)
  └── AuthProvider → SupabaseProvider
        └── Dashboard.tsx (중앙 오케스트레이터)
              ├── viewMode에 따른 뷰 전환
              │   ├── 'safety' → Safety 대시보드 뷰들
              │   ├── 'tbm' → TBM 현황
              │   ├── 'map' → 지도 뷰
              │   ├── 'list' → 목록 뷰
              │   └── 'business' → 자재/사업관리
              └── 모달 컴포넌트들 (CRUD)
```

**viewMode 상태**:

```typescript
const [viewMode, setViewMode] = useState<'tbm' | 'map' | 'list' | 'safety'>()
const [selectedSafetyCard, setSelectedSafetyCard] = useState<string | null>(null)
const [selectedSafetyBranch, setSelectedSafetyBranch] = useState<string | null>(null)
```

## 라우팅 구조

**메인 라우트:**

| 경로 | 설명 |
| ---- | ---- |
| `/` | 사용자 역할에 따라 /tbm 또는 /safe로 리다이렉트 |
| `/safe/*` | 안전현황 대시보드 (아래 상세) |
| `/tbm` | TBM 현황 페이지 |
| `/tbm-view/[id]` | TBM 뷰 상세 (다국어 번역/복사 지원) |
| `/list` | 프로젝트 목록 뷰 |
| `/map` | 프로젝트 지도 뷰 |
| `/business` | 자재/사업관리 뷰 |
| `/project/[id]/*` | 프로젝트 상세 (20개 하위 페이지) |
| `/worker-register` | 작업자 등록 플로우 |

**안전현황 라우트 (`/safe/`):**

```
/safe                          # 전체 안전현황 개요
/safe/heatwave                 # 폭염점검 전체 현황
/safe/manager                  # 관리자점검 전체 현황
/safe/headquarters             # 본부불시점검 전체 현황
/safe/new-district-consulting  # 대표 계약 착공연도별 신규지구 안전컨설팅 (기본 3개월, 본부→지사→프로젝트 소계)
/safe/tbm                      # TBM 점검 현황
/safe/safeDocument             # 안전서류 현황
/safe/safetyInspection         # 안전점검 현황
/safe/newWorkerOrientation     # 신규작업자 교육 현황
/safe/worker                   # 작업자 관리 현황
/safe/accident-analysis        # 사고 이력·안전점검 통계 분석
/safe/branch/[branch]/         # 특정 지사 안전현황 (위 각 카테고리별 하위 경로 동일)
/safe/branch/[branch]/accident-analysis # 특정 지사 사고 통계 분석
```

모든 `/safe` 페이지 컴포넌트는 동일 구조 — `<Dashboard />`를 렌더링하고 URL pathname으로 상태를 결정한다.

**프로젝트 상세 라우트 (`/project/[id]/`):**
accident-report, daily-inspection, edit, equipment-inspection, headquarters-inspection, heatwave, holiday-work, issue-management, manager-inspection, material-ledger, new-worker-orientation, patrol-ledger, ptw, risk-assessment, safe-documents, safety-inspection-ledger, supervisor-diary, tbm-safety-inspection, tbm-submission, worker-management, work-plan

## API 라우트 (`src/app/api/`)

**AI 엔드포인트 (10개):**

- `/api/ai/daily-inspection` — AI 일일점검 생성
- `/api/ai/accident-report` — PDF·HWPX 사고보고 자동 채움 초안 추출(Bearer 인증·프로젝트 RLS 확인, Gemini)
- `/api/ai/extract-equipment-count` — OCR 장비 수량 추출
- `/api/ai/ocr-card` — 카드 OCR
- `/api/ai/supervisor-summary` — AI 감독일지 요약
- `/api/ai/tbm-safety-advice` — TBM 안전 조언
- `/api/ai/translate` — 번역
- `/api/ai/tts` — 텍스트 음성 변환
- `/api/ai/write-risk-analysis` — AI 위험분석 작성
- `/api/ai/patrol-ledger` — (AI) 순회점검대장 점검항목 생성 (Bearer 인증·프로젝트 RLS, gpt-6-luna 고정)
- `/api/ai/patrol-inspection` — KRC 패트롤 점검 엑셀용 재발방지대책·재해유형 작성 (Bearer 인증·관할 검증, gpt-6-luna)
- `/api/ai/patrol-corrective-plan` — KRC 패트롤 시정조치계획 초안 생성. Bearer 토큰·발주청 조직 관할 검증 후 저장된 지적만 사용하며 gpt-6-luna low로 고정한다. 최대 20건씩 처리하고 원문·지적유형을 반환해 클라이언트 목록 변경을 검사한다.

`/safe/patrol`의 시정조치요구서·조치결과 보고서·시정조치계획서는 `public/patrol-corrective/*.hwpx` 원본 양식을 사용한다. 상단 버튼은 현재 분기·조직 범위의 대상 점검을 개별 HWPX ZIP으로, 점검행 버튼은 HWPX로 내려받는다. 3종 모두 `getPatrolActionState(row).notApplicable`인 점검(지적유형 해당없음 또는 필요한 조치 전부 면제)은 AI 호출·문서 생성 전에 제외한다. 같은 지구의 다른 대상 점검은 유지하며, 대상·제외 건수를 표시하고 대상이 없으면 범위 버튼을 비활성화한다. 제외 점검의 개별 버튼은 대시로 표시하며 엑셀·원본 행·통계는 그대로 유지한다. 요구서는 현장사진이 있으면 지적별로 원본 큰 셀에 번호·본문·해당 현장사진을 넣고 쪽을 나눈다. 결과보고서는 지적별 전후 사진을 각각 연결하고 장문은 양식을 복제해 이어 쓴다. 점검부서장·서명·실제 완료일은 근거 없이 생성하지 않는다. 계획서 제출일은 해당 점검의 지적일을 사용한다. 계획서는 사진 없는 AI 텍스트 초안이며 제출 전 검토한다. 생성 모듈은 `src/lib/hwpx/patrol-corrective-hwpx-export.ts`, 배치·다운로드는 `src/lib/patrol-corrective-download.ts`다.

**외부 서비스 연동:**

- `/api/g2b/contract` — 나라장터 계약 조회. 프로젝트 상세 갱신은 `g2b-contract-period.ts`의 계약현황 공통 그룹 규칙으로 대표계약의 연차 내역까지 모아 전체 기간을 반영한다. 기존 착공일을 늦추거나 준공일을 앞당기지 않으며, 보조 조회 실패 시에도 기존 전체 기간을 보존한다. 금액·업체는 최신 계약 응답을 반영한다.
- `/api/weather/*` — 기상청 API (ASOS, 역사데이터, 체감온도)
- `/api/geocoding`, `/api/address-search` — 주소/좌표 변환
- `/api/telegram/*` — Telegram 알림 (텍스트/사진)
- `/api/hwp/*` — HWP 문서 변환/내보내기
- `/api/chat/tbm` — TBM AI 챗봇
- `/api/chat/project-assistant` — 프로젝트 현장 AI 비서(오늘 TBM 브리핑·감독 미서명 안내·tool calling 조회, gpt-6-luna)
- `/api/csi/quality-reports` — CSI 공개 성적서 열람 화면 스크래핑 조회 (GET, 로그인 불필요, `?source=api`면 공식 API)
- `/api/csi/self-quality` — CSI 로그인 후 사업 목록 또는 선택 사업의 자체 품질시험 실적 조회 (POST, SafeSys Bearer 필수, 자격증명 미보관)
- `/api/csi/self-quality/detail` — CSI 자체 품질시험 상세의 시험일·기준·결과·판정 조회 (POST, SafeSys Bearer 필수, 자격증명 미보관)

## 컴포넌트 구조

```
src/components/
├── Dashboard.tsx           # 중앙 오케스트레이터 (~4,300줄)
├── auth/                   # 인증 (LoginForm, SignUpForm, FindIdModal 등 8개)
├── common/                 # PWA (ServiceWorkerRegistration, UpdateNotifier 등 4개)
├── dashboard/              # 대시보드 뷰 (29개)
│   ├── ClientDashboard     # 발주청 뷰
│   ├── ContractorDashboard # 시공사 뷰
│   ├── AccidentAnalysisView # 사고 이력·안전점검 관계 분석 및 사고 관리
│   ├── AccidentEntryModal  # 본부급 이상 사용자의 사고 입력·수정 폼
│   ├── NewDistrictConsultingView # 신규지구 안전컨설팅 본부→지사→지구 3단 현황
│   ├── Safety*View         # 안전현황 카테고리별 뷰 (7개)
│   ├── *Status             # 점검 현황 요약 컴포넌트
│   └── BusinessMaterialView # 자재 관리
├── project/                # 프로젝트 관리 (20개 — 폼, 모달, 카드)
├── ui/                     # 재사용 UI (15개 — 지도, 서명, 주소검색 등)
└── worker-consent/         # 작업자 동의서 (5개 — 건강설문, 안전서약)
```

## 유틸리티 (`src/lib/`)

| 파일 | 역할 |
| ---- | ---- |
| `projects.ts` (~2,400줄) | 핵심 데이터 함수: 프로젝트 CRUD, 점검 데이터 조회, 타입 정의 |
| `supabase.ts` | Supabase 클라이언트 초기화 (lazy loading) |
| `supabase-admin.ts` | 관리자용 Supabase 클라이언트 |
| `auth.ts` | 인증 유틸리티 |
| `constants.ts` | 본부/지사 옵션, `DEBUG_LOGS` 플래그 |
| `weather.ts` | 기상청 API 연동 |
| `tbm.ts` | TBM 상태 관리 |
| `telegram.ts` | Telegram 봇 연동 |
| `ui-settings.ts` | UI 상태 영속화 (분기 토글) |
| `accident-analysis.ts` | `project_accidents` CRUD, 프로젝트 단위 사고 조회(`getProjectAccidents`), 3종 안전점검 조회·정규화, 분석 모듈 공개 진입점 |
| `accident-analysis-types.ts` | 사고 입력·조회 DTO, 점검 정규화 타입, 분석 결과 타입과 선택 옵션 |
| `accident-analysis-utils.ts` | 서울 달력일 계산과 점검 JSON 정규화 공통 유틸리티 |
| `accident-analysis-calculation.ts` | 프로젝트-월 단위 KPI, 월별 추이, 사고 전 30일·90일 점검 관계 계산 |
| `accident-permissions.ts` | 타인 사고보고 삭제 권한 판정(본사·관리자급 전사 권한과 본부 소속의 프로젝트 관할 대조). 수정은 현장 접근만 보므로 여기서 다루지 않는다 |
| `accident-report-format.ts` | 사고 중대도·산재신청 배지 클래스와 서울 시간대 고정 날짜 표기 |
| `accident-report.ts` | 사고발생보고서 추가 항목·사진의 공통 타입, 정규화와 검증 |
| `accident-report-import.ts` | PDF/HWPX 업로드 자동 채움 요청과 브라우저 HWPX 텍스트 추출 |
| `accident-report-extraction.ts` | 사고보고 AI 추출 프롬프트·허용 필드·응답 검증 |
| `hwpx/accident-report-hwpx-export.ts` | 평택지사 원본 양식에 사고발생보고 본문과 최대 2장 사진대지를 채워 HWPX 생성 |
| `new-district-consulting.ts` | 신규지구 안전컨설팅용 계약·본부 점검 페이지네이션 조회와 집계 진입점 |
| `new-district-consulting-utils.ts` | 대표 계약 시작일 해석, 달력 개월 인정 기한, 본부/지사 소계 재계산 순수 로직 |
| `equipment-inspections.ts` | 장비 일일점검 작성 초안 상태·항목 문구 수정·제출 전 검증(미점검·빈 문구·빈 서명 차단)·조회/제출/수정/삭제 |
| `equipment-inspection-guides.ts` | 장비 ID → 안내 그림 정적 자산 경로·원본 픽셀 크기 매핑(22개). 화면과 HWPX가 함께 쓴다 |

**사고 통계 분석 데이터 흐름:**

`/safe/accident-analysis` 또는 `/safe/branch/[branch]/accident-analysis` → `Dashboard` → `AccidentAnalysisView` → `accident-analysis.ts` → Supabase 순서로 연결된다. `AccidentEntryModal`이 사고 입력·수정 폼을 담당하며, 저장·수정·삭제 권한은 데이터베이스 RLS에서도 다시 제한한다. 모달은 두 가지 모드로 쓴다 — 대시보드는 프로젝트 검색과 미등록 현장 직접입력을 열어 두고, 선택적 `fixedProject`를 주면 그 현장으로 고정해 프로젝트 변경과 미등록 현장 입력을 막는다.

`project_accidents.project_id`는 `projects.id`를 참조하고 프로젝트 삭제 시 함께 삭제된다. 시스템에 없는 현장은 `project_id`를 비우고 `external_project_name`·`external_managing_hq`·`external_managing_branch`로 직접 입력할 수 있다. 미등록 현장 사고는 관할 발주청이 지사급까지 조회하고, 등록·수정·삭제는 본부급 이상만 한다. 조회 모듈은 이 사고 이력과 정기안전점검·관리자점검·본부불시점검을 공통 점검 타입으로 정규화하며, 계산 모듈이 프로젝트-월 및 사고 전 30일·90일 관계를 산출한다.

**프로젝트 사고보고:** `/project/[id]/accident-report` → `AccidentReportList`·`AccidentReportDetail`·`AccidentEntryModal`(`fixedProject` 고정) → `accident-analysis.ts` → `project_accidents`. 안전캐비넷 A(조치)의 서류철에서 들어간다. 사고 테이블을 새로 만들지 않으므로 여기서 올린 보고는 안전대시보드 사고현황 집계에 그대로 잡힌다. 목록은 `getProjectAccidents`가 그 프로젝트의 `project_id`만 최신순으로 페이지를 넘겨 가며 모두 읽어 다른 현장·미등록 현장 사고가 섞이지 않고 뒤쪽 사고가 조용히 빠지지도 않는다. 조회 실패는 빈 목록으로 감추지 않고 오류와 재시도 버튼으로 드러낸다. 등록과 수정은 그 현장을 열 수 있는 로그인 사용자면 누구나 하고(어느 현장을 열 수 있는지는 `projects`의 SELECT RLS가 판정한다. 남이 올린 보고를 고쳐도 `created_by`는 바뀌지 않는다), 삭제만 본인이 올린 보고이거나 `accident-permissions.ts`가 참으로 보는 본부급 관할일 때 연다. 목록·상세는 `canEdit`·`canDelete`를 따로 받아 수정 버튼과 삭제 버튼을 각각 감춘다. 화면은 세션 복원이 끝나기 전에 로그인으로 보내지 않는다.

**KRC 패트롤 점검:** `/safe/patrol` 또는 `/safe/branch/[branch]/patrol` → `Dashboard` → `PatrolInspectionView`에서 본부·지사·프로젝트별 점검을 조회한다. `headquarters_inspections.patrol_car_used = true`인 관할 점검만 분기별로 모으며, 준공 프로젝트의 과거 기록도 포함한다. 웹은 핵심 6열을 보여주고 `lib/excel/patrol-inspection-export.ts`는 전체 18열을 내보낸다. 엑셀은 빈 셀을 포함해 모두 가로·세로 가운데 정렬하고 확인자는 공란으로 둔다. 다운로드할 때만 서버 `OPENAI_API_KEY`로 재발방지대책과 재해유형을 작성한다. 조치완료일은 조치사진 파일명의 실제 업로드 시각을 서울 날짜로 바꾸며, 점검일로부터 7일 초과한 지연 건은 음영 처리한다. 날짜 근거가 없는 완료 건은 일자 미기록으로 표시한다.

패트롤 3종 HWPX의 자동 입력 글자는 신명조(한글 등록명 `한양신명조`, HFT) 13pt이며 언어별 글꼴 참조를 사용한다. 원본 제목·라벨·셀 치수를 기준으로 본문 줄 수를 줄여 다음 양식으로 이어 쓴다. 요구·결과 사진은 셀 높이에서 본문 줄 수(13pt·160%)·셀 여백·그림 기준선 여유를 뺀 공간에 비율을 유지해 최대한 확대하고 가로 가운데 정렬한다. 긴 공사명으로 요구서 상단 행이 늘어나면 본문 셀 높이를 줄여 표 전체 높이를 유지한다. 계획서는 사진 없이 `□ 시정조치계획`·`□ 재발방지·확인계획` 아래에 두 칸 들여쓴 `- ` 개조식 항목을 넣는다. AI는 각 필드 1~3개 항목을 `예정` 또는 `계획` 명사형으로 작성하며 서버는 불릿·공백만 정리하고 서술형 응답은 재생성 오류로 거절한다. 참조 계획서의 본문 행 높이27396, LEFT·210% 문단, 항목 내어쓰기2688(구형 default5376), 좌우 문단 여백0을 코드로 적용한다. 13pt 전각·영문·공백 폭과 어절 줄바꿈, 실제 셀 폭7014/40913 및 높이로 전체 표시 줄 수를 계산한다. 계획 본문은 오른쪽210%·왼쪽160%를 우선 유지하고, 넘치는 셀만 한 쪽에 들어가는 최대 정수 줄간격(최소130%)으로 줄인다. 해당 셀 전용 문단 서식을 복제하므로 오른쪽 제목·항목은 같은 간격과 LEFT·내어쓰기를, 왼쪽은 CENTER를 유지하며 메타데이터·서명·사진 서식은 바뀌지 않는다. 130%에서도 넘치면 그 간격으로 다음 양식에 이어 쓰고 원문을 모두 보존하며 문단 내부는 한글 자동 줄바꿈으로 유지한다. 긴 공사명·점검자·서명·수신자 증가 높이는 본문 예산에서 확보한다. 요구서·계획서의 점검자 입력은 가운데 정렬하고 계획서 하단 제출일은 각 점검의 `inspection_date`를 `YYYY년 MM월 DD일`로 표시한다. 작성자는 `현장대리인 {projects.user_profiles.full_name}`, 검토자는 `공사감독 {projects.supervisor_position} {projects.supervisor_name}`으로 채우고 누락된 정보는 비운다. 기존 소유자 관계와 RLS를 유지하며 3종 모두 기존 서명 문단에 오른쪽 정렬·오른쪽 여백20pt로 표시한다(요구서의 입회자·확인자는 작성자·검토자로 바꾼다). 서명 이미지는 생성하지 않는다. 결과보고서의 각 지적 페이지는 해당 조치사진 업로드일(서울)을 상단 `5. 조치완료일`과 하단 날짜에 동일하게 채우고, 하단은 신명조 13pt·가운데 정렬한다. 업로드일 근거가 없으면 날짜를 비워 둔다. 한글 다운로드는 실행한 버튼만 스피너와 진행 문구를 표시하며, 계획서는 AI 단계에 `AI 생성 중…`, 이후 `파일 생성 중…`을 표시하고 완료·실패 시 해제한다.

**(AI) 장비 일일점검 대장:** `/project/[id]/equipment-inspection` → `EquipmentPicker`(장비 23종) → `EquipmentInspectionForm`(원문 항목별 적합·부적합·해당없음 + 점검자 직접 서명) → `equipment-inspections.ts` → `equipment_daily_inspections`. 원본은 `docs/일일안전점검 체크리스트 양식.pdf`이며 항목은 `lib/equipment-inspection-catalog.ts`의 고정 원문 카탈로그다 — AI라는 명칭은 대장 이름일 뿐 점검 항목을 생성하지 않는다. 장비를 바꾸면 항목이 통째로 달라지므로 이전 응답과 서명을 초기화한다. 점검항목 문구는 현장 실정에 맞게 고쳐 쓸 수 있으며, 고친 문구는 그 점검의 `answers`에만 담기고 카탈로그는 바뀌지 않는다(항목 ID·분류·순서는 유지). 제출한 점검은 작성자 본인이 상세의 `수정`으로 고칠 수 있고, 이때 점검표는 지금의 카탈로그가 아니라 저장 당시 `answers` 스냅샷으로 되살린다. 미점검 항목이 남았거나 문구가 비었거나 서명이 비면 화면과 DB CHECK가 함께 제출을 막고, 내용이 바뀌면 서명이 무효가 되어 다시 서명해야 한다. 점검자 서명은 개인 지정 서명이라 일괄서명 대상이 아니다. 원본 점검표의 장비 도해는 `public/equipment-inspection/guides/{장비ID}/guide-0N.jpeg`에 원본 바이트 그대로 두고 `lib/equipment-inspection-guides.ts`가 장비 ID·원본 픽셀 크기와 함께 들고 있다. `EquipmentGuideImages`가 작성 폼과 상세의 기본사항 아래·점검 항목 위에 원본 비율로 표시하며 원본 픽셀 폭을 넘겨 확대하지 않는다. HWPX는 서명 행과 표머리 사이에 안내 행을 하나 두고 그 위에 그림을 겹치며, 그 높이를 쪽 예산에 반영한다. 준설선·쇄석기는 원본에 도해가 없어 빈 자리를 만들지 않고, 덤프트럭만 두 장을 나란히 둔다.

**장비 점검표 HWPX는 반드시 A4 한 장이다.** `lib/hwpx/equipment-inspection-hwpx-export.ts`는 쪽을 나누지 않는다 — 표는 항상 하나이고 계속 쪽·`(계속)` 머리는 없다. 한 장에 담는 방법은 두 가지다.

1. **조판 단계 사다리(`FIT_PROFILES`).** 읽기 좋은 9pt/줄간격 130%부터 9pt/120% → 8.5pt/120% → 8pt/115%(읽기 하한) 순으로 내려가며, 처음으로 한 장에 담기는 단계를 쓴다. 단계마다 본문·제목 글자 크기, 줄 간격, 셀 여백, 제목·기본정보·서명 행의 최소 높이가 함께 바뀌며 `header.xml`의 `charPr`·`paraPr`도 그 단계에서 생성된다. 23종 카탈로그에 보통 길이 비고를 붙이면 12종이 9pt, 5종이 8.5pt, 6종이 8pt로 담긴다.
2. **안내 그림 높이 적응.** 남는 높이를 그림이 비율 그대로 받는다(`GUIDE_MAX_HEIGHT` 19000까지). 하한 `GUIDE_MIN_HEIGHT`(9000, 약 32mm)를 밑돌면 그림을 더 줄이는 대신 다음 조판 단계로 내려가고, 마지막 단계에서만 `GUIDE_FLOOR_HEIGHT`(4000)까지 더 줄여서라도 담는다.

세로 여백은 위·아래 각각 12mm(여백 2400 + 머리말/꼬리말 1000)로, 한글 기본 25.4mm에서 줄여 본문 높이 77388을 확보한 값이다. 가로 여백 15mm와 본문 폭 51024는 그대로다. 자리 계산은 **"가장 높은 점검 행 × 항목 수"**로 잡는다 — 점검 항목 행은 모두 같은 높이가 되므로, 자연 높이 합으로 재면 두 줄짜리 문장이 한 줄 높이로 눌려 한글이 스스로 행을 늘리고 쪽이 넘어간다. 남는 높이는 마지막에 점검 행이 고르게 나눠 가져 표가 쪽 아래까지 정확히 닿는다.

8pt로도 담기지 않으면 글자를 잘라 내거나 조용히 두 쪽으로 늘리지 않고 `한 장에 담을 수 없습니다`로 다운로드를 거부한다(기본정보가 원인이면 `기본정보가 너무 길어`). 화면은 이 메시지를 `alert`로 그대로 보여 준다. 문단·그림 개체 번호는 모듈 전역이 아니라 출력 한 건마다 만드는 `DocumentIds`에서 나오므로 동시에 여러 건을 내려받아도 번호가 섞이지 않는다.

**문서 생성:**

- `lib/reports/` — PDF 보고서 12개 (jsPDF + html2canvas)
- `lib/excel/` — Excel 내보내기 10개 (exceljs)
- `lib/hwpx/` — HWPX 내보내기 9개 (장비 일일점검 포함)

## 주요 타입 (`src/lib/projects.ts`)

```typescript
// UserProfile: role('발주청'|'감리단'|'시공사'), hq_division, branch_division, is_admin
// Project: is_active는 boolean 또는 분기별 JSONB 객체
// HeatWaveCheck, ManagerInspection, HeadquartersInspection
// TBMSafetyInspection, SafeDocumentInspection, TBMRecord
```

## Next.js 설정 (next.config.ts)

- **빌드 설정**: TypeScript/ESLint 오류가 빌드를 차단하지 않음
- **출력 모드**: `standalone`
- **캐시 비활성화**: 모든 경로에 no-cache 헤더
- **Webpack**: punycode deprecation 경고 억제

## 데이터 로딩 패턴

- 지연 로딩: 특정 카드/뷰 선택 시에만 데이터 로드
- ref 기반 캐시로 중복 요청 방지
- 사용자 역할/viewMode 조건 확인 후 데이터 로드

## UI / PWA

- ShadCN 사용: `npx shadcn@latest add [component-name]` (deprecated된 `shadcn-ui` 사용 금지)
- 아이콘: Lucide React (`import { IconName } from "lucide-react"`)
- 사용 전 `src/components/ui/` 디렉터리에서 설치 여부 확인
- PWA: 서비스 워커 자동 등록, 설치 프롬프트, 업데이트 알림 시스템
