-- 자재 수불부 조달청 납품요구 연계용 컬럼 추가 (연계 버튼·발주량 동기화 기능에서 사용)

-- 자재가 어느 납품요구 건에 연결됐는지 + 마지막 동기화 시각
ALTER TABLE materials ADD COLUMN IF NOT EXISTS dlvr_req_no TEXT;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS dlvr_req_synced_at TIMESTAMPTZ;

-- 행(규격의 기준 행·증감 행)이 납품요구의 몇 번째 품목(prdctSno)에 대응하는지
ALTER TABLE material_ledger_entries ADD COLUMN IF NOT EXISTS dlvr_req_no TEXT;
ALTER TABLE material_ledger_entries ADD COLUMN IF NOT EXISTS dlvr_req_prdct_sno INTEGER;

COMMENT ON COLUMN materials.dlvr_req_no IS '조달청 나라장터 납품요구번호 (예: R25TB00824197)';
COMMENT ON COLUMN materials.dlvr_req_synced_at IS '조달청 발주량 마지막 동기화 시각';
COMMENT ON COLUMN material_ledger_entries.dlvr_req_no IS '이 행이 유래한 납품요구번호';
COMMENT ON COLUMN material_ledger_entries.dlvr_req_prdct_sno IS '납품요구 내 품목순번 (prdctSno) — 규격 매칭용';
