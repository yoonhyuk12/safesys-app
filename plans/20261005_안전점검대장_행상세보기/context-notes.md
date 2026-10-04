# 컨텍스트 노트

- 특별287은 기존 눈 버튼이 읽기 전용 SafetyInspectionForm을 연다. 일반/770은 SafetyInspectionDetail을 연다. 이 분기를 보존한다.
- page.tsx는 287 지적 있음/없음, 일반 결과 있음/없음의 네 행 렌더링 분기가 있다. 770은 Special770LedgerRows.tsx의 두 분기다.
- 일반 결과 조치사항은 클릭 가능한 div라 button/input 제외만으로는 이벤트 충돌을 막지 못한다. 그 영역의 하위 요소와 편집 중 여백도 보호해야 한다.
- 특별770의 기존 사진/비고 셀 이벤트 차단은 사진 편집 UI의 버블링까지 고려한다. 눈 아이콘 제거 후 키보드 접근 경로를 보존한다.
- 관련 파일은 사전 변경 또는 untracked 상태이며 Temp의 ledger-*-all-rows-before.tsx와 이번 변경을 비교한다.
- Worker gpt-6-astra low 구현 후 Advisor가 diff와 검사를 독립 수행했다. 새 테스트는 test:safety-inspection-ledger로 등록했다.
- 별도 브라우저 탭에서 우기 행 클릭 → 우기 점검카드, 특별287 빈 지적 행 클릭 → 읽기 전용 점검 상세보기, 해빙기 행 Enter → 해빙기 점검카드를 확인했다.
- 수정 버튼은 점검 수정 화면만 열고, 조치사항 클릭/입력 Enter는 textarea 1개와 상세 모달 0개를 유지했다. 눈 아이콘 버튼은 0개다. 저장/삭제는 실행하지 않았다.
- 기존의 대규모 미커밋 변경과 untracked 특별770 기반 구현을 포함하지 않기 위해 이번 턴 커밋은 만들지 않았다. 빌드·운영 배포도 하지 않았다.
