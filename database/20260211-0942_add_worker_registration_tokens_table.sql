-- 근로자 자가 등록용 토큰 테이블 생성
CREATE TABLE IF NOT EXISTS worker_registration_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  token VARCHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_worker_registration_tokens_token ON worker_registration_tokens(token);
CREATE INDEX IF NOT EXISTS idx_worker_registration_tokens_project_id ON worker_registration_tokens(project_id);
CREATE INDEX IF NOT EXISTS idx_worker_registration_tokens_expires_at ON worker_registration_tokens(expires_at);

-- RLS 활성화
ALTER TABLE worker_registration_tokens ENABLE ROW LEVEL SECURITY;

-- RLS 정책: 인증된 사용자는 토큰 생성/조회 가능
CREATE POLICY "worker_registration_tokens_select_policy" ON worker_registration_tokens
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "worker_registration_tokens_insert_policy" ON worker_registration_tokens
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "worker_registration_tokens_update_policy" ON worker_registration_tokens
  FOR UPDATE TO authenticated USING (true);

-- 공개 접근용 정책: 비인증 사용자도 토큰으로 조회 가능 (자가 등록용)
CREATE POLICY "worker_registration_tokens_anon_select_policy" ON worker_registration_tokens
  FOR SELECT TO anon USING (expires_at > NOW() AND used_at IS NULL);
