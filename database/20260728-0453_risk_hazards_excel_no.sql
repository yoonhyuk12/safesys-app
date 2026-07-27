-- 위험요인에 원본 엑셀 No. 컬럼 값을 보관해 원본 대조 표기에 쓰게 하는 마이그레이션

-- 재실행 안전: IF NOT EXISTS 사용. Supabase 콘솔에서 수동 적용.
-- 값 채움은 safesys-app/scripts/import-risk-hazards.js 재실행(전체 재적재)으로 수행한다.
ALTER TABLE public.risk_hazards
  ADD COLUMN IF NOT EXISTS excel_no INTEGER;

COMMENT ON COLUMN public.risk_hazards.excel_no IS
  '원본 엑셀 "위험요인 도출표(최종)" No. 컬럼 값. 원본 대조용 표기이며 식별자가 아니다 — 직전 행과 값이 같은 중복 6건과 번호가 되돌아가는 재시작 9곳이 있어 최대값(18,244)이 실제 위험요인 수(18,259)보다 작다. 행 식별은 id를 쓴다';
