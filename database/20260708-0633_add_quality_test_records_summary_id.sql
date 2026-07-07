-- 실시대장 기록을 성과총괄표 하위로 연결하는 summary_id 컬럼 추가 (총괄표 삭제 시 미지정으로 남도록 SET NULL)
ALTER TABLE quality_test_records
  ADD COLUMN summary_id UUID REFERENCES quality_summary_reports(id) ON DELETE SET NULL;

CREATE INDEX idx_quality_test_records_summary_id ON quality_test_records(summary_id);
