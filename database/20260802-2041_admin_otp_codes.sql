-- 관리자 로그인 인증번호를 앱이 직접 발급·검증하도록 해시·만료·시도 횟수를 보관하는 테이블 마이그레이션

-- 재실행 안전: IF NOT EXISTS 사용. Supabase SQL Editor에서 수동 적용.
CREATE TABLE IF NOT EXISTS public.admin_otp_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  request_ip TEXT
);

-- 최신 코드 조회와 발송 빈도 검사가 모두 created_at 역순 스캔이다.
CREATE INDEX IF NOT EXISTS idx_admin_otp_codes_created_at
  ON public.admin_otp_codes(created_at DESC);

-- 정책을 하나도 만들지 않아 anon·authenticated는 전면 차단되고 service role만 읽고 쓴다.
ALTER TABLE public.admin_otp_codes ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.admin_otp_codes IS
  '관리자 로그인 인증번호 발급 이력. service role 전용이며 24시간 지난 행은 발송 라우트가 정리한다.';
COMMENT ON COLUMN public.admin_otp_codes.code_hash IS
  'SUPABASE_SERVICE_ROLE_KEY를 키로 한 HMAC-SHA256 결과. 6자리 원문은 저장하지 않는다.';
COMMENT ON COLUMN public.admin_otp_codes.consumed_at IS
  '소각 시각. 검증 성공·재발송·시도 횟수 초과 시 채워지며 값이 있으면 다시 쓸 수 없다.';
