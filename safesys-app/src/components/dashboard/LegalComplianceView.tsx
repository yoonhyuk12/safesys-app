'use client'

// 안전현황 '법적이행확인' 카드 뷰 — 본부→지사→프로젝트 3단 드릴다운 + 연도·분기별 안전활동점검표 엑셀 내보내기
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ScrollText, Download, ChevronUp, ChevronDown } from 'lucide-react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { BRANCH_OPTIONS } from '@/lib/constants'
import { getProjectsByUserBranch, type Project } from '@/lib/projects'
import {
  countNonCompliance,
  hydrateFormData,
  type LegalComplianceFormData,
} from '@/lib/legal-compliance/compliance-utils'
import { downloadLegalComplianceExcel } from '@/lib/excel/legal-compliance-export'

interface LegalComplianceViewProps {
  initialHq: string | null
  initialBranch: string | null
  onBack: () => void
}

// 점검표 1건(공종행) — 프로젝트 조인 없이 projectMap으로 본부/지사를 매핑
interface CheckRow {
  projectId: string
  year: number
  quarter: number
  formData: LegalComplianceFormData
  updatedAt: string
}

// 레벨별 집계 통계
interface Agg {
  projectCount: number
  submittedCount: number
  checkCount: number
  contractCount: number
  nonCompliance: number
}
const emptyAgg = (): Agg => ({ projectCount: 0, submittedCount: 0, checkCount: 0, contractCount: 0, nonCompliance: 0 })

// 준공 프로젝트 판별 (is_active가 boolean 또는 {completed} 두 형태 지원)
const isCompleted = (p: Project): boolean => {
  const ia = p.is_active as unknown
  if (ia === undefined || ia === null) return false
  if (typeof ia === 'boolean') return !ia
  if (typeof ia === 'object') return (ia as { completed?: boolean }).completed === true
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
const branchIndex = (hq: string, branch: string): number => {
  const arr = BRANCH_OPTIONS[hq] || []
  const i = arr.indexOf(branch)
  return i === -1 ? arr.length + 1 : i
}

const currentQuarter = (): number => Math.floor(new Date().getMonth() / 3) + 1

const LegalComplianceView: React.FC<LegalComplianceViewProps> = ({ initialHq, initialBranch, onBack }) => {
  const router = useRouter()
  const { user, userProfile } = useAuth()

  const hq0 = initialHq || null
  const branch0 = initialBranch || null
  const [viewLevel, setViewLevel] = useState<'hq' | 'branch' | 'project'>(
    branch0 ? 'project' : hq0 ? 'branch' : 'hq'
  )
  const [selectedHq, setSelectedHq] = useState<string | null>(hq0)
  const [selectedBranch, setSelectedBranch] = useState<string | null>(branch0)

  const [projects, setProjects] = useState<Project[]>([])
  const [checks, setChecks] = useState<CheckRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const loadedRef = useRef(false)

  const [year, setYear] = useState<number>(new Date().getFullYear())
  const [quarter, setQuarter] = useState<number>(currentQuarter())
  const quarterInitedRef = useRef(false)

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
        const projectsRes = await getProjectsByUserBranch(userProfile)
        if (!projectsRes.success || !projectsRes.projects) {
          setError('프로젝트 목록을 불러오지 못했습니다.')
          return
        }
        // 준공 프로젝트도 유지 — 과거 분기 점검표가 있으면 현황·엑셀에 포함해야 한다
        const scoped = projectsRes.projects
        const projectIds = new Set(scoped.map((p) => p.id))
        setProjects(scoped)

        const { data, error: qErr } = await (supabase as any)
          .from('legal_compliance_checks')
          .select('project_id, check_year, check_quarter, form_data, updated_at')
        if (qErr) {
          setError(
            String(qErr.message || '').includes('legal_compliance_checks')
              ? '법적이행 확인 테이블이 준비되지 않았습니다.'
              : '점검표 데이터를 불러오지 못했습니다.'
          )
          return
        }
        // 스코프 내 프로젝트의 점검표만 유지 + form_data 하이드레이트
        const rows: CheckRow[] = (data || [])
          .filter((r: { project_id: string }) => projectIds.has(r.project_id))
          .map((r: { project_id: string; check_year: number; check_quarter: number; form_data: unknown; updated_at: string }) => ({
            projectId: r.project_id,
            year: r.check_year,
            quarter: r.check_quarter,
            formData: hydrateFormData(r.form_data as Partial<LegalComplianceFormData>),
            updatedAt: r.updated_at,
          }))
        setChecks(rows)
      } catch {
        setError('데이터를 불러오는 중 오류가 발생했습니다.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user, userProfile])

  // 데이터가 있는 최신 분기로 기본 연도·분기 설정(최초 1회)
  useEffect(() => {
    if (quarterInitedRef.current || checks.length === 0) return
    quarterInitedRef.current = true
    const latest = checks.reduce(
      (best, c) => (c.year * 10 + c.quarter > best.year * 10 + best.quarter ? c : best),
      checks[0]
    )
    setYear(latest.year)
    setQuarter(latest.quarter)
  }, [checks])

  // 선택 분기의 점검표를 프로젝트별로 묶는다
  const checksByProject = useMemo(() => {
    const m = new Map<string, CheckRow[]>()
    for (const c of checks) {
      if (c.year !== year || c.quarter !== quarter) continue
      const arr = m.get(c.projectId)
      if (arr) arr.push(c)
      else m.set(c.projectId, [c])
    }
    return m
  }, [checks, year, quarter])

  // 준공 프로젝트는 숨기되, 선택 분기에 점검표가 있으면 포함(과거 기록 보존)
  const visibleProjects = useMemo(
    () => projects.filter((p) => !isCompleted(p) || checksByProject.has(p.id)),
    [projects, checksByProject]
  )

  // 프로젝트 1건의 통계
  const projectAgg = (projectId: string): Agg => {
    const rows = checksByProject.get(projectId) || []
    const a = emptyAgg()
    a.projectCount = 1
    a.submittedCount = rows.length > 0 ? 1 : 0
    a.checkCount = rows.length
    a.contractCount = rows.filter((r) => r.formData.isContractedWork === '여').length
    a.nonCompliance = rows.reduce((s, r) => s + countNonCompliance(r.formData), 0)
    return a
  }

  const addAgg = (t: Agg, s: Agg): void => {
    t.projectCount += s.projectCount
    t.submittedCount += s.submittedCount
    t.checkCount += s.checkCount
    t.contractCount += s.contractCount
    t.nonCompliance += s.nonCompliance
  }

  // 본부별 집계 (정렬 순서 유지)
  const hqStats = useMemo(() => {
    const m = new Map<string, Agg>()
    const ordered = [...visibleProjects].sort(
      (a, b) => hqIndex(a.managing_hq) - hqIndex(b.managing_hq) || a.managing_hq.localeCompare(b.managing_hq, 'ko')
    )
    for (const p of ordered) {
      const s = m.get(p.managing_hq) || emptyAgg()
      addAgg(s, projectAgg(p.id))
      m.set(p.managing_hq, s)
    }
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleProjects, checksByProject])

  // 선택 본부의 지사별 집계
  const branchStats = useMemo(() => {
    const m = new Map<string, Agg>()
    if (!selectedHq) return m
    const ordered = visibleProjects
      .filter((p) => p.managing_hq === selectedHq)
      .sort((a, b) => branchIndex(selectedHq, a.managing_branch) - branchIndex(selectedHq, b.managing_branch))
    for (const p of ordered) {
      const s = m.get(p.managing_branch) || emptyAgg()
      addAgg(s, projectAgg(p.id))
      m.set(p.managing_branch, s)
    }
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleProjects, selectedHq, checksByProject])

  // 선택 본부·지사의 프로젝트 목록
  const projectList = useMemo(() => {
    if (!selectedBranch) return []
    return visibleProjects
      .filter((p) => (!selectedHq || p.managing_hq === selectedHq) && p.managing_branch === selectedBranch)
      .sort((a, b) => {
        const ao = a.display_order ?? Number.MAX_SAFE_INTEGER
        const bo = b.display_order ?? Number.MAX_SAFE_INTEGER
        if (ao !== bo) return ao - bo
        return (a.project_name || '').localeCompare(b.project_name || '', 'ko')
      })
  }, [visibleProjects, selectedHq, selectedBranch])

  const sumStats = (m: Map<string, Agg>): Agg =>
    Array.from(m.values()).reduce((acc, s) => { addAgg(acc, s); return acc }, emptyAgg())

  const handleBack = () => {
    if (viewLevel === 'project') {
      setSelectedBranch(null)
      setViewLevel(selectedHq ? 'branch' : 'hq')
    } else if (viewLevel === 'branch') {
      setSelectedHq(null)
      setViewLevel('hq')
    } else {
      onBack()
    }
  }

  // 현재 범위·분기의 점검표(form_data)를 본부→지사→display_order 순으로 정렬해 엑셀로 내보낸다
  const handleExcel = async () => {
    const inScope = (p: Project): boolean => {
      if (viewLevel === 'project') return (!selectedHq || p.managing_hq === selectedHq) && p.managing_branch === selectedBranch
      if (viewLevel === 'branch') return p.managing_hq === selectedHq
      return true
    }
    const ordered = [...visibleProjects]
      .filter(inScope)
      .sort((a, b) =>
        hqIndex(a.managing_hq) - hqIndex(b.managing_hq) ||
        branchIndex(a.managing_hq, a.managing_branch) - branchIndex(b.managing_hq, b.managing_branch) ||
        (a.display_order ?? Number.MAX_SAFE_INTEGER) - (b.display_order ?? Number.MAX_SAFE_INTEGER) ||
        (a.project_name || '').localeCompare(b.project_name || '', 'ko')
      )
    const list: LegalComplianceFormData[] = []
    for (const p of ordered) {
      for (const c of checksByProject.get(p.id) || []) list.push(c.formData)
    }
    const scopeLabel =
      viewLevel === 'project' && selectedBranch ? selectedBranch
        : viewLevel === 'branch' && selectedHq ? hqDisplay(selectedHq)
          : '전체'
    try {
      await downloadLegalComplianceExcel(list, scopeLabel, year, quarter)
    } catch (e) {
      console.error(e)
      alert('엑셀 다운로드 중 오류가 발생했습니다.')
    }
  }

  // 연도 스텝퍼·분기 select + 엑셀 다운 버튼 (모든 레벨 공통)
  const controls = (
    <div className="flex items-center justify-end gap-2">
      <div className="flex items-center gap-1 rounded-md border border-gray-300 bg-white py-0.5 pl-2 pr-1">
        <span className="min-w-[44px] text-center text-sm tabular-nums">{year}년</span>
        <div className="flex flex-col">
          <button
            type="button"
            onClick={() => setYear((y) => y + 1)}
            aria-label="다음 연도"
            className="text-gray-400 hover:text-gray-700"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setYear((y) => y - 1)}
            aria-label="이전 연도"
            className="text-gray-400 hover:text-gray-700"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <select
        value={quarter}
        onChange={(e) => setQuarter(Number(e.target.value))}
        className="rounded-md border border-gray-300 px-2 py-1 text-sm bg-white"
      >
        {[1, 2, 3, 4].map((q) => (
          <option key={q} value={q}>{q}분기</option>
        ))}
      </select>
      <button
        onClick={handleExcel}
        title="엑셀 다운로드"
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-white text-blue-700 border border-blue-300 rounded-lg hover:bg-blue-50"
      >
        <Download className="h-4 w-4" />
        <span className="hidden sm:inline">엑셀 다운로드</span>
      </button>
    </div>
  )

  // 집계 셀들 (본부·지사 표 공용). subtotal이면 소계 스타일
  const statCells = (s: Agg, subtotal = false) => {
    const base = subtotal ? 'px-3 py-2 text-sm text-center text-blue-900 font-semibold' : 'px-3 py-3 text-sm text-center'
    const badge = (n: number, cls: string) =>
      n > 0 ? <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{n.toLocaleString()}건</span> : <span className="text-gray-400">-</span>
    return (
      <>
        <td className={base}>{s.projectCount > 0 ? `${s.projectCount.toLocaleString()}개` : '-'}</td>
        <td className={base}>{s.submittedCount > 0 ? `${s.submittedCount.toLocaleString()}개` : '-'}</td>
        <td className={base}>{subtotal ? (s.checkCount > 0 ? `${s.checkCount}건` : '-') : badge(s.checkCount, 'bg-blue-100 text-blue-800')}</td>
        <td className={base}>{subtotal ? (s.contractCount > 0 ? `${s.contractCount}건` : '-') : badge(s.contractCount, 'bg-amber-100 text-amber-800')}</td>
        <td className={base}>
          {s.nonCompliance > 0
            ? <span className={subtotal ? 'text-red-600' : 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800'}>{s.nonCompliance.toLocaleString()}건</span>
            : <span className="text-gray-400">-</span>}
        </td>
      </>
    )
  }

  const aggHeaderCols = (firstLabel: string) => (
    <tr>
      <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">{firstLabel}</th>
      <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">프로젝트 수</th>
      <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">점검표 제출<br/>프로젝트</th>
      <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">점검표 건수</th>
      <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">도급사업</th>
      <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">미이행 항목</th>
    </tr>
  )

  const title =
    viewLevel === 'project' ? `${selectedBranch ?? ''} - 프로젝트별 법적이행확인`
      : viewLevel === 'branch' ? `${selectedHq ? hqDisplay(selectedHq) : ''} - 지사별 법적이행확인`
        : '본부별 법적이행확인'

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="px-2 py-2 sm:px-6 sm:py-4 border-b border-gray-200">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button onClick={handleBack} className="inline-flex items-center gap-1 self-start text-sm text-gray-600 hover:text-gray-900 transition-colors">
            <ArrowLeft className="h-4 w-4" />
            {viewLevel === 'hq' ? '안전현황으로 돌아가기' : viewLevel === 'branch' ? '본부로 돌아가기' : '지사로 돌아가기'}
          </button>
          {controls}
        </div>
      </div>

      <div className="p-3 sm:p-6">
        <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
          <ScrollText className="h-5 w-5 text-blue-600" />
          {title}
        </h3>

        {loading ? (
          <div className="flex justify-center items-center py-12"><LoadingSpinner /></div>
        ) : error ? (
          <div className="py-10 text-center text-sm text-red-600">{error}</div>
        ) : (
          <div className="overflow-x-auto">
            {/* 본부 레벨 */}
            {viewLevel === 'hq' && (
              <table className="w-full min-w-[640px] divide-y divide-gray-200">
                <thead className="bg-gray-50">{aggHeaderCols('본부')}</thead>
                <tbody className="divide-y divide-gray-200">
                  <tr className="bg-blue-50/70 border-b-2 border-blue-200">
                    <td className="px-3 py-2 text-sm text-center text-blue-900 font-semibold">소계</td>
                    {statCells(sumStats(hqStats), true)}
                  </tr>
                  {Array.from(hqStats.entries()).map(([hq, s]) => (
                    <tr key={hq} onClick={() => { setSelectedHq(hq); setViewLevel('branch') }} className="hover:bg-blue-50/50 cursor-pointer transition-colors">
                      <td className="px-3 py-3 text-sm font-medium text-blue-600 hover:text-blue-800 text-center border-r border-gray-200">{hqDisplay(hq)}</td>
                      {statCells(s)}
                    </tr>
                  ))}
                  {hqStats.size === 0 && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">등록된 사업이 없습니다.</td></tr>
                  )}
                </tbody>
              </table>
            )}

            {/* 지사 레벨 */}
            {viewLevel === 'branch' && selectedHq && (
              <table className="w-full min-w-[640px] divide-y divide-gray-200">
                <thead className="bg-gray-50">{aggHeaderCols('지사')}</thead>
                <tbody className="divide-y divide-gray-200">
                  <tr className="bg-blue-50/70 border-b-2 border-blue-200">
                    <td className="px-3 py-2 text-sm text-center text-blue-900 font-semibold">소계</td>
                    {statCells(sumStats(branchStats), true)}
                  </tr>
                  {Array.from(branchStats.entries()).map(([branch, s]) => (
                    <tr key={branch} onClick={() => { setSelectedBranch(branch); setViewLevel('project') }} className="hover:bg-blue-50/50 cursor-pointer transition-colors">
                      <td className="px-3 py-3 text-sm font-medium text-blue-600 hover:text-blue-800 text-center border-r border-gray-200">{branch}</td>
                      {statCells(s)}
                    </tr>
                  ))}
                  {branchStats.size === 0 && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">해당 본부에 등록된 사업이 없습니다.</td></tr>
                  )}
                </tbody>
              </table>
            )}

            {/* 프로젝트 레벨 */}
            {viewLevel === 'project' && selectedBranch && (
              <table className="w-full min-w-[640px] divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">프로젝트명</th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">공종</th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">도급사업</th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">미이행 항목</th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">수정일</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {projectList.map((p) => {
                    const rows = checksByProject.get(p.id) || []
                    const disciplines = Array.from(new Set(rows.map((r) => r.formData.overview.discipline).filter(Boolean)))
                    const isContracted = rows.some((r) => r.formData.isContractedWork === '여')
                    const nonCompliance = rows.reduce((s, r) => s + countNonCompliance(r.formData), 0)
                    const updatedAt = rows.reduce<string>((m, r) => (r.updatedAt > m ? r.updatedAt : m), '')
                    const name = p.project_name || '미지정'
                    const mobileName = name.length > 3 ? `${name.slice(0, 3)}...` : name
                    return (
                      <tr
                        key={p.id}
                        onClick={() =>
                          router.push(
                            `/project/${p.id}/legal-compliance?returnUrl=${encodeURIComponent(
                              `/safe/branch/${encodeURIComponent(selectedBranch)}/legal-compliance`
                            )}`
                          )
                        }
                        className="hover:bg-blue-50/50 cursor-pointer transition-colors"
                      >
                        <td className="px-3 py-3 text-sm font-medium text-blue-600 hover:text-blue-800 text-center border-r border-gray-200">
                          <span className="sm:hidden">{mobileName}</span>
                          <span className="hidden sm:inline">{name}</span>
                        </td>
                        <td className="px-3 py-3 text-sm text-center text-gray-700 border-r border-gray-200">
                          {rows.length === 0
                            ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">미제출</span>
                            : disciplines.join(', ') || '-'}
                          {rows.length > 1 && <span className="ml-1 text-xs text-gray-400">({rows.length}건)</span>}
                        </td>
                        <td className="px-3 py-3 text-sm text-center border-r border-gray-200">
                          {isContracted
                            ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">여</span>
                            : <span className="text-gray-400">-</span>}
                        </td>
                        <td className="px-3 py-3 text-sm text-center border-r border-gray-200">
                          {nonCompliance > 0
                            ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">{nonCompliance}건</span>
                            : <span className="text-gray-400">-</span>}
                        </td>
                        <td className="px-3 py-3 text-sm text-center text-gray-500">
                          {updatedAt ? new Date(updatedAt).toLocaleDateString('ko-KR') : '-'}
                        </td>
                      </tr>
                    )
                  })}
                  {projectList.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">해당 지사에 등록된 사업이 없습니다.</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default LegalComplianceView
