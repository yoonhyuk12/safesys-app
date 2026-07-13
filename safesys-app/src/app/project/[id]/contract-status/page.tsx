// 계약(공사·용역) 현황 서류철 — 조달청 계약현황 조회로 등록하는 프로젝트 계약 목록 페이지
'use client'

import { Fragment, useState, useEffect, useCallback, useMemo, useRef, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { Project } from '@/lib/projects'
import { guessInstName } from '@/lib/g2b-inst'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { downloadContractStatusExcel, type ContractExcelRow } from '@/lib/excel/contract-status-export'
import { ArrowLeft, Plus, RefreshCw, X, FileText, ExternalLink, Trash2, Loader2, Search, Download } from 'lucide-react'

interface ContractRecord {
  id: string
  project_id: string
  created_by: string | null
  contract_type: '공사' | '용역'
  cntrct_nm: string
  unty_cntrct_no: string | null
  cntrct_no: string | null
  corp_nm: string | null
  tot_cntrct_amt: number | null
  thtm_cntrct_amt: number | null
  cntrct_date: string | null
  cntrct_prd: string | null
  start_date: string | null
  end_date: string | null
  thtm_end_date: string | null
  dminstt_nm: string | null
  cntrct_instt_nm: string | null
  cntrct_info_url: string | null
  created_at: string
}

// /api/g2b/cntrct-list 응답 행
interface G2bCntrctItem {
  key: string
  type: '공사' | '용역'
  name: string
  untyCntrctNo: string
  cntrctNo: string
  cntrctDate: string
  totAmt: number
  thtmAmt: number
  prd: string
  startDate: string
  endDate: string
  thtmEndDate: string
  lngtrmDiv: string
  cntrctInsttNm: string
  dminsttNms: string[]
  corpNms: string[]
  url: string
}

// 기간 조회는 공사·용역을 구분 없이 함께 조회한다 (API 오퍼레이션은 분리라 서버 호출은 구분별로 나감)
type LookupDiv = 'period' | 'byno'

const LOOKUP_TABS: Array<{ div: LookupDiv; label: string }> = [
  { div: 'period', label: '공사·용역' },
  { div: 'byno', label: '계약번호' },
]

const PERIOD_PRESETS = [6, 12, 18, 24, 30, 36]

const formatAmt = (n: number | null | undefined) =>
  n == null || n === 0 ? '-' : n.toLocaleString('ko-KR')

// 일자 연도 축약 — '2026-01-15' → '26-01-15' (기간 문자열 속 여러 일자도 일괄 축약)
const shortDate = (s: string | null | undefined) =>
  s ? s.replace(/(?:19|20)(\d{2})([-./]\d{2}[-./]\d{2})/g, '$1$2') : '-'


// 금차 귀속 연도 — 장기계속계약의 차수분 계약은 총금액과 금차금액이 다르므로 금차 준공일(차수분 준공) 연도를 귀속 연도로 사용.
// 일반 단년도 계약(총금액 = 금차금액)은 계약체결일의 연도를 귀속 연도로 사용.
// 정보가 부족한 경우 총준공일 또는 올해 연도로 폴백.
const contractYear = (r: {
  thtm_end_date?: string | null
  end_date: string | null
  cntrct_date: string | null
  tot_cntrct_amt?: number | null
  thtm_cntrct_amt?: number | null
}): string => {
  const isThtmAmtDifferent = r.tot_cntrct_amt != null && r.thtm_cntrct_amt != null && r.tot_cntrct_amt !== r.thtm_cntrct_amt
  if (isThtmAmtDifferent && r.thtm_end_date) {
    return r.thtm_end_date.slice(0, 4)
  }
  if (r.cntrct_date) {
    return r.cntrct_date.slice(0, 4)
  }
  if (r.thtm_end_date) {
    return r.thtm_end_date.slice(0, 4)
  }
  const today = new Date().toISOString().slice(0, 10)
  if (r.end_date && r.end_date < today) {
    return r.end_date.slice(0, 4)
  }
  if (r.end_date) {
    return r.end_date.slice(0, 4)
  }
  return String(new Date().getFullYear())
}

// 납품기한에서 연도(YYYY) 추출 — 'YYYY-…' 또는 'YY.…' 표기 지원 (지급자재 계약현황 엑셀·대시보드와 동일 규칙)
const deadlineYear = (val: string | null | undefined): string | null => {
  if (!val) return null
  let m = val.match(/^(\d{4})\D/)
  if (m) return m[1]
  m = val.match(/^(\d{2})\./)
  if (m) return `20${m[1]}`
  return null
}

// g2b.go.kr 홈만 가리키는 URL은 계약 상세가 아니므로 링크로 렌더하지 않는다
const isDetailUrl = (u: string | null): u is string =>
  !!u && !/^https?:\/\/(www\.)?g2b\.go\.kr\/?$/.test(u)

// 계약 상세 딥링크의 ctrtNo(기본 계약번호, 차수 없음) — 조회 경로마다 통합계약번호가 달라져도
// 같은 계약이면 이 값은 동일하므로 등록됨 판정의 안정적인 키로 쓴다
const ctrtNoFromUrl = (u: string | null | undefined): string => {
  const m = u?.match(/[?&]ctrtNo=([A-Za-z0-9]+)/)
  return m ? m[1] : ''
}

// /api/g2b/contract 응답의 계약 행
interface G2bContractResp {
  cnstwkNm: string
  bsnsDivNm: string
  cntrctNo: string
  untyCntrctNo: string
  totCntrctAmt: number
  thtmCntrctAmt: number
  cntrctPrd: string
  cntrctCnclsDate: string
  startDate: string
  endDate: string
  thtmEndDate?: string
  lngtrmDiv?: string
  cntrctInsttNm: string
  dminsttNms: string[]
  corpNms: string[]
  cntrctInfoUrl: string
  cntrctDtlInfoUrl?: string
}

const contractRespToItem = (c: G2bContractResp): G2bCntrctItem => ({
  key: `${c.cnstwkNm}|${c.cntrctCnclsDate}|${c.totCntrctAmt}|${(c.corpNms || []).join(',')}`,
  // 물품·외자는 프로젝트 성격상 없다고 보고 용역 표기가 없으면 공사로 분류
  type: (c.bsnsDivNm || '').includes('용역') ? '용역' : '공사',
  name: c.cnstwkNm,
  untyCntrctNo: c.untyCntrctNo || '',
  cntrctNo: c.cntrctNo || '',
  cntrctDate: c.cntrctCnclsDate || '',
  totAmt: c.totCntrctAmt || 0,
  thtmAmt: c.thtmCntrctAmt || 0,
  prd: c.cntrctPrd || '',
  startDate: c.startDate || '',
  endDate: c.endDate || '',
  thtmEndDate: c.thtmEndDate || '',
  lngtrmDiv: c.lngtrmDiv || '',
  cntrctInsttNm: c.cntrctInsttNm || '',
  dminsttNms: c.dminsttNms || [],
  corpNms: c.corpNms || [],
  url: c.cntrctDtlInfoUrl || c.cntrctInfoUrl || '',
})

// 나라장터 연계 계약 자동 등록의 세션 내 재시도 방지 (StrictMode 이중 실행·재방문 중복 insert 방지)
const linkSyncTried = new Set<string>()

// 조달청 연계 지급자재를 납품요구 건 단위로 묶은 물품 계약 표시 행 — 수불부가 원천(읽기 전용, 등록·수정은 수불부에서)
interface MaterialContractGroup {
  dlvrReqNo: string
  materialNames: string[] // 소속 자재명 (건명 조회 실패 시 계약명 폴백)
  supplier: string | null // 수불부 저장 계약업체명 (조달청 배경 조회 값이 있으면 그 값 우선)
  deadline: string | null // 자재별 납품기한 최댓값
  title: string | null // 저장된 납품요구 건명 (dlvr_title) — 있으면 조달청 요약 재조회 생략
  dminstt: string | null // 저장된 수요기관명
  rcptDate: string | null // 저장된 접수일
  inspDate: string | null // 저장된 나라장터 검사검수 일자
  payDate: string | null // 저장된 나라장터 대금지급 일자 — 있으면 지급·검수 재조회 생략
  totAmt: number // 품대+조달수수료 합
  yearAmts: Map<string, number> // 납품기한 연도 → 금액 합
}

// /api/g2b/dlvr-req-info 응답 — 납품요구 요약(건명·업체·수요기관·접수일)
interface DlvrReqInfo {
  title: string
  corpNm: string
  dminsttNm: string
  rcptDate: string
  deadline: string
}

// /api/g2b/dlvr-req 응답 — 실제 수요기관 납품요구 상세와 품목 내역
interface DlvrReqDetailItem {
  sno: number
  name: string
  spec: string
  unit: string
  unitPrice: number
  qty: number
  amt: number
  deadline: string
}
interface DlvrReqDetail {
  dlvrReqNo: string
  title: string
  demandOrg: string
  supplier: string
  supplierTel: string
  items: DlvrReqDetailItem[]
}

// 납품요구 요약의 세션 캐시 — 재방문·리렌더 시 조달청 재조회 방지 (요약 실패는 null로 기록해 재시도 억제)
const dlvrInfoCache = new Map<string, DlvrReqInfo | null>()

// /api/g2b/pay-insp 응답 행 — 나라장터 통합검색의 대금지급(KG)·검사검수(NZ) 문서
interface G2bPayDoc {
  docNo: string
  name: string
  payDate: string
  amt: number
  seNm: string
  ctrtNo: string
  chgOrd: string
  dlvrReqNo: string
  corpNm: string
  dminsttNm: string
}
interface G2bInspDoc {
  docNo: string
  name: string
  inspDate: string
  amt: number
  dlvrReqNo: string
  ctrtNo: string
  dminsttNm: string
}
interface PayInspResult {
  pays: G2bPayDoc[]
  insps: G2bInspDoc[]
}
// 대금지급·검사검수 조회의 세션 캐시 — 키는 '키워드|수요기관' (실패는 null로 기록해 재시도 억제)
const payInspCache = new Map<string, PayInspResult | null>()

const PAY_INSP_GENERIC_WORDS = ['구매', '지급자재', '관급자재', '사업', '공사', '설치', '제조', '제작', '납품']
const cleanPayInspCandidate = (value: string) => value.replace(/[\[\]{}<>]/g, ' ').replace(/\s+/g, ' ').trim()
const isSpecificPayInspCandidate = (value: string) => {
  const compact = value.replace(/[^0-9A-Za-z가-힣]/g, '')
  return compact.length >= 2
    && !/^\d+$/.test(compact)
    && !PAY_INSP_GENERIC_WORDS.some(word => compact === word || compact.endsWith(word))
}

// 공사·용역은 기존 첫 단어를 유지하고, 물품은 괄호 품목명 또는 일반어를 제외한 최장 토큰으로 좁힌다
const payInspKeyword = (title: string, specific = false): string => {
  if (!specific) return title.split(/\s+/).find(word => word.length >= 2 && !/^\d/.test(word)) || ''

  const parenthesized = [...title.matchAll(/\(([^()]*)\)/g)]
    .map(match => cleanPayInspCandidate(match[1]))
    .filter(isSpecificPayInspCandidate)
    .sort((a, b) => b.length - a.length)[0]
  if (parenthesized) return parenthesized

  return title.replace(/\([^()]*\)/g, ' ')
    .split(/[\s,·/]+/)
    .map(cleanPayInspCandidate)
    .filter(isSpecificPayInspCandidate)
    .sort((a, b) => b.length - a.length)[0] || ''
}

const materialDetailPayInspCache = new Map<string, PayInspResult>()
const materialDetailPayInspPending = new Map<string, Promise<PayInspResult>>()
const mergePayInspResults = (...results: PayInspResult[]): PayInspResult => ({
  pays: [...new Map(results.flatMap(result => result.pays).map(doc => [doc.docNo, doc])).values()],
  insps: [...new Map(results.flatMap(result => result.insps).map(doc => [doc.docNo, doc])).values()],
})

const fetchMaterialDetailPayInsp = async (no: string, title: string, demandOrg: string): Promise<PayInspResult> => {
  const cached = materialDetailPayInspCache.get(no)
  if (cached) return cached
  const pending = materialDetailPayInspPending.get(no)
  if (pending) return pending

  const request = (async () => {
    const keyword = payInspKeyword(title, true)
    if (keyword.length < 2) {
      const empty = { pays: [], insps: [] }
      materialDetailPayInspCache.set(no, empty)
      return empty
    }
    const res = await fetch(
      `/api/g2b/pay-insp?nm=${encodeURIComponent(keyword)}${demandOrg ? `&inst=${encodeURIComponent(demandOrg)}` : ''}`
    )
    const json = await res.json()
    if (!res.ok || !json.success) throw new Error(json.error || '지급·검사검수 내역을 불러오지 못했습니다.')
    const payRows: G2bPayDoc[] = Array.isArray(json.data?.pays) ? json.data.pays : []
    const inspRows: G2bInspDoc[] = Array.isArray(json.data?.insps) ? json.data.insps : []
    const exact = {
      pays: [...new Map(payRows.filter(doc => doc.dlvrReqNo === no).map(doc => [doc.docNo, doc])).values()],
      insps: [...new Map(inspRows.filter(doc => doc.dlvrReqNo === no).map(doc => [doc.docNo, doc])).values()],
    }
    materialDetailPayInspCache.set(no, exact)
    return exact
  })().finally(() => {
    materialDetailPayInspPending.delete(no)
  })

  materialDetailPayInspPending.set(no, request)
  return request
}

// 조달청고시 제2025-33호 내자구매 단가계약 요율. 면제·감경 특례는 반영하지 않은 추정치다
const calcG2bFee = (amt: number): number => {
  if (!amt || amt <= 0) return 0
  const b1 = 1_000_000_000
  const b2 = 10_000_000_000
  let fee = Math.min(amt, b1) * 0.0054
  if (amt > b1) fee += (Math.min(amt, b2) - b1) * 0.0047
  if (amt > b2) fee += (amt - b2) * 0.0037
  return Math.round(fee)
}

// 합계행 공용 입력 — 공사·용역 그룹과 물품 그룹을 같은 형태로 합산하기 위한 (총액, 연도별 금액) 튜플
interface TotalRowItem {
  tot: number
  yearAmts: Map<string, number>
}
const toTotalItem = (g: ContractGroup): TotalRowItem => ({ tot: g.repr.tot_cntrct_amt || 0, yearAmts: g.yearAmts })
const matToTotalItem = (g: MaterialContractGroup): TotalRowItem => ({ tot: g.totAmt, yearAmts: g.yearAmts })

// 딥링크의 ctrtChgOrd(차수) — 같은 계약의 원계약/변경계약 중 최신 판별용
const chgOrdFromUrl = (u: string | null | undefined): number => {
  const m = u?.match(/[?&]ctrtChgOrd=(\d+)/)
  return m ? Number(m[1]) : -1
}

// 같은 계약 판별 키: 딥링크 ctrtNo → 결합형 확정계약번호의 기본번호 → 계약명
const contractGroupKey = (i: G2bCntrctItem): string =>
  ctrtNoFromUrl(i.url) ||
  (i.cntrctNo.length >= 13 ? i.cntrctNo.slice(0, -2) : i.cntrctNo) ||
  i.name

// 장기계속계약의 연차별 차수는 계약번호가 서로 달라 번호로 못 묶는다 — 계약명(공백 제거)+구분으로 묶는다.
// 연차 표기 접미어는 차수마다 달라("(2차년도_2025년도)", "(3차년도, 2026년)", 괄호 없는 "2차년도" 등,
// 1차는 접미어 없음) 제거 후 비교한다.
// 연차를 연도로만 표기하는 실데이터 패턴("2025년 ○○" 접두, "○○(2026년)" 접미 — 2026-07-12 실호출 확인)은
// 단년도 반복 계약과 혼동될 수 있어 차수분 계약(stripYearAffix=true)에만 제거를 적용한다
const nameGroupKey = (type: string, name: string, stripYearAffix = false): string => {
  let n = name.replace(/(?:\(\s*\d+\s*차[^)]*\)|\d+\s*차년도)\s*$/, '')
  if (stripYearAffix) {
    n = n.replace(/^20\d{2}\s*년도?\s*/, '').replace(/\(\s*20\d{2}\s*년도?\s*\)\s*$/, '')
  }
  return `${type}|${n.replace(/\s+/g, '')}`
}

// 차수분 계약 판별 — 장기계속계약의 연차 차수 행은 총액과 금차가 다르다 (단년도 계약은 총액=금차)
const isThtmPartial = (tot?: number | null, thtm?: number | null): boolean =>
  tot != null && thtm != null && tot > 0 && thtm > 0 && tot !== thtm

// 계약명 연차 접미어의 차수 번호 — "(3차년도_2026년)"·"3차년도" → 3, 접미어 없으면 1(원계약)
const iterOrdFromName = (name: string): number => {
  const m = name.match(/(?:\(\s*(\d+)\s*차[^)]*\)|(\d+)\s*차년도)\s*$/)
  return m ? Number(m[1] || m[2]) : 1
}

// 계약명은 공통 사업명 접두어가 길어 끝부분(…검증용역 등)이 식별점 — 앞쪽을 …로 생략해 뒷부분을 보여준다.
// direction:rtl 말줄임 트릭으로 말줄임표를 왼쪽에 표시하고, bdi(ltr)로 내부 어순·끝 괄호 뒤집힘을 방지한다.
function TailTruncate({ text, className = '', title }: { text: string; className?: string; title?: string }) {
  return (
    <span dir="rtl" title={title} className={`truncate text-left ${className}`}>
      <bdi dir="ltr">{text}</bdi>
    </span>
  )
}

// 제목행 세로 고정용 공통 th 클래스 — border-collapse에서는 sticky 셀의 테두리가 함께 고정되지 않아 그림자로 하단선을 대체
const TH_STICKY = 'px-3 py-2 text-center font-medium sticky top-0 shadow-[inset_0_-1px_0_#e5e7eb]'

// 계약명 컬럼 사용자 조정 폭의 localStorage 키·허용 범위
const NAME_COL_W_KEY = 'contractStatus.nameColWidth'
const NAME_COL_MIN = 80
const NAME_COL_MAX = 640

// 표시용 계약 그룹 — 차수별 등록 행을 한 계약 한 행으로 병합
interface ContractGroup {
  key: string
  repr: ContractRecord // 최신 차수(체결일 기준) — 총액·체결일·업체·링크 대표
  members: ContractRecord[]
  yearAmts: Map<string, number> // 연도 컬럼 → 해당 연도 차수의 금차 합
  startDate: string | null // 멤버 최초 착수일
  endDate: string | null // 멤버 최종 준공일
}

// 조회 항목 → project_contracts insert 행
const itemToRow = (i: G2bCntrctItem, projectId: string, userId: string) => ({
  project_id: projectId,
  created_by: userId,
  contract_type: i.type,
  cntrct_nm: i.name,
  unty_cntrct_no: i.untyCntrctNo || null,
  cntrct_no: i.cntrctNo || null,
  corp_nm: i.corpNms.join(', ') || null,
  tot_cntrct_amt: i.totAmt || null,
  thtm_cntrct_amt: i.thtmAmt || null,
  cntrct_date: i.cntrctDate || null,
  cntrct_prd: i.prd || null,
  start_date: i.startDate || null,
  end_date: i.endDate || null,
  thtm_end_date: i.thtmEndDate || null,
  dminstt_nm: i.dminsttNms.join(', ') || null,
  cntrct_instt_nm: i.cntrctInsttNm || null,
  cntrct_info_url: i.url || null,
})

// 차수(원계약·변경계약)별 행을 같은 계약으로 묶어 무조건 최신 차수만 남긴다.
// 기간 조회에서 원계약과 변경계약이 다른 달에 걸리면 별개 행으로 수집되는 것을 방지
const latestPerContract = (items: G2bCntrctItem[]): G2bCntrctItem[] => {
  const byNo = new Map<string, G2bCntrctItem>()
  for (const item of items) {
    const k = contractGroupKey(item)
    const prev = byNo.get(k)
    if (!prev) { byNo.set(k, item); continue }
    const a = chgOrdFromUrl(item.url)
    const b = chgOrdFromUrl(prev.url)
    const newer = a !== b ? a > b : (item.cntrctDate || '') > (prev.cntrctDate || '')
    if (newer) byNo.set(k, item)
  }
  return [...byNo.values()]
}

// 'YYYY-MM' 범위를 월 단위 {bgn,end}(YYYYMMDD) 목록으로 변환 — 오늘 이후 제외, 최대 60개월
function buildMonths(from: string, to: string): Array<{ bgn: string; end: string }> {
  if (!/^\d{4}-\d{2}$/.test(from) || !/^\d{4}-\d{2}$/.test(to)) return []
  const months: Array<{ bgn: string; end: string }> = []
  const now = new Date()
  const nowKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  let [y, m] = from.split('-').map(Number)
  for (let i = 0; i < 60; i++) {
    const key = `${y}-${String(m).padStart(2, '0')}`
    if (key > to || key > nowKey) break
    const lastDay = new Date(y, m, 0).getDate()
    const mm = String(m).padStart(2, '0')
    months.push({ bgn: `${y}${mm}01`, end: `${y}${mm}${String(lastDay).padStart(2, '0')}` })
    m += 1
    if (m > 12) { m = 1; y += 1 }
  }
  return months
}

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

// 업데이트 ②단계(신규 연차 탐색) 계획 — 그룹당 months 수만큼 월별 목록 조회를 수행
interface RefreshScanPlan {
  g: ContractGroup
  inst: string
  nm: string
  months: Array<{ bgn: string; end: string }>
}

export default function ContractStatusPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()
  const projectId = params.id as string

  const [project, setProject] = useState<Project | null>(null)
  const [records, setRecords] = useState<ContractRecord[]>([])
  const [loading, setLoading] = useState(true)
  // 물품(지급자재) — 조달청 연계 수불부 집계 행
  const [materialGroups, setMaterialGroups] = useState<MaterialContractGroup[]>([])
  const [matLoading, setMatLoading] = useState(true)
  const [dlvrInfos, setDlvrInfos] = useState<Map<string, DlvrReqInfo | null>>(() => new Map(dlvrInfoCache))
  const [materialDetailOpen, setMaterialDetailOpen] = useState(false)
  const [materialDetailNo, setMaterialDetailNo] = useState('')
  const [materialDetailLoading, setMaterialDetailLoading] = useState(false)
  const [materialDetailProgress, setMaterialDetailProgress] = useState(0)
  const [materialDetailError, setMaterialDetailError] = useState('')
  const [materialDetail, setMaterialDetail] = useState<DlvrReqDetail | null>(null)
  const [materialDetailPayInsp, setMaterialDetailPayInsp] = useState<PayInspResult>({ pays: [], insps: [] })
  const [materialDetailPayInspLoading, setMaterialDetailPayInspLoading] = useState(false)
  const [materialDetailPayInspError, setMaterialDetailPayInspError] = useState('')
  const materialDetailRequestRef = useRef(0)
  const materialDetailProgressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const materialDetailCompleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 나라장터 대금지급·검사검수 문서 — 지급완료·검수 뱃지용 (세션 캐시 미러)
  const [payInsp, setPayInsp] = useState<Map<string, PayInspResult | null>>(() => new Map(payInspCache))

  // 조달청 조회 모달
  const [isLookupOpen, setIsLookupOpen] = useState(false)
  const [lookupDiv, setLookupDiv] = useState<LookupDiv>('period')
  const [lookupInst, setLookupInst] = useState('')
  const [lookupFrom, setLookupFrom] = useState('')
  const [lookupTo, setLookupTo] = useState('')
  const [lookupKeyword, setLookupKeyword] = useState('')
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupProgress, setLookupProgress] = useState({ done: 0, total: 0 })
  const [lookupError, setLookupError] = useState('')
  const [lookupItems, setLookupItems] = useState<G2bCntrctItem[] | null>(null)
  const [lookupChecked, setLookupChecked] = useState<Set<string>>(new Set())
  const [importing, setImporting] = useState(false)
  // 등록 방식 탭 (직접 등록 / 조달청 조회) — 조달청 조회가 기본
  const [modalTab, setModalTab] = useState<'manual' | 'g2b'>('g2b')
  // 계약번호·공고번호 조회
  const [noInput, setNoInput] = useState('')
  const [noLoading, setNoLoading] = useState(false)
  // 직접 등록 폼 — 장기계속계약은 차수(연도)별 금액을 여러 건 입력해 차수당 1행으로 저장한다
  const [mForm, setMForm] = useState({
    type: '공사' as '공사' | '용역',
    name: '', corp: '', totAmt: '',
    cntrctDate: '', startDate: '', endDate: '', dminstt: '',
  })
  const [mThtmRows, setMThtmRows] = useState<Array<{ year: string; amt: string }>>([
    { year: String(new Date().getFullYear()), amt: '' },
  ])
  const [mSaving, setMSaving] = useState(false)
  // 등록 건 일괄 갱신 (조달청 최신 계약정보 반영)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshProgress, setRefreshProgress] = useState({ done: 0, total: 0 })
  // 업데이트 확인 모달 — 유형별 조회 횟수 안내와 대상 유형 선택 (null이면 닫힘)
  const [refreshConfirm, setRefreshConfirm] = useState<{ targets: ContractRecord[]; scanPlans: RefreshScanPlan[] } | null>(null)
  const [refreshTypes, setRefreshTypes] = useState<Set<'공사' | '용역'>>(new Set(['공사', '용역']))
  // 가로 스크롤 중 여부 — 스크롤 중에는 좌측 고정된 계약명 컬럼을 5글자 폭으로 접어 데이터 영역을 확보
  const [hScrolled, setHScrolled] = useState(false)
  // 계약명 컬럼 사용자 조정 폭(px) — 헤더 경계선 드래그로 설정. 설정되면 스크롤 자동 축소보다 우선하며 localStorage에 보존
  const [nameColPx, setNameColPx] = useState<number | null>(null)
  useEffect(() => {
    const saved = Number(localStorage.getItem(NAME_COL_W_KEY))
    if (saved >= NAME_COL_MIN && saved <= NAME_COL_MAX) setNameColPx(saved)
  }, [])
  const startNameColResize = (e: ReactPointerEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = nameColPx ?? (hScrolled ? 104 : 256)
    const clampW = (x: number) => Math.min(NAME_COL_MAX, Math.max(NAME_COL_MIN, startW + x - startX))
    const onMove = (ev: PointerEvent) => setNameColPx(clampW(ev.clientX))
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      localStorage.setItem(NAME_COL_W_KEY, String(clampW(ev.clientX)))
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }
  // 계약명 폭 조절 핸들 — 제목행뿐 아니라 모든 계약명 셀(데이터·합계행) 우측 경계에 공용으로 삽입
  const nameResizeHandle = (
    <span
      onPointerDown={startNameColResize}
      onDoubleClick={() => { setNameColPx(null); localStorage.removeItem(NAME_COL_W_KEY) }}
      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize touch-none select-none hover:bg-blue-300/60"
      title="드래그로 계약명 폭 조정 · 더블클릭으로 초기화"
    />
  )
  // 차수 병합 행 펼쳐보기 — 펼쳐진 그룹 key 집합
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())
  const toggleExpanded = (key: string) =>
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const handleBack = () => {
    const returnUrl = searchParams.get('returnUrl')
    if (returnUrl) { router.push(returnUrl); return }
    if (typeof window !== 'undefined' && window.history.length > 1) { router.back(); return }
    router.push(`/project/${projectId}`)
  }

  useEffect(() => {
    if (!authLoading && !user) router.push('/login')
  }, [authLoading, user, router])

  useEffect(() => {
    if (!user || !projectId) return
    const loadProject = async () => {
      const { data } = await supabase.from('projects').select('*').eq('id', projectId).single()
      if (data) setProject(data as Project)
    }
    loadProject()
  }, [user, projectId])

  const loadRecords = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    const { data, error } = await (supabase as any)
      .from('project_contracts')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
    if (!error && data) setRecords(data as ContractRecord[])
    setLoading(false)
  }, [projectId])

  useEffect(() => { if (user && projectId) loadRecords() }, [user, projectId, loadRecords])

  // 조달청 연계 지급자재 로드 — 납품요구번호 단위로 품대+조달수수료를 합산해 물품 계약 행 구성.
  // 이관 행은 자재의 납품요구와 다른 건에서 올 수 있어 행의 dlvr_req_no를 우선, 없으면 자재의 값으로 귀속.
  // 연도 귀속은 자재 납품기한 연도 — 지급자재 계약현황 엑셀·사업현황 대시보드와 동일 규칙
  const loadMaterials = useCallback(async () => {
    if (!projectId) return
    setMatLoading(true)
    try {
      const { data: mats } = await supabase
        .from('materials')
        .select('id, name, dlvr_req_no, dlvr_supplier, dlvr_deadline, dlvr_title, dlvr_dminstt, dlvr_rcpt_date, g2b_insp_date, g2b_pay_date')
        .eq('project_id', projectId)
        .order('sort_order', { ascending: true })
      type MatRow = {
        id: string; name: string; dlvr_req_no: string | null; dlvr_supplier: string | null; dlvr_deadline: string | null
        dlvr_title: string | null; dlvr_dminstt: string | null; dlvr_rcpt_date: string | null
        g2b_insp_date: string | null; g2b_pay_date: string | null
      }
      const matList: MatRow[] = mats || []
      if (matList.length === 0) { setMaterialGroups([]); return }
      const { data: entries } = await supabase
        .from('material_ledger_entries')
        .select('material_id, dlvr_req_no, prdct_amt, fee_amt')
        .in('material_id', matList.map((m) => m.id))

      const matById = new Map(matList.map((m) => [m.id, m]))
      const byNo = new Map<string, MaterialContractGroup>()
      const ensure = (no: string): MaterialContractGroup => {
        let g = byNo.get(no)
        if (!g) {
          g = {
            dlvrReqNo: no, materialNames: [], supplier: null, deadline: null,
            title: null, dminstt: null, rcptDate: null, inspDate: null, payDate: null,
            totAmt: 0, yearAmts: new Map(),
          }
          byNo.set(no, g)
        }
        return g
      }
      const addMaterialMeta = (g: MaterialContractGroup, m: MatRow) => {
        if (!g.materialNames.includes(m.name)) g.materialNames.push(m.name)
        if (!g.supplier && m.dlvr_supplier) g.supplier = m.dlvr_supplier
        if (m.dlvr_deadline && (!g.deadline || m.dlvr_deadline > g.deadline)) g.deadline = m.dlvr_deadline
        if (!g.title && m.dlvr_title) g.title = m.dlvr_title
        if (!g.dminstt && m.dlvr_dminstt) g.dminstt = m.dlvr_dminstt
        if (!g.rcptDate && m.dlvr_rcpt_date) g.rcptDate = m.dlvr_rcpt_date
        if (m.g2b_insp_date && (!g.inspDate || m.g2b_insp_date > g.inspDate)) g.inspDate = m.g2b_insp_date
        if (m.g2b_pay_date && (!g.payDate || m.g2b_pay_date > g.payDate)) g.payDate = m.g2b_pay_date
      }
      for (const m of matList) if (m.dlvr_req_no) addMaterialMeta(ensure(m.dlvr_req_no), m)
      type EntryRow = { material_id: string; dlvr_req_no: string | null; prdct_amt: number | null; fee_amt: number | null }
      for (const r of (entries || []) as EntryRow[]) {
        const m = matById.get(r.material_id)
        const no = r.dlvr_req_no || m?.dlvr_req_no
        if (!no || !m) continue
        const g = ensure(no)
        addMaterialMeta(g, m)
        const amt = (r.prdct_amt || 0) + (r.fee_amt || 0)
        if (amt === 0) continue
        g.totAmt += amt
        const y = deadlineYear(m.dlvr_deadline) || '기타'
        g.yearAmts.set(y, (g.yearAmts.get(y) || 0) + amt)
      }
      setMaterialGroups([...byNo.values()].sort((a, b) => b.totAmt - a.totAmt))
    } finally {
      setMatLoading(false)
    }
  }, [projectId])

  useEffect(() => { if (user && projectId) loadMaterials() }, [user, projectId, loadMaterials])

  // 납품요구 요약(건명·업체·접수일·수요기관) 배경 보강 — DB에 없는 표시 항목만 조달청에서 채운다.
  // 건명·수요기관·접수일이 모두 저장된 건은 재조회를 생략하고, 조회 성공 건은 materials에 write-back해
  // 다음 방문부터는 저장값으로 바로 표시한다. 캐시에 없는 번호만 4건씩 병렬 조회, 실패 건은 자재명 폴백
  useEffect(() => {
    const nos = materialGroups
      .filter((g) => !(g.title && g.dminstt && g.rcptDate))
      .map((g) => g.dlvrReqNo)
      .filter((no) => !dlvrInfoCache.has(no))
    if (nos.length === 0) return
    let cancelled = false
    const run = async () => {
      const CONCURRENCY = 4
      for (let i = 0; i < nos.length; i += CONCURRENCY) {
        await Promise.all(nos.slice(i, i + CONCURRENCY).map(async (no) => {
          try {
            const res = await fetch(`/api/g2b/dlvr-req-info?no=${encodeURIComponent(no)}`)
            const json = await res.json()
            const info = res.ok && json.success ? (json.data as DlvrReqInfo) : null
            dlvrInfoCache.set(no, info)
            if (info) {
              const patch: Record<string, string> = {}
              if (info.title) patch.dlvr_title = info.title
              if (info.dminsttNm) patch.dlvr_dminstt = info.dminsttNm
              if (info.rcptDate) patch.dlvr_rcpt_date = info.rcptDate
              if (Object.keys(patch).length > 0) {
                await (supabase as any).from('materials').update(patch)
                  .eq('project_id', projectId)
                  .eq('dlvr_req_no', no)
              }
            }
          } catch {
            dlvrInfoCache.set(no, null)
          }
        }))
        if (!cancelled) setDlvrInfos(new Map(dlvrInfoCache))
      }
    }
    run()
    return () => { cancelled = true }
  }, [materialGroups, projectId])

  const clearMaterialDetailProgressTimers = useCallback(() => {
    if (materialDetailProgressTimerRef.current) clearInterval(materialDetailProgressTimerRef.current)
    if (materialDetailCompleteTimerRef.current) clearTimeout(materialDetailCompleteTimerRef.current)
    materialDetailProgressTimerRef.current = null
    materialDetailCompleteTimerRef.current = null
  }, [])

  const startMaterialDetailProgress = useCallback(() => {
    clearMaterialDetailProgressTimers()
    setMaterialDetailProgress(0)
    materialDetailProgressTimerRef.current = setInterval(() => {
      setMaterialDetailProgress(prev => Math.min(90, prev + Math.max(1, Math.ceil((90 - prev) * 0.12))))
    }, 300)
  }, [clearMaterialDetailProgressTimers])

  const finishMaterialDetailProgress = useCallback((requestId: number) => {
    if (materialDetailRequestRef.current !== requestId) return
    clearMaterialDetailProgressTimers()
    setMaterialDetailProgress(100)
    materialDetailCompleteTimerRef.current = setTimeout(() => {
      if (materialDetailRequestRef.current === requestId) setMaterialDetailLoading(false)
      materialDetailCompleteTimerRef.current = null
    }, 180)
  }, [clearMaterialDetailProgressTimers])

  useEffect(() => () => {
    materialDetailRequestRef.current += 1
    clearMaterialDetailProgressTimers()
  }, [clearMaterialDetailProgressTimers])

  const loadMaterialDetailPayInsp = async (requestId: number, no: string, detail: DlvrReqDetail) => {
    if (materialDetailRequestRef.current !== requestId) return
    setMaterialDetailPayInspLoading(true)
    setMaterialDetailPayInspError('')
    try {
      const docs = await fetchMaterialDetailPayInsp(no, detail.title, detail.demandOrg)
      if (materialDetailRequestRef.current !== requestId) return
      setMaterialDetailPayInsp(previous => mergePayInspResults(previous, docs))
    } catch (err: unknown) {
      if (materialDetailRequestRef.current !== requestId) return
      setMaterialDetailPayInspError(err instanceof Error ? err.message : '지급·검사검수 내역을 불러오지 못했습니다.')
    } finally {
      if (materialDetailRequestRef.current === requestId) setMaterialDetailPayInspLoading(false)
    }
  }

  // 물품 행 계약명 클릭 — 상위 조달청 단가계약이 아닌 실제 수요기관 납품요구 상세를 표시한다.
  const openMaterialDetail = async (no: string) => {
    const requestId = ++materialDetailRequestRef.current
    startMaterialDetailProgress()
    setMaterialDetailNo(no)
    setMaterialDetail(null)
    setMaterialDetailError('')
    const backgroundDocs = {
      pays: [...new Map(
        [...payInsp.values()].flatMap(result => result?.pays || [])
          .filter(doc => doc.dlvrReqNo === no).map(doc => [doc.docNo, doc])
      ).values()],
      insps: [...new Map(
        [...payInsp.values()].flatMap(result => result?.insps || [])
          .filter(doc => doc.dlvrReqNo === no).map(doc => [doc.docNo, doc])
      ).values()],
    }
    setMaterialDetailPayInsp(mergePayInspResults(backgroundDocs, materialDetailPayInspCache.get(no) || { pays: [], insps: [] }))
    setMaterialDetailPayInspLoading(false)
    setMaterialDetailPayInspError('')
    setMaterialDetailLoading(true)
    setMaterialDetailOpen(true)
    try {
      const res = await fetch(`/api/g2b/dlvr-req?no=${encodeURIComponent(no)}`)
      const json = await res.json()
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.error || '납품요구 상세를 불러오지 못했습니다.')
      }
      if (materialDetailRequestRef.current !== requestId) return
      const detail = json.data as DlvrReqDetail
      setMaterialDetail(detail)
      void loadMaterialDetailPayInsp(requestId, no, detail)
    } catch (err: unknown) {
      if (materialDetailRequestRef.current !== requestId) return
      setMaterialDetailError(err instanceof Error ? err.message : '납품요구 상세를 불러오지 못했습니다.')
    } finally {
      finishMaterialDetailProgress(requestId)
    }
  }

  const closeMaterialDetail = () => {
    // 닫힌 뒤 도착하거나 다음 클릭보다 늦게 도착한 응답이 모달 상태를 덮지 못하게 무효화한다.
    materialDetailRequestRef.current += 1
    clearMaterialDetailProgressTimers()
    setMaterialDetailOpen(false)
    setMaterialDetailLoading(false)
    setMaterialDetailProgress(0)
    setMaterialDetailPayInspLoading(false)
  }

  // 차수별 등록 행을 계약 단위로 병합 — 한 계약 한 행, 차수 금차는 연도별 컬럼에 분산
  const groups = useMemo<ContractGroup[]>(() => {
    const byKey = new Map<string, ContractRecord[]>()
    for (const r of records) {
      const k = nameGroupKey(r.contract_type, r.cntrct_nm, isThtmPartial(r.tot_cntrct_amt, r.thtm_cntrct_amt))
      const arr = byKey.get(k)
      if (arr) arr.push(r)
      else byKey.set(k, [r])
    }
    return [...byKey.entries()].map(([key, members]) => {
      const repr = members.reduce((a, b) => ((b.cntrct_date || '') > (a.cntrct_date || '') ? b : a))
      const yearAmts = new Map<string, number>()
      for (const m of members) {
        if (!m.thtm_cntrct_amt) continue
        const y = contractYear(m) || '기타'
        yearAmts.set(y, (yearAmts.get(y) || 0) + m.thtm_cntrct_amt)
      }
      const starts = members.map((m) => m.start_date).filter((d): d is string => !!d)
      const ends = members.map((m) => m.end_date).filter((d): d is string => !!d)
      return {
        key,
        repr,
        members,
        yearAmts,
        startDate: starts.length ? starts.reduce((a, b) => (a < b ? a : b)) : null,
        endDate: ends.length ? ends.reduce((a, b) => (a > b ? a : b)) : null,
      }
    })
  }, [records])

  // 나라장터 대금지급(KG)·검사검수(NZ) 문서 배경 조회 — 사업명 키워드+수요기관으로 통합검색해 뱃지 데이터 확보.
  // 공식 API에 없는 데이터라 비공식 통합검색 엔드포인트를 쓴다 — 실패 시 뱃지만 표시되지 않는다 (2026-07-12 실호출 확인)
  useEffect(() => {
    const wants = new Map<string, { nm: string; inst: string }>()
    const add = (title: string, inst: string, specific = false) => {
      const nm = payInspKeyword(title, specific)
      if (!nm) return
      const key = `${nm}|${inst}`
      if (!payInspCache.has(key)) wants.set(key, { nm, inst })
    }
    for (const g of materialGroups) {
      if (g.payDate) continue // 지급완료 일자가 저장된 건 — 뱃지는 저장값으로 표시하고 재조회 생략
      const info = dlvrInfos.get(g.dlvrReqNo)
      add(g.title || info?.title || g.materialNames[0] || '', (g.dminstt || info?.dminsttNm || '').trim(), true)
    }
    for (const g of groups) {
      add(g.repr.cntrct_nm, ((g.repr.dminstt_nm || '').split(',')[0] || '').trim())
    }
    if (wants.size === 0) return
    let cancelled = false
    const run = async () => {
      const entries = [...wants.entries()]
      for (let i = 0; i < entries.length; i += 2) {
        await Promise.all(entries.slice(i, i + 2).map(async ([key, w]) => {
          try {
            const res = await fetch(`/api/g2b/pay-insp?nm=${encodeURIComponent(w.nm)}${w.inst ? `&inst=${encodeURIComponent(w.inst)}` : ''}`)
            const json = await res.json()
            payInspCache.set(key, res.ok && json.success ? (json.data as PayInspResult) : null)
          } catch {
            payInspCache.set(key, null)
          }
        }))
        if (!cancelled) setPayInsp(new Map(payInspCache))
      }
    }
    run()
    return () => { cancelled = true }
  }, [materialGroups, dlvrInfos, groups])

  // 캐시 전체를 풀로 매칭 — 검색 키워드가 달라도 번호(계약·납품요구)로 연결한다 (문서번호 기준 중복 제거)
  const allPays = useMemo(() => {
    const m = new Map<string, G2bPayDoc>()
    for (const v of payInsp.values()) for (const p of v?.pays || []) m.set(p.docNo, p)
    return [...m.values()]
  }, [payInsp])
  const allInsps = useMemo(() => {
    const m = new Map<string, G2bInspDoc>()
    for (const v of payInsp.values()) for (const d of v?.insps || []) m.set(d.docNo, d)
    return [...m.values()]
  }, [payInsp])
  const paysForDlvr = useCallback(
    (no: string) => allPays.filter((p) => p.dlvrReqNo && p.dlvrReqNo === no),
    [allPays]
  )
  const inspsForDlvr = useCallback(
    (no: string) => allInsps.filter((d) => d.dlvrReqNo && d.dlvrReqNo === no),
    [allInsps]
  )
  // 나라장터 지급·검사검수 일자 write-back — 통합검색으로 확인된 문서 일자를 materials에 저장해
  // 다음 방문부터 조회 없이 뱃지를 띄운다 (세션 중 건당 1회만 저장, 실패는 무시)
  const payInspSavedRef = useRef(new Set<string>())
  useEffect(() => {
    for (const g of materialGroups) {
      if (payInspSavedRef.current.has(g.dlvrReqNo)) continue
      const lastPay = paysForDlvr(g.dlvrReqNo).reduce((d, p) => (p.payDate > d ? p.payDate : d), '')
      const lastInsp = inspsForDlvr(g.dlvrReqNo).reduce((d, x) => (x.inspDate > d ? x.inspDate : d), '')
      const patch: Record<string, string> = {}
      if (lastPay && lastPay !== (g.payDate || '')) patch.g2b_pay_date = lastPay
      if (lastInsp && lastInsp !== (g.inspDate || '')) patch.g2b_insp_date = lastInsp
      if (Object.keys(patch).length === 0) continue
      payInspSavedRef.current.add(g.dlvrReqNo)
      void (supabase as any).from('materials').update(patch)
        .eq('project_id', projectId)
        .eq('dlvr_req_no', g.dlvrReqNo)
        .then(() => {})
    }
  }, [materialGroups, paysForDlvr, inspsForDlvr, projectId])
  // 공사·용역 그룹 매칭 — 딥링크 ctrtNo·확정계약번호(차수 제외 기본번호 포함) 기준
  const paysForGroup = useCallback(
    (g: ContractGroup) => {
      const keys = new Set<string>()
      for (const m of g.members) {
        const cn = ctrtNoFromUrl(m.cntrct_info_url)
        if (cn) keys.add(cn)
        if (m.cntrct_no) {
          keys.add(m.cntrct_no)
          if (m.cntrct_no.length >= 13) keys.add(m.cntrct_no.slice(0, -2))
        }
      }
      return allPays.filter((p) => p.ctrtNo && keys.has(p.ctrtNo))
    },
    [allPays]
  )

  // 표 정렬: 공사 먼저 → 용역(소계행이 구분 연속 그룹핑에 의존), 그다음 총계약금액 내림차순 (사용자 지정 순서)
  const sortedGroups = useMemo(() => {
    const typeOrder = (t: string) => (t === '공사' ? 0 : 1)
    return [...groups].sort((a, b) => {
      const t = typeOrder(a.repr.contract_type) - typeOrder(b.repr.contract_type)
      if (t !== 0) return t
      const amt = (b.repr.tot_cntrct_amt || 0) - (a.repr.tot_cntrct_amt || 0)
      if (amt !== 0) return amt
      return (a.repr.created_at || '').localeCompare(b.repr.created_at || '')
    })
  }, [groups])

  const cnstwkCount = groups.filter((g) => g.repr.contract_type === '공사').length
  const servcCount = groups.length - cnstwkCount

  // 금차계약금액의 연도별 컬럼 — 그룹에 금차 금액이 있는 귀속 연도만 컬럼으로 생성 (물품의 납품기한 연도 포함)
  const yearCols = useMemo(() => {
    const s = new Set<string>()
    for (const g of groups) for (const y of g.yearAmts.keys()) s.add(y)
    for (const g of materialGroups) for (const y of g.yearAmts.keys()) s.add(y)
    return [...s].sort((a, b) => (a === '기타' ? 1 : b === '기타' ? -1 : a.localeCompare(b)))
  }, [groups, materialGroups])
  // 올해 연도 컬럼은 배경색으로 강조 (사용자 지정)
  const thisYear = String(new Date().getFullYear())

  // 등록됨 판정: 딥링크 ctrtNo → 통합계약번호 → 확정계약번호 → 계약명+체결일 순 폴백.
  // 같은 계약이 조회 경로(기간/번호)마다 통합계약번호가 다르고 확정계약번호가 빈 값일 수 있어
  // 번호만으로는 놓친다 — 딥링크 ctrtNo와 계약명 단독 키를 함께 등록해 중복 등록을 막는다
  const registeredKeys = useMemo(() => {
    const s = new Set<string>()
    for (const r of records) {
      const cn = ctrtNoFromUrl(r.cntrct_info_url)
      if (cn) s.add(cn)
      if (r.unty_cntrct_no) s.add(r.unty_cntrct_no)
      if (r.cntrct_no) {
        s.add(r.cntrct_no)
        // 확정계약번호는 '기본번호+차수 2자리' 결합형이 있어 기본번호도 키로 등록
        if (r.cntrct_no.length >= 13) s.add(r.cntrct_no.slice(0, -2))
      }
      s.add(`${r.cntrct_nm}|${r.cntrct_date || ''}`)
    }
    return s
  }, [records])

  const isRegistered = useCallback((item: G2bCntrctItem) => {
    const cn = ctrtNoFromUrl(item.url)
    return (
      (!!cn && registeredKeys.has(cn)) ||
      (!!item.untyCntrctNo && registeredKeys.has(item.untyCntrctNo)) ||
      (!!item.cntrctNo && (registeredKeys.has(item.cntrctNo) ||
        (item.cntrctNo.length >= 13 && registeredKeys.has(item.cntrctNo.slice(0, -2))))) ||
      registeredKeys.has(`${item.name}|${item.cntrctDate}`)
    )
  }, [registeredKeys])

  // 프로젝트 나라장터 연계 계약(등록·수정 폼의 계약 연계)은 목록에 무조건 포함 — 미등록이면 자동 등록
  useEffect(() => {
    if (!user || !project || loading) return
    const no = (project.g2b_cntrct_no || project.g2b_ntce_no || '').replace(/\s+/g, '')
    if (!no) return
    const syncKey = `${projectId}|${no}`
    if (linkSyncTried.has(syncKey)) return
    linkSyncTried.add(syncKey)
    const sync = async () => {
      try {
        const res = await fetch(`/api/g2b/contract?no=${encodeURIComponent(no)}`)
        const json = await res.json()
        if (!res.ok || !json.success) return
        const c: G2bContractResp | undefined = json.data?.contracts?.[0]
        if (!c) return
        const item = contractRespToItem(c)
        if (isRegistered(item)) return
        const { error } = await (supabase as any)
          .from('project_contracts')
          .insert([itemToRow(item, projectId, user.id)])
        if (!error) loadRecords()
      } catch {
        // 자동 등록 실패는 조용히 무시 — 계약번호 탭으로 수동 등록 가능
      }
    }
    sync()
  }, [user, project, loading, projectId, isRegistered, loadRecords])

  // 조달청 조회 모달 열기 — 기관명·기간·검색어 프리필 (수불부 일괄 조회와 동일 패턴)
  const openLookup = () => {
    setIsLookupOpen(true)
    setModalTab('g2b')  // 열 때마다 조달청 조회 탭으로 초기화
    setLookupError('')
    if (!lookupFrom || !lookupTo) {
      const now = new Date()
      const from = new Date(now.getFullYear(), now.getMonth() - 11, 1)
      setLookupFrom(monthKey(from))
      setLookupTo(monthKey(now))
    }
    if (!lookupKeyword && project?.project_name) {
      setLookupKeyword(project.project_name.replace(/\s*(용역|공사)\s*$/, '').trim())
    }
  }

  // 기관명 프리필 — 프로젝트 본부·지사명 기준 (사용자가 직접 입력한 값은 유지)
  useEffect(() => {
    if (!project) return
    const guess = guessInstName(project.managing_branch || '')
    if (guess) {
      setLookupInst((prev) => prev || guess)
    } else if (project.g2b_cntrct_no) {
      fetch(`/api/g2b/contract?no=${encodeURIComponent(project.g2b_cntrct_no)}`)
        .then((res) => res.json())
        .then((json) => {
          const nm = json?.success ? json.data?.contracts?.[0]?.dminsttNms?.[0] : ''
          if (nm) setLookupInst((prev) => prev || nm)
        })
        .catch(() => {})
    }
  }, [project])

  const switchLookupDiv = (div: LookupDiv) => {
    if (div === lookupDiv) return
    setLookupDiv(div)
    setLookupItems(null)
    setLookupChecked(new Set())
    setLookupError('')
  }

  const applyPreset = (monthsBack: number) => {
    const now = new Date()
    const from = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1), 1)
    setLookupFrom(monthKey(from))
    setLookupTo(monthKey(now))
  }

  // 현재 기간 값이 프리셋과 일치하면 해당 버튼을 선택 상태로 표시 (기간 수동 변경 시 자동 해제)
  const isPresetActive = (monthsBack: number) => {
    const now = new Date()
    const from = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1), 1)
    return lookupFrom === monthKey(from) && lookupTo === monthKey(now)
  }

  const handleLookup = async () => {
    const inst = lookupInst.trim()
    if (inst.length < 2) { setLookupError('수요기관명을 2자 이상 입력해주세요.'); return }
    const months = buildMonths(lookupFrom, lookupTo)
    if (months.length === 0) { setLookupError('조회 기간을 확인해주세요.'); return }
    // 검색어의 첫 단어는 조달청 조회 조건으로 함께 전송 (원문 부분일치 — 단일 토큰만 안전).
    // 기관명 단독 조회는 무거운 달에서 월 30초+ 걸려(실측) 타임아웃으로 "조회가 안 되는" 증상을 만들지만,
    // 계약명 토큰을 함께 보내면 10초 내로 줄어든다. 나머지 단어는 조회 후 클라이언트에서 거른다.
    const keyword = lookupKeyword.trim()
    const nmToken = keyword.split(/\s+/)[0] || ''
    const nmParam = nmToken ? `&nm=${encodeURIComponent(nmToken)}` : ''
    setLookupLoading(true)
    setLookupError('')
    setLookupItems(null)
    setLookupChecked(new Set())
    setLookupProgress({ done: 0, total: months.length })
    // 공사·용역은 API 오퍼레이션(cnstwk/servc)이 분리라 월마다 두 구분을 모두 조회해 합친다
    const DIVS = ['cnstwk', 'servc'] as const
    const collected: G2bCntrctItem[] = []
    let firstError = ''
    let failCount = 0
    let done = 0
    const CONCURRENCY = 3
    try {
      for (let i = 0; i < months.length; i += CONCURRENCY) {
        const batch = months.slice(i, i + CONCURRENCY)
        await Promise.all(batch.map(async (m) => {
          let monthFailed = false
          await Promise.all(DIVS.map(async (div) => {
            try {
              const res = await fetch(`/api/g2b/cntrct-list?div=${div}&inst=${encodeURIComponent(inst)}&bgn=${m.bgn}&end=${m.end}${nmParam}`)
              const json = await res.json()
              if (!res.ok || !json.success) throw new Error(json.error || '조회에 실패했습니다.')
              collected.push(...(json.data?.items || []))
            } catch (err: unknown) {
              monthFailed = true
              if (!firstError) firstError = err instanceof Error ? err.message : '조회에 실패했습니다.'
            }
          }))
          if (monthFailed) failCount += 1
          done += 1
          setLookupProgress({ done, total: months.length })
        }))
      }
      // 월 경계 중복 dedupe → 같은 계약의 차수별 행은 최신 차수만 → 체결일 내림차순
      const byKey = new Map<string, G2bCntrctItem>()
      for (const item of collected) if (!byKey.has(item.key)) byKey.set(item.key, item)
      const items = latestPerContract([...byKey.values()])
        .sort((a, b) => (b.cntrctDate || '').localeCompare(a.cntrctDate || ''))
      setLookupItems(items)
      if (failCount === months.length && firstError) setLookupError(firstError)
      else if (firstError) setLookupError(`일부 구간 조회 실패: ${firstError}`)
    } finally {
      setLookupLoading(false)
    }
  }

  // 계약번호·공고번호 단건 조회 — 기존 /api/g2b/contract 재사용 (번호 유형 자동 판별)
  const handleNoLookup = async () => {
    const no = noInput.replace(/\s+/g, '')
    if (no.length < 5) { setLookupError('계약번호 또는 공고번호를 입력해주세요.'); return }
    setNoLoading(true)
    setLookupError('')
    setLookupItems(null)
    setLookupChecked(new Set())
    try {
      const res = await fetch(`/api/g2b/contract?no=${encodeURIComponent(no)}`)
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || '조회에 실패했습니다.')
      const contracts: G2bContractResp[] = json.data?.contracts || []
      // 차수 계약이 여러 건 조회되면 같은 계약은 최신 차수만 표시
      setLookupItems(latestPerContract(contracts.map(contractRespToItem)))
    } catch (err: unknown) {
      setLookupError(err instanceof Error ? err.message : '조회에 실패했습니다.')
    } finally {
      setNoLoading(false)
    }
  }

  const parseAmt = (s: string) => {
    const n = Number(s.replace(/[^0-9]/g, ''))
    return n > 0 ? n : null
  }
  const formatAmtInput = (s: string) =>
    s.replace(/[^0-9]/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')

  // 차수 행 추가 — 새 행 연도는 기존 최대 연도 +1로 제안
  const addThtmRow = () =>
    setMThtmRows((rows) => {
      const maxYear = Math.max(new Date().getFullYear() - 1, ...rows.map((r) => Number(r.year) || 0))
      return [...rows, { year: String(maxYear + 1), amt: '' }]
    })
  const updateThtmRow = (idx: number, patch: Partial<{ year: string; amt: string }>) =>
    setMThtmRows((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  const removeThtmRow = (idx: number) =>
    setMThtmRows((rows) => rows.filter((_, i) => i !== idx))

  // 직접 등록 — 차수(연도)별 금액 행마다 project_contracts 1행씩 저장.
  // 연도 컬럼 귀속(contractYear)이 금차 준공일을 우선 사용하므로 thtm_end_date를 해당 연도 말일로 채운다.
  const handleManualSave = async () => {
    if (!user) return
    if (!mForm.name.trim()) { alert('계약명을 입력해주세요.'); return }
    const entries = mThtmRows
      .map((r) => ({ year: r.year.trim(), amt: parseAmt(r.amt) }))
      .filter((r): r is { year: string; amt: number } => r.amt != null)
    if (entries.some((r) => !/^\d{4}$/.test(r.year))) {
      alert('차수별 계약금액의 연도를 4자리로 입력해주세요.')
      return
    }
    setMSaving(true)
    try {
      // 총액 미입력 시 차수 금액이 여러 건이면 합계로 보완 — 총액=금차인 단건은 단년도 계약으로 취급
      const totAmt = parseAmt(mForm.totAmt) ?? (entries.length > 1 ? entries.reduce((s, r) => s + r.amt, 0) : null)
      const base = {
        project_id: projectId,
        created_by: user.id,
        contract_type: mForm.type,
        cntrct_nm: mForm.name.trim(),
        corp_nm: mForm.corp.trim() || null,
        tot_cntrct_amt: totAmt,
        cntrct_date: mForm.cntrctDate || null,
        start_date: mForm.startDate || null,
        end_date: mForm.endDate || null,
        dminstt_nm: mForm.dminstt.trim() || null,
      }
      const rows = entries.length === 0
        ? [{ ...base, thtm_cntrct_amt: null, thtm_end_date: null }]
        : entries.map((r) => ({ ...base, thtm_cntrct_amt: r.amt, thtm_end_date: `${r.year}-12-31` }))
      const { error } = await (supabase as any).from('project_contracts').insert(rows)
      if (error) throw error
      setMForm((p) => ({ ...p, name: '', corp: '', totAmt: '', cntrctDate: '', startDate: '', endDate: '', dminstt: '' }))
      setMThtmRows([{ year: String(new Date().getFullYear()), amt: '' }])
      await loadRecords()
      setIsLookupOpen(false)
      alert('등록되었습니다.')
    } catch (err: unknown) {
      alert('등록 실패: ' + (err instanceof Error ? err.message : '알 수 없는 오류'))
    } finally {
      setMSaving(false)
    }
  }

  // 계약명 클라이언트 필터 — 공백 제거 후 단어 OR 부분일치, 일치 단어 많은 순 (계약번호 조회 결과에는 미적용)
  const visibleItems = useMemo(() => {
    if (!lookupItems) return []
    if (lookupDiv === 'byno') return lookupItems
    const tokens = lookupKeyword.trim().split(/\s+/).map((t) => t.replace(/\s+/g, '')).filter(Boolean)
    if (tokens.length === 0) return lookupItems
    const matchCount = (item: G2bCntrctItem) => {
      const name = item.name.replace(/\s+/g, '')
      return tokens.filter((t) => name.includes(t)).length
    }
    return lookupItems
      .map((item) => ({ item, hits: matchCount(item) }))
      .filter((x) => x.hits > 0)
      .sort((a, b) => b.hits - a.hits || (b.item.cntrctDate || '').localeCompare(a.item.cntrctDate || ''))
      .map((x) => x.item)
  }, [lookupItems, lookupKeyword, lookupDiv])

  const selectableItems = useMemo(() => visibleItems.filter((i) => !isRegistered(i)), [visibleItems, isRegistered])
  const allSelected = selectableItems.length > 0 && selectableItems.every((i) => lookupChecked.has(i.key))

  const toggleAll = () => {
    setLookupChecked((prev) => {
      if (allSelected) {
        const next = new Set(prev)
        selectableItems.forEach((i) => next.delete(i.key))
        return next
      }
      return new Set([...prev, ...selectableItems.map((i) => i.key)])
    })
  }

  const handleImport = async () => {
    if (!user || !lookupItems) return
    const targets = lookupItems.filter((i) => lookupChecked.has(i.key) && !isRegistered(i))
    if (targets.length === 0) return
    setImporting(true)
    try {
      const rows = targets.map((i) => itemToRow(i, projectId, user.id))
      const { error } = await (supabase as any).from('project_contracts').insert(rows)
      if (error) throw error
      setLookupChecked(new Set())
      await loadRecords()
      // 차수분 계약(총액≠금차)은 조회 기간 밖의 이전 연차 계약이 있을 수 있다 — 업데이트 버튼의 역탐색 안내
      const hasPartial = targets.some((i) => isThtmPartial(i.totAmt, i.thtmAmt))
      alert(
        `${rows.length}건이 등록되었습니다.` +
        (hasPartial ? '\n\n장기계속계약 차수가 포함되어 있습니다. 상단 "업데이트" 버튼을 누르면 조회 기간 밖의 이전 연차(차수) 계약을 자동 탐색해 추가합니다.' : '')
      )
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류'
      alert('등록 실패: ' + message)
    } finally {
      setImporting(false)
    }
  }

  // 등록 건 일괄 갱신 — ① 번호가 있는 행을 조달청 최신 계약정보로 갱신하고,
  // ② 장기계속계약의 미등록 연차(차수) 계약을 수요기관명+계약명 월별 목록 조회로 탐색해 신규 등록
  //    (3차년도만 등록된 경우의 과거 1·2차년도처럼 등록 차수보다 앞선 연차도 거슬러 탐색.
  //    연차를 연도로만 표기하는 계약명은 총공사 일수 역산으로 탐색 시작월을 잡는다).
  // 연차별 차수 계약은 확정·통합·공고번호가 전부 달라(2026-07-07·07-12 실호출 확정) 어떤 번호 재조회로도
  // 다른 연차가 나오지 않는다 — 신규 연차 발견은 기간 목록 조회가 유일한 경로다.
  const openRefreshConfirm = () => {
    if (!user || refreshing) return
    const targets = records.filter((r) => r.cntrct_no || r.unty_cntrct_no)

    // 신규 연차 탐색 대상: 미등록 차수가 있는 계약 + 기관명 확보 가능.
    // ① 금차 합 < 총액 → 미등록 차수 존재(과거·미래 불문), ② 차수 번호 1..최대 중 빠진 번호 → 과거 연차 누락
    const nowKey = monthKey(new Date())
    const scanPlans: RefreshScanPlan[] = groups.flatMap((g) => {
      const tot = g.repr.tot_cntrct_amt || 0
      const thtmSum = g.members.reduce((s, m) => s + (m.thtm_cntrct_amt || 0), 0)
      const ords = g.members.map((m) => iterOrdFromName(m.cntrct_nm))
      const maxOrd = Math.max(...ords)
      const ordSet = new Set(ords)
      // 등록 차수보다 앞선 미등록 연차(1차 등) 존재 여부 — 초기 차수의 금차가 0인 계약은
      // 금액 조건만으로 과거 누락을 못 잡아(실사례) 차수 번호로도 판정한다
      const missingPast = maxOrd > 1 && Array.from({ length: maxOrd - 1 }, (_, i) => i + 1).some((o) => !ordSet.has(o))
      const amountShort = tot > 0 && thtmSum < tot
      if (!missingPast && !amountShort) return []
      // 서버 목록 조회가 수요기관명 기준(insttDivCd=2)이므로 수요기관명을 우선 사용 —
      // 조달청 위탁계약은 계약기관명이 '조달청 ○○지방조달청'이라 검색어로 쓰면 걸리지 않는다
      const inst =
        ((g.repr.dminstt_nm || '').split(',')[0] || '').trim() ||
        guessInstName(project?.managing_branch || '') ||
        (g.repr.cntrct_instt_nm || '').trim()
      const lastDate = g.members.reduce((max, m) => ((m.cntrct_date || '') > max ? (m.cntrct_date as string) : max), '')
      if (inst.length < 2 || !lastDate) return []
      // 조회 시작월 — 과거 연차가 빠져 있으면 연차가 대략 1년 간격인 점을 이용해
      // 가장 이른 등록 차수 체결월에서 (최소차수-1)년 + 여유 2개월을 거슬러 시작.
      // 과거 누락이 없으면 새 연차는 최신 차수 체결월 이후에만 체결되므로 그 구간만 조회 (최대 36개월)
      let fromMonth = lastDate.slice(0, 7)
      if (missingPast) {
        const firstDate = g.members.reduce(
          (min, m) => ((m.cntrct_date || '') && (m.cntrct_date as string) < min ? (m.cntrct_date as string) : min),
          '9999-12'
        )
        const minOrd = Math.min(...ords)
        const [fy, fm] = firstDate.slice(0, 7).split('-').map(Number)
        fromMonth = monthKey(new Date(fy, fm - 1 - ((minOrd - 1) * 12 + 2), 1))
      }
      // 연차를 연도로만 표기하는 계약명(차수 접미어 없음)은 차수 번호로 과거 누락을 못 잡는다 —
      // 금차 합이 총액에 못 미치면 계약기간의 총 일수(예: '총공사 1135일')로 사업 시작월을 역산해
      // 그 시점(여유 1개월)부터 탐색한다 (2026-07-12 실호출 확인)
      if (amountShort) {
        const dm = (g.repr.cntrct_prd || '').match(/총\S*\s*([\d,]+)\s*일/)
        const totalDays = dm ? Number(dm[1].replace(/,/g, '')) : 0
        if (totalDays > 0 && g.endDate) {
          const d = new Date(g.endDate)
          d.setDate(d.getDate() - totalDays)
          d.setMonth(d.getMonth() - 1)
          const est = monthKey(d)
          if (est < fromMonth) fromMonth = est
        }
      }
      const months = buildMonths(fromMonth, nowKey).slice(-36)
      if (months.length === 0) return []
      // 서버측 계약명 필터는 원문 부분일치 단일 토큰만 안전 — 지구명인 첫 단어가 가장 안정적
      const firstToken = g.repr.cntrct_nm.trim().split(/\s+/)[0] || ''
      return [{ g, inst, nm: firstToken.length >= 2 ? firstToken : '', months }]
    })

    if (targets.length === 0 && scanPlans.length === 0) {
      alert('갱신할 계약번호가 있는 등록 건이 없습니다.')
      return
    }
    setRefreshTypes(new Set(['공사', '용역']))
    setRefreshConfirm({ targets, scanPlans })
  }

  // 조회 소요 시간 실측치(2026-07-13, 개발서버→조달청 API) — 두 단계 모두 3건 동시 호출이라 배치당
  // 최장 응답이 지배. ①단계 번호 재조회는 호출당 2.9~5.6초(유형 힌트로 하한 근접), ②단계 월별 목록 조회는 4.6~8.6초
  const STEP1_SEC_PER_BATCH = 6
  const STEP2_SEC_PER_BATCH = 9
  const estimateRefreshSeconds = (targets: ContractRecord[], plans: RefreshScanPlan[]) =>
    Math.ceil(
      Math.ceil(targets.length / 3) * STEP1_SEC_PER_BATCH +
      plans.reduce((s, p) => s + Math.ceil(p.months.length / 3), 0) * STEP2_SEC_PER_BATCH
    )

  const handleRefreshAll = async () => {
    if (!user || refreshing || !refreshConfirm) return
    const targets = refreshConfirm.targets.filter((r) => refreshTypes.has(r.contract_type))
    const scanPlans = refreshConfirm.scanPlans.filter((p) => refreshTypes.has(p.g.repr.contract_type))
    setRefreshConfirm(null)
    if (targets.length === 0 && scanPlans.length === 0) return
    setRefreshing(true)
    setRefreshProgress({ done: 0, total: targets.length + scanPlans.reduce((s, p) => s + p.months.length, 0) })
    let updated = 0
    let inserted = 0
    const failures: string[] = []

    // knownKeys: 이미 등록된 계약의 식별자 집합.
    // unty_cntrct_no(통합계약번호)는 같은 계약도 조회 경로마다 다른 변형 값이 붙어(실측) 식별자로 부적합 — 제외.
    // 계약명 키는 공백 제거로 정규화 (등록 행에 뒤공백이 붙은 실사례 대응)
    const nameDateKey = (name: string, date: string) => `${name.replace(/\s+/g, '')}|${date}`
    const knownKeys = new Set<string>()
    for (const rec of records) {
      const cn = ctrtNoFromUrl(rec.cntrct_info_url)
      if (cn) knownKeys.add(cn)
      if (rec.cntrct_no) {
        knownKeys.add(rec.cntrct_no)
        if (rec.cntrct_no.length >= 13) knownKeys.add(rec.cntrct_no.slice(0, -2))
      }
      knownKeys.add(nameDateKey(rec.cntrct_nm, rec.cntrct_date || ''))
    }
    const isKnown = (item: G2bCntrctItem) => {
      const cn = ctrtNoFromUrl(item.url)
      return (
        (!!cn && knownKeys.has(cn)) ||
        (!!item.cntrctNo && (knownKeys.has(item.cntrctNo) ||
          (item.cntrctNo.length >= 13 && knownKeys.has(item.cntrctNo.slice(0, -2))))) ||
        knownKeys.has(nameDateKey(item.name, item.cntrctDate))
      )
    }
    const insertItem = async (item: G2bCntrctItem) => {
      const { data, error } = await (supabase as any)
        .from('project_contracts')
        .insert([itemToRow(item, projectId, user.id)])
        .select('id')
      if (error) throw error
      if (data && data.length > 0) {
        inserted += 1
        const cn = ctrtNoFromUrl(item.url)
        if (cn) knownKeys.add(cn)
        if (item.cntrctNo) {
          knownKeys.add(item.cntrctNo)
          if (item.cntrctNo.length >= 13) knownKeys.add(item.cntrctNo.slice(0, -2))
        }
        knownKeys.add(nameDateKey(item.name, item.cntrctDate))
      }
    }

    // 기존 등록 건 매칭: cntrctNo(확정계약번호)와 계약명+체결일 기준으로만 매칭 (unty는 변형이 있어 제외)
    const findExistingRecord = (c: G2bContractResp) => {
      return records.find((r) => {
        if (c.cntrctNo && r.cntrct_no === c.cntrctNo) return true
        if (nameDateKey(r.cntrct_nm, r.cntrct_date || '') === nameDateKey(c.cnstwkNm, c.cntrctCnclsDate)) return true
        return false
      })
    }

    try {
      const CONCURRENCY = 3
      // ① 등록 건 번호 재조회 갱신 — 같은 차수의 변경계약(금액·기간 변경) 반영.
      // 조달청 조회(건당 3~6초)가 시간을 지배하므로 3건 동시 호출하고, 유형(div) 힌트로 서버가 해당 구분
      // 오퍼레이션부터 조회하게 한다. DB 반영·knownKeys 갱신은 중복 등록 경합이 없도록 배치 후 순차 처리
      for (let i = 0; i < targets.length; i += CONCURRENCY) {
        const fetched = await Promise.all(targets.slice(i, i + CONCURRENCY).map(async (r) => {
          try {
            const no = r.unty_cntrct_no || r.cntrct_no || ''
            const div = r.contract_type === '용역' ? 'servc' : 'cnstwk'
            const res = await fetch(`/api/g2b/contract?no=${encodeURIComponent(no)}&div=${div}`)
            const json = await res.json()
            if (!res.ok || !json.success) throw new Error(json.error || '조회 실패')
            const contracts: G2bContractResp[] = json.data?.contracts || []
            if (contracts.length === 0) throw new Error('조회 결과 없음')
            return { r, contracts }
          } catch (err: unknown) {
            failures.push(`${r.cntrct_nm} (${err instanceof Error ? err.message : '오류'})`)
            return null
          } finally {
            setRefreshProgress((p) => ({ ...p, done: p.done + 1 }))
          }
        }))
        for (const result of fetched) {
          if (!result) continue
          try {
            for (const c of result.contracts) {
              const item = contractRespToItem(c)
              if (isKnown(item)) {
                const existing = findExistingRecord(c)
                if (existing) {
                  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
                  if (c.totCntrctAmt > 0) patch.tot_cntrct_amt = c.totCntrctAmt
                  if (c.thtmCntrctAmt > 0) patch.thtm_cntrct_amt = c.thtmCntrctAmt
                  if (c.cntrctCnclsDate) patch.cntrct_date = c.cntrctCnclsDate
                  if (c.cntrctPrd) patch.cntrct_prd = c.cntrctPrd
                  if (c.startDate) patch.start_date = c.startDate
                  if (c.endDate) patch.end_date = c.endDate
                  if (c.thtmEndDate) patch.thtm_end_date = c.thtmEndDate
                  if ((c.corpNms || []).length > 0) patch.corp_nm = c.corpNms.join(', ')
                  if ((c.dminsttNms || []).length > 0) patch.dminstt_nm = c.dminsttNms.join(', ')
                  if (c.untyCntrctNo) patch.unty_cntrct_no = c.untyCntrctNo
                  if (c.cntrctNo) patch.cntrct_no = c.cntrctNo
                  if (c.cntrctDtlInfoUrl || c.cntrctInfoUrl) patch.cntrct_info_url = c.cntrctDtlInfoUrl || c.cntrctInfoUrl

                  const { data, error } = await (supabase as any)
                    .from('project_contracts')
                    .update(patch)
                    .eq('id', existing.id)
                    .select('id')
                  if (error) throw error
                  if (data && data.length > 0) updated += 1
                }
              } else {
                await insertItem(item)
              }
            }
          } catch (err: unknown) {
            failures.push(`${result.r.cntrct_nm} (${err instanceof Error ? err.message : '오류'})`)
          }
        }
      }

      // ② 신규 연차(차수) 계약 탐색 — 최신 차수 체결월부터 이번 달까지 월별 목록 조회
      for (const plan of scanPlans) {
        const div = plan.g.repr.contract_type === '용역' ? 'servc' : 'cnstwk'
        const nmParam = plan.nm ? `&nm=${encodeURIComponent(plan.nm)}` : ''
        const found: G2bCntrctItem[] = []
        let scanFailed = 0
        for (let i = 0; i < plan.months.length; i += CONCURRENCY) {
          const batch = plan.months.slice(i, i + CONCURRENCY)
          await Promise.all(batch.map(async (m) => {
            try {
              const res = await fetch(`/api/g2b/cntrct-list?div=${div}&inst=${encodeURIComponent(plan.inst)}&bgn=${m.bgn}&end=${m.end}${nmParam}`)
              const json = await res.json()
              if (!res.ok || !json.success) throw new Error(json.error || '조회 실패')
              found.push(...(json.data?.items || []))
            } catch {
              scanFailed += 1
            } finally {
              setRefreshProgress((p) => ({ ...p, done: p.done + 1 }))
            }
          }))
        }
        // 같은 계약(계약명 공백 제거 일치)의 미등록 차수만 등록 — 변경차수는 최신만
        const candidates = latestPerContract(
          found.filter((it) => nameGroupKey(it.type, it.name, isThtmPartial(it.totAmt, it.thtmAmt)) === plan.g.key)
        )
        for (const item of candidates) {
          if (isKnown(item)) continue
          try {
            await insertItem(item)
          } catch (err: unknown) {
            failures.push(`${item.name} (${err instanceof Error ? err.message : '등록 실패'})`)
          }
        }
        if (scanFailed > 0) {
          failures.push(`${plan.g.repr.cntrct_nm.trim()} (신규 차수 탐색 ${scanFailed}개월 조회 실패)`)
        }
      }

      await loadRecords()
      alert(
        `업데이트 완료\n- 기존 계약 정보 갱신: ${updated}건\n- 미등록 연차(차수) 계약 추가: ${inserted}건` +
        (failures.length
          ? `\n\n일부 갱신 실패/건너뜀 ${failures.length}건:\n- ${failures.slice(0, 5).join('\n- ')}${failures.length > 5 ? '\n…' : ''}`
          : '')
      )
    } finally {
      setRefreshing(false)
    }
  }

  // 계약 완료 자동 판정 — 그룹의 최종 준공(완수)일이 오늘 이전이면 계약 절차가 끝난 것으로 본다.
  // 대금지급 여부 자체는 조달청 공개 API가 없어(2026-07-12 확인) 준공일 경과를 완료 기준으로 사용.
  // 준공일은 "업데이트" 버튼의 조달청 재조회로 최신화된다(기간 연장 변경계약 반영)
  const todayIso = new Date().toISOString().slice(0, 10)
  const isGroupCompleted = (g: ContractGroup) => !!g.endDate && g.endDate < todayIso

  const handleDelete = async (g: ContractGroup) => {
    const label =
      g.members.length > 1
        ? `"${g.repr.cntrct_nm}" 계약(차수 ${g.members.length}건 포함)`
        : `"${g.repr.cntrct_nm}" 계약`
    if (!confirm(`${label}을 삭제하시겠습니까?`)) return
    const { error } = await (supabase as any)
      .from('project_contracts')
      .delete()
      .in('id', g.members.map((m) => m.id))
    if (!error) loadRecords()
    else alert('삭제 실패: ' + error.message)
  }

  // 펼쳐본 차수 행 개별 삭제 — 그룹 전체가 아닌 해당 차수 등록 행 1건만 삭제
  const handleDeleteMember = async (m: ContractRecord) => {
    if (!confirm(`"${m.cntrct_nm}" 차수 계약 1건을 삭제하시겠습니까?`)) return
    const { error } = await (supabase as any)
      .from('project_contracts')
      .delete()
      .eq('id', m.id)
    if (!error) loadRecords()
    else alert('삭제 실패: ' + error.message)
  }

  // 대표계약 지정 — 프로젝트에 대표계약 1건(계약 행 id)만 저장해 단일 선택을 보장.
  // 목록은 차수 병합 그룹 단위라, 그룹 멤버 중 저장된 id가 있으면 대표로 표시한다.
  // 명시적으로 저장된 대표가 없으면, 편집 페이지에서 연계한 나라장터 계약(프로젝트 기본 계약)을
  // 기본 대표로 간주해 이미 체크된 상태로 보인다 — 이미 등록된 계약이므로.
  const g2bLinkedRepId = useMemo<string | null>(() => {
    if (!project) return null
    const no = (project.g2b_cntrct_no || project.g2b_ntce_no || '').replace(/\s+/g, '')
    if (!no) return null
    const noBase = no.length >= 13 ? no.slice(0, -2) : no
    const match = records.find((r) => {
      if (r.cntrct_no && (r.cntrct_no === no || (r.cntrct_no.length >= 13 && r.cntrct_no.slice(0, -2) === noBase))) return true
      if (r.unty_cntrct_no && r.unty_cntrct_no === no) return true
      if (ctrtNoFromUrl(r.cntrct_info_url) === no) return true
      return false
    })
    return match?.id ?? null
  }, [project, records])
  const representativeId = project?.representative_contract_id ?? g2bLinkedRepId
  const isGroupRepresentative = useCallback(
    (g: ContractGroup) => !!representativeId && g.members.some((m) => m.id === representativeId),
    [representativeId]
  )
  const handleToggleRepresentative = async (g: ContractGroup) => {
    if (!project) return
    const prevProject = project
    const nextId = isGroupRepresentative(g) ? null : g.repr.id
    // 체크 시 편집 페이지의 나라장터 연계(g2b_*)도 대표계약 값으로 동기화 —
    // 대표계약과 편집 폼의 연계 계약은 같은 '프로젝트 대표 1건' 개념이라 함께 움직여야
    // 편집 페이지 연계 박스에 대표계약이 뜬다. 해제 시에는 연계를 지우지 않는다(기존 기본 대표 유지).
    const sync = nextId
      ? {
          g2b_cntrct_no: g.repr.cntrct_no || null,
          g2b_ntce_no: null, // 이전 연계 계약의 공고번호가 남으면 번호가 서로 다른 계약을 가리키므로 정리
          g2b_corp_nm: g.repr.corp_nm || null,
          g2b_tot_amt: g.repr.tot_cntrct_amt ?? null,
          g2b_thtm_amt: g.repr.thtm_cntrct_amt ?? null,
          // 대표계약의 계약 기간(멤버 최초 착수일~최종 준공일)을 프로젝트 착공·준공일에도 반영
          ...(g.startDate ? { construction_start_date: g.startDate } : {}),
          ...(g.endDate ? { construction_end_date: g.endDate } : {}),
        }
      : {}
    setProject({ ...project, representative_contract_id: nextId, ...sync }) // 낙관적 업데이트
    const { error } = await (supabase as any)
      .from('projects')
      .update({ representative_contract_id: nextId, ...sync })
      .eq('id', projectId)
    if (error) {
      setProject(prevProject) // 실패 시 롤백
      alert('대표계약 설정 실패: ' + error.message)
    }
  }

  const handleExcelExport = async () => {
    if (!project) return
    const exportRows: ContractExcelRow[] = sortedGroups.map((g) => {
      const r = g.repr
      const yearAmtsRecord: Record<string, number> = {}
      for (const [y, amt] of g.yearAmts.entries()) {
        yearAmtsRecord[y] = amt
      }

      return {
        type: r.contract_type,
        name: r.cntrct_nm,
        memberCount: g.members.length,
        corp: r.corp_nm || '',
        totAmt: r.tot_cntrct_amt,
        yearAmts: yearAmtsRecord,
        cntrctDate: r.cntrct_date || '',
        period: g.startDate && g.endDate ? `${g.startDate} ~ ${g.endDate}` : (r.cntrct_prd || ''),
        dminstt: r.dminstt_nm || '',
      }
    })

    try {
      await downloadContractStatusExcel(
        project.project_name,
        yearCols,
        thisYear,
        exportRows
      )
    } catch (err) {
      console.error(err)
      alert('엑셀 다운로드 중 오류가 발생했습니다.')
    }
  }

  // 계약명 컬럼 폭(px) — 사용자 조정값 우선, 없으면 평상시 256px·가로 스크롤 중 5글자 정도(104px)
  const nameW = nameColPx ?? (hScrolled ? 104 : 256)
  // 사용자 조정값이 없을 때만 스크롤 축소가 동작 — 라벨 줄바꿈/말줄임 전환도 실제 접힘 여부를 따른다
  const nameCollapsed = nameColPx === null && hScrolled

  // 합계행 렌더 — 총 합계·공사/용역/물품 소계 공용 (총액은 계약 단위로 1회만 합산 — 차수 중복 합산 방지)
  const renderTotalRow = (label: string, list: TotalRowItem[], rowClass: string, thisYearCellClass: string, suffix?: ReactNode) => (
    <tr className={`border-b border-gray-200 font-semibold text-gray-700 ${rowClass}`}>
      <td colSpan={2} />
      {/* 라벨은 계약명 컬럼 자리에서 좌측 고정 — 고정 셀은 뒤가 비치면 안 되므로 rowClass는 불투명색이어야 한다.
          긴 라벨이 컬럼 폭을 밀어 넓히지 않도록 max-w + 평상시 줄바꿈 허용, 접힘 중엔 말줄임 */}
      <td style={{ maxWidth: nameW }} className={`px-3 py-2 sticky left-0 z-[1] bg-inherit shadow-[inset_-1px_0_0_#e5e7eb] ${nameCollapsed ? 'truncate' : 'whitespace-normal'}`}>{label} ({list.length}건){suffix}{nameResizeHandle}</td>
      <td />
      <td className="px-3 py-2 text-right tabular-nums">
        {list.reduce((s, g) => s + g.tot, 0).toLocaleString('ko-KR')}
      </td>
      {yearCols.map((y) => (
        <td key={y} className={`px-3 py-2 text-right tabular-nums ${y === thisYear ? thisYearCellClass : ''}`}>
          {list.reduce((s, g) => s + (g.yearAmts.get(y) || 0), 0).toLocaleString('ko-KR')}
        </td>
      ))}
      <td colSpan={4} />
    </tr>
  )

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    )
  }
  if (!user) return null

  return (
    <div className="min-h-screen relative bg-gradient-to-b from-blue-950 via-blue-900 to-slate-900">
      {/* 헤더 */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="px-4">
          <div className="flex items-center h-16 gap-3">
            <button onClick={handleBack} className="text-gray-400 hover:text-gray-600 shrink-0">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-base sm:text-xl font-bold text-gray-900 truncate">계약(공사·용역) 현황</h1>
              {project && <p className="text-xs text-gray-500 truncate">{project.project_name}</p>}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-none mx-auto py-4 px-2 sm:px-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-blue-600 text-white px-4 py-3 flex flex-wrap items-center justify-between gap-y-2 gap-x-2">
            <h2 className="font-semibold text-sm sm:text-base w-full sm:w-auto">
              계약 현황
              {(records.length > 0 || materialGroups.length > 0) && (
                <span className="ml-2 text-xs font-normal text-blue-100">
                  공사 {cnstwkCount}건 · 용역 {servcCount}건 · 물품 {materialGroups.length}건
                </span>
              )}
            </h2>
            <div className="flex items-center gap-2 shrink-0 ml-auto sm:ml-0">
              <button
                onClick={handleExcelExport}
                title="엑셀 다운"
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-white text-blue-700 rounded-lg hover:bg-blue-50"
              >
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">엑셀 다운</span>
              </button>
              <button
                onClick={openRefreshConfirm}
                disabled={refreshing}
                title="등록된 계약을 조달청 최신 정보로 갱신하고 새 연차(차수) 계약을 탐색해 추가"
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-white text-blue-700 rounded-lg hover:bg-blue-50 disabled:opacity-60"
              >
                {refreshing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="hidden sm:inline">{refreshProgress.done}/{refreshProgress.total}</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4" />
                    <span className="hidden sm:inline">업데이트</span>
                  </>
                )}
              </button>
              <button
                onClick={openLookup}
                title="추가"
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-white text-blue-700 rounded-lg hover:bg-blue-50"
              >
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">추가</span>
              </button>
            </div>
          </div>

          {loading || matLoading ? (
            <div className="flex justify-center py-20"><LoadingSpinner /></div>
          ) : sortedGroups.length === 0 && materialGroups.length === 0 ? (
            <div className="text-center py-16 px-4">
              <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500 mb-4">등록된 계약이 없습니다. 조달청 조회 또는 직접 등록으로 공사·용역 계약을 추가하세요.</p>
              <button
                onClick={openLookup}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />
                추가
              </button>
            </div>
          ) : (
            <div
              className="overflow-auto max-h-[calc(100vh-9.5rem)]"
              onScroll={(e) => setHScrolled(e.currentTarget.scrollLeft > 8)}
            >
              {/* 세로 스크롤은 이 컨테이너 내부에서 발생해야 제목행 sticky가 동작 — 상단 헤더·카드 제목 높이만큼 제외 */}
              <table className="w-full text-sm whitespace-nowrap">
                <thead>
                  {/* 제목행: 세로 스크롤 시 상단 고정. 계약명 컬럼만 좌측 고정 — 대표·구분은 가로 스크롤 시 계약명 아래로 사라진다 */}
                  <tr className="bg-gray-50 text-xs text-gray-500 border-b border-gray-200">
                    <th className={`${TH_STICKY} z-[2] w-[72px] bg-gray-50`}>대표</th>
                    <th className={`${TH_STICKY} z-[2] w-[72px] bg-gray-50`}>구분</th>
                    {/* TH_STICKY 미사용 — 하단선+우측 구분선을 한 그림자로 합쳐야 해서(shadow 유틸 중복 충돌 방지) 개별 지정 */}
                    <th style={{ width: nameW }} className="px-3 py-2 text-center font-medium sticky top-0 left-0 z-[3] bg-gray-50 shadow-[inset_-1px_-1px_0_#e5e7eb]">
                      계약명
                      {/* 우측 경계 드래그로 폭 조정(더블클릭 시 초기화) — 조정값은 localStorage에 보존 */}
                      {nameResizeHandle}
                    </th>
                    <th className={`${TH_STICKY} z-[2] bg-gray-50`}>계약상대자</th>
                    <th className={`${TH_STICKY} z-[2] bg-gray-50`}>총계약금액(원)</th>
                    {yearCols.map((y) => (
                      <th key={y} className={`${TH_STICKY} z-[2] ${y === thisYear ? 'bg-[#fdf5d7] text-amber-800' : 'bg-gray-50'}`}>
                        {y === '기타' ? '연도미상(원)' : `${y.slice(2)}년(원)`}
                      </th>
                    ))}
                    <th className={`${TH_STICKY} z-[2] bg-gray-50`}>계약체결일</th>
                    <th className={`${TH_STICKY} z-[2] bg-gray-50`}>계약기간</th>
                    <th className={`${TH_STICKY} z-[2] bg-gray-50`}>수요기관</th>
                    <th className={`${TH_STICKY} z-[2] bg-gray-50`}>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {/* 총 합계행 — 제목행 바로 아래 (공사·용역 계약 + 물품 지급자재 합산) */}
                  {renderTotalRow('총 합계', [...groups.map(toTotalItem), ...materialGroups.map(matToTotalItem)], 'bg-[#e2eefe]', 'bg-amber-100/60')}
                  {sortedGroups.map((g, idx) => {
                    const r = g.repr
                    const isRep = isGroupRepresentative(g)
                    const isDone = isGroupCompleted(g)
                    // 나라장터 대금지급 문서 누계가 총액에 도달하면 지급완료 (부분지급은 뱃지 없이 준공경과 완료만 표시)
                    const gPays = paysForGroup(g)
                    const paySum = gPays.reduce((s, p) => s + p.amt, 0)
                    const isPaidFull = (r.tot_cntrct_amt || 0) > 0 && paySum >= (r.tot_cntrct_amt || 0)
                    const lastPayDate = gPays.reduce((d, p) => (p.payDate > d ? p.payDate : d), '')
                    const expanded = expandedKeys.has(g.key)
                    // 구분(공사→용역)이 바뀌는 첫 행 위에 해당 구분의 소계행 삽입
                    const prevType = idx > 0 ? sortedGroups[idx - 1].repr.contract_type : null
                    return (
                    <Fragment key={g.key}>
                    {r.contract_type !== prevType &&
                      renderTotalRow(
                        `${r.contract_type} 소계`,
                        groups.filter((x) => x.repr.contract_type === r.contract_type).map(toTotalItem),
                        r.contract_type === '공사' ? 'bg-[#f5faff]' : 'bg-[#f6fef8]',
                        'bg-amber-100/40'
                      )}
                    <tr className={`group border-b border-gray-100 ${isRep ? 'bg-amber-50' : 'hover:bg-gray-50'}`}>
                      <td className="px-3 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleRepresentative(g)}
                          className={`px-2 py-0.5 rounded-full text-xs font-semibold cursor-pointer transition-colors ${
                            isRep
                              ? 'bg-amber-500 text-white'
                              : 'text-gray-300 border border-dashed border-gray-300 hover:text-amber-500 hover:border-amber-400'
                          }`}
                          title={isRep ? '대표계약 해제' : '대표계약으로 지정'}
                        >
                          대표
                        </button>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                          r.contract_type === '공사' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                        }`}>
                          {r.contract_type}
                        </span>
                      </td>
                      {/* 좌측 고정 셀은 tr 배경이 안 따라오므로 자체 배경 + group-hover로 행 호버색 동기화 */}
                      <td style={{ maxWidth: nameW }} className={`px-3 py-2 overflow-hidden sticky left-0 z-[1] shadow-[inset_-1px_0_0_#e5e7eb] ${isRep ? 'bg-amber-50' : 'bg-white group-hover:bg-gray-50'}`}>
                        {isDetailUrl(r.cntrct_info_url) ? (
                          <a
                            href={r.cntrct_info_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline inline-flex items-center gap-1 max-w-full"
                            title={r.cntrct_nm}
                          >
                            <TailTruncate text={r.cntrct_nm} />
                            <ExternalLink className="h-3 w-3 shrink-0" />
                          </a>
                        ) : (
                          <TailTruncate text={r.cntrct_nm} className="block" title={r.cntrct_nm} />
                        )}
                        {(isDone || isPaidFull || g.members.length > 1) && (
                        <span className="flex items-center gap-2">
                          {/* 지급완료(나라장터 대금지급 문서 누계=총액) > 완료(준공일 경과) 순으로 강한 신호 하나만 표시 */}
                          {isPaidFull ? (
                            <span
                              className="px-1.5 py-px rounded-full text-[10px] font-semibold bg-emerald-500 text-white"
                              title={`나라장터 대금지급 누계 ${formatAmt(paySum)}원 (${gPays.length}건) · 최근 지급 ${lastPayDate || '-'}`}
                            >
                              지급완료
                            </span>
                          ) : isDone && (
                            <span
                              className="px-1.5 py-px rounded-full text-[10px] font-semibold bg-emerald-500 text-white"
                              title={`최종 준공일(${g.endDate}) 경과 — 계약 절차 종료${paySum > 0 ? ` · 나라장터 대금지급 누계 ${formatAmt(paySum)}원` : ''}`}
                            >
                              완료
                            </span>
                          )}
                          {g.members.length > 1 && (
                            <span className="flex items-center gap-1 text-[11px] text-gray-400">
                              장기계속 · 차수 {g.members.length}건 병합
                              <button
                                type="button"
                                onClick={() => toggleExpanded(g.key)}
                                className="w-4 h-4 flex items-center justify-center rounded border border-gray-300 text-gray-500 leading-none hover:bg-gray-100 hover:text-gray-700"
                                title={expanded ? '병합된 차수 접기' : '병합된 차수 펼쳐보기'}
                              >
                                {expanded ? '−' : '+'}
                              </button>
                            </span>
                          )}
                        </span>
                        )}
                        {nameResizeHandle}
                      </td>
                      <td className="px-3 py-2 max-w-[180px] xl:max-w-none truncate" title={r.corp_nm || ''}>{r.corp_nm || '-'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatAmt(r.tot_cntrct_amt)}</td>
                      {yearCols.map((y) => (
                        <td key={y} className={`px-3 py-2 text-right tabular-nums ${y === thisYear ? 'bg-amber-50/70' : ''}`}>
                          {g.yearAmts.has(y) ? formatAmt(g.yearAmts.get(y)) : '-'}
                        </td>
                      ))}
                      <td className="px-3 py-2">{shortDate(r.cntrct_date)}</td>
                      <td className="px-3 py-2 max-w-[200px] xl:max-w-none truncate" title={r.cntrct_prd || ''}>
                        {g.startDate && g.endDate ? `${shortDate(g.startDate)} ~ ${shortDate(g.endDate)}` : shortDate(r.cntrct_prd)}
                      </td>
                      <td className="px-3 py-2 max-w-[200px] xl:max-w-none truncate" title={r.dminstt_nm || ''}>{r.dminstt_nm || '-'}</td>
                      <td className="px-3 py-2 text-center">
                        <button
                          onClick={() => handleDelete(g)}
                          className="p-1 text-gray-400 hover:text-red-600"
                          title={g.members.length > 1 ? `차수 ${g.members.length}건 함께 삭제` : '삭제'}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                    {/* 펼쳐보기 — 병합된 차수별 등록 행 (체결일·차수 순) */}
                    {expanded && g.members.length > 1 &&
                      [...g.members]
                        .sort((a, b) =>
                          (a.cntrct_date || '').localeCompare(b.cntrct_date || '') ||
                          iterOrdFromName(a.cntrct_nm) - iterOrdFromName(b.cntrct_nm)
                        )
                        .map((m) => {
                          const my = contractYear(m) || '기타'
                          return (
                            <tr key={m.id} className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500">
                              <td colSpan={2} />
                              <td style={{ maxWidth: nameW }} className="px-3 py-1.5 pl-7 overflow-hidden sticky left-0 z-[1] bg-inherit shadow-[inset_-1px_0_0_#e5e7eb]">
                                {isDetailUrl(m.cntrct_info_url) ? (
                                  <a
                                    href={m.cntrct_info_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-500 hover:underline inline-flex items-center gap-1 max-w-full"
                                    title={m.cntrct_nm}
                                  >
                                    <TailTruncate text={m.cntrct_nm} />
                                    <ExternalLink className="h-3 w-3 shrink-0" />
                                  </a>
                                ) : (
                                  <TailTruncate text={m.cntrct_nm} className="block" title={m.cntrct_nm} />
                                )}
                                {nameResizeHandle}
                              </td>
                              <td className="px-3 py-1.5 max-w-[180px] xl:max-w-none truncate" title={m.corp_nm || ''}>{m.corp_nm || '-'}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums">{formatAmt(m.tot_cntrct_amt)}</td>
                              {yearCols.map((y) => (
                                <td key={y} className={`px-3 py-1.5 text-right tabular-nums ${y === thisYear ? 'bg-amber-50/70' : ''}`}>
                                  {y === my ? formatAmt(m.thtm_cntrct_amt) : '-'}
                                </td>
                              ))}
                              <td className="px-3 py-1.5">{shortDate(m.cntrct_date)}</td>
                              <td className="px-3 py-1.5 max-w-[200px] xl:max-w-none truncate" title={m.cntrct_prd || ''}>
                                {m.start_date && m.thtm_end_date ? `${shortDate(m.start_date)} ~ ${shortDate(m.thtm_end_date)}` : shortDate(m.cntrct_prd)}
                              </td>
                              <td className="px-3 py-1.5" />
                              <td className="px-3 py-1.5 text-center">
                                <button
                                  onClick={() => handleDeleteMember(m)}
                                  className="p-1 text-gray-400 hover:text-red-600"
                                  title="이 차수만 삭제"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                    </Fragment>
                    )
                  })}
                  {/* 물품 — 조달청 연계 지급자재를 납품요구 건 단위로 집계한 읽기 전용 행 (등록·수정은 수불부에서) */}
                  {materialGroups.length > 0 ? (
                    <>
                      {renderTotalRow(
                        '물품 소계',
                        materialGroups.map(matToTotalItem),
                        'bg-[#fcf9ff]',
                        'bg-amber-100/40',
                        <>
                          {' '}
                          <Link
                            href={`/project/${projectId}/material-ledger`}
                            className="text-blue-600 hover:underline font-normal"
                          >
                            (지급자재 수불부에서 관리)
                          </Link>
                        </>
                      )}
                      {materialGroups.map((g) => {
                        const info = dlvrInfos.get(g.dlvrReqNo)
                        const title =
                          g.title ||
                          info?.title ||
                          (g.materialNames.length > 1
                            ? `${g.materialNames[0]} 외 ${g.materialNames.length - 1}종`
                            : g.materialNames[0] || g.dlvrReqNo)
                        const deadline = info?.deadline || g.deadline
                        return (
                          <tr key={g.dlvrReqNo} className="group border-b border-gray-100 hover:bg-gray-50">
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2">
                              <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700">
                                물품
                              </span>
                            </td>
                            <td style={{ maxWidth: nameW }} className="px-3 py-2 overflow-hidden sticky left-0 z-[1] bg-white group-hover:bg-gray-50 shadow-[inset_-1px_0_0_#e5e7eb]">
                              <button
                                type="button"
                                onClick={() => openMaterialDetail(g.dlvrReqNo)}
                                className="text-blue-600 hover:underline inline-flex items-center gap-1 max-w-full"
                                title={`${title} — 실제 납품요구 상세 보기`}
                              >
                                <TailTruncate text={title} />
                                {materialDetailLoading && materialDetailNo === g.dlvrReqNo ? (
                                  <span className="inline-flex items-center gap-1 shrink-0" aria-label={`조회 진행률 ${materialDetailProgress}%`}>
                                    <span className="w-10 h-1.5 overflow-hidden rounded-full bg-blue-100">
                                      <span className="block h-full bg-blue-600 transition-[width] duration-300" style={{ width: `${materialDetailProgress}%` }} />
                                    </span>
                                    <span className="text-[10px] tabular-nums text-blue-500">{materialDetailProgress}%</span>
                                  </span>
                                ) : (
                                  <FileText className="h-3 w-3 shrink-0" />
                                )}
                              </button>
                              {/* 자재명 목록이 끝에 오므로 앞쪽 생략 시 자재명이 보인다 (납품요구 번호는 title 툴팁으로 확인) */}
                              <TailTruncate
                                text={`납품요구 ${g.dlvrReqNo} · ${g.materialNames.join(', ')}`}
                                className="block text-[11px] text-gray-400"
                                title={`납품요구 ${g.dlvrReqNo} · ${g.materialNames.join(', ')}`}
                              />
                              {/* 나라장터 대금지급·검사검수 문서 뱃지 — 지급 문서가 있으면 검수까지 끝난 것이므로 지급완료를 우선 표시.
                                  실시간 문서가 없어도 저장된 일자(g2b_pay_date·g2b_insp_date)가 있으면 그 값으로 표시한다 */}
                              {(() => {
                                const pays = paysForDlvr(g.dlvrReqNo)
                                const insps = inspsForDlvr(g.dlvrReqNo)
                                const lastPay = pays.reduce((d, p) => (p.payDate > d ? p.payDate : d), '') || g.payDate || ''
                                const lastInsp = insps.reduce((d, x) => (x.inspDate > d ? x.inspDate : d), '') || g.inspDate || ''
                                if (!lastPay && !lastInsp) return null
                                const paidSum = pays.reduce((s, p) => s + p.amt, 0)
                                return (
                                  <span className="flex items-center gap-1">
                                    {lastPay ? (
                                      <span
                                        className="px-1.5 py-px rounded-full text-[10px] font-semibold bg-emerald-500 text-white"
                                        title={`나라장터 대금지급 ${lastPay}${paidSum > 0 ? ` · 누계 ${formatAmt(paidSum)}원` : ''}${lastInsp ? ` · 검사검수 ${lastInsp}` : ''}`}
                                      >
                                        지급완료
                                      </span>
                                    ) : (
                                      <span
                                        className="px-1.5 py-px rounded-full text-[10px] font-semibold bg-sky-500 text-white"
                                        title={`나라장터 검사검수 ${lastInsp}`}
                                      >
                                        검수
                                      </span>
                                    )}
                                  </span>
                                )
                              })()}
                              {nameResizeHandle}
                            </td>
                            <td className="px-3 py-2 max-w-[180px] xl:max-w-none truncate" title={info?.corpNm || g.supplier || ''}>
                              {info?.corpNm || g.supplier || '-'}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">{formatAmt(g.totAmt)}</td>
                            {yearCols.map((y) => (
                              <td key={y} className={`px-3 py-2 text-right tabular-nums ${y === thisYear ? 'bg-amber-50/70' : ''}`}>
                                {g.yearAmts.has(y) ? formatAmt(g.yearAmts.get(y)) : '-'}
                              </td>
                            ))}
                            <td className="px-3 py-2">{shortDate(info?.rcptDate || g.rcptDate)}</td>
                            <td className="px-3 py-2">{deadline ? `~ ${shortDate(deadline)}` : '-'}</td>
                            <td className="px-3 py-2 max-w-[200px] xl:max-w-none truncate" title={info?.dminsttNm || g.dminstt || ''}>
                              {info?.dminsttNm || g.dminstt || '-'}
                            </td>
                            <td className="px-3 py-2" />
                          </tr>
                        )
                      })}
                    </>
                  ) : (
                    /* 조달청 연계 지급자재가 없으면 기존 안내 링크 행 유지 */
                    <tr className="border-b border-gray-200 font-semibold text-gray-700 bg-[#fcf9ff]">
                      <td colSpan={2} />
                      <td style={{ maxWidth: nameW }} className={`px-3 py-2 sticky left-0 z-[1] bg-inherit shadow-[inset_-1px_0_0_#e5e7eb] ${nameCollapsed ? 'truncate' : 'whitespace-normal'}`}>
                        물품 소계{' '}
                        <Link
                          href={`/project/${projectId}/material-ledger`}
                          className="text-blue-600 hover:underline font-normal"
                        >
                          (지급자재 수불부 확인 바랍니다)
                        </Link>
                        {nameResizeHandle}
                      </td>
                      <td colSpan={6 + yearCols.length} />
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* 업데이트 확인 모달 — 유형별 조달청 조회 횟수 안내와 대상 유형 선택 */}
      {refreshConfirm && (() => {
        const stats = (['공사', '용역'] as const).map((t) => {
          const regCnt = refreshConfirm.targets.filter((r) => r.contract_type === t).length
          const plans = refreshConfirm.scanPlans.filter((p) => p.g.repr.contract_type === t)
          const scanCalls = plans.reduce((s, p) => s + p.months.length, 0)
          return { t, regCnt, planCnt: plans.length, scanCalls, calls: regCnt + scanCalls }
        })
        const totalCalls = stats.filter((s) => refreshTypes.has(s.t)).reduce((s, x) => s + x.calls, 0)
        const estSec = estimateRefreshSeconds(
          refreshConfirm.targets.filter((r) => refreshTypes.has(r.contract_type)),
          refreshConfirm.scanPlans.filter((p) => refreshTypes.has(p.g.repr.contract_type))
        )
        const estLabel = estSec >= 60 ? `약 ${Math.floor(estSec / 60)}분${estSec % 60 ? ` ${estSec % 60}초` : ''}` : `약 ${estSec}초`
        const toggleType = (t: '공사' | '용역', on: boolean) =>
          setRefreshTypes((prev) => {
            const next = new Set(prev)
            if (on) next.add(t)
            else next.delete(t)
            return next
          })
        return (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={() => setRefreshConfirm(null)}>
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="refresh-confirm-title"
              className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-blue-600 text-white px-4 py-3 flex items-center justify-between shrink-0">
                <h3 id="refresh-confirm-title" className="font-semibold text-sm sm:text-base">계약정보 업데이트</h3>
                <button type="button" onClick={() => setRefreshConfirm(null)} className="p-1 text-blue-200 hover:text-white" aria-label="닫기">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-4 space-y-3 text-sm text-gray-700">
                <p className="text-xs text-gray-500">
                  등록 계약을 조달청 최신 정보로 재조회하고, 미등록 연차(차수) 계약을 월 단위 목록 조회로 탐색합니다.
                  아래 숫자는 계약 건수가 아니라 조달청 조회 횟수입니다.
                </p>
                <div className="space-y-2">
                  {stats.map((s) => (
                    <label
                      key={s.t}
                      className={`flex items-start gap-2.5 rounded-lg border p-2.5 ${
                        s.calls === 0
                          ? 'border-gray-200 opacity-50'
                          : refreshTypes.has(s.t)
                            ? 'border-blue-300 bg-blue-50/60 cursor-pointer'
                            : 'border-gray-200 cursor-pointer'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 accent-blue-600"
                        checked={s.calls > 0 && refreshTypes.has(s.t)}
                        disabled={s.calls === 0}
                        onChange={(e) => toggleType(s.t, e.target.checked)}
                      />
                      <span className="min-w-0">
                        <span className="font-medium text-gray-900">
                          {s.t} <span className="font-normal text-gray-500">— 총 {s.calls}회</span>
                        </span>
                        <span className="block text-xs text-gray-500">
                          등록 {s.regCnt}건 재조회 {s.regCnt}회
                          {s.scanCalls > 0 ? ` + 연차 탐색 ${s.planCnt}건 월별 조회 ${s.scanCalls}회` : ''}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
                <p className="font-medium text-gray-900">
                  총 {totalCalls}회 조회 예정
                  {totalCalls > 0 && <span className="font-normal text-gray-500"> (예상 시간 {estLabel})</span>}
                </p>
                <p className="text-xs text-gray-400">물품(지급자재)은 이 업데이트 대상이 아니며 지급자재 원장에서 갱신됩니다.</p>
                <p>진행하시겠습니까?</p>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setRefreshConfirm(null)}
                    className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={handleRefreshAll}
                    disabled={totalCalls === 0}
                    className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    진행
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* 실제 수요기관 납품요구 상세 모달 */}
      {materialDetailOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={closeMaterialDetail}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="material-detail-title"
            className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[88vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-blue-600 text-white px-4 py-3 flex items-center justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <h3 id="material-detail-title" className="font-semibold text-sm sm:text-base truncate">납품요구 상세</h3>
                <p className="text-xs text-blue-100 truncate">{materialDetailNo}</p>
              </div>
              <button type="button" onClick={closeMaterialDetail} className="p-1 text-blue-200 hover:text-white shrink-0" aria-label="닫기">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto">
              {materialDetailLoading ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-gray-500">
                  <div className="w-full max-w-xs" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={materialDetailProgress}>
                    <div className="h-2.5 overflow-hidden rounded-full bg-gray-200">
                      <div className="h-full rounded-full bg-blue-600 transition-[width] duration-300" style={{ width: `${materialDetailProgress}%` }} />
                    </div>
                    <p className="mt-2 text-center text-sm font-medium tabular-nums text-blue-600">{materialDetailProgress}%</p>
                  </div>
                  조달청에서 실제 납품요구 내역을 불러오는 중입니다.
                </div>
              ) : materialDetailError ? (
                <div className="text-center py-12 px-4">
                  <p className="text-sm text-red-600 mb-4">{materialDetailError}</p>
                  <button
                    type="button"
                    onClick={() => openMaterialDetail(materialDetailNo)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    <RefreshCw className="h-4 w-4" />
                    다시 조회
                  </button>
                </div>
              ) : materialDetail ? (
                <div className="space-y-4">
                  <div className="rounded-lg border border-gray-200 overflow-hidden text-sm">
                    <dl className="grid grid-cols-[7rem_minmax(0,1fr)] sm:grid-cols-[8rem_minmax(0,1fr)_8rem_minmax(0,1fr)]">
                      <dt className="bg-gray-50 px-3 py-2 font-medium text-gray-600 border-b border-gray-200">건명</dt>
                      <dd className="px-3 py-2 text-gray-900 border-b border-gray-200 sm:col-span-3 break-words">{materialDetail.title || '-'}</dd>
                      <dt className="bg-gray-50 px-3 py-2 font-medium text-gray-600 border-b border-gray-200">납품요구번호</dt>
                      <dd className="px-3 py-2 text-gray-900 border-b border-gray-200 break-all">{materialDetail.dlvrReqNo || materialDetailNo}</dd>
                      <dt className="bg-gray-50 px-3 py-2 font-medium text-gray-600 border-b border-gray-200">수요기관</dt>
                      <dd className="px-3 py-2 text-gray-900 border-b border-gray-200 break-words">{materialDetail.demandOrg || '-'}</dd>
                      <dt className="bg-gray-50 px-3 py-2 font-medium text-gray-600 border-b border-gray-200">계약상대자</dt>
                      <dd className="px-3 py-2 text-gray-900 border-b border-gray-200 sm:col-span-3 break-words">{materialDetail.supplier || '-'}</dd>
                      <dt className="bg-gray-50 px-3 py-2 font-medium text-gray-600">업체 연락처</dt>
                      <dd className="px-3 py-2 text-gray-900 sm:col-span-3 break-words">
                        {materialDetail.supplierTel ? (
                          <a
                            href={`tel:${materialDetail.supplierTel.replace(/[^\d+]/g, '')}`}
                            className="text-blue-600 hover:text-blue-700 hover:underline"
                          >
                            {materialDetail.supplierTel}
                          </a>
                        ) : '-'}
                      </dd>
                    </dl>
                  </div>

                  {materialDetailPayInspLoading && (
                    <p className="py-4 text-center text-sm text-blue-600 border border-blue-200 rounded-lg bg-blue-50">
                      나라장터 지급·검사검수 내역을 확인하는 중입니다.
                    </p>
                  )}

                  {materialDetailPayInspError && (
                    <p className="py-4 px-3 text-center text-sm text-red-600 border border-red-200 rounded-lg bg-red-50">
                      {materialDetailPayInspError}
                    </p>
                  )}

                  {materialDetailPayInsp.pays.length > 0 && (() => {
                    const paidTotal = materialDetailPayInsp.pays.reduce((sum, pay) => sum + pay.amt, 0)
                    const productTotal = materialDetail.items.reduce((sum, item) => sum + (item.amt || 0), 0)
                    const estimatedFee = calcG2bFee(productTotal)
                    return (
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <h4 className="text-sm font-semibold text-gray-900">지급완료 내역</h4>
                          <span className="text-xs text-gray-500">{materialDetailPayInsp.pays.length}건</span>
                        </div>
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-2 text-xs">
                          {[
                            ['지급액 합계', paidTotal],
                            ['물품금액', productTotal],
                            ['조달수수료', estimatedFee],
                            ['수수료 포함 합계', productTotal + estimatedFee],
                          ].map(([label, amount]) => (
                            <div key={String(label)} className="rounded border border-gray-200 bg-gray-50 px-3 py-2">
                              <p className="text-gray-500">{label}</p>
                              <p className="mt-0.5 text-right font-semibold text-gray-900 tabular-nums">{formatAmt(Number(amount))}원</p>
                            </div>
                          ))}
                        </div>
                        <p className="mb-2 text-[11px] text-gray-500">조달수수료는 고시 요율에 따른 추정치입니다. 실제 납부금액은 조달청 수수료 고지 금액을 확인해야 합니다.</p>
                        <div className="border border-gray-200 rounded-lg overflow-x-auto">
                          <table className="w-full min-w-[760px] text-sm whitespace-nowrap">
                            <thead>
                              <tr className="bg-gray-50 text-xs text-gray-500 border-b border-gray-200">
                                <th className="px-3 py-2 text-left font-medium">문서번호</th>
                                <th className="px-3 py-2 text-left font-medium">명칭</th>
                                <th className="px-3 py-2 text-center font-medium">지급일</th>
                                <th className="px-3 py-2 text-right font-medium">금액(원)</th>
                                <th className="px-3 py-2 text-left font-medium">수요기관</th>
                              </tr>
                            </thead>
                            <tbody>
                              {materialDetailPayInsp.pays.map((pay) => (
                                <tr key={pay.docNo} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50">
                                  <td className="px-3 py-2 text-gray-700 font-mono text-xs">{pay.docNo}</td>
                                  <td className="px-3 py-2 text-gray-900 max-w-[260px] truncate" title={pay.name}>{pay.name || '-'}</td>
                                  <td className="px-3 py-2 text-center text-gray-700">{pay.payDate || '-'}</td>
                                  <td className="px-3 py-2 text-right text-gray-900 tabular-nums font-medium">{formatAmt(pay.amt)}</td>
                                  <td className="px-3 py-2 text-gray-700 max-w-[260px] truncate" title={pay.dminsttNm}>{pay.dminsttNm || '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )
                  })()}

                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <h4 className="text-sm font-semibold text-gray-900">품목 내역</h4>
                      <span className="text-xs text-gray-500">{materialDetail.items.length}건</span>
                    </div>
                    {materialDetail.items.length === 0 ? (
                      <p className="py-8 text-center text-sm text-gray-400 border border-gray-200 rounded-lg">조회된 품목이 없습니다.</p>
                    ) : (
                      <div className="border border-gray-200 rounded-lg overflow-x-auto">
                        <table className="w-full min-w-[840px] text-sm whitespace-nowrap">
                          <thead>
                            <tr className="bg-gray-50 text-xs text-gray-500 border-b border-gray-200">
                              <th className="px-3 py-2 text-center font-medium">순번</th>
                              <th className="px-3 py-2 text-left font-medium">품목</th>
                              <th className="px-3 py-2 text-left font-medium">규격</th>
                              <th className="px-3 py-2 text-right font-medium">수량</th>
                              <th className="px-3 py-2 text-right font-medium">단가(원)</th>
                              <th className="px-3 py-2 text-right font-medium">금액(원)</th>
                              <th className="px-3 py-2 text-center font-medium">납품기한</th>
                            </tr>
                          </thead>
                          <tbody>
                            {materialDetail.items.map((item, idx) => (
                              <tr key={`${item.sno}-${idx}`} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50">
                                <td className="px-3 py-2 text-center text-gray-500">{item.sno || idx + 1}</td>
                                <td className="px-3 py-2 text-gray-900 max-w-[220px] truncate" title={item.name}>{item.name || '-'}</td>
                                <td className="px-3 py-2 text-gray-600 max-w-[320px] truncate" title={item.spec}>{item.spec || '-'}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{item.qty.toLocaleString('ko-KR')}{item.unit ? ` ${item.unit}` : ''}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{formatAmt(item.unitPrice)}</td>
                                <td className="px-3 py-2 text-right tabular-nums font-medium">{formatAmt(item.amt)}</td>
                                <td className="px-3 py-2 text-center">{item.deadline || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {(() => {
                    const insps = materialDetailPayInsp.insps
                    if (insps.length === 0) return null
                    return (
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <h4 className="text-sm font-semibold text-gray-900">검사검수 완료 내역</h4>
                          <span className="text-xs text-gray-500">{insps.length}건</span>
                        </div>
                        <div className="border border-gray-200 rounded-lg overflow-x-auto">
                          <table className="w-full min-w-[760px] text-sm whitespace-nowrap">
                            <thead>
                              <tr className="bg-gray-50 text-xs text-gray-500 border-b border-gray-200">
                                <th className="px-3 py-2 text-left font-medium">문서번호</th>
                                <th className="px-3 py-2 text-left font-medium">명칭</th>
                                <th className="px-3 py-2 text-center font-medium">검사일</th>
                                <th className="px-3 py-2 text-right font-medium">금액(원)</th>
                                <th className="px-3 py-2 text-left font-medium">수요기관</th>
                              </tr>
                            </thead>
                            <tbody>
                              {insps.map((insp) => (
                                <tr key={insp.docNo} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50">
                                  <td className="px-3 py-2 text-gray-700 font-mono text-xs">{insp.docNo}</td>
                                  <td className="px-3 py-2 text-gray-900 max-w-[260px] truncate" title={insp.name}>{insp.name || '-'}</td>
                                  <td className="px-3 py-2 text-center text-gray-700">{insp.inspDate || '-'}</td>
                                  <td className="px-3 py-2 text-right text-gray-900 tabular-nums font-medium">{formatAmt(insp.amt)}</td>
                                  <td className="px-3 py-2 text-gray-700 max-w-[260px] truncate" title={insp.dminsttNm}>{insp.dminsttNm || '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              ) : null}
            </div>

            <div className="px-4 py-3 border-t border-gray-200 flex justify-end shrink-0">
              <button
                type="button"
                onClick={closeMaterialDetail}
                className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 조달청 조회 모달 */}
      {isLookupOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={() => setIsLookupOpen(false)}>
          <div
            className={`bg-white rounded-lg shadow-xl w-full ${modalTab === 'g2b' && lookupItems ? 'max-w-5xl' : 'max-w-2xl'} max-h-[88vh] flex flex-col overflow-hidden`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-blue-600 text-white px-4 py-3 flex items-center justify-between shrink-0">
              <h3 className="font-semibold text-sm sm:text-base">계약 등록</h3>
              <button onClick={() => setIsLookupOpen(false)} className="p-1 text-blue-200 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4 space-y-3 overflow-y-auto">
              {/* 등록 방식 탭 */}
              <div className="grid grid-cols-2 gap-2">
                {([['manual', '직접 등록'], ['g2b', '조달청 조회']] as const).map(([tab, label]) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setModalTab(tab)}
                    className={`px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                      modalTab === tab
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {modalTab === 'g2b' && (
              <div className="flex flex-col sm:flex-row items-start gap-4">
              <div className={`w-full space-y-3 ${lookupItems ? 'sm:flex-1 sm:min-w-0' : ''}`}>
              {/* 구분 탭 + 조회 조건 — 탭과 아래 입력이 한 묶음임을 보이도록 테두리 박스로 감쌈 */}
              <div className="border border-blue-200 rounded-lg p-3 space-y-3">
              {/* 구분 탭 — 공사·용역(기간 조회), 계약번호(단건 조회) */}
              <div className="grid grid-cols-2 gap-2">
                {LOOKUP_TABS.map(({ div, label }) => (
                  <button
                    key={div}
                    type="button"
                    onClick={() => switchLookupDiv(div)}
                    className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
                      lookupDiv === div
                        ? 'bg-blue-50 text-blue-700 border-blue-400'
                        : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {lookupDiv !== 'byno' && (
              <>
              {/* 계약명 검색어 */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">계약명 검색어 (선택 — 수요기관명과 함께 조회 조건으로 적용)</label>
                <input
                  type="text"
                  value={lookupKeyword}
                  onChange={(e) => setLookupKeyword(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !lookupLoading) handleLookup() }}
                  placeholder="예: 북내지구"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-[11px] text-gray-400 mt-1">첫 단어로 조달청을 조회하고 나머지 단어로 결과를 거릅니다. 비우면 기관 전체 계약을 표시합니다(느림).</p>
              </div>

              {/* 기관명 */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">수요기관명 (부분일치)</label>
                <input
                  type="text"
                  value={lookupInst}
                  onChange={(e) => setLookupInst(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !lookupLoading) handleLookup() }}
                  placeholder="예: 여주.이천지사"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* 기간 */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">계약체결일 기간</label>
                <div className="flex items-center gap-2">
                  <input
                    type="month"
                    value={lookupFrom}
                    onChange={(e) => setLookupFrom(e.target.value)}
                    className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-gray-400 shrink-0">~</span>
                  <input
                    type="month"
                    value={lookupTo}
                    onChange={(e) => setLookupTo(e.target.value)}
                    className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {PERIOD_PRESETS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => applyPreset(n)}
                      className={`px-2 py-1 text-xs border rounded transition-colors ${
                        isPresetActive(n)
                          ? 'bg-blue-50 text-blue-700 border-blue-400 font-medium'
                          : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      최근 {n}개월
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={handleLookup}
                disabled={lookupLoading}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
              >
                {lookupLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    조회 중… {lookupProgress.done}/{lookupProgress.total}개월
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4" />
                    {LOOKUP_TABS.find((t) => t.div === lookupDiv)?.label} 계약 조회
                  </>
                )}
              </button>
              <p className="text-[11px] text-gray-400 text-center">조달청에서 월단위 조회를 하여 조회 속도가 느립니다.</p>
              </>
              )}

              {/* 계약번호·공고번호 조회 */}
              {lookupDiv === 'byno' && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">계약번호 또는 공고번호</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={noInput}
                      onChange={(e) => setNoInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !noLoading) handleNoLookup() }}
                      placeholder="예: R26TA01918221 또는 20231019521"
                      className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={handleNoLookup}
                      disabled={noLoading}
                      className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 shrink-0"
                    >
                      {noLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                      조회
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1">나라장터 확정계약번호·공고번호·통합계약번호 모두 조회됩니다. 공사·용역 구분은 자동 판별됩니다.</p>
                </div>
              )}
              </div>

              {lookupError && <p className="text-xs text-red-600">{lookupError}</p>}
              </div>

              {/* 조회 결과 — 검색 조건 옆에 2열로 표시 */}
              {lookupItems && (
                <div className="flex-1 min-w-0 w-full border border-gray-200 rounded-lg overflow-hidden">
                  <div className="bg-gray-50 px-3 py-2 flex items-center justify-between gap-2 border-b border-gray-200">
                    <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        disabled={selectableItems.length === 0}
                        className="accent-blue-600"
                      />
                      표시된 미등록 건 전체 선택
                    </label>
                    <span className="text-xs text-gray-500 shrink-0">
                      {lookupDiv !== 'byno' && lookupKeyword.trim()
                        ? `전체 ${lookupItems.length}건 중 ${visibleItems.length}건 표시`
                        : `${lookupItems.length}건`}
                    </span>
                  </div>
                  {visibleItems.length === 0 ? (
                    <p className="text-center text-sm text-gray-400 py-8 px-4">
                      {lookupItems.length > 0
                        ? '검색어와 일치하는 계약이 없습니다. 검색어를 줄이거나 비워보세요.'
                        : '조회된 계약이 없습니다. 수요기관명·기간을 확인해주세요.'}
                    </p>
                  ) : (
                    <div className="max-h-72 sm:max-h-[26rem] overflow-y-auto divide-y divide-gray-100">
                      {visibleItems.map((item) => {
                        const registered = isRegistered(item)
                        return (
                          <label
                            key={item.key}
                            className={`flex items-start gap-2 px-3 py-2 ${registered ? 'opacity-50' : 'cursor-pointer hover:bg-blue-50/50'}`}
                          >
                            <input
                              type="checkbox"
                              disabled={registered}
                              checked={lookupChecked.has(item.key)}
                              onChange={() => setLookupChecked((prev) => {
                                // 장기계속계약은 차수(연차)별 행이 별개 건이므로 같은 계약명의 차수를 함께 토글
                                const next = new Set(prev)
                                const turnOn = !next.has(item.key)
                                const gk = nameGroupKey(item.type, item.name, isThtmPartial(item.totAmt, item.thtmAmt))
                                for (const v of visibleItems) {
                                  if (isRegistered(v) || nameGroupKey(v.type, v.name, isThtmPartial(v.totAmt, v.thtmAmt)) !== gk) continue
                                  if (turnOn) next.add(v.key)
                                  else next.delete(v.key)
                                }
                                return next
                              })}
                              className="mt-1 accent-blue-600 shrink-0"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm text-gray-900 break-all">
                                <span className={`mr-1.5 inline-block px-1.5 py-0.5 rounded text-[10px] font-medium align-middle ${
                                  item.type === '공사' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                                }`}>
                                  {item.type}
                                </span>
                                {item.name}
                                {item.lngtrmDiv === '차수' && (
                                  <span
                                    className="ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-700 align-middle"
                                    title="장기계속계약의 연차별 차수 계약 — 같은 계약명이 차수마다 별도 건으로 조회됩니다"
                                  >
                                    장기계속(차수)
                                  </span>
                                )}
                                {registered && (
                                  <span className="ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] bg-green-100 text-green-700 align-middle">등록됨</span>
                                )}
                              </p>
                              <p className="text-xs text-gray-500 mt-0.5">
                                체결 {item.cntrctDate || '-'}
                                {item.thtmEndDate && item.thtmEndDate !== item.endDate
                                  ? ` · 금차준공 ${item.thtmEndDate} · 총준공 ${item.endDate || '-'}`
                                  : ` · 준공 ${item.endDate || '-'}`}
                                {' · 총액 '}{formatAmt(item.totAmt)}원
                                {item.thtmAmt > 0 && item.thtmAmt !== item.totAmt ? ` · 금차 ${formatAmt(item.thtmAmt)}원` : ''}
                                {item.corpNms.length > 0 ? ` · ${item.corpNms.join(', ')}` : ''}
                              </p>
                              <p className="text-[11px] text-gray-400 truncate">{item.cntrctInsttNm}</p>
                            </div>
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
              </div>
              )}

              {/* 직접 등록 폼 */}
              {modalTab === 'manual' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">구분</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['공사', '용역'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setMForm((p) => ({ ...p, type: t }))}
                        className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
                          mForm.type === t
                            ? 'bg-blue-50 text-blue-700 border-blue-400'
                            : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">계약명 <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={mForm.name}
                    onChange={(e) => setMForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder="예: 백사지구 배수개선사업 자동화공사"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">계약상대자</label>
                    <input
                      type="text"
                      value={mForm.corp}
                      onChange={(e) => setMForm((p) => ({ ...p, corp: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">수요기관</label>
                    <input
                      type="text"
                      value={mForm.dminstt}
                      onChange={(e) => setMForm((p) => ({ ...p, dminstt: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">총계약금액(원)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={mForm.totAmt}
                    onChange={(e) => setMForm((p) => ({ ...p, totAmt: formatAmtInput(e.target.value) }))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-gray-600">차수별(연도별) 계약금액</label>
                    <button
                      type="button"
                      onClick={addThtmRow}
                      className="inline-flex items-center gap-0.5 text-xs font-medium text-blue-600 hover:text-blue-700"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      차수 추가
                    </button>
                  </div>
                  <div className="space-y-2">
                    {mThtmRows.map((row, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={row.year}
                          onChange={(e) => updateThtmRow(idx, { year: e.target.value.replace(/[^0-9]/g, '').slice(0, 4) })}
                          placeholder="연도"
                          className="w-20 px-3 py-2 text-sm border border-gray-300 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <input
                          type="text"
                          inputMode="numeric"
                          value={row.amt}
                          onChange={(e) => updateThtmRow(idx, { amt: formatAmtInput(e.target.value) })}
                          placeholder="해당 차수 계약금액(원)"
                          className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        {mThtmRows.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeThtmRow(idx)}
                            className="p-1 text-gray-400 hover:text-red-600"
                            title="차수 삭제"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="mt-1 text-[11px] text-gray-400">
                    장기계속계약은 차수를 추가해 연도별 계약금액을 각각 입력하세요. 차수마다 별도 건으로 저장되고 표에서 한 계약으로 병합됩니다.
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">계약체결일</label>
                    <input
                      type="date"
                      value={mForm.cntrctDate}
                      onChange={(e) => setMForm((p) => ({ ...p, cntrctDate: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">착수일</label>
                    <input
                      type="date"
                      value={mForm.startDate}
                      onChange={(e) => setMForm((p) => ({ ...p, startDate: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">준공일</label>
                    <input
                      type="date"
                      value={mForm.endDate}
                      onChange={(e) => setMForm((p) => ({ ...p, endDate: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>
              )}
            </div>

            {/* 하단 버튼 */}
            <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-end gap-2 shrink-0">
              <button
                onClick={() => setIsLookupOpen(false)}
                className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                닫기
              </button>
              {modalTab === 'manual' ? (
                <button
                  onClick={handleManualSave}
                  disabled={mSaving || !mForm.name.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {mSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                  등록
                </button>
              ) : (
                <button
                  onClick={handleImport}
                  disabled={importing || lookupChecked.size === 0}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {importing && <Loader2 className="h-4 w-4 animate-spin" />}
                  선택 {lookupChecked.size}건 등록
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
