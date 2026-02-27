# TBM QR 코드 근로자 열람 기능

## 목적
근로자가 **회원가입 없이** QR 코드를 스캔하여 당일 TBM 교육 내용(작업내용, 위험요소, 주의사항)을 모바일에서 즉시 확인할 수 있도록 한다.

---

## 1. UI 변경: QR 버튼 추가

### 위치
- **파일**: `src/app/project/[id]/tbm-submission/page.tsx`
- **위치**: 삭제(Trash2) 버튼 **좌측**에 QR 아이콘 버튼 추가
- **라인**: ~745 (`<div className="flex items-center gap-2">` 바로 안쪽, 기존 삭제 버튼 앞)

### 버튼 스펙
```tsx
<button
  onClick={(e) => { e.stopPropagation(); setQrSubmission(submission) }}
  className="p-2.5 hover:bg-purple-100 rounded-lg transition-colors border border-purple-200 bg-purple-50"
  title="QR 코드"
>
  <QrCode className="h-5 w-5 text-purple-600" />
</button>
```

### 버튼 순서 (좌→우)
1. **QR 코드** (새로 추가, 보라색)
2. **삭제** (기존, 빨간색)
3. **다운로드** (기존, 파란색)

### 필요한 import 추가
```tsx
// 기존 lucide-react import에 QrCode 추가
import { ..., QrCode } from 'lucide-react'
// qrcode.react (이미 설치됨 ^4.2.0)
import { QRCodeSVG } from 'qrcode.react'
```

### 상태 추가
```tsx
// 기존 상태 (~line 43-50) 근처에 추가
const [qrSubmission, setQrSubmission] = useState<TBMSubmission | null>(null)
```

---

## 2. QR 전체화면 모달

### 동작
- QR 버튼 클릭 → `qrSubmission` 상태 설정 → 전체화면 오버레이 모달 표시
- 모달 배경: 반투명 검정 (`bg-black/60`)
- 중앙에 QR 코드 크게 표시 (280x280px)
- QR 아래에 프로젝트명, 날짜, 작성자 간략 표시
- 모달 영역 밖 클릭 또는 X 버튼으로 닫기

### QR 코드 내용
- QR 값: 공개 열람 페이지 URL
- 형식: `{window.location.origin}/tbm-view/{submission.id}`
- 예: `https://safesys.vercel.app/tbm-view/abc123-def456`

### 사용 라이브러리
- `qrcode.react` (v4.2.0) — **이미 설치됨**
- `import { QRCodeSVG } from 'qrcode.react'`
- 아이콘: `import { QrCode } from 'lucide-react'`

### 모달 구현 (page.tsx 내 인라인)

page.tsx의 return 마지막 부분에 추가. 별도 컴포넌트 파일 불필요.

```tsx
{/* QR 코드 모달 */}
{qrSubmission && (
  <div
    className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
    onClick={() => setQrSubmission(null)}
  >
    <div
      className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 relative"
      onClick={(e) => e.stopPropagation()}
    >
      {/* 닫기 버튼 */}
      <button
        onClick={() => setQrSubmission(null)}
        className="absolute top-3 right-3 p-1.5 hover:bg-gray-100 rounded-full"
      >
        <X className="h-5 w-5 text-gray-500" />
      </button>

      {/* QR 코드 */}
      <div className="flex flex-col items-center gap-4">
        <h3 className="text-lg font-bold text-gray-900">TBM QR 코드</h3>
        <div className="bg-white p-4 rounded-xl border-2 border-gray-100">
          <QRCodeSVG
            value={`${window.location.origin}/tbm-view/${qrSubmission.id}`}
            size={280}
            level="M"
          />
        </div>
        <div className="text-center space-y-1">
          <p className="text-sm font-medium text-gray-900">{qrSubmission.project_name}</p>
          <p className="text-xs text-gray-500">
            {qrSubmission.meeting_date} | {qrSubmission.reporter_name || '미입력'}
          </p>
        </div>
        <p className="text-xs text-gray-400 text-center">
          QR을 스캔하면 작업내용을 확인할 수 있습니다
        </p>
      </div>
    </div>
  </div>
)}
```

---

## 3. API Route: TBM 데이터 공개 조회

### 파일 생성
- **경로**: `src/app/api/tbm-view/[id]/route.ts`

### 상세 구현

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

// 공개 반환할 필드 (민감정보 제외)
const PUBLIC_FIELDS = [
  'id',
  'project_name',
  'meeting_date',
  'education_start_time',
  'education_end_time',
  'today_work',
  'potential_risk_1', 'solution_1',
  'potential_risk_2', 'solution_2',
  'potential_risk_3', 'solution_3',
  'main_risk_selection', 'main_risk_solution',
  'risk_factor_1', 'risk_factor_2', 'risk_factor_3',
  'other_remarks',
  'personnel_count',
  'equipment_input',
  'risk_work_type',
].join(',')

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // UUID 형식 기본 검증
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(id)) {
    return NextResponse.json(
      { error: '유효하지 않은 ID입니다.' },
      { status: 400 }
    )
  }

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
}
```

### 핵심 포인트
- `supabaseAdmin` 사용 (RLS 우회) — `src/lib/supabase-admin.ts`에서 import
- 기존 API 패턴과 동일 (`manager-inspections/bulk-sign/route.ts` 참고)
- **제외 필드**: `reporter_name`, `reporter_contact`, `signature_url`, `education_photo_url`, `reporter_email`, `latitude`, `longitude`
- UUID 형식 검증으로 무효 요청 차단
- Next.js 15 App Router의 `params`는 Promise — `await params` 필수

---

## 4. 공개 열람 페이지 (비인증)

### 파일 생성
- **경로**: `src/app/tbm-view/[id]/page.tsx`

### 페이지 구조

```
┌─────────────────────────────┐
│  🔶 SafeSys                 │
│  TBM 안전교육 내용           │
├─────────────────────────────┤
│  📋 기본정보                 │
│  현장명: OO현장              │
│  교육일자: 2026-02-27        │
│  교육시간: 08:00 ~ 08:30     │
│  인원: 15명                  │
│  장비: 굴삭기 1대            │
├─────────────────────────────┤
│  🔨 금일 작업내용            │
│  ┌───────────────────────┐  │
│  │ 콘크리트 타설 작업     │  │
│  └───────────────────────┘  │
├─────────────────────────────┤
│  ⚠️ 잠재위험요인            │
│  1. 위험요인 → 대책         │
│  2. 위험요인 → 대책         │
│  3. 위험요인 → 대책         │
├─────────────────────────────┤
│  🔴 중점위험요인             │
│  위험: ...                   │
│  대책: ...                   │
├─────────────────────────────┤
│  ☢️ 유해위험요소             │
│  1. ...                      │
│  2. ...                      │
│  3. ...                      │
├─────────────────────────────┤
│  📝 기타 주의사항            │
│  ┌───────────────────────┐  │
│  │ 교육 내용 텍스트       │  │
│  └───────────────────────┘  │
├─────────────────────────────┤
│  🟢 안전한 하루 되세요!      │
│  SafeSys 안전관리시스템      │
└─────────────────────────────┘
```

### 상세 구현

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  Shield, AlertTriangle, Wrench, FileText,
  Clock, Users, Truck, AlertOctagon
} from 'lucide-react'

interface TBMViewData {
  id: string
  project_name: string
  meeting_date: string
  education_start_time?: string
  education_end_time?: string
  today_work?: string
  potential_risk_1?: string
  solution_1?: string
  potential_risk_2?: string
  solution_2?: string
  potential_risk_3?: string
  solution_3?: string
  main_risk_selection?: string
  main_risk_solution?: string
  risk_factor_1?: string
  risk_factor_2?: string
  risk_factor_3?: string
  other_remarks?: string
  personnel_count?: string
  equipment_input?: string
  risk_work_type?: string
}

export default function TBMViewPage() {
  const params = useParams()
  const id = params.id as string
  const [data, setData] = useState<TBMViewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/tbm-view/${id}`)
        if (!res.ok) {
          setError('데이터를 찾을 수 없습니다.')
          return
        }
        const json = await res.json()
        setData(json)
      } catch {
        setError('데이터를 불러오는 중 오류가 발생했습니다.')
      } finally {
        setLoading(false)
      }
    }
    if (id) fetchData()
  }, [id])

  // 로딩, 에러, 데이터 표시 UI...
}
```

### 디자인 원칙
- **모바일 최적화**: `max-w-lg mx-auto`, 모바일 퍼스트 레이아웃
- **카드형 섹션**: 각 섹션을 카드로 분리, 라운드 코너, 그림자
- **색상 코딩**:
  - 기본정보: 파란색 (`blue-500`)
  - 작업내용: 회색 (`gray-700`)
  - 잠재위험요인: 주황색 (`orange-500`)
  - 중점위험요인: 빨간색 (`red-500`)
  - 유해위험요소: 보라색 (`purple-500`)
  - 기타: 초록색 (`green-500`)
- **빈 데이터 처리**: 값이 없는 항목은 "해당 없음" 표시 또는 섹션 자체를 숨김
- **인쇄 지원**: `@media print` CSS 추가 (배경색 제거, 여백 조정)

### 인증 우회 확인
- 이 페이지는 `src/app/tbm-view/` 경로에 있음
- 기존 AuthContext의 보호 로직 확인 필요 — Dashboard나 project 경로가 아니므로 인증 미적용 예상
- `src/providers/` 및 `layout.tsx` 레벨에서 인증 리다이렉트가 이 경로에 적용되는지 확인
- 만약 전역 인증 래핑이 있다면, 이 경로를 제외 처리 필요

---

## 5. 구현 순서 (상세)

### ✅ Step 1: API Route 생성 (`src/app/api/tbm-view/[id]/route.ts`) — **완료**
1. `src/app/api/tbm-view/[id]/` 디렉토리 생성
2. `route.ts` 파일 작성
3. `supabaseAdmin` import
4. UUID 검증 → `tbm_submissions` 단건 조회 → 공개 필드만 반환
5. 에러 핸들링 (404, 400)

### ✅ Step 2: 공개 열람 페이지 생성 (`src/app/tbm-view/[id]/page.tsx`) — **완료**
1. `src/app/tbm-view/[id]/` 디렉토리 생성
2. 클라이언트 컴포넌트로 작성 (`'use client'`)
3. API Route 호출하여 데이터 fetch
4. 모바일 반응형 카드 레이아웃 구현
5. 로딩 스피너, 에러 상태, 데이터 없음 상태 처리
6. 인증 우회 확인 — 미인증 사용자도 접근 가능한지 테스트

### ✅ Step 3: QR 모달 + QR 버튼 추가 (`page.tsx` 수정) — **완료**
1. `QrCode` import 추가 (lucide-react)
2. `QRCodeSVG` import 추가 (qrcode.react)
3. `qrSubmission` 상태 추가
4. 삭제 버튼 앞에 QR 버튼 JSX 삽입 (line ~745)
5. return 마지막에 QR 모달 JSX 추가
6. `X` 아이콘이 이미 import 되어있는지 확인

---

## 6. 보안 고려사항

| 항목 | 대응 |
|------|------|
| submission ID 추측 방지 | UUID 사용 (기존) — 추측 어려움 |
| 민감정보 노출 | API에서 `reporter_name`, `reporter_contact`, `signature_url`, `education_photo_url`, `reporter_email`, `latitude`, `longitude` 제외 |
| 무한 요청 방지 | Next.js/Vercel 기본 Rate Limiting 활용 |
| URL 유효기간 | 현재는 영구 (필요 시 만료 로직 추가 가능) |
| CORS | Next.js API Route는 동일 도메인이므로 기본적으로 안전 |

---

## 7. 파일 변경 목록 ✅ **모두 완료**

| 파일 | 작업 | 변경 내용 |
|------|------|----------|
| `src/app/project/[id]/tbm-submission/page.tsx` | **수정** ✅ | QrCode import, QRCodeSVG import, qrSubmission 상태, QR 버튼 JSX, QR 모달 JSX |
| `src/app/api/tbm-view/[id]/route.ts` | **신규** ✅ | TBM 데이터 공개 API (GET, supabaseAdmin, 필드 필터링) |
| `src/app/tbm-view/[id]/page.tsx` | **신규** ✅ | 근로자 열람 페이지 (모바일 최적화, 카드 레이아웃) |

총 변경 파일: **1개 수정 + 2개 신규**

---

## 8. 테스트 체크리스트

- [ ] QR 버튼 클릭 → QR 모달이 올바른 URL로 표시되는지
- [ ] QR 모달 외부 클릭 → 모달 닫힘
- [ ] QR 모달 X 버튼 → 모달 닫힘
- [ ] `/tbm-view/{실제UUID}` 접속 → 데이터 정상 표시
- [ ] `/tbm-view/{없는UUID}` 접속 → 404 에러 페이지
- [ ] `/tbm-view/invalid-id` 접속 → 400 에러 처리
- [ ] 미로그인 상태에서 `/tbm-view/{id}` 접근 가능한지
- [ ] 모바일 브라우저에서 레이아웃 정상 표시
- [ ] 빈 필드가 있는 TBM 데이터도 깨지지 않는지
- [ ] 실제 QR 스캔 (카메라 앱) → 브라우저에서 열람 페이지 열림
