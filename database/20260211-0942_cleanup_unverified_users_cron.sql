-- ============================================
-- 미인증 계정 자동 삭제 크론잡
-- Supabase SQL Editor에서 실행
-- 3시간마다 24시간 지난 미인증 계정 삭제
-- (초기 배포는 매일 UTC 18:00이었으나 운영 DB에서 3시간마다로 변경됨.
--  2026-07-23 확인: 실제 등록된 잡과 일치하도록 파일 갱신.
--  인증 링크 만료(mailer_otp_exp)는 86400초=24시간 — Auth 설정과 세트로 운용)
-- ============================================

-- 1. pg_cron 확장 활성화
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. 크론잡 등록 (3시간마다, 정각 UTC 기준)
SELECT cron.schedule(
  'cleanup-unverified-users',
  '0 */3 * * *',
  $$
    DELETE FROM public.user_profiles
    WHERE id IN (
      SELECT id FROM auth.users
      WHERE email_confirmed_at IS NULL
      AND created_at < NOW() - INTERVAL '24 hours'
    );

    DELETE FROM auth.users
    WHERE email_confirmed_at IS NULL
    AND created_at < NOW() - INTERVAL '24 hours';
  $$
);
