-- 신규근로자 현장안내 현황을 서버측에서 집계하는 RPC 함수
-- 목적: workers JSONB에 포함된 서명 base64(약 5MB)를 클라이언트로 전송하지 않고
--       project_id별 (현장안내 건수, 이름이 채워진 작업자 수)만 반환해 응답을 수십 바이트로 축소.
-- 실행 방법: Supabase 웹 콘솔 SQL Editor에서 직접 실행

CREATE OR REPLACE FUNCTION public.orientation_stats(p_project_ids uuid[])
RETURNS TABLE (
  project_id uuid,
  orientation_count bigint,
  worker_count bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    o.project_id,
    COUNT(*)::bigint AS orientation_count,
    COALESCE(SUM((
      SELECT COUNT(*)
      FROM jsonb_array_elements(COALESCE(o.workers, '[]'::jsonb)) AS w
      WHERE btrim(COALESCE(w->>'name', '')) <> ''
    )), 0)::bigint AS worker_count
  FROM public.new_worker_orientations o
  WHERE o.project_id = ANY(p_project_ids)
  GROUP BY o.project_id;
$$;

GRANT EXECUTE ON FUNCTION public.orientation_stats(uuid[]) TO anon, authenticated;
