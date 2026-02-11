# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

SafeSys는 Next.js 15, React 19, Supabase로 구축된 한국의 안전관리 시스템입니다. 한국 건설회사의 건설 프로젝트 안전 점검, 열중질환 모니터링, TBM 상태 추적, 관리자 점검, 본부불시점검을 관리합니다.

## 개발 명령어

**중요**: 모든 명령어는 `safesys-app` 디렉토리에서 실행해야 합니다.
**중요**: npm run build 프로덕션 빌드는 동의 없이 시작 하지 않습니다.

```bash
cd safesys-app
```

**필수 명령어:**
- `npm run dev` - 개발 서버 시작 (http://localhost:3000)
- `npm run build` - 프로덕션 빌드
- `npm run build:no-cache` - 캐시 없는 프로덕션 빌드
- `npm run start` - 프로덕션 서버 시작
- `npm run lint` - ESLint 검사 실행

**배포:**
- `vercel deploy --prod` - 프로덕션 배포 (**사용자 명시적 요청 시에만 실행**)
- 배포 전 반드시 사용자 확인을 받아야 함

## 아키텍처

### 기술 스택
- **프론트엔드**: Next.js 15 (App Router), React 19, TypeScript
- **스타일링**: Tailwind CSS 4
- **백엔드**: Supabase (PostgreSQL + Auth + Realtime)
- **지도**: Kakao Maps API, VWorld Map API
- **인증**: 역할 기반 접근 제어가 있는 Supabase Auth

### 프로젝트 구조
```
safesys-app/src/
├── app/                 # Next.js App Router 페이지
│   ├── api/            # API 라우트 (날씨, 지오코딩 등)
│   ├── login/          # 인증 페이지
│   ├── project/        # 프로젝트 관리 페이지
│   └── page.tsx        # 메인 대시보드
├── components/
│   ├── auth/           # 인증 컴포넌트
│   ├── common/         # PWA 및 서비스 워커 컴포넌트
│   ├── project/        # 프로젝트별 컴포넌트
│   └── ui/             # 재사용 가능한 UI 컴포넌트
├── contexts/
│   └── AuthContext.tsx # 인증 상태 관리
├── lib/                # 유틸리티 및 설정
└── providers/          # React 프로바이더
```

### 주요 컴포넌트

**인증 시스템:**
- 역할 기반 접근: '발주청' (고객), '감리단' (감독), '시공사' (계약업체)
- 자동 토큰 갱신이 있는 한국어 인터페이스
- 본사/지사 구분이 있는 프로필 관리

**핵심 기능:**
- 한국 행정구역이 포함된 프로젝트 관리
- 열중질환 안전 점검 (폭염점검)
- 관리자 점검 (지사별 안전점검)
- 본부불시점검 (본부 주도 안전점검)
- TBM 안전점검 (일일 안전점검)
- TBM 상태 모니터링 (Google Apps Script 연동)
- 안전 경고를 위한 날씨 통합
- 현장 위치를 위한 지도 통합 (Kakao Maps, VWorld Maps)

## 환경 설정

`.env.local`에 필요한 환경 변수:
```
# Supabase 설정
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# 기상청 API
NEXT_PUBLIC_KMA_API_KEY=your-kma-api-key

# V-world API (주소 검색 및 지도)
VWORLD_API_KEY=your-vworld-api-key

# 애플리케이션 설정
NEXT_PUBLIC_APP_NAME=SafeSys Safety Management System
NEXT_PUBLIC_APP_VERSION=1.0.0
```

**중요**: API 키 변경 위치
- V-World API 키는 3곳에서 사용됨:
  1. `.env.local` - 환경 변수
  2. `src/app/layout.tsx:58` - 지도 스크립트 초기화
  3. `src/app/api/geocoding/route.ts:54` - 지오코딩 API
  4. `src/components/ui/VworldAddressSearch.tsx:90` - 주소 검색
- Kakao Maps API 키는 `src/app/layout.tsx:62`에 하드코딩됨

## 개발 참고사항

### Next.js 설정 (next.config.ts)
- **캐시 비활성화**: 개발 중 모든 경로에 대해 캐싱 비활성화 (headers 설정)
- **빌드 설정**: TypeScript/ESLint 오류가 빌드를 차단하지 않음
- **출력 모드**: `standalone` - 항상 서버 사이드 렌더링
- **Webpack 경고 억제**: punycode deprecation 경고 무시

### PWA 및 서비스 워커
- PWA 기능 활성화됨
- 서비스 워커 자동 등록 (`ServiceWorkerRegistration.tsx`)
- 설치 프롬프트 제공 (`PWAInstallButton.tsx`, `PWAInstallButtonHeader.tsx`)
- 업데이트 알림 시스템 (`UpdateNotifier.tsx`)

### 다국어 지원
- 전체 UI는 한국어로 작성
- 사용자 역할명: '발주청' (클라이언트), '감리단' (감독), '시공사' (계약업체)

## 컴포넌트 가이드라인

### UI 컴포넌트
- 모든 UI 컴포넌트는 가능한 경우 ShadCN 사용
- **중요**: `npx shadcn@latest add [component-name]` 사용 (deprecated된 `npx shadcn-ui@latest add` 사용 금지)
- 사용 전 `/components/ui` 디렉토리에서 컴포넌트 설치 여부 확인
- 모든 아이콘에 Lucide React 사용: `import { IconName } from "lucide-react"`

## 데이터베이스

### 설정
Supabase SQL Editor에서 `database/schema.sql`을 실행하여 데이터베이스 스키마 및 RLS 정책을 설정합니다.

### 주요 테이블
- `user_profiles` - 사용자 역할 ('발주청', '감리단', '시공사') 및 조직 구조
- `projects` - 한국 행정구역이 있는 건설 프로젝트
- `heat_wave_checks` - 열중질환 안전 점검 기록
- `manager_inspections` - 관리자 점검 기록
- 모든 테이블에서 사용자 역할 기반 행 레벨 보안(RLS) 구현

### 인증 플로우
- **Supabase Auth** 자동 토큰 갱신 (`autoRefreshToken` 활성화)
- **AuthContext** (`src/contexts/AuthContext.tsx`): 전역 인증 상태 관리
  - `user`: Supabase User 객체
  - `userProfile`: user_profiles 테이블 데이터
  - `refreshProfile()`: 프로필 수동 갱신
  - `signOut()`: 로그아웃
- **SupabaseProvider** (`src/providers/SupabaseProvider.tsx`): Supabase 클라이언트 제공

### 역할 기반 접근 제어
- **역할 종류**: '발주청', '감리단', '시공사'
- **조직 구조**: 본부(hq_division) → 지사(branch_division)
- **권한 로직**:
  - 발주청: 전사 데이터 조회 가능 (본부급 또는 관리자)
  - 감리단/시공사: 소속 지사 데이터만 조회
- **RLS 정책**: PostgreSQL Row Level Security로 DB 레벨 접근 제어

## Supabase MCP 주의사항

**IMPORTANT:** Supabase MCP는 현재 **읽기 전용** 모드로 설정되어 있습니다.

### 제한사항
- 데이터 수정, 삽입, 삭제 작업 불가능
- DDL 명령 (CREATE, ALTER, DROP) 실행 불가능
- 오직 SELECT 쿼리와 데이터 조회만 허용

### 사용 가능한 기능
- 테이블 목록 조회 (`mcp__supabase-safesys__list_tables`)
- 데이터 조회 (`mcp__supabase-safesys__execute_sql`로 SELECT 쿼리만)
- 스키마 및 테이블 구조 확인
- 데이터베이스 상태 점검

### 데이터베이스 변경이 필요한 경우
데이터베이스 스키마 변경이나 데이터 수정이 필요한 경우:
1. Supabase 웹 콘솔에서 직접 SQL 실행
2. 읽기 전용 모드 해제를 사용자에게 요청
3. **중요**: MCP를 통해 DDL/DML 명령을 시도하지 않음 - 항상 실패함

### 마이그레이션 파일
`database/` 디렉토리에 SQL 마이그레이션 파일들이 있음:
- `schema.sql` - 기본 스키마
- `add_manager_inspections_table.sql` - 관리자 점검 테이블
- `add_project_quarters_columns.sql` - 프로젝트 분기 컬럼
- 기타 RLS 정책 및 컬럼 추가 마이그레이션

## 안전현황 대시보드 아키텍처

### URL 기반 라우팅 구조
안전현황 기능은 중앙화된 Dashboard 컴포넌트를 통해 다음과 같은 URL 패턴으로 관리됩니다:

```
/safe                                    # 전체 안전현황 개요
/safe/heatwave                          # 폭염점검 전체 현황
/safe/manager                           # 관리자점검 전체 현황  
/safe/headquarters                      # 본부불시점검 전체 현황
/safe/branch/[branch]/                  # 특정 지사 안전현황 개요
/safe/branch/[branch]/heatwave         # 특정 지사 폭염점검 현황
/safe/branch/[branch]/manager          # 특정 지사 관리자점검 현황
/safe/branch/[branch]/headquarters     # 특정 지사 본부불시점검 현황
```

### 상태 관리 구조
```typescript
// 안전현황 관련 주요 상태
const [selectedSafetyCard, setSelectedSafetyCard] = useState<string | null>(null)
const [selectedSafetyBranch, setSelectedSafetyBranch] = useState<string | null>(null)
const [viewMode, setViewMode] = useState<'tbm' | 'map' | 'list' | 'safety'>()
```

### 안전현황 카드 시스템
3가지 안전점검 유형을 카드 형태로 제공:
- **폭염점검 카드** (`selectedSafetyCard: 'heatwave'`)
- **관리자점검 카드** (`selectedSafetyCard: 'manager'`) 
- **본부불시점검 카드** (`selectedSafetyCard: 'headquarters'`)

### 라우팅 동기화 메커니즘
1. **URL → 상태 동기화**: `pathname` 기반으로 `selectedSafetyCard`와 `selectedSafetyBranch` 자동 설정
2. **상태 → URL 동기화**: 상태 변경 시 `router.replace()`로 URL 업데이트
3. **브라우저 히스토리 관리**: 뒷버튼 지원을 위한 상태-URL 양방향 동기화

### 페이지 컴포넌트 구조
모든 `/safe` 경로의 페이지 컴포넌트는 동일한 구조:
```typescript
'use client'
import Dashboard from '@/components/Dashboard'
export default function SafePage() {
  return <Dashboard />
}
```

### 데이터 로딩 전략
- **지연 로딩**: 특정 카드 선택 시에만 해당 데이터 로드
- **캐시 방지**: `lastHeatWaveParams` ref로 중복 요청 방지
- **조건부 로딩**: 사용자 역할('발주청')과 viewMode 조건 확인 후 데이터 로드

### 접근 권한 관리
```typescript
// 전사 보기 권한: 발주청 + (관리자급 또는 본사/본부 소속)
const canSeeAllHq = userProfile?.role === '발주청' &&
  (userProfile.hq_division == null || userProfile.branch_division?.endsWith('본부'))
```

## 보고서 및 문서 생성 시스템

### PDF 보고서 생성 (src/lib/reports/)
- **headquarters-inspection.ts**: 본부불시점검 보고서 생성
- **headquarters-inspection-branch.ts**: 지사별 본부불시점검 보고서
- **manager-inspection-report.ts**: 관리자점검 개별 보고서
- **manager-inspection-branch.ts**: 지사별 관리자점검 보고서
- **manager-inspection-summary.ts**: 관리자점검 요약 보고서
- **사용 기술**: jsPDF + html2canvas (HTML을 이미지로 변환 후 PDF 삽입)

### Excel 파일 생성 (src/lib/excel/)
- **project-list-export.ts**: 프로젝트 목록 Excel 다운로드
- **사용 라이브러리**: xlsx
- **기능**: 프로젝트 데이터를 Excel 형식으로 내보내기

### 서명 기능
- **SignaturePad.tsx**: react-signature-canvas 기반 전자서명
- **SignatureModal.tsx**: 서명 입력 모달
- 점검 보고서에 서명 추가 가능

## 유틸리티 및 상수 (src/lib/)

### 주요 유틸리티 파일
- **projects.ts**: 프로젝트 CRUD, 점검 데이터 조회 함수
  - `getUserProjects()`, `getProjectsByUserBranch()`
  - `getHeatWaveChecksByUserBranch()`, `getManagerInspectionsByUserBranch()`
  - `deleteProject()`, `createProject()`, `updateProject()`
- **supabase.ts**: Supabase 클라이언트 초기화 및 타입 정의
- **constants.ts**: 본부/지사 옵션, 디버그 플래그 등
  - `HEADQUARTERS_OPTIONS`, `BRANCH_OPTIONS`
  - `DEBUG_LOGS` - 콘솔 로그 출력 제어
- **weather.ts**: 날씨 API 연동
- **tbm.ts**: TBM(터널굴착기) 상태 관리

### 주요 타입 정의
```typescript
// UserProfile: 사용자 프로필 (role, hq_division, branch_division, is_admin 등)
// Project: 프로젝트 정보 (is_active는 boolean 또는 분기별 객체)
// ProjectWithCoords: 프로젝트 + 좌표 정보 (지도 표시용)
// HeatWaveCheck: 열중질환 점검 기록 (폭염점검)
// ManagerInspection: 관리자 점검 기록 (지사별 점검)
// HeadquartersInspection: 본부불시 점검 기록
// TBMSafetyInspection: TBM 안전점검 기록 (일일 점검)
// TBMRecord: Google Apps Script에서 가져온 TBM 현황 데이터
```

## 문제 해결

- **빌드 캐시 문제**: `npm run build:no-cache` 사용
- **프로필 미동기화**: `refreshProfile()` 함수 호출
- **중복 요청**: Dashboard.tsx의 ref 기반 캐시 확인
- **권한 오류**: RLS 정책 및 사용자 역할, `hq_division`/`branch_division` 값 확인
- **지도 문제**: layout.tsx의 API 키 포함 여부, projects 테이블의 latitude/longitude 확인
