// 프로젝트 병합 SQL 테스트용 PGlite 인메모리 DB 준비와 표준 시드 데이터 헬퍼.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../..')

export const MIGRATION_PATH = path.join(repoRoot, 'database', '20260907-1525_merge_projects_preserve_data.sql')
const SCHEMA_PATH = path.join(here, 'merge-projects-schema.sql')

export const IDS = {
  source: '11111111-1111-1111-1111-111111111111',
  target: '22222222-2222-2222-2222-222222222222',
  targetOwner: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  sourceOwner: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  supervisorShare: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
  clientShare: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
  dupShare: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  sourceContract: '33333333-3333-3333-3333-333333333333',
  targetContract: '44444444-4444-4444-4444-444444444444',
  sourceInspection: '55555555-5555-5555-5555-555555555555',
  sourceMaterial: '66666666-6666-6666-6666-666666666666',
  sourceTbm: '77777777-7777-7777-7777-777777777777',
}

// 실제 FK 자식 27개. 병합 후 source 잔여 행이 없어야 한다.
export const CHILD_TABLES = [
  'ai_usage_logs',
  'corrective_action_issues',
  'headquarters_inspections',
  'heat_wave_checks',
  'inspection_requests',
  'inspection_visit_logs',
  'legal_compliance_checks',
  'manager_inspections',
  'materials',
  'new_worker_orientations',
  'project_accidents',
  'project_contracts',
  'project_shares',
  'ptw_permits',
  'quality_monthly_reports',
  'quality_summary_reports',
  'quality_test_records',
  'quality_verification_requests',
  'risk_assessments',
  'safe_document_inspections',
  'safety_inspections',
  'tbm_safety_inspections',
  'tbm_submissions',
  'work_daily_reports',
  'work_plans',
  'worker_registration_tokens',
  'workers',
]

// memo 컬럼만 가진 단순 자식.
const MEMO_TABLES = [
  'corrective_action_issues',
  'headquarters_inspections',
  'heat_wave_checks',
  'inspection_requests',
  'inspection_visit_logs',
  'legal_compliance_checks',
  'manager_inspections',
  'new_worker_orientations',
  'project_accidents',
  'quality_summary_reports',
  'quality_test_records',
  'risk_assessments',
  'safe_document_inspections',
  'work_plans',
]

const schemaSql = readFileSync(SCHEMA_PATH, 'utf8')

function readMigrationSql() {
  return readFileSync(MIGRATION_PATH, 'utf8')
}

/** 스키마와 병합 마이그레이션을 적용한 새 PGlite DB를 만든다. 준비 중 실패하면 인스턴스를 닫고 예외를 올린다. */
export async function createDb() {
  const db = await PGlite.create()
  try {
    await db.exec(schemaSql)
    await db.exec(readMigrationSql())
  } catch (error) {
    await db.close()
    throw error
  }
  return db
}

const DEFAULT_SOURCE = {
  project_name: '가나교 보수공사',
  managing_hq: '서울본부',
  managing_branch: '강남지사',
  created_by: IDS.sourceOwner,
}

const DEFAULT_TARGET = {
  project_name: '가나교 보수공사(신규)',
  managing_hq: '서울본부',
  managing_branch: '서초지사',
  created_by: IDS.targetOwner,
}

function insertProjectSql(id, columns) {
  const merged = { id, ...columns }
  const names = Object.keys(merged)
  const placeholders = names.map((_, index) => `$${index + 1}`)
  return {
    text: `INSERT INTO projects (${names.join(', ')}) VALUES (${placeholders.join(', ')})`,
    values: names.map((name) => merged[name]),
  }
}

/** 사용자 프로필과 source/target 프로젝트 두 행을 만든다. */
export async function seedProjects(db, { source = {}, target = {} } = {}) {
  await db.exec(`
    INSERT INTO user_profiles (id, email, full_name, company_name, role) VALUES
      ('${IDS.targetOwner}', 'target-owner@example.com', '발주청담당', '발주청', '발주청'),
      ('${IDS.sourceOwner}', 'source-owner@example.com', '시공사소장', '가나건설', '시공사'),
      ('${IDS.supervisorShare}', 'supervisor@example.com', '감리단장', '가나엔지니어링', '감리단'),
      ('${IDS.clientShare}', 'client@example.com', '발주청기술', '발주청', '발주청'),
      ('${IDS.dupShare}', 'dup@example.com', '중복공유자', '가나건설', '시공사');
  `)

  const sourceInsert = insertProjectSql(IDS.source, { ...DEFAULT_SOURCE, ...source })
  await db.query(sourceInsert.text, sourceInsert.values)
  const targetInsert = insertProjectSql(IDS.target, { ...DEFAULT_TARGET, ...target })
  await db.query(targetInsert.text, targetInsert.values)
}

/** 27개 자식 테이블과 간접 자식(서명·첨부 URL 포함)에 source 행을 만든다. */
export async function seedChildren(db) {
  const memoInserts = MEMO_TABLES
    .map((table) => `INSERT INTO ${table} (project_id, memo) VALUES ('${IDS.source}', 'source-${table}');`)
    .join('\n')

  await db.exec(`
    ${memoInserts}

    INSERT INTO ai_usage_logs (project_id, feature) VALUES ('${IDS.source}', 'tbm-analysis');
    INSERT INTO ptw_permits (project_id, signatures)
      VALUES ('${IDS.source}', '{"permitter":"data:image/png;base64,PERMITTER"}'::jsonb);
    INSERT INTO quality_verification_requests (project_id, supervisor_signature)
      VALUES ('${IDS.source}', 'data:image/png;base64,QVR');
    INSERT INTO worker_registration_tokens (project_id, token) VALUES ('${IDS.source}', 'token-source');
    INSERT INTO workers (project_id, name, signature)
      VALUES ('${IDS.source}', '홍길동', 'data:image/png;base64,WORKER');

    INSERT INTO materials (id, project_id, name) VALUES ('${IDS.sourceMaterial}', '${IDS.source}', '레미콘');
    INSERT INTO material_ledger_entries (material_id, supervisor_confirm, inspection_photos)
      VALUES ('${IDS.sourceMaterial}', 'data:image/png;base64,LEDGER', '["https://example.com/insp-1.jpg"]'::jsonb);

    INSERT INTO project_contracts (id, project_id, cntrct_no, corp_nm)
      VALUES ('${IDS.sourceContract}', '${IDS.source}', 'SRC-2026-001', '가나건설');

    INSERT INTO project_shares (project_id, shared_with, shared_by) VALUES
      ('${IDS.source}', '${IDS.supervisorShare}', '${IDS.sourceOwner}'),
      ('${IDS.source}', '${IDS.clientShare}', '${IDS.sourceOwner}'),
      ('${IDS.source}', '${IDS.dupShare}', '${IDS.sourceOwner}'),
      ('${IDS.source}', '${IDS.targetOwner}', '${IDS.sourceOwner}'),
      ('${IDS.target}', '${IDS.dupShare}', '${IDS.targetOwner}');

    INSERT INTO quality_monthly_reports (project_id, report_year, report_month, author_name, report_rows)
      VALUES ('${IDS.source}', 2026, 3, '품질담당', '[{"item":"압축강도"}]'::jsonb);

    INSERT INTO safety_inspections (id, project_id, inspection_type, signatures)
      VALUES ('${IDS.sourceInspection}', '${IDS.source}', '정기점검', '[{"role":"공사감독원","signature":"data:image/png;base64,SUP"}]'::jsonb);
    INSERT INTO safety_inspection_results (inspection_id, findings, photo_url, after_photo_url)
      VALUES ('${IDS.sourceInspection}', '안전난간 미설치', 'https://example.com/before.jpg', 'https://example.com/after.jpg');
    INSERT INTO safety_inspection_photos (inspection_id, photo_url)
      VALUES ('${IDS.sourceInspection}', 'https://example.com/good.jpg');

    INSERT INTO tbm_safety_inspections (project_id, project_name, signature)
      VALUES ('${IDS.source}', '${DEFAULT_SOURCE.project_name}', 'data:image/png;base64,TBMSAFE');
    INSERT INTO tbm_submissions (id, project_id, project_name, headquarters, branch, meeting_date, signature_url)
      VALUES ('${IDS.sourceTbm}', '${IDS.source}', '${DEFAULT_SOURCE.project_name}', '${DEFAULT_SOURCE.managing_hq}', '${DEFAULT_SOURCE.managing_branch}', DATE '2026-03-02', 'https://example.com/tbm-sign.png');
    INSERT INTO tbm_worker_signatures (tbm_submission_id, worker_name, signature)
      VALUES ('${IDS.sourceTbm}', '김작업', 'data:image/png;base64,TBMWORKER');

    INSERT INTO work_daily_reports (project_id, report_date, today_work)
      VALUES ('${IDS.source}', DATE '2026-03-02', '거푸집 설치');
  `)
}

/** project_id가 NULL인 구버전 TBM 제출 행을 만든다. */
export async function seedLegacyTbm(db) {
  await db.exec(`
    INSERT INTO tbm_submissions (project_id, project_name, headquarters, branch, meeting_date)
      VALUES (NULL, '${DEFAULT_SOURCE.project_name}', '${DEFAULT_SOURCE.managing_hq}', '${DEFAULT_SOURCE.managing_branch}', DATE '2026-02-01');
  `)
}

/** 단일 값 조회 도우미. */
export async function scalar(db, sql, params = []) {
  const result = await db.query(sql, params)
  const row = result.rows[0]
  if (!row) return null
  return Object.values(row)[0]
}

/** 병합 RPC를 호출하고 반환 JSON을 돌려준다. */
export async function callMerge(db, fn = 'merge_projects', source = IDS.source, target = IDS.target) {
  const result = await db.query(`SELECT public.${fn}($1::uuid, $2::uuid) AS payload`, [source, target])
  return result.rows[0].payload
}

export const DEFAULTS = { source: DEFAULT_SOURCE, target: DEFAULT_TARGET }
