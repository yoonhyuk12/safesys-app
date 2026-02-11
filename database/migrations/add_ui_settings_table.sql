-- 본부별 UI 설정 테이블 생성
CREATE TABLE IF NOT EXISTS public.ui_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hq_division text NOT NULL UNIQUE, -- 본부명 (예: '토목본부', '건축본부')
  show_quarters_toggle boolean NOT NULL DEFAULT true, -- 분기별 토글 표시 여부
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS 활성화
ALTER TABLE public.ui_settings ENABLE ROW LEVEL SECURITY;

-- 모든 인증된 사용자가 조회 가능
CREATE POLICY "Anyone can view ui_settings"
  ON public.ui_settings
  FOR SELECT
  TO authenticated
  USING (true);

-- 발주청 + 본부/본사급만 수정 가능
CREATE POLICY "HQ level users can update ui_settings"
  ON public.ui_settings
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = '발주청'
        AND (
          user_profiles.hq_division IS NULL
          OR user_profiles.branch_division LIKE '%본부'
        )
        AND (
          user_profiles.hq_division IS NULL -- 본사는 모든 본부 수정 가능
          OR user_profiles.hq_division = ui_settings.hq_division -- 해당 본부만 수정 가능
        )
    )
  );

-- 발주청 + 본부/본사급만 생성 가능
CREATE POLICY "HQ level users can insert ui_settings"
  ON public.ui_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = '발주청'
        AND (
          user_profiles.hq_division IS NULL
          OR user_profiles.branch_division LIKE '%본부'
        )
    )
  );

-- updated_at 자동 업데이트 트리거
CREATE OR REPLACE FUNCTION update_ui_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_ui_settings_updated_at
  BEFORE UPDATE ON public.ui_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_ui_settings_updated_at();

-- 기본 본부 데이터 삽입 (HEADQUARTERS_OPTIONS에 있는 본부들)
INSERT INTO public.ui_settings (hq_division, show_quarters_toggle)
VALUES
  ('토목사업본부', true),
  ('건축사업본부', true),
  ('플랜트사업본부', true)
ON CONFLICT (hq_division) DO NOTHING;

COMMENT ON TABLE public.ui_settings IS '본부별 UI 설정 (분기별 토글 표시 여부 등)';
COMMENT ON COLUMN public.ui_settings.hq_division IS '본부명';
COMMENT ON COLUMN public.ui_settings.show_quarters_toggle IS '분기별 공사중 토글 표시 여부';
