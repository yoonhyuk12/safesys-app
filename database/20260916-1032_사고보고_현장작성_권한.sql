-- 사고보고를 현장 시공사·감리단도 작성할 수 있게 RLS 정책을 추가한다
-- 배경: 20260718-0506에서 사고 이력은 발주청 전용이었고, 2026-09-16 사고보고 화면 작업으로
--       프로젝트 안전캐비넷 A(조치)에서 현장이 직접 사고를 보고하게 되었다.
--       보고된 사고는 기존 안전대시보드 사고현황에 그대로 집계되어야 하므로
--       테이블을 새로 만들지 않고 public.project_accidents를 그대로 쓴다.
-- 변경: 스키마·컬럼·트리거·기존 정책은 하나도 건드리지 않고 정책 네 개만 얹는다.
--       조회·등록·수정은 그 현장을 볼 수 있는 사용자면 누구나 하고, 삭제만 작성자 본인으로 묶는다.
--       사고 내용은 현장이 함께 다듬는 기록이라 수정에는 작성자 조건을 걸지 않는다.
--       RLS의 permissive 정책은 OR로 합쳐지므로 기존 "발주청 관할 사고 조회"와
--       "본부급 이상 사고 등록/수정/삭제"의 판정은 그대로 남고, 여기서 허용 범위만 넓어진다.
--       기존 사고 조회·집계 질의는 정책이 넓어질 뿐이라 결과가 줄지 않는다.
-- 판정 기준: "그 현장을 볼 수 있는가"를 projects의 조회 RLS에 그대로 얹는다.
--       EXISTS (SELECT 1 FROM public.projects p WHERE p.id = ...)는 정책 안에서도
--       projects의 RLS를 거치므로, 소유자·공유받은 사용자·관할 발주청만 참이 된다.
--       판정 규칙을 사고 정책에 복사해 두지 않아 projects 권한이 바뀌면 사고도 함께 따라간다.
-- 우회 차단:
--   * project_id IS NOT NULL을 모든 조건에 넣어, 외부 미등록 현장(project_id NULL)은
--     기존 "본부급 이상" 정책만 다루도록 남긴다. 현장 사용자가 자기 사고를 외부 현장으로
--     바꿔 관할 판정을 벗어나는 길도 여기서 막힌다.
--   * UPDATE는 USING과 WITH CHECK에 같은 조건을 걸어, 볼 수 없는 현장으로 사고를
--     옮기는 것을 막는다. 볼 수 없는 현장의 사고는 USING에서 이미 걸린다.
--   * created_by는 INSERT WITH CHECK의 auth.uid() 일치와 기존
--     project_accidents_created_by_immutable_trigger가 함께 지킨다. 작성자가 아닌
--     수정자도 작성자 칸만은 손대지 못하므로, 삭제 권한이 남에게 넘어가지 않는다.
-- 적용 방법: Supabase 콘솔 → SQL Editor 에서 아래 전체를 실행
-- 선행 조건: 20260718-0506_add_project_accidents.sql과
--            20260718-0830_project_accidents_external_site.sql이 먼저 적용되어 있어야 한다

BEGIN;

-- 다시 실행해도 같은 결과가 되도록 먼저 지운다.
DROP POLICY IF EXISTS "현장 사용자 사고 조회" ON public.project_accidents;
DROP POLICY IF EXISTS "현장 사용자 사고 등록" ON public.project_accidents;
DROP POLICY IF EXISTS "작성자 사고 수정" ON public.project_accidents;
DROP POLICY IF EXISTS "현장 사용자 사고 수정" ON public.project_accidents;
DROP POLICY IF EXISTS "작성자 사고 삭제" ON public.project_accidents;

-- 그 현장을 볼 수 있는 로그인 사용자는 현장 사고를 읽는다.
CREATE POLICY "현장 사용자 사고 조회"
  ON public.project_accidents FOR SELECT TO authenticated
  USING (
    project_accidents.project_id IS NOT NULL
    AND EXISTS (
      SELECT 1
        FROM public.projects p
       WHERE p.id = project_accidents.project_id
    )
  );

-- 등록은 자기 이름으로만 한다. 남의 이름을 적은 보고는 여기서 걸린다.
CREATE POLICY "현장 사용자 사고 등록"
  ON public.project_accidents FOR INSERT TO authenticated
  WITH CHECK (
    project_accidents.created_by = auth.uid()
    AND project_accidents.project_id IS NOT NULL
    AND EXISTS (
      SELECT 1
        FROM public.projects p
       WHERE p.id = project_accidents.project_id
    )
  );

-- 수정은 그 현장을 볼 수 있는 사람이면 누구나 한다. 사고 내용은 현장이 함께 다듬는 기록이다.
CREATE POLICY "현장 사용자 사고 수정"
  ON public.project_accidents FOR UPDATE TO authenticated
  USING (
    project_accidents.project_id IS NOT NULL
    AND EXISTS (
      SELECT 1
        FROM public.projects p
       WHERE p.id = project_accidents.project_id
    )
  )
  WITH CHECK (
    project_accidents.project_id IS NOT NULL
    AND EXISTS (
      SELECT 1
        FROM public.projects p
       WHERE p.id = project_accidents.project_id
    )
  );

-- 삭제는 작성자 본인으로 묶는다. 잘못 올린 보고는 올린 사람이 거둔다.
CREATE POLICY "작성자 사고 삭제"
  ON public.project_accidents FOR DELETE TO authenticated
  USING (
    project_accidents.created_by = auth.uid()
    AND project_accidents.project_id IS NOT NULL
    AND EXISTS (
      SELECT 1
        FROM public.projects p
       WHERE p.id = project_accidents.project_id
    )
  );

COMMENT ON TABLE public.project_accidents IS
  '프로젝트별 실제 사고와 피해·원인·예방조치 이력. 등록 현장 사고(project_id)는 그 현장을 볼 수 있는 사용자(시공사·감리단·관할 발주청)가 작성·수정하고, 작성자 본인 또는 관할 본부급 이상 발주청이 지운다. 작성자 칸은 트리거가 지킨다. 외부 미등록 현장 사고(project_id NULL + external_project_name)는 관할 발주청이 조회하고 본부급 이상 발주청이 등록·수정·삭제한다.';

COMMIT;
