// 로그인한 CSI 세션에서 자체 품질시험 사업·실적·측정 결과를 읽는다.
import * as cheerio from 'cheerio'
import type { CsiSelfQualityDetail, CsiSelfQualityItem, CsiSelfQualityProject, CsiSelfQualityRow } from './csi-self-quality-types'

const ORIGIN = 'https://gcloud.csi.go.kr'
const PROJECT_URL = `${ORIGIN}/cmq/qtcSelf/qltRptRslt/qltRptPerConstList.do`
const LIST_URL = `${ORIGIN}/cmq/qts/sQltRptList.do`
const DETAIL_URL = `${ORIGIN}/cmq/qts/sQltRptView.do`
const MAX_PAGES = 50
const DEADLINE_MS = 20000
const norm = (text: string): string => text.replace(/\s+/g, ' ').trim()

export class CsiParseError extends Error {
  constructor(message = 'CSI 자체 품질시험 화면을 읽지 못했습니다. 화면 구성을 확인해주세요.') {
    super(message)
    this.name = 'CsiParseError'
  }
}

export class CsiSessionError extends Error {
  constructor() {
    super('CSI 로그인 세션이 만료되었습니다. 다시 로그인해주세요.')
    this.name = 'CsiSessionError'
  }
}

function loadPage(html: string) {
  const $ = cheerio.load(html)
  if ($('form[name="loginForm"], input[name="pswd"]').length) throw new CsiSessionError()
  return $
}

interface Page<T> { rows: T[]; totalCount: number }

function validatePage<T>(text: string, rows: T[]): Page<T> {
  const total = text.match(/총\s*([\d,]+)\s*개/)
  const empty = /(?:등록된|조회된|검색된)\s*(?:자료|데이터|내역|결과)가?\s*없습니다/.test(text)
  if (!total && !empty) throw new CsiParseError()
  const totalCount = total ? Number(total[1].replace(/,/g, '')) : 0
  if ((totalCount > 0 && !rows.length) || (totalCount === 0 && (!empty || rows.length > 0))) throw new CsiParseError()
  return { rows, totalCount }
}

export function parseSelfQualityProjects(html: string): Page<CsiSelfQualityProject> {
  const $ = loadPage(html)
  const rows: CsiSelfQualityProject[] = []
  $('#contents-table tbody tr').each((_, tr) => {
    const cells = $(tr).children('td')
    const bizMngNo = ($(tr).attr('onclick') || '').match(/go_detail\(\s*['"](\d+)['"]\s*\)/)?.[1]
    if (!bizMngNo) return
    if (cells.length < 10) throw new CsiParseError()
    const count = norm(cells.eq(9).text()).replace(/,/g, '')
    if (count && !/^\d+$/.test(count)) throw new CsiParseError()
    rows.push({ bizMngNo, projectName: norm(cells.eq(2).attr('title') || cells.eq(2).text()), totalCount: Number(count) })
  })
  return validatePage($.root().text(), rows)
}

export function parseSelfQualityList(html: string, bizMngNo: string): Page<CsiSelfQualityRow> {
  const $ = loadPage(html)
  const rows: CsiSelfQualityRow[] = []
  $('table.table-striped tbody tr').each((_, tr) => {
    const cells = $(tr).children('td')
    if (cells.length < 13) return
    const groupNo = ($(tr).find('a[href*="go_select"]').first().attr('href') || '').match(/go_select\(\s*['"](\d+)['"]\s*\)/)?.[1]
    if (!groupNo) throw new CsiParseError()
    const value = (index: number) => norm(cells.eq(index).attr('title') || cells.eq(index).text())
    rows.push({ groupNo, bizMngNo, reportNo: value(2), projectName: value(3), materialName: value(4), testPlace: value(5), testSummary: value(6), registeredDate: value(8), testerName: value(9), status: value(12) })
  })
  return validatePage($.root().text(), rows)
}

export function parseSelfQualityDetail(html: string): CsiSelfQualityDetail {
  const $ = loadPage(html)
  const identifier = (name: string): string => String($(`#form_view input[name="${name}"]`).first().val() || $(`input[name="${name}"]`).toArray().map((el) => $(el).val()).find(Boolean) || '')
  const groupNo = identifier('groupNo')
  const bizMngNo = identifier('bizMngNo')
  if (!groupNo || !bizMngNo || !$('#hircy_le_list').length) throw new CsiParseError()
  const labels = new Map<string, string>()
  $('th').each((_, th) => {
    const label = norm($(th).text()).replace(/\s/g, '')
    if (!labels.has(label) && $(th).next('td').length) labels.set(label, norm($(th).next('td').text()))
  })
  const items: CsiSelfQualityItem[] = []
  $('#hircy_le_list > tr').each((_, tr) => {
    const cells = $(tr).children('td')
    if (cells.length === 1 && cells.first().attr('colspan')) return
    if (cells.length !== 5) throw new CsiParseError()
    const nameCell = cells.eq(1).clone()
    nameCell.find('br').replaceWith('\n')
    const names = nameCell.text().split('\n').map(norm).filter(Boolean)
    const resultCell = cells.eq(3).clone()
    resultCell.find('br').replaceWith('\n')
    resultCell.find('label').append('\n')
    items.push({ testDate: norm(cells.eq(0).text()), materialCategory: names[0] || '', testItem: names.slice(1).join(' '), testStandard: norm(cells.eq(2).text()), testResult: resultCell.text().split('\n').map(norm).filter(Boolean).join('\n'), verdict: norm(cells.eq(4).text()) })
  })
  if (!items.length) throw new CsiParseError()
  const tester = norm($('#tstispUserInfo').text()) || labels.get('시험검사자') || ''
  return { groupNo, bizMngNo, reportNo: labels.get('구분번호') || '', materialName: norm($('#qltyUserInstNm').text()) || labels.get('재료명') || '', producerName: labels.get('생산자') || '', testPlace: norm($('#pckngPlcNm').text()) || labels.get('시험·검사장소') || '', testerName: tester.split('/').at(-1)?.trim() || '', note: labels.get('비고') || '', items }
}

async function postForm(url: string, cookie: string, params: Record<string, string>, timeoutMs = 10000): Promise<string> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', Cookie: cookie }, body: new URLSearchParams(params).toString(), redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) })
  if (res.status >= 300 && res.status < 400) throw new CsiSessionError()
  if (!res.ok) throw new Error(`CSI 응답 HTTP ${res.status}`)
  return res.text()
}

async function collectPages<T>(fetchPage: (page: number, timeoutMs: number) => Promise<Page<T>>, key: (row: T) => string) {
  const startedAt = Date.now()
  const first = await fetchPage(1, 10000)
  const rows = [...first.rows]
  const seen = new Set(rows.map(key))
  const pages = Math.ceil(first.totalCount / 10)
  for (let page = 2; page <= Math.min(pages, MAX_PAGES); page += 1) {
    const remaining = DEADLINE_MS - (Date.now() - startedAt)
    if (remaining <= 0) break
    let next: Page<T>
    try {
      next = await fetchPage(page, Math.min(10000, remaining))
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') break
      throw error
    }
    const fresh = next.rows.filter((row) => !seen.has(key(row)))
    if (!fresh.length) break
    fresh.forEach((row) => { seen.add(key(row)); rows.push(row) })
  }
  return { rows, totalCount: first.totalCount, truncated: rows.length < first.totalCount }
}

export const fetchSelfQualityProjects = (cookie: string, projectSearch = '') => collectPages(async (page, timeoutMs) => parseSelfQualityProjects(await postForm(PROJECT_URL, cookie, { pageCount: String(page), searchKey: 'cstrnNm', searchVal: projectSearch }, timeoutMs)), (row) => row.bizMngNo)

export const fetchSelfQualityRows = (cookie: string, bizMngNo: string) => collectPages(async (page, timeoutMs) => parseSelfQualityList(await postForm(LIST_URL, cookie, { bizMngNo, pageCount: String(page), searchKey: 'bizNm', searchVal: '', startYmd: '', endYmd: '', searchProcStatus: '' }, timeoutMs), bizMngNo), (row) => row.groupNo)

export async function fetchSelfQualityDetail(cookie: string, groupNo: string, bizMngNo: string): Promise<CsiSelfQualityDetail> {
  const detail = parseSelfQualityDetail(await postForm(DETAIL_URL, cookie, { groupNo, bizMngNo, pageCount: '1' }))
  if (detail.groupNo !== groupNo || detail.bizMngNo !== bizMngNo) throw new CsiParseError('요청한 자체 품질시험과 다른 상세가 반환되었습니다. 다시 조회해주세요.')
  return detail
}
