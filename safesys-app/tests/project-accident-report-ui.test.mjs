// 사고발생보고서 UI — 보고서 모드 모달·사진 필드·상세 보고 항목과 문서 초안 병합 규칙을 검증한다
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import test from 'node:test'
import ts from 'typescript'

const nodeRequire = createRequire(import.meta.url)

test('요양 예상 일수 병합은 입력한 0을 보존하고 휴업일수에서 복사하지 않는다', async () => {
  const { planPrefillMerge, draft } = await loadMerge()
  const current = draft({ lostWorkdays: '3', reportDetails: { ...draft().reportDetails, expectedTreatmentDays: '0' } })
  const plan = planPrefillMerge(current, { report_details: { expectedTreatmentDays: '14' } })
  assert.deepEqual(plan.conflicts, ['산재요양 예상 일수'])
  assert.equal(plan.fillEmpty.reportDetails.expectedTreatmentDays, '0')
  assert.equal(plan.overwrite.reportDetails.expectedTreatmentDays, '14')
  assert.equal(plan.overwrite.lostWorkdays, '3')
  const empty = draft()
  assert.equal(planPrefillMerge(empty, { lost_workdays: 14 }).overwrite.reportDetails.expectedTreatmentDays, '')
  assert.equal(planPrefillMerge(empty, { report_details: { expectedTreatmentDays: '0' } }).fillEmpty.reportDetails.expectedTreatmentDays, '0')
  for (const value of ['', '-1', '1.5', '삼일', '9007199254740992']) {
    assert.equal(planPrefillMerge(current, { report_details: { expectedTreatmentDays: value } }).hasChanges, false)
  }
})

test('요양 예상 일수 입력은 number·min 0·step 1이고 상세는 일 단위를 표시한다', async () => {
  const emptyMarkup = await renderModal({ reportMode: true })
  const input = emptyMarkup.match(/<input[^>]*id="accident-report-expectedTreatmentDays"[^>]*>/)?.[0]
  assert.ok(input)
  assert.match(input, /type="number"/)
  assert.match(input, /min="0"/)
  assert.match(input, /step="1"/)
  assert.match(input, /value=""/)
  assert.match(emptyMarkup, /일 단위/)
  for (const days of ['0', '14']) {
    const accident = { ...ACCIDENT, report_details: { expectedTreatmentDays: days } }
    const form = await renderModal({ reportMode: true, accident })
    assert.match(form.match(/<input[^>]*id="accident-report-expectedTreatmentDays"[^>]*>/)?.[0] ?? '', new RegExp(`value="${days}"`))
    const detail = await renderDetail({ accident })
    assert.match(detail, new RegExp(`>${days}일<`))
  }
})
const React = nodeRequire('react')
const { renderToStaticMarkup } = nodeRequire('react-dom/server')

/**
 * `@/` 별칭 모듈을 실제 소스로 따라가며 전부 transpile한다.
 * `overrides`에 담긴 이름만 대역으로 바꾸고, 그 밖의 패키지는 node가 해결한다.
 */
function createLoader(overrides) {
  const cache = new Map()

  const resolveAlias = async (name) => {
    const relative = name.replace('@/', '../src/')
    for (const suffix of ['.ts', '.tsx']) {
      try {
        const url = new URL(`${relative}${suffix}`, import.meta.url)
        return { url, source: await readFile(url, 'utf8') }
      } catch {
        // 다음 확장자를 시도한다.
      }
    }
    throw new Error(`별칭 모듈을 찾지 못했다: ${name}`)
  }

  const load = async (name) => {
    if (name in overrides) return overrides[name]
    if (!name.startsWith('@/')) return nodeRequire(name)
    if (cache.has(name)) return cache.get(name)

    const { source } = await resolveAlias(name)
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    })

    // 의존성을 먼저 모두 로드해 동기 require로 돌려줄 수 있게 한다.
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

/** 형제 워커가 만드는 모듈은 대역으로 둔다 — 이 파일은 UI만 검증한다. */
const uiOverrides = () => ({
  '@/lib/supabase': { supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } },
  '@/lib/accident-report-import': { requestAccidentPrefill: async () => ({ fields: {}, warnings: [] }) },
  '@/lib/hwpx/accident-report-hwpx-export': { downloadAccidentReportHwpx: async () => undefined },
})

const PROJECT = {
  id: 'project-a',
  project_name: '○○지구 배수개선사업',
  managing_hq: '전북본부',
  managing_branch: '김제지사',
  display_order: 1,
}

const PHOTO_DATA_URL = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ=='
const OTHER_PHOTO_DATA_URL = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAAQ=='

const ACCIDENT = {
  id: 'accident-1',
  project_id: 'project-a',
  external_project_name: null,
  external_managing_hq: null,
  external_managing_branch: null,
  accident_at: '2026-09-10T00:00:00+09:00',
  severity: 'minor',
  accident_type: '넘어짐',
  location: '가설통로',
  work_description: '자재 운반',
  description: '이동 중 미끄러짐',
  cause: '통로 물기',
  prevention_action: '배수 및 미끄럼 방지 처리',
  injured_count: 1,
  fatal_count: 0,
  lost_workdays: 3,
  workers_comp_claim: 'applied',
  report_details: null,
  created_by: 'user-1',
  created_at: '2026-09-10T00:00:00+09:00',
  updated_at: '2026-09-10T00:00:00+09:00',
}

async function renderModal(props) {
  const load = createLoader(uiOverrides())
  const modalModule = await load('@/components/dashboard/AccidentEntryModal')
  return renderToStaticMarkup(React.createElement(modalModule.default, {
    isOpen: true,
    projects: [PROJECT],
    fixedProject: PROJECT,
    accident: null,
    submitting: false,
    submitError: '',
    onClose: () => undefined,
    onSubmit: () => undefined,
    ...props,
  }))
}

async function renderPhotoField(props) {
  const load = createLoader(uiOverrides())
  const fieldModule = await load('@/components/project/accident-report/AccidentReportPhotoField')
  return renderToStaticMarkup(React.createElement(fieldModule.default, {
    photos: [],
    disabled: false,
    onChange: () => undefined,
    ...props,
  }))
}

async function renderDetail(props) {
  const load = createLoader(uiOverrides())
  const detailModule = await load('@/components/project/accident-report/AccidentReportDetail')
  return renderToStaticMarkup(React.createElement(detailModule.default, {
    accident: ACCIDENT,
    projectName: PROJECT.project_name,
    canEdit: true,
    canDelete: true,
    deleting: false,
    onEdit: () => undefined,
    onDelete: () => undefined,
    onDownloadHwpx: () => undefined,
    downloading: false,
    downloadError: '',
    detailLoading: false,
    detailError: '',
    onRetryDetail: () => undefined,
    ...props,
  }))
}

test('기본 모드 모달은 보고서 항목도 문서 업로드도 내놓지 않는다', async () => {
  const markup = await renderModal({})

  assert.doesNotMatch(markup, /accident-report-reportTitle/)
  assert.doesNotMatch(markup, /PDF·HWPX 업로드로 초안 채우기/)
  assert.doesNotMatch(markup, /accident-report-photo-input/)
})

test('보고서 모드 모달은 보고서 항목·사진 필드·문서 업로드를 함께 보여준다', async () => {
  const markup = await renderModal({ reportMode: true })

  assert.match(markup, /accident-report-reportTitle/)
  assert.match(markup, /accident-report-summary/)
  assert.match(markup, /accident-report-photo-input/)
  assert.match(markup, /PDF·HWPX 업로드로 초안 채우기/)
  assert.match(markup, /accept="\.pdf,\.hwpx,application\/pdf"/)
  assert.match(markup, /사고발생보고서에 필요한 항목을 함께 기록합니다/)
})

test('보고서 모드 모달은 저장된 보고서 항목을 입력에 채워 준다', async () => {
  const markup = await renderModal({
    reportMode: true,
    accident: {
      ...ACCIDENT,
      report_details: {
        reportTitle: '사고발생보고',
        reporterName: '홍길동',
        summary: '가설통로에서 미끄러짐',
        notifications: ['emergency119'],
        victimActions: ['hospital'],
        photos: [{ dataUrl: PHOTO_DATA_URL, caption: '사고 현장' }],
      },
    },
  })

  assert.match(markup, /value="사고발생보고"/)
  assert.match(markup, /value="홍길동"/)
  assert.match(markup, /가설통로에서 미끄러짐/)
  assert.match(markup, /value="사고 현장"/)
})

test('사진 필드는 두 장이 차면 파일 입력을 감추고 한도를 안내한다', async () => {
  const empty = await renderPhotoField({})
  const full = await renderPhotoField({
    photos: [
      { dataUrl: PHOTO_DATA_URL, caption: '첫 장' },
      { dataUrl: OTHER_PHOTO_DATA_URL, caption: '둘째 장' },
    ],
  })

  assert.match(empty, /accident-report-photo-input/)
  assert.doesNotMatch(full, /accident-report-photo-input/)
  assert.match(full, /사진은 최대 2장까지/)
})

test('상세는 보고서 항목이 없으면 안내와 한글 다운로드를 함께 보여준다', async () => {
  const markup = await renderDetail({})

  assert.match(markup, /보고서 추가 항목이 아직 없습니다/)
  assert.match(markup, />한글 다운로드</)
})

test('상세는 채운 보고 항목과 아직 못 채운 항목을 함께 보여준다', async () => {
  const markup = await renderDetail({
    accident: {
      ...ACCIDENT,
      report_details: {
        reportTitle: '사고발생보고',
        reporterName: '홍길동',
        notifications: ['emergency119', 'police'],
        victimActions: [],
        photos: [],
      },
    },
  })

  assert.match(markup, />보고서 제목</)
  assert.match(markup, /사고발생보고/)
  assert.match(markup, /119 · 경찰서/)
  assert.match(markup, /아직 작성하지 않은 보고 항목/)
  assert.match(markup, /보고일/)
  assert.doesNotMatch(markup, /보고서 추가 항목이 아직 없습니다/)
})

test('상세는 보고 항목 조회에 실패하면 재시도 버튼을 준다', async () => {
  const markup = await renderDetail({
    accident: { ...ACCIDENT, report_details: undefined },
    detailError: '보고서 항목을 불러오지 못했습니다.',
  })

  assert.match(markup, /보고서 항목을 불러오지 못했습니다\./)
  assert.match(markup, />보고서 항목 다시 불러오기</)
})

test('상세는 보고 항목을 읽는 중임을 알린다', async () => {
  const markup = await renderDetail({
    accident: { ...ACCIDENT, report_details: undefined },
    detailLoading: true,
  })

  assert.match(markup, /보고서 항목을 불러오는 중/)
})

async function loadMerge() {
  const load = createLoader(uiOverrides())
  const merge = await load('@/components/project/accident-report/prefill-merge')
  const report = await load('@/lib/accident-report')
  const draft = (overrides = {}) => ({
    projectId: 'project-a',
    externalProjectName: '',
    externalManagingHq: '',
    externalManagingBranch: '',
    isExternal: false,
    accidentAt: '',
    severity: 'minor',
    accidentType: '',
    location: '',
    workDescription: '',
    description: '',
    cause: '',
    preventionAction: '',
    injuredCount: '0',
    fatalCount: '0',
    lostWorkdays: '0',
    workersCompClaim: '',
    reportDetails: report.createEmptyAccidentReportDetails(),
    ...overrides,
  })
  return { planPrefillMerge: merge.planPrefillMerge, draft }
}

test('빈 칸만 채우기는 이미 쓴 값을 그대로 둔다', async () => {
  const { planPrefillMerge, draft } = await loadMerge()
  const current = draft({ description: '내가 쓴 개요' })

  const plan = planPrefillMerge(current, { description: '문서 개요', location: '문서 장소' })

  assert.deepEqual(plan.conflicts, ['사고 개요'])
  assert.equal(plan.fillEmpty.description, '내가 쓴 개요')
  assert.equal(plan.fillEmpty.location, '문서 장소')
  assert.equal(plan.overwrite.description, '문서 개요')
  // 원본 초안은 그대로 남는다.
  assert.equal(current.description, '내가 쓴 개요')
})

test('덮어쓰기도 문서에 없는 항목과 사진은 건드리지 않는다', async () => {
  const { planPrefillMerge, draft } = await loadMerge()
  const photos = [{ dataUrl: PHOTO_DATA_URL, caption: '현장 사진' }]
  const current = draft({
    cause: '통로 물기',
    reportDetails: { ...draft().reportDetails, photos },
  })

  const plan = planPrefillMerge(current, {
    description: '문서 개요',
    report_details: {
      summary: '문서 요지',
      photos: [{ dataUrl: OTHER_PHOTO_DATA_URL, caption: '문서 사진' }],
    },
  })

  assert.equal(plan.overwrite.cause, '통로 물기')
  assert.equal(plan.overwrite.description, '문서 개요')
  assert.equal(plan.overwrite.reportDetails.summary, '문서 요지')
  assert.deepEqual(plan.overwrite.reportDetails.photos, photos)
  assert.deepEqual(plan.fillEmpty.reportDetails.photos, photos)
})

test('문서 초안의 본 항목은 화면 입력 상한과 같은 길이로 잘린다', async () => {
  const { planPrefillMerge, draft } = await loadMerge()

  const plan = planPrefillMerge(draft(), {
    description: '가'.repeat(2500),
    work_description: '나'.repeat(600),
    location: '다'.repeat(250),
  })

  assert.equal(plan.fillEmpty.description.length, 2000)
  assert.equal(plan.fillEmpty.workDescription.length, 500)
  assert.equal(plan.fillEmpty.location.length, 200)
})

test('문서가 비워 온 항목은 이미 쓴 값을 지우지 않는다', async () => {
  const { planPrefillMerge, draft } = await loadMerge()
  const current = draft({
    description: '내 개요',
    cause: '내 원인',
    reportDetails: { ...draft().reportDetails, summary: '내 요지' },
  })

  const plan = planPrefillMerge(current, {
    description: '',
    cause: '   ',
    injured_count: -1,
    accident_at: '',
    report_details: { summary: '' },
  })

  assert.equal(plan.hasChanges, false)
  assert.deepEqual(plan.conflicts, [])
  assert.equal(plan.fillEmpty.description, '내 개요')
  assert.equal(plan.overwrite.cause, '내 원인')
  assert.equal(plan.overwrite.reportDetails.summary, '내 요지')
  assert.equal(plan.overwrite.injuredCount, '0')
})

test('수정 모달처럼 baseline이 없으면 저장된 값을 충돌로 잡고 빈 칸만 채우기가 지킨다', async () => {
  const { planPrefillMerge, draft } = await loadMerge()
  const current = draft({
    severity: 'minor',
    injuredCount: '0',
    reportDetails: { ...draft().reportDetails, reporterName: '저장된 보고자' },
  })

  const plan = planPrefillMerge(current, {
    severity: 'serious',
    injured_count: 2,
    report_details: { reporterName: '문서의 보고자', relatedContacts: '가상병원 02-000-0000' },
  })

  assert.deepEqual(plan.conflicts, ['중대도', '부상자 수', '보고자 성명'])
  assert.equal(plan.fillEmpty.severity, 'minor')
  assert.equal(plan.fillEmpty.injuredCount, '0')
  assert.equal(plan.fillEmpty.reportDetails.reporterName, '저장된 보고자')
  assert.equal(plan.fillEmpty.reportDetails.relatedContacts, '가상병원 02-000-0000')
  assert.equal(plan.overwrite.reportDetails.reporterName, '문서의 보고자')
})

test('신규 등록 기본값을 baseline으로 주면 그 값은 충돌 없이 채워진다', async () => {
  const { planPrefillMerge, draft } = await loadMerge()
  const baseline = draft({ severity: 'minor', accidentType: '넘어짐', injuredCount: '0' })
  const current = draft({
    severity: 'minor',
    accidentType: '넘어짐',
    injuredCount: '0',
    reportDetails: { ...draft().reportDetails, reporterName: '직접 입력 보고자' },
  })

  const plan = planPrefillMerge(
    current,
    { severity: 'serious', injured_count: 2, report_details: { reporterName: '문서의 보고자' } },
    baseline,
  )

  assert.deepEqual(plan.conflicts, ['보고자 성명'])
  assert.equal(plan.fillEmpty.severity, 'serious')
  assert.equal(plan.fillEmpty.injuredCount, '2')
  assert.equal(plan.fillEmpty.reportDetails.reporterName, '직접 입력 보고자')
})

async function loadPhotoUpdates() {
  const load = createLoader(uiOverrides())
  return load('@/components/project/accident-report/photo-list-updates')
}

test('사진 목록 갱신 함수는 두 장 한도·설명 수정·삭제를 최신 목록에서 계산한다', async () => {
  const { appendPhotos, updatePhotoCaption, removePhoto } = await loadPhotoUpdates()
  const first = { dataUrl: PHOTO_DATA_URL, caption: '' }
  const second = { dataUrl: OTHER_PHOTO_DATA_URL, caption: '' }
  const third = { dataUrl: `${PHOTO_DATA_URL}AA`, caption: '' }

  const appended = appendPhotos([first], [second, third])
  assert.equal(appended.length, 2)
  assert.deepEqual(appended, [first, second])

  const captioned = updatePhotoCaption(appended, 1, '세로 사진 설명')
  assert.equal(captioned[1].caption, '세로 사진 설명')
  assert.equal(captioned[0].caption, '')
  // 원본 목록은 그대로 남는다.
  assert.equal(appended[1].caption, '')

  const removed = removePhoto(captioned, 0)
  assert.deepEqual(removed, [captioned[1]])
  assert.equal(captioned.length, 2)
})

async function renderPrefillPanel(props) {
  const load = createLoader(uiOverrides())
  const panelModule = await load('@/components/project/accident-report/AccidentPrefillPanel')
  return renderToStaticMarkup(React.createElement(panelModule.default, {
    loading: false,
    disabled: false,
    error: '',
    warnings: [],
    notice: '',
    conflicts: null,
    onSelectFile: () => undefined,
    onFillEmpty: () => undefined,
    onOverwrite: () => undefined,
    onCancel: () => undefined,
    ...props,
  }))
}

test('확인 패널은 충돌이 사라져도 선택 버튼을 유지한다', async () => {
  const hidden = await renderPrefillPanel({})
  const none = await renderPrefillPanel({ conflicts: [] })
  const some = await renderPrefillPanel({ conflicts: ['보고자 성명'] })

  assert.doesNotMatch(hidden, />빈 칸만 채우기</)
  assert.match(none, /겹치는 항목이 없습니다/)
  assert.match(none, />빈 칸만 채우기</)
  assert.match(some, /이미 입력한 항목 1개\(보고자 성명\)/)
  assert.match(some, />문서 내용으로 덮어쓰기</)
  assert.match(some, />취소</)
})
