-- 본부 불시점검에 "5대 핵심 안전수칙" 점검 항목 컬럼 추가
-- (TBM 실시 / 신규근로자 현장 둘러보기 / 건설기계 주변 / 개인보호구 / 안전보건표지)
-- 17개 항목, 5개 카테고리

ALTER TABLE public.headquarters_inspections
  ADD COLUMN IF NOT EXISTS five_key_items jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.headquarters_inspections.five_key_items IS '5대 핵심 안전수칙 점검 항목 JSON (17개 항목, 5개 카테고리: TBM 실시 / 신규근로자 현장 둘러보기 / 건설기계 주변 / 개인보호구 / 안전보건표지)';
