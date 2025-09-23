-- 발주청 사용자의 프로젝트 생성 허용 정책
-- 중복 생성을 피하기 위해 기존 동일 정책이 있으면 먼저 제거
DROP POLICY IF EXISTS "발주청_프로젝트_생성" ON public.projects;

CREATE POLICY "발주청_프로젝트_생성" ON public.projects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND up.role = '발주청'
    )
  );

-- 참고: 클라이언트에서 createProject 시 created_by = auth.uid() 를 함께 저장해야 합니다.

