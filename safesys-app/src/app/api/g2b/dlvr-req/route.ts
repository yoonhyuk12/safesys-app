// 조달청 나라장터 종합쇼핑몰 납품요구 상세를 조회해 자재 수불부 자동입력용으로 정규화하는 API 라우트
import { NextRequest, NextResponse } from 'next/server'

const G2B_ENDPOINT =
  'https://apis.data.go.kr/1230000/at/ShoppingMallPrdctInfoService/getDlvrReqDtlInfoList'

interface G2bRawItem {
  dlvrReqNo: string
  dlvrReqChgOrd: string
  dlvrReqNm: string
  prdctSno: string
  dtilPrdctClsfcNoNm: string
  prdctClsfcNoNm: string
  prdctIdntNoNm: string
  prdctUprc: string
  prdctUnit: string
  incdecQty: string
  dlvrTmlmtDate: string
  dminsttNm: string
  corpNm: string
}

export async function GET(request: NextRequest) {
  try {
    // 서류에는 "번호-차수"(예: R26TB01458287-00)로 표기되므로 끝의 차수 접미어는 떼고 조회
    const no = request.nextUrl.searchParams
      .get('no')?.trim().toUpperCase().replace(/-\d{1,2}$/, '')
    if (!no || !/^[A-Z0-9-]{5,30}$/.test(no)) {
      return NextResponse.json(
        { success: false, error: '올바른 납품요구번호를 입력해주세요. (예: R25TB00824197)' },
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

    // 품목×변경차수 행이 300을 넘는 대형 건도 전체 이력을 받도록 페이지 순회 (최대 10페이지=3,000행)
    const rawItems: G2bRawItem[] = []
    for (let pageNo = 1; pageNo <= 10; pageNo++) {
      const qs = new URLSearchParams({
        serviceKey: apiKey,
        pageNo: String(pageNo),
        numOfRows: '300',
        type: 'json',
        inqryDiv: '2',
        dlvrReqNo: no,
      })

      const res = await fetch(`${G2B_ENDPOINT}?${qs.toString()}`, {
        signal: AbortSignal.timeout(15000),
        cache: 'no-store',
      })
      if (!res.ok) {
        console.error(`조달청 API HTTP 오류: ${res.status}`)
        return NextResponse.json(
          { success: false, error: `조달청 API 호출에 실패했습니다. (HTTP ${res.status})` },
          { status: 502 }
        )
      }

      const json = await res.json()
      const header = json?.response?.header
      if (header?.resultCode !== '00') {
        console.error('조달청 API 오류 응답:', header)
        return NextResponse.json(
          { success: false, error: `조달청 API 오류: ${header?.resultMsg || '알 수 없는 응답'}` },
          { status: 502 }
        )
      }

      const body = json?.response?.body
      const pageItems: G2bRawItem[] = Array.isArray(body?.items) ? body.items : []
      rawItems.push(...pageItems)
      const totalCount = parseInt(body?.totalCount) || 0
      if (rawItems.length >= totalCount || pageItems.length === 0) break
    }
    if (rawItems.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            '해당 납품요구번호로 조회된 내역이 없습니다. 전일까지 결재된 건만 조회되므로 오늘 결재된 건은 내일 조회해주세요.',
        },
        { status: 404 }
      )
    }

    // 품목(prdctSno)별 변경차수 증감(incdecQty)을 합산해 유효 수량 계산, 메타는 최신 차수 기준
    const bySno = new Map<string, { latest: G2bRawItem; qty: number }>()
    for (const it of rawItems) {
      const sno = String(it.prdctSno)
      const inc = parseFloat(it.incdecQty) || 0
      const cur = bySno.get(sno)
      if (!cur) {
        bySno.set(sno, { latest: it, qty: inc })
      } else {
        cur.qty += inc
        if ((parseInt(it.dlvrReqChgOrd) || 0) >= (parseInt(cur.latest.dlvrReqChgOrd) || 0)) {
          cur.latest = it
        }
      }
    }

    const first = rawItems[0]
    const items = [...bySno.values()]
      .map(({ latest, qty }) => ({
        sno: parseInt(latest.prdctSno) || 0,
        name: latest.dtilPrdctClsfcNoNm || latest.prdctClsfcNoNm || '',
        spec: latest.prdctIdntNoNm || '',
        unit: latest.prdctUnit || '',
        unitPrice: parseFloat(latest.prdctUprc) || 0,
        qty: Math.round(qty * 1000) / 1000,
        deadline: latest.dlvrTmlmtDate || '',
      }))
      .sort((a, b) => a.sno - b.sno)

    return NextResponse.json({
      success: true,
      data: {
        dlvrReqNo: no,
        title: first.dlvrReqNm || '',
        demandOrg: first.dminsttNm || '',
        supplier: first.corpNm || '',
        items,
      },
    })
  } catch (err: unknown) {
    console.error('납품요구 조회 실패:', err)
    const isTimeout = err instanceof Error && err.name === 'TimeoutError'
    return NextResponse.json(
      {
        success: false,
        error: isTimeout
          ? '조달청 API 응답이 지연되고 있습니다. 잠시 후 다시 시도해주세요.'
          : '납품요구 조회 중 오류가 발생했습니다.',
      },
      { status: 502 }
    )
  }
}
