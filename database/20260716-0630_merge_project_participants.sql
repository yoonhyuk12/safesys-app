-- 프로젝트 병합 시 발주청을 제외한 공유자와 흡수될 프로젝트 소유자의 접근 권한을 보존한다.

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
  v_added_source_owner_share INT;
  v_src_owner UUID;
  v_tgt_owner UUID;
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

  SELECT project_name, managing_hq, managing_branch, created_by
    INTO v_src_name, v_src_hq, v_src_branch, v_src_owner
    FROM projects WHERE id = p_source;

  SELECT project_name, managing_hq, managing_branch, created_by
    INTO v_tgt_name, v_tgt_hq, v_tgt_branch, v_tgt_owner
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
     AND (
       s.shared_with = v_tgt_owner
       OR EXISTS (
         SELECT 1 FROM project_shares t
          WHERE t.project_id = p_target AND t.shared_with = s.shared_with
       )
       OR EXISTS (
         SELECT 1 FROM user_profiles shared_profile
          WHERE shared_profile.id = s.shared_with
            AND shared_profile.role = '발주청'
       )
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
  UPDATE project_shares AS ps
     SET project_id = p_target,
         shared_by = tgt.created_by
    FROM projects AS tgt
   WHERE ps.project_id = p_source
     AND tgt.id = p_target;

  INSERT INTO project_shares (project_id, shared_with, shared_by)
  SELECT p_target, v_src_owner, v_tgt_owner
   WHERE v_src_owner IS NOT NULL
     AND v_tgt_owner IS NOT NULL
     AND v_src_owner <> v_tgt_owner
     AND EXISTS (
       SELECT 1 FROM user_profiles owner_profile
        WHERE owner_profile.id = v_src_owner
          AND owner_profile.role <> '발주청'
     )
  ON CONFLICT (project_id, shared_with) DO NOTHING;
  GET DIAGNOSTICS v_added_source_owner_share = ROW_COUNT;

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

  UPDATE projects AS tgt
     SET construction_start_date = COALESCE(tgt.construction_start_date, src.construction_start_date),
         construction_end_date = COALESCE(tgt.construction_end_date, src.construction_end_date),
         project_category = CASE
           WHEN (tgt.project_category IS NULL OR BTRIM(tgt.project_category) = '')
             AND src.project_category IS NOT NULL AND BTRIM(src.project_category) <> ''
           THEN src.project_category ELSE tgt.project_category END,
         total_budget = CASE
           WHEN (tgt.total_budget IS NULL OR BTRIM(tgt.total_budget::TEXT) = '')
             AND src.total_budget IS NOT NULL AND BTRIM(src.total_budget::TEXT) <> ''
           THEN src.total_budget ELSE tgt.total_budget END,
         current_year_budget = CASE
           WHEN (tgt.current_year_budget IS NULL OR BTRIM(tgt.current_year_budget::TEXT) = '')
             AND src.current_year_budget IS NOT NULL AND BTRIM(src.current_year_budget::TEXT) <> ''
           THEN src.current_year_budget ELSE tgt.current_year_budget END,
         supervisor_position = CASE
           WHEN (tgt.supervisor_position IS NULL OR BTRIM(tgt.supervisor_position) = '')
             AND src.supervisor_position IS NOT NULL AND BTRIM(src.supervisor_position) <> ''
           THEN src.supervisor_position ELSE tgt.supervisor_position END,
         supervisor_name = CASE
           WHEN (tgt.supervisor_name IS NULL OR BTRIM(tgt.supervisor_name) = '')
             AND src.supervisor_name IS NOT NULL AND BTRIM(src.supervisor_name) <> ''
           THEN src.supervisor_name ELSE tgt.supervisor_name END,
         supervisor_phone = CASE
           WHEN (tgt.supervisor_phone IS NULL OR BTRIM(tgt.supervisor_phone) = '')
             AND src.supervisor_phone IS NOT NULL AND BTRIM(src.supervisor_phone) <> ''
           THEN src.supervisor_phone ELSE tgt.supervisor_phone END,
         actual_work_address = CASE
           WHEN (tgt.actual_work_address IS NULL OR BTRIM(tgt.actual_work_address) = '')
             AND src.actual_work_address IS NOT NULL AND BTRIM(src.actual_work_address) <> ''
           THEN src.actual_work_address ELSE tgt.actual_work_address END,
         construction_law_safety_plan = CASE
           WHEN src.construction_law_safety_plan IS TRUE AND tgt.construction_law_safety_plan IS NOT TRUE
           THEN TRUE ELSE tgt.construction_law_safety_plan END,
         industrial_law_safety_ledger = CASE
           WHEN src.industrial_law_safety_ledger IS TRUE AND tgt.industrial_law_safety_ledger IS NOT TRUE
           THEN TRUE ELSE tgt.industrial_law_safety_ledger END,
         disaster_prevention_target = CASE
           WHEN src.disaster_prevention_target IS TRUE AND tgt.disaster_prevention_target IS NOT TRUE
           THEN TRUE ELSE tgt.disaster_prevention_target END,
         business_card_pdf_url = CASE
           WHEN (tgt.business_card_pdf_url IS NULL OR BTRIM(tgt.business_card_pdf_url) = '')
             AND src.business_card_pdf_url IS NOT NULL AND BTRIM(src.business_card_pdf_url) <> ''
           THEN src.business_card_pdf_url ELSE tgt.business_card_pdf_url END,
         client_telegram_id = CASE
           WHEN (tgt.client_telegram_id IS NULL OR BTRIM(tgt.client_telegram_id) = '')
             AND src.client_telegram_id IS NOT NULL AND BTRIM(src.client_telegram_id) <> ''
           THEN src.client_telegram_id ELSE tgt.client_telegram_id END,
         contractor_telegram_id = CASE
           WHEN (tgt.contractor_telegram_id IS NULL OR BTRIM(tgt.contractor_telegram_id) = '')
             AND src.contractor_telegram_id IS NOT NULL AND BTRIM(src.contractor_telegram_id) <> ''
           THEN src.contractor_telegram_id ELSE tgt.contractor_telegram_id END,
         privacy_manager_name = CASE
           WHEN (tgt.privacy_manager_name IS NULL OR BTRIM(tgt.privacy_manager_name) = '')
             AND src.privacy_manager_name IS NOT NULL AND BTRIM(src.privacy_manager_name) <> ''
           THEN src.privacy_manager_name ELSE tgt.privacy_manager_name END,
         privacy_manager_position = CASE
           WHEN (tgt.privacy_manager_position IS NULL OR BTRIM(tgt.privacy_manager_position) = '')
             AND src.privacy_manager_position IS NOT NULL AND BTRIM(src.privacy_manager_position) <> ''
           THEN src.privacy_manager_position ELSE tgt.privacy_manager_position END,
         privacy_manager_email = CASE
           WHEN (tgt.privacy_manager_email IS NULL OR BTRIM(tgt.privacy_manager_email) = '')
             AND src.privacy_manager_email IS NOT NULL AND BTRIM(src.privacy_manager_email) <> ''
           THEN src.privacy_manager_email ELSE tgt.privacy_manager_email END,
         privacy_manager_phone = CASE
           WHEN (tgt.privacy_manager_phone IS NULL OR BTRIM(tgt.privacy_manager_phone) = '')
             AND src.privacy_manager_phone IS NOT NULL AND BTRIM(src.privacy_manager_phone) <> ''
           THEN src.privacy_manager_phone ELSE tgt.privacy_manager_phone END,
         is_active = CASE
           WHEN src.is_active IS NULL OR src.is_active = 'null'::JSONB
           THEN tgt.is_active
           WHEN tgt.is_active IS NULL
             OR tgt.is_active = 'null'::JSONB
             OR tgt.is_active = 'false'::JSONB
           THEN src.is_active
           WHEN jsonb_typeof(tgt.is_active) = 'object'
             AND NOT (
               COALESCE(tgt.is_active -> 'q1', 'false'::JSONB) = 'true'::JSONB
               OR COALESCE(tgt.is_active -> 'q2', 'false'::JSONB) = 'true'::JSONB
               OR COALESCE(tgt.is_active -> 'q3', 'false'::JSONB) = 'true'::JSONB
               OR COALESCE(tgt.is_active -> 'q4', 'false'::JSONB) = 'true'::JSONB
               OR COALESCE(tgt.is_active -> 'completed', 'false'::JSONB) = 'true'::JSONB
             )
           THEN src.is_active
           ELSE tgt.is_active
         END
    FROM projects AS src
   WHERE tgt.id = p_target
     AND src.id = p_source;

  DELETE FROM projects WHERE id = p_source;

  RETURN jsonb_build_object(
    'dropped_work_daily_reports', v_dropped_reports,
    'dropped_project_shares', v_dropped_shares,
    'dropped_quality_monthly_reports', v_dropped_quality_monthly,
    'moved_legacy_tbm', v_moved_legacy_tbm,
    'added_source_owner_share', v_added_source_owner_share
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.merge_projects(UUID, UUID) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_projects(UUID, UUID) TO service_role;

COMMENT ON FUNCTION public.merge_projects(UUID, UUID) IS
  'source 프로젝트의 자식 행 24종과 비발주청 공유자를 target으로 이전하고, 비발주청 source 소유자를 target 공유자로 보존하며, 빈 선택사항과 분기·준공 상태를 보충한 후 source를 삭제한다. 실제 FK 자식 테이블 수와 다르면 유실 방지를 위해 중단하며 service-role에서만 호출한다.';
