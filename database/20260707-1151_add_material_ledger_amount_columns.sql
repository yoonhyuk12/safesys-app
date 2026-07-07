-- 지급자재 수불부 행에 조달청 인도조건·품대(품목금액)·조달수수료 컬럼 추가 (합계는 품대+수수료로 화면 계산)
ALTER TABLE material_ledger_entries
  ADD COLUMN IF NOT EXISTS dlvr_cndtn TEXT,
  ADD COLUMN IF NOT EXISTS prdct_amt NUMERIC,
  ADD COLUMN IF NOT EXISTS fee_amt NUMERIC;

COMMENT ON COLUMN material_ledger_entries.dlvr_cndtn IS '인도조건 — 조달청 종합쇼핑몰 품목 인도조건(예: 현장설치도), 등록·연계 시 자동 입력, 수동 수정 가능';
COMMENT ON COLUMN material_ledger_entries.prdct_amt IS '품대(물품대금, 원) — 조달청 납품요구 품목금액 자동 입력, 수동 수정 가능';
COMMENT ON COLUMN material_ledger_entries.fee_amt IS '조달수수료(원) — 조달청 API 미제공으로 수동 입력';
