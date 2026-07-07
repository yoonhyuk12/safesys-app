// 조달청 나라장터 종합쇼핑몰 납품요구 목록을 수요기관명·월 단위 기간으로 조회하는 API 라우트 (지급자재 일괄 조회용)
import { NextRequest, NextResponse } from 'next/server'

const G2B_ENDPOINT =
  'https://apis.data.go.kr/1230000/at/ShoppingMallPrdctInfoService/getDlvrReqInfoList'

// 999행 × 3페이지 = 월/기관당 최대 2,997건 (실측 월 수백 건 수준이라 여유)
const MAX_PAGES = 3

export const maxDuration = 60

interface G2bRawListItem {
  dlvrReqNo?: string
  dlvrReqChgOrd?: string
  dlvrReqRcptDate?: string
  dlvrReqNm?: string
  dminsttNm?: string
  corpNm?: string
  rprsntPrdctClsfcNoNm?: string
  rprsntDtilPrdctClsfcNoNm?: string
  maxDlvrTmlmtDate?: string
}

export async function GET(request: NextRequest) {
  try {
    const inst = request.nextUrl.searchParams.get('inst')?.trim()
    const bgn = request.nextUrl.searchParams.get('bgn') || ''
    const end = request.nextUrl.searchParams.get('end') || ''
    if (!inst || inst.length < 2 || inst.length > 60) {
      return NextResponse.json(
        { success: false, error: '수요기관명을 입력해주세요.' },
        { status: 400 }
      )
    }
    // API가 1개월 초과 범위를 거부(resultCode 07)하므로 같은 달 이내만 허용
    if (!/^\d{8}$/.test(bgn) || !/^\d{8}$/.test(end) || bgn > end || bgn.slice(0, 6) !== end.slice(0, 6)) {
      return NextResponse.json(
        { success: false, error: '조회 기간은 월 단위(YYYYMMDD, 같은 달)로 지정해주세요.' },
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

    const rawItems: G2bRawListItem[] = []
    for (let pageNo = 1; pageNo <= MAX_PAGES; pageNo++) {
      const qs = new URLSearchParams({
        serviceKey: apiKey,
        pageNo: String(pageNo),
        numOfRows: '999',
        type: 'json',
        inqryDiv: '1',
        inqryBgnDate: bgn,
        inqryEndDate: end,
        dminsttNm: inst,
      })
      const res = await fetch(`${G2B_ENDPOINT}?${qs.toString()}`, {
        signal: AbortSignal.timeout(25000),
        cache: 'no-store',
      })
      if (!res.ok) {
        console.error(`조달청 납품요구 목록 API HTTP 오류: ${res.status}`)
        return NextResponse.json(
          { success: false, error: `조달청 API 호출에 실패했습니다. (HTTP ${res.status})` },
          { status: 502 }
        )
      }

      const json = await res.json()
      const header = json?.response?.header
      if (header?.resultCode !== '00') {
        const msg = header?.resultMsg || json?.['nkoneps.com.response.ResponseError']?.header?.resultMsg || '알 수 없는 응답'
        console.error('조달청 납품요구 목록 API 오류:', msg)
        return NextResponse.json(
          { success: false, error: `조달청 API 오류: ${msg}` },
          { status: 502 }
        )
      }

      const body = json?.response?.body
      const items = Array.isArray(body?.items) ? body.items : []
      rawItems.push(...items)
      const totalCount = Number(body?.totalCount) || 0
      if (rawItems.length >= totalCount || items.length === 0) break
    }

    const items = rawItems
      .filter((it) => it.dlvrReqNo)
      .map((it) => ({
        dlvrReqNo: it.dlvrReqNo || '',
        chgOrd: (it.dlvrReqChgOrd || '00').padStart(2, '0'),
        rcptDate: it.dlvrReqRcptDate || '',
        name: it.dlvrReqNm || '',
        dminsttNm: it.dminsttNm || '',
        corpNm: it.corpNm || '',
        prdctNm: it.rprsntDtilPrdctClsfcNoNm || it.rprsntPrdctClsfcNoNm || '',
        deadline: it.maxDlvrTmlmtDate || '',
      }))

    return NextResponse.json({ success: true, data: { items } })
  } catch (err: unknown) {
    console.error('조달청 납품요구 목록 조회 실패:', err)
    const isTimeout = err instanceof Error && err.name === 'TimeoutError'
    return NextResponse.json(
      {
        success: false,
        error: isTimeout
          ? '조달청 API 응답이 지연되고 있습니다. 잠시 후 다시 시도해주세요.'
          : '납품요구 목록 조회 중 오류가 발생했습니다.',
      },
      { status: 502 }
    )
  }
}
