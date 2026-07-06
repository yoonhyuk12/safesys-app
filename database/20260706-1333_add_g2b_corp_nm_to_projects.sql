-- 프로젝트 나라장터 연계 시 계약업체명을 별도 저장하는 컬럼 추가

ALTER TABLE projects ADD COLUMN IF NOT EXISTS g2b_corp_nm TEXT;

COMMENT ON COLUMN projects.g2b_corp_nm IS '나라장터 계약업체명 (공동도급이면 쉼표로 연결, 조달청 계약정보서비스 corpList에서 추출)';
