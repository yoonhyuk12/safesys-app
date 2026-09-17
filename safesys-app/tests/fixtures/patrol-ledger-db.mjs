// 순회점검대장 SQL 테스트용 PGlite 인메모리 DB 준비와 로그인 사용자 전환 헬퍼.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../..')

export const MIGRATION_PATH = path.join(repoRoot, 'database', '20260917-1700_순회점검대장.sql')
/** 사진 구분(지적/전경) 컬럼은 대장 생성 뒤에 얹는다. 운영에서도 1700 → 1701 → 1800 순서다. */
export const PHOTO_KIND_PATH = path.join(repoRoot, 'database', '20260917-1800_순회점검_사진구분.sql')
const SCHEMA_PATH = path.join(here, 'equipment-inspection-schema.sql')

export const IDS = {
  ownerProject: '11111111-1111-1111-1111-111111111111',
  otherProject: '22222222-2222-2222-2222-222222222222',
  // owner가 볼 수 있는 또 하나의 현장. "정책은 통과하지만 열 권한이 없어 막힌다"를 가리는 데 쓴다.
  ownerSecondProject: '33333333-3333-3333-3333-333333333333',
  owner: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  sharedUser: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  outsider: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
  client: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
  otherClient: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
}

export const ITEMS = [{ no: 1, category: '작업장 공통', text: '안전통로는 확보되어 있는가', result: '' }]

// 실제 PNG로 검증해야 한다 — 형태만 맞고 내용이 깨진 base64는 서명 이미지로 쓸 수 없다.
export const SIGNATURE = `data:image/png;base64,${readFileSync(path.join(here, 'equipment-inspection-signature.png')).toString('base64')}`

/** 스키마와 대장·수정 정책 마이그레이션을 적용한 새 PGlite DB를 만든다. 준비 중 실패하면 인스턴스를 닫고 예외를 올린다. */
export async function createDb() {
  const db = await PGlite.create()
  try {
    await db.exec(readFileSync(SCHEMA_PATH, 'utf8'))
    await db.exec(readFileSync(MIGRATION_PATH, 'utf8'))
    await db.exec(readFileSync(PHOTO_KIND_PATH, 'utf8'))
    await seed(db)
  } catch (error) {
    await db.close()
    throw error
  }
  return db
}

/**
 * 현장 세 곳과 사용자 다섯 명을 만든다.
 * - owner는 ownerProject의 시공사 소유자, sharedUser는 공유받은 감리단, outsider는 무관한 시공사.
 * - client는 ownerProject 관할 발주청, otherClient는 다른 본부 발주청이다.
 * - ownerSecondProject는 owner의 또 다른 현장이라 owner에게 보인다.
 */
async function seed(db) {
  await db.exec(`
    INSERT INTO auth.users (id) VALUES
      ('${IDS.owner}'), ('${IDS.sharedUser}'), ('${IDS.outsider}'), ('${IDS.client}'), ('${IDS.otherClient}');

    INSERT INTO public.user_profiles (id, email, full_name, role, hq_division, branch_division) VALUES
      ('${IDS.owner}', 'owner@example.com', '현장소장', '시공사', NULL, NULL),
      ('${IDS.sharedUser}', 'shared@example.com', '감리단장', '감리단', NULL, NULL),
      ('${IDS.outsider}', 'outsider@example.com', '타현장소장', '시공사', NULL, NULL),
      ('${IDS.client}', 'client@example.com', '관할발주청', '발주청', '서울본부', '강남지사'),
      ('${IDS.otherClient}', 'other-client@example.com', '타본부발주청', '발주청', '부산본부', '해운대지사');

    INSERT INTO public.projects (id, project_name, managing_hq, managing_branch, created_by) VALUES
      ('${IDS.ownerProject}', '가나교 보수공사', '서울본부', '강남지사', '${IDS.owner}'),
      ('${IDS.otherProject}', '다라천 정비공사', '부산본부', '해운대지사', '${IDS.outsider}'),
      ('${IDS.ownerSecondProject}', '마바로 확장공사', '서울본부', '강남지사', '${IDS.owner}');

    INSERT INTO public.project_shares (project_id, shared_with) VALUES
      ('${IDS.ownerProject}', '${IDS.sharedUser}');
  `)
}

/** 이후 질의를 해당 사용자의 authenticated 세션으로 실행한다. */
export async function signIn(db, userId) {
  await db.exec('RESET ROLE;')
  await db.query('SELECT set_config($1, $2, false)', ['request.jwt.claim.sub', userId ?? ''])
  await db.exec('SET ROLE authenticated;')
}

/** 준비·검증용 superuser 세션으로 돌아간다. */
export async function signOut(db) {
  await db.exec('RESET ROLE;')
  await db.query('SELECT set_config($1, $2, false)', ['request.jwt.claim.sub', ''])
}

/** 점검 한 건을 넣는다. 기본값은 현재 로그인 사용자가 자기 현장에 남기는 정상 제출이다. */
export function insertInspection(db, overrides = {}) {
  const row = { project_id: IDS.ownerProject, inspection_date: '2026-09-17', inspector_name: '홍길동', signature: SIGNATURE, items: JSON.stringify(ITEMS), created_by: IDS.owner, finding_text: '', finding_photo_kind: 'finding', ...overrides }
  return db.query(`INSERT INTO public.patrol_ledger_inspections (project_id, inspection_date, inspector_name, signature, items, created_by, finding_text, finding_photo_kind)
    VALUES ($1::uuid, $2::date, $3, $4, $5::jsonb, $6::uuid, $7, $8) RETURNING id`,
    [row.project_id, row.inspection_date, row.inspector_name, row.signature, row.items, row.created_by, row.finding_text, row.finding_photo_kind])
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
