# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

SafeSys는 Next.js 15, React 19, Supabase로 구축된 한국의 건설 안전관리 시스템입니다. 건설 프로젝트의 안전 점검(폭염, 관리자, 본부불시, TBM), 작업자 관리, 자재 원장, 문서 생성(PDF/Excel/HWPX)을 관리합니다. PWA로 설계되어 모바일 현장 사용을 지원합니다.

## 계획서 (Plans)

계획서 작성 요청 시 `plans/` 디렉토리에 마크다운 파일로 작성합니다.

- **저장 위치**: `plans/`
- **파일명 형식**: `YYYYMMDD_주제.md` (예: `20260323_인증시스템개선.md`)
- **수정/업데이트 시**: 파일명의 날짜 부분을 수정일로 변경

## 개발 명령어

**중요**: 모든 명령어는 `safesys-app` 디렉토리에서 실행해야 합니다.
**중요**: npm run build 프로덕션 빌드는 동의 없이 시작하지 않습니다.

```bash
cd safesys-app
npm run dev              # 개발 서버 (http://localhost:3000)
npm run build            # 프로덕션 빌드
npm run build:no-cache   # 캐시 없는 프로덕션 빌드
npm run lint             # ESLint 검사
```

**배포**: `vercel deploy --prod` — 사용자 명시적 요청 시에만 실행

## 아키텍처

### 기술 스택
- **프론트엔드**: Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS 4
- **백엔드**: Supabase (PostgreSQL + Auth + Realtime)
- **지도**: Kakao Maps API, VWorld Map API, Leaflet
- **인증**: 역할 기반 접근 제어가 있는 Supabase Auth
- **문서 생성**: jsPDF + html2canvas (PDF), exceljs + xlsx (Excel), HWPX 내보내기
- **AI**: Claude API 연동 (일일점검, OCR, 번역, TTS, 위험분석, TBM 안전조언)
- **알림**: Telegram 봇 연동

### 핵심 아키텍처 패턴: Dashboard 중심 라우팅

**Dashboard.tsx** (`src/components/Dashboard.tsx`, ~4,300줄)가 전체 앱의 중앙 오케스트레이터입니다. 모든 뷰 전환, 데이터 로딩, 상태 관리가 이 컴포넌트에서 이루어집니다.

```
layout.tsx (Root)
  └── AuthProvider → SupabaseProvider
        └── Dashboard.tsx (중앙 오케스트레이터)
              ├── viewMode에 따른 뷰 전환
              │   ├── 'safety' → Safety 대시보드 뷰들
              │   ├── 'tbm' → TBM 현황
              │   ├── 'map' → 지도 뷰
              │   ├── 'list' → 목록 뷰
              │   └── 'business' → 자재/사업관리
              └── 모달 컴포넌트들 (CRUD)
```

**viewMode 상태**:
```typescript
const [viewMode, setViewMode] = useState<'tbm' | 'map' | 'list' | 'safety'>()
const [selectedSafetyCard, setSelectedSafetyCard] = useState<string | null>(null)
const [selectedSafetyBranch, setSelectedSafetyBranch] = useState<string | null>(null)
```

### 라우팅 구조

**메인 라우트:**
| 경로 | 설명 |
|------|------|
| `/` | 사용자 역할에 따라 /tbm 또는 /safe로 리다이렉트 |
| `/safe/*` | 안전현황 대시보드 (아래 상세) |
| `/tbm` | TBM 현황 페이지 |
| `/tbm-view/[id]` | TBM 뷰 상세 (다국어 번역/복사 지원) |
| `/list` | 프로젝트 목록 뷰 |
| `/map` | 프로젝트 지도 뷰 |
| `/business` | 자재/사업관리 뷰 |
| `/project/[id]/*` | 프로젝트 상세 (20개 하위 페이지) |
| `/worker-register` | 작업자 등록 플로우 |

**안전현황 라우트 (`/safe/`):**
```
/safe                                    # 전체 안전현황 개요
/safe/heatwave                          # 폭염점검 전체 현황
/safe/manager                           # 관리자점검 전체 현황
/safe/headquarters                      # 본부불시점검 전체 현황
/safe/tbm                               # TBM 점검 현황
/safe/safeDocument                      # 안전서류 현황
/safe/safetyInspection                  # 안전점검 현황
/safe/newWorkerOrientation              # 신규작업자 교육 현황
/safe/worker                            # 작업자 관리 현황
/safe/branch/[branch]/                  # 특정 지사 안전현황 (위 각 카테고리별 하위 경로 동일)
```

모든 `/safe` 페이지 컴포넌트는 동일 구조 — `<Dashboard />`를 렌더링하고 URL pathname으로 상태를 결정합니다.

**프로젝트 상세 라우트 (`/project/[id]/`):**
daily-inspection, edit, headquarters-inspection, heatwave, holiday-work, issue-management, manager-inspection, material-ledger, new-worker-orientation, ptw, risk-assessment, safe-documents, safety-inspection-ledger, supervisor-diary, tbm-safety-inspection, tbm-submission, worker-management, work-plan

### API 라우트 (`src/app/api/`)

**AI 엔드포인트 (8개):**
- `/api/ai/daily-inspection` — AI 일일점검 생성
- `/api/ai/extract-equipment-count` — OCR 장비 수량 추출
- `/api/ai/ocr-card` — 카드 OCR
- `/api/ai/supervisor-summary` — AI 감독일지 요약
- `/api/ai/tbm-safety-advice` — TBM 안전 조언
- `/api/ai/translate` — 번역
- `/api/ai/tts` — 텍스트 음성 변환
- `/api/ai/write-risk-analysis` — AI 위험분석 작성

**외부 서비스 연동:**
- `/api/weather/*` — 기상청 API (ASOS, 역사데이터, 체감온도)
- `/api/geocoding`, `/api/address-search` — 주소/좌표 변환
- `/api/telegram/*` — Telegram 알림 (텍스트/사진)
- `/api/hwp/*` — HWP 문서 변환/내보내기
- `/api/chat/tbm` — TBM AI 챗봇

### 컴포넌트 구조

```
src/components/
├── Dashboard.tsx           # 중앙 오케스트레이터 (~4,300줄)
├── auth/                   # 인증 (LoginForm, SignUpForm, FindIdModal 등 8개)
├── common/                 # PWA (ServiceWorkerRegistration, UpdateNotifier 등 4개)
├── dashboard/              # 대시보드 뷰 (19개)
│   ├── ClientDashboard     # 발주청 뷰
│   ├── ContractorDashboard # 시공사 뷰
│   ├── Safety*View         # 안전현황 카테고리별 뷰 (7개)
│   ├── *Status             # 점검 현황 요약 컴포넌트
│   └── BusinessMaterialView # 자재 관리
├── project/                # 프로젝트 관리 (20개 — 폼, 모달, 카드)
├── ui/                     # 재사용 UI (15개 — 지도, 서명, 주소검색 등)
└── worker-consent/         # 작업자 동의서 (5개 — 건강설문, 안전서약)
```

### 유틸리티 (`src/lib/`)

| 파일 | 역할 |
|------|------|
| `projects.ts` (~2,400줄) | 핵심 데이터 함수: 프로젝트 CRUD, 점검 데이터 조회, 타입 정의 |
| `supabase.ts` | Supabase 클라이언트 초기화 (lazy loading) |
| `supabase-admin.ts` | 관리자용 Supabase 클라이언트 |
| `auth.ts` | 인증 유틸리티 |
| `constants.ts` | 본부/지사 옵션, `DEBUG_LOGS` 플래그 |
| `weather.ts` | 기상청 API 연동 |
| `tbm.ts` | TBM 상태 관리 |
| `telegram.ts` | Telegram 봇 연동 |
| `ui-settings.ts` | UI 상태 영속화 (분기 토글) |

**문서 생성:**
- `lib/reports/` — PDF 보고서 12개 (jsPDF + html2canvas)
- `lib/excel/` — Excel 내보내기 10개 (exceljs)
- `lib/hwpx/` — HWPX 내보내기 3개

### 주요 타입 (`src/lib/projects.ts`)
```typescript
// UserProfile: role('발주청'|'감리단'|'시공사'), hq_division, branch_division, is_admin
// Project: is_active는 boolean 또는 분기별 JSONB 객체
// HeatWaveCheck, ManagerInspection, HeadquartersInspection
// TBMSafetyInspection, SafeDocumentInspection, TBMRecord
```

## 환경 설정

`.env.local`에 필요한 환경 변수:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_KMA_API_KEY=           # 기상청 API
VWORLD_API_KEY=                     # V-World 주소/지도
NEXT_PUBLIC_APP_NAME=SafeSys Safety Management System
NEXT_PUBLIC_APP_VERSION=1.0.0
```

**API 키 사용 위치:**
- V-World: `.env.local`, `layout.tsx`, `api/geocoding/route.ts`, `VworldAddressSearch.tsx`
- Kakao Maps: `layout.tsx`에 하드코딩

## 인증 및 권한

### 역할 체계
- **발주청** (클라이언트): 전사 데이터 조회 가능 (본부급 또는 관리자)
- **감리단** (감독): 소속 지사 데이터만 조회
- **시공사** (계약업체): 소속 지사 데이터만 조회

### 조직 구조
본부(hq_division) → 지사(branch_division) 계층 구조

### 접근 권한 패턴
```typescript
// 전사 보기 권한
const canSeeAllHq = userProfile?.role === '발주청' &&
  (userProfile.hq_division == null || userProfile.branch_division?.endsWith('본부'))
```

### 인증 플로우
- **AuthContext** (`src/contexts/AuthContext.tsx`): 전역 인증 상태 (user, userProfile, refreshProfile, signOut)
- **SupabaseProvider** (`src/providers/SupabaseProvider.tsx`): Supabase 클라이언트/세션 제공
- 자동 토큰 갱신 (`autoRefreshToken` 활성화)

## 데이터베이스

### 주요 테이블
- `user_profiles` — 사용자 역할/조직 구조
- `projects` — 건설 프로젝트 (행정구역, 좌표, 분기별 활성 상태)
- `heat_wave_checks` — 열중질환 안전 점검
- `manager_inspections` — 관리자 점검
- `headquarters_inspections` — 본부불시점검
- `tbm_safety_inspections` — TBM 일일 안전점검
- `workers` — 작업자 프로필/등록
- `material_ledger` — 자재 원장
- 모든 테이블에 RLS(Row Level Security) 적용

### 마이그레이션
`database/` 디렉토리에 14개 SQL 마이그레이션 파일

### Supabase MCP 주의사항
**읽기 전용** 모드 — SELECT 쿼리만 가능. DDL/DML 불가. 스키마 변경 필요 시 Supabase 웹 콘솔 사용.

## 개발 참고사항

### Next.js 설정 (next.config.ts)
- **빌드 설정**: TypeScript/ESLint 오류가 빌드를 차단하지 않음
- **출력 모드**: `standalone`
- **캐시 비활성화**: 모든 경로에 no-cache 헤더
- **Webpack**: punycode deprecation 경고 억제

### UI 컴포넌트
- ShadCN 사용: `npx shadcn@latest add [component-name]` (deprecated된 `shadcn-ui` 사용 금지)
- 아이콘: Lucide React (`import { IconName } from "lucide-react"`)
- 사용 전 `src/components/ui/` 디렉토리에서 설치 여부 확인

### PWA
- 서비스 워커 자동 등록, 설치 프롬프트, 업데이트 알림 시스템

### 데이터 로딩 패턴
- 지연 로딩: 특정 카드/뷰 선택 시에만 데이터 로드
- ref 기반 캐시로 중복 요청 방지
- 사용자 역할/viewMode 조건 확인 후 데이터 로드

## 문제 해결

- **빌드 캐시 문제**: `npm run build:no-cache` 사용
- **프로필 미동기화**: `refreshProfile()` 호출
- **중복 요청**: Dashboard.tsx의 ref 기반 캐시 확인
- **권한 오류**: RLS 정책 및 `hq_division`/`branch_division` 값 확인
- **지도 문제**: layout.tsx의 API 키 포함 여부, projects 테이블의 latitude/longitude 확인
