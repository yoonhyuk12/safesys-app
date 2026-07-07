-- 지급자재 수불부 행에 단가 컬럼 추가 (조달청 납품요구 품목 단가 자동 입력, 수동 수정 가능)
ALTER TABLE material_ledger_entries
  ADD COLUMN IF NOT EXISTS unit_price NUMERIC;

COMMENT ON COLUMN material_ledger_entries.unit_price IS '단가(원) — 조달청 납품요구 품목 단가(prdctUprc) 자동 입력, 수동 수정 가능';
