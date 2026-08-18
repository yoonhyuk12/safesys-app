-- 위험공종 작업허가제(PTW) 수정 권한 확장 (삭제 정책 20260623-1153과 동일 패턴)
-- 기존: 작성자 본인만 수정 가능 (auth.uid() = created_by)
-- 변경: 작성자 본인 + 프로젝트 소유자 + 공유받은자 + 발주청(발주자) 수정 가능
-- 적용 방법: Supabase 콘솔 → SQL Editor 에서 아래 전체를 실행

DROP POLICY IF EXISTS "Users can update their ptw permits" ON public.ptw_permits;

CREATE POLICY "Owner, shared, client can update ptw permits"
  ON public.ptw_permits
  FOR UPDATE
  USING (
    -- 허가서 작성자 본인
    auth.uid() = created_by
    -- 프로젝트 소유자 (projects.created_by) — SECURITY DEFINER 헬퍼 사용
    OR is_project_owner(project_id, auth.uid())
    -- 공유받은 사용자
    OR EXISTS (
      SELECT 1
        FROM project_shares ps
       WHERE ps.project_id = ptw_permits.project_id
         AND ps.shared_with = auth.uid()
    )
    -- 발주청(발주자)
    OR EXISTS (
      SELECT 1
        FROM user_profiles up
       WHERE up.id = auth.uid()
         AND up.role = '발주청'::user_role
    )
  )
  WITH CHECK (
    auth.uid() = created_by
    OR is_project_owner(project_id, auth.uid())
    OR EXISTS (
      SELECT 1
        FROM project_shares ps
       WHERE ps.project_id = ptw_permits.project_id
         AND ps.shared_with = auth.uid()
    )
    OR EXISTS (
      SELECT 1
        FROM user_profiles up
       WHERE up.id = auth.uid()
         AND up.role = '발주청'::user_role
    )
  );
