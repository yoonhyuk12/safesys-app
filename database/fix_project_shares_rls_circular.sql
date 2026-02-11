-- 순환 RLS 참조 수정
-- 문제: projects_select_shared → project_shares 조회 → project_shares_select → projects 조회 → 무한 루프

-- 1. 기존 순환 정책 삭제
DROP POLICY IF EXISTS "project_shares_select" ON public.project_shares;
DROP POLICY IF EXISTS "project_shares_delete" ON public.project_shares;

-- 2. project_shares SELECT 정책 재생성 (projects 참조 제거)
CREATE POLICY "project_shares_select" ON public.project_shares
  FOR SELECT
  USING (
    shared_with = auth.uid()
    OR shared_by = auth.uid()
  );

-- 3. project_shares DELETE 정책 재생성 (projects 참조 제거)
CREATE POLICY "project_shares_delete" ON public.project_shares
  FOR DELETE
  USING (
    shared_with = auth.uid()
    OR shared_by = auth.uid()
  );
