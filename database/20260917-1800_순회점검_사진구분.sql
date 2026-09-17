-- 순회점검대장 사진이 지적사진인지 전경(점검)사진인지 구분하는 컬럼을 추가한다.
-- 배경: 양식의 사진 칸은 "지적사진(없는 경우 점검사진)"이다. 화면에서 둘 중 하나를 고르게 하고,
--       전경사진을 고르면 지적사항을 쓸 수 없게 한다. 그 규칙을 DB에서도 CHECK로 지킨다.
-- 적용 순서: 20260917-1700_순회점검대장.sql → 20260917-1701_merge_projects_patrol_ledger.sql → 이 파일
-- 적용 방법: Supabase 콘솔 → SQL Editor 에서 아래 전체를 실행

BEGIN;

ALTER TABLE public.patrol_ledger_inspections
  ADD COLUMN IF NOT EXISTS finding_photo_kind TEXT NOT NULL DEFAULT 'finding';

ALTER TABLE public.patrol_ledger_inspections
  DROP CONSTRAINT IF EXISTS patrol_ledger_inspections_finding_photo_kind_check;
ALTER TABLE public.patrol_ledger_inspections
  ADD CONSTRAINT patrol_ledger_inspections_finding_photo_kind_check
  CHECK (finding_photo_kind IN ('finding', 'overview'));

-- 전경사진이면 지적사항이 비어 있어야 한다. 화면이 비활성화하지만 DB도 같은 규칙을 지킨다.
ALTER TABLE public.patrol_ledger_inspections
  DROP CONSTRAINT IF EXISTS patrol_ledger_inspections_overview_has_no_finding;
ALTER TABLE public.patrol_ledger_inspections
  ADD CONSTRAINT patrol_ledger_inspections_overview_has_no_finding
  CHECK (finding_photo_kind = 'finding' OR BTRIM(finding_text) = '');

-- 작성자 수정 권한은 열 단위로 주므로 새 열도 명시적으로 연다.
GRANT UPDATE (finding_photo_kind) ON public.patrol_ledger_inspections TO authenticated;

COMMENT ON COLUMN public.patrol_ledger_inspections.finding_photo_kind IS
  '사진 구분. finding=지적사진(지적사항 동반), overview=전경·점검사진(지적사항 없음).';

COMMIT;
