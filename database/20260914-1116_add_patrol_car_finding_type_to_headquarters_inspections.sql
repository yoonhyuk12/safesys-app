-- 본부 불시점검에 패트롤카 이용여부·지적유형 컬럼 추가
-- 지적유형은 코드로 저장한다: work_stop(작업중지) / corrective_action(시정조치) / not_applicable(해당없음)

ALTER TABLE public.headquarters_inspections
  ADD COLUMN IF NOT EXISTS patrol_car_used boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS finding_type text NOT NULL DEFAULT 'corrective_action';

ALTER TABLE public.headquarters_inspections
  DROP CONSTRAINT IF EXISTS headquarters_inspections_finding_type_check;

ALTER TABLE public.headquarters_inspections
  ADD CONSTRAINT headquarters_inspections_finding_type_check
  CHECK (finding_type IN ('work_stop', 'corrective_action', 'not_applicable'));

COMMENT ON COLUMN public.headquarters_inspections.patrol_car_used IS '패트롤카 이용여부';
COMMENT ON COLUMN public.headquarters_inspections.finding_type IS '지적유형 코드 (work_stop=작업중지, corrective_action=시정조치, not_applicable=해당없음). 기본 시정조치';
