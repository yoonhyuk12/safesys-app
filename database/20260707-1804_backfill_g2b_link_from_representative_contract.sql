-- 대표계약이 지정된 프로젝트의 나라장터 연계(g2b_*)를 대표계약 값으로 일괄 동기화하는 백필
-- (대표계약 체크 → g2b_* 동기화 로직 도입 이전에 체크된 건 보정. 이후 체크부터는 앱이 함께 저장)

UPDATE projects p
SET g2b_cntrct_no = c.cntrct_no,
    g2b_ntce_no   = NULL, -- 이전 연계 계약의 공고번호가 남으면 서로 다른 계약을 가리키므로 정리
    g2b_corp_nm   = c.corp_nm,
    g2b_tot_amt   = c.tot_cntrct_amt,
    g2b_thtm_amt  = c.thtm_cntrct_amt
FROM project_contracts c
WHERE c.id = p.representative_contract_id;
