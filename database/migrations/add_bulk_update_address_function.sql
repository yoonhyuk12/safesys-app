-- 공사중토글 ON 시 TBM 최신주소 일괄 반영 RPC 함수
-- 실행 방법: Supabase 웹 콘솔 SQL Editor에서 직접 실행

CREATE OR REPLACE FUNCTION bulk_update_actual_work_address(hq_division text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tbm_count integer;
  fallback_count integer;
BEGIN
  -- Step 1: TBM 주소가 있는 프로젝트 → 최신 TBM(submitted) 주소로 업데이트
  WITH latest_tbm AS (
    SELECT DISTINCT ON (t.project_id)
      t.project_id,
      CONCAT(t.address, ' ', COALESCE(t.detail_address, '')) as full_address
    FROM tbm_submissions t
    WHERE t.project_id IS NOT NULL
      AND t.address IS NOT NULL
      AND t.address != ''
      AND t.status = 'submitted'
    ORDER BY t.project_id, t.meeting_date DESC, t.submitted_at DESC
  )
  UPDATE projects p
  SET actual_work_address = lt.full_address
  FROM latest_tbm lt
  WHERE p.id = lt.project_id
    AND p.managing_hq = hq_division;

  GET DIAGNOSTICS tbm_count = ROW_COUNT;

  -- Step 2: TBM 주소가 없는 프로젝트 → 기본 주소(site_address)로 폴백
  UPDATE projects p
  SET actual_work_address = CONCAT(p.site_address, ' ', COALESCE(p.site_address_detail, ''))
  WHERE p.managing_hq = hq_division
    AND (p.actual_work_address IS NULL OR p.actual_work_address = '')
    AND p.site_address IS NOT NULL
    AND p.site_address != '';

  GET DIAGNOSTICS fallback_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'tbm_count', tbm_count,
    'fallback_count', fallback_count,
    'total_count', tbm_count + fallback_count
  );
END;
$$;
