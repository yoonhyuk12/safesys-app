-- tbm_submissions 테이블에 총 투입인원(명) 컬럼 추가
-- 내역(personnel_count, text)에서 자동 합산하되 사용자가 직접 수정 가능한 값을 저장한다.
ALTER TABLE tbm_submissions
  ADD COLUMN IF NOT EXISTS personnel_total_count INTEGER;

COMMENT ON COLUMN tbm_submissions.personnel_total_count
  IS '금일 총 투입인원(명). 내역(personnel_count)에서 자동 합산하되 사용자가 수정 가능.';
