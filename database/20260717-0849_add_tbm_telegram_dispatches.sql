-- TBM 텔레그램 발송 요청을 원자적으로 예약하고 재발송과 과도한 발송을 차단하는 마이그레이션

CREATE TABLE public.tbm_telegram_dispatches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id UUID NOT NULL,
  payload_hash TEXT NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'failed')),
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT tbm_telegram_dispatches_user_request_unique UNIQUE (user_id, request_id),
  CONSTRAINT tbm_telegram_dispatches_completion_check CHECK (
    (status = 'pending' AND completed_at IS NULL)
    OR (status IN ('completed', 'failed') AND completed_at IS NOT NULL)
  )
);

CREATE INDEX idx_tbm_telegram_dispatches_user_created_at
  ON public.tbm_telegram_dispatches(user_id, created_at DESC);

ALTER TABLE public.tbm_telegram_dispatches ENABLE ROW LEVEL SECURITY;

-- 직접 테이블 접근은 허용하지 않고 아래 SECURITY DEFINER 함수만 공개한다.
REVOKE ALL ON TABLE public.tbm_telegram_dispatches FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.reserve_tbm_telegram_dispatch(
  p_request_id UUID,
  p_payload_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_existing public.tbm_telegram_dispatches%ROWTYPE;
  v_recent_count INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다.';
  END IF;
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'request_id가 필요합니다.';
  END IF;
  IF p_payload_hash IS NULL OR p_payload_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'payload_hash 형식이 올바르지 않습니다.';
  END IF;

  -- 동일 사용자의 경쟁 요청을 직렬화해 조회와 10분 상한 계산, INSERT를 원자화한다.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::TEXT, 0));

  SELECT *
    INTO v_existing
    FROM public.tbm_telegram_dispatches
   WHERE user_id = v_user_id
     AND request_id = p_request_id;

  IF FOUND THEN
    IF v_existing.payload_hash <> p_payload_hash THEN
      RETURN jsonb_build_object('outcome', 'conflict');
    END IF;
    IF v_existing.status = 'pending' THEN
      RETURN jsonb_build_object('outcome', 'in_progress');
    END IF;
    RETURN jsonb_build_object(
      'outcome', 'replay',
      'status', v_existing.status,
      'result', v_existing.result
    );
  END IF;

  SELECT COUNT(*)
    INTO v_recent_count
    FROM public.tbm_telegram_dispatches
   WHERE user_id = v_user_id
     AND created_at >= NOW() - INTERVAL '10 minutes';

  IF v_recent_count >= 2 THEN
    RETURN jsonb_build_object('outcome', 'rate_limited');
  END IF;

  INSERT INTO public.tbm_telegram_dispatches (user_id, request_id, payload_hash)
  VALUES (v_user_id, p_request_id, p_payload_hash);

  RETURN jsonb_build_object('outcome', 'reserved');
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_tbm_telegram_dispatch(
  p_request_id UUID,
  p_status TEXT,
  p_result JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다.';
  END IF;
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'request_id가 필요합니다.';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('completed', 'failed') THEN
    RAISE EXCEPTION '완료 상태가 올바르지 않습니다.';
  END IF;
  IF p_result IS NULL THEN
    RAISE EXCEPTION '발송 결과가 필요합니다.';
  END IF;
  IF pg_column_size(p_result) > 131072
     OR octet_length(p_result::TEXT) > 131072 THEN
    RAISE EXCEPTION '발송 결과는 131072바이트를 초과할 수 없습니다.';
  END IF;
  IF jsonb_typeof(p_result) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION '발송 결과는 JSON object여야 합니다.';
  END IF;

  IF p_status = 'completed' THEN
    IF p_result->'success' IS DISTINCT FROM 'true'::JSONB
       OR jsonb_typeof(p_result->'results') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION '완료 결과 형식이 올바르지 않습니다.';
    END IF;
    IF jsonb_array_length(p_result->'results') > 30 THEN
      RAISE EXCEPTION '완료 결과는 최대 30개까지 저장할 수 있습니다.';
    END IF;
  ELSE
    IF p_result->'success' IS DISTINCT FROM 'false'::JSONB
       OR jsonb_typeof(p_result->'error') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION '실패 결과 형식이 올바르지 않습니다.';
    END IF;
    IF length(p_result->>'error') > 500 THEN
      RAISE EXCEPTION '실패 오류 메시지는 500자를 초과할 수 없습니다.';
    END IF;
  END IF;

  UPDATE public.tbm_telegram_dispatches
     SET status = p_status,
         result = p_result,
         completed_at = NOW()
   WHERE user_id = v_user_id
     AND request_id = p_request_id
     AND status = 'pending';

  RETURN FOUND;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reserve_tbm_telegram_dispatch(UUID, TEXT)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.finish_tbm_telegram_dispatch(UUID, TEXT, JSONB)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_tbm_telegram_dispatch(UUID, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.finish_tbm_telegram_dispatch(UUID, TEXT, JSONB)
  TO authenticated;
