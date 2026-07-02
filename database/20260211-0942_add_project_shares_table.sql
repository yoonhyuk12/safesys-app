-- 프로젝트 공유 테이블
CREATE TABLE IF NOT EXISTS public.project_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  shared_with UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  shared_by UUID NOT NULL REFERENCES public.user_profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(project_id, shared_with)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_project_shares_shared_with ON public.project_shares(shared_with);
CREATE INDEX IF NOT EXISTS idx_project_shares_project_id ON public.project_shares(project_id);

-- RLS 활성화
ALTER TABLE public.project_shares ENABLE ROW LEVEL SECURITY;

-- RLS 정책: 프로젝트 소유자가 공유 생성
CREATE POLICY "project_shares_insert_owner" ON public.project_shares
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id AND p.created_by = auth.uid()
    )
    AND shared_by = auth.uid()
  );

-- RLS 정책: 공유 대상자이거나 공유한 사람이 조회
-- ⚠️ 주의: projects 테이블 참조 금지 (순환 RLS 방지)
-- shared_by = auth.uid() 조건으로 소유자 조회 충분
CREATE POLICY "project_shares_select" ON public.project_shares
  FOR SELECT
  USING (
    shared_with = auth.uid()
    OR shared_by = auth.uid()
  );

-- RLS 정책: 공유한 사람 또는 공유 대상자 본인이 삭제
-- ⚠️ 주의: projects 테이블 참조 금지 (순환 RLS 방지)
CREATE POLICY "project_shares_delete" ON public.project_shares
  FOR DELETE
  USING (
    shared_with = auth.uid()
    OR shared_by = auth.uid()
  );

-- projects SELECT 정책 추가: 공유받은 프로젝트도 조회 가능하도록
-- ⚠️ 반드시 projects.id로 명시 (id만 쓰면 ps.id로 해석될 수 있음)
CREATE POLICY "projects_select_shared" ON public.projects
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.project_shares ps
      WHERE ps.project_id = projects.id AND ps.shared_with = auth.uid()
    )
  );
