-- AI 작업계획서 4종의 데이터·지도 이미지 저장소와 프로젝트 병합 처리를 추가하는 마이그레이션

CREATE TABLE public.work_plans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  plan_types TEXT[] NOT NULL CHECK (
    cardinality(plan_types) > 0
    AND plan_types <@ ARRAY['loading', 'construction', 'electric', 'heavy']::TEXT[]
  ),
  title TEXT NOT NULL,
  work_start_date DATE,
  work_end_date DATE,
  form_data JSONB NOT NULL DEFAULT '{}'::JSONB,
  map_drawing JSONB,
  map_image_url TEXT,
  site_photo_urls TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_work_plans_project_created_at
  ON public.work_plans(project_id, created_at DESC);
CREATE INDEX idx_work_plans_plan_types
  ON public.work_plans USING GIN(plan_types);

ALTER TABLE public.work_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view work plans"
  ON public.work_plans FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can insert work plans"
  ON public.work_plans FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

-- 한 등록건에 여러 서식을 함께 작성하므로 로그인 사용자의 공동 수정·삭제를 허용한다.
CREATE POLICY "Authenticated users can update work plans"
  ON public.work_plans FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete work plans"
  ON public.work_plans FOR DELETE TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE OR REPLACE FUNCTION public.update_work_plans_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER work_plans_updated_at_trigger
  BEFORE UPDATE ON public.work_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.update_work_plans_updated_at();

-- 지도 합성 이미지와 현장사진을 저장하는 공개 버킷
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'work-plans',
  'work-plans',
  true,
  52428800,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "work_plans_storage_select" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'work-plans');

CREATE POLICY "work_plans_storage_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'work-plans' AND auth.role() = 'authenticated');

CREATE POLICY "work_plans_storage_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'work-plans' AND auth.role() = 'authenticated')
  WITH CHECK (bucket_id = 'work-plans' AND auth.role() = 'authenticated');

CREATE POLICY "work_plans_storage_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'work-plans' AND auth.role() = 'authenticated');

-- merge_projects 갱신: 자식 테이블 23개 (2026-07-11 work_plans 추가)
CREATE OR REPLACE FUNCTION public.merge_projects(p_source UUID, p_target UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fk_count INT;
  v_dropped_reports INT;
  v_dropped_shares INT;
  v_dropped_quality_monthly INT;
  v_moved_legacy_tbm INT;
  v_src_name TEXT;
  v_src_hq TEXT;
  v_src_branch TEXT;
  v_tgt_name TEXT;
  v_tgt_hq TEXT;
  v_tgt_branch TEXT;
BEGIN
  IF p_source = p_target THEN
    RAISE EXCEPTION '대상과 합산처가 같습니다';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM projects WHERE id = p_source) THEN
    RAISE EXCEPTION 'source 프로젝트가 없습니다';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM projects WHERE id = p_target) THEN
    RAISE EXCEPTION 'target 프로젝트가 없습니다';
  END IF;

  -- 새 프로젝트 자식 테이블의 병합 누락으로 인한 CASCADE 유실을 막는다.
  SELECT COUNT(DISTINCT conrelid) INTO v_fk_count
    FROM pg_constraint
   WHERE confrelid = 'projects'::regclass AND contype = 'f';
  IF v_fk_count <> 23 THEN
    RAISE EXCEPTION 'merge_projects가 아는 자식 테이블(23개)과 실제 FK 테이블 수(%개)가 다릅니다. 함수를 갱신하세요.', v_fk_count;
  END IF;

  SELECT project_name, managing_hq, managing_branch
    INTO v_src_name, v_src_hq, v_src_branch
    FROM projects WHERE id = p_source;

  SELECT project_name, managing_hq, managing_branch
    INTO v_tgt_name, v_tgt_hq, v_tgt_branch
    FROM projects WHERE id = p_target;

  DELETE FROM work_daily_reports s
   WHERE s.project_id = p_source
     AND EXISTS (
       SELECT 1 FROM work_daily_reports t
        WHERE t.project_id = p_target AND t.report_date = s.report_date
     );
  GET DIAGNOSTICS v_dropped_reports = ROW_COUNT;

  DELETE FROM project_shares s
   WHERE s.project_id = p_source
     AND EXISTS (
       SELECT 1 FROM project_shares t
        WHERE t.project_id = p_target AND t.shared_with = s.shared_with
     );
  GET DIAGNOSTICS v_dropped_shares = ROW_COUNT;

  DELETE FROM quality_monthly_reports s
   WHERE s.project_id = p_source
     AND EXISTS (
       SELECT 1 FROM quality_monthly_reports t
        WHERE t.project_id = p_target
          AND t.report_year = s.report_year
          AND t.report_month = s.report_month
     );
  GET DIAGNOSTICS v_dropped_quality_monthly = ROW_COUNT;

  UPDATE corrective_action_issues       SET project_id = p_target WHERE project_id = p_source;
  UPDATE headquarters_inspections       SET project_id = p_target WHERE project_id = p_source;
  UPDATE heat_wave_checks               SET project_id = p_target WHERE project_id = p_source;
  UPDATE inspection_requests            SET project_id = p_target WHERE project_id = p_source;
  UPDATE inspection_visit_logs          SET project_id = p_target WHERE project_id = p_source;
  UPDATE manager_inspections            SET project_id = p_target WHERE project_id = p_source;
  UPDATE materials                      SET project_id = p_target WHERE project_id = p_source;
  UPDATE new_worker_orientations        SET project_id = p_target WHERE project_id = p_source;
  UPDATE project_contracts              SET project_id = p_target WHERE project_id = p_source;
  UPDATE project_shares                 SET project_id = p_target WHERE project_id = p_source;
  UPDATE ptw_permits                    SET project_id = p_target WHERE project_id = p_source;
  UPDATE quality_monthly_reports        SET project_id = p_target WHERE project_id = p_source;
  UPDATE quality_summary_reports        SET project_id = p_target WHERE project_id = p_source;
  UPDATE quality_test_records           SET project_id = p_target WHERE project_id = p_source;
  UPDATE quality_verification_requests  SET project_id = p_target WHERE project_id = p_source;
  UPDATE safe_document_inspections      SET project_id = p_target WHERE project_id = p_source;
  UPDATE safety_inspections             SET project_id = p_target WHERE project_id = p_source;
  UPDATE tbm_safety_inspections
     SET project_id = p_target, project_name = v_tgt_name
   WHERE project_id = p_source;
  UPDATE tbm_submissions
     SET project_id = p_target,
         project_name = v_tgt_name,
         headquarters = v_tgt_hq,
         branch = v_tgt_branch
   WHERE project_id = p_source;
  UPDATE work_daily_reports             SET project_id = p_target WHERE project_id = p_source;
  UPDATE work_plans                     SET project_id = p_target WHERE project_id = p_source;
  UPDATE worker_registration_tokens     SET project_id = p_target WHERE project_id = p_source;
  UPDATE workers                        SET project_id = p_target WHERE project_id = p_source;

  UPDATE tbm_submissions
     SET project_id = p_target,
         project_name = v_tgt_name,
         headquarters = v_tgt_hq,
         branch = v_tgt_branch
   WHERE project_id IS NULL
     AND project_name = v_src_name
     AND headquarters = v_src_hq
     AND branch = v_src_branch;
  GET DIAGNOSTICS v_moved_legacy_tbm = ROW_COUNT;

  DELETE FROM projects WHERE id = p_source;

  RETURN jsonb_build_object(
    'dropped_work_daily_reports', v_dropped_reports,
    'dropped_project_shares', v_dropped_shares,
    'dropped_quality_monthly_reports', v_dropped_quality_monthly,
    'moved_legacy_tbm', v_moved_legacy_tbm
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.merge_projects(UUID, UUID) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_projects(UUID, UUID) TO service_role;

COMMENT ON FUNCTION public.merge_projects(UUID, UUID) IS
  'source 프로젝트의 자식 행 23종을 target으로 이전 후 source를 삭제한다. 실제 FK 자식 테이블 수와 다르면 유실 방지를 위해 중단하며 service-role에서만 호출한다.';
