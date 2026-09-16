-- 사고보고 추가 항목에 산재요양 예상 일수를 허용하고 기존 사진·문자·선택지 검증을 보존한다.
-- 적용 순서: 20260916-1418_사고보고_보고서_항목.sql 다음, 앱 배포 전에 실행한다.
-- expectedTreatmentDays는 선택 키이며 빈 문자열 또는 0 이상 안전 정수 문자열이다.
-- 기존 NULL·키 없는 보고서와 휴업일수는 변경하지 않는다. 컬럼·RLS·트리거 변경 없음.
BEGIN;

CREATE OR REPLACE FUNCTION public.accident_report_details_valid(p JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_typeof(p) = 'object'
     -- 허용 키 스무 개 말고 다른 키가 남으면 거짓이다.
     AND (p - ARRAY[
           'reportTitle', 'reportDate', 'reporterName', 'reporterPosition', 'reporterPhone',
           'summary', 'accidentTime', 'victimDetails', 'damageDetails', 'propertyDamage',
           'responsibility', 'noNotificationReason', 'compensationDetails', 'actionDetails',
           'otherNotes', 'relatedContacts', 'notifications', 'victimActions', 'photos',
           'expectedTreatmentDays'
         ]::TEXT[]) = '{}'::JSONB
     -- 짧은 칸(제목·보고일·보고자 성명/직책/연락처·사고 시각)은 있으면 문자열 200자 이하다.
     AND NOT EXISTS (
       SELECT 1
         FROM unnest(ARRAY[
                'reportTitle', 'reportDate', 'reporterName',
                'reporterPosition', 'reporterPhone', 'accidentTime'
              ]) AS short_key
        WHERE p -> short_key IS NOT NULL
          AND (
            jsonb_typeof(p -> short_key) IS DISTINCT FROM 'string'
            OR LENGTH(p ->> short_key) > 200
          )
     )
     -- 장문 칸(요지·피해·조치 등)은 있으면 문자열 4,000자 이하다.
     AND NOT EXISTS (
       SELECT 1
         FROM unnest(ARRAY[
                'summary', 'victimDetails', 'damageDetails', 'propertyDamage', 'responsibility',
                'noNotificationReason', 'compensationDetails', 'actionDetails',
                'otherNotes', 'relatedContacts'
              ]) AS long_key
        WHERE p -> long_key IS NOT NULL
          AND (
            jsonb_typeof(p -> long_key) IS DISTINCT FROM 'string'
            OR LENGTH(p ->> long_key) > 4000
          )
     )
     -- 비어 있으면(미기재) 통과하고, 적었으면 형식을 지킨다.
     AND (COALESCE(p ->> 'reportDate', '') = '' OR p ->> 'reportDate' ~ '^\d{4}-\d{2}-\d{2}$')
     AND (COALESCE(p ->> 'accidentTime', '') = '' OR p ->> 'accidentTime' ~ '^([01]\d|2[0-3]):[0-5]\d$')
     -- 미입력은 빈 문자열이며, 값이 있으면 0 이상 JavaScript 안전 정수 문자열이다.
     -- CASE 안에서 형식·길이를 먼저 검사해 숫자 캐스트 오류를 막는다.
     AND CASE
       WHEN p -> 'expectedTreatmentDays' IS NULL THEN TRUE
       WHEN jsonb_typeof(p -> 'expectedTreatmentDays') IS DISTINCT FROM 'string' THEN FALSE
       WHEN p ->> 'expectedTreatmentDays' = '' THEN TRUE
       WHEN LENGTH(p ->> 'expectedTreatmentDays') <= 200
            AND p ->> 'expectedTreatmentDays' ~ '^[0-9]+$'
         THEN (p ->> 'expectedTreatmentDays')::NUMERIC <= 9007199254740991
       ELSE FALSE
     END
     -- 신고처·피해자 조치는 없거나 정해진 선택지만 담은 배열이다.
     AND (p -> 'notifications' IS NULL OR jsonb_typeof(p -> 'notifications') = 'array')
     -- 선택지가 넷뿐이라 배열도 넷을 넘지 못한다. 같은 값을 거듭 담아 부풀리는 길을 막는다.
     AND jsonb_array_length(
           CASE WHEN jsonb_typeof(p -> 'notifications') = 'array'
                THEN p -> 'notifications' ELSE '[]'::JSONB END
         ) <= 4
     AND NOT EXISTS (
       SELECT 1
         FROM jsonb_array_elements(
                CASE WHEN jsonb_typeof(p -> 'notifications') = 'array'
                     THEN p -> 'notifications' ELSE '[]'::JSONB END
              ) AS notification
        WHERE jsonb_typeof(notification) IS DISTINCT FROM 'string'
           OR (notification #>> '{}') NOT IN ('emergency119', 'police', 'laborOffice', 'family')
     )
     AND (p -> 'victimActions' IS NULL OR jsonb_typeof(p -> 'victimActions') = 'array')
     -- 선택지가 셋뿐이라 배열도 셋을 넘지 못한다.
     AND jsonb_array_length(
           CASE WHEN jsonb_typeof(p -> 'victimActions') = 'array'
                THEN p -> 'victimActions' ELSE '[]'::JSONB END
         ) <= 3
     AND NOT EXISTS (
       SELECT 1
         FROM jsonb_array_elements(
                CASE WHEN jsonb_typeof(p -> 'victimActions') = 'array'
                     THEN p -> 'victimActions' ELSE '[]'::JSONB END
              ) AS victim_action
        WHERE jsonb_typeof(victim_action) IS DISTINCT FROM 'string'
           OR (victim_action #>> '{}') NOT IN ('hospital', 'funeralHome', 'home')
     )
     -- 사진은 없거나 최대 두 장의 축소 JPEG data URL 배열이다.
     AND (p -> 'photos' IS NULL OR jsonb_typeof(p -> 'photos') = 'array')
     AND jsonb_array_length(
           CASE WHEN jsonb_typeof(p -> 'photos') = 'array' THEN p -> 'photos' ELSE '[]'::JSONB END
         ) <= 2
     AND NOT EXISTS (
       SELECT 1
         FROM jsonb_array_elements(
                CASE WHEN jsonb_typeof(p -> 'photos') = 'array'
                     THEN p -> 'photos' ELSE '[]'::JSONB END
              ) AS photo
        WHERE jsonb_typeof(photo) IS DISTINCT FROM 'object'
           -- 사진 한 장에도 dataUrl·caption 말고 다른 키가 붙으면 거짓이다.
           OR (
                CASE WHEN jsonb_typeof(photo) = 'object'
                     THEN photo - ARRAY['dataUrl', 'caption']::TEXT[] ELSE '{}'::JSONB END
              ) <> '{}'::JSONB
           OR jsonb_typeof(photo -> 'dataUrl') IS DISTINCT FROM 'string'
           OR (photo ->> 'dataUrl') !~ '^data:image/jpeg;base64,/9j/[A-Za-z0-9+/]+={0,2}$'
           OR LENGTH(photo ->> 'dataUrl') > 1400000
           OR (
             photo -> 'caption' IS NOT NULL
             AND (
               jsonb_typeof(photo -> 'caption') IS DISTINCT FROM 'string'
               OR LENGTH(photo ->> 'caption') > 200
             )
           )
     );
$$;

COMMENT ON FUNCTION public.accident_report_details_valid(JSONB) IS
  'report_details 허용 키 스무 개. 기존 문자열·날짜·시각·선택지·축소 JPEG 사진 검증을 유지하고 expectedTreatmentDays는 빈 문자열 또는 0 이상 9007199254740991 이하의 정수 문자열(최대 200자)만 허용한다.';

COMMIT;
