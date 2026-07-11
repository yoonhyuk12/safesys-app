# CLAUDE.md

이 파일은 목차(map)다. 백과사전이 아니다. 상세 지식은 [`docs/`](./docs/index.md) 기록 시스템에 카테고리별로 분리·색인되어 있다. 여기서 필요한 문서만 열어 점진적으로 컨텍스트를 확보하라.

> 원칙. 하나의 큰 지침 파일은 실패한다 — 주요 제약을 묻고, 낡은 규칙의 무덤이 되고, 기계적 점검이 불가능하다. 그래서 이 파일엔 "가장 중요한 제약"만 인라인으로 두고 나머지는 링크한다. 문서가 코드 동작과 어긋나면 그것은 버그다. 발견 즉시 갱신하라.

## 프로젝트 한 줄 요약

SafeSys — Next.js 15 · React 19 · Supabase로 만든 한국 건설 안전관리 시스템(PWA). 안전 점검(폭염·관리자·본부불시·TBM), 작업자 관리, 자재 원장, 문서 생성(PDF/Excel/HWPX).

## 지식 베이스 지도 (docs/)

| 문서 | 내용 |
|------|------|
| [docs/index.md](./docs/index.md) | 지식 베이스 목차·네비게이션 허브 |
| [docs/architecture.md](./docs/architecture.md) | 기술 스택, Dashboard 중심 라우팅, 라우트/API, 컴포넌트·유틸·타입 |
| [docs/conventions.md](./docs/conventions.md) | Advisor/Worker 역할, 행동 가이드라인 10개, 코딩 스타일, 테스트, 커밋/PR |
| [docs/database.md](./docs/database.md) | 테이블, `ON DELETE CASCADE` 규칙, 일괄서명 등록 규칙, 마이그레이션, MCP |
| [docs/auth.md](./docs/auth.md) | 역할 체계, 조직 구조, 접근 권한 패턴, 인증 플로우, 보안 체크리스트 |
| [docs/environment.md](./docs/environment.md) | 개발 명령어, main 푸시=자동 배포, 환경 변수, API 키 위치 |
| [docs/troubleshooting.md](./docs/troubleshooting.md) | 빌드 캐시, 프로필 미동기화, 권한/지도, html2canvas PDF 버그 |

`plans/` — 계획서(일급 아티팩트, `YYYYMMDD_주제.md`). `database/*.sql` — 마이그레이션(`YYYYMMDD-HHMM_설명.sql`). `wiki/검사기준/` — 공종단계별 검사 기준 LLM 위키(구조·규칙은 그 안의 CLAUDE.md 참조).

## 핵심 제약 (항상 적용, 위반 금지)

이 4가지는 링크를 안 열어도 반드시 지킨다. 상세는 각 링크.

1. **Advisor / Worker 역할 분담.** 너는 Advisor다 — 판단·설계·검증·보고에 집중하고 구현 노동은 Worker(Opus 서브에이전트)에게 위임한다. Worker의 완료 보고를 그대로 믿지 말고 diff·테스트로 직접 확인한 뒤 승인한다. 위임 오버헤드가 더 큰 사소한 수정은 직접 처리해도 된다. → [conventions.md](./docs/conventions.md#모델-역할-분담-advisor--worker)
2. **main 푸시 = 즉시 운영 배포.** `git push origin main`은 Vercel 자동 프로덕션 배포를 유발한다. main 푸시는 곧 운영 반영임을 인지하고 진행한다. `npm run build` 프로덕션 빌드는 동의 없이 시작하지 않는다. → [environment.md](./docs/environment.md#배포--main-푸시--자동-배포-중요)
3. **한국어로 답하고, 문장을 콜론(`:`)으로 끝내지 않는다.** 종결부는 `.`, `?`, `!`. 새 소스 파일 첫 줄엔 역할을 밝히는 한 줄 한국어 주석을 단다. → [conventions.md](./docs/conventions.md#5-no-closing-colons-한국어-출력)
4. **외과적 변경.** 요청과 무관한 코드/포맷을 "개선"하지 않는다. 변경된 모든 줄이 요청으로 직접 추적되어야 한다. 코드를 건드렸으면 "완료" 전에 린트·타입체크·테스트를 돌린다. → [conventions.md](./docs/conventions.md#작업-행동-가이드라인-10개)

## 빠른 명령어

모든 명령어는 `safesys-app`에서 실행한다.

```bash
cd safesys-app
npm run dev              # 개발 서버 (http://localhost:3000)
npm run lint             # ESLint
npx tsc --noEmit         # 타입 점검
npm run build            # 프로덕션 빌드 (동의 없이 시작 금지)
```

## 작업 착수 절차 (비자명 작업)

1. [conventions.md](./docs/conventions.md)의 행동 가이드라인을 따른다 — 가정 명시, 단순성 우선, 계획·체크리스트·컨텍스트 노트 산출.
2. 관련 docs 문서를 열어 컨텍스트를 확보한다 (예: DB 작업 → [database.md](./docs/database.md), 권한 → [auth.md](./docs/auth.md)).
3. Worker에게 위임할 브리프에 파일 경로·컨벤션·함정·완료 기준을 담는다.
4. diff·테스트로 직접 검증한 뒤 의미 단위로 커밋한다.
