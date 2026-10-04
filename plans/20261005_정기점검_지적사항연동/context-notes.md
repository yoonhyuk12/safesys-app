# 컨텍스트

- 외부 라이브러리 없이 summary.ts의 inspectionFindings 및 원본 photo-storage.ts를 재사용한다.
- 원본 사진 버킷은 safety-inspection-photos이며 projectId/시간_770_tag 경로를 쓴다.
- Advisor 후속 지시에 따라 770의 해당없음 조치 버튼을 숨기고 원본의 N/A 미완료 판정을 관리대장과 카드에도 적용한다.
- superpowers 스킬은 제공되지 않아 동등한 계획/TDD/직접 리뷰를 수행한다.
- Supabase update 문서의 필터 및 select 반환 확인을 반영한다. 실제 DB 읽기와 브라우저는 Advisor 담당이다.
- 신규 테스트는 구현 파일 부재로 실패(RED)한 뒤 변환·JSON 보존·오류 전파 테스트가 통과했다. 실제 TSX를 실행해 조치 편집·다운로드·해당없음 버튼 숨김도 검증한다.
- npm run lint 종료 0(저장소 기존 경고 다수), npx tsc --noEmit 종료 0. 최종 test:special-770 58건, test:patrol-ledger 59건 및 test:issue-report, test:safety-inspection-ledger 통과. git diff --check 통과.
- Advisor가 실제 화면 총10건/미조치1건, 특별(굴삭기) 1-1 지적과 사진 로딩, 미조치 필터의 1건 표시를 확인했다. 운영 데이터는 읽기만 했으며 조치 저장은 실제 헬퍼·클라이언트와 모의 HTTP 회귀테스트로 검증했다.
- 사진 삭제는 원본 JSON 저장 성공 후 Storage에서 제거한다. 저장 실패 시 원본 사진을 먼저 지우지 않는다.
- 후속 P2 수정으로 관리대장의 UPDATE에 읽은 `excavator_inspection` 전체 JSON equality 조건을 추가했다. 기존 id/project_id 조건을 유지하며 충돌로 0행이면 `maybeSingle()` 결과를 확인해 새로고침 오류를 던진다. 자동 재시도·RPC·마이그레이션은 추가하지 않는다.
- 근거는 [Supabase eq](https://supabase.com/docs/reference/javascript/eq), [PostgREST 연산자](https://docs.postgrest.org/en/stable/references/api/tables_views.html#operators), [PostgreSQL JSONB 비교](https://www.postgresql.org/docs/current/functions-json.html)이며 설치된 postgrest-js의 eq 구현이 값을 문자열로 URLSearchParams에 추가하므로 JSON.stringify를 명시한다. 저장소 내 동일한 JSON.stringify equality 필터 패턴과 GitHub 코드 검색 결과는 없었다. Advisor도 실제 DB에서 같은 JSONB eq SELECT가 해당 id와 일치함을 확인했다고 전달했다(운영 쓰기 없음).
- 동시 저장 회귀테스트는 실제 Supabase 클라이언트와 헬퍼를 실행하고 HTTP 응답만 모의한다. 두 조회를 같은 스냅샷으로 고정하고 먼저 저장한 조치를 보존하면서 두 번째 PATCH의 0행 응답이 새로고침 오류로 전파됨을 검증한다. 초기 구현에서 실패(RED), 조건 추가 후 통과(GREEN)했다.
- 후속 검증은 npm run lint 종료 0(기존 경고), npx tsc --noEmit 종료 0, test:special-770 59/59 통과다. 소유 범위 세 파일만 수정하고 직접 diff 리뷰했다. 빌드·커밋·푸시·운영 DB 쓰기는 하지 않았다.
