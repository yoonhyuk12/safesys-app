-- 사고 이력에 신규근로자 여부(is_new_worker)·외국인 여부(is_foreign_worker) 컬럼을 추가한다.
-- 적용 순서: 20260917-1555_사고보고_산재신청_연도.sql 다음, 앱 배포 전에 실행한다. RLS·트리거 변경 없음.
-- 신규근로자는 출근 일주일 이내 근로자를 뜻한다. 기존 등록분은 false(미체크)로 본다.
BEGIN;

ALTER TABLE public.project_accidents
  ADD COLUMN IF NOT EXISTS is_new_worker BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.project_accidents
  ADD COLUMN IF NOT EXISTS is_foreign_worker BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.project_accidents.is_new_worker IS
  '신규근로자 여부(출근 일주일 이내). 기존 등록분은 false(미체크)';

COMMENT ON COLUMN public.project_accidents.is_foreign_worker IS
  '외국인 근로자 여부. 기존 등록분은 false(미체크)';

COMMIT;
