-- 두 프로젝트를 병합하는 함수: source의 자식 행을 모두 target으로 이전 후 source 삭제
-- 호출은 서버(service-role) 경로(POST /api/projects/merge)에서만 한다.
create or replace function merge_projects(p_source uuid, p_target uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dropped_reports  int;
  v_dropped_shares   int;
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

  -- 레거시 TBM 매칭용: source의 이름·본부·지사를 미리 확보(아래 삭제 전에).
  -- 옛 /tbm 제출분(tbm_submissions)은 project_id가 NULL이고 이 텍스트로 화면에 매칭되므로,
  -- 이 값으로 NULL 행을 찾아 함께 이전해야 source 삭제 후에도 사라지지 않는다.
  select project_name, managing_hq, managing_branch
    into v_src_name, v_src_hq, v_src_branch
    from projects where id = p_source;

  -- 표시 일관성: TBM 계열 테이블은 이름·본부·지사를 텍스트로도 갖고 화면·필터가 이 텍스트를
  -- 쓰므로, 이전되는 행의 텍스트를 target(합산처) 값으로 함께 덮어써야 한다.
  select project_name, managing_hq, managing_branch
    into v_tgt_name, v_tgt_hq, v_tgt_branch
    from projects where id = p_target;

  -- 유니크 충돌 회피: target에 이미 같은 키가 있으면 source 행을 먼저 제거(target 우선).
  -- 이때 삭제된 source 행은 "합쳐지지 않고 폐기"되므로 건수를 집계해 반환·로깅한다.
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

  -- 15개 자식 테이블 project_id 이전
  -- (TBM 계열 2개는 비정규화된 이름·본부·지사 텍스트도 target 값으로 동기화)
  update headquarters_inspections   set project_id = p_target where project_id = p_source;
  update heat_wave_checks           set project_id = p_target where project_id = p_source;
  update inspection_requests        set project_id = p_target where project_id = p_source;
  update manager_inspections        set project_id = p_target where project_id = p_source;
  update materials                  set project_id = p_target where project_id = p_source;
  update new_worker_orientations    set project_id = p_target where project_id = p_source;
  update project_shares             set project_id = p_target where project_id = p_source;
  update ptw_permits                set project_id = p_target where project_id = p_source;
  update safe_document_inspections  set project_id = p_target where project_id = p_source;
  update safety_inspections         set project_id = p_target where project_id = p_source;
  update tbm_safety_inspections     set project_id = p_target, project_name = v_tgt_name
   where project_id = p_source;
  update tbm_submissions            set project_id = p_target, project_name = v_tgt_name,
                                        headquarters = v_tgt_hq, branch = v_tgt_branch
   where project_id = p_source;
  update work_daily_reports         set project_id = p_target where project_id = p_source;
  update worker_registration_tokens set project_id = p_target where project_id = p_source;
  update workers                    set project_id = p_target where project_id = p_source;

  -- 레거시 TBM(/tbm 제출분): project_id가 NULL이라 위 UPDATE에 안 잡히지만, source의
  -- 이름·본부·지사로 화면에 매칭되던 제출분도 target으로 이전한다.
  -- (미이전 시 source 삭제와 함께 매칭 프로젝트가 사라져 화면에서 보이지 않게 됨)
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

  -- 폐기된 충돌 행 건수 + 이전된 레거시 TBM 건수 요약 반환
  return jsonb_build_object(
    'dropped_work_daily_reports', v_dropped_reports,
    'dropped_project_shares', v_dropped_shares,
    'moved_legacy_tbm', v_moved_legacy_tbm
  );
end;
$$;

-- 클라이언트(anon·authenticated) 직접 호출 차단.
-- 주의: Postgres에서 함수 EXECUTE는 기본적으로 PUBLIC에 부여되므로 from public revoke 시
-- 모든 롤이 잃을 수 있다. 단, 이 프로젝트의 Supabase는 새 함수에 service_role EXECUTE를
-- "명시적으로" 부여(pg_default_acl)하므로 revoke 후에도 service_role은 호출 가능하지만,
-- 그 암묵적 전제에 기대지 않도록 service_role 권한을 명시적으로 재부여한다.
revoke execute on function merge_projects(uuid, uuid) from public, anon, authenticated;
grant  execute on function merge_projects(uuid, uuid) to service_role;

comment on function merge_projects(uuid, uuid) is
  'source 프로젝트의 자식 행 15종을 target으로 이전 후 source를 삭제(병합). TBM 계열(tbm_submissions·tbm_safety_inspections)의 이름·본부·지사 텍스트도 target 값으로 동기화. 유니크 충돌(work_daily_reports·project_shares)은 target 우선으로 source 중복 행을 폐기하고 그 건수를 jsonb로 반환. 서버(service-role)에서만 호출.';
