# 수시 위험성평가 체크리스트

## 코디네이터 (사전)
- [x] 유해·위험요인 DB 엑셀 구조 분석 (62,316행, 4단계 분류)
- [x] 수시 양식 구조 분석 (18열, 8~9행 제목, 2행 1조)
- [x] 사업별 매칭 조사 (project_category 사용 불가, 이름 유추 59%)
- [x] 설계 계획서 작성
- [ ] 타입 계약 파일 선작성 (`src/lib/risk-assessment/types.ts`)
- [ ] Orca 태스크 생성·디스패치 (A/B/C, opus)

## Worker A — DB 검색 전문 (worker_done, 코디네이터 검증 완료)
- [x] `database/` 마이그레이션 SQL: `risk_hazards` + `risk_hazard_measures` + `risk_hazard_taxonomy` 뷰 (20260727-2307, 인덱스·RLS 검증됨)
- [x] `projects.risk_business_type` 컬럼 추가 마이그레이션 (20260727-2308)
- [x] 임포트 스크립트 `safesys-app/scripts/import-risk-hazards.js` (드라이런으로 18,259/62,316건 파싱 검증, 행 수 대조 내장)
- [x] `GET /api/risk-db/taxonomy` (뷰 기반, PostgREST 1000행 상한 페이지네이션 처리)
- [x] `GET /api/risk-db/hazards` (measures 임베드, sort_order 정렬, 계약 매핑)
- [x] `src/lib/risk-assessment/business-type-infer.ts` (실측 유추율 73%, 947건 중 691건)
- [x] 임포트 실행 완료 — 18,259/62,316건, 원본 raw 재추출 대조 전 필드 일치, 코디네이터 독립 SQL 검증 통과

## Worker B — 기능 구현 (worker_done, 코디네이터 검증 완료)
- [x] `database/` 마이그레이션 SQL: `risk_assessments` (project_id CASCADE, RLS, merge_projects 25→26 — 라이브 대조 검증됨)
- [x] 작성 마법사 UI (5단계 7컴포넌트, created_by RLS 준수·사업별 write-back 확인)
- [x] `POST /api/ai/risk-assessment` (환각 hazardId 폐기·1~3 클램프·모델 폴백 확인)
- [x] 평가서 목록·상세·삭제
- [x] 엑셀 다운로드 버튼 (toExportData → exportRiskAssessmentExcel 연결)
- [x] `/project/[id]/risk-assessment` 준비중 화면 교체

## Worker C — 엑셀 출력 (worker_done, 코디네이터 검증 완료)
- [x] 빈양식 레이아웃 리버스엔지니어링 (병합·열폭·행높이·테두리·폰트, 덤프 diff 0 보고)
- [x] `src/lib/excel/risk-assessment-export.ts` (2행 1조 데이터, J열 검토/추록 라벨, 336줄)
- [x] 인쇄 제목행 반복 `printTitlesRow '8:9'` (필수 — 생성 파일 xl/workbook.xml에서 Print_Titles $8:$9 직접 확인)
- [x] 결재란 4서명 + 서명 이미지 안내 문구 위 겹침 (EMU 앵커, quality-excel-utils 기법 재사용)
- [x] 샘플 데이터 생성 검증 (12행 샘플, A3 landscape scale 66)
- [ ] 통합 단계: Excel 인쇄 미리보기 육안 확인(페이지 분할·제목 반복)

## 코디네이터 (통합 검증)
- [x] 마이그레이션 적용 (사용자 SQL Editor 실행, DDL·가드 26·FK 26 검증)
- [x] 임포트 결과 행 수 확인 (위험요인 18,259 / 대책 62,316 / 조합 2,592 독립 SQL 검증)
- [x] diff 검토 + `npm run lint` + `npx tsc --noEmit` (직접 실행, 신규 파일 무오류)
- [ ] 전 플로우 수동 검증 (생성→저장→다운로드→인쇄 미리보기 제목행 반복) — 사용자 실사용 확인 권장
- [x] 의미 단위 커밋 5건 (c42b762 데이터층 → 52b15ff 저장 테이블 → b02f02d 엑셀 → 5890f2f UI·AI → 4a7d7e1 문서)
