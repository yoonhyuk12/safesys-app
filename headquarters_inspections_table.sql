-- Create headquarters_inspections table
CREATE TABLE headquarters_inspections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  inspection_date DATE NOT NULL,
  inspector_name TEXT NOT NULL,
  site_photo_overview TEXT, -- 점검 전경사진 URL
  site_photo_issue1 TEXT,   -- 지적사항 사진1 URL  
  site_photo_issue2 TEXT,   -- 지적사항 사진2 URL
  issue_content1 TEXT,      -- 지적사항 내용1 (필수)
  issue_content2 TEXT,      -- 지적사항 내용2 (선택)
  action_status TEXT DEFAULT 'pending' CHECK (action_status IN ('pending', 'in_progress', 'completed')), -- 조치상태
  form_data JSONB,          -- 체크리스트 등 복잡한 폼 데이터를 JSON으로 저장
  created_by UUID REFERENCES user_profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Enable RLS
ALTER TABLE headquarters_inspections ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view headquarters inspections for their projects" ON headquarters_inspections
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_id
      AND (
        p.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM user_profiles up
          WHERE up.id = auth.uid()
          AND up.role IN ('발주청', '감리단')
        )
      )
    )
  );

CREATE POLICY "Users can insert headquarters inspections for their projects" ON headquarters_inspections
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_id
      AND (
        p.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM user_profiles up
          WHERE up.id = auth.uid()
          AND up.role IN ('발주청', '감리단')
        )
      )
    )
  );

CREATE POLICY "Users can update their own headquarters inspections" ON headquarters_inspections
  FOR UPDATE USING (created_by = auth.uid());

CREATE POLICY "Users can delete their own headquarters inspections" ON headquarters_inspections
  FOR DELETE USING (created_by = auth.uid());

-- Create indexes
CREATE INDEX idx_headquarters_inspections_project_id ON headquarters_inspections(project_id);
CREATE INDEX idx_headquarters_inspections_inspection_date ON headquarters_inspections(inspection_date);
CREATE INDEX idx_headquarters_inspections_created_by ON headquarters_inspections(created_by);
CREATE INDEX idx_headquarters_inspections_action_status ON headquarters_inspections(action_status);

-- Create updated_at trigger
CREATE TRIGGER update_headquarters_inspections_updated_at
    BEFORE UPDATE ON headquarters_inspections
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();