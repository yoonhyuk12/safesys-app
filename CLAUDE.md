# CLAUDE.md

`AGENTS.md`는 이 파일을 가리키는 심볼릭 링크다. 에이전트 공통 지침은 여기와 연결된 `docs/`에서만 관리한다.

이 파일은 목차(map)다. 백과사전이 아니다. 상세 지식은 [`docs/`](./docs/index.md) 기록 시스템에 카테고리별로 분리·색인되어 있다. 여기서 필요한 문서만 열어 점진적으로 컨텍스트를 확보하라.

> 원칙. 하나의 큰 지침 파일은 실패한다 — 주요 제약을 묻고, 낡은 규칙의 무덤이 되고, 기계적 점검이 불가능하다. 그래서 이 파일엔 "가장 중요한 제약"만 인라인으로 두고 나머지는 링크한다. 문서가 코드 동작과 어긋나면 그것은 버그다. 발견 즉시 갱신하라.

## 프로젝트 한 줄 요약

SafeSys — Next.js 15 · React 19 · Supabase로 만든 한국 건설 안전관리 시스템(PWA). 안전 점검(폭염·관리자·본부불시·TBM), 작업자 관리, 자재 원장, 문서 생성(PDF/Excel/HWPX).

## 지식 베이스 지도 (docs/)

| 문서 | 내용 |
|------|------|
| [docs/index.md](./docs/index.md) | 지식 베이스 목차·네비게이션 허브 |
| [docs/architecture.md](./docs/architecture.md) | 기술 스택, Dashboard 중심 라우팅, 라우트/API, 컴포넌트·유틸·타입 |
| [docs/conventions.md](./docs/conventions.md) | Advisor/Worker 역할, 행동 가이드라인 10개, 코딩 스타일, 테스트, 커밋/PR |
| [docs/database.md](./docs/database.md) | 테이블, `ON DELETE CASCADE` 규칙, 일괄서명 등록 규칙, 마이그레이션, MCP |
| [docs/auth.md](./docs/auth.md) | 역할 체계, 조직 구조, 접근 권한 패턴, 인증 플로우, 보안 체크리스트 |
| [docs/environment.md](./docs/environment.md) | 개발 명령어, main 푸시=자동 배포, 환경 변수, API 키 위치 |
| [docs/design-system.md](./docs/design-system.md) | UI 정본 — 색·표면 계층·타이포·버튼/입력/배지·표·화면 골격, 쓰지 말 것 목록 |
| [docs/위험성평가 실시 가이드.md](./docs/위험성평가%20실시%20가이드.md) | 빈도·강도법 위험성평가 규정 요약과 SafeSys 구현 대응 |
| [docs/현행시스템_정의서.md](./docs/현행시스템_정의서.md) | 현행 시스템 정의서 — 스택·배포·서버·DB 명세/ERD·라이브러리·외부 API·개발환경·사용자 규모 |
| [docs/troubleshooting.md](./docs/troubleshooting.md) | 빌드 캐시, 프로필 미동기화, 권한/지도, html2canvas PDF 버그 |

`plans/` — 계획서(일급 아티팩트, `YYYYMMDD_주제.md`). `database/*.sql` — 마이그레이션(`YYYYMMDD-HHMM_설명.sql`). `wiki/검사기준/` — 공종단계별 검사 기준 LLM 위키(구조·규칙은 그 안의 CLAUDE.md 참조).

`.claude/skills/` — 프로젝트 전용 스킬. 비자명 기능은 [`feature-workflow`](./.claude/skills/feature-workflow/SKILL.md)로 착수하고, HWPX 생성은 [`hwpx-authoring`](./.claude/skills/hwpx-authoring/SKILL.md), 작업 로그 장치는 [`worklog`](./.claude/skills/worklog/SKILL.md)를 연다.

루트 `log.md` — PostToolUse 훅(`.claude/hooks/log_change.py`)이 파일 변경을 자동 기록하고 SessionStart 훅(`session_brief.py`)이 최근 25건을 세션 브리프로 넣는다. 손으로 고치지 않는다. 더 거슬러 올라가려면 직접 읽는다.

## 핵심 제약 (항상 적용, 위반 금지)

핵심 제약의 정본은 [`.claude/rules/safesys/`](./.claude/rules/README.md)에 주제별로 나뉘어 있다. `paths:`가 없는 규칙은 매 세션 자동 로드되고, 경로 한정 규칙은 해당 파일을 읽을 때 로드된다. 아래 표는 색인이지 본문이 아니다. 규칙 본문은 각 파일에서만 고친다.

| 규칙 파일 | 한 줄 요약 | 로드 |
|-----------|-----------|------|
| [roles.md](./.claude/rules/safesys/roles.md) | 너는 Advisor다. 구현은 Codex `gpt-6-astra` low Worker에게 위임하고 diff·테스트로 직접 검증한다 | 항상 |
| [deploy.md](./.claude/rules/safesys/deploy.md) | main 푸시 = 즉시 운영 배포. `npm run build`는 동의 없이 시작 금지 | 항상 |
| [language.md](./.claude/rules/safesys/language.md) | 한국어로 답하고 문장을 콜론으로 끝내지 않는다. 새 소스 파일 첫 줄에 한국어 역할 주석 | 항상 |
| [surgical-change.md](./.claude/rules/safesys/surgical-change.md) | 요청과 무관한 코드는 손대지 않는다. 완료 전 린트·타입체크·테스트 | 항상 |
| [signature-overlay.md](./.claude/rules/safesys/signature-overlay.md) | 출력물 서명 이미지는 `(서명 또는 인)` 문구 위에 겹친다 | `src/lib/{excel,reports,hwpx}`·`scripts` 편집 시 |
| [design-system.md](./.claude/rules/safesys/design-system.md) | UI는 새로 디자인하지 않고 [design-system.md](./docs/design-system.md) 클래스를 복사해 쓴다. `dark:` 금지 | `*.tsx`·`*.css` 편집 시 |

## 빠른 명령어

모든 명령어는 `safesys-app`에서 실행한다.

```bash
cd safesys-app
npm install              # 의존성 설치 (node_modules 없으면 dev/build 전부 실패)
npm run dev              # 개발 서버 (http://localhost:3000)
npm run lint             # ESLint
npx tsc --noEmit         # 타입 점검
npm run test:<도메인>    # node --test 단위 테스트 (예: test:accident-report). 전체 실행용 npm test는 없다
npm run                  # 사용 가능한 test:<도메인> 스크립트 전체 목록 확인
npm run build            # 프로덕션 빌드 (동의 없이 시작 금지)
```

## 작업 착수 절차 (비자명 작업)

1. [conventions.md](./docs/conventions.md)의 행동 가이드라인을 따른다 — 가정 명시, 단순성 우선, 계획·체크리스트·컨텍스트 노트 산출.
2. 관련 docs 문서를 열어 컨텍스트를 확보한다 (예: DB 작업 → [database.md](./docs/database.md), 권한 → [auth.md](./docs/auth.md)).
3. Worker에게 위임할 브리프에 파일 경로·컨벤션·함정·완료 기준을 담는다.
4. diff·테스트로 직접 검증한 뒤 의미 단위로 커밋한다.
