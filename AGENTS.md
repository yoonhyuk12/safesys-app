# Repository Guidelines
## 프로젝트 구조 및 모듈 구성
SafeSys 코드는 `safesys-app/` Next.js 워크스페이스에 위치합니다. 페이지와 레이아웃은 `src/app/` 아래에 있고(`src/app/list/page.tsx` 등), 공용 컴포넌트는 `src/components/`, 도메인 유틸은 `src/lib/`, 상태 관리 로직은 `src/contexts/` 및 `src/providers/`에 둡니다. SQL 마이그레이션과 RLS 정책은 `database/*.sql`, 정적 자산은 `public/`, 샘플 QA 자료는 `test-files/`에 유지하세요. `tsconfig.json`에서 선언된 `@/*` 경로 별칭을 적극 활용합니다.

## 빌드·테스트·개발 명령
- `npm run dev` - 개발 서버를 3000번 포트에서 실행합니다.
- `npm run build` - 프로덕션 번들을 생성하며 타입/린트 오류 시 실패합니다.
- `npm run start` - 마지막 빌드 결과를 스테이징 검수용으로 구동합니다.
- `npm run lint` - Next.js ESLint 프리셋을 적용해 코드 품질을 검사합니다.
- `npx tsc --noEmit` - 커밋 전 추가 타입 안정성 점검용으로 실행합니다.
- `npm run deploy` - 빌드 후 즉시 `next start`를 실행하는 배포 검증 용도입니다.

## 코딩 스타일 및 네이밍
React 함수 컴포넌트는 TypeScript와 2칸 들여쓰기를 사용합니다. 컴포넌트는 `PascalCase`, 커스텀 훅은 `useCamelCase`, 헬퍼 모듈은 `camelCase.ts`로 이름을 정하세요. Tailwind CSS 유틸리티 클래스를 우선 활용하고, 별도 CSS는 불가피한 경우에만 추가합니다. Supabase 관련 클라이언트는 `src/lib/*.ts`, DTO는 `src/types/`, 환경 변수는 `.env.example`에 맞춰 `SCREAMING_SNAKE_CASE`로 정리합니다.

## 테스트 가이드
현재 자동화 테스트 프레임워크는 없으므로 린트, 타입 체크, 수동 시나리오 검증이 필수입니다. `npm run lint`, `npx tsc --noEmit`을 실행한 뒤 로그인, 점검 목록(`/list`), 프로젝트 상세(`/project/[id]`), 지도 화면을 직접 확인하세요. `test-files/`에 있는 샘플 데이터나 산출물은 기능 업데이트 시 함께 갱신하고, `database/` SQL을 수정했다면 변경 의도를 PR 본문에 기록합니다.

## 커밋 및 PR 지침
Git 로그와 동일하게 Conventional Commits(`fix:`, `feat:`, `chore:` 등)를 사용합니다. 메시지는 명령형으로 작성하고 하나의 논리 단위만 포함하세요. PR에는 요약, 관련 이슈 링크, UI 변경 시 스크린샷, `database/` 변경 요약, 필요한 `.env` 갱신 안내를 포함해야 하며, 머지 전 리뷰를 반드시 요청합니다.

## 보안 및 설정 팁
`.env.local`은 `.env.example`을 복사해 작성하고 비밀 값은 Git에 올리지 마세요. Supabase 키가 로그나 공유 문서에 노출되면 즉시 교체합니다. `schema.sql` 또는 정책 스크립트를 수정한 뒤에는 `src/lib/auth.ts`의 헬퍼를 활용해 역할별 접근 권한을 검증하고, 기대 동작을 PR 설명에 명확히 남겨 팀과 공유하세요.

