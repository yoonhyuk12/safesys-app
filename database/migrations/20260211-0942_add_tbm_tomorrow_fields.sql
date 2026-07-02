-- TBM 안전활동 점검표에 명일 사항 컬럼 추가

-- 명일 사항 관련 컬럼 추가
ALTER TABLE tbm_safety_inspections
ADD COLUMN IF NOT EXISTS tomorrow_work_status BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS tomorrow_is_attended BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS tomorrow_non_attendance_reason TEXT,
ADD COLUMN IF NOT EXISTS tomorrow_attendee VARCHAR(100);

-- 코멘트 추가
COMMENT ON COLUMN tbm_safety_inspections.tomorrow_work_status IS '명일 작업여부 (true: 작업, false: 미작업)';
COMMENT ON COLUMN tbm_safety_inspections.tomorrow_is_attended IS '명일 입회여부';
COMMENT ON COLUMN tbm_safety_inspections.tomorrow_non_attendance_reason IS '명일 미입회 사유';
COMMENT ON COLUMN tbm_safety_inspections.tomorrow_attendee IS '명일 입회예정자';
