// 순회점검대장의 실제 SQL을 적용해 관할·작성자·열 권한과 무결성을 검증한다.
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createDb, IDS, ITEMS, SIGNATURE, MIGRATION_PATH, signIn, signOut, insertInspection, scalar } from './fixtures/patrol-ledger-db.mjs'
const table = 'public.patrol_ledger_inspections'
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
