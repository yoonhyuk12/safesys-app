-- 자재 수불 내역에 검수 사진 컬럼 추가 (선택 항목, Storage public URL 배열)
ALTER TABLE material_ledger_entries ADD COLUMN inspection_photos JSONB;

COMMENT ON COLUMN material_ledger_entries.inspection_photos IS '검수 사진 URL 배열 (safety-inspection-photos 버킷, 선택 항목) — 검수조서 사진대지 출력에 사용';
