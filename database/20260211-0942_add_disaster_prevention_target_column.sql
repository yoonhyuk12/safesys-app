-- Add disaster_prevention_target column to projects table
-- 재해예방기술지도 대상 여부를 나타내는 컬럼 추가

ALTER TABLE projects
ADD COLUMN IF NOT EXISTS disaster_prevention_target boolean DEFAULT false;

COMMENT ON COLUMN projects.disaster_prevention_target IS '재해예방기술지도 대상 여부';
