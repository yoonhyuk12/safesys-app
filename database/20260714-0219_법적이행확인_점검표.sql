-- 법적이행 확인(안전활동 점검표) 저장 테이블 + merge_projects 자식 테이블 24개로 갱신

CREATE TABLE public.legal_compliance_checks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  check_year INT NOT NULL,
  check_quarter INT NOT NULL CHECK (check_quarter BETWEEN 1 AND 4),
  form_data JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_legal_compliance_checks_project_id
  ON public.legal_compliance_checks(project_id);

-- RLS (project_contracts 정책 스타일과 동일)
ALTER TABLE public.legal_compliance_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view legal compliance checks"
  ON public.legal_compliance_checks FOR SELECT USING (true);

CREATE POLICY "Users can insert legal compliance checks"
  ON public.legal_compliance_checks FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their legal compliance checks"
  ON public.legal_compliance_checks FOR UPDATE USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their legal compliance checks"
  ON public.legal_compliance_checks FOR DELETE USING (auth.uid() = created_by);

-- updated_at 자동 갱신 트리거 (work_plans 마이그레이션 관례와 동일)
CREATE OR REPLACE FUNCTION public.update_legal_compliance_checks_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER legal_compliance_checks_updated_at_trigger
  BEFORE UPDATE ON public.legal_compliance_checks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_legal_compliance_checks_updated_at();

-- merge_projects 갱신: 자식 테이블 24개 (2026-07-14 legal_compliance_checks 추가)
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
  IF v_fk_count <> 24 THEN
    RAISE EXCEPTION 'merge_projects가 아는 자식 테이블(24개)과 실제 FK 테이블 수(%개)가 다릅니다. 함수를 갱신하세요.', v_fk_count;
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
  UPDATE legal_compliance_checks        SET project_id = p_target WHERE project_id = p_source;
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
  'source 프로젝트의 자식 행 24종을 target으로 이전 후 source를 삭제한다. 실제 FK 자식 테이블 수와 다르면 유실 방지를 위해 중단하며 service-role에서만 호출한다.';
