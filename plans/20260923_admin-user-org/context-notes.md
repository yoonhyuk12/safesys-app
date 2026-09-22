<!-- 관리자 소속 선택 구현 판단 기록 -->
- ProfileEditModal의 옵션 구성을 재사용하되 초기 렌더에서 지사를 지우는 effect는 사용하지 않는다.
- 본부를 직접 바꿀 때 호환되는 지사(예: 지하수지질부)는 유지한다.
- 역할과 무관하게 기존 관리자 모달의 소속 필드 노출을 유지하며 필수 조건은 추가하지 않는다.
- 요청 범위에 따라 package.json, 인증, DB, 공용 상수, 다른 작업 파일은 수정하지 않는다. 빌드·커밋·추가 워커는 실행하지 않는다.
- 검증 명령 `cd safesys-app; node --test tests/admin-user-org-dropdown.test.mjs`의 4개 테스트가 RED에서 GREEN으로 통과했다. `git diff --check -- safesys-app/src/app/admin/users/page.tsx`도 통과했다.
- 테스트는 실제 소스의 모달 함수를 TypeScript로 변환하여 JSX 옵션과 onChange/onSubmit을 실행하며 useState만 대역으로 사용한다. 브라우저 E2E는 실행하지 않았다.
- 소스 diff는 상수 import, 본부 변경 처리, 두 select에 한정되며 저장 핸들러와 역할 처리에는 변경이 없다.
