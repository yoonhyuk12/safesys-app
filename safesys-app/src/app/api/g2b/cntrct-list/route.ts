// 조달청 나라장터 계약현황(공사·용역) 목록을 기관명·월 단위 기간으로 조회하는 API 라우트 (계약 현황 서류철용)
import { NextRequest, NextResponse } from 'next/server'

const G2B_BASE = 'https://apis.data.go.kr/1230000/ao/CntrctInfoService'

// 공사/용역별 오퍼레이션 — 일자 조회는 inqryDiv=1 + inqryBgnDate/inqryEndDate (2026-07-07 실호출 확인)
const OPS = {
  cnstwk: { op: 'getCntrctInfoListCnstwkPPSSrch', type: '공사' },
  servc: { op: 'getCntrctInfoListServcPPSSrch', type: '용역' },
} as const

// 999행 × 3페이지 = 월/기관당 최대 2,997건 (농어촌공사 전체로도 월 1,400건 수준이라 여유)
const MAX_PAGES = 3

export const maxDuration = 60

interface G2bRawContractRow {
  cnstwkNm?: string
  cntrctNm?: string
  bsnsDivNm?: string
  dcsnCntrctNo?: string
  untyCntrctNo?: string
  ntceNo?: string
  totCntrctAmt?: string
  thtmCntrctAmt?: string
  cntrctPrd?: string
  cntrctCnclsDate?: string
  cbgnDate?: string
  wbgnDate?: string
  ttalCcmpltDate?: string
  ttalScmpltDate?: string
  thtmCcmpltDate?: string
  thtmScmpltDate?: string
  lngtrmCtnuDivNm?: string
  cntrctInsttNm?: string
  dminsttList?: string
  corpList?: string
  cntrctInfoUrl?: string
  cntrctDtlInfoUrl?: string
}

// corpList/dminsttList는 '[a^b^c^...]' 형태의 캐럿 구분 문자열 (contract 라우트와 동일)
function parseCaretList(value: string | undefined, nameIndex: number): string[] {
  if (!value) return []
  const groups = value.match(/\[([^\]]*)\]/g) || []
  const names = groups
    .map((g) => (g.slice(1, -1).split('^')[nameIndex] || '').trim())
    .filter(Boolean)
  return [...new Set(names)]
}

// 'YYYYMMDD' 또는 'YYYY-MM-DD hh:mm' → 'YYYY-MM-DD'
function toIsoDate(value?: string): string {
  if (!value) return ''
  const digits = value.replace(/[^0-9]/g, '').slice(0, 8)
  if (digits.length !== 8) return ''
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
}

export async function GET(request: NextRequest) {
  try {
    const div = request.nextUrl.searchParams.get('div') as keyof typeof OPS | null
    const inst = request.nextUrl.searchParams.get('inst')?.trim()
    const nm = request.nextUrl.searchParams.get('nm')?.trim().slice(0, 100) || ''
    const bgn = request.nextUrl.searchParams.get('bgn') || ''
    const end = request.nextUrl.searchParams.get('end') || ''
    if (!div || !OPS[div]) {
      return NextResponse.json(
        { success: false, error: '계약 구분(공사/용역)을 지정해주세요.' },
        { status: 400 }
      )
    }
    if (!inst || inst.length < 2 || inst.length > 60) {
      return NextResponse.json(
        { success: false, error: '기관명을 입력해주세요.' },
        { status: 400 }
      )
    }
    // 다개월 범위는 API 응답이 타임아웃되므로(2026-07-07 실측) 같은 달 이내만 허용
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

    const rawItems: G2bRawContractRow[] = []
    for (let pageNo = 1; pageNo <= MAX_PAGES; pageNo++) {
      const qs = new URLSearchParams({
        serviceKey: apiKey,
        pageNo: String(pageNo),
        numOfRows: '999',
        type: 'json',
        inqryDiv: '1',
        inqryBgnDate: bgn,
        inqryEndDate: end,
        insttNm: inst,
      })
      // 계약명 서버측 필터 — 공사는 cnstwkNm, 용역은 cntrctNm (2026-07-07 실호출 확인, 원문 부분일치)
      if (nm) qs.set(div === 'cnstwk' ? 'cnstwkNm' : 'cntrctNm', nm)
      // 계약현황 API는 납품요구 목록보다 응답이 느려(첫 호출 25초+ 실측) 타임아웃을 넉넉히 둔다
      const res = await fetch(`${G2B_BASE}/${OPS[div].op}?${qs.toString()}`, {
        signal: AbortSignal.timeout(40000),
        cache: 'no-store',
      })
      if (!res.ok) {
        console.error(`조달청 계약현황 목록 API HTTP 오류: ${res.status}`)
        return NextResponse.json(
          { success: false, error: `조달청 API 호출에 실패했습니다. (HTTP ${res.status})` },
          { status: 502 }
        )
      }

      const json = await res.json()
      const header = json?.response?.header
      if (header?.resultCode !== '00') {
        const msg = header?.resultMsg || json?.['nkoneps.com.response.ResponseError']?.header?.resultMsg || '알 수 없는 응답'
        console.error('조달청 계약현황 목록 API 오류:', msg)
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

    const normalize = (it: G2bRawContractRow) => {
      const name = (it.cnstwkNm || it.cntrctNm || '').trim()
      const cntrctDate = toIsoDate(it.cntrctCnclsDate)
      const corpNms = parseCaretList(it.corpList, 3)
      // 같은 계약이 untyCntrctNo만 다른 행으로 중복 반환되므로(실측) 키는 표시 필드 기준
      const key = `${name}|${cntrctDate}|${it.totCntrctAmt || ''}|${corpNms.join(',')}`
      return {
        key,
        type: OPS[div].type,
        name,
        untyCntrctNo: it.untyCntrctNo || '',
        cntrctNo: it.dcsnCntrctNo || '',
        cntrctDate,
        totAmt: Number(it.totCntrctAmt) || 0,
        thtmAmt: Number(it.thtmCntrctAmt) || 0,
        prd: it.cntrctPrd || '',
        startDate: toIsoDate(it.cbgnDate || it.wbgnDate),
        endDate: toIsoDate(it.ttalCcmpltDate || it.ttalScmpltDate),
        // 금차 준공일 — 장기계속계약은 차수(연차)별 계약이 별개 행으로 조회되므로 차수 구분의 기준
        thtmEndDate: toIsoDate(it.thtmCcmpltDate || it.thtmScmpltDate),
        lngtrmDiv: (it.lngtrmCtnuDivNm || '').trim(),
        cntrctInsttNm: it.cntrctInsttNm || '',
        dminsttNms: parseCaretList(it.dminsttList, 2),
        corpNms,
        url: it.cntrctDtlInfoUrl || it.cntrctInfoUrl || '',
      }
    }
    // 중복 행 dedupe (첫 행 유지)
    const byKey = new Map<string, ReturnType<typeof normalize>>()
    for (const it of rawItems) {
      const item = normalize(it)
      if (!item.name) continue
      if (!byKey.has(item.key)) byKey.set(item.key, item)
    }

    return NextResponse.json({ success: true, data: { items: [...byKey.values()] } })
  } catch (err: unknown) {
    console.error('조달청 계약현황 목록 조회 실패:', err)
    const isTimeout = err instanceof Error && err.name === 'TimeoutError'
    return NextResponse.json(
      {
        success: false,
        error: isTimeout
          ? '조달청 API 응답이 지연되고 있습니다. 잠시 후 다시 시도해주세요.'
          : '계약현황 목록 조회 중 오류가 발생했습니다.',
      },
      { status: 502 }
    )
  }
}
