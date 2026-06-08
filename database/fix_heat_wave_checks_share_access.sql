-- 폭염점검(열중질환) 점검 기록 공유 접근 권한 추가
-- 문제: heat_wave_checks SELECT 정책이 소유자(created_by) / 발주청 관할만 허용.
--       project_shares 로 프로젝트를 공유받은 사용자는 폭염점검 기록을 볼 수 없음.
-- 해결: 공유받은 사용자도 조회 가능하도록 permissive SELECT 정책 추가 (기존 정책은 유지).
--
-- 참고: RLS permissive 정책은 OR 로 결합되므로 기존 정책을 건드리지 않고 추가만 함.
--       project_shares(project_id, shared_with) 는 add_project_shares_table.sql 에서 정의됨.
--       safe_document_inspections 의 공유 정책(fix_safe_document_inspections_share_access.sql)과 동일 패턴.

DROP POLICY IF EXISTS "heat_wave_checks_select_shared" ON public.heat_wave_checks;

CREATE POLICY "heat_wave_checks_select_shared" ON public.heat_wave_checks
  FOR SELECT
  USING (
    project_id IN (
      SELECT ps.project_id
      FROM public.project_shares ps
      WHERE ps.shared_with = auth.uid()
    )
  );
