-- 프로젝트 나라장터 계약정보 연계용 컬럼 추가 (계약번호·공고번호로 프로젝트 기본정보 자동입력)

ALTER TABLE projects ADD COLUMN IF NOT EXISTS g2b_cntrct_no TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS g2b_ntce_no TEXT;

COMMENT ON COLUMN projects.g2b_cntrct_no IS '나라장터 확정계약번호 (조달청 계약정보서비스 dcsnCntrctNo)';
COMMENT ON COLUMN projects.g2b_ntce_no IS '나라장터 입찰공고번호 (조달청 계약정보서비스 ntceNo)';
