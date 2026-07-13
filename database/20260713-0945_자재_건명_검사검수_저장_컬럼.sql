-- materials에 조달청 표시 정보 저장 컬럼 추가 — 건명·수요기관·접수일·검사검수/지급 최신 일자.
-- 등록·전체 조회·화면 배경 조회(write-back) 시 저장하고, 지급자재 원장·계약현황 물품 행은
-- 저장값을 우선 사용해 페이지를 열 때마다 나가던 조달청 재조회(dlvr-req-info·pay-insp)를 줄인다.
ALTER TABLE materials ADD COLUMN IF NOT EXISTS dlvr_title text;      -- 납품요구 건명
ALTER TABLE materials ADD COLUMN IF NOT EXISTS dlvr_dminstt text;    -- 수요기관명
ALTER TABLE materials ADD COLUMN IF NOT EXISTS dlvr_rcpt_date text;  -- 납품요구 접수일
ALTER TABLE materials ADD COLUMN IF NOT EXISTS g2b_insp_date text;   -- 나라장터 검사검수 문서 최신 일자
ALTER TABLE materials ADD COLUMN IF NOT EXISTS g2b_pay_date text;    -- 나라장터 대금지급 문서 최신 일자
