-- 사고 이력에 산재신청 연도(workers_comp_claim_year)를 기록하는 컬럼을 추가하고 기존 등록분은 모두 2026년으로 채운다.
-- 적용 순서: 20260916-1720_사고보고_산재요양_예상일수.sql 다음, 앱 배포 전에 실행한다. RLS·트리거 변경 없음.
-- 새 등록은 앱이 당해 연도를 기본값으로 넣고 사용자가 ± 버튼으로 조정한다.
BEGIN;

ALTER TABLE public.project_accidents
  ADD COLUMN IF NOT EXISTS workers_comp_claim_year SMALLINT;

ALTER TABLE public.project_accidents
  DROP CONSTRAINT IF EXISTS project_accidents_workers_comp_claim_year_check;

ALTER TABLE public.project_accidents
  ADD CONSTRAINT project_accidents_workers_comp_claim_year_check
  CHECK (workers_comp_claim_year IS NULL OR workers_comp_claim_year BETWEEN 2000 AND 2100);

-- 기존 등록분은 전부 2026년 신청 건으로 본다 (컬럼 도입 시점의 결정).
UPDATE public.project_accidents
   SET workers_comp_claim_year = 2026
 WHERE workers_comp_claim_year IS NULL;

COMMENT ON COLUMN public.project_accidents.workers_comp_claim_year IS
  '산재신청 연도(2000~2100). NULL=미입력. 컬럼 도입 전 등록분은 2026으로 일괄 설정';

COMMIT;
