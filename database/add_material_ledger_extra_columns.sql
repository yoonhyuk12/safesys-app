-- material_ledger_entries 테이블에 품명/규격, 발주량, 불합격량 텍스트 컬럼 추가

ALTER TABLE material_ledger_entries
ADD COLUMN IF NOT EXISTS name_or_spec TEXT;

ALTER TABLE material_ledger_entries
ADD COLUMN IF NOT EXISTS order_qty NUMERIC;

ALTER TABLE material_ledger_entries
ADD COLUMN IF NOT EXISTS fail_qty_text TEXT;

COMMENT ON COLUMN material_ledger_entries.name_or_spec IS '품명 또는 규격';
COMMENT ON COLUMN material_ledger_entries.order_qty IS '발주량(설계량)';
COMMENT ON COLUMN material_ledger_entries.fail_qty_text IS '불합격량 텍스트 (예: -)';
