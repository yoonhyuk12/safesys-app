// CSI(건설공사 안전관리 종합정보망) 품질검사 성적서 서비스(QTM006) 조회 API 라우트 — 실시대장 가져오기용
import { NextRequest, NextResponse } from 'next/server'
import { CsiQualityReport, CsiReportTestItem } from '@/lib/quality/csi-report-types'

// CSI 응답이 조회 범위·서버 혼잡에 따라 60초까지도 걸린다(2026-07-20 실측) — Fluid Compute 활성이라 60초 초과 허용
export const maxDuration = 120

// API 기술문서(CSI-AN22-201) 명세 경로 — [발급완료] 단계 이후 성적서만 제공, 1회 최대 100건
const CSI_ENDPOINT = 'https://api.csi.go.kr/api/service/qtm/qrptbReprtInfo'

// CSI 응답의 평탄화 행 (성적서 × 시험항목 × 결과 단위)
interface CsiRawItem {
  issueNo?: string
  issueYmd?: string
  rqstNo?: string
  labNm?: string
  companyNm?: string
  sampleNm?: string
  constNm?: string
  orntInstNm?: string
  conInstNms?: string
  reqUserNm?: string
  cmptnYmd?: string
  tsNm?: string
  teNm?: string
  itmTitle?: string
  itmRslt?: string | number
  itmUnit?: string
  testMthd?: string
  tsiStartDt?: string
  tsiEndDt?: string
}

interface CsiApiResponse {
  response?: {
    header?: { status?: number; resultCode?: string; resultMsg?: string }
    body?: { totalCount?: number; items?: CsiRawItem[] | CsiRawItem }
    errors?: Array<{ field?: string; reason?: string }>
  }
}

const str = (v: unknown): string => (v == null ? '' : String(v).trim())

// 평탄화 행을 성적서번호 기준으로 묶어 성적서 1건 = 시험항목 N건 구조로 정규화
const groupByIssueNo = (rows: CsiRawItem[]): CsiQualityReport[] => {
  const map = new Map<string, CsiQualityReport>()
  rows.forEach((row, index) => {
    const key = str(row.issueNo) || `${str(row.rqstNo)}#${index}`
    const existing = map.get(key)
    const item: CsiReportTestItem = {
      tsNm: str(row.tsNm),
      teNm: str(row.teNm),
      itmTitle: str(row.itmTitle),
      itmRslt: str(row.itmRslt),
      itmUnit: str(row.itmUnit),
      testMthd: str(row.testMthd),
      tsiStartDt: str(row.tsiStartDt),
      tsiEndDt: str(row.tsiEndDt),
    }
    if (existing) {
      existing.items.push(item)
      return
    }
    map.set(key, {
      issueNo: str(row.issueNo),
      issueYmd: str(row.issueYmd),
      rqstNo: str(row.rqstNo),
      labNm: str(row.labNm),
      companyNm: str(row.companyNm),
      sampleNm: str(row.sampleNm),
      constNm: str(row.constNm),
      orntInstNm: str(row.orntInstNm),
      conInstNms: str(row.conInstNms),
      reqUserNm: str(row.reqUserNm),
      cmptnYmd: str(row.cmptnYmd),
      items: [item],
    })
  })
  return Array.from(map.values())
}

export async function GET(request: NextRequest) {
  try {
    const apiKey = process.env.CSI_API_KEY
    if (!apiKey) {
      console.error('CSI_API_KEY 환경변수가 설정되지 않음')
      return NextResponse.json(
        { success: false, error: 'CSI API 인증키가 설정되지 않았습니다. 관리자에게 문의해주세요.' },
        { status: 500 }
      )
    }

    const st = request.nextUrl.searchParams.get('st') || ''
    const end = request.nextUrl.searchParams.get('end') || ''
    const constNm = request.nextUrl.searchParams.get('constNm')?.trim() || ''
    if (!/^\d{8}$/.test(st) || !/^\d{8}$/.test(end)) {
      return NextResponse.json(
        { success: false, error: '발급일자 시작일과 종료일을 입력해주세요.' },
        { status: 400 }
      )
    }

    const params = new URLSearchParams({
      serviceKey: apiKey,
      returnType: 'JSON',
      pageNo: '1',
      numOfRows: '100',
      schStIssueYmd: st,
      schEndIssueYmd: end,
    })
    if (constNm) params.set('schConstNm', constNm)

    const res = await fetch(`${CSI_ENDPOINT}?${params.toString()}`, {
      signal: AbortSignal.timeout(110000),
      cache: 'no-store',
    })
    const json = (await res.json()) as CsiApiResponse
    const header = json.response?.header

    // resultCode 22(status 204) = 조건에 맞는 성적서 없음 — 오류가 아니라 정상적인 빈 결과다
    if (header?.resultCode === '22') {
      return NextResponse.json({
        success: true,
        data: { totalCount: 0, fetchedRowCount: 0, reports: [] },
      })
    }

    if (header?.resultCode !== '00') {
      const reason = json.response?.errors?.[0]?.reason
      console.error('CSI 성적서 조회 실패:', header?.resultCode, header?.resultMsg, reason)
      return NextResponse.json(
        { success: false, error: `CSI 조회 실패: ${reason || header?.resultMsg || `HTTP ${res.status}`}` },
        { status: 502 }
      )
    }

    const body = json.response?.body
    const rawItems = Array.isArray(body?.items) ? body.items : body?.items ? [body.items] : []
    return NextResponse.json({
      success: true,
      data: {
        totalCount: body?.totalCount ?? rawItems.length,
        fetchedRowCount: rawItems.length,
        reports: groupByIssueNo(rawItems),
      },
    })
  } catch (err: unknown) {
    console.error('CSI 성적서 조회 오류:', err)
    const isTimeout = err instanceof Error && err.name === 'TimeoutError'
    return NextResponse.json(
      {
        success: false,
        error: isTimeout
          ? 'CSI 응답이 지연되고 있습니다. 잠시 후 다시 시도해주세요.'
          : 'CSI 성적서 조회 중 오류가 발생했습니다.',
      },
      { status: 502 }
    )
  }
}
