# 컨텍스트 노트.

- applyQualityTestActuals는 기존 행에 없는 실시대장 항목을 매번 추가한다. 일반 편집에는 appendMissingRows: false를 적용한다.
- reconcileQualityMonthlyReports는 전월에만 있는 행까지 추가한다. 저장된 행 목록을 존중하도록 일치하는 행의 누계만 반영한다.
- 새 보고서 생성과 보고 연월 변경 시 자동 행 생성은 유지한다.
- 기존 TypeScript transpileModule + node:test 검증 패턴을 재사용한다. 로컬 배열 처리 수정으로 외부 코드·패키지는 도입하지 않는다.
- 회귀 테스트는 수정 전 6개 중 4개 실패, 수정 후 6개 모두 통과했다.
- npm run lint와 npx tsc --noEmit은 종료 코드 0이다. 린트에는 기존 파일의 미사용 변수·React Hook 의존성 등 경고가 남아 있다.
- git diff --check 통과. DB 데이터를 수정하거나 프로덕션 빌드·커밋·푸시는 실행하지 않았다.
