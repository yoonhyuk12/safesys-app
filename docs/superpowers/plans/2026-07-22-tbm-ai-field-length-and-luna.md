# TBM AI 입력 길이 및 GPT-5.4 nano 모델 변경 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** TBM 위험분석 수기 입력칸을 최대 50자로 유지하고, AI가 각 칸을 30자 이내로 작성하도록 하며 생성 모델과 화면 표시를 GPT-5.4 nano로 통일한다.

**Architecture:** 기존 TBM 제출 모달과 위험분석 API 구조를 유지하고 모델 문자열과 UI 안내만 외과적으로 변경한다. API는 `gpt-5.4-nano`로 요청하고, UI는 같은 모델명을 표시한다.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, OpenAI Chat Completions API

## Global Constraints

- 잠재위험요인·대책·잠재위험요소 수기 입력칸은 최대 50자다.
- AI 프롬프트에는 `각각의 칸에 30자 이내로 작성해주세요.`를 그대로 포함한다.
- AI 모델 식별자는 `gpt-5.4-nano`다.
- 모델 요청에는 `temperature` 파라미터를 포함하지 않는다.
- 화면 모델명은 `powered by GPT-5.4 nano`다.
- AI 응답을 강제로 절단하지 않고 데이터베이스 스키마도 변경하지 않는다.
- 프로덕션 빌드는 사용자 동의 없이 실행하지 않는다.

---

### Task 1: 위험분석 API 프롬프트와 모델 변경

**Files:**
- Create: `safesys-app/tests/tbm-risk-analysis-config.test.mjs`
- Modify: `safesys-app/src/app/api/ai/write-risk-analysis/route.ts:32`
- Modify: `safesys-app/src/app/api/ai/write-risk-analysis/route.ts:58`

**Interfaces:**
- Consumes: `todayWork`, `personnelInput`, `equipmentInput` 요청 본문과 `OPENAI_API_KEY` 환경 변수
- Produces: 기존 `{ success: true, data: result }` 응답 형식을 유지한 GPT-5.4 nano 위험분석 결과

- [ ] **Step 1: 모델·프롬프트·입력 제한 회귀 테스트 작성**

`safesys-app/tests/tbm-risk-analysis-config.test.mjs`를 다음 내용으로 생성한다.

```javascript
// TBM 위험분석 모델·문구·입력 길이 설정을 검증하는 정적 회귀 테스트
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const routeSource = await readFile(
  new URL('../src/app/api/ai/write-risk-analysis/route.ts', import.meta.url),
  'utf8'
)
const modalSource = await readFile(
  new URL('../src/components/project/TBMSubmissionModal.tsx', import.meta.url),
  'utf8'
)

test('TBM 위험분석 API가 GPT-5.4 nano 모델과 칸별 30자 프롬프트를 사용한다', () => {
  assert.match(routeSource, /각각의 칸에 30자 이내로 작성해주세요\./)
  assert.match(routeSource, /model: 'gpt-5\.4-nano'/)
  assert.doesNotMatch(routeSource, /\btemperature\s*:/)
})

test('TBM 위험분석 화면이 GPT-5.4 nano를 표시하고 각 수기 입력을 50자로 제한한다', () => {
  assert.match(modalSource, /powered by GPT-5\.4 nano/)

  const riskSection = modalSource.match(
    /\{\/\* 잠재위험요인\/대책 \*\/\}([\s\S]*?)\{\/\* 기타사항 \*\/\}/
  )?.[1] ?? ''
  const fiftyCharacterLimits = riskSection.match(/maxLength=\{50\}/g) ?? []

  assert.equal(fiftyCharacterLimits.length, 3)
})
```

- [ ] **Step 2: 변경 전 테스트가 올바른 이유로 실패하는지 확인**

Run:

```powershell
node --test tests/tbm-risk-analysis-config.test.mjs
```

Expected: API와 UI 테스트가 모두 기대 문자열 불일치로 실패.

- [ ] **Step 3: 프롬프트와 모델을 변경하고 비호환 파라미터 제거**

`route.ts`의 길이 지시와 모델 값을 다음과 같이 변경하고, 기존 `temperature: 0.7` 속성은 제거한다.

```typescript
        각각의 칸에 30자 이내로 작성해주세요. 서로 중복되지 않게 해주세요:
```

```typescript
        model: 'gpt-5.4-nano',
```

- [ ] **Step 4: API 테스트가 통과하는지 확인**

Run:

```powershell
node --test --test-name-pattern="API" tests/tbm-risk-analysis-config.test.mjs
```

Expected: API 테스트 1개 통과, UI 테스트 1개 건너뜀.

- [ ] **Step 5: API 변경과 회귀 테스트 커밋**

```powershell
git add -- safesys-app/tests/tbm-risk-analysis-config.test.mjs safesys-app/src/app/api/ai/write-risk-analysis/route.ts
git commit -m "feat: TBM 위험분석을 GPT-5.4 nano로 변경"
```

---

### Task 2: TBM 위험분석 입력칸과 모델 표시 변경

**Files:**
- Modify: `safesys-app/src/components/project/TBMSubmissionModal.tsx:1627`
- Modify: `safesys-app/src/components/project/TBMSubmissionModal.tsx:1726`
- Modify: `safesys-app/src/components/project/TBMSubmissionModal.tsx:1739`
- Modify: `safesys-app/src/components/project/TBMSubmissionModal.tsx:1784-1790`

**Interfaces:**
- Consumes: 기존 `formData` 위험요인·대책·위험요소 문자열과 `handleInputChange`
- Produces: 최대 50자 입력이 가능한 위험분석 필드와 `powered by GPT-5.4 nano` 모델 안내

- [ ] **Step 1: 변경 전 UI 검증이 실패하는지 확인**

Run:

```powershell
rg -n "powered by GPT-5.4 nano|maxLength=\{50\}" safesys-app/src/components/project/TBMSubmissionModal.tsx
```

Expected: 일치 항목이 없어 종료 코드 1.

- [ ] **Step 2: 화면 모델 표시 변경**

모델 안내를 다음 JSX로 변경한다.

```tsx
<div className="text-xs text-gray-500">powered by GPT-5.4 nano</div>
```

- [ ] **Step 3: 위험분석 입력칸을 50자로 통일**

잠재위험요인과 대책의 기존 속성을 다음과 같이 변경한다.

```tsx
maxLength={50}
```

잠재위험요소 입력에도 같은 속성을 추가한다.

```tsx
<input
  type="text"
  value={formData[`riskFactor${num}` as keyof FormData] as string}
  onChange={(e) => handleInputChange(`riskFactor${num}` as keyof FormData, e.target.value)}
  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
  required
  maxLength={50}
/>
```

- [ ] **Step 4: 변경된 UI 문자열과 입력 제한을 정적 검증**

Run:

```powershell
node --test tests/tbm-risk-analysis-config.test.mjs
```

Expected: API와 UI 테스트, 총 2개 통과.

- [ ] **Step 5: TypeScript 타입 검사**

Run from `safesys-app`:

```powershell
npx tsc --noEmit
```

Expected: 종료 코드 0, TypeScript 오류 없음.

- [ ] **Step 6: 브라우저에서 TBM 제출 모달 확인**

Open: `http://localhost:3000/project/54528950-f768-4eef-ba16-0c3c64db0f66/tbm-submission`

Expected: AI 위험요인 분석 우측에 `powered by GPT-5.4 nano`가 표시되고, 잠재위험요인·대책·잠재위험요소 입력칸의 DOM `maxlength`가 모두 `50`.

- [ ] **Step 7: UI 변경 커밋**

```powershell
git add -- safesys-app/src/components/project/TBMSubmissionModal.tsx
git commit -m "feat: TBM 위험분석 입력 길이를 확장"
```
