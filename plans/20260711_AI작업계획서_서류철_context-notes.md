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

## 2026-07-11 Phase 1 구현

- **DB 연쇄 규칙 반영** — `work_plans` 추가와 함께 `merge_projects`의 FK 자식 테이블 가드를 23개로 갱신하고 병합 UPDATE 목록에 포함했다. 프로젝트 삭제 API도 `map_image_url`과 `site_photo_urls`를 수집해 Storage 파일을 정리한다.
- **마이그레이션 실행 확인** — 사용자가 `database/20260711-1009_add_work_plans.sql`을 Supabase에서 직접 실행했다. 에이전트는 SQL 파일만 작성했고 원격 DB에는 직접 접근하지 않았다.
- **Phase 1 UI 완료** — 안전캐비넷 진입점, 프로젝트별 목록·삭제, 5단계 마법사 골격, 4종 복수 선택, 프로젝트·근로자·대표계약·공정표 자동 인입, 인양·줄걸이 안전율 계산을 구현했다.
- **검증 기준선 복구** — 저장소에 남아 있던 Next.js 15 Route Handler 타입 등 TypeScript 오류를 최소 수정했다. ESLint의 1,951개 기존 레거시 오류 규칙은 `eslint.config.mjs`에 기준선으로 명시하고, 신규 작업계획서 파일은 해당 규칙을 CLI에서 다시 활성화한 엄격 린트를 별도로 실행한다.
- **검증 결과** — `npx tsc --noEmit`, `npm run lint`, 신규 작업계획서 대상 엄격 ESLint가 모두 종료 코드 0으로 통과했다.
