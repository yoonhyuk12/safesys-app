-- TBM 제출의 대책 1~3에 각각 첨부하는 사진 URL 컬럼 3개 추가
-- 실행: Supabase SQL Editor에서 직접 실행 (MCP는 읽기 전용)

ALTER TABLE tbm_submissions
  ADD COLUMN IF NOT EXISTS solution_1_photo_url text,
  ADD COLUMN IF NOT EXISTS solution_2_photo_url text,
  ADD COLUMN IF NOT EXISTS solution_3_photo_url text;

COMMENT ON COLUMN tbm_submissions.solution_1_photo_url IS '대책 1 사진 URL (tbm-photos/solutions)';
COMMENT ON COLUMN tbm_submissions.solution_2_photo_url IS '대책 2 사진 URL (tbm-photos/solutions)';
COMMENT ON COLUMN tbm_submissions.solution_3_photo_url IS '대책 3 사진 URL (tbm-photos/solutions)';
