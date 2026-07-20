// CSI 품질검사 성적서를 공개 웹 화면(gcloud.csi.go.kr)에서 스크래핑해 정규화 타입으로 변환하는 모듈
import * as cheerio from 'cheerio'
import { CsiQualityReport, CsiReportTestItem } from './csi-report-types'

// 성적서 목록 조회 화면 (로그인·인증키 불필요, POST form-urlencoded)
const LIST_URL = 'https://gcloud.csi.go.kr/cmq/qti/qltRptReadng/qltRptReadngList.do'
// 성적서 본문(개요 + 시험·검사 실시 내역) ajax — 중간 단계 View 화면 없이 바로 호출 가능
const VIEW_URL = 'https://gcloud.csi.go.kr/cmq/qtc/qltRptRslt/qltRptViewAjax.do'

// 정부 사이트 부하 제한 — 목록은 최대 3페이지, 상세는 최대 20건, 동시 4건까지만
const MAX_LIST_PAGES = 3
const ROWS_PER_PAGE = 10
const MAX_DETAIL_FETCH = 20
const DETAIL_CONCURRENCY = 4
const REQUEST_TIMEOUT_MS = 20000

// 페이지가 <meta charset="euc-kr">로 선언돼 있지만 실제 응답 본문·요청 파라미터는 모두 UTF-8이다.
// EUC-KR로 디코딩하거나 EUC-KR로 인코딩해 보내면 각각 본문이 깨지고 검색이 0건이 된다 — fetch 기본 UTF-8 처리를 그대로 쓴다.
const FORM_CONTENT_TYPE = 'application/x-www-form-urlencoded; charset=UTF-8'

const NO_DATA_TEXT = '등록된 자료가 없습니다'
const TOTAL_COUNT_RE = /총\s*([\d,]+)\s*개/
const DATE_RE = /\d{4}-\d{2}-\d{2}/g
// 의뢰번호는 별도 필드가 없고 본문 스크립트의 ajax 파라미터에만 있다 — 실패해도 빈 값으로 넘어간다
const RQST_NO_RE = /rqltNo:\s*'([^']*)'/

export interface CsiScrapeParams {
  startYmd: string // yyyy-mm-dd (공식 API의 yyyymmdd와 다르다)
  endYmd: string // yyyy-mm-dd
  constNm?: string // 공사명 부분일치
}

export interface CsiScrapeResult {
  totalCount: number // CSI가 집계한 전체 성적서 수
  fetchedRowCount: number // 이번 조회로 목록에서 읽어온 행 수
  reports: CsiQualityReport[]
  truncated: boolean // 페이지·상세 호출 상한 때문에 잘렸는지
}

// 목록 1행 — 상세 조회 키(scrptNo)와 목록에서만 얻을 수 있는 필드
interface CsiListRow {
  scrptNo: string
  issueNo: string
  labNm: string
  constNm: string
  issueYmd: string
}

interface CsiListPage {
  totalCount: number
  rows: CsiListRow[]
  isEmptyResult: boolean // 진짜 0건 (파싱 실패와 구분)
}

// 성적서 본문에서 얻는 필드 (목록에 없는 값들)
interface CsiDetail {
  rqstNo: string
  sampleNm: string
  orntInstNm: string
  conInstNms: string
  reqUserNm: string
  cmptnYmd: string
  items: CsiReportTestItem[]
}

// CSI 화면 개편으로 마크업이 바뀌면 조용히 0건이 되는 게 최대 리스크라 파싱 실패는 별도 오류로 구분한다
class CsiParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CsiParseError'
  }
}

const norm = (value: string): string => value.replace(/\s+/g, ' ').trim()

const postForm = async (url: string, params: Record<string, string>): Promise<string> => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': FORM_CONTENT_TYPE },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`CSI 응답 HTTP ${res.status} (${url})`)
  return res.text()
}

const parseListPage = (html: string): CsiListPage => {
  const $ = cheerio.load(html)
  const totalMatch = html.match(TOTAL_COUNT_RE)
  const isEmptyResult = html.includes(NO_DATA_TEXT)

  // 총건수 문구도 없고 '자료 없음' 문구도 없으면 우리가 아는 화면이 아니다
  if (!totalMatch && !isEmptyResult) {
    throw new CsiParseError('목록 화면에서 총건수·자료없음 문구를 모두 찾지 못함 (화면 개편 의심)')
  }

  const totalCount = totalMatch ? Number(totalMatch[1].replace(/,/g, '')) : 0
  const rows: CsiListRow[] = []

  // 검색폼 테이블과 구분하기 위해 결과 테이블(table-striped)만 대상으로 한다
  $('table.table-striped tbody tr').each((_, tr) => {
    const cells = $(tr).find('td')
    if (cells.length < 5) return
    const scrptNo = norm($(tr).find('a.goSelectLink').first().attr('data-scrptno') || '')
    if (!scrptNo) return
    rows.push({
      scrptNo,
      issueNo: norm(cells.eq(1).text()),
      labNm: norm(cells.eq(2).text()),
      constNm: norm(cells.eq(3).text()),
      issueYmd: norm(cells.eq(4).text()),
    })
  })

  // 총건수는 있는데 행을 하나도 못 읽었으면 진짜 0건이 아니라 파싱이 깨진 것이다
  if (totalCount > 0 && rows.length === 0 && !isEmptyResult) {
    throw new CsiParseError(`총 ${totalCount}건이라고 표시됐으나 결과 행을 하나도 파싱하지 못함 (화면 개편 의심)`)
  }

  return { totalCount, rows, isEmptyResult: isEmptyResult && rows.length === 0 }
}

// '· 최대건조밀도(A-b) : 1.839 (단위: g/㎤ )' 형태의 결과 불릿 1개를 항목명·값·단위로 분해
const parseResultLabel = (raw: string): Pick<CsiReportTestItem, 'itmTitle' | 'itmRslt' | 'itmUnit'> => {
  const text = norm(raw).replace(/^[·ㆍ•]\s*/, '')
  const unitMatch = text.match(/\(단위\s*:\s*([^)]*)\)\s*$/)
  const itmUnit = unitMatch ? norm(unitMatch[1]) : ''
  const rest = text.replace(/\(단위\s*:\s*[^)]*\)\s*$/, '').trim()
  const sep = rest.indexOf(':')
  if (sep < 0) return { itmTitle: rest, itmRslt: '', itmUnit }
  return { itmTitle: rest.slice(0, sep).trim(), itmRslt: rest.slice(sep + 1).trim(), itmUnit }
}

const parseDetail = (html: string): CsiDetail => {
  const $ = cheerio.load(html)

  // 개요·시험완료일 테이블은 <tr><th>라벨</th><td>값</td></tr> 구조 — 라벨로 찾는다 (컬럼 순서에 의존하지 않음)
  const labeled = new Map<string, string>()
  $('table.table-bordered').not('.table-striped').find('tbody > tr').each((_, tr) => {
    const th = $(tr).children('th').first()
    const td = $(tr).children('td').first()
    if (!th.length || !td.length) return
    labeled.set(norm(th.text()), norm(td.text()))
  })

  if (labeled.size === 0) {
    throw new CsiParseError('성적서 본문에서 개요 테이블(라벨-값)을 하나도 찾지 못함 (화면 개편 의심)')
  }

  const items: CsiReportTestItem[] = []
  // 시험·검사 실시 테이블은 성적서 본문에서 유일한 table-striped다.
  // 한 종목이 종목/방법/결과/비고 4행에 걸쳐 있어 라벨을 따라가며 누적한다.
  let teNm = ''
  let testMthd = ''
  let tsiStartDt = ''
  let tsiEndDt = ''
  let pending = false

  const flush = (results: Array<ReturnType<typeof parseResultLabel>>) => {
    if (!pending) return
    // 결과 불릿 1개당 항목 1개로 펼친다 (공식 API도 평탄화 구조였다). 결과가 없으면 종목·방법만 담은 1건을 남긴다.
    const base = { tsNm: '', teNm, testMthd, tsiStartDt, tsiEndDt }
    if (results.length === 0) {
      items.push({ ...base, itmTitle: '', itmRslt: '', itmUnit: '' })
    } else {
      results.forEach((r) => items.push({ ...base, ...r }))
    }
    pending = false
  }

  let currentResults: Array<ReturnType<typeof parseResultLabel>> = []

  $('table.table-striped tbody > tr').each((_, tr) => {
    const label = norm($(tr).children('th').first().text())
    const valueTd = $(tr).children('td').last()

    if (label === '종목') {
      flush(currentResults)
      currentResults = []
      // 종목 행에는 연번·종목명·책임기술인·시험검사자·일정 셀이 함께 있다.
      // 마지막 컬럼(책임 기술인 서명)이 조건부라 인덱스 대신 종목명은 th 바로 다음 td에서 읽는다.
      teNm = norm($(tr).children('th').first().next('td').text())
      testMthd = ''
      tsiStartDt = ''
      tsiEndDt = ''
      // 시험·검사 일정 셀은 날짜를 담은 유일한 셀이다 — 컬럼 위치에 의존하지 않도록 내용으로 찾는다
      $(tr).children('td').each((__, td) => {
        if (tsiStartDt) return
        const dates = norm($(td).text()).match(DATE_RE)
        if (!dates || dates.length === 0) return
        tsiStartDt = dates[0]
        tsiEndDt = dates[dates.length - 1]
      })
      pending = true
      return
    }
    if (!pending) return
    if (label === '방법') {
      testMthd = norm(valueTd.text())
      return
    }
    if (label === '결과') {
      valueTd.find('label').each((__, el) => {
        const parsed = parseResultLabel($(el).text())
        if (parsed.itmTitle || parsed.itmRslt) currentResults.push(parsed)
      })
    }
  })
  flush(currentResults)

  const rqstMatch = html.match(RQST_NO_RE)

  return {
    rqstNo: rqstMatch ? norm(rqstMatch[1]) : '',
    sampleNm: labeled.get('시료명(생산국)') || '',
    orntInstNm: labeled.get('발주자') || '',
    conInstNms: labeled.get('시공자') || '',
    reqUserNm: labeled.get('의뢰인') || '',
    cmptnYmd: labeled.get('시험완료일') || '',
    items,
  }
}

const fetchListPage = async (params: CsiScrapeParams, pageCount: number): Promise<CsiListPage> => {
  const html = await postForm(LIST_URL, {
    actionId: 'qltRptReadng',
    isSearch: 'Y',
    ymdKey: 'issuDt', // 발급일자 기준 조회
    startYmd: params.startYmd,
    endYmd: params.endYmd,
    searchKey: 'cstrnNm', // 공사명 검색
    searchVal: params.constNm || '',
    pageCount: String(pageCount),
    sortSeq: '',
    sortDesc: '',
    excelYn: '',
    scrptNo: '',
    searchProcStatus: '',
  })
  return parseListPage(html)
}

const fetchDetail = async (scrptNo: string): Promise<CsiDetail> => {
  const html = await postForm(VIEW_URL, { scrptNo, actionId: 'qltRptReadng' })
  return parseDetail(html)
}

// 상세 조회를 동시 DETAIL_CONCURRENCY건으로 제한해 순회한다. 개별 실패는 목록 정보만 남기고 넘어간다.
const fetchDetails = async (rows: CsiListRow[]): Promise<Array<CsiDetail | null>> => {
  const details: Array<CsiDetail | null> = new Array(rows.length).fill(null)
  let cursor = 0
  const worker = async (): Promise<void> => {
    while (cursor < rows.length) {
      const index = cursor
      cursor += 1
      try {
        details[index] = await fetchDetail(rows[index].scrptNo)
      } catch (err: unknown) {
        const isParse = err instanceof CsiParseError
        console.error(
          `CSI 성적서 본문 ${isParse ? '파싱 실패' : '조회 실패'} (scrptNo=${rows[index].scrptNo}, issueNo=${rows[index].issueNo}):`,
          err instanceof Error ? err.message : err
        )
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(DETAIL_CONCURRENCY, rows.length) }, worker))
  return details
}

export const scrapeCsiQualityReports = async (params: CsiScrapeParams): Promise<CsiScrapeResult> => {
  const firstPage = await fetchListPage(params, 1)

  if (firstPage.isEmptyResult) {
    console.info(`CSI 성적서 스크래핑: 조건에 맞는 성적서 없음 (${params.startYmd}~${params.endYmd}, 공사명="${params.constNm || ''}")`)
    return { totalCount: 0, fetchedRowCount: 0, reports: [], truncated: false }
  }

  const pagesAvailable = Math.ceil(firstPage.totalCount / ROWS_PER_PAGE)
  const pagesToRead = Math.min(pagesAvailable, MAX_LIST_PAGES)
  const restPages = await Promise.all(
    Array.from({ length: Math.max(pagesToRead - 1, 0) }, (_, i) => fetchListPage(params, i + 2))
  )

  const allRows = [firstPage.rows, ...restPages.map((p) => p.rows)].flat()
  const rows = allRows.slice(0, MAX_DETAIL_FETCH)
  const truncated = pagesAvailable > MAX_LIST_PAGES || allRows.length > MAX_DETAIL_FETCH

  const details = await fetchDetails(rows)
  const reports: CsiQualityReport[] = rows.map((row, i) => {
    const detail = details[i]
    return {
      issueNo: row.issueNo,
      issueYmd: row.issueYmd,
      rqstNo: detail?.rqstNo || '',
      labNm: row.labNm,
      // CSI 본문에 '품질검사 대행기관' 별도 필드가 없다 — 목록의 시험실명이 곧 대행기관명이라 labNm으로 채운다
      companyNm: row.labNm,
      sampleNm: detail?.sampleNm || '',
      constNm: row.constNm,
      orntInstNm: detail?.orntInstNm || '',
      conInstNms: detail?.conInstNms || '',
      reqUserNm: detail?.reqUserNm || '',
      cmptnYmd: detail?.cmptnYmd || '',
      items: detail?.items || [],
    }
  })

  return { totalCount: firstPage.totalCount, fetchedRowCount: rows.length, reports, truncated }
}
