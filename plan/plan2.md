# Plan 2: TBM → AI TBM 명칭 변경 + tbm-view 외국어 읽기 기능

## 목적
1. 사용자에게 보이는 모든 "TBM" 텍스트를 "AI TBM"으로 변경
2. tbm-view 페이지에 외국어 GPT 읽기 기능 추가

## 변경 범위
**내부 식별자(라우팅, 상태값, 파일명, DB 컬럼명 등)는 변경하지 않음** - UI에 표시되는 텍스트만 변경

---

## Part A: TBM → AI TBM 명칭 변경

### 1. `src/app/project/[id]/page.tsx`
| 위치 | 현재 텍스트 | 변경 후 |
|------|------------|---------|
| ~Line 665-666 | `"일일안전교육\n︵TBM일지︶"` | `"일일안전교육\n︵AI TBM일지︶"` |
| ~Line 780-781 | `"TBM안전활동\n점검표︵감독︶"` | `"AI TBM안전활동\n점검표︵감독︶"` |

### 2. `src/app/project/[id]/tbm-submission/page.tsx`
| 위치 | 현재 텍스트 | 변경 후 |
|------|------------|---------|
| ~Line 491 | `일일안전교육(TBM일지)` (h1 페이지 제목) | `일일안전교육(AI TBM일지)` |
| ~Line 878 | `TBM QR 코드` (모달 h3 제목) | `AI TBM QR 코드` |


### 3. `src/app/tbm-view/[id]/page.tsx`
| 위치 | 현재 텍스트 | 변경 후 |
|------|------------|---------|
| ~Line 96 | `TBM 안전교육 내용` (h1 페이지 제목) | `AI TBM 안전교육 내용` |



## Part B: tbm-view 외국어 GPT 읽기 기능 추가

### 대상 파일: `src/app/tbm-view/[id]/page.tsx`

### 대상 섹션 (Line 172 ~ 247)
다음 섹션들의 텍스트 내용을 외국어로 읽어주는 GPT 기능 추가:
- **잠재위험요인 및 대책** (~Line 172)
- **중점위험요인** (~Line 201)
- **유해위험요소** (~Line 225)

### 구현 방안: 기존 TBMSubmissionModal TTS 기능 재사용

`src/components/project/TBMSubmissionModal.tsx`에 이미 동일한 외국인 음성지원 기능이 구현되어 있음:

**기존 구현 요소:**
- `languageOptions` 배열: 한국어, 영어, 일본어, 중국어(간/번체), 베트남어 지원
- `handleTTSRead()`: OpenAI TTS API (`/api/ai/tts`) 호출 → 번역 + 음성 생성
- `collectReadingContent()`: 위험요인/대책 섹션 텍스트 수집
- TTS 모달 UI: 번역 텍스트 표시 + 재생/일시정지/정지 컨트롤
- `base64ToBlob()`: 오디오 재생 헬퍼

**tbm-view 페이지 적용 방안:**
1. 언어 선택 드롭다운 + 음성 읽기 버튼을 tbm-view 페이지에 추가
2. 기존 `/api/ai/tts` API 엔드포인트 그대로 활용
3. tbm-view에 표시된 잠재위험요인/중점위험요인/유해위험요소/기타주의사항 텍스트를 수집하여 TTS 호출
4. TTS 모달 (번역 텍스트 + 오디오 재생 컨트롤) 동일하게 표시
5. 공통 TTS 로직을 별도 훅 또는 컴포넌트로 추출 검토

---

## 변경하지 않는 항목
- URL 라우트: `/tbm`, `/tbm-view`, `/tbm-safety-inspection`, `/tbm-submission`
- 상태값: `viewMode === 'tbm'`, `selectedSafetyCard === 'tbm'`
- 파일명: `TBMChatBot.tsx`, `TBMSubmissionModal.tsx` 등
- DB 테이블/컬럼명: `tbm_safety_inspections` 등
- API 경로: `/api/tbm-view` 등
- console.log 디버그 메시지
- 내부 변수명, 함수명

---

## 예상 영향
- **Part A 변경 파일 수**: 3개
- **Part A 변경 위치 수**: 5곳
- **Part A 리스크**: 낮음 (UI 텍스트만 변경, 로직 변경 없음)
- **Part B**: tbm-view 페이지에 기존 TTS 기능 이식 (1개 파일 신규 기능 추가)
