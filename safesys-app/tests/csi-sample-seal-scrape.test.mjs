// CSI 시료봉인 목록·상세 HTML 파싱과 페이지 순회를 실측 픽스처로 검증한다.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'
import * as cheerio from 'cheerio'

async function loadTypeScript(relativePath, dependencies = {}, globals = {}) {
  const source = await readFile(new URL(relativePath, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  })
  const module = { exports: {} }
  const require = (name) => {
    assert.ok(name in dependencies, `예상하지 못한 의존성 ${name}`)
    return dependencies[name]
  }
  new Function('module', 'exports', 'require', ...Object.keys(globals), outputText)(
    module, module.exports, require, ...Object.values(globals),
  )
  return module.exports
}

const readFixture = (name) => readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')

const listHtml = await readFixture('csi-sample-seal-list.html')
const viewHtml = await readFixture('csi-sample-seal-view.html')
const loginHtml = await readFixture('csi-sample-seal-login-required.html')

// 0건 화면은 실측 목록 픽스처의 결과 행만 '등록된 자료가 없습니다'로 바꿔 만든다.
const emptyHtml = listHtml
  .replace(/<tbody>[\s\S]*<\/tbody>/, '<tbody><tr><td colspan="9">등록된 자료가 없습니다.</td></tr></tbody>')
  .replace('총 40', '총 0')

// 화면 개편으로 상세 링크의 키 속성이 사라진 상황
const renamedHtml = listHtml.replaceAll('data-smpslNo', 'data-sealNo')

// 총건수만 있고 '자료 없음' 문구가 없는 조용한 0건 화면
const silentZeroHtml = listHtml
  .replace(/<tbody>[\s\S]*<\/tbody>/, '<tbody></tbody>')
  .replace('총 40', '총 0')

// n페이지 응답 — 실측 픽스처의 13자리 시료봉인번호 앞 두 자리만 페이지 번호로 바꿔 파생한다
const pageHtml = (page, total = 40) =>
  listHtml
    .replace(/\d{13}/g, (no) => String(page).padStart(2, '0') + no.slice(2))
    .replace('총 40', `총 ${total}`)

const fetchCalls = []
let fetchQueue = []
let fetchClockStepMs = 0
let fakeNow = 0
const fakeFetch = async (url, init) => {
  fetchCalls.push({ url, init, params: Object.fromEntries(new URLSearchParams(init?.body || '')) })
  fakeNow += fetchClockStepMs
  const next = fetchQueue.shift()
  if (!next) throw new Error(`예상하지 못한 fetch 호출: ${url}`)
  return { ok: true, status: 200, text: async () => next }
}

const scrape = await loadTypeScript(
  '../src/lib/quality/csi-sample-seal-scrape.ts',
  { cheerio },
  { fetch: fakeFetch },
)
// 마감시간 검증용으로 시계를 우리가 쥔 두 번째 인스턴스
const scrapeWithClock = await loadTypeScript(
  '../src/lib/quality/csi-sample-seal-scrape.ts',
  { cheerio },
  { fetch: fakeFetch, Date: { now: () => fakeNow } },
)
const {
  parseSampleSealList,
  parseSampleSealDetail,
  fetchSampleSeals,
  fetchSampleSealDetail,
  CsiParseError,
  CsiSessionError,
} = scrape

test('목록 1페이지에서 총건수와 10행을 읽고 잘린 공사명 대신 title 전체 이름을 쓴다', () => {
  const page = parseSampleSealList(listHtml)
  assert.equal(page.totalCount, 40)
  assert.equal(page.isEmptyResult, false)
  assert.equal(page.rows.length, 10)

  const first = page.rows[0]
  assert.deepEqual(first, {
    smpslNo: '0000000624104',
    purposeNm: '품질시험·검사 대행',
    sealSeNm: '현장',
    constNm: '가나지구 면단위 공공하수처리시설 설치사업 시설공사',
    sealNm: '들밀도시험',
    observerNm: '홍길동',
    sealerNm: '',
    sealYmd: '2026-09-07',
    sealSttsNm: '품질검사 의뢰신청',
  })
  assert.ok(!first.constNm.includes('...'), '공사명은 목록에 잘려 보이는 텍스트가 아니라 title 전체 이름이어야 한다')

  const last = page.rows[9]
  assert.equal(last.sealNm, '콘크리트 코어(S41~S48)')
  assert.equal(last.observerNm, '이몽룡')
  assert.equal(last.sealerNm, '임꺽정')
})

test('등록된 자료가 없으면 0건으로 판정한다', () => {
  const page = parseSampleSealList(emptyHtml)
  assert.equal(page.totalCount, 0)
  assert.equal(page.rows.length, 0)
  assert.equal(page.isEmptyResult, true)
})

test('로그인 화면이 돌아오면 세션 오류로 구분한다', () => {
  assert.throws(() => parseSampleSealList(loginHtml), CsiSessionError)
})

test('총건수는 있는데 행을 못 읽으면 파싱 오류를 던진다', () => {
  assert.throws(() => parseSampleSealList(renamedHtml), CsiParseError)
})

test('총 0건인데 자료없음 문구가 없으면 파싱 오류를 던진다', () => {
  assert.throws(() => parseSampleSealList(silentZeroHtml), CsiParseError)
})

test('상세 화면에서 기본정보·사업정보·시료봉인정보·종별을 읽는다', () => {
  const detail = parseSampleSealDetail(viewHtml)
  assert.equal(detail.smpslNo, '0000000624104')
  assert.equal(detail.sealSttsNm, '품질검사 의뢰신청')
  assert.equal(detail.purposeNm, '품질시험·검사 대행')
  assert.equal(detail.registInstNm, '가나건설(주)')
  assert.equal(detail.sealSeNm, '현장')
  assert.equal(detail.constNm, '가나지구 면단위 공공하수처리시설 설치사업 시설공사')
  assert.equal(detail.beginYmd, '2023-07-06')
  assert.equal(detail.endYmd, '2027-06-30')
  assert.equal(detail.ownerNm, '○○공사 △△지사')
  assert.equal(detail.builderNm, '가나건설(주)')
  assert.equal(detail.sealNm, '들밀도시험')
  assert.equal(detail.sealYmd, '2026-09-07')
  assert.equal(detail.testClass, '토목 > 도로공사 > 흙, 혼합골재')
  assert.equal(detail.testKind, '동상방지층, 보조기층')
})

test('상세 화면에서 채취자·참관자의 소속·성명·담당업무를 읽는다', () => {
  const detail = parseSampleSealDetail(viewHtml)
  assert.deepEqual(detail.people, [
    { role: '채취자', instNm: '가나건설(주)', name: '임꺽정', duty: '품질관리자' },
    { role: '봉인자', instNm: '', name: '', duty: '' },
    { role: '참관자', instNm: '○○공사 △△지사', name: '홍길동', duty: '품질관리 업무 담당' },
  ])
})

test('시험종목 카탈로그를 고유번호·종목·방법으로 읽는다', () => {
  const { catalog } = parseSampleSealDetail(viewHtml)
  assert.equal(catalog.length, 36)
  assert.deepEqual(catalog[0], { code: '821', itemNm: '골재의 0.08밀리미터체 통과량', method: 'KS F 2511' })
  assert.deepEqual(
    catalog.find((item) => item.code === '829'),
    { code: '829', itemNm: '현장밀도', method: 'KS F 2311' },
  )
})

test('시료 표를 시료 건수만큼 읽고 봉인사진 표는 시료로 세지 않는다', () => {
  const { samples } = parseSampleSealDetail(viewHtml)
  assert.equal(samples.length, 5)
  assert.deepEqual(samples[0], {
    sampleNm: '들밀도시험',
    sampleSeNm: '해당사항없음',
    creatNation: '대한민국',
    makerNm: '가나건설',
    stndrd: '( 가공상태 : )',
    pickPlace: 'SB-32-구간(보조기층 NO-1)',
    pickYmd: '',
    pickQty: '',
    sampleDesc: '',
  })
  assert.deepEqual(
    samples.map((s) => s.pickPlace),
    [1, 2, 3, 4, 5].map((n) => `SB-32-구간(보조기층 NO-${n})`),
  )
})

test('상세 화면에 아는 표가 하나도 없으면 파싱 오류를 던진다', () => {
  assert.throws(() => parseSampleSealDetail('<html><body><p>점검 중입니다.</p></body></html>'), CsiParseError)
})

test('상세 요청에 로그인 화면이 돌아오면 세션 오류로 구분한다', () => {
  assert.throws(() => parseSampleSealDetail(loginHtml), CsiSessionError)
})

test('목록 조회는 쿠키·검색어를 실어 총건수만큼 페이지를 순차 조회한다', async () => {
  fetchCalls.length = 0
  fetchQueue = [1, 2, 3, 4].map((page) => pageHtml(page))
  const result = await fetchSampleSeals('WMONID=a; JSESSIONID=b', { constNm: '가나지구' })

  assert.equal(fetchCalls.length, 4, '총 40건 = 4페이지를 모두 읽어야 한다')
  assert.equal(result.totalCount, 40)
  assert.equal(result.rows.length, 40)
  assert.equal(new Set(result.rows.map((row) => row.smpslNo)).size, 40, '시료봉인번호가 겹치면 안 된다')
  assert.equal(result.truncated, false)

  const [first] = fetchCalls
  assert.ok(first.url.endsWith('/cmq/qtr/sample/sealng/sampleSealngList.do'))
  assert.equal(first.init.method, 'POST')
  assert.equal(first.init.headers.Cookie, 'WMONID=a; JSESSIONID=b')
  assert.equal(first.init.headers['Content-Type'], 'application/x-www-form-urlencoded; charset=UTF-8')
  assert.equal(first.params.pageCount, '1')
  assert.equal(first.params.searchKey, 'cstrnNm')
  assert.equal(first.params.searchVal, '가나지구')
  assert.equal(first.params.onlyInst, 'N')
  assert.equal(fetchCalls[3].params.pageCount, '4')
})

test('0건이면 추가 페이지를 조회하지 않는다', async () => {
  fetchCalls.length = 0
  fetchQueue = [emptyHtml]
  const result = await fetchSampleSeals('c=1', {})
  assert.equal(fetchCalls.length, 1)
  assert.equal(result.totalCount, 0)
  assert.equal(result.rows.length, 0)
  assert.equal(result.truncated, false)
})

test('페이지 상한을 넘으면 잘렸다고 표시한다', async () => {
  fetchCalls.length = 0
  fetchQueue = Array.from({ length: 10 }, (_, i) => pageHtml(i + 1, 400))
  const result = await fetchSampleSeals('c=1', {})
  assert.equal(fetchCalls.length, 10, '최대 10페이지까지만 읽는다')
  assert.equal(result.totalCount, 400)
  assert.equal(result.rows.length, 100)
  assert.equal(result.truncated, true)
})

test('같은 페이지가 반복되면 중복을 버리고 순회를 멈춘다', async () => {
  fetchCalls.length = 0
  fetchQueue = Array.from({ length: 10 }, () => pageHtml(1, 400))
  const result = await fetchSampleSeals('c=1', {})
  assert.equal(fetchCalls.length, 2, '새 행이 없는 페이지를 만나면 더 읽지 않는다')
  assert.equal(result.rows.length, 10)
  assert.equal(result.truncated, true)
})

test('마감시간을 넘기면 남은 페이지를 포기하고 잘렸다고 표시한다', async () => {
  fetchCalls.length = 0
  fakeNow = 0
  fetchClockStepMs = 21000 // 페이지 1회 호출에 21초가 걸리는 상황
  fetchQueue = [1, 2, 3, 4].map((page) => pageHtml(page))
  const result = await scrapeWithClock.fetchSampleSeals('c=1', {})
  fetchClockStepMs = 0

  assert.equal(fetchCalls.length, 2, '마감 40초를 넘기면 3페이지는 읽지 않는다')
  assert.equal(result.totalCount, 40)
  assert.equal(result.rows.length, 20)
  assert.equal(result.truncated, true)
})

test('상세 조회는 시료봉인번호를 실어 1회만 호출한다', async () => {
  fetchCalls.length = 0
  fetchQueue = [viewHtml]
  const detail = await fetchSampleSealDetail('c=1', '0000000624104')
  assert.equal(fetchCalls.length, 1)
  assert.ok(fetchCalls[0].url.endsWith('/cmq/qtr/sample/sealng/sampleSealngView.do'))
  assert.equal(fetchCalls[0].params.smpslNo, '0000000624104')
  assert.equal(detail.smpslNo, '0000000624104')
  assert.equal(detail.samples.length, 5)
})

test('요청한 번호와 다른 상세가 돌아오면 파싱 오류를 던진다', async () => {
  fetchCalls.length = 0
  fetchQueue = [viewHtml]
  await assert.rejects(fetchSampleSealDetail('c=1', '0000000000001'), CsiParseError)
  assert.equal(fetchCalls.length, 1)
})
