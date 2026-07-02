-- 마이그레이션: quarters_toggle_state jsonb 컬럼 추가
-- ui_settings 테이블에 분기별 개별 토글 상태를 저장하는 jsonb 컬럼 추가

ALTER TABLE ui_settings
  ADD COLUMN IF NOT EXISTS quarters_toggle_state jsonb
    DEFAULT '{"q1": false, "q2": false, "q3": false, "q4": false, "completed": false}'::jsonb;

-- 기존 show_quarters_toggle boolean 데이터를 jsonb로 마이그레이션
UPDATE ui_settings
SET quarters_toggle_state = CASE
  WHEN show_quarters_toggle = true
    THEN '{"q1": true, "q2": true, "q3": true, "q4": true, "completed": true}'::jsonb
  ELSE '{"q1": false, "q2": false, "q3": false, "q4": false, "completed": false}'::jsonb
END
WHERE quarters_toggle_state IS NULL
   OR quarters_toggle_state = '{"q1": false, "q2": false, "q3": false, "q4": false, "completed": false}'::jsonb;
