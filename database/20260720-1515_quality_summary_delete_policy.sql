-- 품질시험 성과총괄표 삭제 권한을 작성자 외 프로젝트 소유자·공유자·발주청까지 확장한다 (ptw_permits 삭제 정책과 동일 패턴).

DROP POLICY IF EXISTS "Users can delete their quality summary reports" ON public.quality_summary_reports;

CREATE POLICY "Owner, shared, client can delete quality summary reports"
  ON public.quality_summary_reports
  FOR DELETE
  USING (
    auth.uid() = created_by
    OR is_project_owner(project_id, auth.uid())
    OR EXISTS (
      SELECT 1
        FROM project_shares ps
       WHERE ps.project_id = quality_summary_reports.project_id
         AND ps.shared_with = auth.uid()
    )
    OR EXISTS (
      SELECT 1
        FROM user_profiles up
       WHERE up.id = auth.uid()
         AND up.role = '발주청'::user_role
    )
  );
