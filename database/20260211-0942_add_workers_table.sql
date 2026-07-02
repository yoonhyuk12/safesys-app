-- 근로자 관리대장 테이블 생성
CREATE TABLE IF NOT EXISTS workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  birth_date DATE NOT NULL,
  registration_number VARCHAR(50),
  completion_date DATE,
  worker_score DECIMAL(5,2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_workers_project_id ON workers(project_id);
CREATE INDEX IF NOT EXISTS idx_workers_name ON workers(name);

-- RLS 활성화
ALTER TABLE workers ENABLE ROW LEVEL SECURITY;

-- RLS 정책: 인증된 사용자는 모든 근로자 조회 가능
CREATE POLICY "workers_select_policy" ON workers
  FOR SELECT
  TO authenticated
  USING (true);

-- RLS 정책: 인증된 사용자는 근로자 등록 가능
CREATE POLICY "workers_insert_policy" ON workers
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- RLS 정책: 인증된 사용자는 근로자 수정 가능
CREATE POLICY "workers_update_policy" ON workers
  FOR UPDATE
  TO authenticated
  USING (true);

-- RLS 정책: 인증된 사용자는 근로자 삭제 가능
CREATE POLICY "workers_delete_policy" ON workers
  FOR DELETE
  TO authenticated
  USING (true);

-- updated_at 자동 업데이트 트리거
CREATE OR REPLACE FUNCTION update_workers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER workers_updated_at_trigger
  BEFORE UPDATE ON workers
  FOR EACH ROW
  EXECUTE FUNCTION update_workers_updated_at();
