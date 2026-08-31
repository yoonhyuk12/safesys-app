-- 사고 이력에 산재신청 여부를 기록하는 컬럼을 추가하는 마이그레이션

ALTER TABLE public.project_accidents
  ADD COLUMN IF NOT EXISTS workers_comp_claim TEXT;

ALTER TABLE public.project_accidents
  DROP CONSTRAINT IF EXISTS project_accidents_workers_comp_claim_check;

ALTER TABLE public.project_accidents
  ADD CONSTRAINT project_accidents_workers_comp_claim_check
  CHECK (workers_comp_claim IS NULL OR workers_comp_claim IN ('applied', 'not_applied'));

COMMENT ON COLUMN public.project_accidents.workers_comp_claim IS
  '산재신청 여부: applied=신청, not_applied=미신청, NULL=미확인(기존 등록분 기본값)';
