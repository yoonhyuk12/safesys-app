-- workers 테이블에 근로계약 기간 컬럼 추가
ALTER TABLE workers ADD COLUMN IF NOT EXISTS contract_start_date DATE;
ALTER TABLE workers ADD COLUMN IF NOT EXISTS contract_end_date DATE;

-- workers 테이블에 신분증 사진 URL 컬럼 추가
ALTER TABLE workers ADD COLUMN IF NOT EXISTS id_card_url TEXT;
