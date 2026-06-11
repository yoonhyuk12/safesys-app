-- 위험공종 작업허가제(PTW) 허가서 테이블
-- 종류: high_risk(위험공종), electrical(정전작업), hot_work(화기작업), confined_space(밀폐공간)
CREATE TABLE ptw_permits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id),

  permit_type TEXT NOT NULL CHECK (permit_type IN ('high_risk', 'electrical', 'hot_work', 'confined_space')),
  permit_date DATE,                    -- 작업(허가) 일자
  work_content TEXT,                   -- 작업내용 (승인대장 목록 표시용)
  applicant_name TEXT,                 -- 신청인/작성자 (승인대장 목록 표시용)
  is_completed BOOLEAN DEFAULT false,  -- 완료여부 (승인대장)

  -- 종류별 입력값 전체 (공사개요, 체크리스트, 농도측정 등)
  form_data JSONB DEFAULT '{}',

  -- 서명: { "writer": {"name":"", "signature":"base64"}, "permitter": {...}, "confirmer": {...}, "applicant": {...}, "watcher": {...} }
  signatures JSONB DEFAULT '{}',

  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ptw_permits_project_id ON ptw_permits(project_id);

-- RLS 활성화
ALTER TABLE ptw_permits ENABLE ROW LEVEL SECURITY;

-- RLS 정책 (new_worker_orientations 패턴과 동일)
CREATE POLICY "Users can view ptw permits"
  ON ptw_permits FOR SELECT USING (true);

CREATE POLICY "Users can insert ptw permits"
  ON ptw_permits FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their ptw permits"
  ON ptw_permits FOR UPDATE USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their ptw permits"
  ON ptw_permits FOR DELETE USING (auth.uid() = created_by);
