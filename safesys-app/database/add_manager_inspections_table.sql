-- 관리자 일상점검 테이블 생성
CREATE TABLE IF NOT EXISTS manager_inspections (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    inspection_date DATE NOT NULL,
    inspector_name TEXT NOT NULL,
    remarks TEXT,
    created_by UUID REFERENCES user_profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_manager_inspections_project_id ON manager_inspections(project_id);
CREATE INDEX IF NOT EXISTS idx_manager_inspections_inspection_date ON manager_inspections(inspection_date);

-- RLS 정책 활성화
ALTER TABLE manager_inspections ENABLE ROW LEVEL SECURITY;

-- 정책 추가: 사용자는 자신의 프로젝트 관련 점검 기록만 볼 수 있음
CREATE POLICY "Users can view manager inspections for their projects" ON manager_inspections
    FOR SELECT USING (
        project_id IN (
            SELECT id FROM projects 
            WHERE created_by = auth.uid()
        )
        OR 
        EXISTS (
            SELECT 1 FROM user_profiles 
            WHERE id = auth.uid() 
            AND role IN ('admin', 'supervisor')
        )
    );

-- 정책 추가: 사용자는 자신의 프로젝트에 점검 기록을 추가할 수 있음
CREATE POLICY "Users can insert manager inspections for their projects" ON manager_inspections
    FOR INSERT WITH CHECK (
        project_id IN (
            SELECT id FROM projects 
            WHERE created_by = auth.uid()
        )
        OR 
        EXISTS (
            SELECT 1 FROM user_profiles 
            WHERE id = auth.uid() 
            AND role IN ('admin', 'supervisor')
        )
    );

-- 정책 추가: 사용자는 자신이 작성한 점검 기록을 수정할 수 있음
CREATE POLICY "Users can update their own manager inspections" ON manager_inspections
    FOR UPDATE USING (created_by = auth.uid());

-- 정책 추가: 사용자는 자신이 작성한 점검 기록을 삭제할 수 있음
CREATE POLICY "Users can delete their own manager inspections" ON manager_inspections
    FOR DELETE USING (created_by = auth.uid());