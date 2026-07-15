# 품질시험 결과 관리대장 구현 체크리스트

계획서: `plans/20260702_품질시험결과관리대장.md`

- [x] 계획 산출물(plan·checklist·context-notes) 생성
- [x] `database/add_quality_test_ledger_tables.sql` 작성 (3테이블, project_id CASCADE, RLS)
- [ ] 마이그레이션 적용 — **사용자 작업 필요**: Supabase MCP가 읽기 전용이라 SQL Editor에서 `database/add_quality_test_ledger_tables.sql` 실행 필요
- [x] `src/lib/quality/quality-test-types.ts` 타입 정의
- [x] 실시대장 탭: 목록 + 폼(서명 포함) + 대장 엑셀 출력
- [x] 성과총괄표 탭: 폼 + 실적 자동집계 + 엑셀 출력
- [x] 확인시험 의뢰서 탭: 목록 + 폼 + 엑셀 출력
- [x] 페이지 `/project/[id]/quality-test-ledger` (탭 전환)
- [x] 품질 캐비넷 C(점검) 그룹에 서류철 추가 + 건수 표시 (그룹은 월례보고서 커밋 d51d6a5에서 신설됨)
- [x] 타입 검사 — `npx tsc --noEmit` 신규 파일 오류 0건 (기존 파일의 오류만 존재)
- [x] ESLint — 신규 파일 고유 오류 없음 (`(supabase as any)` 경고는 기존 코드와 동일한 수용된 패턴)
- [ ] 수동 검증 (작성→저장→재조회→집계→엑셀) — **마이그레이션 적용 후 가능**
- [x] 시맨틱 커밋

### 추가 기능 (2026-07-02 페이지 피드백: 일련번호 미표시, 사진 첨부 요청)

- [x] `database/add_quality_test_records_photo.sql` 작성 (photo_url 컬럼 + quality-test-photos 버킷/정책)
- [ ] 마이그레이션 적용 — **사용자 작업 필요**: Supabase MCP 읽기 전용, SQL Editor에서 직접 실행
- [x] `quality-test-types.ts`에 `photo_url` 필드 추가 (QualityTestRecordFormData, QualityTestCommonFields — 일련번호당 1건이라 공통 필드로 배치)
- [x] `QualityTestRecordsTab.tsx` 공통 항목 그리드에 일련번호 읽기 전용 필드 추가
- [x] `QualityTestRecordsTab.tsx` 공통 항목 그리드에 사진 업로드/삭제 UI 추가 (Storage 업로드, 일련번호당 1건)
- [x] `src/lib/reports/quality-test-photo-report.ts` 사진대지 PDF 출력 유틸 작성
- [x] 헤더에 "사진대지" 출력 버튼 추가 (사진 없는 프로젝트는 비활성화)
- [x] `api/projects/[id]/delete/route.ts`에 `quality_test_records.photo_url` 수집 블록 추가
- [x] 타입체크·린트 실행 — 신규 파일 오류 0건, 기존 `(supabase as any)` 경고만 존재 (수용된 패턴)
- [ ] 수동 검증 (사진 업로드→저장→사진대지 PDF 출력) — **마이그레이션 적용 후 가능**

### 추가 피드백 (2026-07-14 실시대장 목록 컬럼 보강)

- [x] 시험·검사 종목 우측에 시험 기준·시험 결과 컬럼 추가
- [x] 판정 우측에 품질관리기술인·건설사업관리기술인 이름·서명 컬럼 추가
- [x] 실시대장 목록의 모든 컬럼 사이에 세로 구분선 추가
- [x] 그룹 제목 행 `colSpan`을 전체 12개 컬럼에 맞게 조정
- [x] 데스크톱에서 항목 하위 입력 필드 5개를 한 행에 수평 배치
- [x] 시험 결과 판정을 합격·불합격·재시험 버튼으로 변경
- [x] 실시대장 목록 기본 펼침 및 수동 접기·펼치기 버튼 추가
- [x] 추가·일련번호 선택 시 목록 자동 접기, 저장·취소 시 다시 펼치기
- [x] 성과총괄표 자동집계의 제출건 선택 모달 제거
- [x] 프로젝트 실시대장 전체를 한 번에 ④·⑤ 실적 누계로 반영
- [x] ④ 품질검사 실적에 자체·수탁·확인시험 전체 합계 반영
- [x] ⑤에 확인시험·수탁시험만 분리 집계하고 구분값 자동 입력
- [x] 성과총괄표 엑셀 서명자 소속·직위 영역 한 줄 표시
- [x] 실시대장 제출건 삭제 후 일련번호 그룹 자동 재정렬
- [x] 대상 파일 ESLint·전체 TypeScript 검사 및 로컬 경로 응답 확인

### 추가 피드백 (2026-07-14 성과총괄표 입력자 정보 승계)

- [x] 새 성과총괄표에 같은 프로젝트의 최신 보고서 입력자 소속·직위·성명 9개 승계
- [x] 새 보고서에는 기존 작성자·검토자·확인자 서명 이미지를 복사하지 않음
- [x] 이전 보고서가 없으면 프로젝트 기반 작성자·확인자 기본값 유지
- [x] 보고일이 같을 때 생성일 내림차순으로 최신 보고서 결정

### 추가 피드백 (2026-07-15 감독 서명 분리)

- [x] 등록·수정 폼에서 건설사업관리기술인 입력 영역과 필수 검증 제거
- [x] HWP 양식 오른쪽에 발주청 전용 감독서명 버튼 배치
- [x] 미서명 행 개별·전체 선택과 선택 건수 안내 구현
- [x] 공용 `/api/bulk-sign`의 `quality_test_record` 대상으로 서명 저장 연동
- [x] 기존 서명 선택·덮어쓰기 방지와 신규·복사 기록의 감독 서명 미승계
- [x] PostgREST UPDATE의 `or(NULL, 빈 문자열)` 42703 오류를 조건별 UPDATE로 분리해 수정
- [x] `npx tsc --noEmit`, 대상 파일 린트, `git diff --check`, 로컬 경로 HTTP 200 확인
- [x] 브라우저에서 버튼 순서·선택 모드·미서명 행 개별/전체 선택 확인
- [x] 인증된 비파괴 API 호출로 `POST /api/bulk-sign 200`, 기존 서명 보호(`updated_total: 0`) 확인

### 추가 피드백 (2026-07-15 감독 서명 대체)

- [x] 감독 서명 모드에서 기존 서명 행을 포함한 전체 행 개별·전체 선택 허용
- [x] 기존 서명 행 선택 시 새 감독 서명으로 대체됨을 화면에 안내
- [x] 화면에서 `replace_existing=true`를 명시하고, 레지스트리에 허용된 `supervisor + quality_test_record` 조합만 기존 서명 덮어쓰기 허용
- [x] 다른 감독·시공사 일괄서명 대상의 미서명 조건 유지
- [x] `npx tsc --noEmit`, 대상 파일 린트, `git diff --check` 확인
- [x] 브라우저에서 기존 서명 행 선택 활성화와 선택 건수 반영 확인
- [x] 다른 프로젝트 행 ID를 사용한 교체 요청이 0건 처리되는 프로젝트 범위 보호 확인
