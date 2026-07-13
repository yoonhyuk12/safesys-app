-- 지급자재의 나라장터 지급 합계와 정산연도 조회 결과를 저장해 화면 방문마다 재조회하지 않도록 한다.

ALTER TABLE materials ADD COLUMN IF NOT EXISTS g2b_pay_total bigint;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS g2b_pay_doc_count integer;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS g2b_settlement_year text;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS g2b_pay_insp_checked_at timestamptz;

COMMENT ON COLUMN materials.g2b_pay_total IS '나라장터 대금지급 문서 전체 합계금액(원)';
COMMENT ON COLUMN materials.g2b_pay_doc_count IS '나라장터 대금지급 문서 건수';
COMMENT ON COLUMN materials.g2b_settlement_year IS '최종 지급연도와 납품기한 연도가 다르고 지급합계가 계약금액의 90% 이상일 때 최종 지급문서 지급연도';
COMMENT ON COLUMN materials.g2b_pay_insp_checked_at IS '나라장터 대금지급·검사검수 문서 마지막 조회시각';
