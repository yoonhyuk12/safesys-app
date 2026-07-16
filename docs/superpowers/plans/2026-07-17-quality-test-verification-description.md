# Quality Test Verification Description Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 확인시험 선택 카드에 공사감독자가 본부 품질담당에게 시험을 의뢰하는 실제 업무 흐름을 정확히 안내한다.

**Architecture:** 기존 `QualityTestRecordsTab`의 시험구분 설명 상수를 그대로 사용하고 확인시험 문자열 한 줄만 교체한다. 컴포넌트 구조와 데이터 흐름은 변경하지 않는다.

**Tech Stack:** Next.js 15, React 19, TypeScript

## Global Constraints

- 확정 문구는 `공사감독자가 본부 품질담당에게 의뢰해 진행하는 시험입니다.`이다.
- 기존 시험 결과의 검증 또는 확인이라는 의미를 포함하지 않는다.
- 다른 시험구분 설명과 화면·데이터 로직은 변경하지 않는다.
- 프로덕션 빌드는 실행하지 않는다.

---

### Task 1: 확인시험 선택 카드 설명 수정

**Files:**
- Modify: `safesys-app/src/components/project/quality/QualityTestRecordsTab.tsx:88-89`
- Test: 텍스트 상수에 대한 PowerShell 인라인 검증

**Interfaces:**
- Consumes: `TEST_CATEGORY_DEFINITIONS: Record<string, string>`의 `확인시험` 항목
- Produces: 확인시험 선택 카드에 표시되는 확정 설명 문자열

- [ ] **Step 1: 새 문구 검증을 실행해 변경 전 실패를 확인한다**

```powershell
$content = Get-Content -Raw 'src/components/project/quality/QualityTestRecordsTab.tsx'
if (-not $content.Contains('공사감독자가 본부 품질담당에게 의뢰해 진행하는 시험입니다.')) { throw '확인시험 설명이 확정 문구와 다릅니다.' }
```

Run: `powershell -NoProfile -Command "$content = Get-Content -Raw 'src/components/project/quality/QualityTestRecordsTab.tsx'; if (-not $content.Contains('공사감독자가 본부 품질담당에게 의뢰해 진행하는 시험입니다.')) { throw '확인시험 설명이 확정 문구와 다릅니다.' }"`

Expected: FAIL with `확인시험 설명이 확정 문구와 다릅니다.`

- [ ] **Step 2: 확인시험 설명 한 줄을 확정 문구로 교체한다**

```typescript
  확인시험: '공사감독자가 본부 품질담당에게 의뢰해 진행하는 시험입니다.',
```

- [ ] **Step 3: 텍스트 검증을 다시 실행해 통과를 확인한다**

Run: `powershell -NoProfile -Command "$content = Get-Content -Raw 'src/components/project/quality/QualityTestRecordsTab.tsx'; if (-not $content.Contains('공사감독자가 본부 품질담당에게 의뢰해 진행하는 시험입니다.')) { throw '확인시험 설명이 확정 문구와 다릅니다.' }; if ($content.Contains('기존 시험 결과를 검증하기 위해 발주자·공사감독자가 직접 하거나 전문기관에 의뢰하는 시험입니다.')) { throw '기존 확인시험 설명이 남아 있습니다.' }"`

Expected: PASS with exit code 0 and no output.

- [ ] **Step 4: 정적 검사를 실행한다**

Run: `npm run lint`

Expected: exit code 0.

Run: `npx tsc --noEmit`

Expected: exit code 0.

- [ ] **Step 5: 변경 범위를 검토하고 커밋한다**

```powershell
git diff --check
git diff -- src/components/project/quality/QualityTestRecordsTab.tsx
git add -- src/components/project/quality/QualityTestRecordsTab.tsx
git commit -m "fix: 확인시험 의뢰 흐름 설명 수정"
```
