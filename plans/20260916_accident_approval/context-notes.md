# 컨텍스트.

- expected_treatment_days 타입은 이미 있으며 보고서 JSON 전체를 읽을 필요가 없다.
- 프로젝트 목록의 숫자 문자열·안전 정수 판단 패턴을 재사용한다.
- dashboard 저장 성공 및 새로고침은 loadData를 호출하므로 공통 projection 변경으로 반영된다.
- 사용자 확정 지시로 기존 산재신청 열을 교체하며 양의 요양일 기준은 유지한다.
- 테스트 52개 통과, npm run lint 종료 코드 0(기존 경고), npx tsc --noEmit 종료 코드 0, git diff --check 통과.
- 동시 세션의 onlyWorkersCompApplied 필터 변경은 보존했다. 해당 필터는 신청 상태를 기준으로 하며 이번 승인 표시와 기준이 다르므로 coordinator가 사용자 의도를 확인할 대상이다.
