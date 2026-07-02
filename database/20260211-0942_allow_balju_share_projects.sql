-- 발주청 사용자도 프로젝트 공유 가능하도록 INSERT 정책 수정
-- 기존: 프로젝트 생성자(created_by)만 공유 가능
-- 변경: 프로젝트 생성자 OR 발주청 사용자 공유 가능
-- (발주청→발주청 공유 차단은 프론트엔드 ProjectShareModal에서 처리)

DROP POLICY IF EXISTS "project_shares_insert_owner" ON "public"."project_shares";

CREATE POLICY "project_shares_insert_owner" ON "public"."project_shares"
  FOR INSERT
  WITH CHECK (
    shared_by = auth.uid()
    AND (
      -- 1) 프로젝트 생성자는 공유 가능 (기존 로직)
      EXISTS (
        SELECT 1 FROM projects p
        WHERE p.id = project_shares.project_id
          AND p.created_by = auth.uid()
      )
      OR
      -- 2) 발주청 사용자는 프로젝트를 공유 가능
      EXISTS (
        SELECT 1 FROM user_profiles up
        WHERE up.id = auth.uid()
          AND up.role = '발주청'
      )
    )
  );
