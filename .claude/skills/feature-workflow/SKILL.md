---
name: feature-workflow
description: 새 기능 구현이나 비자명한 변경에 착수할 때 따르는 SafeSys 개발 파이프라인 — 선행 리서치·재사용 조사, 계획 산출물, TDD, 코드 리뷰, 커밋까지. "기능 추가", "새로 구현", "이거 만들어줘" 같은 요청에서 코드를 쓰기 전에 연다.
---

# Feature Implementation Workflow

> 커밋 메시지 포맷과 PR 절차는 [git-workflow.md](../../rules/common/git-workflow.md)를 따른다.

## 0. Research & Reuse _(새 구현 전 필수)_

- **GitHub 코드 검색 우선.** 무언가 새로 쓰기 전에 `gh search repos`·`gh search code`로 기존 구현·템플릿·패턴을 찾는다.
- **라이브러리 문서 두 번째.** Context7 또는 벤더 1차 문서로 API 동작·패키지 사용법·버전별 차이를 확인한 뒤 구현한다.
- **Exa는 앞의 둘로 부족할 때만.** 폭넓은 웹 리서치·탐색이 필요한 경우에 쓴다.
- **패키지 레지스트리 확인.** 유틸리티 코드를 직접 쓰기 전에 npm 등에서 검증된 라이브러리를 먼저 찾는다.
- 문제의 80% 이상을 푸는 오픈소스가 있으면 포크·포팅·래핑을 새로 쓰는 것보다 우선한다.

## 1. Plan First

- `superpowers:writing-plans` 스킬로 구현 계획을 만든다.
- 의존성과 리스크를 식별하고 단계로 나눈다.
- 비자명 작업은 `plans/YYYYMMDD_주제.md`와 함께 `checklist.md`·`context-notes.md`도 산출한다 — CLAUDE.md 가이드 #7을 따른다.

## 2. TDD Approach

- `superpowers:test-driven-development` 스킬을 따른다.
- RED → GREEN → REFACTOR 사이클과 80%+ 커버리지 기준은 [testing.md](../../rules/common/testing.md)를 단일 출처로 따른다.

## 3. Code Review

- 코드를 쓴 직후 `superpowers:code-reviewer` 에이전트로 리뷰한다.
- CRITICAL·HIGH 이슈는 반드시 처리하고, MEDIUM도 가능하면 고친다.

## 4. Commit & Push

- 원자적 커밋으로 나누고 conventional commits 포맷을 지킨다.
- `git push origin main`은 즉시 운영 배포다 — CLAUDE.md 핵심 제약 #2를 확인한 뒤 진행한다.
