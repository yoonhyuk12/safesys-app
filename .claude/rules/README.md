# Rules

> **이 프로젝트의 canonical 규칙 출처는 [`docs/conventions.md`](../../docs/conventions.md)다.** 규칙을 갱신할 땐 `docs/`를 먼저 고치고 필요 시 여기 반영한다.

## 디렉터리 구성

| 디렉터리 | 내용 | 로드 |
|----------|------|------|
| `safesys/` | SafeSys 핵심 제약(역할·배포·한국어·외과적 변경·서명·디자인 시스템). [CLAUDE.md](../../CLAUDE.md)의 "핵심 제약" 표가 색인이다 | `paths:` 없는 파일은 매 세션, 있는 파일은 해당 경로 파일을 읽을 때 |
| `common/` | 이식형 공통 룰셋 미러(코딩 스타일·git·보안·테스트). SafeSys 규범과 충돌하면 `docs/`가 우선 | 매 세션 |
| `typescript/` | TS/JS 전용 룰셋 미러. `common/`을 확장한다 | `*.ts`·`*.tsx`·`*.js`·`*.jsx` 읽을 때 |

Claude Code는 `.claude/rules/` 아래 `.md`를 재귀적으로 찾는다. `paths:` 프런트매터가 없는 규칙은 `CLAUDE.md`와 같은 우선순위로 세션 시작 시 로드되고, 있는 규칙은 glob에 맞는 파일을 읽을 때만 컨텍스트에 들어온다. 한 파일엔 한 주제만 담고, 200줄을 넘기지 않는다.

## Rule Priority

When language-specific rules and common rules conflict, **language-specific rules take precedence** (specific overrides general). This follows the standard layered configuration pattern (similar to CSS specificity or `.gitignore` precedence).

- `rules/common/` defines universal defaults applicable to all projects.
- `rules/typescript/` overrides those defaults where language idioms differ.
- `rules/safesys/` is project-specific and wins over both.

### Example

`common/coding-style.md` recommends immutability as a default principle. A language-specific `typescript/coding-style.md` extends it with spread-based updates.
