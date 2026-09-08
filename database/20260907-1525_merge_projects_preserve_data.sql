-- 프로젝트 병합에서 작업일보·품질 월간보고서 삭제를 없애고 누락 등록값을 묶음 단위로 보충한다
-- 배경: 기존 merge_projects는 같은 날짜 작업일보와 같은 연월 품질 월간보고서의 source 행을 조용히 삭제했고,
--       공정표·CCTV·상세주소·알림앱 코드·대표계약/나라장터 연계값을 target으로 이전하지 않았다.
-- 변경: 보고서 충돌이 하나라도 있으면 MERGE_REPORT_CONFLICT(P0001)로, source 공정표를 원본 그대로
--       옮길 수 없으면 MERGE_SCHEDULE_CONFLICT(P0001)로 병합 전체를 롤백하고,
--       두 projects 행을 id 순서로 FOR UPDATE 잠근 뒤 DB에서 최종 충돌을 확인한다.
--       미리보기용 읽기 전용 함수 preview_project_merge_v2와, 배포 순서 사고를 막는 버전 명시 래퍼
--       merge_projects_safe_v2를 함께 만든다. 전체를 단일 트랜잭션으로 적용한다.

BEGIN;

-- 빈 시공 예정공정표 판단. NULL·JSON null·빈 객체·빈 배열과, UI가 실제로 저장하는
-- {"items": [], "updatedAt": ...}처럼 공종도 공사관리번호도 없는 객체를 모두 비어 있는 것으로 본다.
CREATE OR REPLACE FUNCTION public.merge_projects_is_blank_schedule(p_value JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT p_value IS NULL
      OR jsonb_typeof(p_value) = 'null'
      OR (jsonb_typeof(p_value) = 'array' AND jsonb_array_length(p_value) = 0)
      OR (
        jsonb_typeof(p_value) = 'object'
        AND (
          p_value -> 'items' IS NULL
          OR (jsonb_typeof(p_value -> 'items') = 'array' AND jsonb_array_length(p_value -> 'items') = 0)
        )
        AND (p_value ->> 'contractNo' IS NULL OR BTRIM(p_value ->> 'contractNo') = '')
      );
$$;

-- target 값이 비어 있을 때만 source 값으로 보충한다. 공백만 있는 문자열도 비어 있는 것으로 본다.
CREATE OR REPLACE FUNCTION public.merge_projects_fill_text(p_target TEXT, p_source TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_target IS NOT NULL AND BTRIM(p_target) <> '' THEN p_target
    WHEN p_source IS NOT NULL AND BTRIM(p_source) <> '' THEN p_source
    ELSE p_target
  END;
$$;

-- 병합 전 확인용 읽기 전용 충돌 집계. 병합 본문도 같은 함수를 써서 미리보기와 실제 판정이 어긋나지 않게 한다.
CREATE OR REPLACE FUNCTION public.preview_project_merge_v2(p_source UUID, p_target UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_work_daily INT;
  v_quality_monthly INT;
  v_schedule_conflict BOOLEAN;
BEGIN
  IF p_source IS NULL OR p_target IS NULL THEN
    RAISE EXCEPTION '대상 또는 합산처 프로젝트 ID가 없습니다';
  END IF;
  IF p_source = p_target THEN
    RAISE EXCEPTION '대상과 합산처가 같습니다';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM projects WHERE id = p_source) THEN
    RAISE EXCEPTION 'source 프로젝트가 없습니다';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM projects WHERE id = p_target) THEN
    RAISE EXCEPTION 'target 프로젝트가 없습니다';
  END IF;

  SELECT COUNT(*)::INT INTO v_work_daily
    FROM work_daily_reports s
   WHERE s.project_id = p_source
     AND EXISTS (
       SELECT 1 FROM work_daily_reports t
        WHERE t.project_id = p_target AND t.report_date = s.report_date
     );

  SELECT COUNT(*)::INT INTO v_quality_monthly
    FROM quality_monthly_reports s
   WHERE s.project_id = p_source
     AND EXISTS (
       SELECT 1 FROM quality_monthly_reports t
        WHERE t.project_id = p_target
          AND t.report_year = s.report_year
          AND t.report_month = s.report_month
     );

  -- source 공정표를 원본 그대로 옮길 수 없는 두 경우를 모두 충돌로 본다.
  --   (1) 두 현장 모두 공정표가 있고 내용이 다르면 한쪽이 반드시 사라진다. 내용이 같으면 잃을 것이 없어 허용한다.
  --   (2) target이 비어 보충하는 경우, 병합 후 공사기간이 source와 달라지면 旬 인덱스의 의미가 바뀐다.
  SELECT NOT public.merge_projects_is_blank_schedule(src.construction_schedule)
     AND CASE
       WHEN NOT public.merge_projects_is_blank_schedule(tgt.construction_schedule)
         THEN src.construction_schedule IS DISTINCT FROM tgt.construction_schedule
       ELSE COALESCE(tgt.construction_start_date, src.construction_start_date) IS DISTINCT FROM src.construction_start_date
         OR COALESCE(tgt.construction_end_date, src.construction_end_date) IS DISTINCT FROM src.construction_end_date
     END
    INTO v_schedule_conflict
    FROM projects src, projects tgt
   WHERE src.id = p_source AND tgt.id = p_target;

  RETURN jsonb_build_object(
    'workDailyReports', v_work_daily,
    'qualityMonthlyReports', v_quality_monthly,
    'scheduleConflict', COALESCE(v_schedule_conflict, FALSE)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.merge_projects(p_source UUID, p_target UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fk_count INT;
  v_conflicts JSONB;
  v_dropped_shares INT;
  v_moved_legacy_tbm INT;
  v_added_source_owner_share INT;
  v_src projects%ROWTYPE;
  v_tgt projects%ROWTYPE;
  v_copy_address BOOLEAN;
  v_copy_address_detail BOOLEAN;
  v_copy_contract BOOLEAN;
  v_copy_schedule BOOLEAN;
BEGIN
  IF p_source IS NULL OR p_target IS NULL THEN
    RAISE EXCEPTION '대상 또는 합산처 프로젝트 ID가 없습니다';
  END IF;
  IF p_source = p_target THEN
    RAISE EXCEPTION '대상과 합산처가 같습니다';
  END IF;

  -- 두 행을 id 순서로 잠가 동시 병합 사이의 교착과 경합을 막는다.
  -- https://www.postgresql.org/docs/current/explicit-locking.html
  PERFORM 1 FROM projects WHERE id IN (p_source, p_target) ORDER BY id FOR UPDATE;

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
  IF v_fk_count <> 27 THEN
    RAISE EXCEPTION 'merge_projects가 아는 자식 테이블(27개)과 실제 FK 테이블 수(%개)가 다릅니다. 함수를 갱신하세요.', v_fk_count;
  END IF;

  -- 보고서 충돌은 폐기하지 않고 병합 전체를 중단한다. 원본 보고서의 날짜·본문을 보존하기 위함이다.
  v_conflicts := public.preview_project_merge_v2(p_source, p_target);

  -- 미리보기 응답에서 키가 빠지면 아래 IF가 NULL이 되어 조용히 통과한다.
  -- 세 필드의 키와 타입을 먼저 확인해 그런 경우 병합 자체를 막는다.
  IF jsonb_typeof(v_conflicts) IS DISTINCT FROM 'object'
     OR jsonb_typeof(v_conflicts -> 'workDailyReports') IS DISTINCT FROM 'number'
     OR jsonb_typeof(v_conflicts -> 'qualityMonthlyReports') IS DISTINCT FROM 'number'
     OR jsonb_typeof(v_conflicts -> 'scheduleConflict') IS DISTINCT FROM 'boolean' THEN
    RAISE EXCEPTION 'preview_project_merge_v2 응답이 {workDailyReports, qualityMonthlyReports, scheduleConflict} 형식이 아니어서 병합을 중단합니다(응답: %)',
      COALESCE(v_conflicts::TEXT, 'NULL');
  END IF;

  IF (v_conflicts ->> 'workDailyReports')::INT > 0
     OR (v_conflicts ->> 'qualityMonthlyReports')::INT > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'MERGE_REPORT_CONFLICT',
      DETAIL = v_conflicts::TEXT;
  END IF;

  -- 두 현장의 공정표가 서로 다르거나, 보충 시 착공·준공일이 달라져 旬 인덱스의 의미가 바뀌면 병합을 중단한다.
  IF (v_conflicts ->> 'scheduleConflict')::BOOLEAN THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'MERGE_SCHEDULE_CONFLICT',
      DETAIL = v_conflicts::TEXT;
  END IF;

  SELECT * INTO v_src FROM projects WHERE id = p_source;
  SELECT * INTO v_tgt FROM projects WHERE id = p_target;

  -- 발주청 공유자는 관할 권한으로 접근하므로 옮기지 않고, target 소유자·기존 공유자와의 중복도 제거한다.
  DELETE FROM project_shares s
   WHERE s.project_id = p_source
     AND (
       s.shared_with = v_tgt.created_by
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

  -- ai_usage_logs는 ON DELETE SET NULL이라 유실은 없지만 프로젝트별 비용 귀속을 유지하려고 함께 이전한다.
  UPDATE ai_usage_logs                  SET project_id = p_target WHERE project_id = p_source;
  UPDATE corrective_action_issues       SET project_id = p_target WHERE project_id = p_source;
  UPDATE headquarters_inspections       SET project_id = p_target WHERE project_id = p_source;
  UPDATE heat_wave_checks               SET project_id = p_target WHERE project_id = p_source;
  UPDATE inspection_requests            SET project_id = p_target WHERE project_id = p_source;
  UPDATE inspection_visit_logs          SET project_id = p_target WHERE project_id = p_source;
  UPDATE legal_compliance_checks        SET project_id = p_target WHERE project_id = p_source;
  UPDATE manager_inspections            SET project_id = p_target WHERE project_id = p_source;
  UPDATE materials                      SET project_id = p_target WHERE project_id = p_source;
  UPDATE new_worker_orientations        SET project_id = p_target WHERE project_id = p_source;
  UPDATE project_accidents              SET project_id = p_target WHERE project_id = p_source;
  UPDATE project_contracts              SET project_id = p_target WHERE project_id = p_source;
  UPDATE project_shares
     SET project_id = p_target,
         shared_by = v_tgt.created_by
   WHERE project_id = p_source;

  INSERT INTO project_shares (project_id, shared_with, shared_by)
  SELECT p_target, v_src.created_by, v_tgt.created_by
   WHERE v_src.created_by IS NOT NULL
     AND v_tgt.created_by IS NOT NULL
     AND v_src.created_by <> v_tgt.created_by
     AND EXISTS (
       SELECT 1 FROM user_profiles owner_profile
        WHERE owner_profile.id = v_src.created_by
          AND owner_profile.role <> '발주청'
     )
  ON CONFLICT (project_id, shared_with) DO NOTHING;
  GET DIAGNOSTICS v_added_source_owner_share = ROW_COUNT;

  UPDATE ptw_permits                    SET project_id = p_target WHERE project_id = p_source;
  UPDATE quality_monthly_reports        SET project_id = p_target WHERE project_id = p_source;
  UPDATE quality_summary_reports        SET project_id = p_target WHERE project_id = p_source;
  UPDATE quality_test_records           SET project_id = p_target WHERE project_id = p_source;
  UPDATE quality_verification_requests  SET project_id = p_target WHERE project_id = p_source;
  UPDATE risk_assessments               SET project_id = p_target WHERE project_id = p_source;
  UPDATE safe_document_inspections      SET project_id = p_target WHERE project_id = p_source;
  UPDATE safety_inspections             SET project_id = p_target WHERE project_id = p_source;
  UPDATE tbm_safety_inspections
     SET project_id = p_target, project_name = v_tgt.project_name
   WHERE project_id = p_source;
  UPDATE tbm_submissions
     SET project_id = p_target,
         project_name = v_tgt.project_name,
         headquarters = v_tgt.managing_hq,
         branch = v_tgt.managing_branch
   WHERE project_id = p_source;
  UPDATE work_daily_reports             SET project_id = p_target WHERE project_id = p_source;
  UPDATE work_plans                     SET project_id = p_target WHERE project_id = p_source;
  UPDATE worker_registration_tokens     SET project_id = p_target WHERE project_id = p_source;
  UPDATE workers                        SET project_id = p_target WHERE project_id = p_source;

  -- project_id가 비어 있는 구버전 TBM 제출은 이름·본부·지사로 찾아 이전한다.
  UPDATE tbm_submissions
     SET project_id = p_target,
         project_name = v_tgt.project_name,
         headquarters = v_tgt.managing_hq,
         branch = v_tgt.managing_branch
   WHERE project_id IS NULL
     AND project_name = v_src.project_name
     AND headquarters = v_src.managing_hq
     AND branch = v_src.managing_branch;
  GET DIAGNOSTICS v_moved_legacy_tbm = ROW_COUNT;

  -- 주소·좌표는 서로 다른 현장을 섞지 않도록 묶음으로 판단한다. target에 하나라도 있으면 target 묶음을 유지한다.
  v_copy_address := (v_tgt.site_address IS NULL OR BTRIM(v_tgt.site_address) = '')
                AND (v_tgt.site_address_detail IS NULL OR BTRIM(v_tgt.site_address_detail) = '')
                AND v_tgt.latitude IS NULL
                AND v_tgt.longitude IS NULL;

  -- 기본주소가 글자까지 같은 같은 현장일 때만 상세주소를 보충한다. 주소가 다르면 타현장 상세주소 혼합을 막는다.
  v_copy_address_detail := NOT v_copy_address
                       AND (v_tgt.site_address_detail IS NULL OR BTRIM(v_tgt.site_address_detail) = '')
                       AND v_src.site_address_detail IS NOT NULL AND BTRIM(v_src.site_address_detail) <> ''
                       AND v_tgt.site_address IS NOT NULL AND BTRIM(v_tgt.site_address) <> ''
                       AND v_src.site_address IS NOT NULL AND BTRIM(v_src.site_address) <> ''
                       AND BTRIM(v_tgt.site_address) = BTRIM(v_src.site_address);

  -- 공정표는 target이 비어 있을 때만 보충한다. 날짜가 어긋나는 경우는 위에서 이미 중단했다.
  v_copy_schedule := public.merge_projects_is_blank_schedule(v_tgt.construction_schedule)
                 AND NOT public.merge_projects_is_blank_schedule(v_src.construction_schedule);

  -- 대표계약과 나라장터 연계값도 묶음이다. target에 계약 식별자나 연계값이 있으면 타계약 혼합을 막으려고 통째로 유지한다.
  v_copy_contract := v_tgt.representative_contract_id IS NULL
                 AND (v_tgt.g2b_cntrct_no IS NULL OR BTRIM(v_tgt.g2b_cntrct_no) = '')
                 AND (v_tgt.g2b_ntce_no IS NULL OR BTRIM(v_tgt.g2b_ntce_no) = '')
                 AND (v_tgt.g2b_corp_nm IS NULL OR BTRIM(v_tgt.g2b_corp_nm) = '')
                 AND v_tgt.g2b_tot_amt IS NULL
                 AND v_tgt.g2b_thtm_amt IS NULL;

  UPDATE projects SET
    construction_start_date = COALESCE(v_tgt.construction_start_date, v_src.construction_start_date),
    construction_end_date = COALESCE(v_tgt.construction_end_date, v_src.construction_end_date),
    project_category = public.merge_projects_fill_text(v_tgt.project_category, v_src.project_category),
    risk_business_type = public.merge_projects_fill_text(v_tgt.risk_business_type, v_src.risk_business_type),
    total_budget = public.merge_projects_fill_text(v_tgt.total_budget, v_src.total_budget),
    current_year_budget = public.merge_projects_fill_text(v_tgt.current_year_budget, v_src.current_year_budget),
    supervisor_position = public.merge_projects_fill_text(v_tgt.supervisor_position, v_src.supervisor_position),
    supervisor_name = public.merge_projects_fill_text(v_tgt.supervisor_name, v_src.supervisor_name),
    supervisor_phone = public.merge_projects_fill_text(v_tgt.supervisor_phone, v_src.supervisor_phone),
    actual_work_address = public.merge_projects_fill_text(v_tgt.actual_work_address, v_src.actual_work_address),
    business_card_pdf_url = public.merge_projects_fill_text(v_tgt.business_card_pdf_url, v_src.business_card_pdf_url),
    client_telegram_id = public.merge_projects_fill_text(v_tgt.client_telegram_id, v_src.client_telegram_id),
    contractor_telegram_id = public.merge_projects_fill_text(v_tgt.contractor_telegram_id, v_src.contractor_telegram_id),
    privacy_manager_name = public.merge_projects_fill_text(v_tgt.privacy_manager_name, v_src.privacy_manager_name),
    privacy_manager_position = public.merge_projects_fill_text(v_tgt.privacy_manager_position, v_src.privacy_manager_position),
    privacy_manager_email = public.merge_projects_fill_text(v_tgt.privacy_manager_email, v_src.privacy_manager_email),
    privacy_manager_phone = public.merge_projects_fill_text(v_tgt.privacy_manager_phone, v_src.privacy_manager_phone),
    cctv_rtsp_url = public.merge_projects_fill_text(v_tgt.cctv_rtsp_url, v_src.cctv_rtsp_url),
    client_app_code = public.merge_projects_fill_text(v_tgt.client_app_code, v_src.client_app_code),
    contractor_app_code = public.merge_projects_fill_text(v_tgt.contractor_app_code, v_src.contractor_app_code),
    construction_law_safety_plan = CASE
      WHEN v_src.construction_law_safety_plan IS TRUE AND v_tgt.construction_law_safety_plan IS NOT TRUE
      THEN TRUE ELSE v_tgt.construction_law_safety_plan END,
    industrial_law_safety_ledger = CASE
      WHEN v_src.industrial_law_safety_ledger IS TRUE AND v_tgt.industrial_law_safety_ledger IS NOT TRUE
      THEN TRUE ELSE v_tgt.industrial_law_safety_ledger END,
    disaster_prevention_target = CASE
      WHEN v_src.disaster_prevention_target IS TRUE AND v_tgt.disaster_prevention_target IS NOT TRUE
      THEN TRUE ELSE v_tgt.disaster_prevention_target END,
    construction_schedule = CASE
      WHEN v_copy_schedule THEN v_src.construction_schedule ELSE v_tgt.construction_schedule END,
    site_address = CASE WHEN v_copy_address THEN v_src.site_address ELSE v_tgt.site_address END,
    site_address_detail = CASE
      WHEN v_copy_address OR v_copy_address_detail THEN v_src.site_address_detail
      ELSE v_tgt.site_address_detail END,
    latitude = CASE WHEN v_copy_address THEN v_src.latitude ELSE v_tgt.latitude END,
    longitude = CASE WHEN v_copy_address THEN v_src.longitude ELSE v_tgt.longitude END,
    representative_contract_id = CASE WHEN v_copy_contract THEN v_src.representative_contract_id ELSE v_tgt.representative_contract_id END,
    g2b_cntrct_no = CASE WHEN v_copy_contract THEN v_src.g2b_cntrct_no ELSE v_tgt.g2b_cntrct_no END,
    g2b_ntce_no = CASE WHEN v_copy_contract THEN v_src.g2b_ntce_no ELSE v_tgt.g2b_ntce_no END,
    g2b_corp_nm = CASE WHEN v_copy_contract THEN v_src.g2b_corp_nm ELSE v_tgt.g2b_corp_nm END,
    g2b_tot_amt = CASE WHEN v_copy_contract THEN v_src.g2b_tot_amt ELSE v_tgt.g2b_tot_amt END,
    g2b_thtm_amt = CASE WHEN v_copy_contract THEN v_src.g2b_thtm_amt ELSE v_tgt.g2b_thtm_amt END,
    is_active = CASE
      WHEN v_src.is_active IS NULL OR v_src.is_active = 'null'::JSONB
      THEN v_tgt.is_active
      WHEN v_tgt.is_active IS NULL
        OR v_tgt.is_active = 'null'::JSONB
        OR v_tgt.is_active = 'false'::JSONB
      THEN v_src.is_active
      WHEN jsonb_typeof(v_tgt.is_active) = 'object'
        AND NOT (
          COALESCE(v_tgt.is_active -> 'q1', 'false'::JSONB) = 'true'::JSONB
          OR COALESCE(v_tgt.is_active -> 'q2', 'false'::JSONB) = 'true'::JSONB
          OR COALESCE(v_tgt.is_active -> 'q3', 'false'::JSONB) = 'true'::JSONB
          OR COALESCE(v_tgt.is_active -> 'q4', 'false'::JSONB) = 'true'::JSONB
          OR COALESCE(v_tgt.is_active -> 'completed', 'false'::JSONB) = 'true'::JSONB
        )
      THEN v_src.is_active
      ELSE v_tgt.is_active
    END
  WHERE id = p_target;

  DELETE FROM projects WHERE id = p_source;

  -- 보고서 폐기 건수는 항상 0이다. 충돌이 있으면 병합 자체가 중단되므로 기존 응답 형태만 유지한다.
  RETURN jsonb_build_object(
    'dropped_work_daily_reports', 0,
    'dropped_quality_monthly_reports', 0,
    'dropped_project_shares', v_dropped_shares,
    'moved_legacy_tbm', v_moved_legacy_tbm,
    'added_source_owner_share', v_added_source_owner_share
  );
END;
$$;

-- 앱이 호출하는 버전 명시 진입점. 이 마이그레이션 적용 전 배포되면 함수 부재로 안전하게 실패한다.
CREATE OR REPLACE FUNCTION public.merge_projects_safe_v2(p_source UUID, p_target UUID)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.merge_projects(p_source, p_target);
$$;

REVOKE EXECUTE ON FUNCTION public.merge_projects_is_blank_schedule(JSONB) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.merge_projects_fill_text(TEXT, TEXT) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.preview_project_merge_v2(UUID, UUID) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.merge_projects(UUID, UUID) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.merge_projects_safe_v2(UUID, UUID) FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.merge_projects_is_blank_schedule(JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.merge_projects_fill_text(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.preview_project_merge_v2(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.merge_projects(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.merge_projects_safe_v2(UUID, UUID) TO service_role;

COMMENT ON FUNCTION public.merge_projects_is_blank_schedule(JSONB) IS
  '시공 예정공정표 JSONB가 비어 있는지 판단한다. NULL·JSON null·빈 배열·빈 객체와, UI가 실제로 저장하는 {"items": [], "updatedAt": ...}처럼 공종(items)도 공사관리번호(contractNo)도 없는 객체를 모두 빈 공정표로 본다. 병합의 공정표 보충·충돌 판정 전용이다.';

COMMENT ON FUNCTION public.merge_projects_fill_text(TEXT, TEXT) IS
  'target 문자열이 비어 있을 때만 source 값으로 보충한다. 병합의 선택값 보충 전용이다.';

COMMENT ON FUNCTION public.preview_project_merge_v2(UUID, UUID) IS
  '병합을 막아야 할 충돌을 {workDailyReports, qualityMonthlyReports, scheduleConflict} 세 필드로 돌려주는 읽기 전용 함수다. 앞의 둘은 같은 날짜 작업일보와 같은 연·월 품질 월간보고서의 겹치는 건수다. scheduleConflict는 source 공정표가 비어 있지 않으면서 (1) target 공정표도 비어 있지 않고 두 JSONB가 서로 다르거나 (2) target 공정표가 비어 보충해야 하는데 병합 후 착공·준공일이 source와 달라지는 경우 참이다. 빈 공정표의 정의는 merge_projects_is_blank_schedule을 따른다. service-role에서만 호출한다.';

COMMENT ON FUNCTION public.merge_projects(UUID, UUID) IS
  'source 프로젝트의 자식 행 27종과 비발주청 공유자를 target으로 이전하고, 비어 있는 선택값과 주소·계약 묶음을 보충한 뒤 source를 삭제한다. 두 프로젝트 행을 id 순서로 잠근 뒤 preview_project_merge_v2로 최종 확인하며, 그 응답이 세 필드 형식이 아니면 판정을 신뢰할 수 없으므로 병합을 중단한다. 작업일보·품질 월간보고서가 하나라도 겹치면 MERGE_REPORT_CONFLICT로, source 공정표를 원본 그대로 옮길 수 없으면 MERGE_SCHEDULE_CONFLICT로 전체를 롤백한다. 실제 FK 자식 테이블 수와 다르면 유실 방지를 위해 중단하며 service-role에서만 호출한다.';

COMMENT ON FUNCTION public.merge_projects_safe_v2(UUID, UUID) IS
  '앱이 호출하는 버전 명시 병합 진입점. 본문은 merge_projects와 동일하며 마이그레이션 미적용 환경에서는 함수 부재로 병합이 안전하게 실패한다.';

COMMIT;
