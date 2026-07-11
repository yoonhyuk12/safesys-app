# AI 작업계획서 컨텍스트 노트

## 2026-07-11 계획 수립

- **라우트 스텁 존재** — `src/app/project/[id]/work-plan/page.tsx`가 "준비중입니다" 상태로 이미 있음. 진입 폴더(DocumentFolder)만 안전캐비넷 P 그룹(page.tsx line 1412~1444)에 추가하면 연결 완료.
- **양식 소스** — 바탕화면 붙임2-1~2-4 PDF(개정 2025-09-11, 한국농어촌공사 수급업체용). 표지+본표+지도+위험요인/개선대책+체크리스트 구조. 체크리스트 문항 수는 2-1이 12, 2-2가 18, 2-3이 9, 2-4가 13 — 전부 고정 텍스트라 상수 하드코딩하기로 결정(AI 생성 대상 아님).
- **지도 방식 결정** — V-World JS API(SOPPlugin)는 캡처·오버레이 제어가 어려워 Leaflet + V-World WMTS 위성 타일 조합 선택. 드로잉은 SignaturePad.tsx의 raw canvas 패턴을 지도 위 absolute 오버레이로 재사용. "지도 이동·줌 → 화면 고정 → 드로잉" 2단계 UX로 좌표계 문제(지도 팬 시 드로잉 어긋남)를 회피.
- **저장 이중화** — map_drawing(벡터 JSON, 재편집용) + map_image_url(합성 PNG, PDF·목록용) 둘 다 저장. base64를 DB에 넣지 않고 Storage 버킷 `work-plans` 사용(서명 base64 관행과 달리 이미지가 커서).
- **AI 패턴** — `api/ai/inspection-checklist`(Gemini gemini-3.1-flash-lite, GEMINI_API_KEY, responseMimeType json) 복제가 기준. OpenAI 패턴도 있으나 문서 생성 주력은 Gemini.
- **PDF 패턴** — `src/lib/reports/quality-monthly-report.ts`(html2canvas+jsPDF, 오프스크린 div, 맑은 고딕, applyHtml2canvasTextFix) 기준. 한글 폰트 임베딩 불필요.
- **자동 인입 소스** — projects(project_name, 주소, 좌표, supervisor_*, managing_hq/branch, g2b_corp_nm, construction_schedule), workers(작업자·지휘자 후보), 대표계약. 장비 전용 테이블은 없어 장비 제원은 수기 입력.
- **서명란 범위 제외** — 1차는 출력 후 수기 서명. 손글씨 서명 겹침(feedback_signature_rendering 참고)은 추후 확장.
- **마이그레이션 실행 주체** — 기존 관행대로 SQL 파일 작성 후 사용자가 Supabase 콘솔 실행. 실행 전 main 푸시 금지.
- **토큰 한도 대응** — 4개 Phase로 분할, Phase별 커밋. 사용자가 "계획서 먼저"를 요청해 이번 세션은 계획 산출까지만 진행.
- **구현 주체** — 사용자가 별도 세션(codex cli)에서 구현 예정. 이를 위해 양식 고정 텍스트를 `20260711_AI작업계획서_양식데이터.md`로 추출해 계획 문서만으로 자족되게 구성. 원본 붙임 PDF 4종은 바탕화면에 있음.
