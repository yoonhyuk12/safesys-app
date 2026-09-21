-- 순회점검대장 점검결과에 '해당없음'을 허용한다. 기존 '양호'·'미흡'·미점검('')은 그대로 둔다.
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
  IF jsonb_array_length(p_items) NOT BETWEEN 1 AND 10 THEN RETURN FALSE; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'object'
       OR jsonb_typeof(item -> 'no') IS DISTINCT FROM 'number'
       OR jsonb_typeof(item -> 'category') IS DISTINCT FROM 'string'
       OR jsonb_typeof(item -> 'text') IS DISTINCT FROM 'string'
       OR jsonb_typeof(item -> 'result') IS DISTINCT FROM 'string' THEN RETURN FALSE; END IF;
    item_no := (item ->> 'no')::NUMERIC;
    IF item_no NOT BETWEEN 1 AND 10 OR item_no <> TRUNC(item_no)
       OR (item ->> 'category') NOT IN ('작업장 공통', '테마')
       OR (item ->> 'text') !~ '[^[:space:]]'
       OR (item ->> 'result') NOT IN ('양호', '미흡', '해당없음', '') THEN RETURN FALSE; END IF;
  END LOOP;
  RETURN TRUE;
END;
$$;

COMMIT;
