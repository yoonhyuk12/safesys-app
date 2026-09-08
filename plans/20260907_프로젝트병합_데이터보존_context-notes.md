<!-- 프로젝트 병합 데이터 보존 수정의 결정과 검증 근거. -->
# 컨텍스트 노트

- 사용자 요청은 앞선 감사 결과의 코드 수정이다. 운영 프로젝트를 시험 병합하거나 삭제하지 않는다.
- 보고서 날짜나 작성 내용을 임의로 바꾸지 않는다. 중복이면 전체 병합을 중단해 원본을 보존한다.
- target에 기존 선택값이 있으면 유지한다. 두 공정표를 임의로 섞지 않는다.
- 대표계약과 g2b 연계는 동일 계약 묶음이어야 한다. 일부 필드별 COALESCE로 다른 계약을 혼합하지 않는다.
- SQL 적용 전 구버전 함수가 실행돼 자료를 삭제하는 배포 순서 문제를 막기 위해 API는 새 버전 RPC만 호출한다.
- 공정표 `startIndex`/`endIndex`/`dist`는 착공일 기반 상대 인덱스다. source 공정표를 보충하려는데 병합 후 공사기간이 source와 달라지면 `scheduleConflict`로 병합을 차단해 일정 의미를 보존한다. `{items: [], updatedAt: ...}`도 계약번호가 없으면 빈 공정표다.
- API/DB 공유 계약은 `preview_project_merge_v2`가 `{workDailyReports, qualityMonthlyReports, scheduleConflict}`를 반환하고 `merge_projects_safe_v2`가 최종 병합한다. DB는 `MERGE_REPORT_CONFLICT` 또는 `MERGE_SCHEDULE_CONFLICT`와 동일 JSON 상세를 반환한다.
- 수정 전 기준 검증은 `npm run lint` exit 0(기존 경고), `npx tsc --noEmit` exit 0이다.
- 메인 검증자가 PGlite 격리 DB에 기존 8/31 함수를 실행해 유실을 재현했다. 동일 날짜 일보가 각 1건인 두 프로젝트를 병합하면 프로젝트/일보가 각각 1건으로 줄었고 `dropped_work_daily_reports=1`, source에 있던 공정표·앱 코드가 target에서 NULL로 남았다. 운영 DB는 사용하지 않았다.
- 메인 브라우저 검증. Orca `/list`에서 `/api/projects/merge`만 임시 mock으로 대체해 보고서 충돌·조회 실패·공정표 기간 충돌 때 버튼 차단, 정상 미리보기 때 버튼 활성화, 클릭 후 최종 409 때 최신 충돌 반영과 재실행 차단을 확인했다. 모든 요청은 모의 응답이며 운영 POST는 없었다. 검증 종료 후 모달을 닫고 원래 fetch를 복원했다.
- 단순 소스 정규식 검사로 구현 존재만 확인하는 신규 모달 테스트는 제거했다. 실제 route 함수를 실행하는 API 테스트와 브라우저 행동 검증을 사용한다.
- 상세주소는 기본주소가 양쪽 모두 같고 target 상세주소만 비었을 때 보충한다. 기본주소가 다르면 주소·좌표 묶음을 유지해 다른 현장의 상세주소를 섞지 않는다.
- 메인이 API 회귀 테스트 15건을 직접 재실행해 통과했고, 실제 localhost HTTP 요청에서 잘못된 ID 400·미인증 GET/POST 401을 확인했다.
- 최종 삭제 직전에 강제로 예외를 발생시키는 PGlite 검증에서도 프로젝트·27종 직접 자식·4종 간접 자식 총 32개 테이블의 전체 스냅샷이 실행 전과 완전히 같았다. 중간 이동·옵션 보충·서명·첨부 참조가 모두 롤백됨을 확인했다.
- 최종 전체 테스트는 `node --test tests/*.test.mjs` 51건 중 49건 통과, 2건 실패다. 새 병합 API 15건·SQL 25건은 모두 통과했다. 실패한 `tbm-risk-analysis-config.test.mjs`의 GPT-5.4 nano 고정 모델명 검사 2건은 이번 변경 전부터 존재하며, 해당 테스트 및 검사 대상 파일 2개가 HEAD와 동일함을 `git diff --quiet HEAD -- ...`로 확인했다. 요청과 무관한 모델 기능은 변경하지 않았다.
- 최종 `npm run lint` exit 0(기존 경고만), `npx tsc --noEmit --incremental false` exit 0이다. PGlite는 단일 세션 테스트이므로 실제 운영 DB의 동시 접속 부하·배포 적용 자체는 검증 범위에 포함하지 않았다.
- DB Worker는 migration·SQL 테스트·package 파일·docs/database.md, API/UI Worker는 route·모달·관련 테스트만 수정한다. 메인 Advisor는 계획·검증·커밋을 담당한다.
- 독립 리뷰에서 양쪽에 서로 다른 공정표가 있을 때 source 원본이 사라지는 경우를 발견해 후속 Worker에 차단 로직과 회귀 테스트를 맡겼다. 주소·계약 등 설정값은 target 우선 정책을 유지하고 모달에 명시한다. 공정표 단독 충돌의 0건 보고서 표시와 조사 오류도 수정한다.
- 리뷰의 동시 삽입 23505 추론은 미재현이며, projects 행의 FOR UPDATE 잠금과 FK 삽입의 KEY SHARE 잠금이 충돌하므로 제시한 순서 그대로는 성립하지 않는다. 근거 없는 오류 코드 매핑은 추가하지 않았다. DB 내부 미리보기 응답의 누락·형식 오류를 차단하는 검증은 추가한다.
- 리뷰 반영 후 메인이 병합 SQL 27건·API 16건 총 43건을 직접 재실행하여 모두 통과했다. 린트·타입체크도 재통과했으며, 브라우저에서 공정표 충돌 버튼 차단·0건 항목 숨김·설정 우선순위 안내를 모의 GET 1회로 추가 검증했다. 실제 POST는 실행하지 않았고 fetch를 복원했다.
