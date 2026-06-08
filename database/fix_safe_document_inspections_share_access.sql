-- 안전서류 점검 기록 공유 접근 권한 수정
-- 문제: safe_document_inspections SELECT 정책이 managing_hq / managing_branch / created_by 만 허용.
--       project_shares 로 프로젝트를 공유받은 사용자는 점검 기록을 볼 수 없음.
-- 해결: 공유받은 사용자도 조회 가능하도록 permissive SELECT 정책 추가 (기존 정책은 유지).
--
-- 참고: RLS permissive 정책은 OR 로 결합되므로 기존 정책을 건드리지 않고 추가만 함.
--       project_shares(project_id, shared_with) 는 add_project_shares_table.sql 에서 정의됨.

DROP POLICY IF EXISTS "safe_document_inspections_select_shared" ON public.safe_document_inspections;

CREATE POLICY "safe_document_inspections_select_shared" ON public.safe_document_inspections
  FOR SELECT
  USING (
    project_id IN (
      SELECT ps.project_id
      FROM public.project_shares ps
      WHERE ps.shared_with = auth.uid()
    )
  );
