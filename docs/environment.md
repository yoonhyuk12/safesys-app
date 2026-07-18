<!-- 개발 환경: 명령어·main 푸시=자동 배포·환경 변수·API 키 위치 -->
# 개발 환경 및 배포

## 개발 명령어

**중요**: 모든 명령어는 `safesys-app` 디렉터리에서 실행해야 한다.
**중요**: `npm run build` 프로덕션 빌드는 동의 없이 시작하지 않는다.

```bash
cd safesys-app
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

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_KMA_API_KEY=           # 기상청 API
VWORLD_API_KEY=                     # V-World 주소/지도
NEXT_PUBLIC_APP_NAME=SafeSys Safety Management System
NEXT_PUBLIC_APP_VERSION=1.0.0
AICCTV_ALERT_FUNCTION_URL=            # 알림앱(aicctvalert) send-alert Edge Function 주소 — Vercel에도 등록 필요
AICCTV_ALERT_ANON_KEY=               # 알림앱(aicctvalert) anon key — Vercel에도 등록 필요
```

`.env.local`은 `.env.example`을 복사해 작성하고 비밀 값은 Git에 올리지 않는다. Supabase 키가 로그나 공유 문서에 노출되면 즉시 교체한다.

## API 키 사용 위치

- V-World: `.env.local`, `layout.tsx`, `api/geocoding/route.ts`, `VworldAddressSearch.tsx`
- Kakao Maps: `layout.tsx`에 하드코딩
