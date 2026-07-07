// 계약(공사·용역) 현황 서류철 — 조달청 계약현황 조회로 등록하는 프로젝트 계약 목록 페이지
'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { Project } from '@/lib/projects'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { ArrowLeft, Plus, RefreshCw, X, FileText, ExternalLink, Trash2, Loader2, Search } from 'lucide-react'

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
  cntrctInsttNm: string
  dminsttNms: string[]
  corpNms: string[]
  url: string
}

type LookupDiv = 'cnstwk' | 'servc' | 'byno'

const LOOKUP_TABS: Array<{ div: LookupDiv; label: string }> = [
  { div: 'cnstwk', label: '공사' },
  { div: 'servc', label: '용역' },
  { div: 'byno', label: '계약번호' },
]

const PERIOD_PRESETS = [6, 12, 18, 24, 30, 36]

const formatAmt = (n: number | null | undefined) =>
  n == null || n === 0 ? '-' : n.toLocaleString('ko-KR')

// 계약 귀속 연도 — 준공일(준공된 계약의 연도) 우선, 없으면 체결일 연도
const contractYear = (r: { end_date: string | null; cntrct_date: string | null }): string => {
  const d = r.end_date || r.cntrct_date
  return d ? d.slice(0, 4) : ''
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
  const [lookupDiv, setLookupDiv] = useState<LookupDiv>('cnstwk')
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
  // 등록 방식 탭 (직접 등록 / 조달청 조회)
  const [modalTab, setModalTab] = useState<'manual' | 'g2b'>('manual')
  // 계약번호·공고번호 조회
  const [noInput, setNoInput] = useState('')
  const [noLoading, setNoLoading] = useState(false)
  // 직접 등록 폼
  const [mForm, setMForm] = useState({
    type: '공사' as '공사' | '용역',
    name: '', corp: '', totAmt: '', thtmAmt: '',
    cntrctDate: '', startDate: '', endDate: '', dminstt: '',
  })
  const [mSaving, setMSaving] = useState(false)
  // 등록 건 일괄 갱신 (조달청 최신 계약정보 반영)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshProgress, setRefreshProgress] = useState({ done: 0, total: 0 })

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

  // 표 정렬: 공사 먼저 → 용역, 그다음 연도(준공 기준) → 체결일 오름차순 (사용자 지정 순서)
  const sortedRecords = useMemo(() => {
    const typeOrder = (t: string) => (t === '공사' ? 0 : 1)
    return [...records].sort((a, b) => {
      const t = typeOrder(a.contract_type) - typeOrder(b.contract_type)
      if (t !== 0) return t
      const ya = contractYear(a) || '9999'
      const yb = contractYear(b) || '9999'
      if (ya !== yb) return ya < yb ? -1 : 1
      const da = a.cntrct_date || '9999-12-31'
      const db = b.cntrct_date || '9999-12-31'
      if (da !== db) return da < db ? -1 : 1
      return (a.created_at || '').localeCompare(b.created_at || '')
    })
  }, [records])

  const cnstwkCount = records.filter((r) => r.contract_type === '공사').length
  const servcCount = records.length - cnstwkCount

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
    if (!lookupInst) {
      const branch = project?.managing_branch || ''
      if (branch.endsWith('지사')) {
        // 조달청 등록명은 '여주.이천지사' 형태 — '·'를 '.'로 변환하면 부분일치로 잡힌다
        setLookupInst(branch.replace(/·/g, '.'))
      } else if (project?.g2b_cntrct_no) {
        fetch(`/api/g2b/contract?no=${encodeURIComponent(project.g2b_cntrct_no)}`)
          .then((res) => res.json())
          .then((json) => {
            const nm = json?.success ? json.data?.contracts?.[0]?.dminsttNms?.[0] : ''
            if (nm) setLookupInst((prev) => prev || nm)
          })
          .catch(() => {})
      }
    }
  }

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

  const handleLookup = async () => {
    const inst = lookupInst.trim()
    if (inst.length < 2) { setLookupError('기관명을 2자 이상 입력해주세요.'); return }
    const months = buildMonths(lookupFrom, lookupTo)
    if (months.length === 0) { setLookupError('조회 기간을 확인해주세요.'); return }
    // 검색어가 한 단어면 조달청 조회 조건으로 함께 전송(원문 부분일치).
    // 여러 단어는 건명 띄어쓰기 편차로 서버 필터가 누락을 만들 수 있어 조회 후 클라이언트에서 거른다.
    const keyword = lookupKeyword.trim()
    const nmParam = keyword && !/\s/.test(keyword) ? `&nm=${encodeURIComponent(keyword)}` : ''
    setLookupLoading(true)
    setLookupError('')
    setLookupItems(null)
    setLookupChecked(new Set())
    setLookupProgress({ done: 0, total: months.length })
    const collected: G2bCntrctItem[] = []
    let firstError = ''
    let failCount = 0
    let done = 0
    const CONCURRENCY = 3
    try {
      for (let i = 0; i < months.length; i += CONCURRENCY) {
        const batch = months.slice(i, i + CONCURRENCY)
        await Promise.all(batch.map(async (m) => {
          try {
            const res = await fetch(`/api/g2b/cntrct-list?div=${lookupDiv}&inst=${encodeURIComponent(inst)}&bgn=${m.bgn}&end=${m.end}${nmParam}`)
            const json = await res.json()
            if (!res.ok || !json.success) throw new Error(json.error || '조회에 실패했습니다.')
            collected.push(...(json.data?.items || []))
          } catch (err: unknown) {
            failCount += 1
            if (!firstError) firstError = err instanceof Error ? err.message : '조회에 실패했습니다.'
          } finally {
            done += 1
            setLookupProgress({ done, total: months.length })
          }
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

  // 직접 등록
  const handleManualSave = async () => {
    if (!user) return
    if (!mForm.name.trim()) { alert('계약명을 입력해주세요.'); return }
    setMSaving(true)
    try {
      const { error } = await (supabase as any).from('project_contracts').insert([{
        project_id: projectId,
        created_by: user.id,
        contract_type: mForm.type,
        cntrct_nm: mForm.name.trim(),
        corp_nm: mForm.corp.trim() || null,
        tot_cntrct_amt: parseAmt(mForm.totAmt),
        thtm_cntrct_amt: parseAmt(mForm.thtmAmt),
        cntrct_date: mForm.cntrctDate || null,
        start_date: mForm.startDate || null,
        end_date: mForm.endDate || null,
        dminstt_nm: mForm.dminstt.trim() || null,
      }])
      if (error) throw error
      setMForm((p) => ({ ...p, name: '', corp: '', totAmt: '', thtmAmt: '', cntrctDate: '', startDate: '', endDate: '', dminstt: '' }))
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

  // 등록 건 일괄 갱신 — 계약번호가 있는 행을 조달청 최신 계약(차수)으로 갱신.
  // 조회값이 빈 항목은 기존 값을 지우지 않는 fill-if-present 방식 (프로젝트 상세 갱신 버튼과 동일)
  const handleRefreshAll = async () => {
    if (!user || refreshing) return
    const targets = records.filter((r) => r.cntrct_no || r.unty_cntrct_no)
    if (targets.length === 0) { alert('갱신할 계약번호가 있는 등록 건이 없습니다.'); return }
    if (!confirm(`등록된 ${targets.length}건을 조달청 최신 계약정보로 갱신할까요?`)) return
    setRefreshing(true)
    setRefreshProgress({ done: 0, total: targets.length })
    let updated = 0
    const failures: string[] = []
    try {
      for (const r of targets) {
        try {
          const no = r.cntrct_no || r.unty_cntrct_no || ''
          const res = await fetch(`/api/g2b/contract?no=${encodeURIComponent(no)}`)
          const json = await res.json()
          if (!res.ok || !json.success) throw new Error(json.error || '조회 실패')
          const c = json.data?.contracts?.[0]
          if (!c) throw new Error('조회 결과 없음')
          const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
          if (c.totCntrctAmt > 0) patch.tot_cntrct_amt = c.totCntrctAmt
          if (c.thtmCntrctAmt > 0) patch.thtm_cntrct_amt = c.thtmCntrctAmt
          if (c.cntrctCnclsDate) patch.cntrct_date = c.cntrctCnclsDate
          if (c.cntrctPrd) patch.cntrct_prd = c.cntrctPrd
          if (c.startDate) patch.start_date = c.startDate
          if (c.endDate) patch.end_date = c.endDate
          if ((c.corpNms || []).length > 0) patch.corp_nm = c.corpNms.join(', ')
          if ((c.dminsttNms || []).length > 0) patch.dminstt_nm = c.dminsttNms.join(', ')
          if (c.untyCntrctNo) patch.unty_cntrct_no = c.untyCntrctNo
          if (c.cntrctNo) patch.cntrct_no = c.cntrctNo
          if (c.cntrctDtlInfoUrl) patch.cntrct_info_url = c.cntrctDtlInfoUrl
          const { data, error } = await (supabase as any)
            .from('project_contracts')
            .update(patch)
            .eq('id', r.id)
            .select('id')
          if (error) throw error
          if (data && data.length > 0) updated += 1
          else failures.push(`${r.cntrct_nm} (작성자만 수정 가능)`)
        } catch (err: unknown) {
          failures.push(`${r.cntrct_nm} (${err instanceof Error ? err.message : '오류'})`)
        } finally {
          setRefreshProgress((p) => ({ ...p, done: p.done + 1 }))
        }
      }
      await loadRecords()
      alert(
        `갱신 완료: ${updated}건` +
        (failures.length
          ? `\n실패/건너뜀 ${failures.length}건:\n- ${failures.slice(0, 5).join('\n- ')}${failures.length > 5 ? '\n…' : ''}`
          : '')
      )
    } finally {
      setRefreshing(false)
    }
  }

  const handleDelete = async (record: ContractRecord) => {
    if (!confirm(`"${record.cntrct_nm}" 계약을 삭제하시겠습니까?`)) return
    const { error } = await (supabase as any).from('project_contracts').delete().eq('id', record.id)
    if (!error) loadRecords()
    else alert('삭제 실패: ' + error.message)
  }

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

      <main className="max-w-6xl mx-auto py-4 px-2 sm:px-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-blue-600 text-white px-4 py-3 flex items-center justify-between gap-2">
            <h2 className="font-semibold text-sm sm:text-base">
              계약 현황
              {records.length > 0 && (
                <span className="ml-2 text-xs font-normal text-blue-100">공사 {cnstwkCount}건 · 용역 {servcCount}건</span>
              )}
            </h2>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleRefreshAll}
                disabled={refreshing}
                title="등록된 계약을 조달청 최신 정보로 일괄 갱신"
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-white text-blue-700 rounded-lg hover:bg-blue-50 disabled:opacity-60"
              >
                {refreshing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {refreshProgress.done}/{refreshProgress.total}
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4" />
                    업데이트
                  </>
                )}
              </button>
              <button
                onClick={openLookup}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-white text-blue-700 rounded-lg hover:bg-blue-50"
              >
                <Plus className="h-4 w-4" />
                추가
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-20"><LoadingSpinner /></div>
          ) : sortedRecords.length === 0 ? (
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
                    <th className="px-3 py-2 text-left font-medium">구분</th>
                    <th className="px-3 py-2 text-left font-medium">연도</th>
                    <th className="px-3 py-2 text-left font-medium">계약명</th>
                    <th className="px-3 py-2 text-left font-medium">계약상대자</th>
                    <th className="px-3 py-2 text-right font-medium">총계약금액(원)</th>
                    <th className="px-3 py-2 text-right font-medium">금차계약금액(원)</th>
                    <th className="px-3 py-2 text-left font-medium">계약체결일</th>
                    <th className="px-3 py-2 text-left font-medium">계약기간</th>
                    <th className="px-3 py-2 text-left font-medium">수요기관</th>
                    <th className="px-3 py-2 text-center font-medium">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {/* 소계행 — 금액 합계 */}
                  <tr className="bg-blue-50/60 border-b border-gray-200 font-semibold text-gray-700">
                    <td className="px-3 py-2" colSpan={4}>소계 ({records.length}건)</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {records.reduce((s, r) => s + (r.tot_cntrct_amt || 0), 0).toLocaleString('ko-KR')}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {records.reduce((s, r) => s + (r.thtm_cntrct_amt || 0), 0).toLocaleString('ko-KR')}
                    </td>
                    <td colSpan={4} />
                  </tr>
                  {sortedRecords.map((r) => (
                    <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                          r.contract_type === '공사' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                        }`}>
                          {r.contract_type}
                        </span>
                      </td>
                      <td className="px-3 py-2 tabular-nums">{contractYear(r) || '-'}</td>
                      <td className="px-3 py-2 max-w-[320px]">
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
                      </td>
                      <td className="px-3 py-2 max-w-[180px] truncate" title={r.corp_nm || ''}>{r.corp_nm || '-'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatAmt(r.tot_cntrct_amt)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatAmt(r.thtm_cntrct_amt)}</td>
                      <td className="px-3 py-2">{r.cntrct_date || '-'}</td>
                      <td className="px-3 py-2 max-w-[200px] truncate" title={r.cntrct_prd || ''}>
                        {r.start_date && r.end_date ? `${r.start_date} ~ ${r.end_date}` : (r.cntrct_prd || '-')}
                      </td>
                      <td className="px-3 py-2 max-w-[200px] truncate" title={r.dminstt_nm || ''}>{r.dminstt_nm || '-'}</td>
                      <td className="px-3 py-2 text-center">
                        <button
                          onClick={() => handleDelete(r)}
                          className="p-1 text-gray-400 hover:text-red-600"
                          title="삭제"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
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
            className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden"
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
              <>
              {/* 구분 탭 — 공사/용역(기간 조회), 계약번호(단건 조회) */}
              <div className="grid grid-cols-3 gap-2">
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
                <label className="block text-xs font-medium text-gray-600 mb-1">계약명 검색어 (선택 — 기관명과 함께 조회 조건으로 적용)</label>
                <input
                  type="text"
                  value={lookupKeyword}
                  onChange={(e) => setLookupKeyword(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !lookupLoading) handleLookup() }}
                  placeholder="예: 북내지구"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-[11px] text-gray-400 mt-1">비우면 기관 전체 계약을 표시합니다. 여러 단어를 입력하면 단어별 부분일치로 거릅니다.</p>
              </div>

              {/* 기관명 */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">기관명 (계약·수요기관, 부분일치)</label>
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
                      className="px-2 py-1 text-xs border border-gray-300 rounded text-gray-600 hover:bg-gray-50"
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

              {lookupError && <p className="text-xs text-red-600">{lookupError}</p>}

              {/* 조회 결과 */}
              {lookupItems && (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
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
                        : '조회된 계약이 없습니다. 기관명·기간을 확인해주세요.'}
                    </p>
                  ) : (
                    <div className="max-h-72 overflow-y-auto divide-y divide-gray-100">
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
                                const next = new Set(prev)
                                if (next.has(item.key)) next.delete(item.key)
                                else next.add(item.key)
                                return next
                              })}
                              className="mt-1 accent-blue-600 shrink-0"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm text-gray-900 break-all">
                                {item.name}
                                {registered && (
                                  <span className="ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] bg-green-100 text-green-700 align-middle">등록됨</span>
                                )}
                              </p>
                              <p className="text-xs text-gray-500 mt-0.5">
                                체결 {item.cntrctDate || '-'} · 준공 {item.endDate || '-'} · 총액 {formatAmt(item.totAmt)}원
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
              </>
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
                <div className="grid grid-cols-2 gap-2">
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
                    <label className="block text-xs font-medium text-gray-600 mb-1">금차계약금액(원)</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={mForm.thtmAmt}
                      onChange={(e) => setMForm((p) => ({ ...p, thtmAmt: formatAmtInput(e.target.value) }))}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
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
