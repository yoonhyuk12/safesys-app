# Rules

> **이 프로젝트의 canonical 규칙 출처는 [`docs/conventions.md`](../../docs/conventions.md)다.** 이 `rules/` 디렉터리는 이식형 룰셋(공통+언어별)의 미러이며, SafeSys 규범과 충돌하면 `docs/`가 우선한다. 규칙을 갱신할 땐 `docs/`를 먼저 고치고 필요 시 여기 반영한다.

## Rule Priority

When language-specific rules and common rules conflict, **language-specific rules take precedence** (specific overrides general). This follows the standard layered configuration pattern (similar to CSS specificity or `.gitignore` precedence).

- `rules/common/` defines universal defaults applicable to all projects.
- `rules/golang/`, `rules/python/`, `rules/swift/`, `rules/php/`, `rules/typescript/`, etc. override those defaults where language idioms differ.

### Example

`common/coding-style.md` recommends immutability as a default principle. A language-specific `golang/coding-style.md` can override this:

> Idiomatic Go uses pointer receivers for struct mutation — see [common/coding-style.md](../common/coding-style.md) for the general principle, but Go-idiomatic mutation is preferred here.

### Common rules with override notes

Rules in `rules/common/` that may be overridden by language-specific files are marked with:

> **Language note**: This rule may be overridden by language-specific rules for languages where this pattern is not idiomatic.
