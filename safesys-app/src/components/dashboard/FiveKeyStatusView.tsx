'use client'
// 관할 프로젝트별 5대 핵심 안전수칙 이행 등급을 요약하는 현황 뷰

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
  const initialSelectedHq = initialHq || findHqByBranch(initialBranch)
  const [selectedHq, setSelectedHq] = useState(initialSelectedHq)
  const [selectedBranch, setSelectedBranch] = useState(initialBranch || '')
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

  const branchOptions = selectedHq ? BRANCH_OPTIONS[selectedHq] || [] : []
  const [selectedYear, selectedQuarterNumber] = selectedQuarter.split('Q').map(Number)

  const filteredRows = useMemo(
    () =>
      projectRows
        .filter(({ project }) => !selectedHq || project.managing_hq === selectedHq)
        .filter(({ project }) => !selectedBranch || project.managing_branch === selectedBranch)
        .sort((a, b) => {
          const branchComparison = (a.project.managing_branch || '').localeCompare(
            b.project.managing_branch || '',
            'ko'
          )
          if (branchComparison !== 0) return branchComparison
          return (a.project.project_name || '').localeCompare(b.project.project_name || '', 'ko')
        }),
    [projectRows, selectedHq, selectedBranch]
  )

  const inspectedProjectCount = filteredRows.filter(({ inspection }) => inspection !== null).length
  const concernProjectCount = filteredRows.filter(({ categoryGrades }) =>
    categoryGrades.some((grade) => grade === '4' || grade === '5')
  ).length

  const navigateToProject = (projectId: string) => {
    router.push(
      `/project/${encodeURIComponent(projectId)}/headquarters-inspection?fromBranch=${encodeURIComponent(selectedBranch)}`
    )
  }

  return (
    <div className="w-fit max-w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-gray-200 px-3 py-3 sm:px-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-sm text-gray-600 transition-colors hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          안전현황으로 돌아가기
        </button>
        <div className="flex items-center gap-2 border-l border-gray-200 pl-3">
          <ShieldCheck className="h-5 w-5 text-emerald-600" />
          <h2 className="text-base font-semibold text-gray-900 sm:text-lg">
            5대 핵심이행사항 이행 현황
          </h2>
        </div>
      </div>

      <div className="space-y-3 p-3 sm:p-4">
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
            <p className="text-xs text-gray-500">대상 프로젝트 수</p>
            <p className="mt-0.5 text-lg font-semibold text-gray-900">{filteredRows.length}개</p>
          </div>
          <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2">
            <p className="text-xs text-blue-700">점검 실시 수</p>
            <p className="mt-0.5 text-lg font-semibold text-blue-900">{inspectedProjectCount}개</p>
          </div>
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="text-xs text-amber-700">미흡·불이행 보유 수</p>
            <p className="mt-0.5 text-lg font-semibold text-amber-900">{concernProjectCount}개</p>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-[180px] flex-col gap-1 text-xs font-medium text-gray-600">
            본부
            <select
              value={selectedHq}
              onChange={(event) => {
                setSelectedHq(event.target.value)
                setSelectedBranch('')
              }}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">전체 본부</option>
              {HEADQUARTERS_OPTIONS.map((hq) => (
                <option key={hq} value={hq}>
                  {hq}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-[200px] flex-col gap-1 text-xs font-medium text-gray-600">
            지사
            <select
              value={selectedBranch}
              onChange={(event) => setSelectedBranch(event.target.value)}
              disabled={!selectedHq}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
            >
              <option value="">전체 지사</option>
              {branchOptions.map((branch) => (
                <option key={branch} value={branch}>
                  {branch}
                </option>
              ))}
            </select>
          </label>
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
            <table className="min-w-[960px] divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="whitespace-nowrap px-3 py-2.5 text-center text-xs font-medium text-gray-500">
                    지사
                  </th>
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
                {filteredRows.map(({ project, inspection, categoryGrades }) => (
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
                    <td className="whitespace-nowrap px-3 py-2.5 text-center text-sm text-gray-600">
                      {project.managing_branch || '-'}
                    </td>
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
                {filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-500">
                      해당 조건에 등록된 프로젝트가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default FiveKeyStatusView
