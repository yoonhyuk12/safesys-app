-- 자재 순서 변경을 위한 sort_order 컬럼 추가
ALTER TABLE materials ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- 기존 데이터에 순서 부여 (created_at 순)
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY created_at ASC) AS rn
  FROM materials
)
UPDATE materials SET sort_order = ordered.rn
FROM ordered WHERE materials.id = ordered.id;
