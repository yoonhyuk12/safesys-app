-- 미등록 현장 사고 입력을 위해 project_id를 선택으로 두고 직접입력 현장명·조직 필드를 추가한다.

ALTER TABLE public.project_accidents
  ALTER COLUMN project_id DROP NOT NULL;

ALTER TABLE public.project_accidents
  ADD COLUMN IF NOT EXISTS external_project_name TEXT,
  ADD COLUMN IF NOT EXISTS external_managing_hq TEXT,
  ADD COLUMN IF NOT EXISTS external_managing_branch TEXT;

ALTER TABLE public.project_accidents
  DROP CONSTRAINT IF EXISTS project_accidents_project_or_external_check;

ALTER TABLE public.project_accidents
  ADD CONSTRAINT project_accidents_project_or_external_check
  CHECK (
    (
      project_id IS NOT NULL
      AND (external_project_name IS NULL OR BTRIM(external_project_name) = '')
    )
    OR (
      project_id IS NULL
      AND external_project_name IS NOT NULL
      AND BTRIM(external_project_name) <> ''
    )
  );

CREATE INDEX IF NOT EXISTS idx_project_accidents_external_org
  ON public.project_accidents(external_managing_hq, external_managing_branch)
  WHERE project_id IS NULL;

COMMENT ON COLUMN public.project_accidents.external_project_name IS '시스템에 없는 현장의 직접입력 현장명 (project_id가 NULL일 때 필수)';
COMMENT ON COLUMN public.project_accidents.external_managing_hq IS '직접입력 현장의 관할 본부';
COMMENT ON COLUMN public.project_accidents.external_managing_branch IS '직접입력 현장의 관할 지사';

-- 기존 정책은 projects 조인에만 의존하므로 미등록 현장을 포함하도록 재정의한다.
DROP POLICY IF EXISTS "발주청 관할 사고 조회" ON public.project_accidents;
DROP POLICY IF EXISTS "본부급 이상 사고 등록" ON public.project_accidents;
DROP POLICY IF EXISTS "본부급 이상 사고 수정" ON public.project_accidents;
DROP POLICY IF EXISTS "본부급 이상 사고 삭제" ON public.project_accidents;

CREATE POLICY "발주청 관할 사고 조회"
  ON public.project_accidents FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.user_profiles up
       WHERE up.id = auth.uid()
         AND up.role = '발주청'
         AND (
           up.hq_division IS NULL
           OR (up.hq_division = '본사' AND up.branch_division = '본사')
           OR (
             project_accidents.project_id IS NOT NULL
             AND EXISTS (
               SELECT 1
                 FROM public.projects p
                WHERE p.id = project_accidents.project_id
                  AND (
                    (up.branch_division LIKE '%본부' AND p.managing_hq = up.hq_division)
                    OR (
                      p.managing_hq = up.hq_division
                      AND p.managing_branch = up.branch_division
                    )
                  )
             )
           )
           OR (
             project_accidents.project_id IS NULL
             AND (
               (up.branch_division LIKE '%본부' AND project_accidents.external_managing_hq = up.hq_division)
               OR (
                 project_accidents.external_managing_hq = up.hq_division
                 AND project_accidents.external_managing_branch = up.branch_division
               )
             )
           )
         )
    )
  );

CREATE POLICY "본부급 이상 사고 등록"
  ON public.project_accidents FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1
        FROM public.user_profiles up
       WHERE up.id = auth.uid()
         AND up.role = '발주청'
         AND (
           up.hq_division IS NULL
           OR (up.hq_division = '본사' AND up.branch_division = '본사')
           OR (
             project_accidents.project_id IS NOT NULL
             AND up.branch_division LIKE '%본부'
             AND EXISTS (
               SELECT 1
                 FROM public.projects p
                WHERE p.id = project_accidents.project_id
                  AND p.managing_hq = up.hq_division
             )
           )
           OR (
             project_accidents.project_id IS NULL
             AND up.branch_division LIKE '%본부'
             AND project_accidents.external_managing_hq = up.hq_division
           )
         )
    )
  );

CREATE POLICY "본부급 이상 사고 수정"
  ON public.project_accidents FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.user_profiles up
       WHERE up.id = auth.uid()
         AND up.role = '발주청'
         AND (
           up.hq_division IS NULL
           OR (up.hq_division = '본사' AND up.branch_division = '본사')
           OR (
             project_accidents.project_id IS NOT NULL
             AND up.branch_division LIKE '%본부'
             AND EXISTS (
               SELECT 1
                 FROM public.projects p
                WHERE p.id = project_accidents.project_id
                  AND p.managing_hq = up.hq_division
             )
           )
           OR (
             project_accidents.project_id IS NULL
             AND up.branch_division LIKE '%본부'
             AND project_accidents.external_managing_hq = up.hq_division
           )
         )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM public.user_profiles up
       WHERE up.id = auth.uid()
         AND up.role = '발주청'
         AND (
           up.hq_division IS NULL
           OR (up.hq_division = '본사' AND up.branch_division = '본사')
           OR (
             project_accidents.project_id IS NOT NULL
             AND up.branch_division LIKE '%본부'
             AND EXISTS (
               SELECT 1
                 FROM public.projects p
                WHERE p.id = project_accidents.project_id
                  AND p.managing_hq = up.hq_division
             )
           )
           OR (
             project_accidents.project_id IS NULL
             AND up.branch_division LIKE '%본부'
             AND project_accidents.external_managing_hq = up.hq_division
           )
         )
    )
  );

CREATE POLICY "본부급 이상 사고 삭제"
  ON public.project_accidents FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.user_profiles up
       WHERE up.id = auth.uid()
         AND up.role = '발주청'
         AND (
           up.hq_division IS NULL
           OR (up.hq_division = '본사' AND up.branch_division = '본사')
           OR (
             project_accidents.project_id IS NOT NULL
             AND up.branch_division LIKE '%본부'
             AND EXISTS (
               SELECT 1
                 FROM public.projects p
                WHERE p.id = project_accidents.project_id
                  AND p.managing_hq = up.hq_division
             )
           )
           OR (
             project_accidents.project_id IS NULL
             AND up.branch_division LIKE '%본부'
             AND project_accidents.external_managing_hq = up.hq_division
           )
         )
    )
  );
