// 계약(공사·용역) 현황 서류철 — 조달청 계약현황 조회로 등록하는 프로젝트 계약 목록 페이지
'use client'

import { Fragment, useState, useEffect, useCallback, useMemo } from 'react'
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
// 1차는 접미어 없음) 제거 후 비교한다
const nameGroupKey = (type: string, name: string): string =>
  `${type}|${name.replace(/(?:\(\s*\d+\s*차[^)]*\)|\d+\s*차년도)\s*$/, '').replace(/\s+/g, '')}`

// 계약명 연차 접미어의 차수 번호 — "(3차년도_2026년)"·"3차년도" → 3, 접미어 없으면 1(원계약)
const iterOrdFromName = (name: string): number => {
  const m = name.match(/(?:\(\s*(\d+)\s*차[^)]*\)|(\d+)\s*차년도)\s*$/)
  return m ? Number(m[1] || m[2]) : 1
}

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

export default function ContractStatusPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()
  const projectId = params.id as string

  const [project, setProject] = useState<Project | null>(null)
  const [records, setRecords] = useState<ContractRecord[]>([])
  const [loading, setLoading] = useState(true)

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

  // 차수별 등록 행을 계약 단위로 병합 — 한 계약 한 행, 차수 금차는 연도별 컬럼에 분산
  const groups = useMemo<ContractGroup[]>(() => {
    const byKey = new Map<string, ContractRecord[]>()
    for (const r of records) {
      const k = nameGroupKey(r.contract_type, r.cntrct_nm)
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

  // 금차계약금액의 연도별 컬럼 — 그룹에 금차 금액이 있는 귀속 연도만 컬럼으로 생성
  const yearCols = useMemo(() => {
    const s = new Set<string>()
    for (const g of groups) for (const y of g.yearAmts.keys()) s.add(y)
    return [...s].sort((a, b) => (a === '기타' ? 1 : b === '기타' ? -1 : a.localeCompare(b)))
  }, [groups])
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
      alert(`${rows.length}건이 등록되었습니다.`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류'
      alert('등록 실패: ' + message)
    } finally {
      setImporting(false)
    }
  }

  // 등록 건 일괄 갱신 — ① 번호가 있는 행을 조달청 최신 계약정보로 갱신하고,
  // ② 장기계속계약의 미등록 연차(차수) 계약을 수요기관명+계약명 월별 목록 조회로 탐색해 신규 등록
  //    (3차년도만 등록된 경우의 과거 1·2차년도처럼 등록 차수보다 앞선 연차도 거슬러 탐색).
  // 연차별 차수 계약은 확정·통합·공고번호가 전부 달라(2026-07-07 실호출 확정) 어떤 번호 재조회로도
  // 다른 연차가 나오지 않는다 — 신규 연차 발견은 기간 목록 조회가 유일한 경로다.
  const handleRefreshAll = async () => {
    if (!user || refreshing) return
    const targets = records.filter((r) => r.cntrct_no || r.unty_cntrct_no)

    // 신규 연차 탐색 대상: 미등록 차수가 있는 계약 + 기관명 확보 가능.
    // ① 금차 합 < 총액 → 미등록 차수 존재(과거·미래 불문), ② 차수 번호 1..최대 중 빠진 번호 → 과거 연차 누락
    const nowKey = monthKey(new Date())
    const scanPlans = groups.flatMap((g) => {
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
    if (!confirm(`등록된 ${targets.length}건을 조달청 최신 계약정보로 갱신하고, 새로운 연차(차수) 계약이 있는지 확인할까요?`)) return
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
      // ① 등록 건 번호 재조회 갱신 — 같은 차수의 변경계약(금액·기간 변경) 반영
      for (const r of targets) {
        try {
          const no = r.unty_cntrct_no || r.cntrct_no || ''
          const res = await fetch(`/api/g2b/contract?no=${encodeURIComponent(no)}`)
          const json = await res.json()
          if (!res.ok || !json.success) throw new Error(json.error || '조회 실패')
          const contracts: G2bContractResp[] = json.data?.contracts || []
          if (contracts.length === 0) throw new Error('조회 결과 없음')

          for (const c of contracts) {
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
          failures.push(`${r.cntrct_nm} (${err instanceof Error ? err.message : '오류'})`)
        } finally {
          setRefreshProgress((p) => ({ ...p, done: p.done + 1 }))
        }
      }

      // ② 신규 연차(차수) 계약 탐색 — 최신 차수 체결월부터 이번 달까지 월별 목록 조회
      const CONCURRENCY = 3
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
          found.filter((it) => nameGroupKey(it.type, it.name) === plan.g.key)
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

  // 합계행 렌더 — 총 합계·공사/용역 소계 공용 (총액은 계약 단위로 1회만 합산 — 차수 중복 합산 방지)
  const renderTotalRow = (label: string, list: ContractGroup[], rowClass: string, thisYearCellClass: string) => (
    <tr className={`border-b border-gray-200 font-semibold text-gray-700 ${rowClass}`}>
      <td className="px-3 py-2" colSpan={4}>{label} ({list.length}건)</td>
      <td className="px-3 py-2 text-right tabular-nums">
        {list.reduce((s, g) => s + (g.repr.tot_cntrct_amt || 0), 0).toLocaleString('ko-KR')}
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
              {records.length > 0 && (
                <span className="ml-2 text-xs font-normal text-blue-100">공사 {cnstwkCount}건 · 용역 {servcCount}건</span>
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
                onClick={handleRefreshAll}
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

          {loading ? (
            <div className="flex justify-center py-20"><LoadingSpinner /></div>
          ) : sortedGroups.length === 0 ? (
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
            <div className="overflow-x-auto">
              <table className="w-full text-sm whitespace-nowrap">
                <thead>
                  <tr className="bg-gray-50 text-xs text-gray-500 border-b border-gray-200">
                    <th className="px-3 py-2 text-center font-medium">대표</th>
                    <th className="px-3 py-2 text-center font-medium">구분</th>
                    <th className="px-3 py-2 text-center font-medium">계약명</th>
                    <th className="px-3 py-2 text-center font-medium">계약상대자</th>
                    <th className="px-3 py-2 text-center font-medium">총계약금액(원)</th>
                    {yearCols.map((y) => (
                      <th key={y} className={`px-3 py-2 text-center font-medium ${y === thisYear ? 'bg-amber-100/70 text-amber-800' : ''}`}>
                        {y === '기타' ? '연도미상(원)' : `${y.slice(2)}년(원)`}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-center font-medium">계약체결일</th>
                    <th className="px-3 py-2 text-center font-medium">계약기간</th>
                    <th className="px-3 py-2 text-center font-medium">수요기관</th>
                    <th className="px-3 py-2 text-center font-medium">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {/* 총 합계행 — 제목행 바로 아래 */}
                  {renderTotalRow('총 합계', groups, 'bg-blue-100/80', 'bg-amber-100/60')}
                  {sortedGroups.map((g, idx) => {
                    const r = g.repr
                    const isRep = isGroupRepresentative(g)
                    const expanded = expandedKeys.has(g.key)
                    // 구분(공사→용역)이 바뀌는 첫 행 위에 해당 구분의 소계행 삽입
                    const prevType = idx > 0 ? sortedGroups[idx - 1].repr.contract_type : null
                    return (
                    <Fragment key={g.key}>
                    {r.contract_type !== prevType &&
                      renderTotalRow(
                        `${r.contract_type} 소계`,
                        groups.filter((x) => x.repr.contract_type === r.contract_type),
                        r.contract_type === '공사' ? 'bg-blue-50/60' : 'bg-green-50/60',
                        'bg-amber-100/40'
                      )}
                    <tr className={`border-b border-gray-100 ${isRep ? 'bg-amber-50' : 'hover:bg-gray-50'}`}>
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
                      <td className="px-3 py-2 max-w-[320px] xl:max-w-none">
                        {isDetailUrl(r.cntrct_info_url) ? (
                          <a
                            href={r.cntrct_info_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline inline-flex items-center gap-1 max-w-full"
                            title={r.cntrct_nm}
                          >
                            <span className="truncate">{r.cntrct_nm}</span>
                            <ExternalLink className="h-3 w-3 shrink-0" />
                          </a>
                        ) : (
                          <span className="block truncate" title={r.cntrct_nm}>{r.cntrct_nm}</span>
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
                            <tr key={m.id} className="border-b border-gray-100 bg-gray-50/70 text-xs text-gray-500">
                              <td colSpan={2} />
                              <td className="px-3 py-1.5 pl-7 max-w-[320px] xl:max-w-none">
                                {isDetailUrl(m.cntrct_info_url) ? (
                                  <a
                                    href={m.cntrct_info_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-500 hover:underline inline-flex items-center gap-1 max-w-full"
                                    title={m.cntrct_nm}
                                  >
                                    <span className="truncate">{m.cntrct_nm}</span>
                                    <ExternalLink className="h-3 w-3 shrink-0" />
                                  </a>
                                ) : (
                                  <span className="block truncate" title={m.cntrct_nm}>{m.cntrct_nm}</span>
                                )}
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
                  {/* 물품 소계 — 지급자재는 수불부에서 관리하므로 링크로 안내 */}
                  <tr className="border-b border-gray-200 font-semibold text-gray-700 bg-purple-50/60">
                    <td className="px-3 py-2" colSpan={9 + yearCols.length}>
                      물품 소계{' '}
                      <Link
                        href={`/project/${projectId}/material-ledger`}
                        className="text-blue-600 hover:underline font-normal"
                      >
                        (지급자재 수불부 확인 바랍니다)
                      </Link>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

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
                                const gk = nameGroupKey(item.type, item.name)
                                for (const v of visibleItems) {
                                  if (isRegistered(v) || nameGroupKey(v.type, v.name) !== gk) continue
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
