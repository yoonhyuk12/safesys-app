-- 자재에 조달청 계약 부가정보(계약업체명·연락처·납품기한) 컬럼 추가 — 선택항목, 엑셀 미포함
ALTER TABLE materials ADD COLUMN IF NOT EXISTS dlvr_supplier TEXT;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS dlvr_supplier_tel TEXT;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS dlvr_deadline TEXT;

COMMENT ON COLUMN materials.dlvr_supplier IS '계약업체명 (납품요구 조회 시 자동 저장, 수정 가능)';
COMMENT ON COLUMN materials.dlvr_supplier_tel IS '계약업체 연락처 (API 미제공 — 수동 입력 선택항목)';
COMMENT ON COLUMN materials.dlvr_deadline IS '납품기한 YYYY-MM-DD (납품요구 품목 중 최댓값)';
