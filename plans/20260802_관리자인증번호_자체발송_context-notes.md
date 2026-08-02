# 컨텍스트 노트 — 관리자 인증번호 자체 발송

계획서 [20260802_관리자인증번호_자체발송.md](./20260802_관리자인증번호_자체발송.md).

## 2026-08-02 · 왜 자체 발송인가

"관리자 인증번호를 5분으로" 요구에 대해 세 가지 안을 검토했다.

1. **Supabase 전역 `mailer_otp_exp`를 300초로 변경** — 진짜 5분이 되지만 이 값은 관리자 OTP 전용이 아니다. 신규 가입 확인 메일에도 같이 적용돼 가입 링크가 5분 만에 죽고, 24시간 기준으로 도는 미인증 계정 정리 크론 전제와 어긋난다. 기각.
2. **앱 레벨 5분 게이트(서명 쿠키)** — 20~30줄로 끝나지만 "앱 화면 기준 5분"에 그친다. 메일로 나간 Supabase 토큰 자체는 24시간 살아 있어, 코드를 손에 넣은 사람이 Supabase 인증 엔드포인트를 직접 호출하면 우회된다. 기각.
3. **자체 발송(채택)** — 코드 생성·검증을 앱이 하고 Supabase는 세션 발급만 담당. 메일에 나가는 건 우리 5분짜리 코드뿐이라 우회 경로가 없다. 대신 메일 발송 채널이 새로 필요하다.

## 2026-08-02 · 메일 채널은 Gmail SMTP

사용자 선택. Supabase 커스텀 SMTP가 이미 `smtp.gmail.com:465` / `yoonhyuk5472@gmail.com`으로 설정돼 있어 발신 주소가 기존 메일과 동일해진다는 점이 컸다. Management API가 돌려주는 `smtp_pass`는 해시값이라 재사용할 수 없어, 같은 계정의 **앱 비밀번호를 별도 env로 다시 등록**해야 한다.

Resend 같은 HTTP 메일러는 서버리스에 더 잘 맞지만 도메인 인증이 선행돼야 해서 이번엔 보류했다. 교체가 필요해지면 `src/lib/admin-mailer.ts` 한 파일만 갈아끼우면 되도록 발송부를 분리한다.

## 2026-08-02 · GoTrue 소스로 확인한 전제

추측으로 넘어가면 안 되는 지점이라 supabase/auth 소스를 직접 읽었다.

- `internal/api/mail.go`의 `adminGenerateLink`는 `mailer.GetEmailActionLink`로 링크 문자열만 만들고 `sendEmail`을 호출하지 않는다. → **generateLink는 메일을 보내지 않는다.** 관리자가 중복 메일을 받을 걱정이 없다.
- 같은 함수에 `validateSentWithinFrequencyLimit` 호출이 없다. → SMTP 60초 발송 빈도 제한(`smtp_max_frequency`)에 걸리지 않는다.
- `internal/api/verify.go`의 POST `/verify`는 검증 타입과 무관하게 `issueRefreshToken(..., models.OTP, ...)`를 호출한다(`internal/models/factor.go`에서 `OTP.String() == "otp"`). → **magiclink 토큰으로 교환한 세션도 JWT `amr`이 `otp`다.** 따라서 `admin-auth.ts`의 `hasOtpLogin`은 손대지 않는다.

## 2026-08-02 · 코드 저장은 HMAC, 키는 서비스 롤 키 재사용

6자리 숫자는 평문 SHA-256으로 저장하면 100만 건 전수 대조가 즉시 가능하므로 pepper가 필요하다. 새 환경 변수를 하나 더 늘리는 대신, 이미 서버 전용으로 존재하고 유출 시 어차피 DB가 뚫리는 `SUPABASE_SERVICE_ROLE_KEY`를 HMAC 키로 재사용했다. 키를 회전하면 발급 중이던 코드가 무효화되지만 유효시간이 5분이라 실질 영향이 없다.

## 2026-08-02 · 사라지는 보호막을 대체해야 한다

Supabase 발송을 그만두면 GoTrue가 걸어주던 기본 rate limit(시간당 30건)도 같이 사라진다. 그래서 서버측 쿨다운 60초·시간당 10건을 `admin_otp_codes` 테이블 기준으로 직접 건다. 기존 UI의 60초 쿨다운은 클라이언트 표시일 뿐이라 서버 검사가 별도로 필요하다.
