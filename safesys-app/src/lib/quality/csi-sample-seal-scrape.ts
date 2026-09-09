// 로그인한 CSI 세션으로 시료봉인 목록·상세 화면을 스크래핑해 정규화 타입으로 바꾸는 모듈
import * as cheerio from 'cheerio'
import type {
  CsiSampleSealCatalogItem,
  CsiSampleSealDetail,
  CsiSampleSealPerson,
  CsiSampleSealRow,
  CsiSampleSealSample,
} from './csi-sample-seal-types'

// 시료봉인 목록·상세 화면 (로그인 쿠키 필요, POST form-urlencoded)
const LIST_URL = 'https://gcloud.csi.go.kr/cmq/qtr/sample/sealng/sampleSealngList.do'
const VIEW_URL = 'https://gcloud.csi.go.kr/cmq/qtr/sample/sealng/sampleSealngView.do'

// 정부 사이트 부하 제한 — 목록은 10행/페이지, 최대 10페이지(100행)까지만 순차로 읽는다
const ROWS_PER_PAGE = 10
const MAX_LIST_PAGES = 10
const REQUEST_TIMEOUT_MS = 20000
// 로그인 1회 + 페이지 10회 × 20초 타임아웃은 라우트의 maxDuration 60초를 넘을 수 있다 —
// 다음 페이지를 읽기 전에 이 마감을 넘었으면 순회를 멈추고 받은 만큼만 돌려준다
const LIST_DEADLINE_MS = 40000

// 공개 화면과 마찬가지로 <meta charset="euc-kr"> 선언과 달리 요청·응답 본문은 모두 UTF-8이다
const FORM_CONTENT_TYPE = 'application/x-www-form-urlencoded; charset=UTF-8'

const NO_DATA_TEXT = '등록된 자료가 없습니다'
// 총건수 문구는 '/총 40\n 개'처럼 줄바꿈이 섞여 있다
const TOTAL_COUNT_RE = /총\s*([\d,]+)\s*개/
// 세션이 끊기면 200 응답이지만 상단 로그인 폼이 들어 있다
const LOGIN_FORM_TEXT = 'name="loginForm"'

const CATALOG_CAPTION = '시험종목정보'
const SAMPLE_CAPTION = '시료정보'
const PERSON_ROLES = ['채취자', '봉인자', '참관자']

/** CSI 화면 개편으로 마크업이 바뀌어 조용히 0건이 되는 것을 막기 위한 파싱 실패 신호 */
export class CsiParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CsiParseError'
  }
}

/** 로그인 세션이 끊겨 조회 화면 대신 로그인 화면이 돌아온 경우 */
export class CsiSessionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CsiSessionError'
  }
}

export interface CsiSampleSealListPage {
  totalCount: number
  rows: CsiSampleSealRow[]
  isEmptyResult: boolean // 진짜 0건 (파싱 실패와 구분)
}

export interface CsiSampleSealListResult {
  totalCount: number
  rows: CsiSampleSealRow[]
  truncated: boolean // 페이지 상한 때문에 잘렸는지
}

const norm = (value: string): string => value.replace(/\s+/g, ' ').trim()

const assertSession = (html: string): void => {
  if (html.includes(LOGIN_FORM_TEXT)) {
    throw new CsiSessionError('CSI 로그인 세션이 만료되었습니다. 다시 로그인해주세요.')
  }
}

const postForm = async (url: string, cookie: string, params: Record<string, string>): Promise<string> => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': FORM_CONTENT_TYPE, Cookie: cookie },
    body: new URLSearchParams(params).toString(),
    redirect: 'manual',
    cache: 'no-store',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  // 로그인 화면으로 돌려보내는 302도 세션 만료다
  if (res.status === 302) {
    throw new CsiSessionError('CSI 로그인 세션이 만료되었습니다. 다시 로그인해주세요.')
  }
  if (!res.ok) throw new Error(`CSI 응답 HTTP ${res.status} (${url})`)
  return res.text()
}

export const parseSampleSealList = (html: string): CsiSampleSealListPage => {
  assertSession(html)
  const $ = cheerio.load(html)
  const totalMatch = html.match(TOTAL_COUNT_RE)
  const isEmptyResult = html.includes(NO_DATA_TEXT)

  if (!totalMatch && !isEmptyResult) {
    throw new CsiParseError('시료봉인 목록에서 총건수·자료없음 문구를 모두 찾지 못함 (화면 개편 의심)')
  }

  const totalCount = totalMatch ? Number(totalMatch[1].replace(/,/g, '')) : 0
  // 진짜 0건이면 반드시 '자료 없음' 문구가 함께 온다 — 문구 없는 0건은 화면이 바뀐 것이다
  if (totalCount === 0 && !isEmptyResult) {
    throw new CsiParseError('시료봉인 총 0건으로 표시됐으나 자료없음 문구가 없음 (화면 개편 의심)')
  }
  const rows: CsiSampleSealRow[] = []

  $('table.table-striped tbody tr').each((_, tr) => {
    const cells = $(tr).find('td')
    if (cells.length < 9) return
    const smpslNo = norm($(tr).find('a.goSelectLink').first().attr('data-smpslno') || '')
    if (!smpslNo) return
    // 공사명·시료봉인명은 화면에서 잘려 보이므로 td의 title 속성(전체 이름)을 우선한다
    const cellText = (index: number): string =>
      norm(cells.eq(index).attr('title') || cells.eq(index).text())
    rows.push({
      smpslNo,
      purposeNm: cellText(1),
      sealSeNm: cellText(2),
      constNm: cellText(3),
      sealNm: cellText(4),
      observerNm: cellText(5),
      sealerNm: cellText(6),
      sealYmd: cellText(7),
      sealSttsNm: cellText(8),
    })
  })

  // 총건수는 있는데 행을 하나도 못 읽었으면 진짜 0건이 아니라 파싱이 깨진 것이다
  if (totalCount > 0 && rows.length === 0 && !isEmptyResult) {
    throw new CsiParseError(
      `시료봉인 총 ${totalCount}건이라고 표시됐으나 결과 행을 하나도 파싱하지 못함 (화면 개편 의심)`
    )
  }

  return { totalCount, rows, isEmptyResult: isEmptyResult && rows.length === 0 }
}

export const parseSampleSealDetail = (html: string): CsiSampleSealDetail => {
  assertSession(html)
  const $ = cheerio.load(html)

  // 상세 화면은 <caption>으로 표를 구분하고 한 행에 <th>라벨</th><td>값</td> 쌍이 둘까지 온다
  const tables = $('table')
    .toArray()
    .map((el) => {
      const table = $(el)
      const labels = new Map<string, string>()
      table.find('tr').each((_, tr) => {
        $(tr)
          .children('th')
          .each((__, th) => {
            const label = norm($(th).text())
            const value = $(th).next('td')
            if (!label || value.length === 0 || labels.has(label)) return
            labels.set(label, norm(value.text()))
          })
      })
      return { caption: norm(table.find('caption').first().text()), table, labels }
    })

  const byLabel = (label: string) => tables.find((t) => t.labels.has(label))
  const base = byLabel('시료봉인번호')
  if (!base) {
    throw new CsiParseError('시료봉인 상세에서 기본정보 테이블(시료봉인번호)을 찾지 못함 (화면 개편 의심)')
  }
  const business = byLabel('공사명')
  const seal = byLabel('시료봉인명')
  const kind = byLabel('시험분류')

  const people: CsiSampleSealPerson[] = []
  seal?.table.find('tr').each((_, tr) => {
    const th = $(tr).children('th').first()
    const role = norm(th.text())
    if (!PERSON_ROLES.includes(role)) return
    // 소속·성명·담당업무가 '라벨 : 값' 형태의 <label> 한 줄씩으로 들어 있다
    const parts = new Map<string, string>()
    th.next('td')
      .find('label')
      .each((__, el) => {
        const text = norm($(el).text())
        const sep = text.indexOf(':')
        if (sep < 0) return
        const key = text.slice(0, sep).trim()
        if (!parts.has(key)) parts.set(key, text.slice(sep + 1).trim())
      })
    people.push({
      role,
      instNm: parts.get('소속') || '',
      name: parts.get('성명') || '',
      duty: parts.get('담당업무') || '',
    })
  })

  // 시험종목 카탈로그는 시험종별 전체 목록이라 실제 수행 종목이 아니다 — 기준(방법) 참조용으로만 쓴다
  const catalog: CsiSampleSealCatalogItem[] = []
  tables
    .find((t) => t.caption.startsWith(CATALOG_CAPTION))
    ?.table.find('tbody tr')
    .each((_, tr) => {
      const cells = $(tr).find('td')
      if (cells.length < 3) return
      const item = {
        code: norm(cells.eq(0).text()),
        itemNm: norm(cells.eq(1).text()),
        method: norm(cells.eq(2).text()),
      }
      if (item.code || item.itemNm) catalog.push(item)
    })

  // 시료 표는 caption이 같은 다른 표(기본정보·시료봉인정보)와 '시료명' 라벨로 구분한다
  const samples: CsiSampleSealSample[] = tables
    .filter((t) => t.caption.startsWith(SAMPLE_CAPTION) && t.labels.has('시료명'))
    .map((t) => ({
      sampleNm: t.labels.get('시료명') || '',
      sampleSeNm: t.labels.get('시료구분') || '',
      creatNation: t.labels.get('생산국') || '',
      makerNm: t.labels.get('제조사') || '',
      stndrd: t.labels.get('규격') || '',
      pickPlace: t.labels.get('채취장소') || '',
      pickYmd: t.labels.get('채취일') || '',
      pickQty: t.labels.get('채취량') || '',
      sampleDesc: t.labels.get('시료설명') || '',
    }))

  return {
    smpslNo: base.labels.get('시료봉인번호') || '',
    sealSttsNm: base.labels.get('시료봉인 상태') || '',
    purposeNm: base.labels.get('성과 이용 목적') || '',
    registInstNm: base.labels.get('등록기관') || '',
    sealSeNm: base.labels.get('시료봉인 구분') || '',
    constNm: business?.labels.get('공사명') || '',
    beginYmd: business?.labels.get('착공일') || '',
    endYmd: business?.labels.get('준공예정일') || '',
    ownerNm: business?.labels.get('발주자') || '',
    builderNm: business?.labels.get('시공자') || '',
    sealNm: seal?.labels.get('시료봉인명') || '',
    sealYmd: seal?.labels.get('봉인일') || '',
    people,
    testClass: kind?.labels.get('시험분류') || '',
    testKind: kind?.labels.get('시험종별') || '',
    catalog,
    samples,
  }
}

const fetchListPage = async (
  cookie: string,
  params: { constNm?: string },
  pageCount: number
): Promise<CsiSampleSealListPage> => {
  const html = await postForm(LIST_URL, cookie, {
    pageCount: String(pageCount),
    searchKey: 'cstrnNm', // 공사명 검색
    searchVal: params.constNm || '',
    onlyInst: 'N',
    sortCol: '',
    sortDesc: '',
    excelYn: '',
    startYmd: '',
    endYmd: '',
    sealSttsCd: '',
    smpslNo: '',
  })
  return parseSampleSealList(html)
}

/** 로그인 세션으로 시료봉인 목록을 페이지 상한까지 순차 조회한다. */
export const fetchSampleSeals = async (
  cookie: string,
  params: { constNm?: string }
): Promise<CsiSampleSealListResult> => {
  const startedAt = Date.now()
  const firstPage = await fetchListPage(cookie, params, 1)
  if (firstPage.isEmptyResult) {
    return { totalCount: 0, rows: [], truncated: false }
  }

  const pagesAvailable = Math.max(Math.ceil(firstPage.totalCount / ROWS_PER_PAGE), 1)
  const pagesToRead = Math.min(pagesAvailable, MAX_LIST_PAGES)
  const rows: CsiSampleSealRow[] = []
  const seen = new Set<string>()
  // 페이지 파라미터가 먹히지 않아 같은 화면이 반복돼도 같은 행이 쌓이지 않게 한다
  const addRows = (pageRows: CsiSampleSealRow[]): number => {
    let added = 0
    pageRows.forEach((row) => {
      if (seen.has(row.smpslNo)) return
      seen.add(row.smpslNo)
      rows.push(row)
      added += 1
    })
    return added
  }
  addRows(firstPage.rows)

  let stoppedEarly = false
  // CSI가 세션 단위로 페이지 상태를 들고 있어 동시 요청이 서로를 덮어쓸 수 있다 — 순차로 읽는다
  for (let page = 2; page <= pagesToRead; page += 1) {
    if (Date.now() - startedAt >= LIST_DEADLINE_MS) {
      stoppedEarly = true
      break
    }
    const next = await fetchListPage(cookie, params, page)
    // 새 행이 하나도 없으면 같은 페이지를 다시 받은 것이라 더 읽어도 얻을 것이 없다
    if (addRows(next.rows) === 0) {
      stoppedEarly = true
      break
    }
  }

  return {
    totalCount: firstPage.totalCount,
    rows,
    truncated: pagesAvailable > MAX_LIST_PAGES || stoppedEarly,
  }
}

/** 시료봉인 1건의 상세를 조회한다. */
export const fetchSampleSealDetail = async (cookie: string, smpslNo: string): Promise<CsiSampleSealDetail> => {
  const html = await postForm(VIEW_URL, cookie, {
    smpslNo,
    pageCount: '1',
    searchKey: 'cstrnNm',
    searchVal: '',
    onlyInst: 'N',
    sortCol: '',
    sortDesc: '',
    excelYn: '',
    startYmd: '',
    endYmd: '',
    sealSttsCd: '',
  })
  const detail = parseSampleSealDetail(html)
  // 세션이 다른 화면을 들고 있으면 엉뚱한 시료봉인을 그대로 프리필하게 된다
  if (detail.smpslNo && detail.smpslNo !== smpslNo) {
    throw new CsiParseError(
      `요청한 시료봉인번호와 다른 상세가 돌아옴 (요청 ${smpslNo}, 응답 ${detail.smpslNo})`
    )
  }
  return detail
}
