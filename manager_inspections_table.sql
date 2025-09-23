-- Create manager_inspections table
CREATE TABLE manager_inspections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  inspection_date DATE NOT NULL,
  inspector_name TEXT NOT NULL,
  remarks TEXT,
  form_data JSONB, -- 복잡한 폼 데이터를 JSON으로 저장
  created_by UUID REFERENCES user_profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Enable RLS
ALTER TABLE manager_inspections ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view manager inspections for their projects" ON manager_inspections
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

CREATE POLICY "Users can insert manager inspections for their projects" ON manager_inspections
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

CREATE POLICY "Users can update their own manager inspections" ON manager_inspections
  FOR UPDATE USING (created_by = auth.uid());

CREATE POLICY "Users can delete their own manager inspections" ON manager_inspections
  FOR DELETE USING (created_by = auth.uid());

-- Create indexes
CREATE INDEX idx_manager_inspections_project_id ON manager_inspections(project_id);
CREATE INDEX idx_manager_inspections_inspection_date ON manager_inspections(inspection_date);
CREATE INDEX idx_manager_inspections_created_by ON manager_inspections(created_by);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_manager_inspections_updated_at
    BEFORE UPDATE ON manager_inspections
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();