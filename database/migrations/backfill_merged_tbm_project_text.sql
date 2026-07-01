-- 2026-06-29 병합(사리현벽제지구→사리현벽제)으로 남은 tbm_submissions의 옛 이름 텍스트 77건을 현 프로젝트 값으로 동기화하는 일회용 백필
-- 배경: 병합 v1·인시던트 복구는 project_id만 이전해 이름·본부·지사 텍스트가 삭제된 source 것으로 남았다.
--       merge_projects v3부터는 RPC가 텍스트까지 동기화하므로 이 백필은 과거 1건의 병합분만 정리한다.
-- 주의: 병합과 무관한 이름 불일치(제출 시 수기 입력 편차)는 건드리지 않도록 옛 이름을 명시해 한정한다.
-- 실행: Supabase 웹 콘솔 SQL Editor (MCP는 읽기 전용). 재실행해도 매칭 0건이라 안전(멱등).

update tbm_submissions s
   set project_name = p.project_name,
       headquarters = p.managing_hq,
       branch       = p.managing_branch
  from projects p
 where p.id = s.project_id
   and s.project_name = '사리현벽제지구 배수개선사업';

-- 검증: 0이어야 정상
-- select count(*) from tbm_submissions where project_name = '사리현벽제지구 배수개선사업';
