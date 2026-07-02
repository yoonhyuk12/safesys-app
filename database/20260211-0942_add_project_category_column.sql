-- Add project_category column to projects table
-- 사업분류 컬럼 추가

-- Add the column
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS project_category TEXT;

-- Add comment
COMMENT ON COLUMN projects.project_category IS '사업분류 (예: 토목, 건축, 전기, 통신 등)';
