-- CCTV 촬영 및 이용 동의 컬럼 추가
-- workers 테이블에 CCTV 동의 필드 2개 추가

ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS agree_cctv_collection BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS agree_cctv_third_party BOOLEAN DEFAULT FALSE;

-- 컬럼 설명
COMMENT ON COLUMN workers.agree_cctv_collection IS 'CCTV 영상정보 수집 및 이용 동의';
COMMENT ON COLUMN workers.agree_cctv_third_party IS 'CCTV 영상정보 제3자 제공 동의';
