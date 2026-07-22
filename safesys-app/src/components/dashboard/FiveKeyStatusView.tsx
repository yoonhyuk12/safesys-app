'use client'
// 관할 프로젝트별 5대 핵심 안전수칙 이행 등급을 본부→지사→프로젝트 3단으로 보는 현황 뷰

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useAuth } from '@/contexts/AuthContext'
import { BRANCH_OPTIONS, HEADQUARTERS_OPTIONS } from '@/lib/constants'
import { getProjectsByUserBranch, type Project } from '@/lib/projects'
import { supabase } from '@/lib/supabase'

interface FiveKeyStatusViewProps {
  initialHq: string | null
  initialBranch: string | null
  onBack: () => void
}

type FiveKeyGrade = '1' | '2' | '3' | '4' | '5' | 'N/A'
type CategoryGrade = FiveKeyGrade | null
type ViewLevel = 'hq' | 'branch' | 'project'

interface FiveKeyItem {
  category?: unknown
  title?: unknown
  grade?: unknown
}

interface HeadquartersInspectionRow {
  id: string
  project_id: string
  inspection_date: string | null
  five_key_items: unknown
}

interface ProjectStatusRow {
  project: Project
  inspection: HeadquartersInspectionRow | null
  categoryGrades: CategoryGrade[]
}

interface LevelAgg {
  projectCount: number
  inspectedCount: number
  concernCount: number
}

const CATEGORY_COLUMNS = [
  { prefix: '①', label: '①TBM' },
  { prefix: '②', label: '②신규근로자' },
  { prefix: '③', label: '③건설기계' },
  { prefix: '④', label: '④보호구' },
  { prefix: '⑤', label: '⑤표지' },
] as const

const GRADE_LABELS: Record<FiveKeyGrade, string> = {
  '1': '매우우수',
  '2': '우수',
  '3': '보통',
  '4': '미흡',
  '5': '불이행',
  'N/A': '해당없음',
}

const GRADE_BADGE_CLASSES: Record<FiveKeyGrade, string> = {
  '1': 'bg-blue-100 text-blue-800 ring-blue-200',
  '2': 'bg-green-100 text-green-800 ring-green-200',
  '3': 'bg-gray-100 text-gray-700 ring-gray-200',
  '4': 'bg-amber-100 text-amber-800 ring-amber-200',
  '5': 'bg-red-100 text-red-800 ring-red-200',
  'N/A': 'bg-gray-50 text-gray-500 ring-gray-200',
}

const CURRENT_YEAR = new Date().getFullYear()
const YEAR_OPTIONS = Array.from(
  { length: Math.max(CURRENT_YEAR - 2024 + 1, 1) },
  (_, index) => 2024 + index
)

const emptyAgg = (): LevelAgg => ({
  projectCount: 0,
  inspectedCount: 0,
  concernCount: 0,
})

const hqDisplay = (hq: string): string =>
  hq !== '본사' && hq !== '기타' && !hq.endsWith('본부') ? `${hq}본부` : hq

const getCurrentQuarter = (): string => {
  const today = new Date()
  return `${today.getFullYear()}Q${Math.floor(today.getMonth() / 3) + 1}`
}

const getQuarterRange = (quarterKey: string): { start: number; end: number } => {
  const [yearText, quarterText] = quarterKey.split('Q')
  const year = Number(yearText)
  const quarter = Number(quarterText)
  const startMonth = (quarter - 1) * 3
  return {
    start: new Date(year, startMonth, 1).getTime(),
    end: new Date(year, startMonth + 3, 0, 23, 59, 59, 999).getTime(),
  }
}

const isCompleted = (project: Project): boolean => {
  const isActive = project.is_active as unknown
  if (isActive === undefined || isActive === null) return false
  if (typeof isActive === 'boolean') return !isActive
  if (typeof isActive === 'object') {
    return (isActive as { completed?: boolean }).completed === true
  }
  return false
}

const isFiveKeyGrade = (value: unknown): value is FiveKeyGrade =>
  value === '1' ||
  value === '2' ||
  value === '3' ||
  value === '4' ||
  value === '5' ||
  value === 'N/A'

const readFiveKeyItems = (value: unknown): FiveKeyItem[] => {
  if (!Array.isArray(value)) return []
  return value.filter(
    (item): item is FiveKeyItem => typeof item === 'object' && item !== null
  )
}

const hasEnteredGrade = (inspection: HeadquartersInspectionRow): boolean =>
  readFiveKeyItems(inspection.five_key_items).some((item) => isFiveKeyGrade(item.grade))

const isCountItem = (item: FiveKeyItem): boolean =>
  typeof item.title === 'string' && item.title.trim().endsWith('횟수')

const getCategoryGrade = (items: FiveKeyItem[], categoryPrefix: string): CategoryGrade => {
  const grades = items
    .filter(
      (item) =>
        typeof item.category === 'string' &&
        item.category.trim().startsWith(categoryPrefix) &&
        !isCountItem(item)
    )
    .map((item) => item.grade)
    .filter(isFiveKeyGrade)

  const numericGrades = grades.filter((grade): grade is Exclude<FiveKeyGrade, 'N/A'> => grade !== 'N/A')
  if (numericGrades.length > 0) {
    return numericGrades.reduce((worst, grade) =>
      Number(grade) > Number(worst) ? grade : worst
    )
  }
  return grades.length > 0 ? 'N/A' : null
}

const getInspectionTimestamp = (inspectionDate: string | null): number => {
  if (!inspectionDate) return Number.NEGATIVE_INFINITY
  const timestamp = Date.parse(inspectionDate)
  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp
}

const formatInspectionDate = (inspectionDate: string | null): string =>
  inspectionDate ? inspectionDate.slice(0, 10).replace(/-/g, '.') : '-'

const findHqByBranch = (branch: string | null): string => {
  if (!branch) return ''
  return HEADQUARTERS_OPTIONS.find((hq) => BRANCH_OPTIONS[hq]?.includes(branch)) ?? ''
}

const isConcernRow = (categoryGrades: CategoryGrade[]): boolean =>
  categoryGrades.some((grade) => grade === '4' || grade === '5')

const GradeBadge = ({ grade }: { grade: CategoryGrade }) => {
  if (!grade) {
    return <span className="text-sm text-gray-400">-</span>
  }
  return (
    <span
      className={`inline-flex min-w-[58px] justify-center rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset ${GRADE_BADGE_CLASSES[grade]}`}
    >
      {GRADE_LABELS[grade]}
    </span>
  )
}

const FiveKeyStatusView = ({ initialHq, initialBranch, onBack }: FiveKeyStatusViewProps) => {
  const router = useRouter()
  const { userProfile } = useAuth()

  const hq0 = initialHq || findHqByBranch(initialBranch) || null
  const branch0 = initialBranch || null
  const [viewLevel, setViewLevel] = useState<ViewLevel>(
    branch0 ? 'project' : hq0 ? 'branch' : 'hq'
  )
  const [selectedHq, setSelectedHq] = useState<string | null>(hq0)
  const [selectedBranch, setSelectedBranch] = useState<string | null>(branch0)
  const [selectedQuarter, setSelectedQuarter] = useState(getCurrentQuarter)
  const [projects, setProjects] = useState<Project[]>([])
  const [inspections, setInspections] = useState<HeadquartersInspectionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const loadedProfileIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!userProfile || loadedProfileIdRef.current === userProfile.id) return
    loadedProfileIdRef.current = userProfile.id

    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const projectResult = await getProjectsByUserBranch(userProfile)
        if (!projectResult.success || !projectResult.projects) {
          setError('관할 프로젝트 목록을 불러오지 못했습니다.')
          return
        }

        const activeProjects = projectResult.projects.filter((project) => !isCompleted(project))
        setProjects(activeProjects)

        const projectIds = activeProjects.map((project) => project.id)
        if (projectIds.length === 0) {
          setInspections([])
          return
        }

        const { data, error: inspectionError } = await supabase
          .from('headquarters_inspections')
          .select('id, project_id, inspection_date, five_key_items')
          .in('project_id', projectIds)

        if (inspectionError) {
          setError('5대 핵심이행사항 점검 데이터를 불러오지 못했습니다.')
          return
        }

        setInspections((data || []) as HeadquartersInspectionRow[])
      } catch {
        setError('데이터를 불러오는 중 오류가 발생했습니다.')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [userProfile])

  const representativeInspections = useMemo(() => {
    const latestByProject = new Map<string, HeadquartersInspectionRow>()
    const { start, end } = getQuarterRange(selectedQuarter)
    for (const inspection of inspections) {
      const inspectionTimestamp = getInspectionTimestamp(inspection.inspection_date)
      if (inspectionTimestamp < start || inspectionTimestamp > end) continue
      if (!hasEnteredGrade(inspection)) continue
      const current = latestByProject.get(inspection.project_id)
      if (
        !current ||
        inspectionTimestamp > getInspectionTimestamp(current.inspection_date)
      ) {
        latestByProject.set(inspection.project_id, inspection)
      }
    }
    return latestByProject
  }, [inspections, selectedQuarter])

  const projectRows = useMemo<ProjectStatusRow[]>(
    () =>
      projects.map((project) => {
        const inspection = representativeInspections.get(project.id) || null
        const items = inspection ? readFiveKeyItems(inspection.five_key_items) : []
        return {
          project,
          inspection,
          categoryGrades: CATEGORY_COLUMNS.map(({ prefix }) =>
            getCategoryGrade(items, prefix)
          ),
        }
      }),
    [projects, representativeInspections]
  )

  const [selectedYear, selectedQuarterNumber] = selectedQuarter.split('Q').map(Number)

  const aggregateRows = (rows: ProjectStatusRow[]): LevelAgg => {
    const agg = emptyAgg()
    agg.projectCount = rows.length
    agg.inspectedCount = rows.filter(({ inspection }) => inspection !== null).length
    agg.concernCount = rows.filter(({ categoryGrades }) => isConcernRow(categoryGrades)).length
    return agg
  }

  const hqStats = useMemo(() => {
    const byHq = new Map<string, ProjectStatusRow[]>()
    for (const row of projectRows) {
      const hq = row.project.managing_hq || ''
      if (!hq) continue
      const list = byHq.get(hq)
      if (list) list.push(row)
      else byHq.set(hq, [row])
    }

    const hqOrder = HEADQUARTERS_OPTIONS as readonly string[]
    const ordered: string[] = [
      ...hqOrder.filter((hq) => byHq.has(hq)),
      ...Array.from(byHq.keys()).filter((hq) => !hqOrder.includes(hq)),
    ]

    return ordered.map((hq) => ({
      hq,
      stats: aggregateRows(byHq.get(hq) || []),
    }))
  }, [projectRows])

  const branchStats = useMemo(() => {
    if (!selectedHq) return [] as { branch: string; stats: LevelAgg }[]
    const byBranch = new Map<string, ProjectStatusRow[]>()
    for (const row of projectRows) {
      if (row.project.managing_hq !== selectedHq) continue
      const branch = row.project.managing_branch || ''
      if (!branch) continue
      const list = byBranch.get(branch)
      if (list) list.push(row)
      else byBranch.set(branch, [row])
    }

    const preferred = BRANCH_OPTIONS[selectedHq] || []
    const ordered: string[] = [
      ...preferred.filter((branch) => byBranch.has(branch)),
      ...Array.from(byBranch.keys()).filter((branch) => !preferred.includes(branch)),
    ]

    return ordered.map((branch) => ({
      branch,
      stats: aggregateRows(byBranch.get(branch) || []),
    }))
  }, [projectRows, selectedHq])

  const projectList = useMemo(
    () =>
      projectRows
        .filter(({ project }) => {
          if (selectedHq && project.managing_hq !== selectedHq) return false
          if (selectedBranch && project.managing_branch !== selectedBranch) return false
          return true
        })
        .sort((a, b) =>
          (a.project.project_name || '').localeCompare(b.project.project_name || '', 'ko')
        ),
    [projectRows, selectedHq, selectedBranch]
  )

  const scopeRows = useMemo(() => {
    if (viewLevel === 'project') return projectList
    if (viewLevel === 'branch') {
      return projectRows.filter(({ project }) => project.managing_hq === selectedHq)
    }
    return projectRows
  }, [viewLevel, projectList, projectRows, selectedHq])

  const summary = useMemo(() => aggregateRows(scopeRows), [scopeRows])

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

  const navigateToProject = (projectId: string) => {
    router.push(
      `/project/${encodeURIComponent(projectId)}/headquarters-inspection?fromBranch=${encodeURIComponent(selectedBranch || '')}`
    )
  }

  const title =
    viewLevel === 'project'
      ? `${selectedBranch ?? ''} - 프로젝트별 5대 핵심이행사항`
      : viewLevel === 'branch'
        ? `${selectedHq ? hqDisplay(selectedHq) : ''} - 지사별 5대 핵심이행사항`
        : '본부별 5대 핵심이행사항'

  const backLabel =
    viewLevel === 'hq'
      ? '안전현황으로 돌아가기'
      : viewLevel === 'branch'
        ? '본부로 돌아가기'
        : '지사로 돌아가기'

  return (
    <div className="w-fit max-w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-gray-200 px-3 py-3 sm:px-4">
        <button
          type="button"
          onClick={handleBack}
          className="inline-flex items-center gap-1 text-sm text-gray-600 transition-colors hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </button>
        <div className="flex items-center gap-2 border-l border-gray-200 pl-3">
          <ShieldCheck className="h-5 w-5 text-emerald-600" />
          <h2 className="text-base font-semibold text-gray-900 sm:text-lg">{title}</h2>
        </div>
      </div>

      <div className="space-y-3 p-3 sm:p-4">
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
            <p className="text-xs text-gray-500">대상 프로젝트 수</p>
            <p className="mt-0.5 text-lg font-semibold text-gray-900">{summary.projectCount}개</p>
          </div>
          <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2">
            <p className="text-xs text-blue-700">점검 실시 수</p>
            <p className="mt-0.5 text-lg font-semibold text-blue-900">{summary.inspectedCount}개</p>
          </div>
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="text-xs text-amber-700">미흡·불이행 보유 수</p>
            <p className="mt-0.5 text-lg font-semibold text-amber-900">{summary.concernCount}개</p>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-[120px] flex-col gap-1 text-xs font-medium text-gray-600">
            연도
            <select
              value={selectedYear}
              onChange={(event) =>
                setSelectedQuarter(`${event.target.value}Q${selectedQuarterNumber}`)
              }
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {YEAR_OPTIONS.map((year) => (
                <option key={year} value={year}>
                  {year}년
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-[120px] flex-col gap-1 text-xs font-medium text-gray-600">
            분기
            <select
              value={selectedQuarterNumber}
              onChange={(event) =>
                setSelectedQuarter(`${selectedYear}Q${event.target.value}`)
              }
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {[1, 2, 3, 4].map((quarter) => (
                <option key={quarter} value={quarter}>
                  {quarter}분기
                </option>
              ))}
            </select>
          </label>
        </div>

        {loading ? (
          <div className="flex min-h-[240px] items-center justify-center">
            <LoadingSpinner />
          </div>
        ) : error ? (
          <div className="min-h-[180px] py-16 text-center text-sm text-red-600">{error}</div>
        ) : (
          <div className="overflow-x-auto rounded-md border border-gray-200">
            {viewLevel === 'hq' && (
              <table className="min-w-[520px] w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="whitespace-nowrap px-3 py-2.5 text-center text-xs font-medium text-gray-500">
                      본부
                    </th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-center text-xs font-medium text-gray-500">
                      대상 프로젝트 수
                    </th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-center text-xs font-medium text-gray-500">
                      점검 실시 수
                    </th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-center text-xs font-medium text-gray-500">
                      미흡·불이행 보유 수
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {hqStats.map(({ hq, stats }) => (
                    <tr
                      key={hq}
                      onClick={() => {
                        setSelectedHq(hq)
                        setViewLevel('branch')
                      }}
                      className="cursor-pointer transition-colors hover:bg-blue-50/50"
                    >
                      <td className="whitespace-nowrap px-3 py-2.5 text-center text-sm font-medium text-blue-700">
                        {hqDisplay(hq)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-center text-sm text-gray-700">
                        {stats.projectCount}개
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-center text-sm text-gray-700">
                        {stats.inspectedCount}개
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-center text-sm text-gray-700">
                        {stats.concernCount}개
                      </td>
                    </tr>
                  ))}
                  {hqStats.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-10 text-center text-sm text-gray-500">
                        등록된 프로젝트가 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {viewLevel === 'branch' && selectedHq && (
              <table className="min-w-[520px] w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="whitespace-nowrap px-3 py-2.5 text-center text-xs font-medium text-gray-500">
                      지사
                    </th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-center text-xs font-medium text-gray-500">
                      대상 프로젝트 수
                    </th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-center text-xs font-medium text-gray-500">
                      점검 실시 수
                    </th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-center text-xs font-medium text-gray-500">
                      미흡·불이행 보유 수
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {branchStats.map(({ branch, stats }) => (
                    <tr
                      key={branch}
                      onClick={() => {
                        setSelectedBranch(branch)
                        setViewLevel('project')
                      }}
                      className="cursor-pointer transition-colors hover:bg-blue-50/50"
                    >
                      <td className="whitespace-nowrap px-3 py-2.5 text-center text-sm font-medium text-blue-700">
                        {branch}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-center text-sm text-gray-700">
                        {stats.projectCount}개
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-center text-sm text-gray-700">
                        {stats.inspectedCount}개
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-center text-sm text-gray-700">
                        {stats.concernCount}개
                      </td>
                    </tr>
                  ))}
                  {branchStats.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-10 text-center text-sm text-gray-500">
                        해당 본부에 등록된 프로젝트가 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {viewLevel === 'project' && selectedBranch && (
              <table className="min-w-[860px] divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="min-w-[260px] px-3 py-2.5 text-left text-xs font-medium text-gray-500">
                      프로젝트명
                    </th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-center text-xs font-medium text-gray-500">
                      최근 점검일
                    </th>
                    {CATEGORY_COLUMNS.map(({ prefix, label }) => (
                      <th
                        key={prefix}
                        className="whitespace-nowrap px-3 py-2.5 text-center text-xs font-medium text-gray-500"
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {projectList.map(({ project, inspection, categoryGrades }) => (
                    <tr
                      key={project.id}
                      role="link"
                      tabIndex={0}
                      onClick={() => navigateToProject(project.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          navigateToProject(project.id)
                        }
                      }}
                      className="cursor-pointer transition-colors hover:bg-blue-50/50 focus:bg-blue-50/50 focus:outline-none"
                    >
                      <td className="px-3 py-2.5 text-sm font-medium text-blue-700">
                        {project.project_name || '-'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-center text-sm text-gray-600">
                        {formatInspectionDate(inspection?.inspection_date || null)}
                      </td>
                      {categoryGrades.map((grade, index) => (
                        <td key={CATEGORY_COLUMNS[index].prefix} className="px-3 py-2.5 text-center">
                          <GradeBadge grade={grade} />
                        </td>
                      ))}
                    </tr>
                  ))}
                  {projectList.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-500">
                        해당 지사에 등록된 프로젝트가 없습니다.
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

export default FiveKeyStatusView
