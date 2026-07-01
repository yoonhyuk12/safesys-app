-- 품질시험 월례보고서 (금월 품질시험실적 및 다음월 시공계획, 公社시험업무지침 별지 제3호서식) 테이블
CREATE TABLE quality_monthly_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id),

  report_year INTEGER NOT NULL,          -- 보고 연도
  report_month INTEGER NOT NULL,         -- 보고 월 (1~12)
  district_name TEXT DEFAULT '',         -- 지구명
  author_name TEXT DEFAULT '',           -- 작성자 (시공사 현장대리인)
  confirmer_name TEXT DEFAULT '',        -- 확인자 (지사 공사사무소장)

  -- 행 데이터 [{workType,testItem,yearlyPlan,monthVolume,monthQualityTest,monthExpertConfirm,
  --   monthOtherConfirm,prevCumulVolume,prevCumulQualityTest,prevCumulExpertConfirm,
  --   prevCumulOtherConfirm,nextMonthPlan}]
  -- 소계/계/누계/시공잔량은 파생값이므로 저장하지 않고 화면·PDF에서 계산
  report_rows JSONB DEFAULT '[]'::jsonb,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- 프로젝트별 월 1건
  UNIQUE (project_id, report_year, report_month)
);

CREATE INDEX idx_quality_monthly_reports_project_id ON quality_monthly_reports(project_id);

-- RLS 활성화
ALTER TABLE quality_monthly_reports ENABLE ROW LEVEL SECURITY;

-- 조회: 모든 사용자
CREATE POLICY "Users can view quality monthly reports"
  ON quality_monthly_reports FOR SELECT USING (true);

-- 등록: 본인 계정으로만
CREATE POLICY "Users can insert quality monthly reports"
  ON quality_monthly_reports FOR INSERT WITH CHECK (auth.uid() = created_by);

-- 수정/삭제: 로그인 사용자 (작성자 작성 후 확인자 보완 등 공동 작성 워크플로우 지원 — work_daily_reports와 동일)
CREATE POLICY "Authenticated users can update quality monthly reports"
  ON quality_monthly_reports FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete quality monthly reports"
  ON quality_monthly_reports FOR DELETE USING (auth.uid() IS NOT NULL);
