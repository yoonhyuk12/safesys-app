-- merge_projects 함수 갱신: 2026-06-29 작성 이후 추가된 자식 테이블 5종을 병합 대상에 반영
-- (inspection_visit_logs, quality_monthly_reports, quality_summary_reports,
--  quality_test_records, quality_verification_requests)
-- 미반영 상태로 병합하면 이 테이블들의 source 행이 이전되지 않은 채 source 삭제 시
-- ON DELETE CASCADE로 함께 지워져 데이터가 유실된다 (2026-07-06 pg_constraint 대조로 확인).
create or replace function merge_projects(p_source uuid, p_target uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fk_count int;
  v_dropped_reports  int;
  v_dropped_shares   int;
  v_dropped_quality_monthly int;
  v_moved_legacy_tbm int;
  v_src_name   text;
  v_src_hq     text;
  v_src_branch text;
  v_tgt_name   text;
  v_tgt_hq     text;
  v_tgt_branch text;
begin
  if p_source = p_target then
    raise exception '대상과 합산처가 같습니다';
  end if;
  if not exists (select 1 from projects where id = p_source) then
    raise exception 'source 프로젝트가 없습니다';
  end if;
  if not exists (select 1 from projects where id = p_target) then
    raise exception 'target 프로젝트가 없습니다';
  end if;

  -- 안전장치: projects를 참조하는 FK 테이블 수가 이 함수가 아는 20개와 다르면 병합을 중단한다.
  -- 새 자식 테이블이 추가됐는데 이 함수가 갱신되지 않으면 그 테이블의 행이 조용히 유실되므로,
  -- 유실 대신 명시적 실패를 택한다. (테이블 추가 시 아래 UPDATE 목록과 이 숫자를 함께 갱신할 것)
  select count(distinct conrelid) into v_fk_count
    from pg_constraint
   where confrelid = 'projects'::regclass and contype = 'f';
  if v_fk_count <> 20 then
    raise exception 'merge_projects가 아는 자식 테이블(20개)과 실제 FK 테이블 수(%개)가 다릅니다. 함수를 갱신하세요.', v_fk_count;
  end if;

  -- 레거시 TBM 매칭용: source의 이름·본부·지사를 미리 확보(아래 삭제 전에).
  select project_name, managing_hq, managing_branch
    into v_src_name, v_src_hq, v_src_branch
    from projects where id = p_source;

  -- 표시 일관성: TBM 계열 테이블의 비정규화 텍스트는 target 값으로 덮어쓴다.
  select project_name, managing_hq, managing_branch
    into v_tgt_name, v_tgt_hq, v_tgt_branch
    from projects where id = p_target;

  -- 유니크 충돌 회피: target에 이미 같은 키가 있으면 source 행을 먼저 제거(target 우선).
  delete from work_daily_reports s
   where s.project_id = p_source
     and exists (select 1 from work_daily_reports t
                  where t.project_id = p_target and t.report_date = s.report_date);
  get diagnostics v_dropped_reports = row_count;
  delete from project_shares s
   where s.project_id = p_source
     and exists (select 1 from project_shares t
                  where t.project_id = p_target and t.shared_with = s.shared_with);
  get diagnostics v_dropped_shares = row_count;
  -- quality_monthly_reports는 UNIQUE(project_id, report_year, report_month)
  delete from quality_monthly_reports s
   where s.project_id = p_source
     and exists (select 1 from quality_monthly_reports t
                  where t.project_id = p_target
                    and t.report_year = s.report_year
                    and t.report_month = s.report_month);
  get diagnostics v_dropped_quality_monthly = row_count;

  -- 20개 자식 테이블 project_id 이전 (기존 15개 + 2026-07-06 추가 5개)
  update headquarters_inspections       set project_id = p_target where project_id = p_source;
  update heat_wave_checks               set project_id = p_target where project_id = p_source;
  update inspection_requests            set project_id = p_target where project_id = p_source;
  update inspection_visit_logs          set project_id = p_target where project_id = p_source;
  update manager_inspections            set project_id = p_target where project_id = p_source;
  update materials                      set project_id = p_target where project_id = p_source;
  update new_worker_orientations        set project_id = p_target where project_id = p_source;
  update project_shares                 set project_id = p_target where project_id = p_source;
  update ptw_permits                    set project_id = p_target where project_id = p_source;
  update quality_monthly_reports        set project_id = p_target where project_id = p_source;
  update quality_summary_reports        set project_id = p_target where project_id = p_source;
  update quality_test_records           set project_id = p_target where project_id = p_source;
  update quality_verification_requests  set project_id = p_target where project_id = p_source;
  update safe_document_inspections      set project_id = p_target where project_id = p_source;
  update safety_inspections             set project_id = p_target where project_id = p_source;
  update tbm_safety_inspections         set project_id = p_target, project_name = v_tgt_name
   where project_id = p_source;
  update tbm_submissions                set project_id = p_target, project_name = v_tgt_name,
                                            headquarters = v_tgt_hq, branch = v_tgt_branch
   where project_id = p_source;
  update work_daily_reports             set project_id = p_target where project_id = p_source;
  update worker_registration_tokens     set project_id = p_target where project_id = p_source;
  update workers                        set project_id = p_target where project_id = p_source;

  -- 레거시 TBM(/tbm 제출분): project_id가 NULL이라 위 UPDATE에 안 잡히지만, source의
  -- 이름·본부·지사로 화면에 매칭되던 제출분도 target으로 이전한다.
  update tbm_submissions
     set project_id   = p_target,
         project_name = v_tgt_name,
         headquarters = v_tgt_hq,
         branch       = v_tgt_branch
   where project_id is null
     and project_name = v_src_name
     and headquarters = v_src_hq
     and branch       = v_src_branch;
  get diagnostics v_moved_legacy_tbm = row_count;

  -- source 프로젝트 삭제 (자식은 이미 이전됨 → CASCADE로 지워질 자식 없음)
  delete from projects where id = p_source;

  return jsonb_build_object(
    'dropped_work_daily_reports', v_dropped_reports,
    'dropped_project_shares', v_dropped_shares,
    'dropped_quality_monthly_reports', v_dropped_quality_monthly,
    'moved_legacy_tbm', v_moved_legacy_tbm
  );
end;
$$;

revoke execute on function merge_projects(uuid, uuid) from public, anon, authenticated;
grant  execute on function merge_projects(uuid, uuid) to service_role;

comment on function merge_projects(uuid, uuid) is
  'source 프로젝트의 자식 행 20종을 target으로 이전 후 source를 삭제(병합). TBM 계열의 이름·본부·지사 텍스트도 target 값으로 동기화. 유니크 충돌(work_daily_reports·project_shares·quality_monthly_reports)은 target 우선으로 source 중복 행을 폐기하고 그 건수를 jsonb로 반환. 실제 FK 자식 테이블 수(20)와 다르면 유실 방지를 위해 예외 발생. 서버(service-role)에서만 호출.';
