// 순회점검대장의 실제 SQL을 적용해 관할·작성자·열 권한과 무결성을 검증한다.
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createDb, IDS, ITEMS, SIGNATURE, MIGRATION_PATH, signIn, signOut, insertInspection, scalar } from './fixtures/patrol-ledger-db.mjs'
const table = 'public.patrol_ledger_inspections'
const themeTable = 'public.patrol_ledger_weekly_themes'
const upsertTheme = (db, theme, userId, week = '2026-09-14') => db.query(`INSERT INTO ${themeTable} (week_start, theme, updated_by)
  VALUES ($1::date, $2, $3::uuid) ON CONFLICT (week_start) DO UPDATE SET theme = EXCLUDED.theme, updated_by = EXCLUDED.updated_by RETURNING theme, updated_by`, [week, theme, userId])
async function open(t) { const db = await createDb(); t.after(() => db.close()); return db }
test('재실행 안전성과 관할 조회·작성자 INSERT', async t => {
  const db = await open(t)
  await db.exec(readFileSync(MIGRATION_PATH, 'utf8'))
  await signIn(db, IDS.owner); await insertInspection(db)
  for (const user of [IDS.owner, IDS.sharedUser, IDS.client, IDS.outsider, IDS.otherClient, '']) {
    await signIn(db, user)
    assert.equal(Number(await scalar(db, `SELECT count(*) FROM ${table}`)), [IDS.owner, IDS.sharedUser, IDS.client].includes(user) ? 1 : 0)
  }
  await signIn(db, IDS.owner)
  await assert.rejects(insertInspection(db, { created_by: IDS.sharedUser }), /row-level security/i)
  await signIn(db, IDS.outsider)
  await assert.rejects(insertInspection(db, { created_by: IDS.outsider }), /row-level security/i)
})
test('작성자만 내용 UPDATE 가능하고 신원 열은 고칠 수 없다', async t => {
  const db = await open(t); await signIn(db, IDS.sharedUser); await insertInspection(db, { created_by: IDS.sharedUser })
  assert.equal((await db.query(`UPDATE ${table} SET finding_text = '수정', updated_at = now() RETURNING id`)).rows.length, 1)
  for (const user of [IDS.owner, IDS.client, IDS.outsider]) {
    await signIn(db, user)
    assert.equal((await db.query(`UPDATE ${table} SET finding_text = '거부' RETURNING id`)).rows.length, 0)
  }
  await signIn(db, IDS.sharedUser)
  for (const assignment of [`created_by = '${IDS.owner}'`, `project_id = '${IDS.ownerSecondProject}'`, 'created_at = now()', 'id = gen_random_uuid()']) await assert.rejects(db.query(`UPDATE ${table} SET ${assignment}`), /permission denied/i)
})
test('items CHECK는 잘못된 배열·번호·문자·분류·결과를 거부한다', async t => {
  const db = await open(t); await signIn(db, IDS.owner)
  for (const items of [null, {}, [], Array(11).fill(ITEMS[0]), [null], ['항목'], ...[{ no: 0 }, { no: 11 }, { no: 1.5 }, { no: '1' }, { no: null }, { text: '' }, { text: '  ' }, { text: 1 }, { category: '오류' }, { result: '오류' }, { result: null }].map(patch => [{ ...ITEMS[0], ...patch }])]) await assert.rejects(insertInspection(db, { items: JSON.stringify(items) }), /check constraint/i)
  await insertInspection(db)
  assert.deepEqual(await scalar(db, `SELECT items FROM ${table}`), ITEMS)
})
test('서명과 성명 CHECK는 장비 대장과 같은 규칙이다', async t => {
  const db = await open(t); await signIn(db, IDS.owner)
  for (const signature of ['', '(서명)', 'data:image/png;base64,abc', SIGNATURE.replace('png', 'jpeg')]) await assert.rejects(insertInspection(db, { signature }), /check constraint/i)
  for (const inspector_name of ['', '  ', '가'.repeat(101), '홍\n길동']) await assert.rejects(insertInspection(db, { inspector_name }), /check constraint/i)
})
test('삭제는 작성자·현장 소유자·관할 발주청에게만 허용된다', async t => {
  const db = await open(t)
  for (const user of [IDS.outsider, IDS.otherClient, IDS.sharedUser, IDS.owner, IDS.client]) {
    await signIn(db, IDS.sharedUser); await insertInspection(db, { created_by: IDS.sharedUser })
    await signIn(db, user)
    const deleted = await db.query(`DELETE FROM ${table} RETURNING id`)
    assert.equal(deleted.rows.length > 0, [IDS.sharedUser, IDS.owner, IDS.client].includes(user))
  }
})
test('계정 삭제는 기록을 보존하고 프로젝트 삭제는 CASCADE한다', async t => {
  const db = await open(t); await signIn(db, IDS.sharedUser); await insertInspection(db, { created_by: IDS.sharedUser }); await signOut(db)
  await db.query('DELETE FROM auth.users WHERE id = $1', [IDS.sharedUser])
  assert.equal(await scalar(db, `SELECT created_by FROM ${table}`), null)
  await db.query('DELETE FROM projects WHERE id = $1', [IDS.ownerProject])
  assert.equal(Number(await scalar(db, `SELECT count(*) FROM ${table}`)), 0)
})

test('사진 구분은 finding·overview만 허용하고 전경사진이면 지적사항이 비어 있어야 한다', async t => {
  const db = await open(t); await signIn(db, IDS.owner)
  await insertInspection(db, { finding_photo_kind: 'overview', finding_text: '' })
  await assert.rejects(insertInspection(db, { finding_photo_kind: 'overview', finding_text: '지적' }), /check constraint/i)
  await assert.rejects(insertInspection(db, { finding_photo_kind: 'panorama' }), /check constraint/i)
  assert.equal((await db.query(`UPDATE ${table} SET finding_photo_kind = 'finding', finding_text = '지적', updated_at = now() RETURNING id`)).rows.length, 1)
})

test('주간 테마는 지사 발주청·시공사 INSERT를 거부하고 본부 발주청 upsert만 허용한다', async t => {
  const db = await open(t)
  for (const user of [IDS.client, IDS.owner]) {
    await signIn(db, user)
    await assert.rejects(upsertTheme(db, '추락 예방', user), /row-level security/i)
  }
  await signIn(db, IDS.hqClient)
  assert.deepEqual((await upsertTheme(db, '추락 예방', IDS.hqClient)).rows, [{ theme: '추락 예방', updated_by: IDS.hqClient }])
  assert.deepEqual((await upsertTheme(db, '낙하물 예방', IDS.hqClient)).rows, [{ theme: '낙하물 예방', updated_by: IDS.hqClient }])
  for (const week of ['2026-09-14', '2026-09-21']) await assert.rejects(upsertTheme(db, '위조', IDS.owner, week), /row-level security/i)
  assert.equal(await scalar(db, `SELECT theme FROM ${themeTable}`), '낙하물 예방')
})

test('회사 공통 주간 테마는 모든 로그인 사용자가 읽는다', async t => {
  const db = await open(t)
  await signIn(db, IDS.hqClient); await upsertTheme(db, '추락 예방', IDS.hqClient)
  for (const user of [IDS.owner, IDS.sharedUser, IDS.outsider, IDS.client, IDS.otherClient, IDS.hqClient]) {
    await signIn(db, user)
    assert.equal(await scalar(db, `SELECT theme FROM ${themeTable}`), '추락 예방')
  }
})

test('주간 테마 CHECK는 빈 문자열·201자·줄바꿈을 거부한다', async t => {
  const db = await open(t); await signIn(db, IDS.hqClient)
  for (const theme of ['', '  ', '가'.repeat(201), '추락\n예방', '추락\r예방']) await assert.rejects(upsertTheme(db, theme, IDS.hqClient), /check constraint/i)
  assert.equal((await upsertTheme(db, '가'.repeat(200), IDS.hqClient)).rows[0].theme.length, 200)
})

test('기록 테마는 빈 값·200자를 허용하고 작성자 UPDATE와 한 줄 CHECK를 적용한다', async t => {
  const db = await open(t); await signIn(db, IDS.owner)
  await insertInspection(db)
  assert.equal(await scalar(db, `SELECT theme FROM ${table}`), '')
  for (const theme of ['가'.repeat(201), '추락\n예방', '추락\r예방']) {
    await assert.rejects(insertInspection(db, { theme }), /check constraint/i)
    await assert.rejects(db.query(`UPDATE ${table} SET theme = $1`, [theme]), /check constraint/i)
  }
  assert.deepEqual((await db.query(`UPDATE ${table} SET theme = $1 RETURNING theme`, ['가'.repeat(200)])).rows, [{ theme: '가'.repeat(200) }])
})
