// 장비 일일점검 대장의 RLS(관할·작성자)·답변 무결성 CHECK·수정 차단·CASCADE를 실제 마이그레이션으로 검증한다.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ANSWERS,
  IDS,
  SIGNATURE,
  createDb,
  expectError,
  insertInspection,
  scalar,
  signIn,
  signOut,
} from './fixtures/equipment-inspection-db.mjs'

/** 테스트가 실패해도 PGlite 인스턴스가 남지 않도록 생성 즉시 정리를 등록한다. */
async function openDb(t) {
  const db = await createDb()
  t.after(() => db.close())
  return db
}

async function visibleCount(db) {
  return Number(await scalar(db, 'SELECT COUNT(*) FROM public.equipment_daily_inspections'))
}

test('자기 현장에 남긴 점검은 소유자·공유자·관할 발주청에게 보인다', async (t) => {
  const db = await openDb(t)
  await signIn(db, IDS.owner)
  await insertInspection(db)

  for (const userId of [IDS.owner, IDS.sharedUser, IDS.client]) {
    await signIn(db, userId)
    assert.equal(await visibleCount(db), 1, `${userId}에게 점검이 보이지 않는다`)
  }
})

test('관할 밖 사용자에게는 다른 현장의 점검이 보이지 않는다', async (t) => {
  const db = await openDb(t)
  await signIn(db, IDS.owner)
  await insertInspection(db)

  for (const userId of [IDS.outsider, IDS.otherClient]) {
    await signIn(db, userId)
    assert.equal(await visibleCount(db), 0, `${userId}에게 관할 밖 점검이 새어 나갔다`)
  }
})

test('관할 밖 현장에는 점검을 제출할 수 없다', async (t) => {
  const db = await openDb(t)
  await signIn(db, IDS.outsider)

  const error = await expectError(insertInspection(db, { project_id: IDS.ownerProject, created_by: IDS.outsider }))
  assert.match(error.message, /row-level security/i)

  await signOut(db)
  assert.equal(await visibleCount(db), 0)
})

test('다른 사람을 작성자로 적은 제출은 거부된다', async (t) => {
  const db = await openDb(t)
  await signIn(db, IDS.owner)

  const error = await expectError(insertInspection(db, { created_by: IDS.sharedUser }))
  assert.match(error.message, /row-level security/i)

  const nullAuthor = await expectError(insertInspection(db, { created_by: null }))
  assert.match(nullAuthor.message, /row-level security/i)

  await signOut(db)
  assert.equal(await visibleCount(db), 0)
})

test('미점검 항목이 섞인 답변은 DB가 받지 않는다', async (t) => {
  const db = await openDb(t)
  await signIn(db, IDS.owner)

  const broken = [
    [],
    [{ ...ANSWERS[0], result: '' }],
    [{ ...ANSWERS[0], result: 'unknown' }],
    [{ id: 'equipment-01-01', category: '기본사항', result: 'pass' }],
    [{ ...ANSWERS[0], id: '   ' }],
    [{ ...ANSWERS[0], category: '' }],
    ['적합'],
    [{ ...ANSWERS[0], note: 3 }],
    // 내보내기가 문자열로 읽는 칸에 숫자·null이 오면 출력이 깨진다.
    [{ ...ANSWERS[0], id: 7 }],
    [{ ...ANSWERS[0], category: null }],
    [{ ...ANSWERS[0], text: 12 }],
    [{ ...ANSWERS[0], result: ['pass'] }],
  ]

  for (const answers of broken) {
    const error = await expectError(insertInspection(db, { answers: JSON.stringify(answers) }))
    assert.match(error.message, /check constraint|violates/i, `${JSON.stringify(answers)}가 통과했다`)
  }

  const objectAnswers = await expectError(insertInspection(db, { answers: '{}' }))
  assert.match(objectAnswers.message, /check constraint|violates/i)

  await signOut(db)
  assert.equal(await visibleCount(db), 0)
})

test('온전한 답변 배열은 그대로 저장된다', async (t) => {
  const db = await openDb(t)
  await signIn(db, IDS.owner)
  await insertInspection(db)

  const stored = await scalar(db, 'SELECT answers FROM public.equipment_daily_inspections')
  assert.deepEqual(stored, ANSWERS)
})

test('빈 서명이나 안내 문구는 서명 자리에 들어가지 못한다', async (t) => {
  const db = await openDb(t)
  await signIn(db, IDS.owner)

  const rejected = [
    '',
    '   ',
    '(서명 또는 인)',
    'data:image/png;base64,',
    'https://example.com/sign.png',
    // PNG가 아닌 이미지와 PNG 매직이 없는 base64는 서명 이미지로 열 수 없다.
    `data:image/jpeg;base64,${SIGNATURE.split('base64,')[1]}`,
    'data:image/png;base64,QUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQQ==',
    // 그림이라 보기 어려울 만큼 짧은 PNG.
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  ]

  for (const signature of rejected) {
    const error = await expectError(insertInspection(db, { signature }))
    assert.match(error.message, /check constraint|violates/i, `${signature.slice(0, 40)}가 서명으로 통과했다`)
  }
})

test('점검자 성명은 100자 이하 한 줄이어야 한다', async (t) => {
  const db = await openDb(t)
  await signIn(db, IDS.owner)

  const LF = String.fromCharCode(10)
  const CR = String.fromCharCode(13)

  for (const inspectorName of ['가'.repeat(101), `홍길동${LF}안전관리자`, `홍길동${CR}안전관리자`]) {
    const error = await expectError(insertInspection(db, { inspector_name: inspectorName }))
    assert.match(error.message, /check constraint|violates/i, `${JSON.stringify(inspectorName)}가 통과했다`)
  }

  // 경계값 100자는 받아들인다.
  const ok = await insertInspection(db, { inspector_name: '가'.repeat(100) })
  assert.equal(ok.rows.length, 1)
})

test('점검자 성명과 장비 이름은 공백만으로 채울 수 없다', async (t) => {
  const db = await openDb(t)
  await signIn(db, IDS.owner)

  for (const overrides of [{ inspector_name: '  ' }, { equipment_name: '' }, { equipment_type: ' ' }]) {
    const error = await expectError(insertInspection(db, overrides))
    assert.match(error.message, /check constraint|violates/i, `${JSON.stringify(overrides)}가 통과했다`)
  }
})

test('제출한 점검은 서명 뒤에 내용을 고칠 수 없다', async (t) => {
  const db = await openDb(t)
  await signIn(db, IDS.owner)
  await insertInspection(db)

  // UPDATE 정책이 없으므로 권한이 있어도 대상 행이 없다.
  const updated = await db.query(
    `UPDATE public.equipment_daily_inspections SET inspector_name = '다른사람' RETURNING id`
  )
  assert.equal(updated.rows.length, 0)

  await signOut(db)
  assert.equal(await scalar(db, 'SELECT inspector_name FROM public.equipment_daily_inspections'), '홍길동')
})

test('무관한 사용자는 점검을 지울 수 없고 작성자·소유자·관할 발주청은 지울 수 있다', async (t) => {
  const db = await openDb(t)

  await signIn(db, IDS.owner)
  await insertInspection(db)
  await signIn(db, IDS.outsider)
  const blocked = await db.query('DELETE FROM public.equipment_daily_inspections RETURNING id')
  assert.equal(blocked.rows.length, 0)

  await signOut(db)
  assert.equal(await visibleCount(db), 1)

  // 공유받은 감리단이 남긴 점검은 현장 소유자가 정리할 수 있다.
  await signIn(db, IDS.sharedUser)
  await insertInspection(db, { created_by: IDS.sharedUser })
  await signIn(db, IDS.owner)
  const byOwner = await db.query('DELETE FROM public.equipment_daily_inspections RETURNING id')
  assert.equal(byOwner.rows.length, 2)

  // 관할 발주청도 지울 수 있다.
  await signIn(db, IDS.owner)
  await insertInspection(db)
  await signIn(db, IDS.client)
  const byClient = await db.query('DELETE FROM public.equipment_daily_inspections RETURNING id')
  assert.equal(byClient.rows.length, 1)
})

test('현장을 지우면 그 현장의 점검도 함께 사라진다', async (t) => {
  const db = await openDb(t)
  await signIn(db, IDS.owner)
  await insertInspection(db)

  await db.query('DELETE FROM public.projects WHERE id = $1::uuid', [IDS.ownerProject])

  await signOut(db)
  assert.equal(await visibleCount(db), 0)
})

test('가입 해지로 계정이 사라져도 점검 기록은 남는다', async (t) => {
  const db = await openDb(t)
  await signIn(db, IDS.sharedUser)
  await insertInspection(db, { created_by: IDS.sharedUser })

  await signOut(db)
  await db.query('DELETE FROM auth.users WHERE id = $1::uuid', [IDS.sharedUser])

  assert.equal(await visibleCount(db), 1)
  assert.equal(await scalar(db, 'SELECT created_by FROM public.equipment_daily_inspections'), null)
  assert.equal(await scalar(db, 'SELECT signature FROM public.equipment_daily_inspections'), SIGNATURE)
})

test('로그인하지 않은 세션에는 아무것도 보이지 않는다', async (t) => {
  const db = await openDb(t)
  await signIn(db, IDS.owner)
  await insertInspection(db)

  await signIn(db, '')
  assert.equal(await visibleCount(db), 0)
})
