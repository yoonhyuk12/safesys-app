-- 사고발생보고서의 추가 항목과 축소 사진을 public.project_accidents에 JSONB 한 칸으로 붙인다
-- 배경: 20260916-1032로 현장이 직접 사고를 보고하게 되었지만, 실제 사고발생보고서 서식에는
--       통계 컬럼(중대도·인원·휴업일수)으로 담지 못하는 칸이 더 있다 — 보고자·보고일·보고 요지,
--       사고 시각, 피해자 인적사항, 인명 외 피해, 책임 소재, 신고처, 피해자 조치, 사진 등이다.
--       이 값들은 하나하나가 통계 축이 아니라 "그 보고서 한 장"의 내용이므로 컬럼을 열아홉 개 늘리는
--       대신 JSONB 한 칸에 통째로 담는다. 테이블·Storage 버킷을 새로 만들지 않아 기존 안전대시보드
--       사고현황 집계와 RLS 판정이 그대로 유지된다.
-- 변경: report_details JSONB 컬럼 하나와 그 형태를 검사하는 함수·CHECK 제약만 추가한다.
--       기존 컬럼·트리거·RLS 정책은 하나도 건드리지 않는다.
--       NULL 허용·기본값 없음이라 기존 행은 전부 NULL(보고서 미작성)로 남고 CHECK도 통과한다.
-- 조회 부담: 사진 base64가 들어가는 칸이라 목록·집계 질의는 이 컬럼을 읽지 않는다(앱의
--       PROJECT_ACCIDENT_LIST_COLUMNS가 컬럼을 명시한다). 상세·수정·HWPX 내려받기 직전에만 따로 읽는다.
-- 우회 차단:
--   * RLS가 "누가"를 막는다면 accident_report_details_valid는 "무엇을"을 막는다.
--     화면 검증을 우회한 직접 호출로도 형태가 깨진 보고서나 과대 사진이 저장되지 못한다.
--   * 허용한 열아홉 개 키 말고 다른 키가 하나라도 있으면 통째로 거부한다. JSONB 칸이
--     임의 데이터 보관소로 쓰이는 길을 막는다.
--   * 사진은 최대 2장, 브라우저에서 축소한 JPEG data URL(FF D8 FF 매직의 base64 표기 /9j/로 시작)만
--     받고 한 장당 1,400,000자로 제한한다. PNG·SVG·외부 URL·원본 크기 사진은 들어오지 못한다.
--     사진 한 장도 dataUrl·caption 두 키만 허용해 사진 객체가 곁다리 데이터 보관소가 되지 못하게 한다.
--   * 신고처는 4개, 피해자 조치는 3개가 선택지의 전부라 배열 길이도 거기까지다. 같은 값을 거듭
--     담아 배열을 부풀리고 그 안에 큰 JSON을 숨기는 길을 막는다.
--   * 길이 상한(짧은 칸 200자, 장문 4,000자, 사진 설명 200자)은 앱의
--     src/lib/accident-report.ts 상수와 같은 숫자다. 한쪽만 바뀌면 여기서 거부된다.
-- 적용 방법: Supabase 콘솔 → SQL Editor 에서 아래 전체를 실행
-- 선행 조건: 20260718-0506_add_project_accidents.sql,
--            20260718-0830_project_accidents_external_site.sql,
--            20260831-1730_project_accidents_workers_comp_claim.sql,
--            20260916-1032_사고보고_현장작성_권한.sql 이 먼저 적용되어 있어야 한다

BEGIN;

-- 보고서를 작성하지 않은 기존 등록분과 대시보드 간단 등록분은 NULL로 남는다.
ALTER TABLE public.project_accidents
  ADD COLUMN IF NOT EXISTS report_details JSONB;

-- CHECK 제약은 서브쿼리를 담을 수 없어 함수로 분리한다.
-- 배열 원소를 훑어야 하므로 jsonb_array_elements를 쓰는데, 인자가 배열이 아니면 그 자리에서
-- 오류가 난다. AND의 단락 평가에 기대지 않고 CASE로 '[]'를 먼저 깔아 두어 어떤 입력이 와도
-- 오류 대신 참·거짓만 나오게 한다.
CREATE OR REPLACE FUNCTION public.accident_report_details_valid(p JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_typeof(p) = 'object'
     -- 허용 키 열아홉 개 말고 다른 키가 남으면 거짓이다.
     AND (p - ARRAY[
           'reportTitle', 'reportDate', 'reporterName', 'reporterPosition', 'reporterPhone',
           'summary', 'accidentTime', 'victimDetails', 'damageDetails', 'propertyDamage',
           'responsibility', 'noNotificationReason', 'compensationDetails', 'actionDetails',
           'otherNotes', 'relatedContacts', 'notifications', 'victimActions', 'photos'
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

-- 다시 실행해도 같은 결과가 되도록 먼저 지운다.
ALTER TABLE public.project_accidents
  DROP CONSTRAINT IF EXISTS project_accidents_report_details_check;

ALTER TABLE public.project_accidents
  ADD CONSTRAINT project_accidents_report_details_check
  CHECK (report_details IS NULL OR public.accident_report_details_valid(report_details));

COMMENT ON COLUMN public.project_accidents.report_details IS
  '사고발생보고서 추가 항목과 축소 JPEG 사진(최대 2장) JSONB. NULL이면 보고서를 작성하지 않은 등록분. 목록·집계 조회는 이 컬럼을 읽지 않는다.';
COMMENT ON FUNCTION public.accident_report_details_valid(JSONB) IS
  'project_accidents.report_details의 형태를 검사한다. 허용 키 열아홉 개, 짧은 칸 200자·장문 4,000자, 보고일 YYYY-MM-DD·사고 시각 HH:mm, 신고처 4개·피해자 조치 3개 이하의 선택지 배열, 사진 최대 2장의 축소 JPEG data URL(1,400,000자 이하)·설명 200자, 사진 객체는 dataUrl·caption 키만 통과한다.';

COMMIT;
