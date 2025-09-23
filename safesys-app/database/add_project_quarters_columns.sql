-- projects 테이블에 분기별 활성화 및 준공 컬럼 추가
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS q1_active BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS q2_active BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS q3_active BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS q4_active BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS completed BOOLEAN DEFAULT FALSE;

-- 인덱스 (필요시)
CREATE INDEX IF NOT EXISTS idx_projects_quarters ON projects(q1_active, q2_active, q3_active, q4_active, completed);


