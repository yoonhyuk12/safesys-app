-- projects.representative_contract_id: 계약현황 목록에서 지정하는 프로젝트 대표계약 1건 (project_contracts 행 참조)

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS representative_contract_id UUID
    REFERENCES project_contracts(id) ON DELETE SET NULL;

COMMENT ON COLUMN projects.representative_contract_id IS '계약현황에서 지정한 대표계약 1건 (project_contracts.id, 해당 계약 삭제 시 NULL). projects가 자식을 참조하는 FK라 merge_projects의 confrelid=projects 카운트(22)에는 영향 없음';
