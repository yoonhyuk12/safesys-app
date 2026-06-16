-- 발주청(본부급·지사급·본사)도 관할 프로젝트의 폭염점검을 생성할 수 있도록 INSERT 정책 보강
-- 기존 정책은 발주청 중 (hq=managing_hq AND (branch IS NULL OR branch=managing_branch))만 허용해
-- 본부급(branch_division='○○본부')·본사(hq_division IS NULL) 발주청은 조회는 되나 생성이 막혔다.
-- SELECT 정책과 동일한 관할 범위(본부급/지사급/본사)로 맞춘다.

DROP POLICY IF EXISTS "폭염점검 생성 권한" ON public.heat_wave_checks;

CREATE POLICY "폭염점검 생성 권한" ON public.heat_wave_checks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = created_by
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = heat_wave_checks.project_id
        AND (
          -- 프로젝트 생성자(주로 시공사) 본인
          p.created_by = auth.uid()
          -- 또는 관할 발주청 (조회 정책과 동일 범위)
          OR EXISTS (
            SELECT 1 FROM public.user_profiles up
            WHERE up.id = auth.uid()
              AND up.role = '발주청'
              AND (
                -- 본부급: 소속 본부 전체 관할
                (up.hq_division IS NOT NULL
                  AND up.branch_division = (up.hq_division || '본부')
                  AND p.managing_hq = up.hq_division)
                -- 지사급: 소속 지사 관할
                OR (up.hq_division IS NOT NULL
                  AND up.branch_division <> (up.hq_division || '본부')
                  AND p.managing_branch = up.branch_division)
                -- 본사(전사): hq_division 없음
                OR (up.hq_division IS NULL)
              )
          )
        )
    )
  );
