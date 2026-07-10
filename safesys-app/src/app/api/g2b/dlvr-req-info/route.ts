// 납품요구번호로 건명·계약업체·수요기관·접수일 요약을 조회하는 API 라우트 (계약현황 물품 행 표시용 — 상세 품목 조회 없이 목록 API 1회)
import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

const DLVR_LIST_ENDPOINT =
  'https://apis.data.go.kr/1230000/at/ShoppingMallPrdctInfoService/getDlvrReqInfoList'

interface G2bRawListItem {
  dlvrReqNo?: string
  dlvrReqChgOrd?: string
  dlvrReqRcptDate?: string
  dlvrReqNm?: string
  dminsttNm?: string
  corpNm?: string
  maxDlvrTmlmtDate?: string
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

    const qs = new URLSearchParams({
      serviceKey: apiKey,
      pageNo: '1',
      numOfRows: '99',
      type: 'json',
      inqryDiv: '2',
      dlvrReqNo: no,
    })
    const res = await fetch(`${DLVR_LIST_ENDPOINT}?${qs.toString()}`, {
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
      const msg = header?.resultMsg || '알 수 없는 응답'
      console.error('조달청 납품요구 목록 API 오류:', msg)
      return NextResponse.json(
        { success: false, error: `조달청 API 오류: ${msg}` },
        { status: 502 }
      )
    }

    const items: G2bRawListItem[] = Array.isArray(json?.response?.body?.items)
      ? json.response.body.items
      : []
    // 최신 변경차수 행 기준 — 변경(증감) 반영된 건명·기한을 사용
    const latest = items
      .filter((it) => it.dlvrReqNo)
      .sort((a, b) => (parseInt(b.dlvrReqChgOrd || '') || 0) - (parseInt(a.dlvrReqChgOrd || '') || 0))[0]
    if (!latest) {
      return NextResponse.json(
        { success: false, error: '해당 납품요구번호로 조회된 내역이 없습니다.' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        dlvrReqNo: no,
        title: latest.dlvrReqNm || '',
        corpNm: latest.corpNm || '',
        dminsttNm: latest.dminsttNm || '',
        rcptDate: latest.dlvrReqRcptDate || '',
        deadline: latest.maxDlvrTmlmtDate || '',
      },
    })
  } catch (err: unknown) {
    console.error('납품요구 요약 조회 실패:', err)
    const isTimeout = err instanceof Error && err.name === 'TimeoutError'
    return NextResponse.json(
      {
        success: false,
        error: isTimeout
          ? '조달청 API 응답이 지연되고 있습니다. 잠시 후 다시 시도해주세요.'
          : '납품요구 요약 조회 중 오류가 발생했습니다.',
      },
      { status: 502 }
    )
  }
}
