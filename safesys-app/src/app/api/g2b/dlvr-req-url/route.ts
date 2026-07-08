// 납품요구번호로 연계 단가계약의 조달청 계약 상세 딥링크를 해석하는 API 라우트 (자재 수불부 자재명 링크용)
import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

// 납품요구 API는 URL을 반환하지 않는다 — 응답의 계약번호·차수로 물품 계약현황 API를 조회해
// 공식 딥링크(cntrctDtlInfoUrl)를 얻는다. URL의 ctrtNo 접미어(_1 등) 규칙을 알 수 없어 자체 조합은 불가.
const DLVR_LIST_ENDPOINT =
  'https://apis.data.go.kr/1230000/at/ShoppingMallPrdctInfoService/getDlvrReqInfoList'
const CNTRCT_ENDPOINT =
  'https://apis.data.go.kr/1230000/ao/CntrctInfoService/getCntrctInfoListThngPPSSrch'

// g2b.go.kr 홈만 가리키는 URL은 계약 상세가 아니므로 무효 처리 (계약현황 서류철과 동일 기준)
const isDetailUrl = (u: string | undefined): u is string =>
  !!u && !/^https?:\/\/(www\.)?g2b\.go\.kr\/?$/.test(u)

async function fetchG2bItems(url: string): Promise<{ items: Record<string, string>[]; errorMsg?: string }> {
  const res = await fetch(url, { signal: AbortSignal.timeout(25000), cache: 'no-store' })
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
    // 서류 표기("번호-차수")·공백 섞임 허용 — dlvr-req 라우트와 동일 정규화
    const no = request.nextUrl.searchParams
      .get('no')?.replace(/\s+/g, '').toUpperCase().replace(/-\d{1,3}$/, '')
    if (!no || !/^[A-Z0-9]{5,30}$/.test(no)) {
      return NextResponse.json(
        { success: false, error: '올바른 납품요구번호를 입력해주세요.' },
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

    // ① 납품요구 목록 조회(번호 지정) — 최신 차수 행의 계약번호·계약차수 획득
    const dlvrQs = new URLSearchParams({
      serviceKey: apiKey,
      pageNo: '1',
      numOfRows: '99',
      type: 'json',
      inqryDiv: '2',
      dlvrReqNo: no,
    })
    const dlvr = await fetchG2bItems(`${DLVR_LIST_ENDPOINT}?${dlvrQs.toString()}`)
    if (dlvr.errorMsg) {
      return NextResponse.json(
        { success: false, error: `조달청 API 오류: ${dlvr.errorMsg}` },
        { status: 502 }
      )
    }
    const latest = dlvr.items
      .filter((it) => it.cntrctNo)
      .sort((a, b) => (parseInt(b.dlvrReqChgOrd) || 0) - (parseInt(a.dlvrReqChgOrd) || 0))[0]
    if (!latest) {
      return NextResponse.json(
        { success: false, error: '해당 납품요구의 연계 계약 정보를 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    // ② 물품 계약현황 조회 — 확정계약번호(계약번호+차수2자리)로 딥링크 획득.
    //    납품요구가 기억하는 계약차수가 폐기된 경우를 대비해 원차수(00)로 1회 더 시도한다
    const chgOrd = String(parseInt(latest.cntrctChgOrd) || 0).padStart(2, '0')
    const dcsnNos = [...new Set([`${latest.cntrctNo}${chgOrd}`, `${latest.cntrctNo}00`])]
    for (const dcsnNo of dcsnNos) {
      const qs = new URLSearchParams({
        serviceKey: apiKey,
        pageNo: '1',
        numOfRows: '5',
        type: 'json',
        inqryDiv: '2',
        dcsnCntrctNo: dcsnNo,
      })
      const cntrct = await fetchG2bItems(`${CNTRCT_ENDPOINT}?${qs.toString()}`)
      const url = cntrct.items
        .map((it) => (isDetailUrl(it.cntrctDtlInfoUrl) ? it.cntrctDtlInfoUrl : it.cntrctInfoUrl))
        .find(isDetailUrl)
      if (url) {
        return NextResponse.json({ success: true, data: { url } })
      }
    }

    return NextResponse.json(
      { success: false, error: '조달청 계약 상세 페이지 주소를 찾을 수 없습니다.' },
      { status: 404 }
    )
  } catch (err: unknown) {
    console.error('납품요구 계약 링크 해석 실패:', err)
    const isTimeout = err instanceof Error && err.name === 'TimeoutError'
    return NextResponse.json(
      {
        success: false,
        error: isTimeout
          ? '조달청 API 응답이 지연되고 있습니다. 잠시 후 다시 시도해주세요.'
          : '조달청 계약 링크 조회 중 오류가 발생했습니다.',
      },
      { status: 502 }
    )
  }
}
