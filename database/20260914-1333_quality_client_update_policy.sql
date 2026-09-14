-- 품질시험 관리대장 세 테이블에서 작성자와 모든 발주청의 수정 권한을 허용한다.

BEGIN;

DROP POLICY IF EXISTS "Users can update their quality summary reports" ON public.quality_summary_reports;
DROP POLICY IF EXISTS "Author or client can update quality summary reports" ON public.quality_summary_reports;
CREATE POLICY "Author or client can update quality summary reports"
  ON public.quality_summary_reports FOR UPDATE TO authenticated
  USING (
    auth.uid() = created_by
    OR EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.role = '발주청'::public.user_role)
  )
  WITH CHECK (
    auth.uid() = created_by
    OR EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.role = '발주청'::public.user_role)
  );

DROP POLICY IF EXISTS "Users can update their quality test records" ON public.quality_test_records;
DROP POLICY IF EXISTS "Author or client can update quality test records" ON public.quality_test_records;
CREATE POLICY "Author or client can update quality test records"
  ON public.quality_test_records FOR UPDATE TO authenticated
  USING (
    auth.uid() = created_by
    OR EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.role = '발주청'::public.user_role)
  )
  WITH CHECK (
    auth.uid() = created_by
    OR EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.role = '발주청'::public.user_role)
  );

DROP POLICY IF EXISTS "Users can update their quality verification requests" ON public.quality_verification_requests;
DROP POLICY IF EXISTS "Author or client can update quality verification requests" ON public.quality_verification_requests;
CREATE POLICY "Author or client can update quality verification requests"
  ON public.quality_verification_requests FOR UPDATE TO authenticated
  USING (
    auth.uid() = created_by
    OR EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.role = '발주청'::public.user_role)
  )
  WITH CHECK (
    auth.uid() = created_by
    OR EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.role = '발주청'::public.user_role)
  );

COMMIT;
