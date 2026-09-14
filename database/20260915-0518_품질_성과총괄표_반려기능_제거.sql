-- 품질시험 성과총괄표 반려 통보 기능 제거 — 관련 함수와 인덱스를 정리한다.
-- 컬럼(rejection_reason, rejected_at, rejected_by, rejection_read_at, rejection_read_by)은
-- 기존 반려 이력 보존을 위해 DROP 하지 않고 그대로 남긴다.

DROP FUNCTION IF EXISTS public.reject_quality_summary_report(UUID, TEXT);
DROP FUNCTION IF EXISTS public.read_quality_summary_rejection(UUID);
DROP INDEX IF EXISTS public.idx_quality_summary_reports_unread_rejection;
