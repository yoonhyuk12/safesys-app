-- 품질검사 실시대장에 일련번호 컬럼 추가 (한 제출건의 복수 시험 항목이 같은 번호를 공유)
ALTER TABLE quality_test_records ADD COLUMN IF NOT EXISTS serial_no INTEGER;

-- 기존 행은 프로젝트별 시험일→작성일 순서로 1부터 채번 (기존 행은 항목당 1건이므로 번호가 겹치지 않음)
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY project_id
    ORDER BY test_date NULLS LAST, created_at
  ) AS rn
  FROM quality_test_records
  WHERE serial_no IS NULL
)
UPDATE quality_test_records qtr
SET serial_no = numbered.rn
FROM numbered
WHERE qtr.id = numbered.id;
