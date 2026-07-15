# 사업현황 품질 감독 미서명 컨텍스트 노트

## 2026-07-15

- 실시대장 감독미서명은 `quality_test_records.supervision_engineer_signature`가 `NULL` 또는 빈 문자열인 행으로 정의한다.
- 확인시험 감독미서명은 `quality_verification_requests.sender_signature`가 `NULL` 또는 빈 문자열인 행으로 정의한다.
- 표시 순서는 식별 열, 프로젝트수, 확인시험 건수, 확인시험 감독미서명, 총괄표 건수, 실시대장 감독미서명, 본부 미서명 건수로 한다.
- 기존 `hq_unsigned_count`는 총괄표의 `confirmer_signature` 미서명 건수이므로 그대로 유지한다.
- 완료 프로젝트 제외와 사용자 조직 범위 필터는 기존 조회 로직을 변경하지 않는다.
- 기존 작업 트리의 미커밋 파일과 다른 계획 문서는 수정하거나 커밋하지 않는다.
- `QualityTestCountByProject`에 실시대장·확인시험 감독미서명 건수를 추가하고 프로젝트별 맵으로 합산했다.
- `BusinessQualityTestView`의 본부·지사 집계와 세 단계 표의 헤더, 소계, 데이터 행, 빈 상태 열 수를 동일한 순서로 반영했다.
- `npx eslint "src/lib/projects.ts" "src/components/dashboard/BusinessQualityTestView.tsx"`는 오류 없이 통과했고, 기존 미사용 eslint-disable 경고 7건만 남았다.
- `npx tsc --noEmit`과 `git diff --check`를 통과했다.
- 브라우저에서 본부, 지사, 프로젝트 단계의 새 열 순서와 소계·행 값을 확인했다.
