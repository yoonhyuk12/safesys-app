# Agent Orchestration

에이전트 목록과 설명은 매 세션 자동 주입된다(정의 파일은 `.claude/agents/`). 여기서는 사용 시점만 정한다.

## Immediate Agent Usage

No user prompt needed:
1. Complex feature requests - Use **planner** agent
2. Code just written/modified - Use **code-reviewer** agent
3. Bug fix or new feature - Use **tdd-guide** agent
4. Architectural decision - Use **architect** agent
