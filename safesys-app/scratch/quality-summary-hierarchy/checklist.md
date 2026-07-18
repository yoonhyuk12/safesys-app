<!-- 품질총괄표-실시대장 계층화 작업 체크리스트 -->
# 체크리스트

- [x] DB 마이그레이션 파일 작성 (`database/20260708-0633_add_quality_test_records_summary_id.sql`)
- [ ] 마이그레이션 프로덕션 적용 — **사용자 동의 대기** (권한 분류기 차단)
- [x] 타입: `QualityTestRecord.summary_id` 추가
- [x] RecordsTab: 총괄표 목록 로드 + 폼 총괄표 선택 UI (없으면 자동 생성)
- [x] RecordsTab: 저장 시 summary_id 연결 (새 총괄표 생성 분기 포함)
- [x] RecordsTab: 목록 총괄표 그룹 헤더 행 + 미지정 그룹
- [x] SummaryTab: 열 때 하위 기록 자동 집계, 수동 집계 하위 범위(폴백 포함)
- [x] SummaryTab: 삭제 확인 문구 갱신
- [x] page.tsx: 탭 간 총괄표 열기 연결 + 기본값 props 전달
- [x] lint(신규 위반 없음, supabase as any 기존 패턴만) / tsc(변경 파일 에러 0) 확인
- [x] diff 직접 검증 후 커밋
- [ ] 마이그레이션 적용 후 수동 시나리오 검증 (등록→자동 생성, 선택 등록, 헤더 클릭→자동 집계)
