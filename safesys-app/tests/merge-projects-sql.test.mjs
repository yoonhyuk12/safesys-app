// 프로젝트 병합 SQL(merge_projects/merge_projects_safe_v2/preview_project_merge_v2)의 데이터 보존 회귀 테스트.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CHILD_TABLES,
  DEFAULTS,
  IDS,
  callMerge,
  createDb,
  scalar,
  seedChildren,
  seedLegacyTbm,
  seedProjects,
} from './fixtures/merge-projects-db.mjs'

const NO_CONFLICT = { workDailyReports: 0, qualityMonthlyReports: 0, scheduleConflict: false }
const SOURCE_SCHEDULE = {
  items: [{ id: 'item-1', name: '기초공', amount: 1000, startIndex: 0, endIndex: 2 }],
  contractNo: 'SRC-2026-001',
}

/** 테스트가 실패해도 PGlite 인스턴스가 남지 않도록 생성 즉시 정리를 등록한다. */
async function openDb(t) {
  const db = await createDb()
  t.after(() => db.close())
  return db
}

async function countRows(db, table, projectId) {
  return Number(await scalar(db, `SELECT COUNT(*) FROM ${table} WHERE project_id = $1::uuid`, [projectId]))
}

async function projectRow(db, id) {
  const result = await db.query('SELECT * FROM projects WHERE id = $1::uuid', [id])
  return result.rows[0] ?? null
}

async function expectError(promise) {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('예외가 발생하지 않았습니다.')
}

test('27개 자식과 간접 자식이 target으로 이전되고 source 프로젝트만 삭제된다', async (t) => {
  const db = await openDb(t)
  await seedProjects(db)
  await seedChildren(db)
  await seedLegacyTbm(db)

  const payload = await callMerge(db)

  assert.equal(await projectRow(db, IDS.source), null)
  assert.notEqual(await projectRow(db, IDS.target), null)

  for (const table of CHILD_TABLES) {
    assert.equal(await countRows(db, table, IDS.source), 0, `${table}에 source 잔여 행이 있다`)
    assert.ok(await countRows(db, table, IDS.target) > 0, `${table}이 target으로 이전되지 않았다`)
  }

  // 비정규화된 TBM 표시값은 target 기준으로 갱신된다.
  const tbmNames = await db.query('SELECT project_name, headquarters, branch FROM tbm_submissions ORDER BY meeting_date')
  for (const row of tbmNames.rows) {
    assert.equal(row.project_name, DEFAULTS.target.project_name)
    assert.equal(row.headquarters, DEFAULTS.target.managing_hq)
    assert.equal(row.branch, DEFAULTS.target.managing_branch)
  }
  assert.equal(payload.moved_legacy_tbm, 1)

  const safeName = await scalar(db, 'SELECT project_name FROM tbm_safety_inspections LIMIT 1')
  assert.equal(safeName, DEFAULTS.target.project_name)
})

test('간접 자식의 서명과 첨부 URL이 병합 후에도 유지된다', async (t) => {
  const db = await openDb(t)
  await seedProjects(db)
  await seedChildren(db)

  await callMerge(db)

  const ledger = await db.query(`
    SELECT e.supervisor_confirm, e.inspection_photos
      FROM material_ledger_entries e
      JOIN materials m ON m.id = e.material_id
     WHERE m.project_id = $1::uuid
  `, [IDS.target])
  assert.equal(ledger.rows.length, 1)
  assert.equal(ledger.rows[0].supervisor_confirm, 'data:image/png;base64,LEDGER')
  assert.deepEqual(ledger.rows[0].inspection_photos, ['https://example.com/insp-1.jpg'])

  const results = await db.query(`
    SELECT r.photo_url, r.after_photo_url
      FROM safety_inspection_results r
      JOIN safety_inspections i ON i.id = r.inspection_id
     WHERE i.project_id = $1::uuid
  `, [IDS.target])
  assert.equal(results.rows.length, 1)
  assert.equal(results.rows[0].photo_url, 'https://example.com/before.jpg')
  assert.equal(results.rows[0].after_photo_url, 'https://example.com/after.jpg')

  const photoUrl = await scalar(db, `
    SELECT p.photo_url FROM safety_inspection_photos p
      JOIN safety_inspections i ON i.id = p.inspection_id
     WHERE i.project_id = $1::uuid
  `, [IDS.target])
  assert.equal(photoUrl, 'https://example.com/good.jpg')

  const workerSignature = await scalar(db, `
    SELECT s.signature FROM tbm_worker_signatures s
      JOIN tbm_submissions t ON t.id = s.tbm_submission_id
     WHERE t.project_id = $1::uuid
  `, [IDS.target])
  assert.equal(workerSignature, 'data:image/png;base64,TBMWORKER')

  const inspectionSignatures = await scalar(db, 'SELECT signatures FROM safety_inspections LIMIT 1')
  assert.equal(inspectionSignatures[0].signature, 'data:image/png;base64,SUP')
})

test('target의 기존 입력값은 유지되고 비어 있는 선택값만 source로 보충된다', async (t) => {
  const db = await openDb(t)
  await seedProjects(db, {
    source: {
      project_category: '교량',
      risk_business_type: '건설업',
      total_budget: '5000000000',
      current_year_budget: '1000000000',
      supervisor_position: '과장',
      supervisor_name: '김감독',
      supervisor_phone: '010-1111-2222',
      actual_work_address: '서울시 강남구 실제현장',
      construction_start_date: '2026-01-02',
      construction_end_date: '2026-12-30',
      business_card_pdf_url: 'https://example.com/card.pdf',
      client_telegram_id: 'client-src',
      contractor_telegram_id: 'contractor-src',
      privacy_manager_name: '개인정보담당',
      privacy_manager_position: '대리',
      privacy_manager_email: 'privacy@example.com',
      privacy_manager_phone: '010-3333-4444',
      cctv_rtsp_url: 'rtsp://example.com/source',
      client_app_code: 'CLIENT-SRC',
      contractor_app_code: 'CONTRACTOR-SRC',
      construction_law_safety_plan: true,
      industrial_law_safety_ledger: true,
      disaster_prevention_target: true,
    },
    target: {
      project_category: '터널',
      supervisor_name: '박감독',
      construction_start_date: '2026-02-01',
      client_telegram_id: 'client-tgt',
      construction_law_safety_plan: false,
      industrial_law_safety_ledger: false,
      disaster_prevention_target: false,
    },
  })

  await callMerge(db)
  const target = await projectRow(db, IDS.target)
  const dates = await db.query(`
    SELECT to_char(construction_start_date, 'YYYY-MM-DD') AS start_date,
           to_char(construction_end_date, 'YYYY-MM-DD') AS end_date
      FROM projects WHERE id = $1::uuid
  `, [IDS.target])

  // target 값 유지.
  assert.equal(target.project_category, '터널')
  assert.equal(target.supervisor_name, '박감독')
  assert.equal(dates.rows[0].start_date, '2026-02-01')
  assert.equal(target.client_telegram_id, 'client-tgt')

  // 빈 값 보충.
  assert.equal(target.risk_business_type, '건설업')
  assert.equal(target.total_budget, '5000000000')
  assert.equal(target.current_year_budget, '1000000000')
  assert.equal(target.supervisor_position, '과장')
  assert.equal(target.supervisor_phone, '010-1111-2222')
  assert.equal(target.actual_work_address, '서울시 강남구 실제현장')
  assert.equal(dates.rows[0].end_date, '2026-12-30')
  assert.equal(target.business_card_pdf_url, 'https://example.com/card.pdf')
  assert.equal(target.contractor_telegram_id, 'contractor-src')
  assert.equal(target.privacy_manager_name, '개인정보담당')
  assert.equal(target.privacy_manager_position, '대리')
  assert.equal(target.privacy_manager_email, 'privacy@example.com')
  assert.equal(target.privacy_manager_phone, '010-3333-4444')
  assert.equal(target.cctv_rtsp_url, 'rtsp://example.com/source')
  assert.equal(target.client_app_code, 'CLIENT-SRC')
  assert.equal(target.contractor_app_code, 'CONTRACTOR-SRC')

  // 체크박스는 어느 쪽이든 true면 보존한다.
  assert.equal(target.construction_law_safety_plan, true)
  assert.equal(target.industrial_law_safety_ledger, true)
  assert.equal(target.disaster_prevention_target, true)

  // 분기 상태 묶음은 target 값을 유지한다.
  assert.deepEqual(target.is_active, { q1: true, q2: true, q3: true, q4: true, completed: false })
})

test('target 공정표가 비어 있는 다섯 형태일 때 source 공정표로 보충된다', async (t) => {
  const blanks = [null, 'null', '{}', '[]', '{"items":[],"updatedAt":"2026-09-01T00:00:00.000Z"}']
  for (const blank of blanks) {
    const db = await openDb(t)
    await seedProjects(db, {
      source: { construction_schedule: JSON.stringify(SOURCE_SCHEDULE) },
      target: { construction_schedule: blank },
    })

    await callMerge(db)
    const target = await projectRow(db, IDS.target)
    assert.deepEqual(target.construction_schedule, SOURCE_SCHEDULE, `빈 공정표(${String(blank)}) 보충 실패`)
  }
})

test('두 현장 공정표가 서로 다르면 MERGE_SCHEDULE_CONFLICT로 전체가 롤백된다', async (t) => {
  const db = await openDb(t)
  const targetSchedule = { items: [{ id: 'item-9', name: '포장공', amount: 500, startIndex: 1, endIndex: 3 }] }
  await seedProjects(db, {
    source: { construction_schedule: JSON.stringify(SOURCE_SCHEDULE) },
    target: { construction_schedule: JSON.stringify(targetSchedule) },
  })
  await seedChildren(db)

  const counts = await scalar(db, 'SELECT public.preview_project_merge_v2($1::uuid, $2::uuid)', [IDS.source, IDS.target])
  assert.deepEqual(counts, { ...NO_CONFLICT, scheduleConflict: true })

  const error = await expectError(callMerge(db))
  assert.equal(error.message, 'MERGE_SCHEDULE_CONFLICT')
  assert.equal(error.code, 'P0001')
  assert.deepEqual(JSON.parse(error.detail), { ...NO_CONFLICT, scheduleConflict: true })

  // 두 현장의 공정표와 source 자식 행이 병합 전 그대로 남는다.
  const source = await projectRow(db, IDS.source)
  assert.notEqual(source, null)
  assert.deepEqual(source.construction_schedule, SOURCE_SCHEDULE)
  const target = await projectRow(db, IDS.target)
  assert.deepEqual(target.construction_schedule, targetSchedule)
  for (const table of CHILD_TABLES) {
    assert.ok(await countRows(db, table, IDS.source) > 0, `${table}의 source 행이 사라졌다`)
  }
})

test('두 현장 공정표가 완전히 같으면 잃을 것이 없으므로 그대로 병합한다', async (t) => {
  const db = await openDb(t)
  await seedProjects(db, {
    source: { construction_schedule: JSON.stringify(SOURCE_SCHEDULE) },
    target: { construction_schedule: JSON.stringify(SOURCE_SCHEDULE) },
  })

  const counts = await scalar(db, 'SELECT public.preview_project_merge_v2($1::uuid, $2::uuid)', [IDS.source, IDS.target])
  assert.deepEqual(counts, NO_CONFLICT)

  await callMerge(db)
  assert.equal(await projectRow(db, IDS.source), null)
  const target = await projectRow(db, IDS.target)
  assert.deepEqual(target.construction_schedule, SOURCE_SCHEDULE)
})

test('공사관리번호만 있는 공정표는 비어 있지 않으므로 서로 다른 공정표로 보아 막는다', async (t) => {
  const db = await openDb(t)
  const targetSchedule = { items: [], contractNo: 'TGT-2026-777' }
  await seedProjects(db, {
    source: { construction_schedule: JSON.stringify(SOURCE_SCHEDULE) },
    target: { construction_schedule: JSON.stringify(targetSchedule) },
  })

  const error = await expectError(callMerge(db))
  assert.equal(error.message, 'MERGE_SCHEDULE_CONFLICT')

  // 빈 공정표로 오해했다면 target이 source 공정표로 덮여 있었을 것이다.
  const target = await projectRow(db, IDS.target)
  assert.deepEqual(target.construction_schedule, targetSchedule)
  assert.notEqual(await projectRow(db, IDS.source), null)
})

test('공정표를 보충해도 착공·준공일이 같으면 그대로 병합된다', async (t) => {
  const db = await openDb(t)
  await seedProjects(db, {
    source: {
      construction_schedule: JSON.stringify(SOURCE_SCHEDULE),
      construction_start_date: '2026-03-01',
      construction_end_date: '2026-11-30',
    },
    target: {
      construction_start_date: '2026-03-01',
      construction_end_date: '2026-11-30',
    },
  })

  const counts = await scalar(db, 'SELECT public.preview_project_merge_v2($1::uuid, $2::uuid)', [IDS.source, IDS.target])
  assert.deepEqual(counts, NO_CONFLICT)

  await callMerge(db)
  const target = await projectRow(db, IDS.target)
  assert.deepEqual(target.construction_schedule, SOURCE_SCHEDULE)
})

test('공정표를 보충하면 착공일이 달라지는 경우 MERGE_SCHEDULE_CONFLICT로 전체가 롤백된다', async (t) => {
  const db = await openDb(t)
  await seedProjects(db, {
    source: {
      construction_schedule: JSON.stringify(SOURCE_SCHEDULE),
      construction_start_date: '2026-03-01',
      construction_end_date: '2026-11-30',
    },
    target: {
      construction_start_date: '2026-05-01',
      construction_end_date: '2026-11-30',
    },
  })
  await seedChildren(db)

  const counts = await scalar(db, 'SELECT public.preview_project_merge_v2($1::uuid, $2::uuid)', [IDS.source, IDS.target])
  assert.deepEqual(counts, { workDailyReports: 0, qualityMonthlyReports: 0, scheduleConflict: true })

  const error = await expectError(callMerge(db))
  assert.equal(error.message, 'MERGE_SCHEDULE_CONFLICT')
  assert.equal(error.code, 'P0001')
  assert.deepEqual(JSON.parse(error.detail), { workDailyReports: 0, qualityMonthlyReports: 0, scheduleConflict: true })

  assert.notEqual(await projectRow(db, IDS.source), null)
  const source = await projectRow(db, IDS.source)
  assert.deepEqual(source.construction_schedule, SOURCE_SCHEDULE)
  for (const table of CHILD_TABLES) {
    assert.ok(await countRows(db, table, IDS.source) > 0, `${table}의 source 행이 사라졌다`)
  }
})

test('공정표를 보충하면 준공일이 달라지는 경우에도 병합을 중단한다', async (t) => {
  const db = await openDb(t)
  await seedProjects(db, {
    source: {
      construction_schedule: JSON.stringify(SOURCE_SCHEDULE),
      construction_start_date: '2026-03-01',
      construction_end_date: '2026-11-30',
    },
    target: {
      construction_start_date: '2026-03-01',
      construction_end_date: '2026-12-31',
    },
  })

  const error = await expectError(callMerge(db))
  assert.equal(error.message, 'MERGE_SCHEDULE_CONFLICT')
  assert.notEqual(await projectRow(db, IDS.source), null)
})

test('target에 계약 식별자나 연계값이 있으면 계약 묶음을 통째로 유지한다', async (t) => {
  const db = await openDb(t)
  await seedProjects(db, {
    source: {
      g2b_cntrct_no: 'SRC-CNTRCT',
      g2b_ntce_no: 'SRC-NTCE',
      g2b_corp_nm: '가나건설',
      g2b_tot_amt: 5000,
      g2b_thtm_amt: 1000,
    },
    target: { g2b_cntrct_no: 'TGT-CNTRCT' },
  })
  await db.query('INSERT INTO project_contracts (id, project_id, cntrct_no) VALUES ($1::uuid, $2::uuid, $3)', [
    IDS.sourceContract, IDS.source, 'SRC-CNTRCT',
  ])
  await db.query('UPDATE projects SET representative_contract_id = $1::uuid WHERE id = $2::uuid', [
    IDS.sourceContract, IDS.source,
  ])

  await callMerge(db)
  const target = await projectRow(db, IDS.target)

  assert.equal(target.g2b_cntrct_no, 'TGT-CNTRCT')
  assert.equal(target.g2b_ntce_no, null)
  assert.equal(target.g2b_corp_nm, null)
  assert.equal(target.g2b_tot_amt, null)
  assert.equal(target.g2b_thtm_amt, null)
  assert.equal(target.representative_contract_id, null)
})

test('target 계약 묶음이 모두 비었을 때만 source 계약 묶음 전체를 복사한다', async (t) => {
  const db = await openDb(t)
  await seedProjects(db, {
    source: {
      g2b_cntrct_no: 'SRC-CNTRCT',
      g2b_ntce_no: 'SRC-NTCE',
      g2b_corp_nm: '가나건설',
      g2b_tot_amt: 5000,
      g2b_thtm_amt: 1000,
    },
  })
  await db.query('INSERT INTO project_contracts (id, project_id, cntrct_no) VALUES ($1::uuid, $2::uuid, $3)', [
    IDS.sourceContract, IDS.source, 'SRC-CNTRCT',
  ])
  await db.query('UPDATE projects SET representative_contract_id = $1::uuid WHERE id = $2::uuid', [
    IDS.sourceContract, IDS.source,
  ])

  await callMerge(db)
  const target = await projectRow(db, IDS.target)

  assert.equal(target.g2b_cntrct_no, 'SRC-CNTRCT')
  assert.equal(target.g2b_ntce_no, 'SRC-NTCE')
  assert.equal(target.g2b_corp_nm, '가나건설')
  assert.equal(Number(target.g2b_tot_amt), 5000)
  assert.equal(Number(target.g2b_thtm_amt), 1000)
  assert.equal(target.representative_contract_id, IDS.sourceContract)

  // 대표계약 행 자체도 target으로 이전되어 참조가 유효하다.
  const contractProject = await scalar(db, 'SELECT project_id FROM project_contracts WHERE id = $1::uuid', [IDS.sourceContract])
  assert.equal(contractProject, IDS.target)
})

test('주소·좌표 묶음은 target 우선이고 display_order는 바뀌지 않는다', async (t) => {
  const db = await openDb(t)
  await seedProjects(db, {
    source: {
      site_address: '서울시 강남구 source',
      site_address_detail: '2층',
      latitude: 37.5,
      longitude: 127.05,
      display_order: 9,
    },
    target: {
      site_address: '서울시 서초구 target',
      display_order: 3,
    },
  })

  await callMerge(db)
  const target = await projectRow(db, IDS.target)

  assert.equal(target.site_address, '서울시 서초구 target')
  assert.equal(target.site_address_detail, null)
  assert.equal(target.latitude, null)
  assert.equal(target.longitude, null)
  assert.equal(target.display_order, 3)
})

test('기본주소가 같으면 비어 있는 target 상세주소를 source 상세주소로 보충한다', async (t) => {
  const db = await openDb(t)
  await seedProjects(db, {
    source: {
      site_address: '서울시 강남구 테헤란로 1',
      site_address_detail: '3층 현장사무실',
      latitude: 37.5,
      longitude: 127.05,
    },
    target: {
      site_address: '서울시 강남구 테헤란로 1',
      latitude: 37.4,
      longitude: 127.01,
    },
  })

  await callMerge(db)
  const target = await projectRow(db, IDS.target)

  assert.equal(target.site_address_detail, '3층 현장사무실')
  // 좌표는 target 값을 그대로 유지한다.
  assert.equal(Number(target.latitude), 37.4)
  assert.equal(Number(target.longitude), 127.01)
})

test('기본주소가 다르면 source 상세주소를 가져오지 않는다', async (t) => {
  const db = await openDb(t)
  await seedProjects(db, {
    source: {
      site_address: '서울시 강남구 테헤란로 1',
      site_address_detail: '3층 현장사무실',
    },
    target: {
      site_address: '서울시 서초구 반포대로 2',
    },
  })

  await callMerge(db)
  const target = await projectRow(db, IDS.target)

  assert.equal(target.site_address, '서울시 서초구 반포대로 2')
  assert.equal(target.site_address_detail, null)
})

test('target 상세주소가 있으면 기본주소가 같아도 덮어쓰지 않는다', async (t) => {
  const db = await openDb(t)
  await seedProjects(db, {
    source: {
      site_address: '서울시 강남구 테헤란로 1',
      site_address_detail: '3층 현장사무실',
    },
    target: {
      site_address: '서울시 강남구 테헤란로 1',
      site_address_detail: '지하 1층',
    },
  })

  await callMerge(db)
  const target = await projectRow(db, IDS.target)
  assert.equal(target.site_address_detail, '지하 1층')
})

test('target 주소 묶음이 완전히 비었을 때만 source 주소·좌표를 통째로 복사한다', async (t) => {
  const db = await openDb(t)
  await seedProjects(db, {
    source: {
      site_address: '서울시 강남구 source',
      site_address_detail: '2층',
      latitude: 37.5,
      longitude: 127.05,
    },
  })

  await callMerge(db)
  const target = await projectRow(db, IDS.target)

  assert.equal(target.site_address, '서울시 강남구 source')
  assert.equal(target.site_address_detail, '2층')
  assert.equal(Number(target.latitude), 37.5)
  assert.equal(Number(target.longitude), 127.05)
})

test('같은 날짜 작업일보가 있으면 MERGE_REPORT_CONFLICT로 병합 전체가 롤백된다', async (t) => {
  const db = await openDb(t)
  await seedProjects(db)
  await seedChildren(db)
  await db.exec(`
    INSERT INTO work_daily_reports (project_id, report_date, today_work)
      VALUES ('${IDS.target}', DATE '2026-03-02', 'target 작업일보');
  `)

  const error = await expectError(callMerge(db))
  assert.equal(error.message, 'MERGE_REPORT_CONFLICT')
  assert.equal(error.code, 'P0001')
  assert.deepEqual(JSON.parse(error.detail), {
    workDailyReports: 1, qualityMonthlyReports: 0, scheduleConflict: false,
  })

  // 원본 보고서와 모든 자식 행이 그대로 남는다.
  assert.notEqual(await projectRow(db, IDS.source), null)
  const sourceReport = await db.query(
    'SELECT today_work FROM work_daily_reports WHERE project_id = $1::uuid', [IDS.source])
  assert.equal(sourceReport.rows.length, 1)
  assert.equal(sourceReport.rows[0].today_work, '거푸집 설치')
  for (const table of CHILD_TABLES) {
    assert.ok(await countRows(db, table, IDS.source) > 0, `${table}의 source 행이 사라졌다`)
  }
  assert.equal(await countRows(db, 'project_shares', IDS.source), 4)
})

test('같은 연월 품질 월간보고서가 있으면 MERGE_REPORT_CONFLICT로 병합 전체가 롤백된다', async (t) => {
  const db = await openDb(t)
  await seedProjects(db)
  await seedChildren(db)
  await db.exec(`
    INSERT INTO quality_monthly_reports (project_id, report_year, report_month, author_name)
      VALUES ('${IDS.target}', 2026, 3, 'target 작성자');
  `)

  const error = await expectError(callMerge(db))
  assert.equal(error.message, 'MERGE_REPORT_CONFLICT')
  assert.equal(error.code, 'P0001')
  assert.deepEqual(JSON.parse(error.detail), {
    workDailyReports: 0, qualityMonthlyReports: 1, scheduleConflict: false,
  })

  assert.notEqual(await projectRow(db, IDS.source), null)
  const sourceMonthly = await db.query(
    'SELECT author_name, report_rows FROM quality_monthly_reports WHERE project_id = $1::uuid', [IDS.source])
  assert.equal(sourceMonthly.rows.length, 1)
  assert.equal(sourceMonthly.rows[0].author_name, '품질담당')
  assert.deepEqual(sourceMonthly.rows[0].report_rows, [{ item: '압축강도' }])
})

test('FK 자식 테이블 수가 27과 다르면 병합을 중단한다', async (t) => {
  const db = await openDb(t)
  await seedProjects(db)
  await seedChildren(db)
  await db.exec(`
    CREATE TABLE future_child (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID REFERENCES projects(id) ON DELETE CASCADE
    );
  `)

  const error = await expectError(callMerge(db))
  assert.match(error.message, /28/)
  assert.notEqual(await projectRow(db, IDS.source), null)
})

test('발주청·중복 공유자는 제거되고 비발주청 source 소유자가 target 공유자로 추가된다', async (t) => {
  const db = await openDb(t)
  await seedProjects(db)
  await seedChildren(db)

  const payload = await callMerge(db)
  assert.equal(payload.dropped_project_shares, 3)
  assert.equal(payload.added_source_owner_share, 1)

  const shares = await db.query(
    'SELECT shared_with, shared_by FROM project_shares WHERE project_id = $1::uuid ORDER BY shared_with', [IDS.target])
  const sharedWith = shares.rows.map((row) => row.shared_with).sort()
  assert.deepEqual(sharedWith, [IDS.sourceOwner, IDS.supervisorShare, IDS.dupShare].sort())
  for (const row of shares.rows) {
    assert.equal(row.shared_by, IDS.targetOwner)
  }
})

test('preview_project_merge_v2는 충돌 건수를 정확히 반환한다', async (t) => {
  const db = await openDb(t)
  await seedProjects(db)
  await seedChildren(db)

  const empty = await scalar(db, 'SELECT public.preview_project_merge_v2($1::uuid, $2::uuid)', [IDS.source, IDS.target])
  assert.deepEqual(empty, NO_CONFLICT)

  await db.exec(`
    INSERT INTO work_daily_reports (project_id, report_date) VALUES
      ('${IDS.source}', DATE '2026-03-03'),
      ('${IDS.target}', DATE '2026-03-02'),
      ('${IDS.target}', DATE '2026-03-03');
    INSERT INTO quality_monthly_reports (project_id, report_year, report_month) VALUES
      ('${IDS.source}', 2026, 4),
      ('${IDS.target}', 2026, 3),
      ('${IDS.target}', 2026, 4);
  `)

  const counts = await scalar(db, 'SELECT public.preview_project_merge_v2($1::uuid, $2::uuid)', [IDS.source, IDS.target])
  assert.deepEqual(counts, { workDailyReports: 2, qualityMonthlyReports: 2, scheduleConflict: false })

  // 미리보기는 어떤 행도 바꾸지 않는다.
  assert.equal(await countRows(db, 'work_daily_reports', IDS.source), 2)
  assert.equal(await countRows(db, 'quality_monthly_reports', IDS.source), 2)
})

test('preview_project_merge_v2는 NULL·동일·없는 프로젝트 입력을 거부한다', async (t) => {
  const db = await openDb(t)
  await seedProjects(db)

  const nullError = await expectError(
    db.query('SELECT public.preview_project_merge_v2(NULL::uuid, $1::uuid)', [IDS.target]))
  assert.match(nullError.message, /프로젝트/)

  const sameError = await expectError(
    db.query('SELECT public.preview_project_merge_v2($1::uuid, $1::uuid)', [IDS.source]))
  assert.match(sameError.message, /같습니다/)

  const missingSource = await expectError(
    db.query('SELECT public.preview_project_merge_v2($1::uuid, $2::uuid)', [
      '99999999-9999-9999-9999-999999999999', IDS.target]))
  assert.match(missingSource.message, /source/)

  const missingTarget = await expectError(
    db.query('SELECT public.preview_project_merge_v2($1::uuid, $2::uuid)', [
      IDS.source, '99999999-9999-9999-9999-999999999999']))
  assert.match(missingTarget.message, /target/)
})

test('미리보기가 세 필드 형식을 벗어나면 병합을 중단한다', async (t) => {
  const db = await openDb(t)
  await seedProjects(db)
  await seedChildren(db)

  // 잘못된 함수 교체로 미리보기 응답에서 필수 키가 누락된 상황을 흉내 낸다.
  await db.exec(`
    CREATE OR REPLACE FUNCTION public.preview_project_merge_v2(p_source UUID, p_target UUID)
    RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $fn$ SELECT jsonb_build_object('workDailyReports', 0, 'qualityMonthlyReports', 0) $fn$;
  `)

  const error = await expectError(callMerge(db))
  assert.match(error.message, /scheduleConflict/)
  assert.notEqual(await projectRow(db, IDS.source), null)
  for (const table of CHILD_TABLES) {
    assert.ok(await countRows(db, table, IDS.source) > 0, `${table}의 source 행이 사라졌다`)
  }
})

test('merge_projects_safe_v2 래퍼도 같은 보존 규칙으로 동작한다', async (t) => {
  const db = await openDb(t)
  await seedProjects(db)
  await seedChildren(db)

  const payload = await callMerge(db, 'merge_projects_safe_v2')
  assert.equal(await projectRow(db, IDS.source), null)
  assert.equal(payload.added_source_owner_share, 1)
  for (const table of CHILD_TABLES) {
    assert.equal(await countRows(db, table, IDS.source), 0, `${table}에 source 잔여 행이 있다`)
  }
})

test('merge_projects_safe_v2도 보고서 충돌 시 전체를 롤백한다', async (t) => {
  const db = await openDb(t)
  await seedProjects(db)
  await seedChildren(db)
  await db.exec(`
    INSERT INTO work_daily_reports (project_id, report_date, today_work)
      VALUES ('${IDS.target}', DATE '2026-03-02', 'target 작업일보');
  `)

  const error = await expectError(callMerge(db, 'merge_projects_safe_v2'))
  assert.equal(error.message, 'MERGE_REPORT_CONFLICT')
  assert.deepEqual(JSON.parse(error.detail), {
    workDailyReports: 1, qualityMonthlyReports: 0, scheduleConflict: false,
  })
  assert.notEqual(await projectRow(db, IDS.source), null)
})

test('병합 함수 실행 권한은 service_role에만 있다', async (t) => {
  const db = await openDb(t)

  const grants = await db.query(`
    SELECT p.proname, COALESCE(array_to_string(p.proacl, ','), '') AS acl
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('merge_projects', 'merge_projects_safe_v2', 'preview_project_merge_v2',
                         'merge_projects_is_blank_schedule', 'merge_projects_fill_text')
     ORDER BY p.proname
  `)
  assert.equal(grants.rows.length, 5)
  for (const row of grants.rows) {
    assert.match(row.acl, /service_role=X/, `${row.proname}에 service_role 실행 권한이 없다`)
    assert.doesNotMatch(row.acl, /(^|,)=X/, `${row.proname}이 PUBLIC에 공개되어 있다`)
    assert.doesNotMatch(row.acl, /authenticated=X/, `${row.proname}이 authenticated에 공개되어 있다`)
    assert.doesNotMatch(row.acl, /anon=X/, `${row.proname}이 anon에 공개되어 있다`)
  }

  const searchPaths = await db.query(`
    SELECT p.proname, array_to_string(p.proconfig, ',') AS config
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('merge_projects', 'merge_projects_safe_v2', 'preview_project_merge_v2',
                         'merge_projects_is_blank_schedule', 'merge_projects_fill_text')
  `)
  for (const row of searchPaths.rows) {
    assert.match(row.config ?? '', /search_path=public/, `${row.proname}에 고정 search_path가 없다`)
  }
})
