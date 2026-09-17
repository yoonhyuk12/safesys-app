// 사고보고의 RLS를 실제 마이그레이션으로 검증한다 — 현장 시공사·감리단의 작성 권한 추가와
// 기존 발주청 관할 조회·본부급 이상 등록/수정/삭제·외부 미등록 현장 정책의 보존을 함께 본다.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  IDS,
  createDb,
  expectError,
  insertAccident,
  scalar,
  signIn,
  signInAnon,
  signOut,
} from './fixtures/project-accidents-db.mjs'

/** 테스트가 실패해도 PGlite 인스턴스가 남지 않도록 생성 즉시 정리를 등록한다. */
async function openDb(t) {
  const db = await createDb()
  t.after(() => db.close())
  return db
}

async function visibleCount(db) {
  return Number(await scalar(db, 'SELECT COUNT(*) FROM public.project_accidents'))
}

/** 외부 미등록 현장 사고 한 건. project_id 없이 현장명·조직을 직접 적는다. */
function insertExternalAccident(db, overrides = {}) {
  return insertAccident(db, {
    project_id: null,
    external_project_name: '사바천 임시 보수공사',
    external_managing_hq: '서울본부',
    external_managing_branch: '강남지사',
    created_by: IDS.hqClient,
    ...overrides,
  })
}

test('현장 시공사가 남긴 사고는 그 현장을 볼 수 있는 사람 모두에게 보인다', async (t) => {
  const db = await openDb(t)
  await signIn(db, IDS.owner)
  const inserted = await insertAccident(db)
  assert.equal(inserted.rows.length, 1)

  // 소유 시공사·공유 감리단·관할 지사/본부/본사 발주청 모두 같은 한 건을 본다.
  for (const userId of [IDS.owner, IDS.supervisor, IDS.branchClient, IDS.hqClient, IDS.headOfficeClient]) {
    await signIn(db, userId)
    assert.equal(await visibleCount(db), 1, `${userId}에게 사고가 보이지 않는다`)
  }
})

test('공유받은 감리단도 그 현장의 사고를 직접 등록한다', async (t) => {
  const db = await openDb(t)
  await signIn(db, IDS.supervisor)
  const inserted = await insertAccident(db, { created_by: IDS.supervisor })
  assert.equal(inserted.rows.length, 1)

  await signIn(db, IDS.owner)
  assert.equal(await visibleCount(db), 1)
})

test('관할 밖 사용자에게는 남의 현장 사고가 보이지 않는다', async (t) => {
  const db = await openDb(t)
  await signIn(db, IDS.owner)
  await insertAccident(db)

  for (const userId of [IDS.outsider, IDS.otherClient]) {
    await signIn(db, userId)
    assert.equal(await visibleCount(db), 0, `${userId}에게 관할 밖 사고가 새어 나갔다`)
  }
})

test('볼 수 없는 현장에는 사고를 등록할 수 없다', async (t) => {
  const db = await openDb(t)
  await signIn(db, IDS.outsider)

  const error = await expectError(insertAccident(db, { project_id: IDS.ownerProject, created_by: IDS.outsider }))
  assert.match(error.message, /row-level security/i)

  await signOut(db)
  assert.equal(await visibleCount(db), 0)
})

test('다른 사람을 작성자로 적은 등록은 거부된다', async (t) => {
  const db = await openDb(t)
  await signIn(db, IDS.owner)

  for (const createdBy of [IDS.supervisor, IDS.hqClient, null]) {
    const error = await expectError(insertAccident(db, { created_by: createdBy }))
    assert.match(error.message, /row-level security/i, `${createdBy}를 작성자로 적은 등록이 통과했다`)
  }

  await signOut(db)
  assert.equal(await visibleCount(db), 0)
})

test('로그인하지 않은 세션은 사고를 보지도 남기지도 못한다', async (t) => {
  const db = await openDb(t)
  await signIn(db, IDS.owner)
  await insertAccident(db)

  // 앱에 로그인하지 않은 방문자(anon)와 사용자 식별이 없는 세션 둘 다 막혀야 한다.
  await signInAnon(db)
  assert.equal(await visibleCount(db), 0)
  const anonInsert = await expectError(insertAccident(db, { created_by: IDS.owner }))
  assert.match(anonInsert.message, /row-level security|permission denied/i)

  await signIn(db, '')
  assert.equal(await visibleCount(db), 0)
  const nullInsert = await expectError(insertAccident(db, { created_by: IDS.owner }))
  assert.match(nullInsert.message, /row-level security/i)

  await signOut(db)
  assert.equal(await visibleCount(db), 1)
})

test('작성자 본인은 자기 사고를 고치고 지울 수 있다', async (t) => {
  const db = await openDb(t)
  await signIn(db, IDS.owner)
  await insertAccident(db)

  const updated = await db.query(
    `UPDATE public.project_accidents
        SET prevention_action = '안전대 부착설비 설치 후 작업 착수', lost_workdays = 14
      RETURNING id`
  )
  assert.equal(updated.rows.length, 1)

  await signOut(db)
  assert.equal(
    await scalar(db, 'SELECT prevention_action FROM public.project_accidents'),
    '안전대 부착설비 설치 후 작업 착수'
  )

  await signIn(db, IDS.owner)
  const deleted = await db.query('DELETE FROM public.project_accidents RETURNING id')
  assert.equal(deleted.rows.length, 1)
})

test('그 현장을 볼 수 있으면 작성자가 아니어도 사고를 고친다', async (t) => {
  const db = await openDb(t)
  // 공유받은 감리단이 남긴 사고다. 같은 현장을 보는 소유 시공사·관할 지사 발주청이 이어서 고친다.
  await signIn(db, IDS.supervisor)
  await insertAccident(db, { created_by: IDS.supervisor })

  await signIn(db, IDS.owner)
  const byOwner = await db.query(
    `UPDATE public.project_accidents SET cause = '현장 소유자가 고친 원인' RETURNING id`
  )
  assert.equal(byOwner.rows.length, 1, '현장 소유자가 남의 사고를 고치지 못했다')

  await signIn(db, IDS.branchClient)
  const byBranch = await db.query(
    `UPDATE public.project_accidents SET cause = '지사 발주청이 고친 원인' RETURNING id`
  )
  assert.equal(byBranch.rows.length, 1, '관할 지사 발주청이 남의 사고를 고치지 못했다')

  await signOut(db)
  assert.equal(await scalar(db, 'SELECT cause FROM public.project_accidents'), '지사 발주청이 고친 원인')
  // 고쳐도 원 작성자는 그대로다.
  assert.equal(await scalar(db, 'SELECT created_by FROM public.project_accidents'), IDS.supervisor)
})

test('공유받은 감리단은 남이 쓴 사고를 고치되 지우지는 못한다', async (t) => {
  const db = await openDb(t)
  await signIn(db, IDS.owner)
  await insertAccident(db)

  await signIn(db, IDS.supervisor)
  const updated = await db.query(
    `UPDATE public.project_accidents SET cause = '감리단이 보완한 원인' RETURNING id`
  )
  assert.equal(updated.rows.length, 1, '공유받은 감리단이 남의 사고를 고치지 못했다')

  await signOut(db)
  assert.equal(
    await scalar(db, 'SELECT cause FROM public.project_accidents'),
    '감리단이 보완한 원인',
    '감리단의 수정이 반영되지 않았다'
  )
  // 고쳐도 원 작성자는 그대로다.
  assert.equal(await scalar(db, 'SELECT created_by FROM public.project_accidents'), IDS.owner)

  await signIn(db, IDS.supervisor)
  const notDeleted = await db.query('DELETE FROM public.project_accidents RETURNING id')
  assert.equal(notDeleted.rows.length, 0, '공유받은 감리단이 남의 사고를 지웠다')

  await signOut(db)
  assert.equal(await visibleCount(db), 1, '남의 사고가 사라졌다')
})

test('작성자가 아니면 현장 소유자·지사 발주청도 남의 사고를 지우지 못한다', async (t) => {
  const db = await openDb(t)
  await signIn(db, IDS.supervisor)
  await insertAccident(db, { created_by: IDS.supervisor })

  for (const userId of [IDS.owner, IDS.branchClient]) {
    await signIn(db, userId)
    const notDeleted = await db.query('DELETE FROM public.project_accidents RETURNING id')
    assert.equal(notDeleted.rows.length, 0, `${userId}가 남의 사고를 지웠다`)
  }

  await signOut(db)
  assert.equal(await visibleCount(db), 1, '남의 사고가 사라졌다')
})

test('관할 밖 사용자는 남의 사고를 고치지도 지우지도 못한다', async (t) => {
  const db = await openDb(t)
  await signIn(db, IDS.supervisor)
  await insertAccident(db, { created_by: IDS.supervisor })

  for (const userId of [IDS.outsider, IDS.otherClient]) {
    await signIn(db, userId)
    const blocked = await db.query(
      `UPDATE public.project_accidents SET cause = '원인 바꿔치기' RETURNING id`
    )
    assert.equal(blocked.rows.length, 0, `${userId}가 관할 밖 사고를 고쳤다`)

    const notDeleted = await db.query('DELETE FROM public.project_accidents RETURNING id')
    assert.equal(notDeleted.rows.length, 0, `${userId}가 관할 밖 사고를 지웠다`)
  }

  await signOut(db)
  assert.equal(await scalar(db, 'SELECT cause FROM public.project_accidents'), '안전대 미체결')
})

test('작성자가 아닌 수정자도 작성자 칸을 남에게 넘기지 못한다', async (t) => {
  const db = await openDb(t)
  await signIn(db, IDS.supervisor)
  await insertAccident(db, { created_by: IDS.supervisor })

  await signIn(db, IDS.owner)
  const error = await expectError(
    db.query('UPDATE public.project_accidents SET created_by = $1::uuid', [IDS.owner])
  )
  assert.match(error.message, /created_by는 변경할 수 없습니다|row-level security/i)

  await signOut(db)
  assert.equal(await scalar(db, 'SELECT created_by FROM public.project_accidents'), IDS.supervisor)
})

test('작성자가 아닌 수정자도 볼 수 없는 현장으로 사고를 옮기지 못한다', async (t) => {
  const db = await openDb(t)
  await signIn(db, IDS.supervisor)
  await insertAccident(db, { created_by: IDS.supervisor })

  await signIn(db, IDS.owner)
  // USING은 통과하지만 WITH CHECK가 막으므로 조용히 0건이 아니라 예외로 거부된다.
  const error = await expectError(
    db.query('UPDATE public.project_accidents SET project_id = $1::uuid', [IDS.otherProject])
  )
  assert.match(error.message, /row-level security/i, '볼 수 없는 현장으로 남의 사고가 옮겨 갔다')

  // 자기 현장끼리는 옮길 수 있다. 위 차단이 "정책이 통과한 적 없어서"가 아님을 가른다.
  const moved = await db.query(
    'UPDATE public.project_accidents SET project_id = $1::uuid RETURNING id',
    [IDS.ownerSecondProject]
  )
  assert.equal(moved.rows.length, 1)

  await signOut(db)
  assert.equal(await scalar(db, 'SELECT project_id FROM public.project_accidents'), IDS.ownerSecondProject)
})

test('작성자가 아닌 수정자도 사고를 외부 미등록 현장으로 바꾸지 못한다', async (t) => {
  const db = await openDb(t)
  await signIn(db, IDS.supervisor)
  await insertAccident(db, { created_by: IDS.supervisor })

  await signIn(db, IDS.owner)
  const error = await expectError(
    db.query(
      `UPDATE public.project_accidents
          SET project_id = NULL,
              external_project_name = '아무 현장',
              external_managing_hq = '부산본부',
              external_managing_branch = '해운대지사'`
    )
  )
  assert.match(error.message, /row-level security/i, '남의 사고가 외부 현장으로 탈출했다')

  await signOut(db)
  assert.equal(await scalar(db, 'SELECT project_id FROM public.project_accidents'), IDS.ownerProject)
})

test('작성자라도 볼 수 없는 현장으로 사고를 옮기지 못한다', async (t) => {
  const db = await openDb(t)
  await signIn(db, IDS.owner)
  await insertAccident(db)

  // USING은 통과하지만 WITH CHECK가 막으므로 조용히 0건이 아니라 예외로 거부된다.
  const error = await expectError(
    db.query('UPDATE public.project_accidents SET project_id = $1::uuid', [IDS.otherProject])
  )
  assert.match(error.message, /row-level security/i, '볼 수 없는 현장으로 사고가 옮겨 갔다')

  // 자기 현장끼리는 옮길 수 있다. 위 차단이 "정책이 통과한 적 없어서"가 아님을 가른다.
  const moved = await db.query(
    'UPDATE public.project_accidents SET project_id = $1::uuid RETURNING id',
    [IDS.ownerSecondProject]
  )
  assert.equal(moved.rows.length, 1)

  await signOut(db)
  assert.equal(await scalar(db, 'SELECT project_id FROM public.project_accidents'), IDS.ownerSecondProject)
})

test('공유가 철회되면 작성자라도 자기 사고를 더는 보지도 고치지도 지우지도 못한다', async (t) => {
  const db = await openDb(t)
  await signIn(db, IDS.supervisor)
  await insertAccident(db, { created_by: IDS.supervisor })
  assert.equal(await visibleCount(db), 1, '공유 중에는 작성자에게 보여야 한다')

  // 감리단 교체 등으로 현장 공유가 끊기면 그 순간 사고에도 닿지 못한다.
  await signOut(db)
  await db.query('DELETE FROM public.project_shares WHERE project_id = $1::uuid AND shared_with = $2::uuid', [
    IDS.ownerProject,
    IDS.supervisor,
  ])

  await signIn(db, IDS.supervisor)
  assert.equal(await visibleCount(db), 0, '공유가 끊겼는데도 사고가 보인다')

  const notUpdated = await db.query(`UPDATE public.project_accidents SET cause = '뒤늦은 수정' RETURNING id`)
  assert.equal(notUpdated.rows.length, 0, '공유가 끊긴 작성자가 사고를 고쳤다')

  const notDeleted = await db.query('DELETE FROM public.project_accidents RETURNING id')
  assert.equal(notDeleted.rows.length, 0, '공유가 끊긴 작성자가 사고를 지웠다')

  // 현장은 그대로이므로 소유자와 관할 발주청에게는 계속 보인다.
  await signIn(db, IDS.owner)
  assert.equal(await visibleCount(db), 1)

  await signOut(db)
  assert.equal(await scalar(db, 'SELECT cause FROM public.project_accidents'), '안전대 미체결')
})

test('공유가 철회된 감리단은 남이 쓴 사고도 더는 고치지 못한다', async (t) => {
  const db = await openDb(t)
  await signIn(db, IDS.owner)
  await insertAccident(db)

  await signIn(db, IDS.supervisor)
  assert.equal(await visibleCount(db), 1, '공유 중에는 감리단에게 보여야 한다')

  // 철회 전 성공을 먼저 확인해야 철회 후 0건이 정책 때문임이 갈린다.
  const whileShared = await db.query(
    `UPDATE public.project_accidents SET cause = '공유 중 보완' RETURNING id`
  )
  assert.equal(whileShared.rows.length, 1, '공유 중인 감리단이 남의 사고를 고치지 못했다')

  await signOut(db)
  await db.query('DELETE FROM public.project_shares WHERE project_id = $1::uuid AND shared_with = $2::uuid', [
    IDS.ownerProject,
    IDS.supervisor,
  ])

  await signIn(db, IDS.supervisor)
  const notUpdated = await db.query(`UPDATE public.project_accidents SET cause = '뒤늦은 수정' RETURNING id`)
  assert.equal(notUpdated.rows.length, 0, '공유가 끊긴 감리단이 남의 사고를 고쳤다')

  await signOut(db)
  assert.equal(
    await scalar(db, 'SELECT cause FROM public.project_accidents'),
    '공유 중 보완',
    '공유가 끊긴 감리단의 수정이 반영됐다'
  )
})

test('작성자는 자기 사고를 외부 미등록 현장으로 바꿔 관할 판정을 벗어나지 못한다', async (t) => {
  const db = await openDb(t)
  await signIn(db, IDS.owner)
  await insertAccident(db)

  const error = await expectError(
    db.query(
      `UPDATE public.project_accidents
          SET project_id = NULL,
              external_project_name = '아무 현장',
              external_managing_hq = '부산본부',
              external_managing_branch = '해운대지사'`
    )
  )
  assert.match(error.message, /row-level security/i, '현장 사고가 외부 현장으로 탈출했다')

  await signOut(db)
  assert.equal(await scalar(db, 'SELECT project_id FROM public.project_accidents'), IDS.ownerProject)
})

test('작성자는 작성자 칸을 남에게 넘기지 못한다', async (t) => {
  const db = await openDb(t)
  await signIn(db, IDS.owner)
  await insertAccident(db)

  const error = await expectError(
    db.query('UPDATE public.project_accidents SET created_by = $1::uuid', [IDS.supervisor])
  )
  assert.match(error.message, /created_by는 변경할 수 없습니다|row-level security/i)

  await signOut(db)
  assert.equal(await scalar(db, 'SELECT created_by FROM public.project_accidents'), IDS.owner)
})

test('본부급 이상 발주청은 자기가 쓰지 않은 사고도 그대로 고치고 지운다', async (t) => {
  const db = await openDb(t)
  await signIn(db, IDS.owner)
  await insertAccident(db)

  await signIn(db, IDS.hqClient)
  const updated = await db.query(
    `UPDATE public.project_accidents SET severity = 'serious' RETURNING id`
  )
  assert.equal(updated.rows.length, 1, '본부급 발주청의 수정 권한이 사라졌다')

  await signIn(db, IDS.headOfficeClient)
  const deleted = await db.query('DELETE FROM public.project_accidents RETURNING id')
  assert.equal(deleted.rows.length, 1, '본사 발주청의 삭제 권한이 사라졌다')
})

test('본부급 이상 발주청은 관할 현장에 사고를 계속 등록한다', async (t) => {
  const db = await openDb(t)
  await signIn(db, IDS.hqClient)
  const inserted = await insertAccident(db, { created_by: IDS.hqClient })
  assert.equal(inserted.rows.length, 1)

  await signOut(db)
  assert.equal(await visibleCount(db), 1)
})

test('외부 미등록 현장 사고는 본부급 이상 발주청만 남기고 현장 사용자에게는 보이지 않는다', async (t) => {
  const db = await openDb(t)

  await signIn(db, IDS.owner)
  const bySiteUser = await expectError(insertExternalAccident(db, { created_by: IDS.owner }))
  assert.match(bySiteUser.message, /row-level security/i)

  await signIn(db, IDS.hqClient)
  const byHq = await insertExternalAccident(db)
  assert.equal(byHq.rows.length, 1)

  // 관할 조직 발주청에게는 보이고, 현장 사용자와 타 본부 발주청에게는 보이지 않는다.
  for (const userId of [IDS.hqClient, IDS.branchClient, IDS.headOfficeClient]) {
    await signIn(db, userId)
    assert.equal(await visibleCount(db), 1, `${userId}에게 외부 현장 사고가 보이지 않는다`)
  }
  for (const userId of [IDS.owner, IDS.supervisor, IDS.outsider, IDS.otherClient]) {
    await signIn(db, userId)
    assert.equal(await visibleCount(db), 0, `${userId}에게 외부 현장 사고가 새어 나갔다`)
  }
})

test('지사 발주청은 관할 현장 사고를 등록하되 본부 권한까지 얻지는 못한다', async (t) => {
  const db = await openDb(t)
  await signIn(db, IDS.branchClient)
  const inserted = await insertAccident(db, { created_by: IDS.branchClient })
  assert.equal(inserted.rows.length, 1)

  // 관할이라도 외부 미등록 현장은 여전히 본부급 이상만 남긴다.
  const external = await expectError(insertExternalAccident(db, { created_by: IDS.branchClient }))
  assert.match(external.message, /row-level security/i)
})

test('현장을 지우면 그 현장의 사고도 함께 사라진다', async (t) => {
  const db = await openDb(t)
  await signIn(db, IDS.owner)
  await insertAccident(db)

  await db.query('DELETE FROM public.projects WHERE id = $1::uuid', [IDS.ownerProject])

  await signOut(db)
  assert.equal(await visibleCount(db), 0)
})

// 이번 권한 확대와 무관한 기존 결함이라 통과 조건에서 분리한다.
// 20260718-0506의 prevent_project_accidents_created_by_change는 가드 없이 모든 UPDATE에 걸려,
// auth.users 삭제 시 FK의 ON DELETE SET NULL까지 'created_by는 변경할 수 없습니다'로 되돌린다.
// 즉 사고 기록이 있는 계정은 가입 해지가 통째로 실패한다(운영 함수 정의도 동일).
// 같은 저장소의 20260914-1339_quality_preserve_created_by.sql이 쓰는
// current_user = 'authenticated' AND pg_trigger_depth() = 1 가드가 해법이며, 별도 후속 과제로 둔다.
test.todo('가입 해지로 계정이 사라져도 사고 기록은 남는다 (기존 트리거 결함으로 실패)', async (t) => {
  const db = await openDb(t)
  await signIn(db, IDS.supervisor)
  await insertAccident(db, { created_by: IDS.supervisor })

  await signOut(db)
  await db.query('DELETE FROM auth.users WHERE id = $1::uuid', [IDS.supervisor])

  assert.equal(await visibleCount(db), 1)
  assert.equal(await scalar(db, 'SELECT created_by FROM public.project_accidents'), null)
})

test('산재신청 연도는 2000~2100만 받고 새 등록은 비워 둔다', async (t) => {
  const db = await openDb(t)
  await signIn(db, IDS.owner)
  await insertAccident(db)
  // 마이그레이션이 채운 기존 행은 없고, 새로 넣은 행은 앱이 값을 주기 전까지 NULL이다.
  assert.equal(await scalar(db, 'SELECT workers_comp_claim_year FROM public.project_accidents'), null)
  for (const year of [2000, 2026, 2100]) {
    await db.query('UPDATE public.project_accidents SET workers_comp_claim_year = $1::smallint', [year])
    assert.equal(Number(await scalar(db, 'SELECT workers_comp_claim_year FROM public.project_accidents')), year)
  }
  for (const year of [1999, 2101]) {
    const error = await expectError(
      db.query('UPDATE public.project_accidents SET workers_comp_claim_year = $1::smallint', [year])
    )
    assert.match(error.message, /project_accidents_workers_comp_claim_year_check/i, String(year))
  }
  await db.query('UPDATE public.project_accidents SET workers_comp_claim_year = NULL')
  assert.equal(await scalar(db, 'SELECT workers_comp_claim_year FROM public.project_accidents'), null)
})
