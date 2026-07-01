-- 품질시험 결과 관리대장 테이블 3종 (실시대장·확인시험 의뢰서·성과총괄표)

-- 1) 품질검사 실시대장 (건설기술 진흥법 시행규칙 별지 제42호서식) — 대장 1행 = 1레코드
CREATE TABLE IF NOT EXISTS quality_test_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  test_date DATE,                                  -- 연월일
  test_category TEXT DEFAULT '',                   -- 시험·검사구분 (확인시험이면 총괄표 ⑤로 집계)
  work_type TEXT DEFAULT '',                       -- 공종 (성과총괄표 집계용 — 원서식에는 없는 보조 필드)
  target_material TEXT DEFAULT '',                 -- 품질검사 대상 재료
  supplier_factory TEXT DEFAULT '',                -- 건설자재·부재를 공급받은 공장
  test_place TEXT DEFAULT '',                      -- 시험·검사 장소
  test_item TEXT DEFAULT '',                       -- 시험·검사 종목
  test_standard TEXT DEFAULT '',                   -- 시험 기준
  test_result TEXT DEFAULT '',                     -- 시험 결과
  result_verdict TEXT DEFAULT '',                  -- 시험 결과 판정 (합격/불합격/재시험)
  quality_engineer_name TEXT DEFAULT '',           -- 품질관리기술인 성명
  quality_engineer_signature TEXT DEFAULT '',      -- 품질관리기술인 서명 (base64)
  supervision_engineer_name TEXT DEFAULT '',       -- 건설사업관리기술인 성명
  supervision_engineer_signature TEXT DEFAULT '',  -- 건설사업관리기술인 서명 (base64)
  note TEXT DEFAULT '',                            -- 비고
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quality_test_records_project ON quality_test_records(project_id);

ALTER TABLE quality_test_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view quality test records"
  ON quality_test_records FOR SELECT USING (true);
CREATE POLICY "Users can insert quality test records"
  ON quality_test_records FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Users can update their quality test records"
  ON quality_test_records FOR UPDATE USING (auth.uid() = created_by);
CREATE POLICY "Users can delete their quality test records"
  ON quality_test_records FOR DELETE USING (auth.uid() = created_by);

-- 2) 확인시험 의뢰서 (公社시험업무지침 별지 제4호서식) — 1건 = 1레코드
CREATE TABLE IF NOT EXISTS quality_verification_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  request_no TEXT DEFAULT '',                      -- 의뢰번호
  request_date DATE,                               -- 의뢰일자
  receiver TEXT DEFAULT '',                        -- 받음
  sender TEXT DEFAULT '',                          -- 보냄
  sender_signature TEXT DEFAULT '',                -- 보냄 서명 (base64)
  reference TEXT DEFAULT '',                       -- 참조
  construction_name TEXT DEFAULT '',               -- 공사명
  client_name TEXT DEFAULT '',                     -- 발주자
  contractor_name TEXT DEFAULT '',                 -- 시공자
  target_work TEXT DEFAULT '',                     -- 대상공종, 물량
  test_items TEXT DEFAULT '',                      -- 확인시험 항목
  planned_date DATE,                               -- 확인시험예정일
  purpose TEXT DEFAULT '',                         -- 시험목적
  etc_note TEXT DEFAULT '',                        -- 기타사항
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quality_verification_requests_project ON quality_verification_requests(project_id);

ALTER TABLE quality_verification_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view quality verification requests"
  ON quality_verification_requests FOR SELECT USING (true);
CREATE POLICY "Users can insert quality verification requests"
  ON quality_verification_requests FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Users can update their quality verification requests"
  ON quality_verification_requests FOR UPDATE USING (auth.uid() = created_by);
CREATE POLICY "Users can delete their quality verification requests"
  ON quality_verification_requests FOR DELETE USING (auth.uid() = created_by);

-- 3) 품질검사 성과 총괄표 (별지 2호) — 1건 = 1레코드, 표 행은 JSONB
CREATE TABLE IF NOT EXISTS quality_summary_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  report_date DATE,                                -- 작성일시
  construction_period TEXT DEFAULT '',             -- 공사기간
  progress_rate TEXT DEFAULT '',                   -- 공정 (%)
  settlement_rows JSONB DEFAULT '[]'::jsonb,       -- ③ 기성 또는 정산량 행 [{work_type, plan_qty, prev_qty, current_qty, note}]
  quality_rows JSONB DEFAULT '[]'::jsonb,          -- ④ 품질검사 실적 행 [{work_type, test_item, plan, done, pass, fail, retest, note}]
  verification_rows JSONB DEFAULT '[]'::jsonb,     -- ⑤ 확인시험 실적 행 [{work_type, test_item, verification_type, plan, done, pass, fail, retest, note}]
  writer_affiliation TEXT DEFAULT '',              -- 작성자(건설업자) 소속
  writer_position TEXT DEFAULT '',
  writer_name TEXT DEFAULT '',
  writer_signature TEXT DEFAULT '',
  reviewer_affiliation TEXT DEFAULT '',            -- 검토자(품질시험업무담당자) 소속
  reviewer_position TEXT DEFAULT '',
  reviewer_name TEXT DEFAULT '',
  reviewer_signature TEXT DEFAULT '',
  confirmer_affiliation TEXT DEFAULT '',           -- 확인자(감독소장) 소속
  confirmer_position TEXT DEFAULT '',
  confirmer_name TEXT DEFAULT '',
  confirmer_signature TEXT DEFAULT '',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quality_summary_reports_project ON quality_summary_reports(project_id);

ALTER TABLE quality_summary_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view quality summary reports"
  ON quality_summary_reports FOR SELECT USING (true);
CREATE POLICY "Users can insert quality summary reports"
  ON quality_summary_reports FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Users can update their quality summary reports"
  ON quality_summary_reports FOR UPDATE USING (auth.uid() = created_by);
CREATE POLICY "Users can delete their quality summary reports"
  ON quality_summary_reports FOR DELETE USING (auth.uid() = created_by);
