# 체크리스트 — 관리자 인증번호 자체 발송

계획서 [20260802_관리자인증번호_자체발송.md](./20260802_관리자인증번호_자체발송.md).

## 준비 (사용자)

- [ ] Google 계정 `yoonhyuk5472@gmail.com`에서 앱 비밀번호 발급 (2단계 인증 필요)
- [ ] `.env.local`에 `ADMIN_MAIL_USER`, `ADMIN_MAIL_PASS` 추가
- [ ] Vercel Production에 같은 변수 2개 등록
- [ ] `database/20260802-XXXX_admin_otp_codes.sql`을 Supabase SQL Editor에서 실행

## 구현

- [ ] `nodemailer`, `@types/nodemailer` 설치
- [ ] 마이그레이션 SQL 작성 (`admin_otp_codes` + RLS 활성화·정책 없음)
- [ ] `src/lib/admin-otp.ts` — 6자리 생성, HMAC 해시, timingSafeEqual 비교, 상수(5분·5회·60초·10건)
- [ ] `src/lib/admin-mailer.ts` — nodemailer Gmail 전송기, 인증번호 메일 제목·본문
- [ ] `send/route.ts` — 쿨다운·시간당 한도 검사 → 이전 코드 소각 → 발급·저장 → 메일 발송
- [ ] `verify/route.ts` — 코드 조회·만료·시도횟수·소각 → generateLink → token_hash 교환 → 세션 반환
- [ ] `LoginForm.tsx` — 5분 유효시간 안내 문구 반영

## 검증

- [ ] `npm run lint` 통과
- [ ] `npx tsc --noEmit` 통과
- [ ] 로컬 발송 → 메일 수신 확인
- [ ] 정상 코드 입력 → `/admin` 진입
- [ ] 발급된 access_token 페이로드에 `amr: [{method: "otp"}]` 확인
- [ ] 만료 코드 거부 (만료 시각을 과거로 수정해 재현)
- [ ] 사용 완료 코드 재사용 거부
- [ ] 오답 6회 시 코드 소각 확인
- [ ] 60초 내 재발송 차단 확인
- [ ] Supabase `mailer_otp_exp`가 86400 그대로인지 재확인

## 마무리

- [ ] 의미 단위 커밋
- [ ] 컨텍스트 노트 갱신
- [ ] 배포 여부 사용자 확인 (main 푸시 = 운영 즉시 반영)
