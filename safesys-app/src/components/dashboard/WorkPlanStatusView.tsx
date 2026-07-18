'use client'
// 안전현황 '작업계획서' 카드 뷰 — 본부→지사→프로젝트 3단 드릴다운으로 작성현황을 집계한다
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ClipboardList, ChevronUp, ChevronDown } from 'lucide-react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { BRANCH_OPTIONS } from '@/lib/constants'
import { getProjectsByUserBranch, type Project } from '@/lib/projects'
import { PLAN_TYPE_OPTIONS } from '@/lib/work-plan/constants'
import type { PlanType } from '@/lib/work-plan/types'

interface WorkPlanStatusViewProps {
  initialHq: string | null
  initialBranch: string | null
  onBack: () => void
}

interface PlanRow {
  projectId: string
  planTypes: PlanType[]
  title: string
  createdAt: string
  updatedAt: string
}

interface Agg {
  projectCount: number
  writtenProjectCount: number
  planCount: number
  byType: Record<PlanType, number>
}

const PLAN_TYPES: PlanType[] = ['loading', 'construction', 'electric', 'heavy', 'excavation']

const emptyByType = (): Record<PlanType, number> => ({
  loading: 0,
  construction: 0,
  electric: 0,
  heavy: 0,
  excavation: 0,
})

const emptyAgg = (): Agg => ({
  projectCount: 0,
  writtenProjectCount: 0,
  planCount: 0,
  byType: emptyByType(),
})

const shortTitle = (type: PlanType): string =>
  PLAN_TYPE_OPTIONS.find((o) => o.value === type)?.shortTitle ?? type

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

const WorkPlanStatusView: React.FC<WorkPlanStatusViewProps> = ({
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
  const [plans, setPlans] = useState<PlanRow[]>([])
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
          .from('work_plans')
          .select('project_id, plan_types, title, created_at, updated_at')
        if (qErr) {
          setError(
            String(qErr.message || '').includes('work_plans')
              ? '작업계획서 테이블이 준비되지 않았습니다.'
              : '작업계획서 데이터를 불러오지 못했습니다.'
          )
          return
        }

        const rows: PlanRow[] = (data || [])
          .filter((r: { project_id: string }) => projectIds.has(r.project_id))
          .map(
            (r: {
              project_id: string
              plan_types: string[] | null
              title: string
              created_at: string
              updated_at: string
            }) => ({
              projectId: r.project_id,
              planTypes: (Array.isArray(r.plan_types) ? r.plan_types : []).filter(
                (t): t is PlanType => PLAN_TYPES.includes(t as PlanType)
              ),
              title: r.title || '',
              createdAt: r.created_at,
              updatedAt: r.updated_at,
            })
          )
        setPlans(rows)
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
    if (yearInitedRef.current || plans.length === 0) return
    yearInitedRef.current = true
    const latestYear = plans.reduce((best, p) => {
      const y = new Date(p.createdAt).getFullYear()
      return Number.isFinite(y) && y > best ? y : best
    }, 0)
    if (latestYear > 0) setYear(latestYear)
  }, [plans])

  // 선택 연도 작업계획서를 프로젝트별로 묶는다
  const plansByProject = useMemo(() => {
    const m = new Map<string, PlanRow[]>()
    for (const p of plans) {
      const y = new Date(p.createdAt).getFullYear()
      if (y !== year) continue
      const arr = m.get(p.projectId)
      if (arr) arr.push(p)
      else m.set(p.projectId, [p])
    }
    return m
  }, [plans, year])

  // 준공 프로젝트는 숨기되, 선택 연도에 작성 건이 있으면 포함
  const visibleProjects = useMemo(
    () => projects.filter((p) => !isCompleted(p) || plansByProject.has(p.id)),
    [projects, plansByProject]
  )

  const projectAgg = (projectId: string): Agg => {
    const rows = plansByProject.get(projectId) || []
    const a = emptyAgg()
    a.projectCount = 1
    a.writtenProjectCount = rows.length > 0 ? 1 : 0
    a.planCount = rows.length
    for (const r of rows) {
      for (const t of r.planTypes) {
        a.byType[t] = (a.byType[t] || 0) + 1
      }
    }
    return a
  }

  const addAgg = (t: Agg, s: Agg): void => {
    t.projectCount += s.projectCount
    t.writtenProjectCount += s.writtenProjectCount
    t.planCount += s.planCount
    for (const type of PLAN_TYPES) {
      t.byType[type] += s.byType[type]
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
  }, [visibleProjects, plansByProject])

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
  }, [visibleProjects, selectedHq, plansByProject])

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

  // 프로젝트 목록 소계 (작성 건수·유형별 건수)
  const projectSubtotal = useMemo(() => {
    const total = emptyAgg()
    for (const p of projectList) {
      addAgg(total, projectAgg(p.id))
    }
    return total
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectList, plansByProject])

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

  const unwritten = (s: Agg) => Math.max(0, s.projectCount - s.writtenProjectCount)

  // 본부·지사 표 공용 집계 셀
  const statCells = (s: Agg, subtotal = false) => {
    const base = subtotal
      ? 'px-3 py-2 text-sm text-center text-teal-900 font-semibold'
      : 'px-3 py-3 text-sm text-center'
    const uw = unwritten(s)
    return (
      <>
        <td className={base}>{s.projectCount > 0 ? `${s.projectCount.toLocaleString()}개` : '-'}</td>
        <td className={base}>
          {s.writtenProjectCount > 0 ? `${s.writtenProjectCount.toLocaleString()}개` : '-'}
        </td>
        <td className={base}>
          {uw > 0 ? (
            <span
              className={
                subtotal
                  ? 'text-amber-700'
                  : 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800'
              }
            >
              {uw.toLocaleString()}개
            </span>
          ) : (
            <span className="text-gray-400">-</span>
          )}
        </td>
        <td className={base}>
          {subtotal
            ? s.planCount > 0
              ? `${s.planCount}건`
              : '-'
            : badge(s.planCount, 'bg-teal-100 text-teal-800')}
        </td>
        {PLAN_TYPES.map((type) => (
          <td key={type} className={base}>
            {s.byType[type] > 0 ? s.byType[type].toLocaleString() : '-'}
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
        프로젝트 수
      </th>
      <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
        작성
        <br />
        프로젝트
      </th>
      <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
        미작성
        <br />
        프로젝트
      </th>
      <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
        작성 건수
      </th>
      {PLAN_TYPES.map((type) => (
        <th
          key={type}
          className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 last:border-r-0"
        >
          {shortTitle(type)}
        </th>
      ))}
    </tr>
  )

  const title =
    viewLevel === 'project'
      ? `${selectedBranch ?? ''} - 프로젝트별 작업계획서`
      : viewLevel === 'branch'
        ? `${selectedHq ? hqDisplay(selectedHq) : ''} - 지사별 작업계획서`
        : '본부별 작업계획서'

  const returnUrlForBranch = selectedBranch
    ? `/safe/branch/${encodeURIComponent(selectedBranch)}/work-plan`
    : '/safe/work-plan'

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
          <ClipboardList className="h-5 w-5 text-teal-600" />
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
              <table className="w-full min-w-[800px] divide-y divide-gray-200">
                <thead className="bg-gray-50">{aggHeaderCols('본부')}</thead>
                <tbody className="divide-y divide-gray-200">
                  <tr className="bg-teal-50/70 border-b-2 border-teal-200">
                    <td className="px-3 py-2 text-sm text-center text-teal-900 font-semibold">소계</td>
                    {statCells(sumStats(hqStats), true)}
                  </tr>
                  {Array.from(hqStats.entries()).map(([hq, s]) => (
                    <tr
                      key={hq}
                      onClick={() => {
                        setSelectedHq(hq)
                        setViewLevel('branch')
                      }}
                      className="hover:bg-teal-50/50 cursor-pointer transition-colors"
                    >
                      <td className="px-3 py-3 text-sm font-medium text-teal-700 hover:text-teal-900 text-center border-r border-gray-200">
                        {hqDisplay(hq)}
                      </td>
                      {statCells(s)}
                    </tr>
                  ))}
                  {hqStats.size === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-500">
                        등록된 사업이 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {viewLevel === 'branch' && selectedHq && (
              <table className="w-full min-w-[800px] divide-y divide-gray-200">
                <thead className="bg-gray-50">{aggHeaderCols('지사')}</thead>
                <tbody className="divide-y divide-gray-200">
                  <tr className="bg-teal-50/70 border-b-2 border-teal-200">
                    <td className="px-3 py-2 text-sm text-center text-teal-900 font-semibold">소계</td>
                    {statCells(sumStats(branchStats), true)}
                  </tr>
                  {Array.from(branchStats.entries()).map(([branch, s]) => (
                    <tr
                      key={branch}
                      onClick={() => {
                        setSelectedBranch(branch)
                        setViewLevel('project')
                      }}
                      className="hover:bg-teal-50/50 cursor-pointer transition-colors"
                    >
                      <td className="px-3 py-3 text-sm font-medium text-teal-700 hover:text-teal-900 text-center border-r border-gray-200">
                        {branch}
                      </td>
                      {statCells(s)}
                    </tr>
                  ))}
                  {branchStats.size === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-500">
                        해당 본부에 등록된 사업이 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {viewLevel === 'project' && selectedBranch && (
              <table className="w-full min-w-[800px] divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                      프로젝트명
                    </th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                      작성 건수
                    </th>
                    {PLAN_TYPES.map((type) => (
                      <th
                        key={type}
                        className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200"
                      >
                        {shortTitle(type)}
                      </th>
                    ))}
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      최근 작성일
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {projectList.length > 0 && (
                    <tr className="bg-teal-50/70 border-b-2 border-teal-200">
                      <td className="px-3 py-2 text-sm text-center text-teal-900 font-semibold border-r border-gray-200">
                        소계
                      </td>
                      <td className="px-3 py-2 text-sm text-center text-teal-900 font-semibold border-r border-gray-200">
                        {projectSubtotal.planCount > 0 ? `${projectSubtotal.planCount}건` : '-'}
                      </td>
                      {PLAN_TYPES.map((type) => (
                        <td
                          key={type}
                          className="px-3 py-2 text-sm text-center text-teal-900 font-semibold border-r border-gray-200"
                        >
                          {projectSubtotal.byType[type] > 0
                            ? projectSubtotal.byType[type].toLocaleString()
                            : '-'}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-sm text-center text-teal-900 font-semibold">-</td>
                    </tr>
                  )}
                  {projectList.map((p) => {
                    const rows = plansByProject.get(p.id) || []
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
                            `/project/${p.id}/work-plan?returnUrl=${encodeURIComponent(returnUrlForBranch)}`
                          )
                        }
                        className="hover:bg-teal-50/50 cursor-pointer transition-colors"
                      >
                        <td className="px-3 py-3 text-sm font-medium text-teal-700 hover:text-teal-900 text-center border-r border-gray-200">
                          <span className="sm:hidden">{mobileName}</span>
                          <span className="hidden sm:inline">{name}</span>
                        </td>
                        <td className="px-3 py-3 text-sm text-center border-r border-gray-200">
                          {rows.length > 0 ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-800">
                              {rows.length}건
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                              미작성
                            </span>
                          )}
                        </td>
                        {PLAN_TYPES.map((type) => (
                          <td key={type} className="px-3 py-3 text-sm text-center border-r border-gray-200">
                            {agg.byType[type] > 0 ? agg.byType[type].toLocaleString() : '-'}
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
                      <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-500">
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

export default WorkPlanStatusView
