-- 단속·점검방문 일지 테이블 (건설기술 진흥법 시행규칙 제48조, 별지 제9호 서식)
CREATE TABLE inspection_visit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id),

  -- ① 공사명 및 발주기관 등 (작성 시점 스냅샷 — 프로젝트 정보로 프리필)
  construction_name TEXT,        -- 공사명
  site_location TEXT,            -- 현장위치
  ordering_agency TEXT,          -- 발주기관(건축주)
  construction_scale TEXT,       -- 공사규모

  -- ② 방문 일시
  visit_date DATE,               -- 방문 일자
  visit_time_from TEXT,          -- 시작 시각 (HH:MM)
  visit_time_to TEXT,            -- 종료 시각 (HH:MM)

  -- ③~⑤
  visit_basis_purpose TEXT,      -- 방문 근거 및 목적
  work_content TEXT,             -- 업무 수행내용
  instructions TEXT,             -- 지시사항 또는 특기사항

  -- ⑥ 방문자 [{affiliation, position, name, signature}] (서명 base64, 이름 특정 개인 서명 — 일괄서명 제외)
  visitors JSONB DEFAULT '[]'::jsonb,

  -- ⑦ 공사감독원(책임건설사업관리기술자) 또는 현장 배치 건설기술자 확인
  confirmer_affiliation TEXT,    -- 소속
  confirmer_position TEXT,       -- 직책
  confirmer_name TEXT,           -- 성명
  confirmer_signature TEXT,      -- 서명 (base64)

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_inspection_visit_logs_project_id ON inspection_visit_logs(project_id);

-- RLS 활성화
ALTER TABLE inspection_visit_logs ENABLE ROW LEVEL SECURITY;

-- RLS 정책 (inspection_requests 패턴과 동일)
CREATE POLICY "Users can view inspection visit logs"
  ON inspection_visit_logs FOR SELECT USING (true);

CREATE POLICY "Users can insert inspection visit logs"
  ON inspection_visit_logs FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their inspection visit logs"
  ON inspection_visit_logs FOR UPDATE USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their inspection visit logs"
  ON inspection_visit_logs FOR DELETE USING (auth.uid() = created_by);
