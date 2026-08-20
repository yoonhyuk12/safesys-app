# Coding Style

> 단순성(불필요한 추상화·과잉 구현 지양)과 외과적 변경 원칙은 [CLAUDE.md](../../../CLAUDE.md) 가이드 #2·#3을 따른다. 이 파일은 불변성과 파일 구성 규칙을 담는다.

## Immutability (CRITICAL)

ALWAYS create new objects, NEVER mutate existing ones:

```
// Pseudocode
WRONG:  modify(original, field, value) → changes original in-place
CORRECT: update(original, field, value) → returns new copy with change
```

Rationale: Immutable data prevents hidden side effects, makes debugging easier, and enables safe concurrency.

## File Organization

MANY SMALL FILES > FEW LARGE FILES:
- High cohesion, low coupling
- 200-400 lines typical, 800 max
- Extract utilities from large modules
- Organize by feature/domain, not by type
