-- 계약(공사·용역) 현황 서류철: 프로젝트별 나라장터 계약 목록 테이블 + merge_projects 함수 갱신(21→22)

CREATE TABLE project_contracts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id),

  contract_type TEXT NOT NULL DEFAULT '공사' CHECK (contract_type IN ('공사', '용역')),
  cntrct_nm TEXT NOT NULL,           -- 계약명
  unty_cntrct_no TEXT,               -- 통합계약번호 (등록됨 판정 키 1순위)
  cntrct_no TEXT,                    -- 확정계약번호 (신형 계약은 빈 값인 경우 있음)
  corp_nm TEXT,                      -- 계약상대자 (공동도급은 쉼표 연결)
  tot_cntrct_amt BIGINT,             -- 총계약금액(원)
  thtm_cntrct_amt BIGINT,            -- 금차계약금액(원)
  cntrct_date DATE,                  -- 계약체결일자
  cntrct_prd TEXT,                   -- 계약기간 (자유 텍스트, 예: '금차 29일, 총공사 29일')
  start_date DATE,                   -- 착공(공사)/착수(용역)일
  end_date DATE,                     -- 준공(공사)/완수(용역)일
  dminstt_nm TEXT,                   -- 수요기관 (복수면 쉼표 연결)
  cntrct_instt_nm TEXT,              -- 계약기관
  cntrct_info_url TEXT,              -- 나라장터 계약 상세 URL

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_project_contracts_project_id ON project_contracts(project_id);

-- RLS (inspection_visit_logs 패턴과 동일)
ALTER TABLE project_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view project contracts"
  ON project_contracts FOR SELECT USING (true);

CREATE POLICY "Users can insert project contracts"
  ON project_contracts FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their project contracts"
  ON project_contracts FOR UPDATE USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their project contracts"
  ON project_contracts FOR DELETE USING (auth.uid() = created_by);

-- merge_projects 갱신: 자식 테이블 22개 (2026-07-07 project_contracts 추가)
CREATE OR REPLACE FUNCTION public.merge_projects(p_source uuid, p_target uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- 안전장치: projects를 참조하는 FK 테이블 수가 이 함수가 아는 22개와 다르면 병합을 중단한다.
  -- 새 자식 테이블이 추가됐는데 이 함수가 갱신되지 않으면 그 테이블의 행이 조용히 유실되므로,
  -- 유실 대신 명시적 실패를 택한다. (테이블 추가 시 아래 UPDATE 목록과 이 숫자를 함께 갱신할 것)
  select count(distinct conrelid) into v_fk_count
    from pg_constraint
   where confrelid = 'projects'::regclass and contype = 'f';
  if v_fk_count <> 22 then
    raise exception 'merge_projects가 아는 자식 테이블(22개)과 실제 FK 테이블 수(%개)가 다릅니다. 함수를 갱신하세요.', v_fk_count;
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

  -- 22개 자식 테이블 project_id 이전 (기존 21개 + 2026-07-07 project_contracts)
  update corrective_action_issues       set project_id = p_target where project_id = p_source;
  update headquarters_inspections       set project_id = p_target where project_id = p_source;
  update heat_wave_checks               set project_id = p_target where project_id = p_source;
  update inspection_requests            set project_id = p_target where project_id = p_source;
  update inspection_visit_logs          set project_id = p_target where project_id = p_source;
  update manager_inspections            set project_id = p_target where project_id = p_source;
  update materials                      set project_id = p_target where project_id = p_source;
  update new_worker_orientations        set project_id = p_target where project_id = p_source;
  update project_contracts              set project_id = p_target where project_id = p_source;
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
$function$;
