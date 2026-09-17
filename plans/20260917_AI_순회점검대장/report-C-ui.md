# Worker C UI 완료 보고.

순회점검대장 페이지와 목록·상세·폼을 만들고 발주청 캐비닛 C 그룹의 공사감독 일지 바로 뒤에 폴더·건수를 연결했다. 데이터·타입·AI·HWPX 모듈은 읽기 전용 계약 그대로 사용했다.

## 구현 내용.

- 독립 세션 복원 확인 후 로그인 가드, 사용자 권한 현장 조회, 목록·폼·상세 전환.
- 목록의 점검일·점검자·미흡 건수·지적사항 유무와 행 클릭 상세.
- 상세의 10행 양식 표, 지적사진·지적사항, 점검일자·지구명·점검자·서명, HWPX 다운로드.
- 수정은 작성자만, 삭제 버튼은 작성자·현장 소유자·발주청에게 표시한다. 실제 DB 접근은 기존 RLS가 판정한다.
- 날짜 변경 시 TBM 조회와 이전 응답 무시, 요약 표시, TBM이 없거나 조회 실패하면 직접 입력, 직접 수정 토글.
- Bearer 토큰 AI 호출과 오류 메시지 표시, 점검항목 편집·결과 재클릭 해제·전체 양호, 사진 1장 업로드·미리보기·제거.
- 기존 SignaturePad를 재사용하고 내용 변경·AI 재생성·사진 변경 시 서명을 무효화한다. AI 생성·사진 업로드·저장 중 폼 편집과 저장을 잠근다.
- 공용 일반 삭제 확인 모달은 `components/ui`에 없어서 디자인 시스템의 모달 클래스를 그대로 사용했다. Escape 취소와 모달 버튼 사이 Tab 이동을 제공한다.
- 브라우저 뒤로가기 버튼은 프로젝트 메인으로 돌아가며 기존 sessionStorage 복원 플래그를 기록한다.

## 기본값 근거.

- 시공사명은 `Project.g2b_corp_nm`(나라장터 계약의 업체명), 없으면 빈 문자열이다. `Project`에는 별도 contractor 필드가 없다.
- 지구명은 `Project.project_name`이다.
- 점검자 소속은 `userProfile.branch_division` → `hq_division` → `company_name` → 빈 문자열 순이다.
- 성명은 `userProfile.full_name`, 직급은 빈 문자열이며 사용자가 입력한다.
- 수정 진입 시 저장된 작업내용 스냅샷을 직접 수정 입력란에 유지한다. TBM 재조회가 저장된 서명이나 항목을 자동 변경하지 않는다.

## 검증 결과.

- 새 페이지·컴포넌트 `npx eslint` — 오류 0, 경고 0.
- 기존 프로젝트 메인까지 포함한 변경 파일 eslint — 오류 0, 기존 경고 8건.
- `npx tsc --noEmit` — 통과.
- `npm run lint` — 종료 코드 0, 기존 경고 유지.
- `npm run test:patrol-ledger` — 기존 데이터·AI·SQL 회귀 23건 통과, 실패 0건.
- `git diff --check` — 공백 오류 없음.
- 새 화면에 `dark:`, `window.confirm`, `alert` 사용 없음.

브리프 지시에 따라 브라우저 화면 확인은 Advisor에게 남긴다. 새 독립 순수 함수를 추가하지 않아 UI 단위 테스트와 package.json 변경은 없으며, 위 23건은 UI 상호작용 테스트가 아니다. 빌드·커밋·푸시는 실행하지 않았다.

## 변경 파일.

- `safesys-app/src/app/project/[id]/patrol-ledger/page.tsx`
- `safesys-app/src/components/project/patrol-ledger/PatrolLedgerList.tsx`
- `safesys-app/src/components/project/patrol-ledger/PatrolLedgerDetail.tsx`
- `safesys-app/src/components/project/patrol-ledger/PatrolLedgerForm.tsx`
- `safesys-app/src/app/project/[id]/page.tsx`
- `docs/architecture.md`
- 이 보고서.
