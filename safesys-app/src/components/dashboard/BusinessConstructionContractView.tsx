'use client'

// 사업현황 '공사 계약 현황' 카드 뷰 — 본부별→지사별→사업별 계약 건수 드릴다운 테이블
import React, { useState, useEffect, useMemo, useRef } from 'react'
import { ArrowLeft, Building } from 'lucide-react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { BRANCH_OPTIONS } from '@/lib/constants'
import { getProjectsByUserBranch, type Project } from '@/lib/projects'

interface BusinessConstructionContractViewProps {
  initialHq?: string | null
  initialBranch?: string | null
  onBack: () => void
  onRowClickProject: (projectId: string, hq: string | null, branch: string | null) => void
}

// project_contracts + projects 조인 결과에서 필요한 필드만 선언
interface ContractRecord {
  id: string
  project_id: string
  contract_type: '공사' | '용역'
  cntrct_nm: string
  tot_cntrct_amt: number | null
  thtm_cntrct_amt: number | null
  cntrct_date: string | null
  end_date: string | null
  thtm_end_date: string | null
  projects: {
    id: string
    project_name: string
    managing_hq: string
    managing_branch: string
    display_order: number | null
  }
}

// 준공 프로젝트 판별 — is_active가 과거 boolean 또는 JSONB({completed}) 두 형태를 모두 지원 (lib/projects.ts 패턴과 동일)
const isCompleted = (p: Project): boolean => {
  if (p.is_active === undefined || p.is_active === null) return false
  if (typeof p.is_active === 'boolean') return !p.is_active
  if (typeof p.is_active === 'object') return p.is_active.completed === true
  return false
}

// 차수(연차) 접미어·공백 제거 정규화 (contract-status의 nameGroupKey 규칙과 동일)
const norm = (name: string): string =>
  name.replace(/\(\s*\d+\s*차[^)]*\)\s*$/, '').replace(/\s+/g, '')

// 금차 귀속 연도 — 장기계속계약 차수분(총금액 ≠ 금차금액)은 금차 준공일(thtm_end_date) 연도,
// 일반 단년도 계약은 계약체결일 연도를 귀속 연도로 사용. 정보 부족 시 총준공일/올해로 폴백.
// (contract-status 페이지 contractYear()와 동일 로직)
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

// 본부명 표시 — '본사'/'기타'가 아니고 '본부'로 안 끝나면 접미
const hqDisplay = (hq: string): string =>
  hq !== '본사' && hq !== '기타' && !hq.endsWith('본부') ? `${hq}본부` : hq

const HQ_KEYS = Object.keys(BRANCH_OPTIONS)
const hqIndex = (hq: string): number => {
  const i = HQ_KEYS.indexOf(hq)
  return i === -1 ? HQ_KEYS.length : i
}

// 사업(프로젝트) 단위 집계 행 — 본부/지사 집계와 사업 테이블의 공통 원천
interface ProjectRow {
  projectId: string
  projectName: string
  managingHq: string
  managingBranch: string
  displayOrder: number
  workCount: number // 병합 그룹 수 (= 공사 건수)
  totalContracts: number // 계약 행 수 (차수 포함 전체 계약 건수)
  thisYearContracts: number // 귀속 연도가 올해인 계약 행 수
  totalAmount: number // 전체 계약 행의 금차금액 합 (차수 없는 단년도 계약은 총액=금차)
  thisYearAmount: number // 귀속 연도가 올해인 계약 행의 금차금액 합
}

interface AggStats {
  workCount: number
  totalContracts: number
  thisYearContracts: number
  totalAmount: number
  thisYearAmount: number
}

const emptyAgg = (): AggStats => ({ workCount: 0, totalContracts: 0, thisYearContracts: 0, totalAmount: 0, thisYearAmount: 0 })

// ProjectRow도 구조적으로 AggStats에 할당 가능하므로 사업·본부·지사 집계에 공용
const addAgg = (a: AggStats, r: AggStats): void => {
  a.workCount += r.workCount
  a.totalContracts += r.totalContracts
  a.thisYearContracts += r.thisYearContracts
  a.totalAmount += r.totalAmount
  a.thisYearAmount += r.thisYearAmount
}

// 금액 표시 — 단위(천원=1000, 백만원=1000000)로 나눠 반올림, 0/null은 '-'
const formatAmt = (n: number | null | undefined, unit: number) =>
  n == null || n === 0 ? '-' : Math.round(n / unit).toLocaleString('ko-KR')

// 숫자 옆에 작게 붙이는 단위 라벨
const unitLabel = (unit: number) => (unit === 1000000 ? '백만원' : '천원')

// 계약 행 1건의 금액 — 차수분은 금차금액, 금차 미기재 시 총액으로 폴백
const rowAmount = (r: ContractRecord): number => r.thtm_cntrct_amt ?? r.tot_cntrct_amt ?? 0

const BusinessConstructionContractView: React.FC<BusinessConstructionContractViewProps> = ({
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
  const [records, setRecords] = useState<ContractRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const loadedRef = useRef(false)

  const currentYear = new Date().getFullYear()
  const currentYearStr = String(currentYear)

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
        // projects와 FK 관계가 2개(project_id, 대표계약)라 임베드에 컬럼 힌트가 필수 — 없으면 모호성 오류
        let q = (supabase as any)
          .from('project_contracts')
          .select('*, projects!project_id!inner(id, project_name, managing_hq, managing_branch, display_order)')
          .eq('contract_type', '공사')

        // getProjectsByUserBranch와 동일한 관할 범위 규칙을 조인 컬럼 필터로 재현
        const hq = userProfile.hq_division
        const branch = userProfile.branch_division
        if (hq === '본사' && branch === '본사') {
          // 본사 조직: 필터 없음
        } else if (hq) {
          if (branch) {
            const hqBranches = BRANCH_OPTIONS[hq] || []
            const isHeadquarterBranch = hqBranches.length > 0 && hqBranches[0] === branch
            if (isHeadquarterBranch) q = q.eq('projects.managing_hq', hq)
            else q = q.eq('projects.managing_branch', branch)
          } else {
            q = q.eq('projects.managing_hq', hq)
          }
        }
        // hq 없음: 필터 없음 (관리자급)

        const { data, error: qErr } = await q
        if (qErr) {
          setError('계약 현황을 불러오지 못했습니다.')
          return
        }
        setRecords((data || []) as ContractRecord[])
      } catch {
        setError('계약 현황을 불러오는 중 오류가 발생했습니다.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user, userProfile])

  // 사업(프로젝트)별 집계 — 차수 병합 그룹 수·전체 계약 행 수·올해 귀속 행 수 계산 후 본부·지사·display_order·사업명 순 정렬
  const projectRows = useMemo<ProjectRow[]>(() => {
    const byProject = new Map<string, ContractRecord[]>()
    for (const r of records) {
      const arr = byProject.get(r.project_id)
      if (arr) arr.push(r)
      else byProject.set(r.project_id, [r])
    }

    const rows: ProjectRow[] = []
    for (const projectRecords of byProject.values()) {
      const proj = projectRecords[0].projects
      if (!proj) continue

      // 차수 병합 그룹 (contract_type + '|' + norm(cntrct_nm)) — 그룹 수 = 공사 건수
      const groupKeys = new Set<string>()
      for (const r of projectRecords) {
        groupKeys.add(`${r.contract_type}|${norm(r.cntrct_nm)}`)
      }

      const thisYearRecords = projectRecords.filter((r) => contractYear(r) === currentYearStr)
      rows.push({
        projectId: proj.id,
        projectName: proj.project_name,
        managingHq: proj.managing_hq,
        managingBranch: proj.managing_branch,
        displayOrder: proj.display_order ?? Number.MAX_SAFE_INTEGER,
        workCount: groupKeys.size,
        totalContracts: projectRecords.length,
        thisYearContracts: thisYearRecords.length,
        totalAmount: projectRecords.reduce((s, r) => s + rowAmount(r), 0),
        thisYearAmount: thisYearRecords.reduce((s, r) => s + rowAmount(r), 0),
      })
    }

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
  }, [records, currentYearStr])

  // 본부별 집계 (정렬 순서 = Map 삽입 순서 유지)
  const hqStats = useMemo(() => {
    const m = new Map<string, AggStats>()
    for (const r of projectRows) {
      const s = m.get(r.managingHq) || emptyAgg()
      addAgg(s, r)
      m.set(r.managingHq, s)
    }
    return m
  }, [projectRows])

  // 선택 본부의 지사별 집계
  const branchStats = useMemo(() => {
    const m = new Map<string, AggStats>()
    if (!selectedHq) return m
    for (const r of projectRows) {
      if (r.managingHq !== selectedHq) continue
      const s = m.get(r.managingBranch) || emptyAgg()
      addAgg(s, r)
      m.set(r.managingBranch, s)
    }
    return m
  }, [projectRows, selectedHq])

  // 선택 본부·지사의 사업 목록
  const projectList = useMemo(() => {
    if (!selectedHq || !selectedBranch) return []
    return projectRows.filter((r) => r.managingHq === selectedHq && r.managingBranch === selectedBranch)
  }, [projectRows, selectedHq, selectedBranch])

  const totalWorkCount = useMemo(() => projectRows.reduce((s, r) => s + r.workCount, 0), [projectRows])

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

  // 소계 행 (본부/지사 테이블 공용) — 표시 중인 집계 Map을 합산
  const sumStats = (m: Map<string, AggStats>): AggStats =>
    Array.from(m.values()).reduce((acc, curr) => {
      addAgg(acc, curr)
      return acc
    }, emptyAgg())

  // 집계 셀 렌더 — unit은 금액 표시 단위(본부·지사 표는 백만원, 사업 표는 천원), 소계 행은 강조 스타일
  const statCells = (s: AggStats, unit: number, subtotal = false) => (
    <>
      <td className={subtotal ? 'px-3 py-2 text-sm text-center text-sky-800' : 'px-3 py-3 text-sm text-center'}>
        {subtotal ? (
          s.workCount > 0 ? `${s.workCount.toLocaleString()}건` : '-'
        ) : s.workCount > 0 ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-sky-100 text-sky-800">
            {s.workCount.toLocaleString()}건
          </span>
        ) : (
          <span className="text-gray-400">-</span>
        )}
      </td>
      <td className={subtotal ? 'px-3 py-2 text-sm text-center text-sky-800' : 'px-3 py-3 text-sm text-center'}>
        {subtotal ? (
          s.totalContracts > 0 ? `${s.totalContracts.toLocaleString()}건` : '-'
        ) : s.totalContracts > 0 ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            {s.totalContracts.toLocaleString()}건
          </span>
        ) : (
          <span className="text-gray-400">-</span>
        )}
      </td>
      <td className={subtotal ? 'px-3 py-2 text-sm text-center text-sky-800' : 'px-3 py-3 text-sm text-center text-gray-700'}>
        {formatAmt(s.totalAmount, unit)}
        {s.totalAmount > 0 && <span className="ml-0.5 text-[10px] text-gray-600">{unitLabel(unit)}</span>}
      </td>
      <td className={subtotal ? 'px-3 py-2 text-sm text-center text-sky-800' : 'px-3 py-3 text-sm text-center'}>
        {subtotal ? (
          s.thisYearContracts > 0 ? `${s.thisYearContracts.toLocaleString()}건` : '-'
        ) : s.thisYearContracts > 0 ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-800">
            {s.thisYearContracts.toLocaleString()}건
          </span>
        ) : (
          <span className="text-gray-400">-</span>
        )}
      </td>
      <td className={subtotal ? 'px-3 py-2 text-sm text-center text-sky-800' : 'px-3 py-3 text-sm text-center text-gray-700'}>
        {formatAmt(s.thisYearAmount, unit)}
        {s.thisYearAmount > 0 && <span className="ml-0.5 text-[10px] text-gray-600">{unitLabel(unit)}</span>}
      </td>
      <td className={subtotal ? 'px-3 py-2 text-sm text-center text-sky-800' : 'px-3 py-3 text-sm text-center text-gray-400'}>-</td>
    </>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={handleBack}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          aria-label="뒤로가기"
        >
          <ArrowLeft className="h-5 w-5 text-gray-600" />
        </button>
        <div className="flex items-center gap-2">
          <Building className="h-5 w-5 text-sky-600" />
          <h2 className="text-lg font-semibold text-gray-900">
            공사 계약현황
            {viewLevel !== 'hq' && selectedHq && (
              <span className="text-sm font-normal text-gray-500 ml-2">- {hqDisplay(selectedHq)}</span>
            )}
            {viewLevel === 'project' && selectedBranch && (
              <span className="text-sm font-normal text-gray-500 ml-1">{selectedBranch}</span>
            )}
          </h2>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden sm:inline text-sm text-gray-500">
            공사 {totalWorkCount.toLocaleString()}건
          </span>
        </div>
      </div>

      {error && (
        <div className="bg-white rounded-lg border border-gray-200 py-8 text-center text-sm text-red-600">{error}</div>
      )}

      {/* 본부별 테이블 */}
      {!error && viewLevel === 'hq' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-sky-50 px-4 py-3 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building className="h-4 w-4 text-sky-600" />
                <span className="text-sm font-medium text-sky-800">본부별 공사 계약현황</span>
              </div>
              <span className="text-sm text-sky-600 font-semibold">공사 {totalWorkCount.toLocaleString()}건</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">본부</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">건수</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">총계약건</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">총계약금액</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">금년계약건({currentYear})</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">금년계약금액</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">비고</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {/* 소계 */}
                <tr className="bg-sky-50/70 font-semibold border-b-2 border-sky-200">
                  <td className="px-3 py-2 text-sm text-center text-sky-800">소계</td>
                  {statCells(sumStats(hqStats), 1000000, true)}
                </tr>
                {Array.from(hqStats.entries()).map(([hq, stats]) => (
                  <tr key={hq} onClick={() => handleHqClick(hq)} className="hover:bg-sky-50/50 cursor-pointer transition-colors">
                    <td className="px-3 py-3 text-sm font-medium text-gray-900 text-center">{hqDisplay(hq)}</td>
                    {statCells(stats, 1000000)}
                  </tr>
                ))}
                {hqStats.size === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500">등록된 계약이 없습니다. 각 사업의 계약현황 서류철에서 계약을 등록하면 여기에 집계됩니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 지사별 테이블 */}
      {!error && viewLevel === 'branch' && selectedHq && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-sky-50 px-4 py-3 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building className="h-4 w-4 text-sky-600" />
                <span className="text-sm font-medium text-sky-800">{hqDisplay(selectedHq)} - 지사별 공사 계약현황</span>
              </div>
              <span className="text-sm text-sky-600 font-semibold">공사 {sumStats(branchStats).workCount.toLocaleString()}건</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">지사</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">건수</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">총계약건</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">총계약금액</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">금년계약건({currentYear})</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">금년계약금액</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">비고</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {/* 소계 */}
                <tr className="bg-sky-50/70 font-semibold border-b-2 border-sky-200">
                  <td className="px-3 py-2 text-sm text-center text-sky-800">소계</td>
                  {statCells(sumStats(branchStats), 1000000, true)}
                </tr>
                {Array.from(branchStats.entries()).map(([branch, stats]) => (
                  <tr key={branch} onClick={() => handleBranchClick(branch)} className="hover:bg-sky-50/50 cursor-pointer transition-colors">
                    <td className="px-3 py-3 text-sm font-medium text-gray-900 text-center">{branch}</td>
                    {statCells(stats, 1000000)}
                  </tr>
                ))}
                {branchStats.size === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500">해당 본부에 등록된 계약이 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 사업별 테이블 */}
      {!error && viewLevel === 'project' && selectedHq && selectedBranch && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-sky-50 px-4 py-3 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building className="h-4 w-4 text-sky-600" />
                <span className="text-sm font-medium text-sky-800">{selectedBranch} - 사업별 공사 계약현황</span>
              </div>
              <span className="text-sm text-sky-600 font-semibold">공사 {projectList.reduce((s, p) => s + p.workCount, 0).toLocaleString()}건</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">사업명</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">건수</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">총계약건</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">총계약금액</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">금년계약건({currentYear})</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">금년계약금액</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">비고</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {/* 소계 */}
                <tr className="bg-sky-50/70 font-semibold border-b-2 border-sky-200">
                  <td className="px-3 py-2 text-sm text-center text-sky-800">소계</td>
                  {statCells(
                    projectList.reduce((acc, p) => {
                      addAgg(acc, p)
                      return acc
                    }, emptyAgg()),
                    1000,
                    true
                  )}
                </tr>
                {projectList.map((p) => (
                  <tr key={p.projectId} onClick={() => onRowClickProject(p.projectId, selectedHq, selectedBranch)} className="hover:bg-sky-50/50 cursor-pointer transition-colors">
                    <td className="px-3 py-3 text-sm font-medium text-gray-900 text-center">
                      <span className="sm:hidden" title={p.projectName}>
                        {p.projectName.length > 3 ? `${p.projectName.slice(0, 3)}...` : p.projectName}
                      </span>
                      <span className="hidden sm:inline">{p.projectName}</span>
                    </td>
                    {statCells(p, 1000)}
                  </tr>
                ))}
                {projectList.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500">해당 지사에 등록된 계약이 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default BusinessConstructionContractView
