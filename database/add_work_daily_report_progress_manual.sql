-- 작업일보 공정률 수동 입력 여부 컬럼 추가
-- 사용자가 공정률을 직접 입력하면 그 값을 기준점으로
-- 착공(0%) → 입력일(입력값) → 준공(100%) 구간별 선형 보간으로 자동 계산
-- ※ add_work_daily_reports_table.sql을 이미 실행한 경우에만 이 파일을 실행 (신규 설치는 본 파일 불필요)
ALTER TABLE work_daily_reports ADD COLUMN IF NOT EXISTS progress_rate_manual BOOLEAN DEFAULT false;

COMMENT ON COLUMN work_daily_reports.progress_rate_manual IS '사용자가 직접 입력한 공정률 여부 (보간 기준점)';
