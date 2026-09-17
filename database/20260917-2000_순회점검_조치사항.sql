-- 순회점검 지적사항의 조치 결과(조치내용·조치사진·조치일)를 기록하는 컬럼과, 작성자가 아닌 현장 사용자도
-- 조치 칸만 고칠 수 있게 하는 권한을 추가한다.
-- 배경: 지적사항 관리대장(/project/[id]/issue-management)이 순회점검 지적을 함께 모아 보여 주고,
--       시공사가 그 자리에서 조치내용·조치사진을 등록한다. 기존 UPDATE 정책은 작성자(감독) 본인만 허용해
--       시공사가 조치를 남길 수 없었다.
-- 방법: (1) 조치 3개 열을 추가하고 열 단위 UPDATE 권한을 준다.
--       (2) 현장을 볼 수 있는 사용자 전원에게 UPDATE 행 정책을 하나 더 연다.
--       (3) 열 권한은 역할 단위라 정책만으로는 "조치 칸만"을 가릴 수 없으므로, 작성자가 아닌 사용자가
--           점검 내용(점검일·항목·서명·지적사항 등)을 바꾸면 트리거가 거부한다.
-- 적용 순서: 20260917-1700 → 1701 → 1800 → 1900 → 이 파일
-- 적용 방법: Supabase 콘솔 → SQL Editor 에서 아래 전체를 실행

BEGIN;

ALTER TABLE public.patrol_ledger_inspections
  ADD COLUMN IF NOT EXISTS action_text TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS action_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS action_date DATE;

GRANT UPDATE (action_text, action_photo_url, action_date) ON public.patrol_ledger_inspections TO authenticated;

-- 현장을 볼 수 있는 사용자는 조치 칸을 고칠 수 있다. 어느 칸까지인지는 아래 트리거가 정한다.
DROP POLICY IF EXISTS "Project users can update patrol ledger actions" ON public.patrol_ledger_inspections;
CREATE POLICY "Project users can update patrol ledger actions"
  ON public.patrol_ledger_inspections FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = patrol_ledger_inspections.project_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = patrol_ledger_inspections.project_id));

-- 작성자가 아니면 조치 칸(action_*)과 updated_at 외의 변경을 거부한다.
-- service_role·관리 작업(pg_trigger_depth > 1, authenticated 아님)은 그대로 둔다.
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

DROP TRIGGER IF EXISTS patrol_ledger_guard_non_author_update ON public.patrol_ledger_inspections;
CREATE TRIGGER patrol_ledger_guard_non_author_update
  BEFORE UPDATE ON public.patrol_ledger_inspections
  FOR EACH ROW EXECUTE FUNCTION public.patrol_ledger_guard_non_author_update();

COMMENT ON COLUMN public.patrol_ledger_inspections.action_text IS
  '지적사항 관리대장에서 등록한 조치내용. 지적사항이 있는 기록에만 쓴다.';
COMMENT ON COLUMN public.patrol_ledger_inspections.action_photo_url IS
  '조치사진 공개 URL. ''N/A''는 해당없음 표시다(지적사항 관리대장 관례).';
COMMENT ON COLUMN public.patrol_ledger_inspections.action_date IS
  '조치사진을 올린 날. 사진을 지우면 NULL로 돌아간다.';
COMMENT ON FUNCTION public.patrol_ledger_guard_non_author_update() IS
  '작성자가 아닌 현장 사용자의 UPDATE를 조치 칸(action_text·action_photo_url·action_date·updated_at)으로 제한한다.';

COMMIT;
