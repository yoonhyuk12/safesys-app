-- 프로젝트 공사기간 (착공일/준공일) 컬럼 추가
-- 작업일보 공정률 자동 계산용: 착공일 0% → 준공일 100% (날짜 기반)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS construction_start_date DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS construction_end_date DATE;

COMMENT ON COLUMN projects.construction_start_date IS '착공일 (공정률 0%)';
COMMENT ON COLUMN projects.construction_end_date IS '준공일 (공정률 100%)';
