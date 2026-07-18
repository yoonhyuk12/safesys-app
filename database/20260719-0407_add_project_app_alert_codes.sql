-- projects 테이블에 AI CCTV 알림앱(aicctvalert) 수신 개인코드 컬럼 추가
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS client_app_code TEXT,
  ADD COLUMN IF NOT EXISTS contractor_app_code TEXT;

COMMENT ON COLUMN projects.client_app_code IS '발주청 알림앱 개인코드 (복수: 쉼표 구분)';
COMMENT ON COLUMN projects.contractor_app_code IS '시공사 알림앱 개인코드 (복수: 쉼표 구분)';
