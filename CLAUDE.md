# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 작업 행동 가이드라인 (Behavioral Guidelines)

Behavioral guidelines to reduce common LLM coding mistakes.

> Tradeoff: These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

Don't assume. Don't hide confusion. Surface tradeoffs.

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

Touch only what you must. Clean up only your own mess.

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

Define success criteria. Loop until verified.

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

### 5. No Closing Colons (Korean Output)

End Korean sentences with a period, not a colon.

When the user writes in Korean, your output is also Korean:

- Don't end sentences with `:` even if the next line is a list or example.
- LLMs trained on English docs leak the colon habit into Korean. Catch it.
- The test: every Korean sentence terminator should be `.`, `?`, or `!` — not `:`.
- Colons are fine inside code, key-value pairs, or labels. Not as sentence enders.

### 6. File Header Comments in Korean

First line of every new source file: a one-line Korean comment stating its role.

When creating a new file:

- TypeScript/JavaScript: `// 사용자 인증 상태를 관리하는 Context Provider`
- Python: `# KIS API 호출을 비동기로 래핑하는 클라이언트`
- SQL: `-- 일별 집계 결과를 저장하는 머티리얼라이즈드 뷰`
- Place it directly under required directives (`'use client'`, `'use server'`, shebang).
- Skip config files (`*.config.ts`, `package.json`, etc.).

Why: agents read files selectively, not whole codebases. A one-line Korean header gives instant context so the next session (human or agent) can navigate without re-reading the entire file.

### 7. Plan + Checklist + Context Notes

Before any non-trivial task, produce three artifacts. Don't start coding without them.

- **Plan** — what we're building and why.
- **Checklist** (`checklist.md`) — concrete tasks as checkboxes. Tick as you go.
- **Context Notes** (`context-notes.md`) — decisions made during the work and the reasoning behind them. Append continuously.

If the user gives only a plan and asks you to start coding, stop and ask: "Should I create the checklist and context notes first?" The next session — yours or someone else's — needs the notes to pick up where you left off without re-deriving every decision.

### 8. Run Tests Before Marking Complete

If you touched code, run the tests before saying "done".

- `npm test`, `pytest`, `cargo test`, whatever the project uses — run it.
- If tests pass, report results. If they fail, fix and re-run.
- No test setup? At minimum, verify the project builds/compiles.
- Run tests proactively, before the user signals "끝", "완료", "다 됐어" — not after.

This is the step LLMs skip most often. Treat it as non-negotiable.

### 9. Semantic Commits

Commit when one logical change is complete. Don't wait for the user to ask.

- The test: "Can I describe this commit in one sentence?" If yes, commit. If no, the changes are still mixed — split them.
- Good: "auth 미들웨어 추가". Bad: "auth 추가하고 UI도 고치고 버그도 수정" (split into 3).
- Don't accumulate 20 unrelated edits and lose the ability to roll back individually.
- Don't commit just to commit — meaningful units only.

> Note: For solo prototypes or throwaway scripts, group commits loosely if it slows you down. The point is reversibility, not ceremony.

### 10. Read Errors, Don't Guess

Read the actual error/log line. Don't pattern-match from memory.

When something fails:

- Read the full error message and stack trace.
- Check the actual log output, not what you assume it should say.
- Don't apply a "common fix" before confirming the cause.
- If unclear, add a print/log to verify state — then fix.

This is the step LLMs skip most often after "run tests". They guess from error keywords and apply the most-recent-pattern fix. That's how a one-line bug becomes a three-file refactor.

These guidelines are working if: fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

## 프로젝트 개요

SafeSys는 Next.js 15, React 19, Supabase로 구축된 한국의 건설 안전관리 시스템입니다.

건설 프로젝트의 안전 점검(폭염, 관리자, 본부불시, TBM), 작업자 관리, 자재 원장, 문서 생성(PDF/Excel/HWPX)을 관리합니다. PWA로 설계되어 모바일 현장 사용을 지원합니다.

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

**중요 — main 푸시 = 자동 배포**: `main` 브랜치에 푸시하면 Vercel이 자동으로 프로덕션에 배포한다. 즉 `git push origin main`은 곧 운영 반영이다. 별도 `vercel deploy --prod`를 실행하지 않아도 푸시만으로 배포가 진행되므로, main 푸시는 운영에 즉시 나가는 변경임을 인지하고 진행한다.

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

| 경로                 | 설명                                            |
| -------------------- | ----------------------------------------------- |
| `/`                | 사용자 역할에 따라 /tbm 또는 /safe로 리다이렉트 |
| `/safe/*`          | 안전현황 대시보드 (아래 상세)                   |
| `/tbm`             | TBM 현황 페이지                                 |
| `/tbm-view/[id]`   | TBM 뷰 상세 (다국어 번역/복사 지원)             |
| `/list`            | 프로젝트 목록 뷰                                |
| `/map`             | 프로젝트 지도 뷰                                |
| `/business`        | 자재/사업관리 뷰                                |
| `/project/[id]/*`  | 프로젝트 상세 (20개 하위 페이지)                |
| `/worker-register` | 작업자 등록 플로우                              |

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

| 파일                       | 역할                                                         |
| -------------------------- | ------------------------------------------------------------ |
| `projects.ts` (~2,400줄) | 핵심 데이터 함수: 프로젝트 CRUD, 점검 데이터 조회, 타입 정의 |
| `supabase.ts`            | Supabase 클라이언트 초기화 (lazy loading)                    |
| `supabase-admin.ts`      | 관리자용 Supabase 클라이언트                                 |
| `auth.ts`                | 인증 유틸리티                                                |
| `constants.ts`           | 본부/지사 옵션,`DEBUG_LOGS` 플래그                         |
| `weather.ts`             | 기상청 API 연동                                              |
| `tbm.ts`                 | TBM 상태 관리                                                |
| `telegram.ts`            | Telegram 봇 연동                                             |
| `ui-settings.ts`         | UI 상태 영속화 (분기 토글)                                   |

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

### 프로젝트 종속 테이블 규칙 (필수)

프로젝트에 속한 데이터를 저장하는 **새 테이블은 반드시** FK를 `project_id UUID REFERENCES projects(id) ON DELETE CASCADE`로 선언한다. 프로젝트 삭제 시 종속 등록건이 함께 삭제되도록 보장하기 위함이다.

- 프로젝트 삭제는 `/api/projects/[id]/delete` 라우트가 service-role로 `projects` 행만 직접 지우고, 자식 행 삭제는 전적으로 `ON DELETE CASCADE`에 의존한다. cascade가 없는 자식 테이블은 삭제 시 FK 위반으로 실패하거나 고아 데이터로 남는다.
- 2026-07-06 기준 `projects`를 참조하는 자식 테이블 21개 전부 CASCADE다. 새 기능의 테이블도 빠짐없이 이 패턴을 따라야 한다. 감사는 `pg_constraint`에서 `confrelid = 'projects'`인 FK의 `confdeltype = 'c'`(=CASCADE) 여부로 확인한다.
- 새 테이블이 사진·파일을 **Storage**에 저장하고 URL 컬럼을 두면, DB 행은 cascade로 지워져도 Storage 파일은 남는다. 이때는 위 삭제 라우트의 URL 수집 로직에 그 테이블을 추가한다. (서명 등을 base64 TEXT로 DB에 저장하면 행과 함께 삭제되어 별도 작업이 불필요하다.)
- **프로젝트 병합(`merge_projects` DB 함수)도 함께 갱신한다.** 병합은 자식 테이블의 `project_id`를 target으로 UPDATE한 뒤 source를 삭제하므로, 함수의 UPDATE 목록에 없는 자식 테이블은 CASCADE로 유실된다. 함수는 실제 FK 테이블 수와 자신이 아는 개수(현재 21)가 다르면 예외로 중단하도록 되어 있으니, **새 자식 테이블 추가 시 UPDATE 목록과 개수 가드를 함께 갱신**해야 병합이 다시 동작한다. 프로젝트 단위 유니크 제약이 있는 테이블(예: quality_monthly_reports의 연·월)은 target 우선 충돌 폐기 DELETE도 추가한다.

### 일괄서명 대상 등록 규칙 (필수)

새 서류 테이블에 **감독(공사감독원) 서명** 또는 **시공사(현장소장·확인자·담당자) 서명** 컬럼(base64 TEXT)을 만들면, 반드시 `src/lib/bulk-sign/bulk-sign-targets.ts` 레지스트리에 항목을 추가해 프로젝트 상세의 일괄서명(만년필 펜통 버튼)에 포함시킨다. API 라우트(`/api/bulk-sign`)와 모달(`BulkSignModal`)이 이 파일 하나를 공유하므로 항목 추가만으로 양쪽에 반영된다.

- 감독 서명 컬럼 → `supervisor.targets`, 시공사 서명 컬럼 → `contractor.targets`에 추가한다.
- `selectColumns`에 서명(base64) 컬럼을 넣지 않는다 — 목록 조회 용량 폭증. 표시용 컬럼 + `toItem` 변환만 지정한다.
- 테이블에 `project_id`가 없으면 `projectScope: { joinTable }`(부모 조인), `updated_at`이 없으면 `hasUpdatedAt: false`를 지정한다. 서명 컬럼명이 `signature`가 아닐 수 있으니 실제 컬럼명을 확인한다 (예: `material_ledger_entries.supervisor_confirm`).
- JSONB 서명 구조도 지원한다 — 역할 배열은 `jsonb: { kind: 'roleArray', role }`(예: `safety_inspections.signatures`의 공사감독원/현장대리인), 역할 객체는 `{ kind: 'keyedObject', key, field }`(예: `ptw_permits.signatures`의 permitter/confirmer/writer/applicant).
- 점검자·감시인·작업자 등 **이름이 특정된 개인의 서명**만 등록하지 않는다. 제외 판단은 모달 하단 안내 문구와 해당 plans 컨텍스트 노트에 기록한다.

### 마이그레이션

`database/` 디렉토리에 SQL 마이그레이션 파일을 둔다.

- **파일명 규칙 (필수)**: `YYYYMMDD-HHMM_설명.sql` — 맨 앞의 일자-시간 접두어로 적용 순서대로 정렬된다. 새 마이그레이션 파일은 작성 시각을 접두어로 붙인다 (예: `20260703-0618_add_inspection_visit_logs.sql`).

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

### PDF 표 텍스트가 셀 하단에 붙어 보일 때 (html2canvas + Tailwind)

html2canvas(1.4.1)는 텍스트를 그리기 전 1×1 `<img>`를 문서 body에 붙여 `img.offsetTop`으로 폰트 baseline을 측정하는데, 이 img의 `display`를 지정하지 않는다. Tailwind 4 preflight의 `img{display:block}`이 적용되면 img가 다음 줄로 떨어져 baseline이 과대 측정되고, **모든 텍스트가 셀 하단으로 쏠려 그려진다** (2026-07-02 확정).

- 텍스트 페인팅 단계의 버그라서 셀 레이아웃(table/flex/grid)이나 vertical-align을 아무리 바꿔도 해결되지 않는다. 이미지는 baseline을 쓰지 않아 영향 없음.
- **해결**: `src/lib/reports/html2canvas-text-fix.ts`의 `applyHtml2canvasTextFix()`를 캡처 전에 호출하고 반환된 cleanup을 finally에서 호출. (manager-inspection-report.ts, headquarters-inspection.ts에 적용됨 — 새 PDF 생성기를 만들거나 같은 증상이 제보되면 이 유틸을 export 함수에 감싼다.)
- **주의**: 기존 코드의 `padding: 0 8px 8px 8px` 같은 비대칭 상하 패딩은 이 버그를 수동 보정하던 흔적이다. 유틸 적용 후에는 과보정되어 텍스트가 위로 붙으므로 대칭 패딩으로 되돌려야 한다 (일상점검표 2개 파일은 2026-07-02에 `padding: 0 8px`로 정리 완료).
