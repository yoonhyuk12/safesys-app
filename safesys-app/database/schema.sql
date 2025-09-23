-- 안전관리 시스템 데이터베이스 스키마

-- 사용자 프로필 테이블
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID REFERENCES auth.users(id) PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'supervisor', 'employee', 'contractor')),
    department TEXT NOT NULL,
    phone TEXT,
    emergency_contact TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 프로젝트 테이블
CREATE TABLE IF NOT EXISTS projects (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_name TEXT NOT NULL,
    managing_hq TEXT NOT NULL,
    managing_branch TEXT NOT NULL,
    site_address TEXT,
    project_manager_id UUID REFERENCES user_profiles(id),
    status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'completed', 'cancelled')) DEFAULT 'active',
    start_date DATE,
    end_date DATE,
    description TEXT,
    created_by UUID REFERENCES user_profiles(id) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 열중질환 점검 테이블 (heat_wave_checks)는 이미 존재함

-- 안전 점검 테이블
CREATE TABLE IF NOT EXISTS safety_inspections (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    inspector_id UUID REFERENCES user_profiles(id) NOT NULL,
    location TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
    score INTEGER CHECK (score >= 0 AND score <= 100),
    inspection_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 안전 점검 체크리스트 항목 테이블
CREATE TABLE IF NOT EXISTS safety_checklist_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    inspection_id UUID REFERENCES safety_inspections(id) ON DELETE CASCADE,
    item_name TEXT NOT NULL,
    is_compliant BOOLEAN DEFAULT FALSE,
    notes TEXT,
    priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 사고 보고서 테이블
CREATE TABLE IF NOT EXISTS incident_reports (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    reporter_id UUID REFERENCES user_profiles(id) NOT NULL,
    location TEXT NOT NULL,
    incident_date TIMESTAMP WITH TIME ZONE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('reported', 'investigating', 'resolved', 'closed')),
    resolution_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 안전 교육 테이블
CREATE TABLE IF NOT EXISTS safety_trainings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    duration_hours INTEGER NOT NULL CHECK (duration_hours > 0),
    required_for_roles TEXT[] DEFAULT '{}',
    content_url TEXT,
    created_by UUID REFERENCES user_profiles(id) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 교육 이수 기록 테이블
CREATE TABLE IF NOT EXISTS training_completions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    training_id UUID REFERENCES safety_trainings(id) ON DELETE CASCADE,
    user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    score INTEGER CHECK (score >= 0 AND score <= 100),
    certificate_url TEXT,
    UNIQUE(training_id, user_id)
);

-- 안전 장비 테이블
CREATE TABLE IF NOT EXISTS safety_equipment (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    serial_number TEXT UNIQUE,
    location TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('available', 'in_use', 'maintenance', 'retired')),
    last_inspection_date DATE,
    next_inspection_date DATE,
    assigned_to UUID REFERENCES user_profiles(id),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 안전 규정 및 정책 테이블
CREATE TABLE IF NOT EXISTS safety_policies (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    content TEXT NOT NULL,
    version TEXT NOT NULL DEFAULT '1.0',
    effective_date DATE NOT NULL,
    review_date DATE,
    created_by UUID REFERENCES user_profiles(id) NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'archived')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 알림 테이블
CREATE TABLE IF NOT EXISTS notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('info', 'warning', 'error', 'success')),
    is_read BOOLEAN DEFAULT FALSE,
    related_id UUID, -- 관련된 레코드의 ID (inspection, incident 등)
    related_type TEXT, -- 관련된 테이블명
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 시스템 로그 테이블
CREATE TABLE IF NOT EXISTS system_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES user_profiles(id),
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id UUID,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS (Row Level Security) 정책 설정
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety_trainings ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety_equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_logs ENABLE ROW LEVEL SECURITY;

-- 사용자 프로필 정책
CREATE POLICY "사용자는 자신의 프로필을 볼 수 있습니다" ON user_profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "사용자는 자신의 프로필을 업데이트할 수 있습니다" ON user_profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "관리자는 모든 프로필을 볼 수 있습니다" ON user_profiles
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- 프로젝트 정책
CREATE POLICY "사용자는 모든 프로젝트를 볼 수 있습니다" ON projects
    FOR SELECT USING (true);

CREATE POLICY "관리자와 감독자는 프로젝트를 생성할 수 있습니다" ON projects
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id = auth.uid() AND role IN ('admin', 'supervisor')
        )
    );

CREATE POLICY "관리자와 감독자는 프로젝트를 업데이트할 수 있습니다" ON projects
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id = auth.uid() AND role IN ('admin', 'supervisor')
        )
    );

-- 열중질환 점검 정책 (heat_wave_checks 테이블은 이미 정책이 설정됨)

-- 안전 점검 정책
CREATE POLICY "사용자는 안전 점검을 볼 수 있습니다" ON safety_inspections
    FOR SELECT USING (
        inspector_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id = auth.uid() AND role IN ('admin', 'supervisor')
        )
    );

CREATE POLICY "점검자는 자신의 점검을 생성할 수 있습니다" ON safety_inspections
    FOR INSERT WITH CHECK (inspector_id = auth.uid());

CREATE POLICY "점검자는 자신의 점검을 업데이트할 수 있습니다" ON safety_inspections
    FOR UPDATE USING (inspector_id = auth.uid());

-- 사고 보고서 정책
CREATE POLICY "사용자는 사고 보고서를 볼 수 있습니다" ON incident_reports
    FOR SELECT USING (
        reporter_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id = auth.uid() AND role IN ('admin', 'supervisor')
        )
    );

CREATE POLICY "사용자는 사고를 보고할 수 있습니다" ON incident_reports
    FOR INSERT WITH CHECK (reporter_id = auth.uid());

-- 알림 정책
CREATE POLICY "사용자는 자신의 알림을 볼 수 있습니다" ON notifications
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "사용자는 자신의 알림을 업데이트할 수 있습니다" ON notifications
    FOR UPDATE USING (user_id = auth.uid());

-- 인덱스 생성
CREATE INDEX idx_projects_created_by ON projects(created_by);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_created_at ON projects(created_at);

-- heat_wave_checks 인덱스는 이미 존재함

CREATE INDEX idx_safety_inspections_inspector_id ON safety_inspections(inspector_id);
CREATE INDEX idx_safety_inspections_status ON safety_inspections(status);
CREATE INDEX idx_safety_inspections_created_at ON safety_inspections(created_at);

CREATE INDEX idx_incident_reports_reporter_id ON incident_reports(reporter_id);
CREATE INDEX idx_incident_reports_severity ON incident_reports(severity);
CREATE INDEX idx_incident_reports_status ON incident_reports(status);
CREATE INDEX idx_incident_reports_created_at ON incident_reports(created_at);

CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);

-- 트리거 함수: updated_at 자동 업데이트
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 트리거 생성
CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_safety_inspections_updated_at BEFORE UPDATE ON safety_inspections FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_safety_checklist_items_updated_at BEFORE UPDATE ON safety_checklist_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_incident_reports_updated_at BEFORE UPDATE ON incident_reports FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_safety_trainings_updated_at BEFORE UPDATE ON safety_trainings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_safety_equipment_updated_at BEFORE UPDATE ON safety_equipment FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_safety_policies_updated_at BEFORE UPDATE ON safety_policies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); 