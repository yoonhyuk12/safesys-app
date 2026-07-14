-- 품질시험 성과총괄표 반려 권한을 발주청 소속 사용자로 제한한다.

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
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다.';
  END IF;

  SELECT role::TEXT
    INTO v_role
    FROM public.user_profiles
   WHERE id = auth.uid();

  IF v_role IS DISTINCT FROM '발주청' THEN
    RAISE EXCEPTION '성과총괄표 반려 권한이 없습니다.';
  END IF;

  IF NULLIF(BTRIM(p_reason), '') IS NULL THEN
    RAISE EXCEPTION '반려 사유를 입력해주세요.';
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

  IF NOT FOUND THEN
    RAISE EXCEPTION '성과총괄표를 찾을 수 없습니다.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.reject_quality_summary_report(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_quality_summary_report(UUID, TEXT) TO authenticated;
