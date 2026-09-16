// 사고발생보고서 항목(project_accidents.report_details)의 컬럼·CHECK 제약을 실제 마이그레이션으로 검증한다.
// 형태가 깨진 보고서·과대 사진을 DB가 직접 막는지와, 기존 작성자 보존 트리거·RLS가 그대로인지를 함께 본다.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  IDS,
  createDb,
  expectError,
  insertAccident,
  scalar,
  signIn,
  signOut,
  updateReportDetails,
} from './fixtures/project-accidents-db.mjs'

/** 테스트가 실패해도 PGlite 인스턴스가 남지 않도록 생성 즉시 정리를 등록한다. */
async function openDb(t) {
  const db = await createDb()
  t.after(() => db.close())
  return db
}

/** 축소 JPEG data URL 한 장. FF D8 FF 매직의 base64 표기 /9j/로 시작한다. */
const JPEG = 'data:image/jpeg;base64,/9j/AAAABBBBCCCCDDDD'

/** 서식의 칸을 고루 채운 정상 보고서. */
const VALID_REPORT = {
  reportTitle: '사고발생보고',
  reportDate: '2026-09-16',
  reporterName: '홍길동',
  reporterPosition: '안전관리자',
  reporterPhone: '010-0000-0000',
  summary: '비계 해체 중 추락 사고가 발생하여 보고합니다.',
  accidentTime: '09:30',
  victimDetails: '가나다, 45세, 비계공',
  damageDetails: '우측 발목 골절, 인근 병원 입원',
  propertyDamage: '비계 일부 변형',
  responsibility: '작업 지휘자 안전대 확인 소홀',
  noNotificationReason: '',
  compensationDetails: '산재 신청 예정',
  actionDetails: '작업 중지 후 전 구간 안전대 부착설비 점검',
  otherNotes: '',
  relatedContacts: '현장 안전관리자 010-0000-0000',
  notifications: ['emergency119', 'police'],
  victimActions: ['hospital'],
  photos: [
    { dataUrl: JPEG, caption: '사고 발생 지점' },
    { dataUrl: JPEG, caption: '해체 중이던 비계' },
  ],
}

/** 사고 한 건을 넣고 그 id를 돌려준다. */
async function seedAccident(db, overrides = {}) {
  const inserted = await insertAccident(db, overrides)
  return inserted.rows[0].id
}

test('기존 방식으로 넣은 사고의 보고서 항목은 비어 있다', async (t) => {
  const db = await openDb(t)
  await signIn(db, IDS.owner)
  await seedAccident(db)

  await signOut(db)
  assert.equal(await scalar(db, 'SELECT report_details FROM public.project_accidents'), null)
})

test('칸을 고루 채운 보고서와 사진 두 장이 그대로 저장된다', async (t) => {
  const db = await openDb(t)
  await signIn(db, IDS.owner)
  const id = await seedAccident(db)

  const updated = await updateReportDetails(db, id, VALID_REPORT)
  assert.equal(updated.rows.length, 1)

  await signOut(db)
  const stored = await scalar(db, 'SELECT report_details FROM public.project_accidents')
  assert.equal(stored.reporterName, '홍길동')
  assert.equal(stored.accidentTime, '09:30')
  assert.deepEqual(stored.notifications, ['emergency119', 'police'])
  assert.deepEqual(stored.victimActions, ['hospital'])
  assert.equal(stored.photos.length, 2)
  assert.equal(stored.photos[0].caption, '사고 발생 지점')
})

test('사진 없이 글만 적은 보고서도 저장된다', async (t) => {
  const db = await openDb(t)
  await signIn(db, IDS.owner)
  const id = await seedAccident(db)

  const updated = await updateReportDetails(db, id, { summary: '경미한 사고로 사진 없이 보고합니다.' })
  assert.equal(updated.rows.length, 1)

  await signOut(db)
  const stored = await scalar(db, 'SELECT report_details FROM public.project_accidents')
  assert.equal(stored.summary, '경미한 사고로 사진 없이 보고합니다.')
})

test('형태가 어긋난 보고서는 DB가 거부한다', async (t) => {
  const db = await openDb(t)
  await signIn(db, IDS.owner)
  const id = await seedAccident(db)

  const rejected = [
    ['사진 세 장', { photos: [{ dataUrl: JPEG, caption: '' }, { dataUrl: JPEG, caption: '' }, { dataUrl: JPEG, caption: '' }] }],
    ['PNG 사진', { photos: [{ dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAA', caption: '' }] }],
    ['사진 설명 201자', { photos: [{ dataUrl: JPEG, caption: '가'.repeat(201) }] }],
    ['모르는 키', { summary: '요지', unexpectedKey: '몰래 담은 값' }],
    ['잘못된 보고일', { reportDate: '2026/09/16' }],
    ['잘못된 사고 시각', { accidentTime: '25:00' }],
    ['장문 4001자', { summary: '가'.repeat(4001) }],
    ['짧은 칸 201자', { reporterName: '가'.repeat(201) }],
    ['모르는 신고처', { notifications: ['sms'] }],
    ['모르는 피해자 조치', { victimActions: ['office'] }],
    ['문자열이 아닌 칸', { reporterName: 123 }],
    ['배열이 아닌 사진', { photos: { dataUrl: JPEG } }],
  ]

  for (const [label, details] of rejected) {
    const error = await expectError(updateReportDetails(db, id, details))
    assert.match(error.message, /project_accidents_report_details_check/i, `${label}이(가) 통과했다`)
  }

  // 보고서 자리에 객체가 아닌 배열이 오는 것도 막는다.
  const arrayError = await expectError(updateReportDetails(db, id, [VALID_REPORT]))
  assert.match(arrayError.message, /project_accidents_report_details_check/i, '배열 보고서가 통과했다')

  await signOut(db)
  assert.equal(await scalar(db, 'SELECT report_details FROM public.project_accidents'), null)
})

test('사진 객체에 dataUrl·caption 말고 다른 키가 붙으면 거부한다', async (t) => {
  const db = await openDb(t)
  await signIn(db, IDS.owner)
  const id = await seedAccident(db)

  const rejected = [
    ['곁다리 문자열 키', { photos: [{ dataUrl: JPEG, caption: '사고 지점', extra: '몰래 담은 값' }] }],
    ['곁다리 객체 키', { photos: [{ dataUrl: JPEG, meta: { big: '가'.repeat(500) } }] }],
  ]

  for (const [label, details] of rejected) {
    const error = await expectError(updateReportDetails(db, id, details))
    assert.match(error.message, /project_accidents_report_details_check/i, `${label}이(가) 통과했다`)
  }

  await signOut(db)
  assert.equal(await scalar(db, 'SELECT report_details FROM public.project_accidents'), null)
})

test('신고처·피해자 조치 배열은 선택지 수를 넘지 못한다', async (t) => {
  const db = await openDb(t)
  await signIn(db, IDS.owner)
  const id = await seedAccident(db)

  const rejected = [
    // 중복으로 배열을 부풀려 큰 JSON을 숨기는 길을 막는다.
    ['신고처 다섯 개', { notifications: ['emergency119', 'police', 'laborOffice', 'family', 'police'] }],
    ['피해자 조치 네 개', { victimActions: ['hospital', 'funeralHome', 'home', 'home'] }],
    ['배열이 아닌 신고처', { notifications: 'emergency119' }],
  ]

  for (const [label, details] of rejected) {
    const error = await expectError(updateReportDetails(db, id, details))
    assert.match(error.message, /project_accidents_report_details_check/i, `${label}이(가) 통과했다`)
  }

  // 선택지를 모두 고른 경우(신고처 4개·피해자 조치 3개)는 그대로 통과한다.
  const full = {
    notifications: ['emergency119', 'police', 'laborOffice', 'family'],
    victimActions: ['hospital', 'funeralHome', 'home'],
  }
  const updated = await updateReportDetails(db, id, full)
  assert.equal(updated.rows.length, 1)

  await signOut(db)
  const stored = await scalar(db, 'SELECT report_details FROM public.project_accidents')
  assert.deepEqual(stored.notifications, full.notifications)
  assert.deepEqual(stored.victimActions, full.victimActions)
})

test('보고서 자리에 객체가 아닌 값이나 JSON null이 오면 거부한다', async (t) => {
  const db = await openDb(t)
  await signIn(db, IDS.owner)
  const id = await seedAccident(db)

  const scalarError = await expectError(updateReportDetails(db, id, 'abc'))
  assert.match(scalarError.message, /project_accidents_report_details_check/i, '문자열 보고서가 통과했다')

  const numberError = await expectError(updateReportDetails(db, id, 1))
  assert.match(numberError.message, /project_accidents_report_details_check/i, '숫자 보고서가 통과했다')

  // JSONB null은 SQL NULL이 아니라서 CHECK의 IS NULL 분기로 빠지지 않는다.
  // 함수가 실제로 호출되고 jsonb_typeof가 'null'이라 object 판정에서 거짓이 되어야 한다.
  const jsonNullError = await expectError(
    db.query(
      `UPDATE public.project_accidents
          SET report_details = 'null'::jsonb
        WHERE id = $1::uuid`,
      [id]
    )
  )
  assert.match(jsonNullError.message, /project_accidents_report_details_check/i, 'JSON null 보고서가 통과했다')

  await signOut(db)
  assert.equal(await scalar(db, 'SELECT report_details FROM public.project_accidents'), null)
})

test('문자열 칸에 JSON null이 오면 거부한다', async (t) => {
  const db = await openDb(t)
  await signIn(db, IDS.owner)
  const id = await seedAccident(db)

  const error = await expectError(updateReportDetails(db, id, { reporterName: null }))
  assert.match(error.message, /project_accidents_report_details_check/i, 'JSON null 보고자 성명이 통과했다')

  await signOut(db)
  assert.equal(await scalar(db, 'SELECT report_details FROM public.project_accidents'), null)
})

test('보고서 항목을 빼고 다른 칸만 고치면 기존 보고서가 그대로 남는다', async (t) => {
  const db = await openDb(t)
  await signIn(db, IDS.owner)
  const id = await seedAccident(db)
  await updateReportDetails(db, id, VALID_REPORT)

  const updated = await db.query(
    `UPDATE public.project_accidents SET cause = '안전대 부착설비 미설치' RETURNING id`
  )
  assert.equal(updated.rows.length, 1)

  await signOut(db)
  assert.equal(await scalar(db, 'SELECT cause FROM public.project_accidents'), '안전대 부착설비 미설치')
  const stored = await scalar(db, 'SELECT report_details FROM public.project_accidents')
  assert.equal(stored.reporterName, '홍길동')
  assert.equal(stored.photos.length, 2)
})

test('보고서를 붙여도 작성자 칸은 바뀌지 않는다', async (t) => {
  const db = await openDb(t)
  await signIn(db, IDS.supervisor)
  const id = await seedAccident(db, { created_by: IDS.supervisor })

  // 작성자가 아닌 감리단·현장 사용자도 보고서 칸은 보완할 수 있다.
  await signIn(db, IDS.owner)
  const updated = await updateReportDetails(db, id, VALID_REPORT)
  assert.equal(updated.rows.length, 1, '현장 소유자가 남의 사고 보고서를 보완하지 못했다')

  // 보고서와 함께 작성자 칸을 바꾸려 하면 기존 트리거가 그대로 막는다.
  const error = await expectError(
    db.query(
      `UPDATE public.project_accidents
          SET report_details = $2::jsonb, created_by = $3::uuid
        WHERE id = $1::uuid`,
      [id, JSON.stringify({ summary: '작성자까지 바꾸려는 시도' }), IDS.owner]
    )
  )
  assert.match(error.message, /created_by는 변경할 수 없습니다|row-level security/i)

  await signOut(db)
  assert.equal(await scalar(db, 'SELECT created_by FROM public.project_accidents'), IDS.supervisor)
  const stored = await scalar(db, 'SELECT report_details FROM public.project_accidents')
  assert.equal(stored.reporterName, '홍길동')
})

test('관할 밖 사용자는 보고서 항목을 고치지 못한다', async (t) => {
  const db = await openDb(t)
  await signIn(db, IDS.owner)
  const id = await seedAccident(db)
  await updateReportDetails(db, id, VALID_REPORT)

  for (const userId of [IDS.outsider, IDS.otherClient]) {
    await signIn(db, userId)
    const blocked = await updateReportDetails(db, id, { summary: '보고서 바꿔치기' })
    assert.equal(blocked.rows.length, 0, `${userId}가 관할 밖 사고 보고서를 고쳤다`)
  }

  await signOut(db)
  const stored = await scalar(db, 'SELECT report_details FROM public.project_accidents')
  assert.equal(stored.summary, VALID_REPORT.summary)
})
