-- AI 기능별 제조사·모델명을 관리자가 편집할 수 있도록 보관하는 테이블 마이그레이션

-- 재실행 안전: IF NOT EXISTS 사용. Supabase SQL Editor에서 수동 적용.
CREATE TABLE IF NOT EXISTS public.ai_model_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  location TEXT NOT NULL,
  feature TEXT NOT NULL,
  remarks TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 관리자 목록 조회가 항상 sort_order 오름차순 스캔이다.
CREATE INDEX IF NOT EXISTS idx_ai_model_settings_sort_order
  ON public.ai_model_settings(sort_order);

-- 정책을 하나도 만들지 않아 anon·authenticated는 전면 차단되고 service role만 읽고 쓴다.
ALTER TABLE public.ai_model_settings ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.ai_model_settings IS
  'AI 기능별 제조사·모델명 설정. service role 전용이며 라우트는 src/lib/ai-models.ts로 조회한다(TTL 60초 캐시).';
COMMENT ON COLUMN public.ai_model_settings.feature_key IS
  'src/lib/ai-models.ts의 DEFAULT_AI_MODELS와 1:1로 대응하는 기능 식별자. 코드가 이 값으로 모델을 찾는다.';
COMMENT ON COLUMN public.ai_model_settings.location IS
  '모델을 호출하는 라우트 경로. 표시 전용이며 코드 이동 시 갱신한다.';

-- 시드 22행 — 2026-08-13 전수 조사 기준 기본값. 이미 있으면 건드리지 않는다(관리자 편집값 보존).
INSERT INTO public.ai_model_settings (feature_key, provider, model, location, feature, remarks, sort_order)
VALUES
  ('chat.project-assistant', 'OpenAI', 'gpt-5.6-luna', 'src/app/api/chat/project-assistant/route.ts', '현장 AI 비서 챗봇', NULL, 1),
  ('chat.tbm', 'OpenAI', 'gpt-5.6-luna', 'src/app/api/chat/tbm/route.ts', 'TBM 현황 챗봇', NULL, 2),
  ('tbm-telegram.analyze', 'OpenAI', 'gpt-5.6-luna', 'src/app/api/tbm-telegram/analyze/route.ts', 'TBM 텔레그램 문안 생성', NULL, 3),
  ('ai.write-risk-analysis', 'OpenAI', 'gpt-5.4-nano', 'src/app/api/ai/write-risk-analysis/route.ts', 'TBM 위험분석 작성', NULL, 4),
  ('ai.translate', 'OpenAI', 'gpt-4o-mini', 'src/app/api/ai/translate/route.ts', '안전교육 다국어 번역', NULL, 5),
  ('ai.tts.translate', 'OpenAI', 'gpt-4o-mini', 'src/app/api/ai/tts/route.ts', 'TTS용 사전 번역', NULL, 6),
  ('ai.tts.speech', 'OpenAI', 'tts-1', 'src/app/api/ai/tts/route.ts', '음성 합성', 'OpenAI TTS 전용 모델만 지정 가능', 7),
  ('ai.tbm-safety-advice', 'OpenAI', 'gpt-4o-mini', 'src/app/api/ai/tbm-safety-advice/route.ts', 'TBM 안전조치 확인사항', NULL, 8),
  ('ai.ptw-work-summary', 'OpenAI', 'gpt-4o-mini', 'src/app/api/ai/ptw-work-summary/route.ts', '작업허가서 업무요약', NULL, 9),
  ('ai.ptw-risk-analysis', 'OpenAI', 'gpt-4o-mini', 'src/app/api/ai/ptw-risk-analysis/route.ts', '작업허가서 위험분석', NULL, 10),
  ('ai.headquarters-remarks', 'OpenAI', 'gpt-4o-mini', 'src/app/api/ai/headquarters-remarks/route.ts', '본부점검 의견 생성', NULL, 11),
  ('ai.extract-equipment-count', 'OpenAI', 'gpt-4o-mini', 'src/app/api/ai/extract-equipment-count/route.ts', '장비 대수 추출', NULL, 12),
  ('ai.daily-inspection', 'OpenAI', 'gpt-4o-mini', 'src/app/api/ai/daily-inspection/route.ts', '일일점검 체크리스트 생성', NULL, 13),
  ('ai.ocr-card', 'OpenAI', 'gpt-4o-mini', 'src/app/api/ai/ocr-card/route.ts', '교육 이수증 OCR', NULL, 14),
  ('ai.supervisor-summary.remarks', 'OpenAI', 'gpt-4o-mini', 'src/app/api/ai/supervisor-summary/route.ts', '감독일지 의견·요약', NULL, 15),
  ('ai.inspection-checklist', 'Google', 'gemini-3.1-flash-lite', 'src/app/api/ai/inspection-checklist/route.ts', '검측 체크리스트 생성', NULL, 16),
  ('ai.work-plan', 'Google', 'gemini-3.1-flash-lite', 'src/app/api/ai/work-plan/route.ts', 'AI 작업계획서 초안', NULL, 17),
  ('ai.supervisor-summary.classify', 'Google', 'gemini-3.1-flash-lite', 'src/app/api/ai/supervisor-summary/route.ts', '감독일지 장비·인력 분류', NULL, 18),
  ('ai.risk-assessment', 'Google', 'gemini-flash-lite-latest', 'src/app/api/ai/risk-assessment/route.ts', '수시 위험성평가 AI 판정', '폴백 체인 gemini-3.1-flash-lite 자동 적용', 19),
  ('ai.risk-classify', 'Google', 'gemini-flash-lite-latest', 'src/app/api/ai/risk-classify/route.ts', '작업내용 분류 매칭', '폴백 체인 gemini-3.1-flash-lite 자동 적용', 20),
  ('ai.risk-row', 'Google', 'gemini-flash-lite-latest', 'src/app/api/ai/risk-row/route.ts', '새 위험요인 행 작성', '폴백 체인 gemini-3.1-flash-lite 자동 적용', 21),
  ('ai.tbm-risk-link', 'Google', 'gemini-flash-lite-latest', 'src/app/api/ai/tbm-risk-link/route.ts', 'TBM 위험요인 연계', '폴백 체인 gemini-3.1-flash-lite 자동 적용', 22)
ON CONFLICT (feature_key) DO NOTHING;
