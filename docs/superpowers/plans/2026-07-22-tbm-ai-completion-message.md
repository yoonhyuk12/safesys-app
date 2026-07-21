# TBM AI 작성 완료 알림 문구 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** TBM 위험분석 AI 작성 완료 알림에 수시 위험성평가 연계 확인 안내를 추가한다.

**Architecture:** 기존 `completionMessage` 조립과 브라우저 `alert` 흐름을 유지한다. 완료 문장 뒤에 줄바꿈과 지정 안내 문구만 추가하고, 정적 회귀 테스트로 문구를 보호한다.

**Tech Stack:** React 19, TypeScript, Node.js 내장 테스트 러너

## Global Constraints

- 지정 문구는 `수시 위험성평가와 연계성을 확인하고 필요시 수정 바랍니다.`다.
- 기존 완료 정보와 오류 알림은 유지한다.
- 사용자 작업 중인 모달의 다른 변경은 수정하거나 커밋하지 않는다.

---

### Task 1: AI 작성 완료 알림 안내 추가

**Files:**
- Modify: `safesys-app/tests/tbm-risk-analysis-config.test.mjs`
- Modify: `safesys-app/src/components/project/TBMSubmissionModal.tsx:542`

**Interfaces:**
- Consumes: 입력 여부에 따라 조립된 `completionMessage`
- Produces: 기존 완료 정보와 수시 위험성평가 연계 확인 안내가 포함된 브라우저 알림

- [ ] **Step 1: 실패하는 회귀 테스트 추가**

`safesys-app/tests/tbm-risk-analysis-config.test.mjs`에 다음 테스트를 추가한다.

```javascript
test('TBM AI 작성 완료 알림이 수시 위험성평가 연계 확인을 안내한다', () => {
  assert.match(
    modalSource,
    /수시 위험성평가와 연계성을 확인하고 필요시 수정 바랍니다\./
  )
})
```

- [ ] **Step 2: 테스트가 지정 문구 부재로 실패하는지 확인**

Run from `safesys-app`:

```powershell
node --test --test-name-pattern="완료 알림" tests/tbm-risk-analysis-config.test.mjs
```

Expected: 지정 문구를 찾지 못해 테스트 1개 실패.

- [ ] **Step 3: 완료 알림에 지정 문구 추가**

기존 완료 문구 조립을 다음 코드로 변경한다.

```typescript
completionMessage += '에 대해 AI작성을 완료했습니다.\n\n수시 위험성평가와 연계성을 확인하고 필요시 수정 바랍니다.'
```

- [ ] **Step 4: 전체 회귀 테스트 실행**

Run from `safesys-app`:

```powershell
node --test tests/tbm-risk-analysis-config.test.mjs
```

Expected: 테스트 3개 통과.

- [ ] **Step 5: TypeScript 타입 검사**

Run from `safesys-app`:

```powershell
npx tsc --noEmit
```

Expected: 종료 코드 0, TypeScript 오류 없음.

- [ ] **Step 6: 요청 범위만 선별 커밋**

```powershell
$diff = @(git diff --no-color -U3 -- 'safesys-app/src/components/project/TBMSubmissionModal.tsx')
$header = @($diff[0..3])
$body = @()
$include = $false
foreach ($line in $diff) {
  if ($line -like '@@ *') {
    $include = $line -match '^@@ -534,'
  }
  if ($include) {
    $body += $line
  }
}
$patch = (($header + $body) -join "`n") + "`n"
$patch | git apply --cached --check -
$patch | git apply --cached -
git add -- safesys-app/tests/tbm-risk-analysis-config.test.mjs
git commit -m "feat: TBM AI 완료 알림에 위험성평가 확인 안내 추가"
```
