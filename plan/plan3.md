# Plan 3: TBM 임시저장(Draft) 기능 구현

## 개요
TBM 제출 페이지에 "임시저장" 기능을 추가하여, 사용자가 사무실에서 작업내용/교육내용을 미리 입력해두고, 실제 TBM 시 교육사진과 서명을 추가하여 최종 제출하는 워크플로우를 지원한다.

## 요구사항 정리

### 임시저장 기능
- "제출" 버튼 옆에 "임시저장" 버튼 추가
- 임시저장 시 **서명 불필요**, **모든 필드 입력 불필요** (부분 저장 허용)
- 임시저장된 데이터는 DB에 `status: 'draft'` 상태로 저장

### 캘린더 표시
- 기존 최종 제출: 녹색 배경 (현행 유지)
- 임시저장: **투명 보라색 배경**으로 표시 (예: `bg-purple-50` + 보라색 배지)

### 수정 모드 진입
- 캘린더에서 임시저장된 날짜 클릭 → 제출내역에서 해당 항목 선택 → **수정 모드** 진입
- 수정 모드에서 "임시저장" 또는 "최종 제출" 선택 가능

### 임시저장 데이터 노출 제한
- `/tbm` (TBM 현황 페이지): 임시저장 데이터 **표시 안 됨**
- `/map` (지도 페이지): 임시저장 데이터 **표시 안 됨**
- `/safe/tbm` (안전현황 TBM): 임시저장 데이터 **표시 안 됨**
- 엑셀 출력: 임시저장 데이터 **포함 안 됨**

---

## 수정 대상 파일 목록 (총 5개)

| # | 파일 경로 | 변경 유형 |
|---|-----------|----------|
| 1 | `database/add_tbm_draft_status.sql` | **신규 생성** |
| 2 | `safesys-app/src/lib/tbm.ts` | 수정 |
| 3 | `safesys-app/src/components/project/TBMSubmissionModal.tsx` | 수정 |
| 4 | `safesys-app/src/app/project/[id]/tbm-submission/page.tsx` | 수정 |
| 5 | `safesys-app/src/app/api/tbm-view/[id]/route.ts` | 수정 |

---

## 파일별 상세 수정 내용

### 1. DB 마이그레이션 SQL (신규 생성)

**파일: `database/add_tbm_draft_status.sql`**

> **주의**: 이 SQL은 사용자가 Supabase 웹 콘솔 SQL Editor에서 직접 실행해야 함 (MCP 읽기 전용)

```sql
-- tbm_submissions 테이블에 status 컬럼 추가
ALTER TABLE tbm_submissions
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'submitted';

-- 인덱스 추가 (status 기반 필터링 성능)
CREATE INDEX IF NOT EXISTS idx_tbm_submissions_status ON tbm_submissions(status);

COMMENT ON COLUMN tbm_submissions.status IS 'draft: 임시저장, submitted: 최종제출';
```

- `status` 값: `'draft'` (임시저장) | `'submitted'` (최종제출)
- 기존 레코드는 DEFAULT `'submitted'`로 자동 적용됨

---

### 2. `safesys-app/src/lib/tbm.ts` — getTBMRecords 쿼리 수정

**목적**: `/tbm`, `/map`, `/safe/tbm` 페이지에서 임시저장 데이터 제외

#### 수정 위치: 73~78번 라인

**현재 코드 (73~78번 라인):**
```typescript
      let query = supabase
        .from('tbm_submissions')
        .select('*')
        .eq('meeting_date', date)
        .not('today_work', 'is', null)
        .neq('today_work', '작업없음')
```

**변경 후:**
```typescript
      let query = supabase
        .from('tbm_submissions')
        .select('*')
        .eq('meeting_date', date)
        .eq('status', 'submitted')          // ← 추가: 최종 제출만 조회
        .not('today_work', 'is', null)
        .neq('today_work', '작업없음')
```

#### 수정 위치: 183~188번 라인 (getTBMStats 함수)

**현재 코드 (183~188번 라인):**
```typescript
      let query = supabase
        .from('tbm_submissions')
        .select('headquarters, branch, project_name, new_worker_count, personnel_count')
        .eq('meeting_date', date)
        .not('today_work', 'is', null)
        .neq('today_work', '작업없음')
```

**변경 후:**
```typescript
      let query = supabase
        .from('tbm_submissions')
        .select('headquarters, branch, project_name, new_worker_count, personnel_count')
        .eq('meeting_date', date)
        .eq('status', 'submitted')          // ← 추가: 최종 제출만 통계
        .not('today_work', 'is', null)
        .neq('today_work', '작업없음')
```

**효과**: 이 수정으로 아래 페이지들에서 임시저장 데이터가 자동 제외됨:
- `/tbm` — TBMStatus 컴포넌트가 `getTBMRecords()` 호출
- `/map` — Dashboard 지도 모드가 `getTBMRecords()` 호출
- `/safe/tbm` — SafetyTBMView가 `getTBMRecords()` 호출
- 엑셀 출력 — TBMStatus의 엑셀 내보내기가 `getTBMRecords()` 결과 사용

---

### 3. `safesys-app/src/components/project/TBMSubmissionModal.tsx` — 임시저장 기능 추가

#### 3-1. Props 인터페이스에 onDraftSave 콜백 추가

**수정 위치: 10~21번 라인**

**현재 코드:**
```typescript
interface TBMSubmissionModalProps {
  isOpen: boolean
  onClose: () => void
  projectId: string
  projectName: string
  managingHq: string
  managingBranch: string
  projectCategory?: string
  userEmail?: string
  selectedDate?: string
  onSuccess?: () => void
  editingSubmission?: any
}
```

**변경 후:**
```typescript
interface TBMSubmissionModalProps {
  isOpen: boolean
  onClose: () => void
  projectId: string
  projectName: string
  managingHq: string
  managingBranch: string
  projectCategory?: string
  userEmail?: string
  selectedDate?: string
  onSuccess?: () => void
  editingSubmission?: any
  onDraftSave?: () => void   // 임시저장 완료 콜백
}
```

#### 3-2. 컴포넌트 파라미터에 onDraftSave 추가

함수 선언부에서 `onDraftSave`를 destructure에 추가.

#### 3-3. 새 함수 `handleDraftSave` 추가

`handleSubmit` 함수 (787번 라인) 바로 위에 새 함수를 추가한다.

```typescript
  const handleDraftSave = async () => {
    // 임시저장: 최소 검증만 수행
    if (!userEmail) {
      alert('사용자 이메일 정보를 찾을 수 없습니다.')
      return
    }
    if (!managingHq || !managingBranch) {
      alert('프로젝트 본부/지사 정보를 찾을 수 없습니다.')
      return
    }
    // educationDate만 필수 (캘린더 표시를 위해)
    if (!formData.educationDate) {
      alert('교육 일자를 선택해주세요.')
      return
    }

    try {
      setLoading(true)

      // 사진이 있으면 업로드, 없으면 기존 URL 유지 또는 null
      let educationPhotoUrl = editingSubmission?.education_photo_url || null
      let signatureUrl = editingSubmission?.signature_url || null

      if (formData.educationPhoto && !formData.noWorkCheck) {
        try {
          const compressedFile = await compressImage(formData.educationPhoto, 1200, 0.75)
          educationPhotoUrl = await uploadToStorage(compressedFile, 'education', formData.educationPhoto.name)
        } catch (error) {
          console.warn('이미지 압축 실패, 원본 사용:', error)
          educationPhotoUrl = await uploadToStorage(formData.educationPhoto, 'education', formData.educationPhoto.name)
        }
      }

      if (formData.signature && !formData.noWorkCheck) {
        const base64Data = formData.signature.split(',')[1] || formData.signature
        const byteCharacters = atob(base64Data)
        const byteNumbers = new Array(byteCharacters.length)
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i)
        }
        const byteArray = new Uint8Array(byteNumbers)
        const signatureBlob = new Blob([byteArray], { type: 'image/png' })
        signatureUrl = await uploadToStorage(signatureBlob, 'signatures', 'signature.png')
      }

      // 교육 시간 계산
      const startTime = formData.educationStartTime.split(':')
      const endTime = formData.educationEndTime.split(':')
      const startMinutes = parseInt(startTime[0]) * 60 + parseInt(startTime[1])
      const endMinutes = parseInt(endTime[0]) * 60 + parseInt(endTime[1])
      const duration = endMinutes - startMinutes

      const submitData: any = {
        project_id: projectId,
        reporter_email: userEmail || '',
        headquarters: managingHq,
        branch: managingBranch,
        project_name: projectName,
        project_type: projectCategory || '',
        construction_company: userProfile?.company_name || '',
        today_work: formData.todayWork,
        address: formData.baseAddress,
        detail_address: formData.detailAddress,
        personnel_count: formData.personnelInput,
        new_worker_count: formData.newWorkerCount ? parseInt(formData.newWorkerCount) : null,
        equipment_input: formData.equipmentInput,
        risk_work_type: formData.riskWorkType,
        cctv_usage: formData.cctvUsage,
        meeting_date: formData.educationDate,
        education_date: formData.educationDate,
        education_start_time: formData.educationStartTime,
        education_end_time: formData.educationEndTime,
        education_duration: duration,
        education_photo_url: educationPhotoUrl,
        potential_risk_1: formData.potentialRisk1,
        solution_1: formData.solution1,
        potential_risk_2: formData.potentialRisk2,
        solution_2: formData.solution2,
        potential_risk_3: formData.potentialRisk3,
        solution_3: formData.solution3,
        main_risk_selection: formData.mainRiskSelection,
        main_risk_solution: formData.mainRiskSolution,
        risk_factor_1: formData.riskFactor1,
        risk_factor_2: formData.riskFactor2,
        risk_factor_3: formData.riskFactor3,
        other_remarks: formData.otherRemarks,
        reporter_name: formData.name,
        reporter_contact: formData.contact,
        signature_url: signatureUrl,
        latitude: formData.latitude || null,
        longitude: formData.longitude || null,
        status: 'draft'  // ★ 핵심: 임시저장 상태
      }

      let submitOperation
      if (editingSubmission) {
        submitOperation = supabase
          .from('tbm_submissions')
          .update(submitData)
          .eq('id', editingSubmission.id)
      } else {
        submitData.submitted_at = new Date().toISOString()
        submitOperation = supabase
          .from('tbm_submissions')
          .insert([submitData])
      }

      const { error } = await submitOperation.select().single()

      if (error) {
        console.error('임시저장 오류:', error)
        throw new Error(error.message)
      }

      // ★ 텔레그램 알림 전송하지 않음 (드래프트이므로)

      alert('임시저장되었습니다.')
      onDraftSave?.()
      onSuccess?.()
      onClose()
    } catch (error: any) {
      console.error('임시저장 오류:', error)
      alert(`임시저장 중 오류가 발생했습니다: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }
```

#### 3-4. 기존 `handleSubmit` 함수에 `status: 'submitted'` 추가

**수정 위치: 885~924번 라인의 `submitData` 객체 내부**

`submitData` 객체에 `status: 'submitted'` 필드를 추가한다.

**현재 코드 (922~923번 라인 부분):**
```typescript
        latitude: formData.latitude || null,
        longitude: formData.longitude || null
      }
```

**변경 후:**
```typescript
        latitude: formData.latitude || null,
        longitude: formData.longitude || null,
        status: 'submitted'  // ★ 최종 제출 상태 (드래프트에서 전환 시에도 적용)
      }
```

#### 3-5. 모달 헤더 배지 변경 — 드래프트 수정 시 표시

**수정 위치: 1025~1027번 라인**

**현재 코드:**
```tsx
              <span className="bg-blue-600 text-white px-2 py-1 rounded-md text-sm md:text-lg font-semibold whitespace-nowrap self-start md:self-auto">
                {editingSubmission ? 'TBM수정' : 'TBM제출'}
              </span>
```

**변경 후:**
```tsx
              <span className={`${editingSubmission?.status === 'draft' ? 'bg-purple-600' : 'bg-blue-600'} text-white px-2 py-1 rounded-md text-sm md:text-lg font-semibold whitespace-nowrap self-start md:self-auto`}>
                {editingSubmission?.status === 'draft' ? '임시저장 수정' : editingSubmission ? 'TBM수정' : 'TBM제출'}
              </span>
```

#### 3-6. 하단 버튼 영역에 "임시저장" 버튼 추가

**수정 위치: 1573~1598번 라인**

**현재 코드:**
```tsx
            {/* 제출 버튼 */}
            <div className="flex justify-end gap-2 pt-4 border-t">
              <button
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50"
              >
                취소
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {editingSubmission ? '수정 중...' : '제출 중...'}
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    {editingSubmission ? '수정' : '제출'}
                  </>
                )}
              </button>
            </div>
```

**변경 후:**
```tsx
            {/* 제출 버튼 */}
            <div className="flex justify-end gap-2 pt-4 border-t">
              <button
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50"
              >
                취소
              </button>
              <button
                onClick={handleDraftSave}
                disabled={loading}
                className="px-4 py-2 text-sm text-purple-700 bg-purple-50 border border-purple-300 rounded-md hover:bg-purple-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    임시저장 중...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    임시저장
                  </>
                )}
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {editingSubmission ? '수정 중...' : '제출 중...'}
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    {editingSubmission ? '수정' : '제출'}
                  </>
                )}
              </button>
            </div>
```

---

### 4. `safesys-app/src/app/project/[id]/tbm-submission/page.tsx` — 캘린더 및 목록 수정

#### 4-1. TBMSubmission 인터페이스에 `status` 필드 추가

**수정 위치: 15~28번 라인**

**현재 코드:**
```typescript
interface TBMSubmission {
  id: string
  project_id?: string
  project_name: string
  headquarters: string
  branch: string
  meeting_date: string
  education_start_time?: string
  education_end_time?: string
  reporter_name?: string
  reporter_contact?: string
  submitted_at?: string
  [key: string]: any
}
```

**변경 후:**
```typescript
interface TBMSubmission {
  id: string
  project_id?: string
  project_name: string
  headquarters: string
  branch: string
  meeting_date: string
  education_start_time?: string
  education_end_time?: string
  reporter_name?: string
  reporter_contact?: string
  submitted_at?: string
  status?: 'draft' | 'submitted'   // ← 추가
  [key: string]: any
}
```

#### 4-2. `getSubmissionCountForDate` 함수를 `getSubmissionInfoForDate`로 교체

**수정 위치: 195~198번 라인**

**현재 코드:**
```typescript
  const getSubmissionCountForDate = (day: number) => {
    const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return submissions.filter(sub => sub.meeting_date?.startsWith(dateStr)).length
  }
```

**변경 후:**
```typescript
  const getSubmissionInfoForDate = (day: number) => {
    const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const dateSubs = submissions.filter(sub => sub.meeting_date?.startsWith(dateStr))
    const draftCount = dateSubs.filter(sub => sub.status === 'draft').length
    const submittedCount = dateSubs.filter(sub => sub.status !== 'draft').length
    return { draftCount, submittedCount, total: dateSubs.length }
  }
```

#### 4-3. 캘린더 날짜 셀 렌더링 변경

**수정 위치: 558~597번 라인** (days.map 내부)

캘린더 날짜 버튼 렌더링에서 `submissionCount`를 `getSubmissionInfoForDate()` 결과로 교체한다.

**현재 코드 (핵심 부분):**
```tsx
                {days.map((day, index) => {
                  if (day === null) {
                    return <div key={`empty-${index}`} className="aspect-square" />
                  }

                  const submissionCount = getSubmissionCountForDate(day)
                  // ...
                  // 563번 라인: submissionCount 사용
                  // 578번 라인: isPrintMode && submissionCount === 0 → disabled
                  // 585번 라인: submissionCount > 0 → bg-green-50
                  // 590번 라인: submissionCount > 0 → 배지 표시
```

**변경 후:**
```tsx
                {days.map((day, index) => {
                  if (day === null) {
                    return <div key={`empty-${index}`} className="aspect-square" />
                  }

                  const { draftCount, submittedCount, total } = getSubmissionInfoForDate(day)
                  const isToday =
                    new Date().getDate() === day &&
                    new Date().getMonth() === currentMonth.getMonth() &&
                    new Date().getFullYear() === currentMonth.getFullYear()

                  const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                  const isSelected = !isPrintMode && selectedDate === dateStr
                  const isPrintSelected = isPrintMode && selectedPrintDates.includes(dateStr)

                  return (
                    <button
                      key={day}
                      onClick={() => handleDateClick(day)}
                      disabled={isPrintMode && total === 0}
                      className={`
                        aspect-square p-2 rounded-lg border transition-all disabled:cursor-not-allowed disabled:opacity-45
                        ${isPrintSelected ? 'border-amber-600 bg-amber-100 ring-2 ring-amber-500' : ''}
                        ${!isPrintSelected && isSelected ? 'border-blue-600 bg-blue-100 ring-2 ring-blue-500' : ''}
                        ${!isPrintSelected && !isSelected && isToday ? 'border-blue-500 bg-blue-50' : ''}
                        ${!isPrintSelected && !isSelected && !isToday ? 'border-gray-200 hover:border-gray-300' : ''}
                        ${!isPrintSelected && !isSelected && submittedCount > 0 ? 'bg-green-50' : ''}
                        ${!isPrintSelected && !isSelected && submittedCount === 0 && draftCount > 0 ? 'bg-purple-50/60' : ''}
                        ${!isPrintSelected && !isSelected && total === 0 ? 'hover:bg-gray-50' : ''}
                      `}
                    >
                      <div className={`text-sm font-medium ${isPrintSelected ? 'text-amber-900 font-bold' : isSelected ? 'text-blue-900 font-bold' : ''}`}>{day}</div>
                      {submittedCount > 0 && (
                        <div className={`text-xs mt-1 ${isPrintSelected ? 'text-amber-700 font-semibold' : isSelected ? 'text-blue-700 font-semibold' : 'text-green-600'}`}>
                          {submittedCount}건
                        </div>
                      )}
                      {draftCount > 0 && (
                        <div className="text-xs text-purple-600">
                          {draftCount}건(임시)
                        </div>
                      )}
                    </button>
                  )
                })}
```

#### 4-4. `handleDateClick` 내부 — `submissionCount` → `total` 변경

**수정 위치: 228번 라인**

**현재 코드:**
```typescript
      const submissionCount = submissions.filter(submission => submission.meeting_date?.startsWith(dateStr)).length
      if (submissionCount === 0) return
```

**변경 후:**
```typescript
      const totalCount = submissions.filter(submission => submission.meeting_date?.startsWith(dateStr)).length
      if (totalCount === 0) return
```

#### 4-5. 제출 목록에서 상태 배지 표시

**수정 위치: 689~814번 라인** (제출내역 리스트 영역)

제출 기록 헤더 텍스트 변경 (692번 라인 근처):
```tsx
                        <h4 className="text-sm font-medium text-gray-700">
                          제출 기록 ({selectedDateSubmissions.length}건)
                        </h4>
```

각 제출 항목 (`selectedDateSubmissions.map`) 내부 (738~745번 라인 근처)에 상태 배지를 추가한다.

**현재 코드 (738~745번 라인):**
```tsx
                                    <div className="flex-1">
                                      <div className="text-sm font-medium text-gray-900">
                                        {submission.reporter_name || '미입력'}
                                      </div>
                                      {submission.submitted_at && (
                                        <div className="text-xs text-gray-500 mt-1">
                                          제출: {formatSubmittedAt(submission.submitted_at)}
                                        </div>
                                      )}
                                    </div>
```

**변경 후:**
```tsx
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-gray-900">
                                          {submission.reporter_name || '미입력'}
                                        </span>
                                        {submission.status === 'draft' ? (
                                          <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full font-medium">임시저장</span>
                                        ) : (
                                          <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">제출완료</span>
                                        )}
                                      </div>
                                      {submission.submitted_at && (
                                        <div className="text-xs text-gray-500 mt-1">
                                          제출: {formatSubmittedAt(submission.submitted_at)}
                                        </div>
                                      )}
                                    </div>
```

#### 4-6. QR 코드 버튼: 드래프트에서는 숨기기

**수정 위치: 748~754번 라인**

QR 코드 버튼을 드래프트가 아닌 경우에만 표시:

**현재 코드:**
```tsx
                                      <button
                                        onClick={(e) => { e.stopPropagation(); setQrSubmission(submission) }}
                                        className="p-2.5 hover:bg-purple-100 rounded-lg transition-colors border border-purple-200 bg-purple-50"
                                        title="QR 코드"
                                      >
                                        <QrCode className="h-5 w-5 text-purple-600" />
                                      </button>
```

**변경 후:**
```tsx
                                      {submission.status !== 'draft' && (
                                        <button
                                          onClick={(e) => { e.stopPropagation(); setQrSubmission(submission) }}
                                          className="p-2.5 hover:bg-purple-100 rounded-lg transition-colors border border-purple-200 bg-purple-50"
                                          title="QR 코드"
                                        >
                                          <QrCode className="h-5 w-5 text-purple-600" />
                                        </button>
                                      )}
```

#### 4-7. TBMSubmissionModal 호출부에 `onDraftSave` 전달

**수정 위치: 901~914번 라인**

**현재 코드:**
```tsx
        <TBMSubmissionModal
          isOpen={isModalOpen}
          onClose={handleModalClose}
          projectId={projectId}
          projectName={project.project_name}
          managingHq={project.managing_hq}
          managingBranch={project.managing_branch}
          projectCategory={project.project_category}
          userEmail={userProfile.email}
          selectedDate={selectedDate || undefined}
          onSuccess={handleSubmissionSuccess}
          editingSubmission={editingSubmission}
        />
```

**변경 후:**
```tsx
        <TBMSubmissionModal
          isOpen={isModalOpen}
          onClose={handleModalClose}
          projectId={projectId}
          projectName={project.project_name}
          managingHq={project.managing_hq}
          managingBranch={project.managing_branch}
          projectCategory={project.project_category}
          userEmail={userProfile.email}
          selectedDate={selectedDate || undefined}
          onSuccess={handleSubmissionSuccess}
          editingSubmission={editingSubmission}
          onDraftSave={handleSubmissionSuccess}
        />
```

#### 4-8. 벌크 다운로드에서 드래프트 제외

**수정 위치: 202~210번 라인 (`getSubmissionsForDates` 함수)**

**현재 코드:**
```typescript
  const getSubmissionsForDates = (dates: string[]) => {
    return submissions
      .filter(submission => dates.some(date => submission.meeting_date?.startsWith(date)))
      .sort(...)
  }
```

**변경 후:**
```typescript
  const getSubmissionsForDates = (dates: string[]) => {
    return submissions
      .filter(submission =>
        dates.some(date => submission.meeting_date?.startsWith(date)) &&
        submission.status !== 'draft'  // ← 임시저장 제외
      )
      .sort(...)
  }
```

---

### 5. `safesys-app/src/app/api/tbm-view/[id]/route.ts` — QR 뷰에서 드래프트 차단

**수정 위치: 38~49번 라인**

**현재 코드:**
```typescript
  const { data, error } = await supabaseAdmin
    .from('tbm_submissions')
    .select(PUBLIC_FIELDS)
    .eq('id', id)
    .single()

  if (error || !data) {
    return NextResponse.json(
      { error: '데이터를 찾을 수 없습니다.' },
      { status: 404 }
    )
  }

  return NextResponse.json(data)
```

**변경 후:**
```typescript
  const { data, error } = await supabaseAdmin
    .from('tbm_submissions')
    .select(PUBLIC_FIELDS + ',status')
    .eq('id', id)
    .single()

  if (error || !data) {
    return NextResponse.json(
      { error: '데이터를 찾을 수 없습니다.' },
      { status: 404 }
    )
  }

  // 임시저장 상태인 경우 접근 차단
  if (data.status === 'draft') {
    return NextResponse.json(
      { error: '아직 제출되지 않은 TBM입니다.' },
      { status: 403 }
    )
  }

  // status 필드는 응답에서 제거
  const { status: _status, ...publicData } = data
  return NextResponse.json(publicData)
```

---

## 구현 순서

1. **DB 마이그레이션**: `database/add_tbm_draft_status.sql` 파일 생성 → 사용자가 Supabase 콘솔에서 실행
2. **lib/tbm.ts**: `getTBMRecords()`와 `getTBMStats()` 쿼리에 `.eq('status', 'submitted')` 추가 (2곳)
3. **TBMSubmissionModal.tsx**: `handleDraftSave()` 함수 추가, `handleSubmit()`에 `status: 'submitted'` 추가, 헤더 배지 변경, 하단 버튼 영역에 임시저장 버튼 추가
4. **tbm-submission/page.tsx**: 인터페이스 수정, 캘린더 표시 변경, 제출내역 상태 배지, QR 버튼 조건부, 벌크 다운로드 드래프트 제외, 모달 props 추가
5. **tbm-view API**: 드래프트 접근 차단

## 주의사항

- DB 마이그레이션은 **코드 배포 전에** 사용자가 Supabase 콘솔에서 직접 실행해야 함
- 기존 데이터에 `status` 컬럼이 없으므로, `DEFAULT 'submitted'`로 기존 레코드 자동 처리
- `tbm-submission/page.tsx`의 `loadSubmissions()` 쿼리 (100~153번 라인)는 status 필터를 **추가하지 않음** — 본인 제출 화면에서는 드래프트도 보여야 하므로
- `handleDraftSave()`와 `handleSubmit()`의 `submitData` 객체 구조는 동일하되, `status` 값만 다름 (`'draft'` vs `'submitted'`)
- 임시저장 시 중복 사진 검증(`hasRecentDuplicatePhotoName`)은 **스킵**함
