-- 관리자 콘솔 가입자 삭제가 auth.users 참조 FK(NO ACTION)에 막혀 실패하는 문제를 고치는 마이그레이션
--
-- 원인. auth.admin.deleteUser() 실행 시 user_profiles_id_fkey(NO ACTION) 위반으로 즉시 실패했고,
-- 이를 고쳐도 created_by 계열 FK 17개(NO ACTION)가 데이터를 만든 가입자의 삭제를 계속 차단한다.
-- 조치. user_profiles는 계정과 함께 삭제(CASCADE), 가입자가 만든 기록은 보존하되 작성자만 비움(SET NULL).
-- SET NULL 대상 컬럼은 전부 nullable임을 확인했다(2026-08-13). Supabase SQL Editor에서 수동 적용.

BEGIN;

-- 1) 프로필은 Auth 계정 삭제와 함께 자동 정리한다.
ALTER TABLE public.user_profiles
  DROP CONSTRAINT user_profiles_id_fkey,
  ADD CONSTRAINT user_profiles_id_fkey
    FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2) 가입자가 만든 기록은 남기고 작성자 참조만 비운다.
ALTER TABLE public.corrective_action_issues
  DROP CONSTRAINT corrective_action_issues_created_by_fkey,
  ADD CONSTRAINT corrective_action_issues_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.inspection_requests
  DROP CONSTRAINT inspection_requests_created_by_fkey,
  ADD CONSTRAINT inspection_requests_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.inspection_visit_logs
  DROP CONSTRAINT inspection_visit_logs_created_by_fkey,
  ADD CONSTRAINT inspection_visit_logs_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.material_ledger_entries
  DROP CONSTRAINT material_ledger_entries_created_by_fkey,
  ADD CONSTRAINT material_ledger_entries_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.materials
  DROP CONSTRAINT materials_created_by_fkey,
  ADD CONSTRAINT materials_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.new_worker_orientations
  DROP CONSTRAINT new_worker_orientations_created_by_fkey,
  ADD CONSTRAINT new_worker_orientations_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.project_contracts
  DROP CONSTRAINT project_contracts_created_by_fkey,
  ADD CONSTRAINT project_contracts_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.ptw_permits
  DROP CONSTRAINT ptw_permits_created_by_fkey,
  ADD CONSTRAINT ptw_permits_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.quality_monthly_reports
  DROP CONSTRAINT quality_monthly_reports_created_by_fkey,
  ADD CONSTRAINT quality_monthly_reports_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.quality_summary_reports
  DROP CONSTRAINT quality_summary_reports_created_by_fkey,
  ADD CONSTRAINT quality_summary_reports_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  DROP CONSTRAINT quality_summary_reports_rejected_by_fkey,
  ADD CONSTRAINT quality_summary_reports_rejected_by_fkey
    FOREIGN KEY (rejected_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  DROP CONSTRAINT quality_summary_reports_rejection_read_by_fkey,
  ADD CONSTRAINT quality_summary_reports_rejection_read_by_fkey
    FOREIGN KEY (rejection_read_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.quality_test_records
  DROP CONSTRAINT quality_test_records_created_by_fkey,
  ADD CONSTRAINT quality_test_records_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.quality_verification_requests
  DROP CONSTRAINT quality_verification_requests_created_by_fkey,
  ADD CONSTRAINT quality_verification_requests_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.safety_inspections
  DROP CONSTRAINT safety_inspections_created_by_fkey,
  ADD CONSTRAINT safety_inspections_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.tbm_safety_inspections
  DROP CONSTRAINT tbm_safety_inspections_created_by_fkey,
  ADD CONSTRAINT tbm_safety_inspections_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.work_daily_reports
  DROP CONSTRAINT work_daily_reports_created_by_fkey,
  ADD CONSTRAINT work_daily_reports_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

COMMIT;

-- 적용 확인. 아래 조회에서 confdeltype이 user_profiles만 'c'(CASCADE), 나머지는 'n'(SET NULL)이면 성공.
-- SELECT c.relname, con.conname, con.confdeltype
-- FROM pg_constraint con
-- JOIN pg_class c ON con.conrelid = c.oid
-- WHERE con.confrelid = 'auth.users'::regclass AND con.contype = 'f'
--   AND c.relnamespace = 'public'::regnamespace
-- ORDER BY c.relname;
