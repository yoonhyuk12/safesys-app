-- 품질시험 서류의 작성자 변경을 차단해 발주청 수정 권한으로 삭제 권한을 우회하지 못하게 한다.

BEGIN;

CREATE OR REPLACE FUNCTION public.prevent_quality_created_by_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- 직접 수정만 제한하고 관리 작업 및 회원 삭제 시 FK의 SET NULL 처리는 유지한다.
  IF current_user = 'authenticated'
     AND pg_trigger_depth() = 1
     AND NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'QUALITY_CREATED_BY_IMMUTABLE: 작성자는 변경할 수 없습니다.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_quality_created_by_change ON public.quality_summary_reports;
CREATE TRIGGER prevent_quality_created_by_change
  BEFORE UPDATE OF created_by ON public.quality_summary_reports
  FOR EACH ROW EXECUTE FUNCTION public.prevent_quality_created_by_change();

DROP TRIGGER IF EXISTS prevent_quality_created_by_change ON public.quality_test_records;
CREATE TRIGGER prevent_quality_created_by_change
  BEFORE UPDATE OF created_by ON public.quality_test_records
  FOR EACH ROW EXECUTE FUNCTION public.prevent_quality_created_by_change();

DROP TRIGGER IF EXISTS prevent_quality_created_by_change ON public.quality_verification_requests;
CREATE TRIGGER prevent_quality_created_by_change
  BEFORE UPDATE OF created_by ON public.quality_verification_requests
  FOR EACH ROW EXECUTE FUNCTION public.prevent_quality_created_by_change();

COMMIT;
