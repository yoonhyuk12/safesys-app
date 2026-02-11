-- 주요자재 수불부 및 검사부 테이블 생성
-- materials: 자재 목록, material_ledger_entries: 자재별 수불 내역

-- UUID 확장 활성화 (이미 활성화되어 있으면 무시)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. 자재 목록 테이블
CREATE TABLE materials (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  unit TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

COMMENT ON TABLE materials IS '주요자재 수불부 - 자재 목록';
COMMENT ON COLUMN materials.project_id IS '프로젝트 ID';
COMMENT ON COLUMN materials.name IS '자재명';
COMMENT ON COLUMN materials.unit IS '단위 (포, m³, EA 등)';

-- 2. 자재 수불부 내역 테이블
CREATE TABLE material_ledger_entries (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  material_id UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  receive_date DATE,
  receive_qty NUMERIC,
  pass_qty_current NUMERIC,
  pass_qty_total NUMERIC,
  fail_qty NUMERIC,
  action TEXT,
  release_date DATE,
  release_qty NUMERIC,
  remain_qty NUMERIC,
  supervisor_confirm TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

COMMENT ON TABLE material_ledger_entries IS '주요자재 수불부 - 수불 내역';
COMMENT ON COLUMN material_ledger_entries.receive_date IS '반입일';
COMMENT ON COLUMN material_ledger_entries.receive_qty IS '반입량';
COMMENT ON COLUMN material_ledger_entries.pass_qty_current IS '합격량 (금회)';
COMMENT ON COLUMN material_ledger_entries.pass_qty_total IS '합격량 (누계)';
COMMENT ON COLUMN material_ledger_entries.fail_qty IS '불합격량';
COMMENT ON COLUMN material_ledger_entries.action IS '조치사항';
COMMENT ON COLUMN material_ledger_entries.release_date IS '출고일';
COMMENT ON COLUMN material_ledger_entries.release_qty IS '출고량';
COMMENT ON COLUMN material_ledger_entries.remain_qty IS '잔량 (보관)';
COMMENT ON COLUMN material_ledger_entries.supervisor_confirm IS '감독원 확인';

-- 인덱스
CREATE INDEX idx_materials_project_id ON materials(project_id);
CREATE INDEX idx_material_ledger_entries_material_id ON material_ledger_entries(material_id);

-- RLS 활성화
ALTER TABLE materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_ledger_entries ENABLE ROW LEVEL SECURITY;

-- RLS 정책: 인증된 사용자 전체 접근
CREATE POLICY "materials_select" ON materials FOR SELECT TO authenticated USING (true);
CREATE POLICY "materials_insert" ON materials FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "materials_update" ON materials FOR UPDATE TO authenticated USING (true);
CREATE POLICY "materials_delete" ON materials FOR DELETE TO authenticated USING (true);

CREATE POLICY "material_ledger_entries_select" ON material_ledger_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "material_ledger_entries_insert" ON material_ledger_entries FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "material_ledger_entries_update" ON material_ledger_entries FOR UPDATE TO authenticated USING (true);
CREATE POLICY "material_ledger_entries_delete" ON material_ledger_entries FOR DELETE TO authenticated USING (true);
