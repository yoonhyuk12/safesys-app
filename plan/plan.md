# 텔레그램 발주청 알림 발송 확장 계획

## 개요
프로젝트에 등록된 `client_telegram_id`(발주청 텔레그램 ID)로 각종 안전점검 등록/저장 시 알림 메시지를 자동 발송한다.
현재 TBM 제출 시에만 발송되는 텔레그램 알림을 4개 점검 항목으로 확장한다.

## 현재 구조 (참고 — 반드시 기존 패턴 따를 것)

### 기존 TBM 발송 패턴 (TBMSubmissionModal.tsx 참고)
```typescript
// 이 패턴을 그대로 따라서 구현할 것
try {
  if (!editingSubmission) {  // 신규 등록일 때만 발송
    const { data: projectData } = await supabase
      .from('projects')
      .select('client_telegram_id')
      .eq('id', projectId)
      .single()

    if (projectData?.client_telegram_id) {
      const telegramMessage = `...HTML 형식 메시지...`
      await fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'direct',
          chatId: projectData.client_telegram_id,
          message: telegramMessage
        })
      })
    }
  }
} catch (telegramError) {
  console.error('텔레그램 발송 오류:', telegramError)
  // 발송 실패해도 저장은 성공 처리
}
```

### 핵심 규칙
- **`src/lib/telegram.ts`는 서버사이드 전용**이므로 클라이언트 컴포넌트에서 직접 import 불가
- 모든 클라이언트 컴포넌트에서는 **`fetch('/api/telegram', ...)`로 호출**해야 함 (TBM과 동일)
- `sendClientNotification()` 헬퍼 함수는 만들지 않음 — 각 컴포넌트에서 인라인으로 구현 (TBM 패턴과 동일)

---

## 구현 순서 및 상세 지시사항

### Step 1: 안전서류점검 — `SafetyCheckForm.tsx`

**파일**: `safesys-app/src/app/project/[id]/safe-documents/components/SafetyCheckForm.tsx`

**삽입 위치**: `saveToSupabase()` 함수 내부, `showToastMessage('저장되었습니다!', 'success')` 직후, `if (onSaveSuccess)` 직전

**현재 코드 흐름** (라인 ~524-545):
```typescript
const { error } = await supabase
  .from('safe_document_inspections')
  .insert(insertData);

if (error) { throw error; }
localStorage.removeItem('safetyCheckFormData');
showToastMessage('저장되었습니다!', 'success');
// ★ 여기에 텔레그램 발송 코드 삽입 ★
if (onSaveSuccess) {
  setTimeout(() => { onSaveSuccess(); }, 1000);
}
```

**추가할 코드 (try-catch로 감싸서):**
```typescript
// 텔레그램 알림 발송 (발주청)
try {
  const { data: projectData } = await supabase
    .from('projects')
    .select('client_telegram_id')
    .eq('id', projectId)
    .single()

  if (projectData?.client_telegram_id) {
    // 불이행 항목 추출
    const nonCompliantItems = Object.entries(formData.checklistItems)
      .filter(([, value]) => value === '불이행')
      .map(([key]) => key)

    const telegramMessage =
      `📋 <b>안전서류점검 결과 알림</b>\n\n` +
      `🏗️ <b>현장:</b> ${formData.projectName}\n` +
      `📅 <b>점검일자:</b> ${formData.inspectionDate}\n` +
      `👤 <b>점검자:</b> ${formData.inspectorName} (${formData.inspectorAffiliation})\n\n` +
      `📊 <b>점검결과:</b>\n` +
      `✅ 이행: ${compliantCount}건\n` +
      `❌ 불이행: ${nonCompliantCount}건\n` +
      `➖ 해당없음: ${notApplicableCount}건` +
      (nonCompliantItems.length > 0
        ? `\n\n⚠️ <b>불이행 항목:</b>\n${nonCompliantItems.map(item => `- ${item}`).join('\n')}`
        : '')

    await fetch('/api/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'direct',
        chatId: projectData.client_telegram_id,
        message: telegramMessage
      })
    })
  }
} catch (telegramError) {
  console.error('텔레그램 발송 오류:', telegramError)
}
```

**주의사항:**
- `compliantCount`, `nonCompliantCount`, `notApplicableCount` 변수는 이미 `saveToSupabase()` 함수 내에서 계산되어 있음 (라인 ~503-506). 재계산 불필요.
- `formData.projectName`은 사용자가 입력한 값 (폼 state에서 가져옴)
- 이 폼은 편집 모드가 없으므로 신규/편집 분기 불필요 (항상 insert)
- `formData.checklistItems`는 `Record<string, CheckOption>` 타입 — 키가 `'공사안전보건대장'` 같은 한글 항목명, 값이 `'이행'|'불이행'|'해당없음'`

---

### Step 2: 본부불시점검 — `headquarters-inspection/page.tsx`

**파일**: `safesys-app/src/app/project/[id]/headquarters-inspection/page.tsx`

**프로젝트 정보 접근:**
- `projectId` = `params.id as string` (라인 57)
- `project?.project_name` = `project` state에서 (라인 ~68, `loadProject()`으로 로드)

**편집 모드 구분:**
- `isEditMode` state (라인 74) — true면 편집, false면 신규
- **신규 등록 시에만 발송**

**삽입 위치 1**: `handleSaveWithSignature()` 함수 내 — 신규 등록 성공 후
- `alert('본부 불시점검이 성공적으로 저장되었습니다!')` 직후 (라인 ~1223)
- 이 `else` 블록이 신규 등록 분기임 (위의 `if (isEditMode && editingInspectionId)` 블록은 편집)

**삽입 위치 2**: `handleSaveWithoutSignature()` — 이것은 **편집 전용** 함수이므로 텔레그램 발송 추가 불필요

**현재 코드 흐름 (`handleSaveWithSignature` 신규 분기, 라인 ~1198-1225):**
```typescript
} else {
  // 신규 등록 분기
  const { error } = await supabase
    .from('headquarters_inspections')
    .insert({ ... })

  if (error) {
    alert(`저장 실패: ${error.message}`)
    setLoading(false)
    return
  }

  alert('본부 불시점검이 성공적으로 저장되었습니다!')
  // ★ 여기에 텔레그램 발송 코드 삽입 ★
}
```

**추가할 코드:**
```typescript
// 텔레그램 알림 발송 (발주청)
try {
  const { data: projectTgData } = await supabase
    .from('projects')
    .select('client_telegram_id')
    .eq('id', projectId)
    .single()

  if (projectTgData?.client_telegram_id) {
    const telegramMessage =
      `🔍 <b>본부불시점검 결과 알림</b>\n\n` +
      `🏗️ <b>현장:</b> ${project?.project_name}\n` +
      `📅 <b>점검일자:</b> ${newRecord.inspection_date}\n` +
      `👤 <b>점검자:</b> ${newRecord.inspector_name}\n\n` +
      `📝 <b>지적사항:</b>\n` +
      `1. ${newRecord.issue_content1}` +
      (newRecord.issue_content2 ? `\n2. ${newRecord.issue_content2}` : '')

    await fetch('/api/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'direct',
        chatId: projectTgData.client_telegram_id,
        message: telegramMessage
      })
    })
  }
} catch (telegramError) {
  console.error('텔레그램 발송 오류:', telegramError)
}
```

**주의사항:**
- `newRecord` state에서 `inspection_date`, `inspector_name`, `issue_content1`, `issue_content2` 접근
- `project?.project_name`으로 프로젝트명 접근
- 변수명 `projectTgData`로 사용 (기존 `projectData` 등과 충돌 방지)
- `handleSaveWithSignature()` 내의 편집 분기 (`if (isEditMode && editingInspectionId)`)에는 추가하지 않음
- `handleSaveWithoutSignature()`에는 추가하지 않음 (편집 전용)

---

### Step 3: 정기점검(안전점검관리대장) — `SafetyInspectionForm.tsx`

**파일**: `safesys-app/src/components/project/SafetyInspectionForm.tsx`

**프로젝트 정보 접근:**
- `projectId` = prop (required string)
- `project` = prop (Project | null) → `project?.project_name`

**편집 모드 구분:**
- `editingId` prop — null이면 신규, 값이 있으면 편집
- **신규 등록(`editingId === null`)일 때만 발송**

**삽입 위치**: `handleSave()` 함수 내부, `onSaved()` 호출 직전 (라인 ~619)

**현재 코드 흐름 (라인 ~530-620):**
```typescript
let inspectionId = editingId

if (editingId) {
  // 편집 — update
  await (supabase.from('safety_inspections') as any).update(inspectionData).eq('id', editingId)
} else {
  // 신규 — insert
  const { data } = await (supabase.from('safety_inspections') as any).insert(inspectionData).select('id').single()
  if (data) inspectionId = data.id
}

if (!inspectionId) throw new Error('점검 ID를 가져올 수 없습니다.')

// ... results 저장 (safety_inspection_results 테이블 delete + insert) ...
// ... photos 저장 (safety_inspection_photos 테이블 delete + insert) ...

// ★ 여기에 텔레그램 발송 코드 삽입 (onSaved() 직전) ★
onSaved()
```

**추가할 코드:**
```typescript
// 텔레그램 알림 발송 (발주청) - 신규 등록 시에만
if (!editingId) {
  try {
    const { data: projectTgData } = await supabase
      .from('projects')
      .select('client_telegram_id')
      .eq('id', projectId)
      .single()

    if (projectTgData?.client_telegram_id) {
      // 지적사항이 있는 항목 추출 (results state에서)
      const findingsItems = results
        .filter(r => r.findings && r.findings.trim() !== '')
        .map(r => `- ${r.field_item}: ${r.findings}`)

      const telegramMessage =
        `📝 <b>정기안전점검 결과 알림</b>\n\n` +
        `🏗️ <b>현장:</b> ${project?.project_name}\n` +
        `📅 <b>점검일자:</b> ${inspectionDate}\n` +
        `📋 <b>점검유형:</b> ${inspectionType}\n` +
        `👤 <b>점검자:</b> ${inspectionTeam || '(미입력)'}\n\n` +
        (findingsItems.length > 0
          ? `⚠️ <b>지적사항:</b>\n${findingsItems.join('\n')}`
          : `✅ 지적사항 없음`)

      await fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'direct',
          chatId: projectTgData.client_telegram_id,
          message: telegramMessage
        })
      })
    }
  } catch (telegramError) {
    console.error('텔레그램 발송 오류:', telegramError)
  }
}
```

**주의사항:**
- `results` state는 `{ field_item: string, findings: string, action_items: string, sort_order: number, photo_url: string }[]` 타입
- `inspectionType`은 `'해빙기' | '우기' | '종합' | '특별'` 중 하나
- `inspectionDate`, `inspectionTeam` 변수명은 해당 컴포넌트의 state 변수명 확인 필요 — `formData` 형태가 아니라 개별 state일 수 있음
  - 실제 state 확인: `const [inspectionType, setInspectionType] = useState(...)`, `const [inspectionDate, setInspectionDate] = useState(...)` 등
- `!editingId` 조건으로 신규만 필터

---

### Step 4: 폭염대비점검 — `heatwave/page.tsx`

**파일**: `safesys-app/src/app/project/[id]/heatwave/page.tsx`

**프로젝트 정보 접근:**
- `projectId` = `params.id as string` (라인 30)
- `project?.project_name` = `project` state에서 (라인 ~87-112, `loadProject()`으로 로드)

**편집 모드:** 없음 — 항상 신규 insert만. 신규/편집 분기 불필요.

**삽입 위치**: `handleSaveInspection()` 함수 내부
- `alert('점검이 성공적으로 저장되었습니다!...')` 직후 (라인 ~355)
- `await loadHeatwaveChecks()` 직전 (라인 ~358)

**현재 코드 흐름 (라인 ~340-360):**
```typescript
if (insertError) {
  throw new Error(`데이터 저장 실패: ${insertError.message}`)
}

console.log('점검 데이터 저장 성공:', insertedData)

const uploadSummary = [...]
alert(`점검이 성공적으로 저장되었습니다!\n\n${uploadSummary.join('\n')}`)

// ★ 여기에 텔레그램 발송 코드 삽입 ★
await loadHeatwaveChecks()
```

**추가할 코드:**
```typescript
// 텔레그램 알림 발송 (발주청)
try {
  const { data: projectTgData } = await supabase
    .from('projects')
    .select('client_telegram_id')
    .eq('id', projectId)
    .single()

  if (projectTgData?.client_telegram_id) {
    const telegramMessage =
      `🌡️ <b>폭염대비점검 결과 알림</b>\n\n` +
      `🏗️ <b>현장:</b> ${project?.project_name}\n` +
      `📅 <b>측정일시:</b> ${data.measureDateTime.replace('T', ' ')}\n` +
      `👤 <b>점검자:</b> ${data.inspectorName}\n` +
      `🌡️ <b>체감온도:</b> ${data.temperature}℃\n\n` +
      `📋 <b>점검항목:</b>\n` +
      `💧 음용수 공급: ${data.water === 'O' ? '✅' : '❌'}\n` +
      `🌬️ 통풍: ${data.wind === 'O' ? '✅' : '❌'}\n` +
      `⏸️ 휴식시간: ${data.rest === 'O' ? '✅' : '❌'}\n` +
      `❄️ 냉방장치: ${data.cooling === 'O' ? '✅' : '❌'}\n` +
      `🚑 응급조치: ${data.emergency === 'O' ? '✅' : '❌'}\n` +
      `⏰ 근무시간 조정: ${data.workTime === 'O' ? '✅' : '❌'}`

    await fetch('/api/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'direct',
        chatId: projectTgData.client_telegram_id,
        message: telegramMessage
      })
    })
  }
} catch (telegramError) {
  console.error('텔레그램 발송 오류:', telegramError)
}
```

**주의사항:**
- `data`는 `handleSaveInspection(data: HeatWaveInspectionData)` 함수의 매개변수
- `data.water`, `data.wind` 등은 `'O'` 또는 `'X'` 문자열 (boolean이 아님 — DB 저장 시 `=== 'O'`로 변환)
- `data.measureDateTime`은 `'2026-03-04T14:30'` 형식 → `.replace('T', ' ')`로 보기 좋게 변환

---

## 수정 파일 목록 (총 4개)

| # | 파일 경로 | 변경 내용 |
|---|----------|----------|
| 1 | `src/app/project/[id]/safe-documents/components/SafetyCheckForm.tsx` | `saveToSupabase()` 함수에 텔레그램 발송 코드 추가 |
| 2 | `src/app/project/[id]/headquarters-inspection/page.tsx` | `handleSaveWithSignature()` 신규등록 분기에 텔레그램 발송 코드 추가 |
| 3 | `src/components/project/SafetyInspectionForm.tsx` | `handleSave()` 함수에 신규등록 시 텔레그램 발송 코드 추가 |
| 4 | `src/app/project/[id]/heatwave/page.tsx` | `handleSaveInspection()` 함수에 텔레그램 발송 코드 추가 |

**참고: `src/lib/telegram.ts`는 수정하지 않음** — 클라이언트 컴포넌트에서 서버사이드 유틸 import 불가하므로, TBM과 동일하게 각 컴포넌트에서 `/api/telegram` API를 직접 fetch 호출

---

## 공통 발송 정책

1. **신규 등록 시에만 발송** — 편집/수정 시 미발송 (TBM과 동일)
2. **비동기 발송** — 저장 성공 후 발송, 발송 실패해도 저장 결과에 영향 없음
3. **try-catch 감싸기** — 텔레그램 발송 실패 시 `console.error`만 출력
4. **client_telegram_id 확인** — 없으면 조용히 스킵
5. **메시지 형식** — HTML parse_mode (기존 `/api/telegram` 라우트가 자동 처리)
6. **API 호출 형식** — `fetch('/api/telegram', { method: 'POST', body: JSON.stringify({ type: 'direct', chatId, message }) })`
