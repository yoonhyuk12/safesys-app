// 나라장터 통합검색으로 대금지급(KG)·검사검수(NZ) 문서를 조회해 납품요구·계약번호 연결 정보로 정규화하는 API 라우트 (계약현황 뱃지용)
import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

// 공공데이터포털 공식 API에는 대금지급·검사검수 데이터가 없어(2026-07-12 검색 0건 확인) 나라장터
// 차세대 통합검색의 공개(비로그인) 엔드포인트를 사용한다 — FIUA027_01 화면과 동일 경로 (2026-07-12 실호출 확인).
// 비공식 내부 API라 응답 형태가 예고 없이 바뀔 수 있다. 실패 시 뱃지만 안 뜨는 부가 기능으로 유지할 것.
const UNTY_BASE = 'https://www.g2b.go.kr/fi/fiu/fiua/UntySrch'

// 통합검색 요청 파라미터 원형 — 실제 화면 요청에서 채집 (기간·키워드 외에는 기본값)
const buildSearchParam = (keyword: string, seCd: 'KG' | 'NZ', bgn: string, end: string) => ({
  currentPage: 1,
  recordCountPerPage: '100',
  searchKeyword: keyword,
  researchKeyword: '',
  reSelectValue: '',
  srchSeCd: '',
  saveTime: '',
  untySrchSeCd: seCd,
  bizNm: keyword,
  bizNo: '',
  mindCd: '',
  mindNm: '',
  prcmMaagSeCd: '',
  bizYmdDiv: '',
  bizYmd: '',
  startBizYmd: bgn,
  endBizYmd: end,
  pbancInstUntyGrpNo: '',
  pbancInstUntyGrpNm: '',
  dmstUntyGrpNo: '',
  dmstUntyGrpNm: '',
  prcmBsneAreaCd: '조070001 조070002 조070003 조070004 조070005',
  frcpYn: 'N',
  laseYn: 'N',
  rsrvYn: 'N',
  ctrtTyCd: '',
})

// 상세 조회 파라미터 원형 — bizNo에 문서번호(dqId, R##KG/R##NZ)를 넣는다 (화면 모듈 UntySrchInspPypr.js 분석)
const buildDtlParam = (docNo: string) => ({
  untyInspIgiNo: '',
  untyPyprNo: '',
  ctrtDmndRcptNo: '',
  ctrtDmndRcptOrd: '',
  page: '1',
  pageSize: '10',
  ctrtNo: '',
  ctrtChgOrd: '',
  bizNo: docNo,
  bizOrd: '',
  prcmBsneSeCd: '',
})

interface G2bUntyRow {
  untySrchSeCd?: string
  bizNm?: string
  bizNo?: string
  dqId?: string
  bizYmd?: string
  dmstUntyGrpNm?: string
  pbancInstUntyGrpNm?: string
  ctrtAmt?: number | string
  ldocNoVal?: string
  dlreqNo?: string
  bizDtlItm01?: string
  bizDtlItm02?: string
  bizDtlItm03?: string
  bizDtlItm12?: string
}

async function postJson(path: string, param: Record<string, unknown>): Promise<G2bUntyRow[]> {
  const res = await fetch(`${UNTY_BASE}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ dlSrchParamM: param }),
    signal: AbortSignal.timeout(25000),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  const rows = json?.dlTotalSrchL
  return Array.isArray(rows) ? rows : []
}

// 'YYYYMMDD' → 'YYYY-MM-DD'
const toIso = (s?: string) =>
  s && /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : ''

// 검색 결과 HTML 강조 태그·엔티티 제거
const cleanNm = (s?: string) =>
  (s || '').replace(/&lt;\/?b&gt;|<\/?b>/g, '').replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c))).trim()

export async function GET(request: NextRequest) {
  try {
    const nm = request.nextUrl.searchParams.get('nm')?.trim().slice(0, 60) || ''
    const inst = request.nextUrl.searchParams.get('inst')?.trim() || ''
    const bgn = request.nextUrl.searchParams.get('bgn') || ''
    const end = request.nextUrl.searchParams.get('end') || ''
    if (nm.length < 2) {
      return NextResponse.json({ success: false, error: '검색어를 2자 이상 입력해주세요.' }, { status: 400 })
    }
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const bgnYmd = /^\d{8}$/.test(bgn) ? bgn : String(Number(today.slice(0, 4)) - 3) + '0101'
    const endYmd = /^\d{8}$/.test(end) ? end : today

    // ① 대금지급(KG)·검사검수(NZ) 문서 검색 — 카테고리별 병렬
    const [kgRows, nzRows] = await Promise.all([
      postJson('srchUntyTotal.do', buildSearchParam(nm, 'KG', bgnYmd, endYmd)),
      postJson('srchUntyTotal.do', buildSearchParam(nm, 'NZ', bgnYmd, endYmd)),
    ])
    // 수요기관명 필터(부분일치)로 상세 조회 대상 축소 — 상세 호출 수 절약
    const byInst = (r: G2bUntyRow) => !inst || (r.dmstUntyGrpNm || '').includes(inst)
    const kgTargets = kgRows.filter((r) => r.untySrchSeCd === 'KG' && r.dqId && byInst(r)).slice(0, 25)
    const nzTargets = nzRows.filter((r) => r.untySrchSeCd === 'NZ' && r.dqId && byInst(r)).slice(0, 25)

    // ② 상세 조회 — 대금지급은 계약번호·납품요구번호 연결이 상세에만 있다 (4건씩 병렬, 실패 건은 건너뜀)
    const resolve = async <T>(targets: G2bUntyRow[], fn: (r: G2bUntyRow) => Promise<T | null>): Promise<T[]> => {
      const out: T[] = []
      for (let i = 0; i < targets.length; i += 4) {
        const batch = await Promise.all(targets.slice(i, i + 4).map(async (r) => {
          try { return await fn(r) } catch { return null }
        }))
        out.push(...batch.filter((v): v is Awaited<T> => v != null))
      }
      return out
    }

    const pays = await resolve(kgTargets, async (r) => {
      const dtl = (await postJson('srchPprcGiveDtl.do', buildDtlParam(r.dqId as string)))[0]
      if (!dtl) return null
      // bizDtlItm01=계약번호(구형은 '_1' 접미), bizDtlItm03=납품요구번호+차수2자리 (2026-07-12 실호출 확인)
      const ctrtNo = (dtl.bizDtlItm01 || '').split('_')[0]
      const ldoc = dtl.bizDtlItm03 || dtl.ldocNoVal || ''
      return {
        docNo: r.dqId as string,
        name: cleanNm(dtl.bizNm),
        payDate: toIso(dtl.bizYmd),
        amt: Number(dtl.ctrtAmt) || 0,
        seNm: dtl.bizDtlItm12 || '', // 지급구분 (일반급·선금급 등)
        ctrtNo,
        chgOrd: dtl.bizDtlItm02 || '',
        dlvrReqNo: /^R\d{2}TB/.test(ldoc) ? ldoc.slice(0, 13) : '',
        corpNm: dtl.pbancInstUntyGrpNm || '',
        dminsttNm: dtl.dmstUntyGrpNm || '',
      }
    })

    const insps = await resolve(nzTargets, async (r) => {
      const dtl = (await postJson('srchInspIgiDtl.do', buildDtlParam(r.dqId as string)))[0]
      if (!dtl) return null
      // dlreqNo — 단가계약 납품요구 건은 납품요구번호, 직접구매 건은 계약번호가 들어온다
      const link = dtl.dlreqNo || ''
      return {
        docNo: r.dqId as string,
        name: cleanNm(dtl.bizNm),
        inspDate: toIso(dtl.bizYmd),
        amt: Number(dtl.ctrtAmt) || 0,
        dlvrReqNo: /^R\d{2}TB/.test(link) ? link.slice(0, 13) : '',
        ctrtNo: /^R\d{2}TB/.test(link) ? '' : link.split('_')[0],
        dminsttNm: dtl.dmstUntyGrpNm || '',
      }
    })

    return NextResponse.json({ success: true, data: { pays, insps } })
  } catch (err: unknown) {
    console.error('나라장터 대금지급·검사검수 조회 실패:', err)
    const isTimeout = err instanceof Error && err.name === 'TimeoutError'
    return NextResponse.json(
      {
        success: false,
        error: isTimeout
          ? '나라장터 응답이 지연되고 있습니다. 잠시 후 다시 시도해주세요.'
          : '대금지급·검사검수 조회 중 오류가 발생했습니다.',
      },
      { status: 502 }
    )
  }
}
