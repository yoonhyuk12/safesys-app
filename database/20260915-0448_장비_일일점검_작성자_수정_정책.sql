-- 장비 일일점검 대장에 작성자 본인 수정(UPDATE) 정책을 추가한다
-- 배경: 20260914-2245에서는 UPDATE 정책을 일부러 만들지 않고 정정을 "삭제 후 재제출"로 두었다.
--       점검항목 문구를 현장 실정에 맞게 고쳐 쓰는 요구가 생기면서, 이미 제출한 점검도
--       본인이 고칠 수 있어야 한다. 대신 서명이 가리키는 대상이 달라지지 않도록
--       화면이 내용 변경 시 서명을 무효로 만들고 새 서명을 받은 뒤에만 저장한다.
-- 변경: 작성자 본인이면서 그 현장을 볼 수 있을 때만 UPDATE를 허용한다.
--       WITH CHECK에도 같은 조건을 걸어 수정하면서 작성자를 바꾸거나
--       볼 수 없는 현장으로 점검을 옮기는 것을 막는다.
--       삭제 권한(작성자·현장 소유자·발주청)과 달리 수정은 작성자 본인만 할 수 있다 —
--       남의 이름과 서명이 달린 점검의 내용을 제3자가 고칠 수 있으면 안 된다.
--       정책은 "어느 행을" 고칠지만 정하고 "어느 칸을" 고칠지는 정하지 못한다. 그래서 테이블 전체 UPDATE 권한을
--       거두고 점검 내용 칸에만 열 단위로 다시 준다 — id·project_id·equipment_type·equipment_name·created_by·
--       created_at은 이 점검이 무엇이고 누가 언제 남겼는지를 정하는 값이라 수정 대상이 아니다.
-- 적용 방법: Supabase 콘솔 → SQL Editor 에서 아래 전체를 실행
-- 선행 조건: 20260914-2245_장비_일일점검_대장.sql이 먼저 적용되어 있어야 한다

BEGIN;

-- 다시 실행해도 같은 결과가 되도록 먼저 지운다.
DROP POLICY IF EXISTS "Author can update equipment daily inspections" ON public.equipment_daily_inspections;

-- 작성자 본인만 자기 점검을 고친다. 관할 판정은 projects의 조회 RLS에 그대로 얹는다.
CREATE POLICY "Author can update equipment daily inspections"
  ON public.equipment_daily_inspections FOR UPDATE TO authenticated
  USING (
    auth.uid() = equipment_daily_inspections.created_by
    AND EXISTS (
      SELECT 1 FROM public.projects p
       WHERE p.id = equipment_daily_inspections.project_id
    )
  )
  WITH CHECK (
    auth.uid() = equipment_daily_inspections.created_by
    AND EXISTS (
      SELECT 1 FROM public.projects p
       WHERE p.id = equipment_daily_inspections.project_id
    )
  );

-- Supabase의 public 스키마 기본 권한으로 authenticated는 테이블 전체 UPDATE를 들고 있다.
-- 그대로 두면 정책을 통과한 작성자가 자기 점검의 신원 칸(현장·장비·작성자·작성시각)까지 바꿀 수 있다.
-- 전체 권한을 거두고 점검 내용 칸에만 다시 준다. 열 권한이 없는 칸은 UPDATE 목록에 넣는 순간 거부된다.
-- merge_projects는 SECURITY DEFINER(소유자 권한)로 project_id를 옮기므로 이 회수의 영향을 받지 않는다.
REVOKE UPDATE ON public.equipment_daily_inspections FROM authenticated;
GRANT UPDATE (
  inspection_date,
  company_name,
  vehicle_number,
  machine_number,
  inspector_name,
  signature,
  answers,
  remarks
) ON public.equipment_daily_inspections TO authenticated;

COMMENT ON TABLE public.equipment_daily_inspections IS
  '장비 일일점검 대장 1건. 원본 양식(일일안전점검 체크리스트)의 장비별 점검 항목 응답과 점검자 직접 서명을 점검일 스냅샷으로 보관한다. 항목 문구는 그 점검에 한해 고쳐 쓸 수 있으며 고친 문구는 answers에만 남고 원문 카탈로그는 바뀌지 않는다. 제출 후 수정은 작성자 본인만 할 수 있고(UPDATE 정책 + 점검 내용 칸에만 주는 열 단위 UPDATE 권한), 내용을 고치면 화면이 서명을 무효로 만들어 새 서명을 받는다.';
COMMENT ON COLUMN public.equipment_daily_inspections.answers IS
  'EquipmentInspectionAnswer[] — {id, category, text, result(pass|fail|na), note}. id·category·순서는 원문 항목 그대로이며, text는 그 점검에서 고쳐 쓴 문구가 있으면 그 값이다.';

COMMIT;
