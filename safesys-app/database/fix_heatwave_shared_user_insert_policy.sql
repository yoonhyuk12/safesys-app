-- 프로젝트를 공유받은 사용자(project_shares)도 폭염점검을 생성/조회할 수 있도록 RLS 보강
-- 기존 INSERT 정책은 프로젝트 생성자 본인 또는 관할 발주청만 허용했다.
-- ProjectShareModal로 공유받은 시공사·감리단도 입력할 수 있게 project_shares 조건을 추가한다.
-- 앱의 저장 로직이 insert(...).select().single() 이므로, 방금 넣은 행을 되돌려받으려면
-- 동일 사용자에게 SELECT 권한도 필요하다. 따라서 공유 SELECT 정책도 함께 추가한다.

-- 1) 폭염점검 생성(INSERT) 권한: 공유받은 사용자 허용 분기 추가
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
          -- 또는 프로젝트를 공유받은 사용자(project_shares)
          OR EXISTS (
            SELECT 1 FROM public.project_shares ps
            WHERE ps.project_id = p.id
              AND ps.shared_with = auth.uid()
          )
        )
    )
  );

-- 2) 폭염점검 조회(SELECT) 권한: 공유받은 사용자 허용
-- insert().select() 반환 및 목록 조회를 위해 필요하다. 권한 정책은 OR로 합산되므로
-- 기존 조회 정책과 중복돼도 안전하다.
DROP POLICY IF EXISTS "폭염점검 공유 조회 권한" ON public.heat_wave_checks;

CREATE POLICY "폭염점검 공유 조회 권한" ON public.heat_wave_checks
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.project_shares ps
      WHERE ps.project_id = heat_wave_checks.project_id
        AND ps.shared_with = auth.uid()
    )
  );
