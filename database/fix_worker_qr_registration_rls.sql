-- workers 테이블에 개인정보 동의 컬럼 추가
ALTER TABLE workers ADD COLUMN IF NOT EXISTS privacy_agreed BOOLEAN DEFAULT FALSE;
ALTER TABLE workers ADD COLUMN IF NOT EXISTS privacy_agreed_at TIMESTAMPTZ;

-- workers 테이블에 외국인 여부 컬럼 추가
ALTER TABLE workers ADD COLUMN IF NOT EXISTS is_foreigner BOOLEAN DEFAULT FALSE;


-- ============================================================
-- QR 기반 자가 등록을 위한 RLS 정책 수정
-- 비로그인(anon) 사용자가 토큰 기반으로 근로자 등록 가능하도록 설정
-- ============================================================

-- 1. worker_registration_tokens 테이블 RLS 정책 수정
-- 비로그인 사용자가 유효한 토큰을 조회할 수 있도록 허용

-- 기존 정책 삭제 (있는 경우)
DROP POLICY IF EXISTS "anon_can_read_valid_tokens" ON worker_registration_tokens;
DROP POLICY IF EXISTS "anon_can_update_used_at" ON worker_registration_tokens;

-- 비로그인 사용자가 토큰 조회 가능 (만료되지 않고 사용되지 않은 토큰만)
CREATE POLICY "anon_can_read_valid_tokens" ON worker_registration_tokens
  FOR SELECT
  TO anon
  USING (
    used_at IS NULL
    AND expires_at > NOW()
  );

-- 비로그인 사용자가 토큰 사용 처리 가능 (used_at 업데이트만)
CREATE POLICY "anon_can_update_used_at" ON worker_registration_tokens
  FOR UPDATE
  TO anon
  USING (
    used_at IS NULL
    AND expires_at > NOW()
  )
  WITH CHECK (
    used_at IS NOT NULL
  );

-- 2. projects 테이블 RLS 정책 수정
-- 비로그인 사용자가 프로젝트 기본 정보 조회 가능 (토큰 검증용)

DROP POLICY IF EXISTS "anon_can_read_projects_for_registration" ON projects;

CREATE POLICY "anon_can_read_projects_for_registration" ON projects
  FOR SELECT
  TO anon
  USING (true);

-- 3. workers 테이블 RLS 정책 수정
-- 비로그인 사용자가 근로자 등록 가능

DROP POLICY IF EXISTS "anon_can_insert_workers" ON workers;

CREATE POLICY "anon_can_insert_workers" ON workers
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- ============================================================
-- Storage 버킷 정책 설정
-- worker-id-cards 버킷에 비로그인 사용자 업로드 허용
-- ============================================================

-- 참고: 아래 정책은 Supabase Storage에서 실행해야 합니다
-- Supabase Dashboard > Storage > Policies 에서 설정

-- 버킷 정책 (SQL로 직접 실행):
-- INSERT: anon 사용자가 worker-id-cards 버킷에 파일 업로드 가능
-- SELECT: 인증된 사용자가 파일 조회 가능

-- 버킷이 없는 경우 생성
INSERT INTO storage.buckets (id, name, public)
VALUES ('worker-id-cards', 'worker-id-cards', true)
ON CONFLICT (id) DO NOTHING;

-- Storage 정책 삭제 (있는 경우)
DROP POLICY IF EXISTS "anon_can_upload_id_cards" ON storage.objects;
DROP POLICY IF EXISTS "anyone_can_read_id_cards" ON storage.objects;

-- 비로그인 사용자가 업로드 가능
CREATE POLICY "anon_can_upload_id_cards" ON storage.objects
  FOR INSERT
  TO anon
  WITH CHECK (bucket_id = 'worker-id-cards');

-- 모든 사용자가 파일 조회 가능 (public 버킷)
CREATE POLICY "anyone_can_read_id_cards" ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'worker-id-cards');

-- ============================================================
-- 확인 쿼리
-- ============================================================

-- RLS 정책 확인
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
-- FROM pg_policies
-- WHERE tablename IN ('worker_registration_tokens', 'workers', 'projects');
