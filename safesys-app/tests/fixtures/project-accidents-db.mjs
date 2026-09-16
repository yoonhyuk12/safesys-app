// 사고보고 RLS 테스트용 PGlite 인메모리 DB 준비와 로그인 사용자 전환 헬퍼.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../..')

const SCHEMA_PATH = path.join(here, 'project-accidents-schema.sql')

// 배포 순서 그대로 얹는다. 보고서 항목 다음에 산재요양 예상 일수 검증 확장을 적용한다.
export const MIGRATION_PATHS = [
  path.join(repoRoot, 'database', '20260718-0506_add_project_accidents.sql'),
  path.join(repoRoot, 'database', '20260718-0830_project_accidents_external_site.sql'),
  path.join(repoRoot, 'database', '20260831-1730_project_accidents_workers_comp_claim.sql'),
  path.join(repoRoot, 'database', '20260916-1032_사고보고_현장작성_권한.sql'),
  path.join(repoRoot, 'database', '20260916-1418_사고보고_보고서_항목.sql'),
  path.join(repoRoot, 'database', '20260916-1720_사고보고_산재요양_예상일수.sql'),
]

export const IDS = {
  ownerProject: '11111111-1111-1111-1111-111111111111',
  otherProject: '22222222-2222-2222-2222-222222222222',
  // owner가 볼 수 있는 또 하나의 현장. "옮겨 갈 현장이 자기 것이어도"를 가리는 데 쓴다.
  ownerSecondProject: '33333333-3333-3333-3333-333333333333',
  owner: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  supervisor: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  outsider: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
  branchClient: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
  hqClient: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  headOfficeClient: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
  otherClient: '99999999-9999-9999-9999-999999999999',
}

/** 스키마와 사고 마이그레이션 전부를 적용한 새 PGlite DB를 만든다. 준비 중 실패하면 인스턴스를 닫고 예외를 올린다. */
export async function createDb() {
  const db = await PGlite.create()
  try {
    await db.exec(readFileSync(SCHEMA_PATH, 'utf8'))
    for (const migration of MIGRATION_PATHS) {
      await db.exec(readFileSync(migration, 'utf8'))
    }
    await seed(db)
  } catch (error) {
    await db.close()
    throw error
  }
  return db
}

/**
 * 현장 세 곳과 사용자 일곱 명을 만든다.
 * - owner는 ownerProject의 시공사 소유자, supervisor는 공유받은 감리단, outsider는 무관한 시공사.
 * - branchClient는 ownerProject 관할 지사 발주청, hqClient는 같은 본부의 본부급, headOfficeClient는 본사다.
 * - otherClient는 다른 본부 발주청이라 ownerProject에 닿지 못한다.
 * - ownerSecondProject는 owner의 또 다른 현장이라 owner에게 보인다.
 */
async function seed(db) {
  await db.exec(`
    INSERT INTO auth.users (id) VALUES
      ('${IDS.owner}'), ('${IDS.supervisor}'), ('${IDS.outsider}'),
      ('${IDS.branchClient}'), ('${IDS.hqClient}'), ('${IDS.headOfficeClient}'), ('${IDS.otherClient}');

    INSERT INTO public.user_profiles (id, email, full_name, role, hq_division, branch_division) VALUES
      ('${IDS.owner}', 'owner@example.com', '현장소장', '시공사', NULL, NULL),
      ('${IDS.supervisor}', 'supervisor@example.com', '감리단장', '감리단', NULL, NULL),
      ('${IDS.outsider}', 'outsider@example.com', '타현장소장', '시공사', NULL, NULL),
      ('${IDS.branchClient}', 'branch@example.com', '관할지사발주청', '발주청', '서울본부', '강남지사'),
      ('${IDS.hqClient}', 'hq@example.com', '관할본부발주청', '발주청', '서울본부', '서울본부'),
      ('${IDS.headOfficeClient}', 'head@example.com', '본사발주청', '발주청', '본사', '본사'),
      ('${IDS.otherClient}', 'other-client@example.com', '타본부발주청', '발주청', '부산본부', '해운대지사');

    INSERT INTO public.projects (id, project_name, managing_hq, managing_branch, created_by) VALUES
      ('${IDS.ownerProject}', '가나교 보수공사', '서울본부', '강남지사', '${IDS.owner}'),
      ('${IDS.otherProject}', '다라천 정비공사', '부산본부', '해운대지사', '${IDS.outsider}'),
      ('${IDS.ownerSecondProject}', '마바로 확장공사', '서울본부', '강남지사', '${IDS.owner}');

    INSERT INTO public.project_shares (project_id, shared_with) VALUES
      ('${IDS.ownerProject}', '${IDS.supervisor}');
  `)
}

/** 이후 질의를 해당 사용자의 authenticated 세션으로 실행한다. */
export async function signIn(db, userId) {
  await db.exec('RESET ROLE;')
  await db.query('SELECT set_config($1, $2, false)', ['request.jwt.claim.sub', userId ?? ''])
  await db.exec('SET ROLE authenticated;')
}

/** 로그인 없이 앱에 들어온 방문자 세션(anon 역할)으로 전환한다. */
export async function signInAnon(db) {
  await db.exec('RESET ROLE;')
  await db.query('SELECT set_config($1, $2, false)', ['request.jwt.claim.sub', ''])
  await db.exec('SET ROLE anon;')
}

/** 준비·검증용 superuser 세션으로 돌아간다. */
export async function signOut(db) {
  await db.exec('RESET ROLE;')
  await db.query('SELECT set_config($1, $2, false)', ['request.jwt.claim.sub', ''])
}

/** 사고 한 건을 넣는다. 기본값은 현재 로그인 사용자가 자기 현장에 남기는 정상 보고다. */
export function insertAccident(db, overrides = {}) {
  const row = {
    project_id: IDS.ownerProject,
    external_project_name: null,
    external_managing_hq: null,
    external_managing_branch: null,
    accident_at: '2026-09-15T09:30:00+09:00',
    severity: 'lost_time',
    accident_type: '떨어짐',
    location: '교대 하부 비계',
    work_description: '비계 해체 작업',
    description: '비계 해체 중 작업자가 2m 높이에서 떨어졌다.',
    cause: '안전대 미체결',
    prevention_action: '안전대 체결 확인 후 작업 착수',
    injured_count: 1,
    fatal_count: 0,
    lost_workdays: 10,
    created_by: IDS.owner,
    ...overrides,
  }
  return db.query(
    `INSERT INTO public.project_accidents
       (project_id, external_project_name, external_managing_hq, external_managing_branch,
        accident_at, severity, accident_type, location, work_description, description,
        cause, prevention_action, injured_count, fatal_count, lost_workdays, created_by)
     VALUES ($1::uuid, $2, $3, $4, $5::timestamptz, $6, $7, $8, $9, $10, $11, $12,
             $13::int, $14::int, $15::int, $16::uuid)
     RETURNING id`,
    [row.project_id, row.external_project_name, row.external_managing_hq, row.external_managing_branch,
      row.accident_at, row.severity, row.accident_type, row.location, row.work_description,
      row.description, row.cause, row.prevention_action, row.injured_count, row.fatal_count,
      row.lost_workdays, row.created_by]
  )
}

/** 사고 한 건의 보고서 항목(report_details)만 갱신한다. 갱신된 행 목록을 돌려준다. */
export function updateReportDetails(db, id, details) {
  return db.query(
    `UPDATE public.project_accidents
        SET report_details = $2::jsonb
      WHERE id = $1::uuid
      RETURNING id`,
    [id, details === null ? null : JSON.stringify(details)]
  )
}

/** 단일 값 조회 도우미. */
export async function scalar(db, sql, params = []) {
  const result = await db.query(sql, params)
  const row = result.rows[0]
  if (!row) return null
  return Object.values(row)[0]
}

/** 예외가 날 것을 기대하고 그 예외를 돌려준다. */
export async function expectError(promise) {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('예외가 발생하지 않았습니다.')
}
