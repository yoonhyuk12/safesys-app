-- ============================================
-- 미인증 계정 자동 삭제 크론잡
-- Supabase SQL Editor에서 실행
-- 매일 새벽 3시(KST)에 24시간 지난 미인증 계정 삭제
-- ============================================

-- 1. pg_cron 확장 활성화
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. 크론잡 등록 (매일 KST 03:00 = UTC 18:00)
SELECT cron.schedule(
  'cleanup-unverified-users',
  '0 18 * * *',
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
