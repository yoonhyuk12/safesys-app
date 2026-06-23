-- 위험공종 작업허가제(PTW) 삭제 권한 확장
-- 기존: 작성자 본인만 삭제 가능 (auth.uid() = created_by)
-- 변경: 작성자 본인 + 프로젝트 소유자 + 공유받은자 + 발주청(발주자) 삭제 가능
-- 적용 방법: Supabase 콘솔 → SQL Editor 에서 아래 전체를 실행

DROP POLICY IF EXISTS "Users can delete their ptw permits" ON ptw_permits;

CREATE POLICY "Owner, shared, client can delete ptw permits"
  ON ptw_permits FOR DELETE
  USING (
    -- 허가서 작성자 본인
    auth.uid() = created_by
    -- 프로젝트 소유자 (projects.created_by) — SECURITY DEFINER 헬퍼 사용
    OR is_project_owner(project_id, auth.uid())
    -- 공유받은 사용자
    OR EXISTS (
      SELECT 1 FROM project_shares ps
      WHERE ps.project_id = ptw_permits.project_id
        AND ps.shared_with = auth.uid()
    )
    -- 발주청(발주자)
    OR EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid()
        AND up.role = '발주청'::user_role
    )
  );
