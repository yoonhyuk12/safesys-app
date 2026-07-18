-- work_plans.plan_types CHECK 제약에 excavation(굴착) 서식 추가
ALTER TABLE public.work_plans DROP CONSTRAINT IF EXISTS work_plans_plan_types_check;
ALTER TABLE public.work_plans ADD CONSTRAINT work_plans_plan_types_check CHECK (
  cardinality(plan_types) > 0
  AND plan_types <@ ARRAY['loading', 'construction', 'electric', 'heavy', 'excavation']::TEXT[]
);
