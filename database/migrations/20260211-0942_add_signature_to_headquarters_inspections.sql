-- headquarters_inspections 테이블에 점검자 서명 컬럼 추가
ALTER TABLE public.headquarters_inspections
ADD COLUMN IF NOT EXISTS signature text;

COMMENT ON COLUMN public.headquarters_inspections.signature IS '점검자 서명 (Base64 이미지)';
