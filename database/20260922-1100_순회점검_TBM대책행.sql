-- 순회점검대장 점검항목을 13행으로 늘리고 분류 'TBM 대책'을 허용한다. 앞 10행은 AI, 뒤 3행은 당일(없으면 최근) TBM 대책 1~3의 이행 여부다.
BEGIN;

CREATE OR REPLACE FUNCTION public.patrol_ledger_items_valid(p_items JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  item JSONB;
  item_no NUMERIC;
BEGIN
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN RETURN FALSE; END IF;
  IF jsonb_array_length(p_items) NOT BETWEEN 1 AND 13 THEN RETURN FALSE; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'object'
       OR jsonb_typeof(item -> 'no') IS DISTINCT FROM 'number'
       OR jsonb_typeof(item -> 'category') IS DISTINCT FROM 'string'
       OR jsonb_typeof(item -> 'text') IS DISTINCT FROM 'string'
       OR jsonb_typeof(item -> 'result') IS DISTINCT FROM 'string' THEN RETURN FALSE; END IF;
    item_no := (item ->> 'no')::NUMERIC;
    IF item_no NOT BETWEEN 1 AND 13 OR item_no <> TRUNC(item_no)
       OR (item ->> 'category') NOT IN ('작업장 공통', '테마', 'TBM 대책')
       OR (item ->> 'text') !~ '[^[:space:]]'
       OR (item ->> 'result') NOT IN ('양호', '미흡', '해당없음', '') THEN RETURN FALSE; END IF;
  END LOOP;
  RETURN TRUE;
END;
$$;

COMMENT ON COLUMN public.patrol_ledger_inspections.items IS '점검항목 1~13건. 번호·분류(작업장 공통/테마/TBM 대책)·본문·결과(양호/미흡/해당없음/미점검 빈 문자열).';

COMMIT;
