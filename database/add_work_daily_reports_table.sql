-- 작업일보 (공사작업일지, 별지 제60호 서식) 테이블
-- 건설공사 사업관리방식 검토기준 및 업무수행지침
CREATE TABLE work_daily_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id),

  report_date DATE NOT NULL,             -- 일자
  weather TEXT DEFAULT '',               -- 날씨
  temp_high TEXT DEFAULT '',             -- 기온(최고)
  temp_low TEXT DEFAULT '',              -- 기온(최저)
  rainfall TEXT DEFAULT '',              -- 강우량(mm)
  author_name TEXT DEFAULT '',           -- 작성자(담당자)
  checker_name TEXT DEFAULT '',          -- 확인자(현장대리인)
  progress_rate TEXT DEFAULT '',         -- 공정률(%) — 착공일~준공일 날짜 기반 자동 계산 스냅샷
  progress_rate_manual BOOLEAN DEFAULT false, -- 사용자가 직접 입력한 공정률 여부 (보간 기준점)

  today_work TEXT DEFAULT '',                -- 1. 공사추진상황 - 금일작업
  tomorrow_work TEXT DEFAULT '',             -- 1. 공사추진상황 - 명일작업
  equipment_rows JSONB DEFAULT '[]'::jsonb,  -- 2. 장비투입상황 [{name,spec,prevCount,todayCount,cumulativeCount}]
  personnel_rows JSONB DEFAULT '[]'::jsonb,  -- 3. 인력투입상황 [{category,prevCount,todayCount,cumulativeCount,remarks}]
  participants TEXT DEFAULT '',              -- 4. 주요작업 참여자명단 (작업반장급 이상)

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- 프로젝트별 1일 1건
  UNIQUE (project_id, report_date)
);

CREATE INDEX idx_work_daily_reports_project_id ON work_daily_reports(project_id);
CREATE INDEX idx_work_daily_reports_report_date ON work_daily_reports(report_date);

-- RLS 활성화
ALTER TABLE work_daily_reports ENABLE ROW LEVEL SECURITY;

-- 조회: 모든 사용자
CREATE POLICY "Users can view work daily reports"
  ON work_daily_reports FOR SELECT USING (true);

-- 등록: 본인 계정으로만
CREATE POLICY "Users can insert work daily reports"
  ON work_daily_reports FOR INSERT WITH CHECK (auth.uid() = created_by);

-- 수정/삭제: 로그인 사용자 (현장대리인 작성 후 감독자 확인 등 공동 작성 워크플로우 지원)
CREATE POLICY "Authenticated users can update work daily reports"
  ON work_daily_reports FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete work daily reports"
  ON work_daily_reports FOR DELETE USING (auth.uid() IS NOT NULL);
