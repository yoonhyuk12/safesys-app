-- 전경사진과 함께 쓰는 기타사항을 지적사항과 분리해 저장한다.
BEGIN;

ALTER TABLE public.patrol_ledger_inspections
  ADD COLUMN IF NOT EXISTS other_text TEXT NOT NULL DEFAULT '';

ALTER TABLE public.patrol_ledger_inspections
  DROP CONSTRAINT IF EXISTS patrol_ledger_inspections_finding_has_no_other;
ALTER TABLE public.patrol_ledger_inspections
  ADD CONSTRAINT patrol_ledger_inspections_finding_has_no_other
  CHECK (finding_photo_kind = 'overview' OR BTRIM(other_text) = '');

GRANT UPDATE (other_text) ON public.patrol_ledger_inspections TO authenticated;

CREATE OR REPLACE FUNCTION public.patrol_ledger_guard_non_author_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF current_user = 'authenticated'
     AND pg_trigger_depth() = 1
     AND (OLD.created_by IS NULL OR OLD.created_by IS DISTINCT FROM auth.uid())
     AND (
       NEW.project_id IS DISTINCT FROM OLD.project_id
       OR NEW.inspection_date IS DISTINCT FROM OLD.inspection_date
       OR NEW.contractor_name IS DISTINCT FROM OLD.contractor_name
       OR NEW.district_name IS DISTINCT FROM OLD.district_name
       OR NEW.inspector_affiliation IS DISTINCT FROM OLD.inspector_affiliation
       OR NEW.inspector_position IS DISTINCT FROM OLD.inspector_position
       OR NEW.inspector_name IS DISTINCT FROM OLD.inspector_name
       OR NEW.signature IS DISTINCT FROM OLD.signature
       OR NEW.tbm_work_summary IS DISTINCT FROM OLD.tbm_work_summary
       OR NEW.items IS DISTINCT FROM OLD.items
       OR NEW.finding_text IS DISTINCT FROM OLD.finding_text
       OR NEW.other_text IS DISTINCT FROM OLD.other_text
       OR NEW.finding_photo_url IS DISTINCT FROM OLD.finding_photo_url
       OR NEW.finding_photo_kind IS DISTINCT FROM OLD.finding_photo_kind
       OR NEW.theme IS DISTINCT FROM OLD.theme
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
     ) THEN
    RAISE EXCEPTION '순회점검 내용은 작성자만 수정할 수 있습니다. 조치내용·조치사진·조치일만 고칠 수 있습니다.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON COLUMN public.patrol_ledger_inspections.other_text IS
  '전경사진과 함께 기록하는 기타사항. 지적사항 및 조치 대기 건수에는 포함하지 않는다.';

COMMIT;
