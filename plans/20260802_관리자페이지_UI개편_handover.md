# 관리자 Command Center Claude Code 핸드오버

## 현재 위치

- 작업 워크트리: `C:/Users/EKR/orca/workspaces/safesys/admin-command-center`
- 작업 브랜치: `yoonhyuk12/admin-command-center`
- 기준 커밋: `b88fc38`
- Task 1 최종 코드 커밋: `9bb7484`
- 구현 계획: `plans/20260802_관리자페이지_UI개편.md`
- 디자인 명세: `docs/superpowers/specs/2026-08-02-admin-command-center-design.md`
- SDD 진행 원장: `.superpowers/sdd/progress.md`

## 사용자 확정 요구사항

- 시각안은 A안 `Midnight Command`를 적용한다.
- 데스크톱 데이터 테이블은 작업 열을 제외한 모든 열에서 `정렬 없음 → 오름차순 → 내림차순 → 정렬 없음` 순환을 지원한다.
- 데이터는 `검색·필터 → 전체 안정 정렬 → 페이지 분할` 순서로 처리한다.
- 767px 이하 모바일은 처음에 접힌 목록을 보여주고, 항목을 누르면 상세 내용을 표시하며 한 번에 한 항목만 펼친다.
- 관리자 로그아웃 버튼은 데스크톱과 모바일의 우측 상단에 표시하고 성공 시 `/login`으로 이동한다.
- 기존 관리자 인증·수정·삭제 및 프로젝트 조회·삭제 API를 유지한다.
- 신규 SQL, API 응답 변경, 데이터 모델 변경, 신규 패키지 설치는 하지 않는다.
- Fable 모델은 사용하지 않는다. 구현 워커는 저장소 규칙의 `worker-opus`, 검토도 Opus로 진행한다.

## 완료된 Task 1

- `safesys-app/src/lib/admin-sort.ts`
- `safesys-app/src/lib/admin-list-sort.ts`
- `safesys-app/tests/admin-sort.spec.ts`
- 최초 구현 커밋 `b47f2c8`
- 독립 검토 Important 보강 커밋 `9bb7484`
- 최종 테스트 `10 passed`
- `npx tsc --noEmit` exit 0
- `npm run lint` exit 0이며 변경 파일 신규 경고는 없다.
- 최종 Opus 재검토 결과는 Spec compliant, Critical 0, Important 0, Approved다.

Task 1의 `sortRows`는 정렬 값을 행당 한 번만 계산하며 null-last와 안정 정렬을 유지한다. 불리언 `false`와 숫자 `0`이 빈 값으로 취급되지 않는 회귀 테스트도 포함한다.

## 남은 구현 순서

1. Task 2에서 `AdminSortControls.tsx`, `AdminMobileDisclosure.tsx`, `admin-controls.spec.tsx`를 TDD로 구현한다.
2. Task 3에서 `admin-session.ts`, `admin-session.spec.ts`, Midnight Command 레이아웃과 우측 상단 로그아웃을 구현한다.
3. Task 4에서 가입자 화면에 전체 결과 정렬, 데스크톱 테이블, 모바일 단일 disclosure를 연결한다.
4. Task 5에서 프로젝트 화면에 같은 정렬·반응형 규칙을 연결한다.
5. Task 6에서 lint, TypeScript, 관련 Playwright 테스트, `git diff --check`, 데스크톱·모바일 브라우저 검증을 수행한다.

각 Task는 구현 전 실패 테스트, 구현 후 GREEN, Task 단위 Opus 독립 검토 순서로 진행한다. 여러 TSX 파일을 수정한 뒤에는 React best-practices 검토도 적용한다.

## 시작 명령

```powershell
Set-Location 'C:/Users/EKR/orca/workspaces/safesys/admin-command-center'
git status --short
git log --oneline -5
Set-Location safesys-app
npx playwright test tests/admin-sort.spec.ts --project=chromium
npx tsc --noEmit
```

`npm run build`는 사용자 동의 없이 실행하지 않고, 푸시하지 않는다. 모든 앱 명령은 `safesys-app`에서 실행한다.

## 주의사항

- 메인 작업 폴더에는 사용자의 별도 체크리스트 수정과 `.superpowers` 미추적 파일이 있으므로 건드리지 않는다.
- 현재 기능 브랜치와 워크트리는 격리돼 있다. 남은 작업도 같은 워크트리에서 이어간다.
- Task 1 최초 검토의 Minor 항목은 병합 차단 사유가 아니다. 옵션 배열 `satisfies`, 공백 문자열 처리, 단위 테스트용 Playwright 프로젝트 분리는 Task 6에서 필요성을 판단한다.
- 브라우저 검증 전 인증 세션과 환경 변수를 확인하되 자격 증명을 새 파일에 복사하지 않는다.
