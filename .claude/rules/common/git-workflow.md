# Git Workflow

## Commit Message Format
```
<type>: <description>

<optional body>
```

Types: feat, fix, refactor, docs, test, chore, perf, ci

> 언제·얼마나 잘게 커밋할지(원자적 커밋, "한 문장으로 설명 가능" 기준) 원칙은 [CLAUDE.md](../../../CLAUDE.md) 가이드 #9를 따른다. 이 파일은 메시지 포맷·타입·PR 절차를 담는다.

Note: Attribution disabled globally via ~/.claude/settings.json.

## Pull Request Workflow

When creating PRs:
1. Analyze full commit history (not just latest commit)
2. Use `git diff [base-branch]...HEAD` to see all changes
3. Draft comprehensive PR summary
4. Include test plan with TODOs
5. Push with `-u` flag if new branch

> For the full development process (planning, TDD, code review) before git operations,
> see [development-workflow.md](./development-workflow.md).
