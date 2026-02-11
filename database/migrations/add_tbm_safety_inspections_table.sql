-- TBM 안전활동 점검표 테이블 생성
CREATE TABLE IF NOT EXISTS tbm_safety_inspections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- 기본 정보
  district VARCHAR(100),
  project_name VARCHAR(255) NOT NULL,
  supervisor VARCHAR(100),

  -- TBM 일시
  tbm_date DATE NOT NULL,
  tbm_start_time TIME NOT NULL,
  tbm_end_time TIME NOT NULL,

  -- 입회 정보
  is_attended BOOLEAN DEFAULT true,
  non_attendance_reason TEXT,
  attendee_affiliation VARCHAR(100),
  attendee VARCHAR(100),

  -- 작업 정보
  work_content TEXT NOT NULL,
  address TEXT,
  tbm_content TEXT NOT NULL,

  -- 투입 현황
  workers VARCHAR(50),
  equipment VARCHAR(50),
  new_workers VARCHAR(50),
  signal_workers VARCHAR(50),

  -- 현장관리자 활동사항
  site_explanation BOOLEAN DEFAULT true,
  site_explanation_reason TEXT,
  risk_explanation BOOLEAN DEFAULT true,
  risk_explanation_reason TEXT,
  ppe_provision BOOLEAN DEFAULT true,
  ppe_provision_reason TEXT,
  health_check BOOLEAN DEFAULT true,
  health_check_reason TEXT,

  -- 입회자 의견
  attendee_opinion TEXT,

  -- 서명
  affiliation VARCHAR(100),
  signature TEXT,

  -- 메타데이터
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스 생성 (검색 성능 향상)
CREATE INDEX IF NOT EXISTS idx_tbm_safety_inspections_project_id ON tbm_safety_inspections(project_id);
CREATE INDEX IF NOT EXISTS idx_tbm_safety_inspections_tbm_date ON tbm_safety_inspections(tbm_date);
CREATE INDEX IF NOT EXISTS idx_tbm_safety_inspections_created_by ON tbm_safety_inspections(created_by);

-- RLS (Row Level Security) 정책 활성화
ALTER TABLE tbm_safety_inspections ENABLE ROW LEVEL SECURITY;

-- RLS 정책: 모든 인증된 사용자는 조회 가능
DROP POLICY IF EXISTS "Anyone can view tbm safety inspections" ON tbm_safety_inspections;
CREATE POLICY "Anyone can view tbm safety inspections"
  ON tbm_safety_inspections
  FOR SELECT
  TO authenticated
  USING (true);

-- RLS 정책: 인증된 사용자는 생성 가능
DROP POLICY IF EXISTS "Authenticated users can insert tbm safety inspections" ON tbm_safety_inspections;
CREATE POLICY "Authenticated users can insert tbm safety inspections"
  ON tbm_safety_inspections
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

-- RLS 정책: 작성자 또는 발주청은 수정 가능
DROP POLICY IF EXISTS "Users can update tbm safety inspections" ON tbm_safety_inspections;
CREATE POLICY "Users can update tbm safety inspections"
  ON tbm_safety_inspections
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = created_by
    OR
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = '발주청'
    )
  )
  WITH CHECK (
    auth.uid() = created_by
    OR
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = '발주청'
    )
  );

-- RLS 정책: 작성자 또는 발주청은 삭제 가능
DROP POLICY IF EXISTS "Users can delete tbm safety inspections" ON tbm_safety_inspections;
CREATE POLICY "Users can delete tbm safety inspections"
  ON tbm_safety_inspections
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() = created_by
    OR
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = '발주청'
    )
  );

-- updated_at 자동 업데이트 트리거
CREATE OR REPLACE FUNCTION update_tbm_safety_inspections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_tbm_safety_inspections_updated_at ON tbm_safety_inspections;
CREATE TRIGGER update_tbm_safety_inspections_updated_at
  BEFORE UPDATE ON tbm_safety_inspections
  FOR EACH ROW
  EXECUTE FUNCTION update_tbm_safety_inspections_updated_at();

-- 코멘트 추가 (테이블 설명)
COMMENT ON TABLE tbm_safety_inspections IS 'TBM 안전활동 점검표 (감독)';
COMMENT ON COLUMN tbm_safety_inspections.district IS '지구명';
COMMENT ON COLUMN tbm_safety_inspections.project_name IS '사업명';
COMMENT ON COLUMN tbm_safety_inspections.supervisor IS '공사감독';
COMMENT ON COLUMN tbm_safety_inspections.is_attended IS '입회여부';
COMMENT ON COLUMN tbm_safety_inspections.non_attendance_reason IS '미입회 사유';
COMMENT ON COLUMN tbm_safety_inspections.attendee_affiliation IS '입회자 소속';
COMMENT ON COLUMN tbm_safety_inspections.attendee IS '입회자';
COMMENT ON COLUMN tbm_safety_inspections.work_content IS '작업내용';
COMMENT ON COLUMN tbm_safety_inspections.address IS '주소';
COMMENT ON COLUMN tbm_safety_inspections.tbm_content IS 'TBM 내용';
COMMENT ON COLUMN tbm_safety_inspections.site_explanation IS '현장설명 조치여부';
COMMENT ON COLUMN tbm_safety_inspections.risk_explanation IS '작업위험 요인 설명 조치여부';
COMMENT ON COLUMN tbm_safety_inspections.ppe_provision IS '개인보호구 지급 조치여부';
COMMENT ON COLUMN tbm_safety_inspections.health_check IS '작업전 건강상태 확인 조치여부';
