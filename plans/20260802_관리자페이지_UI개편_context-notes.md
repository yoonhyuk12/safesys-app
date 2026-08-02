# 관리자 Command Center UI 개편 컨텍스트 노트

작업 중 내린 결정과 근거를 이어서 기록한다. 계획서는 `20260802_관리자페이지_UI개편.md`, 핸드오버 경위는 `20260802_관리자페이지_UI개편_handover.md`를 본다.

## 진행 경위

- Task 1(공용 정렬 도메인)은 Orca 세션에서 완료됐고 커밋 `b47f2c8`, `9bb7484`다.
- Task 2 이후는 Claude Code 세션이 이어받았다. 구현은 저장소 규칙대로 `worker-opus`에 위임하고 Advisor가 diff·테스트를 직접 확인한다.
- 작업 워크트리는 `C:/Users/EKR/orca/workspaces/safesys/admin-command-center`, 브랜치는 `yoonhyuk12/admin-command-center`다.

## 결정 기록

### Playwright의 JSX 런타임 강제와 `@jsxImportSource` 프래그마 (Task 2)

**문제.** Playwright 1.58의 babel 변환은 테스트가 import한 `src/**/*.tsx` 소스까지 JSX를 `playwright/jsx-runtime`으로 컴파일한다. 그 결과 `renderToStaticMarkup`이 React 엘리먼트가 아닌 객체를 받아 `Objects are not valid as a React child (found: object with keys {__pw_type, type, props, key})`로 3개 테스트가 모두 실패했다.

**선택.** `AdminSortControls.tsx`와 `AdminMobileDisclosure.tsx` 최상단에 `/** @jsxImportSource react */` 한 줄을 추가했다.

**근거.**
- 신규 패키지 설치 금지 제약 때문에 Vitest·React Testing Library 도입은 이번 범위에서 불가능하다.
- 테스트 파일을 고치는 방식은 통하지 않는다. 테스트 파일 자체에는 JSX가 없고(`createElement`만 사용) 변환 대상은 import된 컴포넌트 소스이기 때문이다.
- 프래그마는 계획서 코드에 손대지 않는 최소 변경이며, Next.js 기본 `jsxImportSource`도 `react`라서 앱 동작에는 변화가 없다.

**검증.** 개발 서버에서 `/admin/users`가 HTTP 200으로 컴파일됐다(803 modules). 주석이 `'use client'` 위에 있어도 클라이언트 컴포넌트 판정에 영향이 없음을 실제 요청으로 확인했다.

**남는 부채.** 테스트 러너 사정이 프로덕션 소스에 새어 들어간 형태다. 앞으로 렌더 테스트를 붙이는 컴포넌트마다 같은 프래그마가 필요하다. 컴포넌트 렌더 테스트를 본격적으로 늘릴 계획이라면 별도 러너 도입을 검토한다.

### 모바일 헤더의 `메인으로` 경로 (Task 3)

계획서의 모바일 헤더에는 탭이 두 개뿐이라 데스크톱 사이드바에 있는 `메인으로` 링크 자리가 없다. 탭을 늘려 정보 구조를 바꾸는 대신 브랜드 영역 자체를 `/`로 가는 링크(`title="메인으로"`)로 만들어 접근 경로만 보존했다.

### 페이지네이션·검색 결과 문구를 테이블 밖으로 분리 (Task 4·5 공통)

기존에는 `검색 결과 N건`·`N / N 페이지` 문구가 테이블 컨테이너 **안**에 있었다. 컨테이너에 `hidden md:block`을 걸면 모바일에서 이 정보가 통째로 사라진다. 그래서 두 화면 모두 목록 위 메타 바와 목록 아래 페이지 바를 독립 요소로 분리해 데스크톱·모바일이 함께 쓰도록 했다. 표시 문구와 페이지 이동 동작은 그대로다.

### 두 페이지의 파일 길이 (Task 4·5)

`users/page.tsx` 835행, `projects/page.tsx` 766행이다. 프로젝트 기준은 800행 max라 가입자 화면이 35행 초과다. 계획서가 Task 4·5 범위를 각 `page.tsx` 단일 파일 수정으로 못박아 이번엔 그대로 두었다. 표현용 하위 컴포넌트를 `src/components/admin/`으로 옮기면 두 파일 모두 400행대로 내려간다. 후속 정리 대상이다.

### 개발 서버 `.next` 잔여 상태로 인한 오탐 (검증 단계)

파일을 대규모로 교체한 뒤 **이미 떠 있던** 개발 서버에 `/admin/users`를 요청하면 500이 났다.

```
⨯ [Error [InvariantError]: Invariant: Expected clientReferenceManifest to be defined. This is a bug in Next.js.]
  page: '/admin/users'
```

같은 서버에서 그 시점에 처음 컴파일된 `/admin/projects`는 200이었다. `.next`를 지우고 서버를 새로 띄우면 두 페이지 모두 200이다(각각 831·830 modules 컴파일). 즉 코드 결함이 아니라 HMR 매니페스트 불일치다. 관리자 화면을 크게 고친 뒤 검증할 때는 개발 서버를 재기동해야 오탐을 피한다.

## 알려진 기존 문제 (이번 범위 밖, 손대지 않음)

- `playwright.config.ts`의 `webServer`가 모든 테스트 실행 시 `npm run dev`를 띄운다. 순수 단위 테스트에도 개발 서버가 필요해 CI에서는 불필요한 비용이 된다.
- `npm run lint`에 기존 경고가 남아 있다(`src/lib/weather.ts` 미사용 심볼, `supabase.ts`·`supabase-admin.ts`의 불필요한 eslint-disable 등). 이번 변경 파일에서 생긴 경고는 없다.
