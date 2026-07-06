// 조달청 나라장터 공사·용역 계약현황을 계약번호·공고번호로 조회해 프로젝트 자동입력용으로 정규화하는 API 라우트
import { NextRequest, NextResponse } from 'next/server'

const G2B_BASE = 'https://apis.data.go.kr/1230000/ao/CntrctInfoService'

// 업무구분별 오퍼레이션 — 공사를 먼저, 없으면 용역 조회
const G2B_OPS = [
  { op: 'getCntrctInfoListCnstwkPPSSrch', div: '공사' },
  { op: 'getCntrctInfoListServcPPSSrch', div: '용역' },
] as const

// 공사는 cnstwkNm/cbgnDate/ttalCcmpltDate, 용역은 cntrctNm/wbgnDate/ttalScmpltDate 필드 사용
interface G2bRawContract {
  cnstwkNm?: string
  cntrctNm?: string
  bsnsDivNm?: string
  dcsnCntrctNo?: string
  ntceNo?: string
  untyCntrctNo?: string
  totCntrctAmt?: string
  thtmCntrctAmt?: string
  cntrctPrd?: string
  cntrctCnclsDate?: string
  cbgnDate?: string
  wbgnDate?: string
  ttalCcmpltDate?: string
  ttalScmpltDate?: string
  cntrctInsttNm?: string
  dminsttList?: string
  corpList?: string
  cntrctInfoUrl?: string
}

// corpList/dminsttList는 '[a^b^c^...]' 형태의 캐럿 구분 문자열 (2026-07-06 실호출 확인)
// 각 대괄호 그룹에서 지정 위치의 이름 필드만 추출
function parseCaretList(value: string | undefined, nameIndex: number): string[] {
  if (!value) return []
  const groups = value.match(/\[([^\]]*)\]/g) || []
  const names = groups
    .map((g) => (g.slice(1, -1).split('^')[nameIndex] || '').trim())
    .filter(Boolean)
  return [...new Set(names)]
}

// corpList: [순번^역할^구분^업체명^대표자^...] — 업체명은 index 3
const parseCorpNames = (v?: string) => parseCaretList(v, 3)
// dminsttList: [순번^기관코드^기관명^기관구분^...] — 기관명은 index 2
const parseDminsttNames = (v?: string) => parseCaretList(v, 2)

// 'YYYYMMDD' 또는 'YYYY-MM-DD hh:mm' → 'YYYY-MM-DD'
function toIsoDate(value?: string): string {
  if (!value) return ''
  const digits = value.replace(/[^0-9]/g, '').slice(0, 8)
  if (digits.length !== 8) return ''
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
}

// inqryDiv: 2=확정계약번호 조회, 4=공고번호 조회 (2026-07-06 실호출 확인)
async function fetchContracts(
  apiKey: string,
  op: string,
  numberParam: 'dcsnCntrctNo' | 'ntceNo',
  no: string
): Promise<{ items: G2bRawContract[]; errorMsg?: string }> {
  const qs = new URLSearchParams({
    serviceKey: apiKey,
    pageNo: '1',
    numOfRows: '50',
    type: 'json',
    inqryDiv: numberParam === 'dcsnCntrctNo' ? '2' : '4',
    [numberParam]: no,
  })
  const res = await fetch(`${G2B_BASE}/${op}?${qs.toString()}`, {
    signal: AbortSignal.timeout(15000),
    cache: 'no-store',
  })
  if (!res.ok) return { items: [], errorMsg: `HTTP ${res.status}` }

  const json = await res.json()
  const header = json?.response?.header
  if (header?.resultCode !== '00') {
    return { items: [], errorMsg: header?.resultMsg || '알 수 없는 응답' }
  }
  const items = json?.response?.body?.items
  return { items: Array.isArray(items) ? items : [] }
}

export async function GET(request: NextRequest) {
  try {
    // 공백은 전부 제거 — "20231019521 - 000"처럼 붙여넣기에 공백이 섞이는 경우 허용
    const no = request.nextUrl.searchParams.get('no')?.replace(/\s+/g, '').toUpperCase()
    if (!no || !/^[A-Z0-9-]{5,30}$/.test(no)) {
      return NextResponse.json(
        { success: false, error: '올바른 계약번호 또는 공고번호를 입력해주세요.' },
        { status: 400 }
      )
    }

    const apiKey = process.env.DATA_GO_KR_API_KEY
    if (!apiKey) {
      console.error('DATA_GO_KR_API_KEY 환경변수가 설정되지 않음')
      return NextResponse.json(
        { success: false, error: '조달청 API 키가 설정되지 않았습니다.' },
        { status: 500 }
      )
    }

    // 조회 시도 순서: 확정계약번호 → 공고번호(입력 그대로) → 구형 공고번호 정규화
    const attempts: { param: 'dcsnCntrctNo' | 'ntceNo'; value: string; matchedBy: 'cntrct' | 'ntce' }[] = [
      { param: 'dcsnCntrctNo', value: no, matchedBy: 'cntrct' },
      { param: 'ntceNo', value: no, matchedBy: 'ntce' },
    ]
    // 구 나라장터 공고번호(숫자 11자리 [-차수])는 '번호+차수2자리'로 저장됨 (2026-07-06 실호출 확인)
    // 예: 입력 "20221008901-000" → 저장값 "2022100890100"
    const legacy = no.match(/^(\d{11})(?:-(\d{1,3}))?$/)
    if (legacy) {
      const ord = String(Number(legacy[2] || '0')).padStart(2, '0')
      attempts.push({ param: 'ntceNo', value: `${legacy[1]}${ord}`, matchedBy: 'ntce' })
    }

    let matchedBy: 'cntrct' | 'ntce' = 'cntrct'
    let matchedDiv = ''
    let result: { items: G2bRawContract[]; errorMsg?: string } = { items: [] }
    outer: for (const attempt of attempts) {
      for (const g2bOp of G2B_OPS) {
        result = await fetchContracts(apiKey, g2bOp.op, attempt.param, attempt.value)
        if (result.errorMsg) break outer
        if (result.items.length > 0) {
          matchedBy = attempt.matchedBy
          matchedDiv = g2bOp.div
          break outer
        }
      }
    }

    if (result.errorMsg) {
      console.error('조달청 계약정보 API 오류:', result.errorMsg)
      return NextResponse.json(
        { success: false, error: `조달청 API 오류: ${result.errorMsg}` },
        { status: 502 }
      )
    }
    if (result.items.length === 0) {
      return NextResponse.json(
        { success: false, error: '해당 번호로 조회된 공사·용역 계약이 없습니다. 번호를 확인해주세요.' },
        { status: 404 }
      )
    }

    const mapped = result.items.map((it) => ({
      cnstwkNm: it.cnstwkNm || it.cntrctNm || '',
      bsnsDivNm: it.bsnsDivNm || matchedDiv,
      cntrctNo: it.dcsnCntrctNo || '',
      ntceNo: it.ntceNo || '',
      untyCntrctNo: it.untyCntrctNo || '',
      totCntrctAmt: parseFloat(it.totCntrctAmt || '') || 0,
      cntrctPrd: it.cntrctPrd || '',
      cntrctCnclsDate: toIsoDate(it.cntrctCnclsDate),
      startDate: toIsoDate(it.cbgnDate || it.wbgnDate),
      endDate: toIsoDate(it.ttalCcmpltDate || it.ttalScmpltDate),
      cntrctInsttNm: it.cntrctInsttNm || '',
      dminsttNms: parseDminsttNames(it.dminsttList),
      corpNms: parseCorpNames(it.corpList),
      cntrctInfoUrl: it.cntrctInfoUrl || '',
    }))

    // 표시 필드가 전부 같은 행은 중복 등록 건이므로 제거 (untyCntrctNo만 다른 경우)
    const seen = new Set<string>()
    const contracts = mapped.filter((c) => {
      const key = [c.cntrctNo, c.ntceNo, c.cnstwkNm, c.totCntrctAmt, c.startDate, c.endDate].join('|')
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    return NextResponse.json({ success: true, data: { matchedBy, contracts } })
  } catch (err: unknown) {
    console.error('나라장터 계약 조회 실패:', err)
    const isTimeout = err instanceof Error && err.name === 'TimeoutError'
    return NextResponse.json(
      {
        success: false,
        error: isTimeout
          ? '조달청 API 응답이 지연되고 있습니다. 잠시 후 다시 시도해주세요.'
          : '계약정보 조회 중 오류가 발생했습니다.',
      },
      { status: 502 }
    )
  }
}
