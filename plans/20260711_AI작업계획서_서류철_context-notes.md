# AI 작업계획서 컨텍스트 노트

## 2026-07-11 계획 수립

- **라우트 스텁 존재** — `src/app/project/[id]/work-plan/page.tsx`가 "준비중입니다" 상태로 이미 있음. 진입 폴더(DocumentFolder)만 안전캐비넷 P 그룹(page.tsx line 1412~1444)에 추가하면 연결 완료.
- **양식 소스** — 바탕화면 붙임2-1~2-4 PDF(개정 2025-09-11, 한국농어촌공사 수급업체용). 표지+본표+지도+위험요인/개선대책+체크리스트 구조. 체크리스트 문항 수는 2-1이 12, 2-2가 18, 2-3이 9, 2-4가 13 — 전부 고정 텍스트라 상수 하드코딩하기로 결정(AI 생성 대상 아님).
- **지도 방식 결정(사용자 지시로 변경)** — 당초 Leaflet + V-World 위성 타일을 검토했으나, 사용자 지시로 **카카오맵**으로 확정. 기본 위성(HYBRID) + 일반지도 토글 + **현장 전경 사진 업로드** 배경 옵션 3종. 드로잉은 SignaturePad.tsx의 raw canvas 패턴을 배경 위 absolute 오버레이로 재사용. "배경 확정(지도 캡처 또는 사진) → 드로잉" 2단계 UX로 좌표계 문제(지도 팬 시 드로잉 어긋남)를 회피. 카카오 타일 CORS로 캡처가 막히면 타일 프록시 폴백, 최후엔 사진 업로드 배경이 대안.
- **카카오 SDK는 이미 전역 로드** — 초기 탐색 보고("지도는 V-World/Leaflet만")가 틀렸음. `layout.tsx:60`에서 appkey 포함 SDK(`libraries=services`)를 전역 로드 중이고 `KakaoMap.tsx`·`SimpleProjectMap.tsx`·`weather.ts`(Geocoder)가 이미 사용. 키 발급·env 추가 작업 불필요.
- **저장 이중화** — map_drawing(벡터 JSON, 재편집용) + map_image_url(합성 PNG, PDF·목록용) 둘 다 저장. base64를 DB에 넣지 않고 Storage 버킷 `work-plans` 사용(서명 base64 관행과 달리 이미지가 커서).
- **AI 패턴** — `api/ai/inspection-checklist`(Gemini gemini-3.1-flash-lite, GEMINI_API_KEY, responseMimeType json) 복제가 기준. OpenAI 패턴도 있으나 문서 생성 주력은 Gemini.
- **PDF 패턴** — `src/lib/reports/quality-monthly-report.ts`(html2canvas+jsPDF, 오프스크린 div, 맑은 고딕, applyHtml2canvasTextFix) 기준. 한글 폰트 임베딩 불필요.
- **자동 인입 소스** — projects(project_name, 주소, 좌표, supervisor_*, managing_hq/branch, g2b_corp_nm, construction_schedule), workers(작업자·지휘자 후보), 대표계약. 장비 전용 테이블은 없어 장비 제원은 수기 입력.
- **서명란 범위 제외** — 1차는 출력 후 수기 서명. 손글씨 서명 겹침(feedback_signature_rendering 참고)은 추후 확장.
- **마이그레이션 실행 주체** — 기존 관행대로 SQL 파일 작성 후 사용자가 Supabase 콘솔 실행. 실행 전 main 푸시 금지.
- **토큰 한도 대응** — 4개 Phase로 분할, Phase별 커밋. 사용자가 "계획서 먼저"를 요청해 이번 세션은 계획 산출까지만 진행.
- **구현 주체** — 사용자가 별도 세션(codex cli)에서 구현 예정. 이를 위해 양식 고정 텍스트를 `20260711_AI작업계획서_양식데이터.md`로 추출해 계획 문서만으로 자족되게 구성. 원본 붙임 PDF 4종은 바탕화면에 있음.

## 2026-07-11 보완 1 계획 (지연 입력)

- **요구 배경** — Phase 1 확인 후 사용자 요청. 장비 제원·검사·보험·줄걸이 절단하중처럼 작성자가 당장 확인하기 어려운 정보 때문에 작성이 막히면 안 된다. 해당 필드를 마법사 마지막 스텝으로 옮기고 전부 공란 허용, 재편집으로 나중에 채우는 방식으로 결정. 상세 분류는 `20260711_AI작업계획서_보완_지연입력.md`(구현된 types.ts 필드명 기준).
- **공란 PDF 원칙** — placeholder 없이 원본 양식처럼 빈칸 출력. 출력 후 수기 기입과 동일한 효과라 공란 저장이 실무적으로 문제없음.

## 2026-07-11 Phase 3 AI 라우트 구현 (Claude 세션) + 인수인계

- **라우트 완료·커밋(dd5425e)** — `src/app/api/ai/work-plan/route.ts`. 검측 체크리스트 라우트와 동일한 Gemini 패턴(gemini-3.1-flash-lite 폴백 배열, GEMINI_API_KEY, responseMimeType json). 보완 1 이후 types.ts 기준으로 tsc·eslint 통과 확인됨.
- **요청(POST JSON)** — `{ planTypes: PlanType[](필수), title(필수), sharedWorkContent?, workMethod?, equipmentName?, loadItemName?, surveyType?, projectContext?: { address?, workTypes?: string[] } }`. planTypes·title 없으면 400.
- **응답** — `{ result: WorkPlanAiResult }` (types.ts의 `Partial<Record<PlanType, WorkPlanAiDraft>>`). 공통 sharedWorkContent·riskControls, construction은 workSequence(+surveyType 지정 시 항목 개수에 맞춘 surveyFindings), electric은 electricWorkSteps 추가. 배열 누락 시 빈 배열 보정.
- **남은 배선** — AiReviewStep(마법사 AI 검토 스텝)에서 이 라우트 호출 + 편집 표 UI. 실패 시 빈 초안으로 수동 입력 가능해야 함.
- **Phase 4 PDF 빌더 완료·커밋(942c701)** — `src/lib/reports/work-plan/` 5파일(공용 조각 + 4종 빌더). 각 빌더는 `download{Loading|Construction|Electric|Heavy}WorkPlanPdf(record: WorkPlanRecord): Promise<void>` export. 원본 붙임 PDF를 직접 읽어 재현했고, 공란은 빈 셀 출력·안전율은 값이 있을 때만 표기·상수는 constants.ts import·체크리스트 itemIndex는 0-based 가정. tsc(전체 exit 0)·eslint 통과 확인됨. **남은 일은 목록·마법사 완료 화면에 다운로드 버튼 배선 + 원본과 페이지 단위 대조 조정뿐.** 빌더 파일 자체는 수정 없이 사용 권장(대조 조정 시에만 수정).
- **동시 작업 사고 기록** — 미추적 신규 파일이 git 정리로 삭제된 사고가 있었음. 신규 파일은 검증 즉시 커밋할 것.

## 2026-07-11 Phase 1 구현

- **DB 연쇄 규칙 반영** — `work_plans` 추가와 함께 `merge_projects`의 FK 자식 테이블 가드를 23개로 갱신하고 병합 UPDATE 목록에 포함했다. 프로젝트 삭제 API도 `map_image_url`과 `site_photo_urls`를 수집해 Storage 파일을 정리한다.
- **마이그레이션 실행 확인** — 사용자가 `database/20260711-1009_add_work_plans.sql`을 Supabase에서 직접 실행했다. 에이전트는 SQL 파일만 작성했고 원격 DB에는 직접 접근하지 않았다.
- **Phase 1 UI 완료** — 안전캐비넷 진입점, 프로젝트별 목록·삭제, 5단계 마법사 골격, 4종 복수 선택, 프로젝트·근로자·대표계약·공정표 자동 인입, 인양·줄걸이 안전율 계산을 구현했다.
- **검증 기준선 복구** — 저장소에 남아 있던 Next.js 15 Route Handler 타입 등 TypeScript 오류를 최소 수정했다. ESLint의 1,951개 기존 레거시 오류 규칙은 `eslint.config.mjs`에 기준선으로 명시하고, 신규 작업계획서 파일은 해당 규칙을 CLI에서 다시 활성화한 엄격 린트를 별도로 실행한다.
- **검증 결과** — `npx tsc --noEmit`, `npm run lint`, 신규 작업계획서 대상 엄격 ESLint가 모두 종료 코드 0으로 통과했다.

## 2026-07-11 보완 1 구현

- **6단계 흐름으로 확장** — 기존 저장 스텝 앞에 `나중 확인 정보`를 삽입하고, 기본정보에서는 현장에서 즉시 아는 값만 편집한다. 장비·기계 제원, 면허·자격, 인양·줄걸이 값은 `DeferredInfoStep`으로 분리했다.
- **완전 공란 상태 보장** — 줄걸이 `safetyFactor`, `slingAngleDegree`, `tensionFactor` 기본값도 `null`로 변경했다. 계산 입력이 부족하면 안전하중·안전율을 계산하지 않고 저장값을 `null`로 유지한다.
- **저장·재편집 완결** — 마법사 마지막 단계에서 `work_plans` INSERT/UPDATE를 수행한다. UPDATE는 기존 지도·사진 컬럼을 덮지 않고 `form_data`와 목록 요약 필드만 갱신하며, 목록 수정 버튼에서 기존 레코드를 불변 복제해 이어서 입력한다.
- **입력 대기 표시** — 선택 서식 중 지연 입력 그룹이 비어 있는 항목은 목록에 `입력 대기` 배지를 표시한다.
- **검증 결과** — `npx tsc --noEmit`, `npm run lint`, 보완 1 대상 엄격 ESLint가 모두 종료 코드 0으로 통과했다.

## 2026-07-11 Phase 2 구현

- **지도·사진 편집기** — 카카오 HYBRID/ROADMAP, 프로젝트 좌표·주소 지오코딩, 화면 고정, 현장 전경 사진 배경, 양식 범례 7종 도형, undo·개별/전체 삭제를 `MapDrawingEditor`에 구현했다.
- **CORS 폴백** — 직접 html2canvas 캡처 실패 시 clone의 Kakao 타일 이미지를 `/api/map-tile`로 재작성한다. 프록시는 Kakao/Daum 이미지 호스트만 허용하고 리다이렉트 차단, 5초 타임아웃, 5MB 제한을 적용한다.
- **Storage 저장** — 배경 원본·합성 PNG·전기 도면/PDF·현장사진의 data URL만 `work-plans` 버킷에 업로드한다. DB 실패 시 신규 업로드를 롤백하고 UPDATE 성공 후 교체된 기존 파일을 정리한다.
- **재편집** — `map_drawing`에는 Storage 배경 URL과 지도 중심·레벨·벡터를, `map_image_url`에는 합성 PNG를 저장한다. 전기 단독은 `site_photo_urls`의 도면·현장사진 순서를 유지한다.
- **검증 결과** — `npx tsc --noEmit`, `npm run lint`, Phase 2 대상 엄격 ESLint가 종료 코드 0으로 통과했다. 별도 개발 서버에서 `/`와 `/project/[id]/work-plan`이 컴파일되고 HTTP 200으로 응답했으며, 내부 주소 타일 프록시 요청은 400으로 차단됐다. 환경에 `agent-browser` 실행 파일이 없어 실제 지도 타일 합성의 시각 대조는 수동 확인 항목으로 남긴다.
