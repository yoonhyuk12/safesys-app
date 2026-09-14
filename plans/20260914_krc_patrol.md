# KRC 패트롤 점검 Implementation Plan

**Goal:** 패트롤카 이용 본부불시점검을 조직별로 조회하고 AI 작성 열을 포함한 Excel을 다운로드한다.
**Architecture:** Dashboard 기존 조직 탐색 패턴과 별도 PatrolInspectionView를 연결한다. 신규 patrol-inspections 모듈에서 원본 점검 조회·조치판정을 공유하고 ExcelJS와 인증된 AI API를 이용한다.
**Tech Stack:** Next.js 15, React 19, Supabase, ExcelJS 4.4, OpenAI gpt-5.6-luna.
**Spec:** 현재 사용자 Design Feedback /safe와 headquarters-inspection. patrol_car_used=true만 대상.

## 제약과 결정
- 기존 디자인 시스템과 사용자 관할 권한을 유지한다. Worker 구현, Advisor 검증·커밋. build와 push는 실행하지 않는다.
- 체크리스트·컨텍스트 노트는 plans/20260914_krc_patrol/에 둔다.
- 한 점검당 한 행, 지적내용1·2를 같은 셀에 번호와 줄바꿈으로 포함한다.
- 조치완료는 실제 필요한 조치사진이 모두 있는 경우다. 날짜는 실제 사진 등록일을 사용하며 기록이 없으면 미기록으로 표시한다. updated_at을 완료일로 추측하지 않는다.
- 점검일과 조치완료일(미완료는 서울 오늘) 차이가 7일보다 크면 날짜 셀/상태에 음영. 해당없음 제외.
- AI는 다운로드 시 서버 OPENAI_API_KEY와 지정 모델을 사용한다. 조치가 실제 이행되었다고 지어내지 않고 재발방지 제안으로 작성한다. 확인자는 점검자와 다르므로 공란으로 두며, 비고도 원본에 없으면 비운다.
- 사용자 추가 요청에 따라 헤더·데이터·빈 셀 모두 가로 가운데·세로 중앙 정렬과 줄바꿈을 적용한다.

## Task A — worker-opus 데이터·엑셀·AI
**Files:** src/lib/patrol-inspections.ts, src/lib/patrol-inspection-utils.ts(필요시), src/lib/excel/patrol-inspection-export.ts, src/app/api/ai/patrol-inspection/route.ts, 관련 tests. 사진 등록일은 기존 스토리지 파일명의 실제 업로드 시각을 재사용하며 원본 업로드 흐름은 수정하지 않는다.
**Interface:** getPatrolInspections(projectIds: string[], quarter: string): Promise<PatrolInspection[]>; PatrolInspection은 HeadquartersInspection 확장, patrol_car_used/finding_type/사진별 등록일 필드 제공. getPatrolActionState(inspection, today?) 반환 {completed:boolean, completedDate:string|null, overdue:boolean, notApplicable:boolean}. downloadPatrolInspectionExcel(projects: Project[], inspections: PatrolInspection[], quarter: string, onProgress?: (current:number,total:number)=>void): Promise<void>.
- [x] 사진필수·지적2·7/8일 경계·기간·해당없음 테스트 RED.
- [x] RLS 클라이언트로 projectIds와 분기, patrol_car_used=true를 모두 필터링하고 페이지네이션 구현.
- [x] AI API에서 Bearer 인증·원본 점검별 관할 확인, 입력 상한과 시간제한, 엄격한 JSON 응답 검증. 고정 gpt-5.6-luna와 사용량 기록.
- [x] Excel 열 순서: 순번/본부/지사/사업구분/사업명/총사업비(백만원)/시공사명/지적유형/지적일(점검일)/지적내용/조치내용(재발방지대책)(AI작성)/재해유형(AI작성)/점검종류/작업주소/조치완료일/공사감독/확인자/비고. 다운로드만 AI 호출, 배치처리·실패 알림.
- [x] 테스트 GREEN, lint/typecheck 수행하고 보고. 새 패키지 불필요.

## Task B — worker-opus 화면
**Files:** src/components/Dashboard.tsx, src/components/dashboard/PatrolInspectionView.tsx, src/app/safe 아래 필요한 page.tsx.
**Consumes:** Task A 위 3 함수. 타입 import '@/lib/patrol-inspections'.
- [x] 기존 FiveKeyStatusView와 수시 위험성평가 카드·라우팅 재사용 조사.
- [x] 카드명 KRC 패트롤 점검. 본부→지사→프로젝트 점검 테이블, 권한에 따라 시작 단계 제한, 분기 필터·뒤로가기·로딩/오류/빈상태.
- [x] 웹 핵심 열 사업명/점검일/지적유형/지적내용/조치상태(완료일)/공사감독. 프로젝트 점검으로 연결. 해당 목록 전체를 AI 엑셀 다운로드.
- [x] 배지·지연 음영·진행표시·중복 다운로드 방지. 모바일 가로 스크롤.
- [x] lint/typecheck와 접근 가능한 화면 확인 후 보고.

## Task C — 검토와 통합
- [x] 독립 Worker 코드 리뷰, Advisor diff·보안·테스트 직접 검증.
- [x] 실제 /safe 카드→본부→지사→프로젝트 탐색, 새로고침 및 엑셀 확인.
- [x] docs/architecture.md에 기능 기록, 체크리스트 갱신, 관련 파일만 conventional commit.

## 선행 조사
- 기존 패트롤 필드와 finding_type은 20260914_hq_patrol_finding_type 작업에 이미 존재한다.
- 기존 headquarters 조회는 새 필드를 변환에서 누락하므로 패트롤 전용 모듈로 조회한다.
- gh search code로 ExcelJS 기존 패턴 조사, ExcelJS 공식 README 확인. 설치된 exceljs 4.4 재사용.
- OpenAI 공식 모델 페이지와 structured-outputs 가이드 확인. https://developers.openai.com/api/docs/models/gpt-5.6-luna 및 https://developers.openai.com/api/docs/guides/structured-outputs.
