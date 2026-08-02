'use client'
// 안전현황 '수시 위험성평가' 카드 뷰 — 본부→지사→프로젝트 3단 드릴다운으로 월별 작성현황을 집계한다
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ShieldAlert, ChevronUp, ChevronDown } from 'lucide-react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { BRANCH_OPTIONS } from '@/lib/constants'
import { getProjectsByUserBranch, type Project } from '@/lib/projects'

interface RiskAssessmentStatusViewProps {
  initialHq: string | null
  initialBranch: string | null
  onBack: () => void
}

interface AssessmentRow {
  projectId: string
  title: string
  createdAt: string
  updatedAt: string
}

interface Agg {
  projectCount: number
  writtenProjectCount: number
  assessmentCount: number
  byMonth: number[]
}

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

const emptyByMonth = (): number[] => MONTHS.map(() => 0)

const emptyAgg = (): Agg => ({
  projectCount: 0,
  writtenProjectCount: 0,
  assessmentCount: 0,
  byMonth: emptyByMonth(),
})

const isCompleted = (p: Project): boolean => {
  const ia = p.is_active as unknown
  if (ia === undefined || ia === null) return false
  if (typeof ia === 'boolean') return !ia
  if (typeof ia === 'object') return (ia as { completed?: boolean }).completed === true
  return false
}

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

const RiskAssessmentStatusView: React.FC<RiskAssessmentStatusViewProps> = ({
  initialHq,
  initialBranch,
  onBack,
}) => {
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
  const [assessments, setAssessments] = useState<AssessmentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const loadedRef = useRef(false)

  const [year, setYear] = useState<number>(new Date().getFullYear())
  const yearInitedRef = useRef(false)

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
        const scoped = projectsRes.projects
        const projectIds = new Set(scoped.map((p) => p.id))
        setProjects(scoped)

        const { data, error: qErr } = await (supabase as any)
          .from('risk_assessments')
          .select('project_id, title, created_at, updated_at')
        if (qErr) {
          setError(
            String(qErr.message || '').includes('risk_assessments')
              ? '수시 위험성평가 테이블이 준비되지 않았습니다.'
              : '수시 위험성평가 데이터를 불러오지 못했습니다.'
          )
          return
        }

        const rows: AssessmentRow[] = (data || [])
          .filter((r: { project_id: string }) => projectIds.has(r.project_id))
          .map(
            (r: {
              project_id: string
              title: string
              created_at: string
              updated_at: string
            }) => ({
              projectId: r.project_id,
              title: r.title || '',
              createdAt: r.created_at,
              updatedAt: r.updated_at,
            })
          )
        setAssessments(rows)
      } catch {
        setError('데이터를 불러오는 중 오류가 발생했습니다.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user, userProfile])

  // 데이터가 있는 최신 연도로 기본 연도 설정(최초 1회)
  useEffect(() => {
    if (yearInitedRef.current || assessments.length === 0) return
    yearInitedRef.current = true
    const latestYear = assessments.reduce((best, a) => {
      const y = new Date(a.createdAt).getFullYear()
      return Number.isFinite(y) && y > best ? y : best
    }, 0)
    if (latestYear > 0) setYear(latestYear)
  }, [assessments])

  // 선택 연도 평가서를 프로젝트별로 묶는다 (월 배정은 로컬 시간 기준 created_at)
  const assessmentsByProject = useMemo(() => {
    const m = new Map<string, AssessmentRow[]>()
    for (const a of assessments) {
      const y = new Date(a.createdAt).getFullYear()
      if (y !== year) continue
      const arr = m.get(a.projectId)
      if (arr) arr.push(a)
      else m.set(a.projectId, [a])
    }
    return m
  }, [assessments, year])

  // 준공 프로젝트는 대상에서 제외한다 (작성 이력이 있어도 집계에 넣지 않는다)
  const visibleProjects = useMemo(
    () => projects.filter((p) => !isCompleted(p)),
    [projects]
  )

  const projectAgg = (projectId: string): Agg => {
    const rows = assessmentsByProject.get(projectId) || []
    const a = emptyAgg()
    a.projectCount = 1
    a.writtenProjectCount = rows.length > 0 ? 1 : 0
    a.assessmentCount = rows.length
    for (const r of rows) {
      const monthIdx = new Date(r.createdAt).getMonth()
      if (monthIdx >= 0 && monthIdx < 12) a.byMonth[monthIdx] += 1
    }
    return a
  }

  const addAgg = (t: Agg, s: Agg): void => {
    t.projectCount += s.projectCount
    t.writtenProjectCount += s.writtenProjectCount
    t.assessmentCount += s.assessmentCount
    for (let i = 0; i < 12; i += 1) {
      t.byMonth[i] += s.byMonth[i]
    }
  }

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
  }, [visibleProjects, assessmentsByProject])

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
  }, [visibleProjects, selectedHq, assessmentsByProject])

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

  // 프로젝트 목록 소계 (작성 건수·월별 건수)
  const projectSubtotal = useMemo(() => {
    const total = emptyAgg()
    for (const p of projectList) {
      addAgg(total, projectAgg(p.id))
    }
    return total
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectList, assessmentsByProject])

  const sumStats = (m: Map<string, Agg>): Agg =>
    Array.from(m.values()).reduce((acc, s) => {
      addAgg(acc, s)
      return acc
    }, emptyAgg())

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
    </div>
  )

  const badge = (n: number, cls: string) =>
    n > 0 ? (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
        {n.toLocaleString()}건
      </span>
    ) : (
      <span className="text-gray-400">-</span>
    )

  // 본부·지사 표 공용 집계 셀 (대상/작성 프로젝트 · 합계 · 1~12월 = 15칸)
  const statCells = (s: Agg, subtotal = false) => {
    const base = subtotal
      ? 'px-3 py-2 text-sm text-center text-rose-900 font-semibold'
      : 'px-3 py-3 text-sm text-center'
    const monthBase = subtotal
      ? 'px-2 py-2 text-sm text-center text-rose-900 font-semibold'
      : 'px-2 py-3 text-sm text-center'
    return (
      <>
        <td className={base}>{s.projectCount > 0 ? `${s.projectCount.toLocaleString()}개` : '-'}</td>
        <td className={base}>
          {s.writtenProjectCount > 0 ? `${s.writtenProjectCount.toLocaleString()}개` : '-'}
        </td>
        <td className={base}>
          {subtotal
            ? s.assessmentCount > 0
              ? `${s.assessmentCount}건`
              : '-'
            : badge(s.assessmentCount, 'bg-rose-100 text-rose-800')}
        </td>
        {MONTHS.map((m, i) => (
          <td key={m} className={monthBase}>
            {s.byMonth[i] > 0 ? (
              s.byMonth[i].toLocaleString()
            ) : (
              <span className="text-gray-400">-</span>
            )}
          </td>
        ))}
      </>
    )
  }

  const aggHeaderCols = (firstLabel: string) => (
    <tr>
      <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
        {firstLabel}
      </th>
      <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
        대상
        <br />
        프로젝트
      </th>
      <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
        작성
        <br />
        프로젝트
      </th>
      <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
        합계
      </th>
      {MONTHS.map((m) => (
        <th
          key={m}
          className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 last:border-r-0"
        >
          {m}
        </th>
      ))}
    </tr>
  )

  const title =
    viewLevel === 'project'
      ? `${selectedBranch ?? ''} - 프로젝트별 수시 위험성평가`
      : viewLevel === 'branch'
        ? `${selectedHq ? hqDisplay(selectedHq) : ''} - 지사별 수시 위험성평가`
        : '본부별 수시 위험성평가'

  const returnUrlForBranch = selectedBranch
    ? `/safe/branch/${encodeURIComponent(selectedBranch)}/risk-assessment`
    : '/safe/risk-assessment'

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="px-2 py-2 sm:px-6 sm:py-4 border-b border-gray-200">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button
            onClick={handleBack}
            className="inline-flex items-center gap-1 self-start text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {viewLevel === 'hq'
              ? '안전현황으로 돌아가기'
              : viewLevel === 'branch'
                ? '본부로 돌아가기'
                : '지사로 돌아가기'}
          </button>
          {controls}
        </div>
      </div>

      <div className="p-3 sm:p-6">
        <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
          <ShieldAlert className="h-5 w-5 text-rose-600" />
          {title}
        </h3>

        {loading ? (
          <div className="flex justify-center items-center py-12">
            <LoadingSpinner />
          </div>
        ) : error ? (
          <div className="py-10 text-center text-sm text-red-600">{error}</div>
        ) : (
          <div className="overflow-x-auto">
            {viewLevel === 'hq' && (
              <table className="w-full min-w-[1100px] divide-y divide-gray-200">
                <thead className="bg-gray-50">{aggHeaderCols('본부')}</thead>
                <tbody className="divide-y divide-gray-200">
                  <tr className="bg-rose-50/70 border-b-2 border-rose-200">
                    <td className="px-3 py-2 text-sm text-center text-rose-900 font-semibold">소계</td>
                    {statCells(sumStats(hqStats), true)}
                  </tr>
                  {Array.from(hqStats.entries()).map(([hq, s]) => (
                    <tr
                      key={hq}
                      onClick={() => {
                        setSelectedHq(hq)
                        setViewLevel('branch')
                      }}
                      className="hover:bg-rose-50/50 cursor-pointer transition-colors"
                    >
                      <td className="px-3 py-3 text-sm font-medium text-rose-700 hover:text-rose-900 text-center border-r border-gray-200">
                        {hqDisplay(hq)}
                      </td>
                      {statCells(s)}
                    </tr>
                  ))}
                  {hqStats.size === 0 && (
                    <tr>
                      <td colSpan={16} className="px-4 py-8 text-center text-sm text-gray-500">
                        등록된 사업이 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {viewLevel === 'branch' && selectedHq && (
              <table className="w-full min-w-[1100px] divide-y divide-gray-200">
                <thead className="bg-gray-50">{aggHeaderCols('지사')}</thead>
                <tbody className="divide-y divide-gray-200">
                  <tr className="bg-rose-50/70 border-b-2 border-rose-200">
                    <td className="px-3 py-2 text-sm text-center text-rose-900 font-semibold">소계</td>
                    {statCells(sumStats(branchStats), true)}
                  </tr>
                  {Array.from(branchStats.entries()).map(([branch, s]) => (
                    <tr
                      key={branch}
                      onClick={() => {
                        setSelectedBranch(branch)
                        setViewLevel('project')
                      }}
                      className="hover:bg-rose-50/50 cursor-pointer transition-colors"
                    >
                      <td className="px-3 py-3 text-sm font-medium text-rose-700 hover:text-rose-900 text-center border-r border-gray-200">
                        {branch}
                      </td>
                      {statCells(s)}
                    </tr>
                  ))}
                  {branchStats.size === 0 && (
                    <tr>
                      <td colSpan={16} className="px-4 py-8 text-center text-sm text-gray-500">
                        해당 본부에 등록된 사업이 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {viewLevel === 'project' && selectedBranch && (
              <table className="w-full min-w-[1100px] divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                      프로젝트명
                    </th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                      합계
                    </th>
                    {MONTHS.map((m) => (
                      <th
                        key={m}
                        className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200"
                      >
                        {m}
                      </th>
                    ))}
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      최근 작성일
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {projectList.length > 0 && (
                    <tr className="bg-rose-50/70 border-b-2 border-rose-200">
                      <td className="px-3 py-2 text-sm text-center text-rose-900 font-semibold border-r border-gray-200">
                        소계
                      </td>
                      <td className="px-3 py-2 text-sm text-center text-rose-900 font-semibold border-r border-gray-200">
                        {projectSubtotal.assessmentCount > 0
                          ? `${projectSubtotal.assessmentCount}건`
                          : '-'}
                      </td>
                      {MONTHS.map((m, i) => (
                        <td
                          key={m}
                          className="px-2 py-2 text-sm text-center text-rose-900 font-semibold border-r border-gray-200"
                        >
                          {projectSubtotal.byMonth[i] > 0
                            ? projectSubtotal.byMonth[i].toLocaleString()
                            : '-'}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-sm text-center text-rose-900 font-semibold">-</td>
                    </tr>
                  )}
                  {projectList.map((p) => {
                    const rows = assessmentsByProject.get(p.id) || []
                    const agg = projectAgg(p.id)
                    const latest = rows.reduce<string>(
                      (m, r) => (r.updatedAt > m ? r.updatedAt : m),
                      ''
                    )
                    const name = p.project_name || '미지정'
                    const mobileName = name.length > 3 ? `${name.slice(0, 3)}...` : name
                    return (
                      <tr
                        key={p.id}
                        onClick={() =>
                          router.push(
                            `/project/${p.id}/risk-assessment?returnUrl=${encodeURIComponent(returnUrlForBranch)}`
                          )
                        }
                        className="hover:bg-rose-50/50 cursor-pointer transition-colors"
                      >
                        <td className="px-3 py-3 text-sm font-medium text-rose-700 hover:text-rose-900 text-center border-r border-gray-200">
                          <span className="sm:hidden">{mobileName}</span>
                          <span className="hidden sm:inline">{name}</span>
                        </td>
                        <td className="px-3 py-3 text-sm text-center border-r border-gray-200">
                          {rows.length > 0 ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-800">
                              {rows.length}건
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                              미작성
                            </span>
                          )}
                        </td>
                        {MONTHS.map((m, i) => (
                          <td key={m} className="px-2 py-3 text-sm text-center border-r border-gray-200">
                            {agg.byMonth[i] > 0 ? (
                              agg.byMonth[i].toLocaleString()
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                        ))}
                        <td className="px-3 py-3 text-sm text-center text-gray-500">
                          {latest ? new Date(latest).toLocaleDateString('ko-KR') : '-'}
                        </td>
                      </tr>
                    )
                  })}
                  {projectList.length === 0 && (
                    <tr>
                      <td colSpan={15} className="px-4 py-8 text-center text-sm text-gray-500">
                        해당 지사에 등록된 사업이 없습니다.
                      </td>
                    </tr>
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

export default RiskAssessmentStatusView
