# CLAUDE.md

이 파일은 Claude Code (claude.ai/code)가 이 저장소에서 코드 작업을 할 때 안내를 제공합니다.

## 프로젝트 개요

SafeSys는 Next.js 15, React 19, Supabase로 구축된 한국의 안전관리 시스템입니다. 한국 건설회사의 건설 프로젝트 안전 점검, 열중질환 모니터링, TBM(터널굴착기) 상태 추적을 관리합니다.

## 개발 명령어

모든 명령어는 `safesys-app` 디렉토리로 이동하여 실행:

```bash
cd safesys-app
```

**필수 명령어:**
- `npm run dev` - 개발 서버 시작 (http://localhost:3000)
- `npm run build` - 프로덕션 빌드
- `npm run build:no-cache` - 캐시 없는 프로덕션 빌드
- `npm run start` - 프로덕션 서버 시작
- `npm run lint` - ESLint 검사 실행
- `vercel deploy --prod` - 프로덕션 배포 (**사용자 명시적 요청 시에만 실행**)

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
- 열중질환 안전 점검 (열중질환 점검)
- TBM 상태 모니터링
- 안전 경고를 위한 날씨 통합
- 현장 위치를 위한 지도 통합

**데이터베이스 스키마:**
- `user_profiles` - 사용자 역할 및 조직 구조
- `projects` - 위치 데이터가 있는 건설 프로젝트
- `heat_wave_checks` - 안전 점검 기록
- 모든 테이블에서 행 레벨 보안(RLS) 사용

## 환경 설정

`.env.local`에 필요한 환경 변수:
```
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

## 외부 API

애플리케이션에서 통합하는 API:
- Kakao Maps API (layout.tsx에 포함)
- VWorld Map API (한국 정부 지도 서비스)
- 안전 모니터링을 위한 날씨 API
- 주소 검색 서비스

## 개발 참고사항

- TypeScript strict 모드 활성화되었지만 프로덕션에서 빌드 오류 무시
- 서비스 워커가 있는 PWA 활성화
- 전체 한국어 인터페이스
- 개발용 캐싱 비활성화 (next.config.ts 참조)
- 빌드 호환성을 위해 `@ts-ignore` 주석 사용

## 배포 정책

**중요**: `vercel deploy --prod` 명령어는 사용자가 명시적으로 요청한 경우에만 실행합니다. 
- 코드 수정이나 빌드 작업 중 자동으로 배포하지 않습니다
- 배포가 필요한 경우 사용자에게 배포 여부를 확인받습니다

## 컴포넌트 가이드라인

### UI 컴포넌트
- 모든 UI 컴포넌트는 가능한 경우 ShadCN 사용
- 사용 전 `/components/ui` 디렉토리에서 컴포넌트 설치 여부 확인
- 컴포넌트 설치: `npx shadcn@latest add [component-name]`
- 모든 아이콘에 Lucide React 사용: `import { IconName } from "lucide-react"`

### 파일 구조
- 페이지 컴포넌트: App Router 구조를 따르는 `/app` 디렉토리
- 재사용 가능한 컴포넌트: `/components` 디렉토리
- UI 컴포넌트: `/components/ui` 디렉토리
- 모든 컴포넌트에 TypeScript 타입 정의 필수

## 주요 라이브러리 및 API

### 외부 서비스
- **Supabase**: 인증, 데이터베이스, 실시간 구독
- **Kakao Maps**: 한국 지도 서비스 (layout.tsx에 API 키 포함)
- **VWorld Maps**: 한국 정부 지도 서비스
- **Weather APIs**: 열중질환 모니터링 및 안전 경고

### 주요 의존성
- App Router가 있는 Next.js 15
- React 19
- Tailwind CSS 4
- Supabase Auth UI 컴포넌트
- 추가 지도 기능을 위한 Leaflet
- 날짜 조작을 위한 Date-fns
- 보고서 생성을 위한 HTML2Canvas 및 jsPDF

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
- 자동 토큰 갱신(5분마다)이 있는 Supabase Auth
- 한국 조직 구조를 가진 역할 기반 접근 제어
- 프로필 관리에 본사/지사 구분 포함

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
데이터베이스 스키마 변경이나 데이터 수정이 필요한 경우, Supabase 웹 콘솔에서 직접 작업하거나 읽기 권한 해제를 요청해야 합니다.

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