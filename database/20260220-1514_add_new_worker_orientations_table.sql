-- 신규근로자 현장안내(1시간 둘러보기) 일지 테이블
CREATE TABLE new_worker_orientations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id),

  -- 기본정보
  orientation_date DATE NOT NULL,
  start_time TEXT,
  end_time TEXT,
  location TEXT,

  -- 신규근로자(멘티) - JSON 배열
  -- [{ "job_type": "직종", "name": "성명" }, ...]
  workers JSONB DEFAULT '[]',

  -- 현장안내자(멘토) - JSON 배열
  -- [{ "affiliation": "소속", "position": "직책", "name": "성명" }, ...]
  mentors JSONB DEFAULT '[]',

  -- 주요공종 - JSON 배열
  -- ["공종1", "공종2", ...]
  main_work_types JSONB DEFAULT '[]',

  -- 현장 내 위험요소 - JSON 배열
  -- ["위험요소1", "위험요소2", ...]
  risk_factors JSONB DEFAULT '[]',

  -- 확인 서명
  -- [{ "name": "성명", "signature": "base64" }, ...]
  mentor_signatures JSONB DEFAULT '[]',
  manager_name TEXT,
  manager_signature TEXT,

  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS 활성화
ALTER TABLE new_worker_orientations ENABLE ROW LEVEL SECURITY;

-- RLS 정책
CREATE POLICY "Users can view orientations for their projects"
  ON new_worker_orientations FOR SELECT USING (true);

CREATE POLICY "Users can insert orientations"
  ON new_worker_orientations FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their orientations"
  ON new_worker_orientations FOR UPDATE USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their orientations"
  ON new_worker_orientations FOR DELETE USING (auth.uid() = created_by);
