-- 정기안전점검에 특별점검(굴삭기 버킷 사고) 유형을 허용하고, 굴착기별 점검표 데이터를 담을 excavator_inspection 컬럼을 추가한다.
-- 적용 순서: 20261001-0556_사고보고_신규근로자_외국인_여부.sql 다음, 앱 배포(main 푸시) 전에 실행한다. RLS·트리거 변경 없음.
-- 기존 CHECK 제약은 콘솔에서 직접 만든 것이라 저장소에 원본 마이그레이션이 없다. 여기서 5개 유형으로 다시 정의한다.
BEGIN;

ALTER TABLE public.safety_inspections
  DROP CONSTRAINT IF EXISTS safety_inspections_inspection_type_check;

ALTER TABLE public.safety_inspections
  ADD CONSTRAINT safety_inspections_inspection_type_check
  CHECK (inspection_type = ANY (ARRAY[
    '해빙기'::text,
    '우기'::text,
    '종합'::text,
    '특별점검(안전혁신건설-287)'::text,
    '특별점검(굴삭기 버킷 사고)'::text
  ]));

ALTER TABLE public.safety_inspections
  ADD COLUMN IF NOT EXISTS excavator_inspection JSONB;

COMMENT ON COLUMN public.safety_inspections.excavator_inspection IS
  '굴삭기 버킷 사고 특별점검 전용. {inspection_team, inspected_work, excavators:[{id, vehicle_no, items:{code:{judgement, finding, action, before_photo_url, after_photo_url, action_due_date}}, etc_text, pin_photo_url}], site_photo_urls}. 다른 유형은 null';

COMMIT;
