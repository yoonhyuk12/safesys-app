-- AI 모델별 원화 단가를 채우는 마이그레이션 (2026-08-28 조사 기준, 환율 1,382원/USD)

-- 단가 출처와 환산 근거
--   gpt-5.6-luna            $0.20 / $1.20  per 1M tokens  → 276원 / 1,658원
--   gemini-flash-lite-latest $0.30 / $2.50  per 1M tokens  → 415원 / 3,455원
--     (이 별칭은 2026-08 현재 Gemini 3.5 Flash-Lite를 가리키며 Google이 예고 후 교체한다)
--   tts-1                   $15.00        per 1M chars   → 20,730원 (토큰이 아니라 문자 기준)
--
-- 모델명 기준으로 갱신한다. 관리자가 화면에서 모델을 바꾸면 단가도 함께 손봐야 한다.

UPDATE public.ai_model_settings
SET input_price_per_1m = 276, output_price_per_1m = 1658, updated_at = NOW()
WHERE model = 'gpt-5.6-luna';

UPDATE public.ai_model_settings
SET input_price_per_1m = 415, output_price_per_1m = 3455, updated_at = NOW()
WHERE model = 'gemini-flash-lite-latest';

-- TTS는 출력 과금이 없고 입력 문자 수로만 계산한다. output은 NULL로 둔다.
UPDATE public.ai_model_settings
SET input_price_per_1m = 20730, output_price_per_1m = NULL, updated_at = NOW()
WHERE model = 'tts-1';

-- 확인용 — 실행 후 22행의 단가가 모두 채워졌는지 본다(tts-1의 output만 NULL이 정상).
SELECT feature_key, provider, model, input_price_per_1m, output_price_per_1m
FROM public.ai_model_settings
ORDER BY sort_order;
