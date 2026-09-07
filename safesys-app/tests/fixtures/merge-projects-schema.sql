-- 프로젝트 병합 SQL 회귀 테스트용 최소 스키마. 운영 DB 구조(projects + FK 자식 27개 + 간접 자식)를 PGlite에 재현한다.

-- 마이그레이션의 GRANT/REVOKE 대상이 되는 Supabase 기본 역할.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;

CREATE TABLE user_profiles (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE,
  full_name TEXT,
  company_name TEXT,
  role TEXT NOT NULL
);

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_name TEXT NOT NULL,
  managing_hq TEXT NOT NULL,
  managing_branch TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES user_profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  site_address TEXT,
  site_address_detail TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  is_active JSONB NOT NULL DEFAULT jsonb_build_object('q1', true, 'q2', true, 'q3', true, 'q4', true, 'completed', false),
  total_budget TEXT,
  current_year_budget TEXT,
  supervisor_position TEXT,
  supervisor_name TEXT,
  actual_work_address TEXT,
  construction_law_safety_plan BOOLEAN DEFAULT false,
  industrial_law_safety_ledger BOOLEAN DEFAULT false,
  disaster_prevention_target BOOLEAN DEFAULT false,
  project_category TEXT,
  cctv_rtsp_url TEXT,
  display_order INTEGER,
  supervisor_phone TEXT,
  client_telegram_id TEXT,
  contractor_telegram_id TEXT,
  privacy_manager_name TEXT,
  privacy_manager_position TEXT,
  privacy_manager_email TEXT,
  privacy_manager_phone TEXT,
  construction_start_date DATE,
  construction_end_date DATE,
  business_card_pdf_url TEXT,
  construction_schedule JSONB,
  g2b_cntrct_no TEXT,
  g2b_ntce_no TEXT,
  g2b_corp_nm TEXT,
  g2b_tot_amt BIGINT,
  g2b_thtm_amt BIGINT,
  representative_contract_id UUID,
  client_app_code TEXT,
  contractor_app_code TEXT,
  risk_business_type TEXT,
  CONSTRAINT projects_hq_branch_name_unique UNIQUE (managing_hq, managing_branch, project_name)
);

-- FK 자식 1: ai_usage_logs만 ON DELETE SET NULL이다.
CREATE TABLE ai_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  feature TEXT
);

-- FK 자식 2~11: 단순 CASCADE 자식.
CREATE TABLE corrective_action_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  memo TEXT
);
CREATE TABLE headquarters_inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  memo TEXT
);
CREATE TABLE heat_wave_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  memo TEXT
);
CREATE TABLE inspection_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  memo TEXT
);
CREATE TABLE inspection_visit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  memo TEXT
);
CREATE TABLE legal_compliance_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  memo TEXT
);
CREATE TABLE manager_inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  memo TEXT
);
CREATE TABLE new_worker_orientations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  memo TEXT
);
CREATE TABLE project_accidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  memo TEXT
);
CREATE TABLE ptw_permits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  signatures JSONB
);

-- FK 자식 12: 자재와 간접 자식(자재수불부).
CREATE TABLE materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT
);
CREATE TABLE material_ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID REFERENCES materials(id) ON DELETE CASCADE,
  supervisor_confirm TEXT,
  inspection_photos JSONB
);

-- FK 자식 13: 계약(대표계약 참조 대상).
CREATE TABLE project_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  cntrct_no TEXT,
  corp_nm TEXT
);
ALTER TABLE projects
  ADD CONSTRAINT projects_representative_contract_id_fkey
  FOREIGN KEY (representative_contract_id) REFERENCES project_contracts(id) ON DELETE SET NULL;

-- FK 자식 14: 공유자.
CREATE TABLE project_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  shared_with UUID REFERENCES user_profiles(id),
  shared_by UUID REFERENCES user_profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (project_id, shared_with)
);

-- FK 자식 15: 품질 월간보고서(연·월 유니크).
CREATE TABLE quality_monthly_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  report_year INTEGER,
  report_month INTEGER,
  author_name TEXT,
  report_rows JSONB,
  UNIQUE (project_id, report_year, report_month)
);

-- FK 자식 16~20.
CREATE TABLE quality_summary_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  memo TEXT
);
CREATE TABLE quality_test_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  memo TEXT
);
CREATE TABLE quality_verification_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  supervisor_signature TEXT
);
CREATE TABLE risk_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  memo TEXT
);
CREATE TABLE safe_document_inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  memo TEXT
);

-- FK 자식 21: 정기점검과 간접 자식(결과·사진).
CREATE TABLE safety_inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  inspection_type TEXT,
  signatures JSONB
);
CREATE TABLE safety_inspection_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id UUID REFERENCES safety_inspections(id) ON DELETE CASCADE,
  findings TEXT,
  photo_url TEXT,
  after_photo_url TEXT
);
CREATE TABLE safety_inspection_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id UUID REFERENCES safety_inspections(id) ON DELETE CASCADE,
  photo_url TEXT
);

-- FK 자식 22~23: TBM(프로젝트명·본부·지사 비정규화 컬럼 포함).
CREATE TABLE tbm_safety_inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  project_name VARCHAR,
  signature TEXT
);
CREATE TABLE tbm_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  project_name TEXT,
  headquarters TEXT,
  branch TEXT,
  meeting_date DATE,
  signature_url TEXT
);
CREATE TABLE tbm_worker_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tbm_submission_id UUID REFERENCES tbm_submissions(id) ON DELETE CASCADE,
  worker_name TEXT,
  signature TEXT
);

-- FK 자식 24: 작업일보(날짜 유니크).
CREATE TABLE work_daily_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  report_date DATE,
  today_work TEXT,
  UNIQUE (project_id, report_date)
);

-- FK 자식 25~27.
CREATE TABLE work_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  memo TEXT
);
CREATE TABLE worker_registration_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  token TEXT
);
CREATE TABLE workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT,
  signature TEXT
);
