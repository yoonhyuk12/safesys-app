-- 프로젝트에 위험성평가용 확정 사업별을 기억시키는 컬럼을 추가하는 마이그레이션

-- project_category는 부서 축(64% 공백)이라 위험요인 DB의 사업별과 매칭되지 않는다.
-- 프로젝트명 유추(src/lib/risk-assessment/business-type-infer.ts) 결과를 사용자가 확정하면
-- 이 컬럼에 write-back 해서 다음 평가부터 재확인을 생략한다. 사업 무관(전체) 모드는 NULL로 둔다.
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS risk_business_type TEXT;

COMMENT ON COLUMN public.projects.risk_business_type IS
  '위험성평가 유해·위험요인 DB의 확정 사업별(risk_hazards.business_type 16종 중 하나). 미확정·전체 모드는 NULL';
