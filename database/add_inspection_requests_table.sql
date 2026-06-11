-- 검사/검측 대장 - 검측요청서 테이블 (별지 제3호 검측대장 / 별지 제4호 검측요청서)
CREATE TABLE inspection_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id),

  -- 검측요청서 (별지 제4호)
  request_no TEXT,                       -- 요청 번호
  request_date DATE,                     -- 요청 일자
  location_and_type TEXT,                -- 위치 및 공종
  inspection_part TEXT,                  -- 검측 부위
  requested_datetime TEXT,               -- 검측 요구 일시
  inspection_items TEXT,                 -- 검측 사항
  field_agent_name TEXT,                 -- 현장대리인
  is_reinspection BOOLEAN DEFAULT false, -- 재검측 여부 ("(재)" 표시)

  -- 검측대장 (별지 제3호) 항목
  work_type TEXT,                        -- 공종
  structure_name TEXT,                   -- 구조물명
  design_spec TEXT,                      -- 설계규격
  unit TEXT,                             -- 단위
  quantity TEXT,                         -- 수량

  -- 검측결과통보 (별지 제4호 하단)
  result_no TEXT,                        -- 통보 번호
  result_date DATE,                      -- 통보 일자
  inspector_name TEXT,                   -- 검측자
  pass_status TEXT DEFAULT '' CHECK (pass_status IN ('', '합격', '불합격')),  -- 합격여부
  result_content TEXT,                   -- 검측결과
  instructions TEXT,                     -- 지시사항
  supervisor_name TEXT,                  -- 공사감독원

  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_inspection_requests_project_id ON inspection_requests(project_id);

-- RLS 활성화
ALTER TABLE inspection_requests ENABLE ROW LEVEL SECURITY;

-- RLS 정책 (ptw_permits 패턴과 동일)
CREATE POLICY "Users can view inspection requests"
  ON inspection_requests FOR SELECT USING (true);

CREATE POLICY "Users can insert inspection requests"
  ON inspection_requests FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their inspection requests"
  ON inspection_requests FOR UPDATE USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their inspection requests"
  ON inspection_requests FOR DELETE USING (auth.uid() = created_by);
