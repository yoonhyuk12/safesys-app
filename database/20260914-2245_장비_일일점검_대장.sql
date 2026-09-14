-- AI 장비 일일점검 대장 저장소 — 장비별 원문 점검표 응답과 점검자 서명을 점검일 스냅샷 한 행으로 남긴다
-- 적용 방법: Supabase 콘솔 → SQL Editor 에서 아래 전체를 실행
-- 주의: 이 파일은 실행 전이다. 병합 함수 갱신은 20260914-2246_merge_projects_equipment_daily_inspections.sql을 이어서 실행한다.

BEGIN;

-- 답변 배열의 형태를 DB에서 직접 확인한다. RLS가 "누가"를 막는다면 이 함수는 "무엇을" 막는다.
-- 미점검(result 누락·오타)·빈 항목·객체가 아닌 원소가 하나라도 있으면 행 자체를 받지 않으므로,
-- 화면 검증을 우회한 직접 호출로도 반쪽짜리 점검표가 대장에 남지 않는다.
-- CHECK 제약은 서브쿼리를 담을 수 없어 함수로 분리한다.
CREATE OR REPLACE FUNCTION public.equipment_inspection_answers_valid(p_answers JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_typeof(p_answers) = 'array'
     AND jsonb_array_length(p_answers) > 0
     AND NOT EXISTS (
       SELECT 1
         FROM jsonb_array_elements(p_answers) AS answer
        WHERE jsonb_typeof(answer) IS DISTINCT FROM 'object'
           -- 내보내기(HWPX)가 문자열로 읽는 네 칸은 반드시 문자열이어야 한다. 숫자·null이 오면 출력이 깨진다.
           OR jsonb_typeof(answer -> 'id') IS DISTINCT FROM 'string'
           OR jsonb_typeof(answer -> 'category') IS DISTINCT FROM 'string'
           OR jsonb_typeof(answer -> 'text') IS DISTINCT FROM 'string'
           OR jsonb_typeof(answer -> 'result') IS DISTINCT FROM 'string'
           OR jsonb_typeof(COALESCE(answer -> 'note', '""'::JSONB)) IS DISTINCT FROM 'string'
           OR BTRIM(answer ->> 'id') = ''
           OR BTRIM(answer ->> 'category') = ''
           OR BTRIM(answer ->> 'text') = ''
           OR (answer ->> 'result') NOT IN ('pass', 'fail', 'na')
     );
$$;

CREATE TABLE public.equipment_daily_inspections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  -- 원본 양식의 장비 식별자(카탈로그 id)와 표시 이름을 함께 남겨 카탈로그가 바뀌어도 과거 대장을 읽을 수 있게 한다.
  equipment_type TEXT NOT NULL CHECK (BTRIM(equipment_type) <> ''),
  equipment_name TEXT NOT NULL CHECK (BTRIM(equipment_name) <> ''),
  inspection_date DATE NOT NULL,
  company_name TEXT NOT NULL DEFAULT '',
  vehicle_number TEXT NOT NULL DEFAULT '',
  machine_number TEXT NOT NULL DEFAULT '',
  -- 출력물의 점검자 칸은 한 줄이다. 줄바꿈이나 100자 초과 이름은 HWPX에서 칸을 넘겨 잘리므로 여기서 막는다.
  inspector_name TEXT NOT NULL CHECK (
    BTRIM(inspector_name) <> ''
    AND LENGTH(inspector_name) <= 100
    AND inspector_name !~ '[\r\n]'
  ),
  -- 점검자 본인의 직접 서명이다. 빈 문자열·안내 문구·URL이 서명 자리에 들어오지 못하게 형식을 고정한다.
  -- 캔버스가 만드는 PNG dataURL만 받는다 — base64 본문이 PNG 매직(iVBORw0KGgo)으로 시작하고
  -- base64 문자만으로 이루어지며, 그림이라고 볼 수 없을 만큼 짧지 않아야 한다.
  signature TEXT NOT NULL CHECK (
    signature LIKE 'data:image/png;base64,iVBORw0KGgo%'
    AND signature ~ '^data:image/png;base64,[A-Za-z0-9+/]+={0,2}$'
    AND LENGTH(signature) >= 200
  ),
  answers JSONB NOT NULL CHECK (public.equipment_inspection_answers_valid(answers)),
  remarks TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_equipment_daily_inspections_project_date
  ON public.equipment_daily_inspections(project_id, inspection_date DESC, created_at DESC);

ALTER TABLE public.equipment_daily_inspections ENABLE ROW LEVEL SECURITY;

-- 관할 판정을 여기서 다시 쓰지 않는다. projects의 조회 RLS가 그대로 적용되므로
-- "그 현장을 볼 수 있는 사람만 그 현장의 점검을 본다"가 자동으로 성립한다.
CREATE POLICY "Users can view equipment daily inspections in their projects"
  ON public.equipment_daily_inspections FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
       WHERE p.id = equipment_daily_inspections.project_id
    )
  );

-- created_by는 반드시 로그인 사용자 본인이다. 다른 사람 이름으로 점검을 남길 수 없다.
CREATE POLICY "Users can insert equipment daily inspections in their projects"
  ON public.equipment_daily_inspections FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = created_by
    AND EXISTS (
      SELECT 1 FROM public.projects p
       WHERE p.id = equipment_daily_inspections.project_id
    )
  );

-- 잘못 올린 점검은 지우고 다시 제출한다. 작성자 본인·현장 소유자·발주청만 지울 수 있다.
CREATE POLICY "Author, project owner, client can delete equipment daily inspections"
  ON public.equipment_daily_inspections FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
       WHERE p.id = equipment_daily_inspections.project_id
         AND (
           p.created_by = auth.uid()
           OR auth.uid() = equipment_daily_inspections.created_by
           OR EXISTS (
             SELECT 1 FROM public.user_profiles up
              WHERE up.id = auth.uid()
                AND up.role = '발주청'::user_role
           )
         )
    )
  );

-- UPDATE 정책을 일부러 만들지 않는다. 서명은 제출 시점의 점검 결과에 대한 것이므로
-- 내용을 나중에 고칠 수 있으면 서명이 가리키는 대상이 달라진다. 수정은 삭제 후 재제출로 한다.

COMMENT ON TABLE public.equipment_daily_inspections IS
  '장비 일일점검 대장 1건. 원본 양식(일일안전점검 체크리스트)의 장비별 점검 항목 응답과 점검자 직접 서명을 점검일 스냅샷으로 보관한다. 제출 후 수정은 허용하지 않으며(UPDATE 정책 없음) 정정은 삭제 후 재제출로 한다.';
COMMENT ON COLUMN public.equipment_daily_inspections.equipment_type IS
  '원본 양식 장비 카탈로그의 id (예: equipment-01). 표시 이름은 equipment_name에 함께 보관한다.';
COMMENT ON COLUMN public.equipment_daily_inspections.answers IS
  'EquipmentInspectionAnswer[] — {id, category, text, result(pass|fail|na), note}. 원문 항목 문구를 그대로 보존한다.';
COMMENT ON COLUMN public.equipment_daily_inspections.signature IS
  '점검자 본인의 직접 서명 PNG dataURL. 개인 지정 서명이므로 감독·시공사 일괄서명 대상이 아니다.';
COMMENT ON COLUMN public.equipment_daily_inspections.inspector_name IS
  '점검자 성명. 출력물의 한 줄 칸에 들어가므로 줄바꿈 없이 100자 이하여야 한다.';
COMMENT ON FUNCTION public.equipment_inspection_answers_valid(JSONB) IS
  '장비 일일점검 답변 배열이 온전한지 판단한다. 배열이 비어 있거나 원소에 id·text가 없거나 result가 pass/fail/na가 아니면 거짓이다. equipment_daily_inspections.answers의 CHECK 전용이다.';

COMMIT;
