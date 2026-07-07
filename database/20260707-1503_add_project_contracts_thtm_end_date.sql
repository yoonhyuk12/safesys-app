-- 계약현황(project_contracts)에 금차 준공일 컬럼 추가 — 장기계속계약 차수별 연도 귀속의 기준
ALTER TABLE project_contracts
  ADD COLUMN IF NOT EXISTS thtm_end_date DATE;

COMMENT ON COLUMN project_contracts.thtm_end_date IS '금차 준공일 — 조달청 thtmCcmpltDate(공사)/thtmScmpltDate(용역). 장기계속계약 차수분의 귀속 연도 판정에 사용';
