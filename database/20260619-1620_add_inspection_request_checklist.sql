-- 검측요청서에 검측 체크리스트(별지 제5호) 컬럼 추가 — 요청서 1건에 체크리스트 1건 첨부
-- 헤더(시설물명/위치/공종명/물량)는 기존 검측요청서 필드(structure_name/inspection_part/work_type/quantity)를 공유하므로 별도 컬럼을 두지 않는다.
ALTER TABLE inspection_requests
  ADD COLUMN IF NOT EXISTS checklist_items JSONB DEFAULT '[]'::jsonb, -- 검측 항목 목록(고정 14행)
  ADD COLUMN IF NOT EXISTS contractor_check_date DATE,              -- 시공자 점검일자
  ADD COLUMN IF NOT EXISTS supervisor_check_date DATE;              -- 감독원 검측일자
