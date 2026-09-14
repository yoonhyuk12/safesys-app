// 패트롤 점검의 조치완료 판정·사진 등록일 복원·지연 경계·분기 범위 순수 로직을 검증한다.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

async function transpile(relativePath, dependencies = {}) {
  const source = await readFile(new URL(relativePath, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  })
  const module = { exports: {} }
  const require = (name) => {
    assert.ok(name in dependencies, `예상하지 못한 의존성 ${name}`)
    return dependencies[name]
  }
  new Function('module', 'exports', 'require', outputText)(module, module.exports, require)
  return module.exports
}

const {
  PATROL_ACTION_OVERDUE_DAYS,
  PATROL_DISASTER_TYPES,
  PATROL_MAX_AI_ITEMS,
  buildPatrolIssueContent,
  getPatrolActionState,
  normalizePatrolDisasterType,
  parseStorageUploadDate,
  patrolQuarterRange,
} = await transpile('../src/lib/patrol-inspection-utils.ts')

const STORAGE_BASE = 'https://example.supabase.co/storage/v1/object/public/inspection-photos/headquarters-actions'
// 1785213759920 = 2026-07-28T04:42:39.920Z → 서울 시각 2026-07-28
const PHOTO_2026_07_28 = `${STORAGE_BASE}/1785213759920-21ik5icqszi.jpg`

function photoUrlForSeoulDate(dateText) {
  // 해당 서울 날짜 정오(03:00Z)의 epoch ms를 파일명에 넣는다.
  const epoch = Date.parse(`${dateText}T03:00:00.000Z`)
  return `${STORAGE_BASE}/${epoch}-abcdefghijk.jpg`
}

function baseInspection(overrides = {}) {
  return {
    id: 'insp-1',
    project_id: 'proj-1',
    inspection_date: '2026-07-01',
    inspector_name: '3급 홍길동',
    issue_content1: '안전난간 미설치',
    issue_content2: '',
    issue1_status: 'pending',
    issue2_status: 'pending',
    patrol_car_used: true,
    finding_type: 'corrective_action',
    action_photo_issue1: null,
    action_photo_issue2: null,
    site_photo_issue2: null,
    created_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  }
}

test('분기 문자열을 시작·종료일로 바꾼다', () => {
  assert.deepEqual(patrolQuarterRange('2026Q1'), { startDate: '2026-01-01', endDate: '2026-03-31' })
  assert.deepEqual(patrolQuarterRange('2026Q2'), { startDate: '2026-04-01', endDate: '2026-06-30' })
  assert.deepEqual(patrolQuarterRange('2026Q3'), { startDate: '2026-07-01', endDate: '2026-09-30' })
  assert.deepEqual(patrolQuarterRange('2026Q4'), { startDate: '2026-10-01', endDate: '2026-12-31' })
})

test('잘못된 분기 문자열은 null 을 돌려준다', () => {
  assert.equal(patrolQuarterRange(''), null)
  assert.equal(patrolQuarterRange('2026Q5'), null)
  assert.equal(patrolQuarterRange('Q1'), null)
  assert.equal(patrolQuarterRange('20261'), null)
  assert.equal(patrolQuarterRange(undefined), null)
})

test('스토리지 URL 파일명의 epoch 로 서울 등록일을 복원한다', () => {
  assert.equal(parseStorageUploadDate(PHOTO_2026_07_28), '2026-07-28')
  assert.equal(parseStorageUploadDate(photoUrlForSeoulDate('2026-03-09')), '2026-03-09')
})

test('URL 이 아니거나 epoch 가 없으면 등록일을 만들지 않는다', () => {
  assert.equal(parseStorageUploadDate('해당 사항 없음'), null)
  assert.equal(parseStorageUploadDate(null), null)
  assert.equal(parseStorageUploadDate(''), null)
  assert.equal(parseStorageUploadDate(`${STORAGE_BASE}/photo.jpg`), null)
  assert.equal(parseStorageUploadDate(`${STORAGE_BASE}/12345-abc.jpg`), null)
})

test('조치사진 경로가 아닌 URL 은 등록일 근거로 쓰지 않는다', () => {
  const other = 'https://example.supabase.co/storage/v1/object/public/inspection-photos/headquarters-issues'
  assert.equal(parseStorageUploadDate(`${other}/1785213759920-zzz.jpg`), null)
  assert.equal(parseStorageUploadDate('https://evil.example.com/1785213759920-zzz.jpg'), null)
  assert.equal(parseStorageUploadDate('ftp://example.com/1785213759920-zzz.jpg'), null)
  assert.equal(parseStorageUploadDate('http_not_a_url_1785213759920-zzz.jpg'), null)
})

test('지적1만 있으면 조치사진 1장으로 완료가 된다', () => {
  const state = getPatrolActionState(
    baseInspection({ action_photo_issue1: photoUrlForSeoulDate('2026-07-05') }),
    '2026-07-20'
  )
  assert.equal(state.completed, true)
  assert.equal(state.completedDate, '2026-07-05')
  assert.equal(state.notApplicable, false)
  assert.equal(state.overdue, false)
})

test('지적2가 있으면 조치사진 2장이 모두 있어야 완료다', () => {
  const partial = getPatrolActionState(
    baseInspection({
      issue_content2: '개구부 덮개 미고정',
      action_photo_issue1: photoUrlForSeoulDate('2026-07-05'),
    }),
    '2026-07-06'
  )
  assert.equal(partial.completed, false)
  assert.equal(partial.completedDate, null)

  const full = getPatrolActionState(
    baseInspection({
      issue_content2: '개구부 덮개 미고정',
      action_photo_issue1: photoUrlForSeoulDate('2026-07-05'),
      action_photo_issue2: photoUrlForSeoulDate('2026-07-06'),
    }),
    '2026-07-20'
  )
  assert.equal(full.completed, true)
  // 두 사진 중 늦은 날이 완료일이다
  assert.equal(full.completedDate, '2026-07-06')
})

test('사진 없이 지적2 사진만 있는 현장사진도 지적2로 인정한다', () => {
  const state = getPatrolActionState(
    baseInspection({
      issue_content2: '',
      site_photo_issue2: `${STORAGE_BASE}/1785213759920-zzz.jpg`,
      action_photo_issue1: photoUrlForSeoulDate('2026-07-05'),
    }),
    '2026-07-06'
  )
  assert.equal(state.completed, false)
})

test('등록일을 복원할 수 없으면 완료여도 완료일은 미기록이다', () => {
  const state = getPatrolActionState(
    baseInspection({ action_photo_issue1: `${STORAGE_BASE}/photo.jpg` }),
    '2026-09-01'
  )
  assert.equal(state.completed, true)
  assert.equal(state.completedDate, null)
  // 완료일을 모르면 지연을 단정하지 않는다
  assert.equal(state.overdue, false)
})

test('지적1 면제 + 지적2 실제사진이면 지적2 사진일이 완료일이다', () => {
  const state = getPatrolActionState(
    baseInspection({
      issue_content2: '개구부 덮개 미고정',
      action_photo_issue1: '해당 사항 없음',
      action_photo_issue2: photoUrlForSeoulDate('2026-07-06'),
    }),
    '2026-07-20'
  )
  assert.equal(state.completed, true)
  assert.equal(state.notApplicable, false)
  assert.equal(state.completedDate, '2026-07-06')
  assert.equal(state.overdue, false)
})

test('필요한 지적이 모두 면제면 해당없음으로 본다', () => {
  const state = getPatrolActionState(
    baseInspection({
      issue_content2: '개구부 덮개 미고정',
      action_photo_issue1: '해당 사항 없음',
      action_photo_issue2: '해당 사항 없음',
    }),
    '2026-12-31'
  )
  assert.equal(state.completed, true)
  assert.equal(state.notApplicable, true)
  assert.equal(state.completedDate, null)
  assert.equal(state.overdue, false)
})

test('면제가 한쪽뿐이고 나머지가 미조치면 해당없음이 아니다', () => {
  const state = getPatrolActionState(
    baseInspection({
      issue_content2: '개구부 덮개 미고정',
      action_photo_issue1: '해당 사항 없음',
    }),
    '2026-07-20'
  )
  assert.equal(state.completed, false)
  assert.equal(state.notApplicable, false)
  assert.equal(state.overdue, true)
})

test('조치사진 칸의 임의 텍스트는 조치로 인정하지 않는다', () => {
  const state = getPatrolActionState(
    baseInspection({ action_photo_issue1: '조치했음' }),
    '2026-07-20'
  )
  assert.equal(state.completed, false)
  assert.equal(state.completedDate, null)
  assert.equal(state.overdue, true)
})

test('해당없음 지적유형은 완료일도 지연도 만들지 않는다', () => {
  const state = getPatrolActionState(
    baseInspection({
      finding_type: 'not_applicable',
      action_photo_issue1: '해당 사항 없음',
    }),
    '2026-12-31'
  )
  assert.equal(state.notApplicable, true)
  assert.equal(state.completed, true)
  assert.equal(state.completedDate, null)
  assert.equal(state.overdue, false)
})

test('지연 경계는 7일 초과부터다', () => {
  const sevenDays = getPatrolActionState(
    baseInspection({ action_photo_issue1: photoUrlForSeoulDate('2026-07-08') }),
    '2026-07-30'
  )
  assert.equal(sevenDays.completedDate, '2026-07-08')
  assert.equal(sevenDays.overdue, false)

  const eightDays = getPatrolActionState(
    baseInspection({ action_photo_issue1: photoUrlForSeoulDate('2026-07-09') }),
    '2026-07-30'
  )
  assert.equal(eightDays.completedDate, '2026-07-09')
  assert.equal(eightDays.overdue, true)
})

test('미완료는 오늘을 기준으로 지연을 판정한다', () => {
  const notYet = getPatrolActionState(baseInspection(), '2026-07-08')
  assert.equal(notYet.completed, false)
  assert.equal(notYet.overdue, false)

  const late = getPatrolActionState(baseInspection(), '2026-07-09')
  assert.equal(late.completed, false)
  assert.equal(late.overdue, true)
})

test('지적내용 2건은 한 셀에 번호와 줄바꿈으로 합친다', () => {
  assert.equal(
    buildPatrolIssueContent(baseInspection({ issue_content2: '개구부 덮개 미고정' })),
    '1. 안전난간 미설치\n2. 개구부 덮개 미고정'
  )
  assert.equal(buildPatrolIssueContent(baseInspection()), '안전난간 미설치')
  assert.equal(buildPatrolIssueContent(baseInspection({ issue_content1: '  ', issue_content2: '  ' })), '')
})

test('재해유형은 허용 목록만 통과시키고 나머지는 기타로 만든다', () => {
  assert.ok(PATROL_DISASTER_TYPES.includes('추락'))
  assert.ok(PATROL_DISASTER_TYPES.includes('기타'))
  assert.equal(normalizePatrolDisasterType('추락'), '추락')
  assert.equal(normalizePatrolDisasterType(' 끼임 '), '끼임')
  assert.equal(normalizePatrolDisasterType('우주선 충돌'), '기타')
  assert.equal(normalizePatrolDisasterType(null), '기타')
  assert.equal(normalizePatrolDisasterType(42), '기타')
})

test('상수는 계약대로 고정한다', () => {
  assert.equal(PATROL_ACTION_OVERDUE_DAYS, 7)
  assert.equal(PATROL_MAX_AI_ITEMS, 20)
})
