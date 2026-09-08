-- AI 호출 1건마다 기능·모델·토큰·성공 여부를 남기고 모델별 원화 단가를 보관하는 마이그레이션

-- 재실행 안전: IF NOT EXISTS 사용. Supabase SQL Editor에서 수동 적용.
CREATE TABLE IF NOT EXISTS public.ai_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  success BOOLEAN NOT NULL DEFAULT TRUE,
  error_message TEXT,
  duration_ms INTEGER,
  -- auth.users FK는 걸지 않는다. 과거 FK가 가입자 삭제를 막은 전례가 있어 값만 보관한다.
  user_id UUID,
  -- 프로젝트가 삭제돼도 비용 총계는 남아야 하므로 CASCADE가 아니라 SET NULL이다.
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 조회는 항상 기간 필터가 선행한다.
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_created_at
  ON public.ai_usage_logs(created_at DESC);

-- 기능별 집계도 기간 안에서 이뤄진다.
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_feature_key_created_at
  ON public.ai_usage_logs(feature_key, created_at DESC);

-- 정책을 하나도 만들지 않아 anon·authenticated는 전면 차단되고 service role만 읽고 쓴다.
ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.ai_usage_logs IS
  'AI 호출 1건당 1행. service role 전용이며 src/lib/ai-usage-log.ts의 recordAiUsage가 after()로 적재한다. 비용은 저장하지 않고 조회 시점 단가로 계산한다.';
COMMENT ON COLUMN public.ai_usage_logs.feature_key IS
  'ai_model_settings.feature_key와 같은 기능 식별자. 기능별 집계의 결합 키다.';
COMMENT ON COLUMN public.ai_usage_logs.model IS
  '실제 호출에 쓰인 모델명. 폴백 체인이 돌면 시도마다 다른 값이 남는다.';
COMMENT ON COLUMN public.ai_usage_logs.prompt_tokens IS
  '입력 토큰 수. 사용량이 없는 TTS 호출은 입력 문자 수를 대신 기록한다.';
COMMENT ON COLUMN public.ai_usage_logs.success IS
  '호출 성공 여부. 실패한 시도의 토큰도 과금되므로 실패 행도 집계에 포함한다.';
COMMENT ON COLUMN public.ai_usage_logs.user_id IS
  '서버가 토큰을 검증한 라우트에서만 채워진다. FK는 없다.';
COMMENT ON COLUMN public.ai_usage_logs.project_id IS
  '프로젝트 컨텍스트를 아는 라우트에서만 채워진다. 프로젝트 삭제 시 NULL이 된다.';

-- 관리자가 직접 입력하는 원화 단가. NULL이면 비용을 산정하지 않는다.
ALTER TABLE public.ai_model_settings ADD COLUMN IF NOT EXISTS input_price_per_1m NUMERIC;
ALTER TABLE public.ai_model_settings ADD COLUMN IF NOT EXISTS output_price_per_1m NUMERIC;

COMMENT ON COLUMN public.ai_model_settings.input_price_per_1m IS
  '입력 100만 토큰당 원화 단가. NULL이면 비용 미산정.';
COMMENT ON COLUMN public.ai_model_settings.output_price_per_1m IS
  '출력 100만 토큰당 원화 단가. NULL이면 비용 미산정.';
