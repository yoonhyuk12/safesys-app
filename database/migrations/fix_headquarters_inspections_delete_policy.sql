-- 기존 삭제 정책 제거
DROP POLICY IF EXISTS headquarters_inspections_delete_policy ON headquarters_inspections;

-- 새로운 삭제 정책 생성
-- 1. 발주청: 모든 본부 불시점검 삭제 가능
-- 2. 감리단/시공사: 해당 프로젝트의 관리 본부/지사가 일치하는 경우 삭제 가능
CREATE POLICY headquarters_inspections_delete_policy ON headquarters_inspections
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM projects p
      INNER JOIN user_profiles up ON up.id = auth.uid()
      WHERE p.id = headquarters_inspections.project_id
        AND (
          -- 발주청은 모든 점검 삭제 가능
          up.role = '발주청'
          OR
          -- 감리단/시공사는 자신의 본부/지사에 속한 프로젝트의 점검만 삭제 가능
          (
            up.role IN ('감리단', '시공사')
            AND p.managing_hq = up.hq_division
            AND p.managing_branch = up.branch_division
          )
        )
    )
  );
