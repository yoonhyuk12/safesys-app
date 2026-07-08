'use client'

// 사업현황 '공사·용역·물품 계약현황' 카드 뷰 — 본부별→지사별→사업별 유형별 계약금액 드릴다운 테이블
import React, { useState, useEffect, useMemo, useRef } from 'react'
import { ArrowLeft, Coins } from 'lucide-react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { BRANCH_OPTIONS } from '@/lib/constants'
import { getProjectsByUserBranch, type Project } from '@/lib/projects'

interface BusinessAllContractViewProps {
  initialHq?: string | null
  initialBranch?: string | null
  onBack: () => void
  onRowClickProject: (projectId: string, hq: string | null, branch: string | null) => void
}

// project_contracts에서 유형별 금액 집계에 필요한 필드만 선언
interface ContractRecord {
  project_id: string
  contract_type: '공사' | '용역'
  tot_cntrct_amt: number | null
  thtm_cntrct_amt: number | null
}

// material_ledger_entries + materials 임베드 결과 — 물품(지급자재) 금액 원천
interface LedgerAmountRecord {
  prdct_amt: number | null
  fee_amt: number | null
  materials: { project_id: string }
}

// 준공 프로젝트 판별 — is_active가 과거 boolean 또는 JSONB({completed}) 두 형태를 모두 지원 (lib/projects.ts 패턴과 동일)
const isCompleted = (p: Project): boolean => {
  if (p.is_active === undefined || p.is_active === null) return false
  if (typeof p.is_active === 'boolean') return !p.is_active
  if (typeof p.is_active === 'object') return p.is_active.completed === true
  return false
}

// 본부명 표시 — '본사'/'기타'가 아니고 '본부'로 안 끝나면 접미
const hqDisplay = (hq: string): string =>
  hq !== '본사' && hq !== '기타' && !hq.endsWith('본부') ? `${hq}본부` : hq

const HQ_KEYS = Object.keys(BRANCH_OPTIONS)
const hqIndex = (hq: string): number => {
  const i = HQ_KEYS.indexOf(hq)
  return i === -1 ? HQ_KEYS.length : i
}

// 유형별 금액 집계 — 사업·지사·본부 공용
interface AmountStats {
  cnstwkAmount: number // 공사 계약금액 합
  servcAmount: number // 용역 계약금액 합
  thngAmount: number // 물품(지급자재 품대+조달수수료) 금액 합
  totalAmount: number // 세 유형 합계
}

// 사업(프로젝트) 단위 집계 행 — 본부/지사 집계와 사업 테이블의 공통 원천
interface ProjectRow extends AmountStats {
  projectId: string
  projectName: string
  managingHq: string
  managingBranch: string
  displayOrder: number
}

const emptyStats = (): AmountStats => ({ cnstwkAmount: 0, servcAmount: 0, thngAmount: 0, totalAmount: 0 })

const addStats = (a: AmountStats, r: AmountStats): void => {
  a.cnstwkAmount += r.cnstwkAmount
  a.servcAmount += r.servcAmount
  a.thngAmount += r.thngAmount
  a.totalAmount += r.totalAmount
}

// 금액 표시 — 단위(천원=1000, 백만원=1000000)로 나눠 반올림, 0/null은 '-'
const formatAmt = (n: number | null | undefined, unit: number) =>
  n == null || n === 0 ? '-' : Math.round(n / unit).toLocaleString('ko-KR')

// 숫자 옆에 작게 붙이는 단위 라벨
const unitLabel = (unit: number) => (unit === 1000000 ? '백만원' : '천원')

// 계약 행 1건의 금액 — 차수분은 금차금액, 금차 미기재 시 총액으로 폴백 (공사 계약현황 뷰와 동일 규칙)
const rowAmount = (r: ContractRecord): number => r.thtm_cntrct_amt ?? r.tot_cntrct_amt ?? 0

// 금액 컬럼 1개의 게이지 기준 — 소계 합과 표 내 최대 비중(색 정규화 기준)
interface ColGauge {
  sum: number
  maxShare: number
}

const colGauge = (values: number[]): ColGauge => {
  const sum = values.reduce((s, v) => s + v, 0)
  return {
    sum,
    maxShare: sum > 0 ? Math.max(...values) / sum : 0,
  }
}

// 금액 게이지 셀 — 소계 대비 비중(%)만큼 셀 배경을 채우고, 표 내 최대 비중 기준으로
// 왼쪽 파랑(hue 217)에서 행의 비중 색(높을수록 빨강 hue 0)까지 그라데이션으로 채워 금액 비중을 한눈에 보여준다
const amountGaugeCell = (value: number, gauge: ColGauge, unit: number, key?: string) => {
  const share = gauge.sum > 0 && value > 0 ? value / gauge.sum : 0
  const t = gauge.maxShare > 0 ? Math.min(share / gauge.maxShare, 1) : 0
  return (
    <td
      key={key}
      className="px-3 py-3 text-sm text-center text-gray-700 relative"
      title={share > 0 ? `소계 대비 ${(share * 100).toFixed(1)}%` : undefined}
    >
      {share > 0 && (
        <span
          className="absolute inset-y-1 left-0 rounded-r-sm"
          style={{
            width: `${(share * 100).toFixed(1)}%`,
            background: `linear-gradient(to right, hsla(217, 85%, 50%, 0.3), hsla(${Math.round(217 * (1 - t))}, 85%, 50%, 0.3))`,
          }}
        >
          {/* 소계 대비 % 라벨 — 게이지가 좁아도 잘리지 않게 왼쪽 기준 배치, 모바일에서는 숨김 */}
          <span className="hidden sm:flex items-center h-full pl-1 text-[9px] text-gray-500 whitespace-nowrap">
            {(share * 100).toFixed(1)}%
          </span>
        </span>
      )}
      <span className="relative">
        {formatAmt(value, unit)}
        {value > 0 && <span className="ml-0.5 text-[10px] text-gray-600">{unitLabel(unit)}</span>}
      </span>
    </td>
  )
}

const BusinessAllContractView: React.FC<BusinessAllContractViewProps> = ({
  initialHq = null,
  initialBranch = null,
  onBack,
  onRowClickProject,
}) => {
  const { user, userProfile } = useAuth()
  // 빈 문자열(returnUrl의 hq=&branch=)은 null로 정규화
  const hq0 = initialHq || null
  const branch0 = initialBranch || null
  // 복귀(계약현황 서류철) 시 해당 레벨부터 복원 — 지사가 있으면 사업, 본부만 있으면 지사, 없으면 본부
  const [viewLevel, setViewLevel] = useState<'hq' | 'branch' | 'project'>(
    branch0 ? 'project' : hq0 ? 'branch' : 'hq'
  )
  const [selectedHq, setSelectedHq] = useState<string | null>(hq0)
  const [selectedBranch, setSelectedBranch] = useState<string | null>(branch0)
  const [contracts, setContracts] = useState<ContractRecord[]>([])
  const [ledgerAmounts, setLedgerAmounts] = useState<LedgerAmountRecord[]>([])
  // 관할 내 전체 프로젝트(준공 제외) — 계약 미등록 사업도 표에 노출하기 위한 행 원천
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const loadedRef = useRef(false)

  useEffect(() => {
    if (!user || !userProfile) return
    if (userProfile.role !== '발주청') {
      setLoading(false)
      return
    }
    if (loadedRef.current) return
    loadedRef.current = true

    const load = async () => {
      try {
        // 관할 프로젝트(준공 제외)를 먼저 확보하고, 그 id 목록으로 계약·지급자재 금액을 조회
        // (getMaterialCountsByUserBranch와 동일한 .in() 필터 패턴)
        const projectsRes = await getProjectsByUserBranch(userProfile)
        if (!projectsRes.success) {
          setError('계약 현황을 불러오지 못했습니다.')
          return
        }
        const activeProjects = (projectsRes.projects || []).filter((p) => !isCompleted(p))
        setProjects(activeProjects)
        const ids = activeProjects.map((p) => p.id)
        if (ids.length === 0) return

        const [contractsRes, ledgerRes] = await Promise.all([
          supabase
            .from('project_contracts')
            .select('project_id, contract_type, tot_cntrct_amt, thtm_cntrct_amt')
            .in('project_id', ids),
          // 물품 금액 = 지급자재 수불부 행의 품대(prdct_amt)+조달수수료(fee_amt) 합 (지급자재 계약현황 엑셀과 동일 규칙)
          supabase
            .from('material_ledger_entries')
            .select('prdct_amt, fee_amt, materials!inner(project_id)')
            .in('materials.project_id', ids),
        ])
        if (contractsRes.error || ledgerRes.error) {
          setError('계약 현황을 불러오지 못했습니다.')
          return
        }
        setContracts((contractsRes.data || []) as ContractRecord[])
        setLedgerAmounts((ledgerRes.data || []) as unknown as LedgerAmountRecord[])
      } catch {
        setError('계약 현황을 불러오는 중 오류가 발생했습니다.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user, userProfile])

  // 사업(프로젝트)별 유형 금액 집계 — 관할 내 전체 프로젝트(준공 제외)를 행으로 만들고
  // 본부·지사·display_order·사업명 순 정렬 (공사 계약현황 뷰와 동일 순서)
  const projectRows = useMemo<ProjectRow[]>(() => {
    const byProject = new Map<string, AmountStats>()
    const statsOf = (projectId: string): AmountStats => {
      const s = byProject.get(projectId)
      if (s) return s
      const created = emptyStats()
      byProject.set(projectId, created)
      return created
    }
    for (const r of contracts) {
      const s = statsOf(r.project_id)
      if (r.contract_type === '공사') s.cnstwkAmount += rowAmount(r)
      else if (r.contract_type === '용역') s.servcAmount += rowAmount(r)
    }
    for (const r of ledgerAmounts) {
      const s = statsOf(r.materials.project_id)
      s.thngAmount += (Number(r.prdct_amt) || 0) + (Number(r.fee_amt) || 0)
    }

    const rows: ProjectRow[] = projects.map((proj) => {
      const s = byProject.get(proj.id) || emptyStats()
      return {
        projectId: proj.id,
        projectName: proj.project_name,
        managingHq: proj.managing_hq,
        managingBranch: proj.managing_branch,
        displayOrder: proj.display_order ?? Number.MAX_SAFE_INTEGER,
        cnstwkAmount: s.cnstwkAmount,
        servcAmount: s.servcAmount,
        thngAmount: s.thngAmount,
        totalAmount: s.cnstwkAmount + s.servcAmount + s.thngAmount,
      }
    })

    // 정렬: 본부 → 지사 → display_order → 사업명 (이 순서가 곧 Map 삽입 순서 = 표 순서)
    rows.sort((a, b) => {
      const hi = hqIndex(a.managingHq) - hqIndex(b.managingHq)
      if (hi !== 0) return hi
      const arr = BRANCH_OPTIONS[a.managingHq] || []
      const ai = arr.indexOf(a.managingBranch)
      const bi = arr.indexOf(b.managingBranch)
      const aIdx = ai === -1 ? Infinity : ai
      const bIdx = bi === -1 ? Infinity : bi
      if (aIdx !== bIdx) return aIdx - bIdx
      if (aIdx === Infinity) {
        const bc = a.managingBranch.localeCompare(b.managingBranch, 'ko')
        if (bc !== 0) return bc
      }
      if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder
      return a.projectName.localeCompare(b.projectName, 'ko')
    })

    return rows
  }, [contracts, ledgerAmounts, projects])

  // 본부별 집계 (정렬 순서 = Map 삽입 순서 유지)
  const hqStats = useMemo(() => {
    const m = new Map<string, AmountStats>()
    for (const r of projectRows) {
      const s = m.get(r.managingHq) || emptyStats()
      addStats(s, r)
      m.set(r.managingHq, s)
    }
    return m
  }, [projectRows])

  // 선택 본부의 지사별 집계
  const branchStats = useMemo(() => {
    const m = new Map<string, AmountStats>()
    if (!selectedHq) return m
    for (const r of projectRows) {
      if (r.managingHq !== selectedHq) continue
      const s = m.get(r.managingBranch) || emptyStats()
      addStats(s, r)
      m.set(r.managingBranch, s)
    }
    return m
  }, [projectRows, selectedHq])

  // 선택 본부·지사의 사업 목록
  const projectList = useMemo(() => {
    if (!selectedHq || !selectedBranch) return []
    return projectRows.filter((r) => r.managingHq === selectedHq && r.managingBranch === selectedBranch)
  }, [projectRows, selectedHq, selectedBranch])

  const handleBack = () => {
    if (viewLevel === 'project') {
      setViewLevel('branch')
      setSelectedBranch(null)
    } else if (viewLevel === 'branch') {
      setViewLevel('hq')
      setSelectedHq(null)
    } else {
      onBack()
    }
  }

  const handleHqClick = (hq: string) => {
    setSelectedHq(hq)
    setViewLevel('branch')
  }

  const handleBranchClick = (branch: string) => {
    setSelectedBranch(branch)
    setViewLevel('project')
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[300px]">
        <LoadingSpinner />
      </div>
    )
  }

  // 유형별 금액 접근자 — 컬럼 순서(공사·용역·물품·합계)의 단일 출처
  const AMOUNT_COLS: { key: string; label: string; value: (s: AmountStats) => number }[] = [
    { key: 'cnstwk', label: '공사', value: (s) => s.cnstwkAmount },
    { key: 'servc', label: '용역', value: (s) => s.servcAmount },
    { key: 'thng', label: '물품', value: (s) => s.thngAmount },
    { key: 'total', label: '합계', value: (s) => s.totalAmount },
  ]

  // 소계 행 — 표시 중인 집계 목록을 합산
  const sumStats = (list: AmountStats[]): AmountStats =>
    list.reduce((acc, curr) => {
      addStats(acc, curr)
      return acc
    }, emptyStats())

  // 소계 행 금액 셀 (게이지 없음)
  const subtotalCells = (s: AmountStats, unit: number) =>
    AMOUNT_COLS.map((c) => (
      <td key={c.key} className="px-3 py-2 text-sm text-center text-violet-800">
        {formatAmt(c.value(s), unit)}
        {c.value(s) > 0 && <span className="ml-0.5 text-[10px] text-violet-700">{unitLabel(unit)}</span>}
      </td>
    ))

  // 데이터 행 금액 셀 — 컬럼별 소계 대비 비중 게이지
  const amountCells = (s: AmountStats, unit: number, gauges: ColGauge[]) =>
    AMOUNT_COLS.map((c, i) => amountGaugeCell(c.value(s), gauges[i], unit, c.key))

  // 표 단위 컬럼 게이지 기준값 계산
  const gaugesOf = (list: AmountStats[]): ColGauge[] =>
    AMOUNT_COLS.map((c) => colGauge(list.map((s) => c.value(s))))

  // 본부·지사·사업 표 공용 헤더 (첫 컬럼 라벨만 다름)
  const tableHead = (firstLabel: string) => (
    <thead className="bg-gray-50 border-b border-gray-200">
      <tr>
        <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">{firstLabel}</th>
        {AMOUNT_COLS.map((c) => (
          <th key={c.key} className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
            {c.label}
          </th>
        ))}
      </tr>
    </thead>
  )

  const hqGauges = gaugesOf(Array.from(hqStats.values()))
  const branchGauges = gaugesOf(Array.from(branchStats.values()))
  const projectGauges = gaugesOf(projectList)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={handleBack}
          className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          aria-label="뒤로가기"
        >
          <ArrowLeft className="h-5 w-5 text-gray-300" />
        </button>
        <div className="flex items-center gap-2">
          <Coins className="h-5 w-5 text-violet-400" />
          <h2 className="text-lg font-semibold text-white">
            공사·용역·물품 계약현황
            {viewLevel !== 'hq' && selectedHq && (
              <span className="text-sm font-normal text-gray-300 ml-2">- {hqDisplay(selectedHq)}</span>
            )}
            {viewLevel === 'project' && selectedBranch && (
              <span className="text-sm font-normal text-gray-300 ml-1">{selectedBranch}</span>
            )}
          </h2>
        </div>
      </div>

      {error && (
        <div className="bg-white rounded-lg border border-gray-200 py-8 text-center text-sm text-red-600">{error}</div>
      )}

      {/* 본부별 테이블 */}
      {!error && viewLevel === 'hq' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-violet-50 px-4 py-3 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <Coins className="h-4 w-4 text-violet-600" />
              <span className="text-sm font-medium text-violet-800">본부별 공사·용역·물품 계약현황</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px]">
              {tableHead('본부')}
              <tbody className="divide-y divide-gray-200">
                {/* 소계 */}
                <tr className="bg-violet-50/70 font-semibold border-b-2 border-violet-200">
                  <td className="px-3 py-2 text-sm text-center text-violet-800">소계</td>
                  {subtotalCells(sumStats(Array.from(hqStats.values())), 1000000)}
                </tr>
                {Array.from(hqStats.entries()).map(([hq, stats]) => (
                  <tr key={hq} onClick={() => handleHqClick(hq)} className="hover:bg-violet-50/50 cursor-pointer transition-colors">
                    <td className="px-3 py-3 text-sm font-medium text-gray-900 text-center">{hqDisplay(hq)}</td>
                    {amountCells(stats, 1000000, hqGauges)}
                  </tr>
                ))}
                {hqStats.size === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">등록된 사업이 없습니다. (준공 사업은 표시되지 않습니다)</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 지사별 테이블 */}
      {!error && viewLevel === 'branch' && selectedHq && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-violet-50 px-4 py-3 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <Coins className="h-4 w-4 text-violet-600" />
              <span className="text-sm font-medium text-violet-800">{hqDisplay(selectedHq)} - 지사별 공사·용역·물품 계약현황</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px]">
              {tableHead('지사')}
              <tbody className="divide-y divide-gray-200">
                {/* 소계 */}
                <tr className="bg-violet-50/70 font-semibold border-b-2 border-violet-200">
                  <td className="px-3 py-2 text-sm text-center text-violet-800">소계</td>
                  {subtotalCells(sumStats(Array.from(branchStats.values())), 1000000)}
                </tr>
                {Array.from(branchStats.entries()).map(([branch, stats]) => (
                  <tr key={branch} onClick={() => handleBranchClick(branch)} className="hover:bg-violet-50/50 cursor-pointer transition-colors">
                    <td className="px-3 py-3 text-sm font-medium text-gray-900 text-center">{branch}</td>
                    {amountCells(stats, 1000000, branchGauges)}
                  </tr>
                ))}
                {branchStats.size === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">해당 본부에 등록된 사업이 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 사업별 테이블 */}
      {!error && viewLevel === 'project' && selectedHq && selectedBranch && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-violet-50 px-4 py-3 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <Coins className="h-4 w-4 text-violet-600" />
              <span className="text-sm font-medium text-violet-800">{selectedBranch} - 사업별 공사·용역·물품 계약현황</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px]">
              {tableHead('사업명')}
              <tbody className="divide-y divide-gray-200">
                {/* 소계 */}
                <tr className="bg-violet-50/70 font-semibold border-b-2 border-violet-200">
                  <td className="px-3 py-2 text-sm text-center text-violet-800">소계</td>
                  {subtotalCells(sumStats(projectList), 1000)}
                </tr>
                {projectList.map((p) => (
                  <tr key={p.projectId} onClick={() => onRowClickProject(p.projectId, selectedHq, selectedBranch)} className="hover:bg-violet-50/50 cursor-pointer transition-colors">
                    <td className="px-3 py-3 text-sm font-medium text-gray-900 text-center">
                      <span className="sm:hidden" title={p.projectName}>
                        {p.projectName.length > 3 ? `${p.projectName.slice(0, 3)}...` : p.projectName}
                      </span>
                      <span className="hidden sm:inline">{p.projectName}</span>
                    </td>
                    {amountCells(p, 1000, projectGauges)}
                  </tr>
                ))}
                {projectList.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">해당 지사에 등록된 사업이 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default BusinessAllContractView
