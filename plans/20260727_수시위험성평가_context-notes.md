# 수시 위험성평가 컨텍스트 노트

작업 중 결정과 근거를 시간순으로 기록한다.

## 2026-07-27 설계 결정

- **LLM wiki → Supabase 테이블로 전환.** 당초 위키 패턴을 검토했으나, 공사 제공 유해·위험요인 DB가 이미 구조화 완료(4단계 분류, 62,316행)라 위키화는 이중화. 위키의 자리는 판정 규칙(빈도·강도 기준, 별칭 매핑)으로 축소.
- **RAG 배제.** 명시적 분류 체계가 있어 결정적 조회가 가능. 임베딩 검색은 무음 실패(엉뚱한 조각 검색) 위험만 추가.
- **LLM 역할 최소화.** 위험요인·감소대책 텍스트는 DB 원문 그대로 사용, LLM은 선별·빈도강도 산정·장비인원 제안만. 출력은 hazardId 참조 JSON → 환각 표면 최소화, 관계법령 근거 보존.
- **사업별은 소프트 필터.** `project_category`는 부서 축(64% 공백)이라 매칭 키로 사용 불가. 프로젝트명 키워드 유추(59%) + 별칭 매핑 + "전체" 폴백. 확정값은 `projects.risk_business_type`에 write-back.
- **엑셀 DB 파싱 규칙.** No. 컬럼이 숫자면 새 위험요인, `-`면 직전 위험요인의 추가 감소대책 행(분류 4단계·위험요인·재해유형 등은 앞 행 값 상속). 셀 내 줄바꿈은 공백으로 정규화. 공사명 표기 요동(도로 공사/도로공사)은 임포트 시 그대로 두고 사업별 필터 안에서만 노출.
- **8~9행 인쇄 제목행 반복은 사용자 명시 요구.** exceljs `worksheet.pageSetup.printTitlesRow = '8:9'`.
- **타입 계약 선작성.** Worker 3인 병렬 작업이므로 `src/lib/risk-assessment/types.ts`를 코디네이터가 먼저 고정. Worker는 수정 금지(변경 필요 시 ask).
- **결재란 서명.** 공사(작성자)/안전/현장소장 + 점검(공사감독) 4칸. 서명 이미지는 안내 문구 위 겹침(CLAUDE.md 핵심 제약 #5). 서명 수집 플로우는 AI 작업계획서 패턴 재사용 가능.

## 2026-07-27 오케스트레이션 진행 기록

- **Supabase MCP가 읽기 전용이라 코디네이터가 DDL 적용 불가.** apply_migration이 "Cannot apply migration in read-only mode"로 거부됨. DATABASE_URL·pg 드라이버도 없어 직접 연결 불가. 기존 패턴대로 마이그레이션은 사용자가 SQL Editor에서 실행한다. Worker들은 테이블 존재 전제로 코드를 계속 작성하고, Worker A의 임포트 실행은 사용자 마이그레이션 적용 후로 밀린다.
- **Worker B가 merge_projects 갱신을 선제 포함(잘한 판단).** risk_assessments FK 추가로 자식 테이블 25→26이 되는데, 함수의 FK 수 가드 때문에 갱신 없이는 프로젝트 병합이 중단된다. 코디네이터가 라이브 DB와 대조 검증 완료(UPDATE 목록 26종 일치, 현행 가드 25 확인).
- **projects.risk_business_type은 A·B 양쪽 마이그레이션에 중복 포함(ADD COLUMN IF NOT EXISTS 멱등).** 적용 순서 독립성을 위해 의도적으로 유지.
- **API 파라미터 계약 확정.** taxonomy는 businessType→construction→unitWork 누적 필터로 다음 단계 목록 반환, hazards는 businessType(옵션)+construction+unitWork+detailWork.
- **사업별 유추 함수 시그니처 고정(B 지적으로 계약 공백 발견).** `export function inferBusinessType(projectName: string): string | null` — 16종 사업별 문자열(엑셀 표기, 줄바꿈 공백 정규화) 또는 null. A·B 양쪽에 통지 완료.
- **관계법령은 위험요인 단위로 병합 저장(A 발견·승인).** 원본 엑셀에서 관계법령이 감소대책 행마다 달라(91%), 중복 제거 후 " / "로 이어 붙인다. 재해유형·안전작업허가도 동일 처리. 계약(RiskHazard.relatedLaw: string)은 유지.
- **risk_hazard_taxonomy 뷰 추가(A 제안·승인).** DISTINCT 4단계 2,592행 축약 뷰(security_invoker), taxonomy API가 18,259행을 훑지 않게 한다.
- **Worker C 완료·검증 통과.** risk-assessment-export.ts 336줄, Print_Titles $8:$9를 생성 파일에서 직접 확인, A3 landscape scale 66, 서명 EMU 앵커 겹침. 통합 때 인쇄 미리보기 육안 확인만 남음.
- **마이그레이션 3건 사용자 적용 완료(2026-07-27).** 코디네이터가 DDL 존재·merge_projects 가드 26·FK 자식 26 일치를 검증. Worker A 임포트 재디스패치.
- **Worker B 설계 결정(완료 보고에서 위임받아 기록).** (1) 세부단위작업은 마법사당 단일 선택 — 여러 작업이면 평가서를 여러 건 만든다. (2) AI 판정 실패 시 "AI 없이 전체 담기" 폴백 — 로드된 위험요인 전부를 행으로 변환하고 빈도·강도는 사용자가 직접 입력. (3) 개선후 위험성 기본값은 min(3, 빈도×강도) — 3 이하 관리 목표 반영. (4) Gemini 응답의 목록 밖 hazardId는 환각으로 폐기, 빈도·강도는 1~3 클램프.
- **서명 수집 UI는 이번 범위 제외(계획대로).** signatures는 빈 객체로 저장되며 엑셀 결재란은 빈 칸 출력. 후속 단계에서 AI 작업계획서 서명 플로우 재사용 예정.
- **사용자 실기기 피드백(2026-07-27)으로 AI 우선 흐름 재구성 착수.** 캐스케이드 수동 선택 대신 작업내용·인원·장비 자유 텍스트 → AI 분류 매칭(/api/ai/risk-classify 신설, 실존 조합 검증) → 위험요인 로드 → 판정 → 행 생성까지 버튼 하나로 연속 실행. 캐스케이드는 "직접 선택" 접이식 폴백으로 유지. 여러 세부단위작업 허용(행 단위 detailWork). 계약 추가: RiskClassifyRequest/Match/Response. Worker B 재디스패치(task_91da602eca4d). --inject 미제출 함정 재발 — 빈 Enter로 해결.

## 2026-07-28 결재란 정책 확정

- **결재란은 서명만, 성명 입력·인쇄 제거(사용자 확정).** 2026-07-27에 넣었던 명단 4칸 입력·자동 채움(작성자=접속자 등)은 하루 만에 사용자 지시로 철회 — SaveStep은 서명 캔버스 4칸만 남기고, 저장 시 *Name 병합도 중단(기존 레코드의 저장된 성명은 스프레드 병합이라 자동 보존). 엑셀은 성명 없으면 안내 문구 유지 + 서명 겹침이라는 기존 동작이 그대로 원하는 결과라 수정 불필요. 하단 날짜(YY.MM.DD)는 유지.

## 참고 파일

- 원본 DB: `C:\Users\EKR\Desktop\위험성평가\자체 유해·위험요인 DB.xlsx`
- 양식(예시): `C:\Users\EKR\Desktop\위험성평가\위험성평가표_양식_수시.xlsx`
- 양식(빈): `C:\Users\EKR\Desktop\위험성평가\위험성평가표_양식_수시_빈양식.xlsx`
- Gemini 호출 선례: `src/app/api/ai/inspection-checklist/route.ts`
- 마법사 UI 선례: AI 작업계획서 (`plans/20260711_*` 참조)
