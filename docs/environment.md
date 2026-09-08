<!-- 개발 환경: 명령어·main 푸시=자동 배포·환경 변수·API 키 위치 -->
# 개발 환경 및 배포

## 개발 명령어

**중요**: 모든 명령어는 `safesys-app` 디렉터리에서 실행해야 한다.
**중요**: `npm run build` 프로덕션 빌드는 동의 없이 시작하지 않는다.

```bash
cd safesys-app
npm install              # 의존성 설치 (클론 직후·node_modules 유실 시 필수)
npm run dev              # 개발 서버 (http://localhost:3000)
npm run build            # 프로덕션 빌드
npm run build:no-cache   # 캐시 없는 프로덕션 빌드
npm run lint             # ESLint 검사
npx tsc --noEmit         # 커밋 전 타입 안정성 점검
npm run start            # 마지막 빌드 결과를 스테이징 검수용으로 구동
npm run deploy           # 빌드 후 next start 실행 (배포 검증용)
```

## 검증

Playwright가 설치되어 있으나(`safesys-app/tests/*.spec.ts` 2건, 2026-02 이후 미유지) 커버리지가 사실상 없다. 린트·타입체크·수동 시나리오 검증이 필수다.

- `npm run lint`, `npx tsc --noEmit` 실행
- 로그인, 점검 목록(`/list`), 프로젝트 상세(`/project/[id]`), 지도 화면 직접 확인
- `database/` SQL을 수정했다면 변경 의도를 PR 본문에 기록

## 배포 — main 푸시 = 자동 배포 (중요)

`main` 브랜치에 푸시하면 Vercel이 자동으로 프로덕션에 배포한다. 즉 `git push origin main`은 곧 운영 반영이다. 별도 `vercel deploy --prod`를 실행하지 않아도 푸시만으로 배포가 진행되므로, main 푸시는 운영에 즉시 나가는 변경임을 인지하고 진행한다.

- `vercel deploy --prod` — 사용자 명시적 요청 시에만 실행.

## 환경 변수 (`.env.local`)

아래는 2026-09-02에 `src/`의 `process.env` 사용처와 Vercel Production 등록 목록을 대조해 정리한 실측값이다. 레포에 `.env.example`은 없으므로 새 환경을 꾸릴 땐 이 표를 기준으로 `safesys-app/.env.local`을 직접 작성한다.

```
# 필수 — 없으면 앱이 부팅되지 않는다 (src/lib/supabase.ts에서 throw)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=          # 서버 라우트·관리자 OTP (supabase-admin.ts)

# AI
OPENAI_API_KEY=
GEMINI_API_KEY=

# 외부 공공 API
KMA=                                # 기상청 API 허브(apihub.kma.go.kr) — 짧은 토큰. kma-auth.ts가 읽는 1순위 이름
NEXT_PUBLIC_KMA_API_KEY=            # 기상청 단기예보(data.go.kr) — 장문 키. weather.ts가 직접 읽는 별개 키
DATA_GO_KR_API_KEY=                 # 나라장터(G2B) 계약·납품 조회
CSI_API_KEY=                        # CSI 품질보고서 연동

# 알림앱(aicctvalert) — Vercel에도 등록 필요
AICCTV_ALERT_FUNCTION_URL=          # send-alert Edge Function 주소
AICCTV_ALERT_ANON_KEY=

# 관리자 로그인·메일
TELEGRAM_BOT_TOKEN=
ADMIN_EMAILS=
ADMIN_LOGIN_ID=
ADMIN_OTP_EMAIL=
ADMIN_MAIL_USER=
ADMIN_MAIL_PASS=
```

- **`NEXT_PUBLIC_VWORLD_API_KEY`는 선택.** 미설정 시 `src/lib/vworld.ts`의 하드코딩 폴백 키를 쓴다. `VWORLD_API_KEY`(접두사 없는 이름)는 **어느 코드도 읽지 않는다** — Vercel에 남아 있던 항목은 2026-09-02에 삭제했다.
- **`NEXT_PUBLIC_APP_NAME`·`NEXT_PUBLIC_APP_VERSION`·`NEXT_PUBLIC_BUILD_TIME`도 코드에서 읽는 곳이 없다.** 있어도 무해하지만 필수가 아니다.
- **기상청 키가 두 개인 이유.** 허브(`KMA`)와 단기예보(`NEXT_PUBLIC_KMA_API_KEY`)는 서로 다른 서비스의 키다. `getKmaHubKey()`가 `KMA → KMA_API_KEY → NEXT_PUBLIC_KMA_API_KEY` 순으로 읽기는 하지만, 40자를 넘거나 `=`·`%`가 섞인 값은 data.go.kr용으로 보고 무시한 뒤 하드코딩 폴백 키를 쓴다 (`src/lib/kma-auth.ts`). 즉 장문 키를 `KMA`에 넣어도 허브 인증에는 쓰이지 않는다.
- **`NEXT_PUBLIC_KMA_API_KEY`의 영향 범위는 작업일보 한 곳뿐이다.** `src/lib/weather.ts`를 import하는 곳은 `WorkDailyReportForm.tsx`(작업일보)와 `api/test-apparent-temp`(테스트) 둘뿐이며, 값이 비면 예외가 아니라 `null`이 반환되어 미래 날짜의 날씨·최고/최저기온이 `금일조회X`로 표시된다. 폭염점검·공사감독일지·과거 관측 조회는 모두 API 라우트를 거쳐 `KMA` 허브 키를 쓰므로 영향이 없다.
- 비밀 값은 Git에 올리지 않는다. Supabase 키가 로그나 공유 문서에 노출되면 즉시 교체한다.

### Vercel 환경 변수와의 관계

`main` 푸시 배포는 로컬 `.env.local`이 아니라 Vercel에 등록된 값을 쓴다. 즉 **새 환경 변수를 추가하면 Vercel에도 등록해야 운영에 반영된다.**

```bash
cd safesys-app
npx vercel env ls production            # 등록 목록 확인 (값은 미표시)
npx vercel env pull .env.vercel --environment=production
```

- Vercel에서 **Secret(Sensitive) 타입으로 등록된 변수는 `env pull`로 값을 가져올 수 없다** — `[SENSITIVE]` 문자열만 내려온다. 2026-09-02 기준 `KMA`, `AICCTV_ALERT_*`, `DATA_GO_KR_API_KEY`, `GEMINI_API_KEY`가 여기 해당하므로 로컬 값은 별도로 확보해야 한다.
- `CSI_API_KEY`는 로컬에만 있고 Vercel에는 없다 (2026-09-02 기준, 기능 테스트 중).
- `NEXT_PUBLIC_KMA_API_KEY`도 Vercel에 없다 (2026-09-02 기준). `NEXT_PUBLIC_*`는 빌드 시점에 값이 인라인되므로 운영 빌드에는 `undefined`가 박힌다. 다만 운영 기상정보는 `KMA` 허브 키로 도는 API 라우트가 담당하므로 정상이고, 작업일보의 미래 날짜 단기예보만 `금일조회X`가 된다.

## API 키 사용 위치

- V-World: `src/lib/vworld.ts` 한 곳에서 상수로 export하며, `api/geocoding/route.ts`·`VworldAddressSearch.tsx`·`VworldMapAddressModal.tsx`가 이를 import한다. `public/vworld-map.html`은 iframe 쿼리스트링으로 키를 넘겨받는다 (그 안의 `window.VWORLD_API_KEY`는 환경 변수가 아니라 JS 전역 변수다).
- Kakao Maps: `layout.tsx`에 하드코딩
- 기상청: 경로가 둘이다. **API 라우트**(`weather/*`, `weather-crawl`)는 `src/lib/kma-auth.ts`의 `getKmaHubKey()`로 허브 키를 일원화해 쓰고 — 폭염점검·공사감독일지·과거 관측이 모두 여기 속한다 — **`src/lib/weather.ts`**만 별도로 `NEXT_PUBLIC_KMA_API_KEY`(단기예보)를 직접 읽는다. 새 기상 기능은 라우트 경로를 따르는 편이 낫다.
