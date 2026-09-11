// CSI 자체 품질시험의 사업·실적·상세 파싱과 조회 경계를 검증한다.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'
import * as cheerio from 'cheerio'

const source = await readFile(new URL('../src/lib/quality/csi-self-quality-scrape.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
const module = { exports: {} }
let queue = []
const calls = []
const fetch = async (url, init) => {
  calls.push({ url, params: Object.fromEntries(new URLSearchParams(init.body)) })
  const html = queue.shift()
  if (html instanceof Error) throw html
  return { ok: true, status: 200, text: async () => html }
}
new Function('module', 'exports', 'require', 'fetch', outputText)(module, module.exports, (name) => {
  assert.equal(name, 'cheerio')
  return cheerio
}, fetch)
const api = module.exports
const projectHtml = '<div>총 1 개</div><table id="contents-table"><tbody><tr onclick="go_detail(\'0001\')"><td>1</td><td>0001</td><td>예시공사</td><td></td><td></td><td></td><td></td><td></td><td></td><td>12</td></tr></tbody></table>'
const row = (id) => `<tr>${['1', '일반', 'SQ-01', '예시공사', '레미콘', '현장내', '콘크리트 : 1건', '등록자', '2026-08-01', '시험자', '검토자', '-', '승인'].map((v) => `<td><a href="javascript:go_select('${id}');">${v}</a></td>`).join('')}</tr>`
const list = (ids, total = ids.length) => `<div>총 ${total} 개</div><table class="table-striped"><tbody>${ids.map(row).join('')}</tbody></table>`
const detail = `<input name="groupNo" value="10"><input name="bizMngNo" value="0001"><table><tr><th>구분번호</th><td>SQ-01</td><th>재료명</th><td>레미콘</td></tr><tr><th>생산자</th><td>예시생산자</td><th>시험·검사 장소</th><td>현장내</td></tr><tr><th>시험검사자</th><td>예시회사 / 시험자</td><th>비고</th><td>전체 비고</td></tr></table><table><tbody id="hircy_le_list"><tr><th rowspan="2">1</th><td>2026-08-01</td><td>굳은 콘크리트<br>압축강도</td><td>KS F 2405</td><td><label>1차 : 25</label><br><label>2차 : 26</label></td><td>적합</td></tr><tr><td colspan="5">시험 비고</td></tr></tbody></table>`

test('사업 목록의 관리번호와 실적 건수를 읽는다', () => {
  assert.deepEqual(api.parseSelfQualityProjects(projectHtml).rows, [{ bizMngNo: '0001', projectName: '예시공사', totalCount: 12 }])
  assert.equal(api.parseSelfQualityProjects(projectHtml.replace('<td>12</td>', '<td></td>')).rows[0].totalCount, 0)
})
test('사업 검색어를 CSI 공사명 필터로 전달한다', async () => {
  calls.length = 0
  queue = [projectHtml]
  await api.fetchSelfQualityProjects('cookie', '예시공사')
  assert.equal(calls[0].params.searchKey, 'cstrnNm')
  assert.equal(calls[0].params.searchVal, '예시공사')
})
test('실적 목록의 상세 식별자와 사업 번호를 보존한다', () => {
  const parsed = api.parseSelfQualityList(list(['10']), '0001')
  assert.equal(parsed.rows[0].groupNo, '10')
  assert.equal(parsed.rows[0].bizMngNo, '0001')
  assert.equal(parsed.rows[0].testerName, '시험자')
})
test('상세 실적은 비고 행을 제외하고 모든 측정값을 보존한다', () => {
  const parsed = api.parseSelfQualityDetail(detail)
  assert.equal(parsed.items.length, 1)
  assert.equal(parsed.items[0].testItem, '압축강도')
  assert.equal(parsed.items[0].materialCategory, '굳은 콘크리트')
  assert.match(parsed.items[0].testResult, /1차 : 25/)
  assert.match(parsed.items[0].testResult, /2차 : 26/)
  assert.equal(parsed.testerName, '시험자')
  assert.equal(api.parseSelfQualityDetail('<input name="bizMngNo" value="">' + detail).bizMngNo, '0001')
})
test('로그인 화면과 파싱 실패는 빈 결과로 숨기지 않는다', () => {
  assert.throws(() => api.parseSelfQualityList('<form name="loginForm"></form>', '0001'), api.CsiSessionError)
  assert.throws(() => api.parseSelfQualityList(list([], 1), '0001'), api.CsiParseError)
  assert.throws(() => api.parseSelfQualityDetail('<p>점검</p>'), api.CsiParseError)
  assert.equal(api.parseSelfQualityList('<p>총 0 개</p><table class="table-striped"><tbody><tr><td>등록된 자료가 없습니다.</td></tr></tbody></table>', '0001').totalCount, 0)
})
test('선택 사업 번호를 전송하며 반복 페이지는 중단하고 잘림을 알린다', async () => {
  calls.length = 0
  queue = [list(['10'], 20), list(['10'], 20)]
  const result = await api.fetchSelfQualityRows('cookie', '0001')
  assert.equal(calls.length, 2)
  assert.equal(calls[0].params.bizMngNo, '0001')
  assert.equal(calls[1].params.pageCount, '2')
  assert.equal(result.rows.length, 1)
  assert.equal(result.truncated, true)
})
test('130건의 실적은 13페이지까지 모두 가져온다', async () => {
  calls.length = 0
  queue = Array.from({ length: 13 }, (_, page) => list(Array.from({ length: 10 }, (_, index) => String(page * 10 + index + 1)), 130))
  const result = await api.fetchSelfQualityRows('cookie', '0001')
  assert.equal(calls.length, 13)
  assert.equal(result.rows.length, 130)
  assert.equal(result.truncated, false)
})
test('추가 페이지 시간 초과는 받은 실적과 잘림 경고를 반환한다', async () => {
  const timeout = new Error('시간 초과')
  timeout.name = 'TimeoutError'
  queue = [list(['10'], 20), timeout]
  const result = await api.fetchSelfQualityRows('cookie', '0001')
  assert.equal(result.rows.length, 1)
  assert.equal(result.truncated, true)
})
test('상세 응답의 사업·실적 번호 불일치를 거부한다', async () => {
  queue = [detail]
  await assert.rejects(api.fetchSelfQualityDetail('cookie', '11', '0001'), api.CsiParseError)
  queue = [detail]
  await assert.rejects(api.fetchSelfQualityDetail('cookie', '10', '0002'), api.CsiParseError)
})
