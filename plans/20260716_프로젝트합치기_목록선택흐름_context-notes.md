# 프로젝트 합치기 목록 선택 흐름 결정 기록

## 2026-07-16

- 서버 병합 API는 `sourceId`의 데이터를 `targetId`로 옮긴 뒤 source 프로젝트를 삭제한다.
- 사용자가 말한 "사라질 현장"을 source, "합쳐지는 프로젝트"를 target으로 연결한다.
- 기존 목록 화면의 합치기 진입 버튼과 권한 조건은 유지한다.
- 선택 상태는 Dashboard에서 관리하고 `/list`의 네 가지 발주청 ProjectCard 렌더 경로에 같은 선택 props를 전달한다.
- 선택 중에는 카드 전체를 덮는 접근 가능한 버튼이 분기 토글과 더보기 메뉴보다 먼저 클릭을 받는다.
- source 카드는 빨간 테두리와 삭제 라벨로 표시하고, target 후보는 파란 hover로 표시한다.
- 두 카드를 고른 뒤에만 기존 비가역 경고 모달을 열며 모달에는 선택 결과와 합치기 실행 버튼만 표시한다.
- 취소, 닫기, 성공 시 Dashboard의 source, target, 선택 단계 상태를 모두 초기화한다.
- `npx tsc --noEmit`과 `npm run lint`가 통과했다. 린트에는 이번 변경과 무관한 기존 경고만 남아 있다.
- 로그인된 로컬 브라우저에서 합치기 진입과 source 선택 후 target 단계 전환까지 확인했다. 실제 병합을 일으킬 수 있어 최종 모달까지의 재검증은 메인 에이전트가 이어서 수행한다.
- `ProjectEditForm`의 노란 선택사항 섹션에 있는 19개 필드를 병합 보충 대상으로 정했다. target의 텍스트가 NULL·공백이거나 날짜가 NULL일 때만 source 값을 사용하며, 체크박스는 source와 target 중 하나라도 true이면 true를 보존한다.
- 로그인된 로컬 브라우저에서 삭제될 현장 선택, 유지될 현장 선택, 최종 확인 모달 표시, 취소 후 상태 초기화까지 확인했다. 실제 데이터 삭제를 막기 위해 최종 합치기 버튼은 누르지 않았다.
- `database/20260716-0026_merge_project_optional_fields.sql`은 최신 24개 자식 테이블 병합 함수를 유지한 채 선택사항 보충 UPDATE만 추가한다. 로컬 PostgreSQL 파서가 없어 원격 DB에는 적용하지 않았고 정적 검토만 수행했다.
- 실제 앱이 연결된 Supabase 프로젝트의 함수 설명과 본문을 조회한 결과 선택사항 보충 로직이 없는 구버전 함수가 실행 중이었다. 이 때문에 병합 후 `total_budget`, `supervisor_name` 등 대상 프로젝트의 빈 선택사항이 그대로 NULL로 남았다.
- 2026-07-16에 Supabase 관리 API로 `database/20260716-0026_merge_project_optional_fields.sql`을 원격 DB에 적용했다. 적용 후 함수 설명과 `total_budget`, `supervisor_name`, `privacy_manager_phone` 보충 구문 존재 여부를 읽기 전용 쿼리로 검증했다.
- 함수 교체는 이후 병합부터 적용된다. 구버전 함수로 이미 병합되어 source 프로젝트가 삭제된 건은 현재 행만으로 source 선택사항을 자동 복구할 수 없다.
