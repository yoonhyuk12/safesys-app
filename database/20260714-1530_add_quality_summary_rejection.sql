-- 품질검사 성과총괄표의 반려 통보와 작성자 확인 상태를 안전하게 기록한다.

ALTER TABLE public.quality_summary_reports
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS rejection_read_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_read_by UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_quality_summary_reports_unread_rejection
  ON public.quality_summary_reports(project_id)
  WHERE rejected_at IS NOT NULL AND rejection_read_at IS NULL;

CREATE OR REPLACE FUNCTION public.reject_quality_summary_report(
  p_report_id UUID,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_hq_division TEXT;
  v_branch_division TEXT;
  v_project_id UUID;
  v_project_owner UUID;
  v_project_hq TEXT;
  v_project_branch TEXT;
  v_can_access BOOLEAN := FALSE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다.';
  END IF;

  SELECT role::TEXT, hq_division, branch_division
    INTO v_role, v_hq_division, v_branch_division
    FROM public.user_profiles
   WHERE id = auth.uid();

  IF v_role IS NULL OR v_role NOT IN ('발주청', '감리단') THEN
    RAISE EXCEPTION '성과총괄표 반려 권한이 없습니다.';
  END IF;

  IF NULLIF(BTRIM(p_reason), '') IS NULL THEN
    RAISE EXCEPTION '반려 사유를 입력해주세요.';
  END IF;

  SELECT report.project_id, project.created_by, project.managing_hq, project.managing_branch
    INTO v_project_id, v_project_owner, v_project_hq, v_project_branch
    FROM public.quality_summary_reports AS report
    JOIN public.projects AS project ON project.id = report.project_id
   WHERE report.id = p_report_id;

  IF v_project_id IS NULL THEN
    RAISE EXCEPTION '성과총괄표를 찾을 수 없습니다.';
  END IF;

  v_can_access := COALESCE(
    v_project_owner = auth.uid()
    OR EXISTS (
      SELECT 1
        FROM public.project_shares AS ps
       WHERE ps.project_id = v_project_id
         AND ps.shared_with = auth.uid()
    )
    OR (
      v_branch_division IS NOT NULL
      AND v_branch_division NOT LIKE '%본부'
      AND v_project_branch = v_branch_division
    )
    OR (
      v_hq_division IS NOT NULL
      AND (v_branch_division IS NULL OR v_branch_division LIKE '%본부')
      AND v_project_hq = v_hq_division
    )
    OR (
      v_role = '발주청'
      AND (
        v_hq_division IS NULL
        OR (v_hq_division = '본사' AND v_branch_division = '본사')
      )
    ),
    FALSE
  );

  IF NOT v_can_access THEN
    RAISE EXCEPTION '해당 프로젝트의 성과총괄표 반려 권한이 없습니다.';
  END IF;

  UPDATE public.quality_summary_reports
     SET rejection_reason = BTRIM(p_reason),
         rejected_at = NOW(),
         rejected_by = auth.uid(),
         rejection_read_at = NULL,
         rejection_read_by = NULL,
         reviewer_signature = '',
         updated_at = NOW()
   WHERE id = p_report_id;

END;
$$;

CREATE OR REPLACE FUNCTION public.read_quality_summary_rejection(
  p_report_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다.';
  END IF;

  UPDATE public.quality_summary_reports
     SET rejection_read_at = NOW(),
         rejection_read_by = auth.uid(),
         updated_at = NOW()
   WHERE id = p_report_id
     AND created_by = auth.uid()
     AND rejected_at IS NOT NULL
     AND rejection_read_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION '확인할 수 있는 반려 통보가 없습니다.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.reject_quality_summary_report(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.read_quality_summary_rejection(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_quality_summary_report(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.read_quality_summary_rejection(UUID) TO authenticated;
