-- 프로젝트 나라장터 연계 시 총계약금액(원 단위)을 저장하는 컬럼 추가 (상세 페이지 천원 단위 표시용)

ALTER TABLE projects ADD COLUMN IF NOT EXISTS g2b_tot_amt BIGINT;

COMMENT ON COLUMN projects.g2b_tot_amt IS '나라장터 총계약금액 (원 단위, 조달청 계약정보서비스 totCntrctAmt)';
