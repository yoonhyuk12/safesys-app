// 사고보고 자동 채움 정규화기가 문서에 없는 값을 지어내지 않고 형식 위반을 버리는지 검증한다
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import test from 'node:test'
import ts from 'typescript'

const nodeRequire = createRequire(import.meta.url)

/** `@/` 별칭 모듈을 실제 소스로 따라가며 transpile한다. 그 밖의 패키지는 node가 해결한다. */
function createLoader(overrides = {}) {
  const cache = new Map()

  const load = async (name) => {
    if (name in overrides) return overrides[name]
    if (!name.startsWith('@/')) return nodeRequire(name)
    if (cache.has(name)) return cache.get(name)

    const relative = name.replace('@/', '../src/')
    let source = null
    for (const suffix of ['.ts', '.tsx']) {
      try {
        source = await readFile(new URL(`${relative}${suffix}`, import.meta.url), 'utf8')
        break
      } catch {
        // 다음 확장자를 시도한다.
      }
    }
    if (source === null) throw new Error(`별칭 모듈을 찾지 못했다: ${name}`)

    const { outputText } = ts.transpileModule(source, {
      // esModuleInterop은 tsconfig와 같게 둔다 — 기본 import가 실제 빌드처럼 해석된다.
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    })

    const dependencies = new Map()
    for (const match of outputText.matchAll(/require\(["']([^"']+)["']\)/g)) {
      const dependency = match[1]
      if (!dependencies.has(dependency)) dependencies.set(dependency, await load(dependency))
    }

    const module = { exports: {} }
    cache.set(name, module.exports)
    const requireShim = (dependency) => {
      if (!dependencies.has(dependency)) throw new Error(`예상하지 못한 의존성 ${dependency}`)
      return dependencies.get(dependency)
    }
    new Function('module', 'exports', 'require', outputText)(module, module.exports, requireShim)
    cache.set(name, module.exports)
    return module.exports
  }

  return load
}

const load = createLoader()

test('요양 예상 일수 추출은 휴업일수와 독립이며 비정수·미입력을 버린다', async () => {
  const { normalizeAccidentExtraction, buildAccidentExtractionPrompt } = await load('@/lib/accident-report-extraction')
  for (const value of ['0', '14', '9007199254740991']) {
    const { fields } = normalizeAccidentExtraction({ lost_workdays: 3, report_details: { expectedTreatmentDays: value } })
    assert.equal(fields.report_details.expectedTreatmentDays, value)
    assert.equal(fields.lost_workdays, 3)
  }
  for (const value of ['', null, undefined, '-1', '1.5', '삼일', '1e2', '9007199254740992']) {
    const { fields } = normalizeAccidentExtraction({ lost_workdays: 3, report_details: { expectedTreatmentDays: value } })
    assert.equal(fields.report_details?.expectedTreatmentDays, undefined)
    assert.equal(fields.lost_workdays, 3)
  }
  assert.equal(normalizeAccidentExtraction({ lost_workdays: 14 }).fields.report_details?.expectedTreatmentDays, undefined)
  assert.equal(normalizeAccidentExtraction({ report_details: { expectedTreatmentDays: '14' } }).fields.lost_workdays, undefined)
  assert.match(buildAccidentExtractionPrompt(), /요양기간.*명시/)
  assert.match(buildAccidentExtractionPrompt(), /휴업일수.*복사.*추정/)
})
const extraction = await load('@/lib/accident-report-extraction')
const {
  ACCIDENT_EXTRACTION_RESPONSE_SCHEMA,
  ACCIDENT_EXTRACTION_SYSTEM_INSTRUCTION,
  ACCIDENT_IMPORT_HWPX_MAX_BYTES,
  ACCIDENT_IMPORT_HWPX_MAX_ENTRIES,
  ACCIDENT_IMPORT_HWPX_MAX_SECTION_BYTES,
  ACCIDENT_IMPORT_HWPX_MAX_TOTAL_SECTION_BYTES,
  ACCIDENT_IMPORT_PDF_MAX_BYTES,
  ACCIDENT_IMPORT_TEXT_MAX_CHARS,
  ACCIDENT_PREFILL_DRAFT_NOTICE,
  buildAccidentExtractionPrompt,
  extractGeminiJsonText,
  normalizeAccidentExtraction,
} = extraction

test('확인된 사실로 재구성한 개요는 중복 정리와 재정규화에서도 보존한다', () => {
  const description = '자재 운반 중 통로 장애물에 걸려 넘어졌다. 손목 타박상을 입었다.'
  const raw = {
    description: `${description}\n작업내용: 자재 운반\n사고원인: 통로 장애물에 걸려 넘어짐\n피해현황: 손목 타박상`,
    work_description: '자재 운반',
    cause: '통로 장애물에 걸려 넘어짐',
    report_details: { summary: '자재 운반 중 넘어짐 사고 발생', damageDetails: '손목 타박상' },
  }
  const snapshot = structuredClone(raw)
  const first = normalizeAccidentExtraction(raw)
  assert.equal(first.fields.description, description)
  assert.equal(first.fields.cause, raw.cause)
  assert.deepEqual(normalizeAccidentExtraction(first.fields), first)
  assert.deepEqual(raw, snapshot)
  assert.equal(normalizeAccidentExtraction({ description: null }).fields.description, undefined)
})

test('개요 자동 작성 규칙은 사실 재구성을 허용하고 별도 경위 필수 규칙을 제거한다', () => {
  const prompt = buildAccidentExtractionPrompt()
  const system = ACCIDENT_EXTRACTION_SYSTEM_INSTRUCTION
  const schema = ACCIDENT_EXTRACTION_RESPONSE_SCHEMA.properties.description
  for (const instruction of [system, prompt, schema.description]) {
    assert.match(instruction, /1~3문장/)
    assert.match(instruction, /확인된 사실/)
    assert.doesNotMatch(instruction, /요약 창작|별도 경위가 없으면 null|별도로 서술된 사고 경위만/)
  }
  assert.match(prompt, /보고요지.*작업내용.*사고원인.*피해사실/)
  assert.match(prompt, /무슨 작업 중 무엇이 발생해 어떤 피해/)
  assert.match(prompt, /사고 기전.*발생 요인/)
  assert.match(prompt, /과실·시간·장소·피해·원인.*만들지 않는다/)
  assert.match(prompt, /사고 사실 자체가 없으면 null/)
  assert.match(prompt, /원인 단순 복사.*참조 문구.*중복 라벨 묶음/)
  assert.equal(schema.nullable, true)
})

test('명시 라벨의 전용 필드 전체 중복만 제거하고 실제 사고 경위는 보존한다', () => {
  const raw = {
    description: '자재 이동 중 넘어졌다.\n○ 작업내용 : 자재 운반\n  둘째 작업\n○ 사고원인：통로 장애물\n피해현황: 손목 타박\n귀책사유: 조사 중',
    work_description: '자재 운반\n  둘째 작업',
    cause: '통로 장애물',
    report_details: { damageDetails: '손목 타박', responsibility: '조사 중' },
  }
  const snapshot = structuredClone(raw)
  const { fields } = normalizeAccidentExtraction(raw)
  assert.equal(fields.description, '자재 이동 중 넘어졌다.')
  assert.equal(fields.work_description, raw.work_description)
  assert.equal(fields.cause, raw.cause)
  assert.deepEqual(fields.report_details, raw.report_details)
  assert.deepEqual(raw, snapshot, '입력 원본을 변형하면 안 된다')
  assert.deepEqual(normalizeAccidentExtraction(fields).fields, fields, '재정규화도 같은 결과여야 한다')
})

test('부분 일치·다른 내용·라벨 없는 서술·누락 필드·미확인 라벨은 보존한다', () => {
  for (const description of [
    '통로 장애물',
    '작업 중 사고원인: 통로 장애물을 확인했다.',
    '사고원인: 통로 장애물과 조도 부족',
    '사고원인: 통로  장애물',
    '사고원인: 통로 장애물\n추가 확인이 필요하다.',
    '피해현황: 손목 타박',
    '원인 추정: 통로 장애물',
    '사고원인: 통로 장애물\n참고사항: 별도 조사 중',
  ]) {
    assert.equal(normalizeAccidentExtraction({ description, cause: '통로 장애물' }).fields.description, description)
  }
})

test('중복과 불일치 블록이 섞여도 불일치·경위 블록은 원문 그대로 남긴다', () => {
  const { fields } = normalizeAccidentExtraction({
    description: '작업내용: 자재 운반\n사고내용: 발판에서 넘어졌다.\n사고원인: 통로 장애물\n피해현황: 손목 타박과 추가 검사',
    work_description: '자재 운반', cause: '통로 장애물', report_details: { damageDetails: '손목 타박' },
  })
  assert.equal(fields.description, '사고내용: 발판에서 넘어졌다.\n피해현황: 손목 타박과 추가 검사')
})

test('전부 전용 필드 중복이면 사고 경위를 새로 만들지 않고 누락 안내를 남긴다', () => {
  const { fields, warnings } = normalizeAccidentExtraction({ description: '작업내용: 자재 운반', work_description: '자재 운반' })
  assert.equal('description' in fields, false)
  assert.equal(fields.work_description, '자재 운반')
  assert.ok(warnings.includes('문서에서 사고 내용를 찾지 못했습니다.'))
})

test('추출 지시문은 상위 사고내용 전체 복사 대신 명시 하위 항목 분리를 요구한다', () => {
  const prompt = buildAccidentExtractionPrompt()
  assert.match(prompt, /상위.*사고내용.*전체.*description.*복사하지/)
  assert.match(prompt, /작업내용.*work_description.*사고원인.*cause/)
  assert.match(prompt, /피해현황.*damageDetails.*귀책사유.*responsibility/)
})

test('피해자 선두 전체 줄과 명시 미신고 사유만 정리하고 고유 상세는 보존한다', async () => {
  const { cleanAccidentReportContent } = await load('@/lib/accident-report-content')
  const details = {
    victimDetails: '가상인 / 작업자\n가상 현장 소속',
    damageDetails: '가상인 / 작업자\n가상 현장 소속\n손목 타박, 검사 예정',
    noNotificationReason: '현장 확인 중',
    actionDetails: '작업 중지\n미신고 사유 : 현장 확인 중',
  }
  const snapshot = structuredClone(details)
  const cleaned = cleanAccidentReportContent({}, details)
  assert.equal(cleaned.damageDetails, '손목 타박, 검사 예정')
  assert.equal(cleaned.actionDetails, '작업 중지')
  assert.deepEqual(details, snapshot)
  const { fields } = normalizeAccidentExtraction({ report_details: details })
  assert.equal(fields.report_details.damageDetails, cleaned.damageDetails)
  assert.equal(fields.report_details.actionDetails, cleaned.actionDetails)
  for (const damageDetails of ['가상인 / 작업자', `${details.victimDetails} 추가 정보`, `손목 타박\n${details.victimDetails}`]) {
    assert.equal(cleanAccidentReportContent({}, { ...details, damageDetails }).damageDetails, damageDetails)
  }
  for (const actionDetails of ['현장 확인 중', '미신고 사유: 현장 확인 중\n추가 확인', '미신고 사유: 현장  확인 중']) {
    assert.equal(cleanAccidentReportContent({}, { ...details, actionDetails }).actionDetails, actionDetails)
  }
})

test('출력 정리는 개행 형식만 비교 정규화하고 불일치 원문과 초장문을 보존한다', async () => {
  const { cleanAccidentReportContent } = await load('@/lib/accident-report-content')
  assert.equal(cleanAccidentReportContent({ description: '사고원인: 원인\r\n둘째 줄', cause: '원인\n둘째 줄' }, {}).description, '')
  const description = `경위 ${'가'.repeat(20000)}\r\n사고원인: 다른 원인`
  assert.equal(cleanAccidentReportContent({ description, cause: '원인' }, {}).description, description)
})

test('피해자 선두 정리와 피해현황 중복 정리는 두 번 정규화해도 결과가 같다', () => {
  for (const damageBlock of ['손목 타박', '가상인 / 작업자\n손목 타박']) {
    const raw = {
      description: `사고 경위\n피해현황: ${damageBlock}`,
      report_details: { victimDetails: '가상인 / 작업자', damageDetails: '가상인 / 작업자\n손목 타박' },
    }
    const first = normalizeAccidentExtraction(raw)
    assert.equal(first.fields.description, '사고 경위')
    assert.equal(first.fields.report_details.damageDetails, '손목 타박')
    assert.deepEqual(normalizeAccidentExtraction(first.fields), first)
  }
})

test('피해현황의 글머리와 목록 구분자 차이는 전체 항목과 순서가 같을 때만 정리한다', () => {
  const raw = {
    description: '사고 경위\n피해현황: 손목 타박\n추가 검사 예정',
    report_details: { victimDetails: '가상 작업자', damageDetails: '가상 작업자\n- 손목 타박, 추가 검사 예정' },
  }
  const first = normalizeAccidentExtraction(raw)
  assert.equal(first.fields.description, '사고 경위')
  assert.equal(first.fields.report_details.damageDetails, '- 손목 타박, 추가 검사 예정')
  assert.deepEqual(normalizeAccidentExtraction(first.fields), first)
  for (const damageDetails of ['- 손목 타박, 추가  검사 예정', '- 추가 검사 예정, 손목 타박', '- 손목 타박, 추가 검사 예정, 진료 중', '- 손목 타박']) {
    assert.equal(normalizeAccidentExtraction({ ...raw, report_details: { damageDetails } }).fields.description, raw.description)
  }
  const description = '사고원인: 손목 타박\n추가 검사 예정'
  assert.equal(normalizeAccidentExtraction({ description, cause: '- 손목 타박, 추가 검사 예정' }).fields.description, description)
})

test('업로드 상한 상수가 계획한 값과 같다', () => {
  assert.equal(ACCIDENT_IMPORT_PDF_MAX_BYTES, 4 * 1024 * 1024)
  assert.equal(ACCIDENT_IMPORT_TEXT_MAX_CHARS, 100_000)
  assert.equal(ACCIDENT_IMPORT_HWPX_MAX_BYTES, 15 * 1024 * 1024)
  assert.equal(ACCIDENT_IMPORT_HWPX_MAX_ENTRIES, 500)
  assert.equal(ACCIDENT_IMPORT_HWPX_MAX_SECTION_BYTES, 8 * 1024 * 1024)
  assert.equal(ACCIDENT_IMPORT_HWPX_MAX_TOTAL_SECTION_BYTES, 24 * 1024 * 1024)
})

test('정상 입력은 사고 필드와 보고서 항목으로 매핑된다', () => {
  const { fields, warnings } = normalizeAccidentExtraction({
    accident_at: '2026.06.10',
    severity: 'lost_time',
    accident_type: '끼임',
    location: '예시지구 1공구 배수관로',
    work_description: '되메우기 다짐 작업',
    description: '다짐기 조작 중 오른손이 끼였다.',
    cause: '회전부 방호덮개 미설치',
    prevention_action: '방호덮개 설치 후 작업 재개',
    injured_count: 1,
    fatal_count: 0,
    lost_workdays: 14,
    workers_comp_claim: 'applied',
    report_details: {
      reportTitle: '사고발생보고',
      reportDate: '2026년 6월 11일',
      reporterName: '홍길동',
      reporterPosition: '안전관리자',
      reporterPhone: '010-0000-0000',
      summary: '되메우기 작업 중 끼임 사고가 발생했다.',
      accidentTime: '9시 5분',
      victimDetails: '김철수, 45세, 배관공',
      damageDetails: '오른손 열상, 예시병원 봉합',
      propertyDamage: '없음',
      responsibility: '협력사 관리 소홀',
      noNotificationReason: '경상으로 신고 대상 아님',
      compensationDetails: '산재 신청 진행',
      actionDetails: '작업 중지 및 전 근로자 교육',
      otherNotes: '특이사항 없음',
      relatedContacts: '현장사무실 031-000-0000',
      notifications: ['emergency119', 'family'],
      victimActions: ['hospital'],
    },
  })

  assert.equal(fields.accident_at, '2026-06-10')
  assert.equal(fields.severity, 'lost_time')
  assert.equal(fields.accident_type, '끼임')
  assert.equal(fields.location, '예시지구 1공구 배수관로')
  assert.equal(fields.work_description, '되메우기 다짐 작업')
  assert.equal(fields.cause, '회전부 방호덮개 미설치')
  assert.equal(fields.injured_count, 1)
  assert.equal(fields.fatal_count, 0)
  assert.equal(fields.lost_workdays, 14)
  assert.equal(fields.workers_comp_claim, 'applied')
  assert.equal(fields.report_details.reportDate, '2026-06-11')
  assert.equal(fields.report_details.accidentTime, '09:05')
  assert.equal(fields.report_details.reporterName, '홍길동')
  assert.deepEqual(fields.report_details.notifications, ['emergency119', 'family'])
  assert.deepEqual(fields.report_details.victimActions, ['hospital'])

  // 핵심 필드가 모두 찼으므로 안내는 초안 고지 한 줄뿐이다.
  assert.deepEqual(warnings, [ACCIDENT_PREFILL_DRAFT_NOTICE])
})

test('알 수 없는 키와 서버가 정하는 키는 무시한다', () => {
  const { fields } = normalizeAccidentExtraction({
    project_id: '11111111-2222-4333-8444-555555555555',
    external_project_name: '예시지구',
    created_by: '11111111-2222-4333-8444-666666666666',
    photos: [{ dataUrl: 'data:image/jpeg;base64,/9j/AAAA', caption: '현장' }],
    model: 'gemini-flash-lite-latest',
    무언가: '버려야 한다',
    description: '사고 내용',
    report_details: {
      photos: [{ dataUrl: 'data:image/jpeg;base64,/9j/AAAA', caption: '현장' }],
      summary: '보고 요지',
    },
  })

  assert.equal('project_id' in fields, false)
  assert.equal('external_project_name' in fields, false)
  assert.equal('created_by' in fields, false)
  assert.equal('photos' in fields, false)
  assert.equal('model' in fields, false)
  assert.equal('무언가' in fields, false)
  assert.equal('photos' in fields.report_details, false)
  assert.equal(fields.report_details.summary, '보고 요지')
})

test('빈 문자열·null·비문자열은 키를 만들지 않는다', () => {
  const { fields } = normalizeAccidentExtraction({
    description: '',
    cause: null,
    location: '   ',
    work_description: 42,
    prevention_action: undefined,
    report_details: { summary: '', victimDetails: null, otherNotes: '  ' },
  })

  assert.deepEqual(fields, {})
})

test('잘못된 날짜·시각은 버리고 안내만 남긴다', () => {
  const { fields, warnings } = normalizeAccidentExtraction({
    accident_at: '2026-02-30',
    report_details: { reportDate: '작성 예정', accidentTime: '25:70' },
  })

  assert.equal('accident_at' in fields, false)
  assert.equal(fields.report_details, undefined)
  assert.ok(warnings.some((warning) => warning.includes('사고 일시 형식')))
  assert.ok(warnings.some((warning) => warning.includes('보고일 형식')))
  assert.ok(warnings.some((warning) => warning.includes('사고 시각 형식')))
})

test('날짜·시각 표기 변형을 표준 형식으로 맞춘다', () => {
  assert.equal(normalizeAccidentExtraction({ accident_at: '2026/06/10' }).fields.accident_at, '2026-06-10')
  assert.equal(normalizeAccidentExtraction({ accident_at: '2026-6-1' }).fields.accident_at, '2026-06-01')
  assert.equal(
    normalizeAccidentExtraction({ report_details: { accidentTime: '9:5' } }).fields.report_details.accidentTime,
    '09:05'
  )
  assert.equal(
    normalizeAccidentExtraction({ report_details: { accidentTime: '14:30' } }).fields.report_details.accidentTime,
    '14:30'
  )
  assert.equal(
    normalizeAccidentExtraction({ report_details: { reportDate: '2026. 09. 16.' } }).fields.report_details.reportDate,
    '2026-09-16'
  )
  assert.equal(normalizeAccidentExtraction({ accident_at: '2026. 9. 1' }).fields.accident_at, '2026-09-01')
})

test('severity는 정해진 4개 외에는 버린다', () => {
  const { fields, warnings } = normalizeAccidentExtraction({ severity: '중대재해' })
  assert.equal('severity' in fields, false)
  assert.ok(warnings.some((warning) => warning.includes('사고 정도를 알아볼 수 없어')))

  assert.equal(normalizeAccidentExtraction({ severity: 'fatal' }).fields.severity, 'fatal')
})

test('accident_type이 선택 목록과 다르면 값을 버리고 원문을 안내한다', () => {
  const { fields, warnings } = normalizeAccidentExtraction({ accident_type: '전도·전락' })

  assert.equal('accident_type' in fields, false)
  const notice = warnings.find((warning) => warning.includes('재해 유형'))
  assert.ok(notice)
  assert.ok(notice.includes('전도·전락'))
  // 목록에 없는 값을 '기타'로 임의 확정하지 않는다.
  assert.equal(fields.accident_type, undefined)
})

test('인원수는 0 이상 정수만 받고 정수 문자열도 허용한다', () => {
  assert.equal(normalizeAccidentExtraction({ injured_count: '2' }).fields.injured_count, 2)
  assert.equal(normalizeAccidentExtraction({ injured_count: 0 }).fields.injured_count, 0)

  for (const bad of [-1, 1.5, '한 명', '1.5', 999999, true]) {
    const { fields, warnings } = normalizeAccidentExtraction({ injured_count: bad })
    assert.equal('injured_count' in fields, false, `버려야 한다: ${String(bad)}`)
    assert.ok(warnings.some((warning) => warning.includes('인원수 값을 알아볼 수 없어')))
  }

  const { warnings: dayWarnings } = normalizeAccidentExtraction({ lost_workdays: -3 })
  assert.ok(dayWarnings.some((warning) => warning.includes('휴업일수 값을 알아볼 수 없어')))
})

test('사망 1명·부상 0명은 별도 집계이므로 값을 그대로 두고 경고하지 않는다', () => {
  const { fields, warnings } = normalizeAccidentExtraction({ injured_count: 0, fatal_count: 1 })

  assert.equal(fields.injured_count, 0)
  assert.equal(fields.fatal_count, 1)
  assert.equal(warnings.some((warning) => warning.includes('사망자 수')), false)
})

test('workers_comp_claim은 두 값 외에는 키를 만들지 않는다', () => {
  assert.equal(normalizeAccidentExtraction({ workers_comp_claim: 'not_applied' }).fields.workers_comp_claim, 'not_applied')

  for (const bad of ['', '미확인', 'unknown', null, 1]) {
    const { fields } = normalizeAccidentExtraction({ workers_comp_claim: bad })
    assert.equal('workers_comp_claim' in fields, false, `버려야 한다: ${String(bad)}`)
  }
})

test('산재 처리 문구가 준비중·예정이면 workers_comp_claim을 비우고 안내한다', () => {
  // 실측에서 "산재 신청 준비중"을 AI가 not_applied로 굳혔다 — 확정되지 않은 표현은 사용자가 고른다.
  for (const phrase of [
    '산재 신청 준비중',
    '산재 신청 예정',
    '산재보험처리: 신청 준비 중 (신청 완료 아님)',
    '산재 처리 검토중',
    '산재 접수 미정',
    // PDF 실측에서 모델이 '산재보험처리' 라벨을 떼고 이렇게 돌려줬다.
    '신청 준비 중 (신청 완료 아님)',
  ]) {
    const { fields, warnings } = normalizeAccidentExtraction({
      workers_comp_claim: 'not_applied',
      report_details: { compensationDetails: phrase },
    })
    assert.equal('workers_comp_claim' in fields, false, `비워야 한다: ${phrase}`)
    assert.equal(fields.report_details.compensationDetails, phrase)
    assert.ok(warnings.some((warning) => warning.includes('산재신청 여부가 문서에서 확정되지 않아')))
  }

  const appliedButUnsettled = normalizeAccidentExtraction({
    workers_comp_claim: 'applied',
    report_details: { compensationDetails: '산재 신청 준비중' },
  })
  assert.equal('workers_comp_claim' in appliedButUnsettled.fields, false)

  const settled = normalizeAccidentExtraction({
    workers_comp_claim: 'applied',
    report_details: { compensationDetails: '산재 신청 완료(접수번호 없음)' },
  })
  assert.equal(settled.fields.workers_comp_claim, 'applied')
})

test('산재 신청 완료 뒤 치료·보상 진행 문구가 있어도 applied를 보존한다', () => {
  for (const phrase of [
    '산재 신청 완료, 보상금 지급 진행 중',
    '산재 신청 완료 후 치료 진행 중',
    '산재 접수 완료(승인 예정)',
    '산재보험 신청함. 치료 진행 중',
    '보상 협의 진행 중',
  ]) {
    const { fields, warnings } = normalizeAccidentExtraction({
      workers_comp_claim: 'applied',
      report_details: { compensationDetails: phrase },
    })
    assert.equal(fields.workers_comp_claim, 'applied', `보존해야 한다: ${phrase}`)
    assert.equal(warnings.some((warning) => warning.includes('산재신청 여부가')), false, phrase)
  }

  const notApplied = normalizeAccidentExtraction({
    workers_comp_claim: 'not_applied',
    report_details: { compensationDetails: '산재 미신청' },
  })
  assert.equal(notApplied.fields.workers_comp_claim, 'not_applied')
})

test('산재 가드 정규식은 긴 공백 입력에서도 즉시 끝난다', () => {
  // 공백이 길게 이어지는 입력에서 정규식이 분할 조합을 전부 시도하면 서버 라우트가 멈춘다.
  const padded = `산재${' '.repeat(3990)}x`

  const started = performance.now()
  const { fields } = normalizeAccidentExtraction({
    workers_comp_claim: 'applied',
    report_details: { compensationDetails: padded },
  })
  const elapsed = performance.now() - started

  assert.ok(elapsed < 100, `산재 가드가 너무 오래 걸렸다: ${elapsed.toFixed(1)}ms`)
  // 미확정 문구가 아니므로 산재신청 여부는 그대로 남는다.
  assert.equal(fields.workers_comp_claim, 'applied')
})

test('빈 신고처·피해자 조치 배열은 키를 만들지 않는다', () => {
  const { fields } = normalizeAccidentExtraction({
    report_details: { summary: '요지', notifications: [], victimActions: ['x'] },
  })

  assert.equal('notifications' in fields.report_details, false)
  assert.equal('victimActions' in fields.report_details, false)
})

test('신고처·피해자 조치는 enum만 남기고 중복을 제거한다', () => {
  const { fields } = normalizeAccidentExtraction({
    report_details: {
      notifications: ['police', 'police', '소방서', 'laborOffice', 7, null],
      victimActions: ['home', 'clinic', 'home'],
    },
  })

  assert.deepEqual(fields.report_details.notifications, ['police', 'laborOffice'])
  assert.deepEqual(fields.report_details.victimActions, ['home'])
})

test('배열이 아닌 신고처는 키를 만들지 않는다', () => {
  const { fields } = normalizeAccidentExtraction({
    report_details: { summary: '요지', notifications: 'emergency119', victimActions: {} },
  })

  assert.equal('notifications' in fields.report_details, false)
  assert.equal('victimActions' in fields.report_details, false)
})

test('report_details가 객체가 아니거나 유효 키가 없으면 키 자체를 넣지 않는다', () => {
  for (const bad of ['문자열', 42, null, [], ['a']]) {
    const { fields } = normalizeAccidentExtraction({ report_details: bad })
    assert.equal('report_details' in fields, false, `버려야 한다: ${JSON.stringify(bad)}`)
  }

  const { fields } = normalizeAccidentExtraction({ report_details: { summary: '', 무언가: 1 } })
  assert.equal('report_details' in fields, false)
})

test('문자열은 제어문자를 지우고 길이 상한으로 자른다', () => {
  const { fields } = normalizeAccidentExtraction({
    description: `사고내용\r\n둘째 줄`,
    location: '가'.repeat(300),
    cause: '나'.repeat(5000),
  })

  assert.equal(fields.description, '사고내용\n둘째 줄')
  assert.equal(fields.location.length, 200)
  assert.equal(fields.cause.length, 4000)
})

test('raw가 객체가 아니면 빈 필드와 안내를 돌려준다', () => {
  for (const bad of [null, undefined, '문자열', 42, ['a']]) {
    const { fields, warnings } = normalizeAccidentExtraction(bad)
    assert.deepEqual(fields, {})
    assert.ok(warnings.some((warning) => warning.includes('해석하지 못해')))
    assert.equal(warnings[warnings.length - 1], ACCIDENT_PREFILL_DRAFT_NOTICE)
  }
})

test('핵심 필드가 비면 항목별로 안내하고 마지막에 초안 고지를 붙인다', () => {
  const { warnings } = normalizeAccidentExtraction({})

  for (const label of ['사고 일시', '사고 내용', '사고 장소', '사고 정도', '재해 유형']) {
    assert.ok(warnings.some((warning) => warning === `문서에서 ${label}를 찾지 못했습니다.`), label)
  }
  assert.equal(warnings[warnings.length - 1], ACCIDENT_PREFILL_DRAFT_NOTICE)
})

test('extractGeminiJsonText는 파트를 이어 붙이고 없으면 null이다', () => {
  const joined = extractGeminiJsonText({
    candidates: [{ content: { parts: [{ text: '{"desc' }, { text: 'ription":"값"}' }] } }],
  })
  assert.equal(joined, '{"description":"값"}')

  for (const bad of [null, undefined, 42, {}, { candidates: [] }, { candidates: [{}] }, { candidates: [{ content: {} }] }]) {
    assert.equal(extractGeminiJsonText(bad), null, JSON.stringify(bad ?? null))
  }
  assert.equal(extractGeminiJsonText({ candidates: [{ content: { parts: [{ text: '   ' }] } }] }), null)
  assert.equal(extractGeminiJsonText({ candidates: [{ content: { parts: [{ inlineData: {} }] } }] }), null)
})

test('응답 스키마는 사진·작성자·프로젝트 속성을 갖지 않는다', () => {
  const properties = ACCIDENT_EXTRACTION_RESPONSE_SCHEMA.properties

  assert.equal(ACCIDENT_EXTRACTION_RESPONSE_SCHEMA.type, 'OBJECT')
  for (const forbidden of ['photos', 'project_id', 'external_project_name', 'created_by', 'model']) {
    assert.equal(forbidden in properties, false, forbidden)
  }
  assert.equal('photos' in properties.report_details.properties, false)

  for (const expected of ['accident_at', 'severity', 'accident_type', 'location', 'description', 'report_details']) {
    assert.ok(expected in properties, expected)
  }
  assert.equal(properties.injured_count.type, 'INTEGER')
  assert.deepEqual(properties.severity.enum, ['minor', 'lost_time', 'serious', 'fatal'])
  assert.deepEqual(properties.workers_comp_claim.enum, ['applied', 'not_applied'])
  assert.equal(properties.report_details.properties.notifications.type, 'ARRAY')
  assert.ok(properties.accident_type.enum.includes('끼임'))
})

test('프롬프트와 시스템 지시문이 추정 금지와 형식 규칙을 담는다', () => {
  assert.match(ACCIDENT_EXTRACTION_SYSTEM_INSTRUCTION, /없는 값은 반드시 null/)

  const prompt = buildAccidentExtractionPrompt()
  assert.match(prompt, /추정하거나 일반론으로 보완하지 않는다/)
  assert.match(prompt, /YYYY-MM-DD/)
  assert.match(prompt, /HH:mm/)
  assert.match(prompt, /체크 표시/)
  assert.match(prompt, /'기타'로 임의 확정하지 않고/)
  assert.match(prompt, /사고내용·경위 → description/)
  assert.match(prompt, /향후 추진계획·재발방지대책 → prevention_action/)
  assert.match(prompt, /보고일자/)
  assert.match(prompt, /산재신청 여부와 무관/)
  assert.match(prompt, /신청 완료 뒤에 치료·보상·지급이 진행 중이라는 문구가 있어도 applied/)
  assert.ok(prompt.includes('깔림·뒤집힘'))
})
