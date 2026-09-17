-- 순회점검대장의 항목·서명 스냅샷과 관할·작성자별 접근 권한을 만든다.
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
       OR (item ->> 'result') NOT IN ('양호', '미흡', '') THEN RETURN FALSE; END IF;
  END LOOP;
  RETURN TRUE;
END;
$$;

CREATE TABLE IF NOT EXISTS public.patrol_ledger_inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  inspection_date DATE NOT NULL,
  contractor_name TEXT NOT NULL DEFAULT '',
  district_name TEXT NOT NULL DEFAULT '',
  inspector_affiliation TEXT NOT NULL DEFAULT '',
  inspector_position TEXT NOT NULL DEFAULT '',
  inspector_name TEXT NOT NULL CHECK (
    BTRIM(inspector_name) <> '' AND LENGTH(inspector_name) <= 100 AND inspector_name !~ '[\r\n]'
  ),
  signature TEXT NOT NULL CHECK (
    signature LIKE 'data:image/png;base64,iVBORw0KGgo%'
    AND signature ~ '^data:image/png;base64,[A-Za-z0-9+/]+={0,2}$'
    AND LENGTH(signature) >= 200
  ),
  tbm_work_summary TEXT NOT NULL DEFAULT '',
  items JSONB NOT NULL CHECK (public.patrol_ledger_items_valid(items)),
  finding_text TEXT NOT NULL DEFAULT '',
  finding_photo_url TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_patrol_ledger_inspections_project_date
  ON public.patrol_ledger_inspections(project_id, inspection_date DESC, created_at DESC);
ALTER TABLE public.patrol_ledger_inspections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view patrol ledger inspections" ON public.patrol_ledger_inspections;
CREATE POLICY "Users can view patrol ledger inspections"
  ON public.patrol_ledger_inspections FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = patrol_ledger_inspections.project_id));

DROP POLICY IF EXISTS "Users can insert patrol ledger inspections" ON public.patrol_ledger_inspections;
CREATE POLICY "Users can insert patrol ledger inspections"
  ON public.patrol_ledger_inspections FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = patrol_ledger_inspections.project_id));

DROP POLICY IF EXISTS "Author can update patrol ledger inspections" ON public.patrol_ledger_inspections;
CREATE POLICY "Author can update patrol ledger inspections"
  ON public.patrol_ledger_inspections FOR UPDATE TO authenticated
  USING (auth.uid() = created_by AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = patrol_ledger_inspections.project_id))
  WITH CHECK (auth.uid() = created_by AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = patrol_ledger_inspections.project_id));

DROP POLICY IF EXISTS "Author owner client can delete patrol ledger inspections" ON public.patrol_ledger_inspections;
CREATE POLICY "Author owner client can delete patrol ledger inspections"
  ON public.patrol_ledger_inspections FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = patrol_ledger_inspections.project_id
      AND (p.created_by = auth.uid() OR patrol_ledger_inspections.created_by = auth.uid()
        OR EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.role = '발주청'::user_role))
  ));

GRANT SELECT, INSERT, DELETE ON public.patrol_ledger_inspections TO authenticated;
GRANT ALL ON public.patrol_ledger_inspections TO service_role;
REVOKE UPDATE ON public.patrol_ledger_inspections FROM authenticated;
GRANT UPDATE (inspection_date, contractor_name, district_name, inspector_affiliation, inspector_position,
  inspector_name, signature, tbm_work_summary, items, finding_text, finding_photo_url, updated_at)
  ON public.patrol_ledger_inspections TO authenticated;

COMMENT ON TABLE public.patrol_ledger_inspections IS 'AI 순회점검대장. TBM 작업내용과 점검항목·결과·개인 서명을 점검일 스냅샷으로 보관하며 작성자만 내용을 수정한다.';
COMMENT ON COLUMN public.patrol_ledger_inspections.id IS '순회점검 기록 식별자';
COMMENT ON COLUMN public.patrol_ledger_inspections.project_id IS '소속 현장. 현장 삭제 시 함께 삭제한다.';
COMMENT ON COLUMN public.patrol_ledger_inspections.inspection_date IS '점검일자';
COMMENT ON COLUMN public.patrol_ledger_inspections.contractor_name IS '양식 제목에 표시할 시공사명';
COMMENT ON COLUMN public.patrol_ledger_inspections.district_name IS '점검 지구명';
COMMENT ON COLUMN public.patrol_ledger_inspections.inspector_affiliation IS '점검자 소속';
COMMENT ON COLUMN public.patrol_ledger_inspections.inspector_position IS '점검자 직급';
COMMENT ON COLUMN public.patrol_ledger_inspections.inspector_name IS '점검자 성명. 100자 이하 한 줄.';
COMMENT ON COLUMN public.patrol_ledger_inspections.signature IS '점검자 본인의 PNG dataURL 직접 서명';
COMMENT ON COLUMN public.patrol_ledger_inspections.tbm_work_summary IS 'AI 입력에 사용한 TBM 또는 직접 입력 작업내용';
COMMENT ON COLUMN public.patrol_ledger_inspections.items IS '점검항목 1~10건. 번호·분류·본문·결과(양호/미흡/미점검 빈 문자열).';
COMMENT ON COLUMN public.patrol_ledger_inspections.finding_text IS '선택 지적사항';
COMMENT ON COLUMN public.patrol_ledger_inspections.finding_photo_url IS '지적사진 또는 점검사진 공개 URL';
COMMENT ON COLUMN public.patrol_ledger_inspections.created_by IS '작성자. 계정 삭제 후에도 점검은 보존한다.';
COMMENT ON COLUMN public.patrol_ledger_inspections.created_at IS '최초 작성 시각';
COMMENT ON COLUMN public.patrol_ledger_inspections.updated_at IS '최종 수정 시각';
COMMIT;
