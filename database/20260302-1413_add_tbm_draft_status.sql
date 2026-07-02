-- tbm_submissions 테이블에 status 컬럼 추가
-- status 값: 'draft' (임시저장) | 'submitted' (최종제출)
-- 기존 레코드는 DEFAULT 'submitted'로 자동 처리됨

ALTER TABLE tbm_submissions
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'submitted';

-- 인덱스 추가 (status 기반 필터링 성능)
CREATE INDEX IF NOT EXISTS idx_tbm_submissions_status ON tbm_submissions(status);

COMMENT ON COLUMN tbm_submissions.status IS 'draft: 임시저장, submitted: 최종제출';
