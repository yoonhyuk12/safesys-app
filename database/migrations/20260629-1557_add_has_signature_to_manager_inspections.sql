-- 관리자점검 서명 '존재 여부'만 나타내는 생성 컬럼
-- 목적: 프로젝트 목록 배지(미조치 건수) 집계 시 signature base64(약 13MB)를 클라이언트로
--       전송하지 않고, has_signature(boolean 1바이트)만 받아 존재 여부를 판정.
-- 실행 방법: Supabase 웹 콘솔 SQL Editor에서 직접 실행

ALTER TABLE public.manager_inspections
  ADD COLUMN IF NOT EXISTS has_signature boolean
  GENERATED ALWAYS AS (signature IS NOT NULL AND btrim(signature) <> '') STORED;
