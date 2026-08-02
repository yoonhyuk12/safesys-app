# 체크리스트 — 관리자 인증번호 자체 발송

계획서 [20260802_관리자인증번호_자체발송.md](./20260802_관리자인증번호_자체발송.md).

## 준비 (사용자)

- [ ] Google 계정 `yoonhyuk5472@gmail.com`에서 앱 비밀번호 발급 (2단계 인증 필요)
- [ ] `.env.local`에 `ADMIN_MAIL_USER`, `ADMIN_MAIL_PASS` 추가
- [ ] Vercel Production에 같은 변수 2개 등록
- [ ] `database/20260802-XXXX_admin_otp_codes.sql`을 Supabase SQL Editor에서 실행

## 구현

- [x] `nodemailer`, `@types/nodemailer` 설치
- [x] 마이그레이션 SQL 작성 (`admin_otp_codes` + RLS 활성화·정책 없음)
- [x] `src/lib/admin-otp.ts` — 6자리 생성, HMAC 해시, timingSafeEqual 비교, 상수(5분·5회·60초·10건)
- [x] `src/lib/admin-mailer.ts` — nodemailer Gmail 전송기, 인증번호 메일 제목·본문
- [x] `send/route.ts` — 쿨다운·시간당 한도 검사 → 이전 코드 소각 → 발급·저장 → 메일 발송
- [x] `verify/route.ts` — 코드 조회·만료·시도횟수·소각 → generateLink → token_hash 교환 → 세션 반환
- [x] `LoginForm.tsx` — 5분 유효시간 안내 문구 반영

## 검증

- [x] `npm run lint` 통과 (신규·수정 파일 경고 0)
- [x] `npx tsc --noEmit` 통과
- [x] 발급된 access_token 페이로드에 `amr: [{method: "otp"}]` 확인 — 실측 스크립트로 확인, 검증용 세션은 회수함
- [x] Supabase `mailer_otp_exp`가 86400 그대로인지 재확인
- [x] 로컬 발송 → 메일 수신 확인 (발송 5.2초, DB `ttl_seconds = 300`)
- [x] 정상 코드 검증 → 세션 발급, `auth.sessions.authentication_method = otp`
- [x] 만료 코드 거부 — 발급 후 5분 20초 경과 뒤 400 "인증번호가 만료되었습니다"
- [x] 사용 완료 코드 재사용 거부 (400)
- [x] 60초 내 재발송 차단 (429)
- [x] 6자리 아닌 입력 거부 (400), 오답 시 `attempts` 누적 확인
- [ ] 오답 6회 소각은 미실측 — 같은 UPDATE 문의 분기라 코드로만 확인함

## 마무리

- [x] 의미 단위 커밋 (e5c2c40)
- [x] 컨텍스트 노트 갱신
- [ ] 배포 여부 사용자 확인 (main 푸시 = 운영 즉시 반영)

## 후속 (2026-08-03) — 수신 이메일 입력 게이트

- [x] `send/route.ts` — 본문 `email`을 `ADMIN_OTP_EMAIL`과 대소문자 무시 비교, 불일치 시 403 `관리자 이메일이 아닙니다.` (쿨다운·DB 쓰기·메일 발송보다 앞단)
- [x] `LoginForm.tsx` — `admin` 입력 시 비밀번호란 대신 "인증번호 받을 이메일" 입력란 노출, 발송 요청에 `email` 동봉
- [x] `npx tsc --noEmit` 통과, 변경 파일 ESLint 신규 경고 0 (기존 `handleShare` catch 경고만 잔존)
- [x] 다른 이메일 403 / 이메일 누락 403 / 아이디 오류 401 실측
- [x] 정답 이메일 대소문자·공백 혼합(`  YoonHyuk1@Nate.com  `) 200 발송 4.4초, 직후 재요청 429 쿨다운 확인
- [x] Playwright로 admin 입력 시 이메일란 전환·틀린 주소 발송 시 문구 노출 확인
