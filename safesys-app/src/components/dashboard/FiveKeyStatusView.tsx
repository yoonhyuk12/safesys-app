'use client'
// 관할 프로젝트별 5대 핵심 안전수칙 이행 등급을 본부→지사→프로젝트 3단으로 보는 현황 뷰

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ChevronDown, ChevronUp, ShieldCheck } from 'lucide-react'
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
  /** 5점 체계 평균 (5=매우우수 … 1=불이행, 미입력 시 null) */
  averageScore: number | null
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

const MIN_YEAR = 2024
const CURRENT_YEAR = new Date().getFullYear()

const emptyAgg = (): LevelAgg => ({
  projectCount: 0,
  inspectedCount: 0,
  concernCount: 0,
  averageScore: null,
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

/** 선택 분기 공사중 여부 — is_active.q{N}(JSONB). 레거시 boolean은 분기판별 불가 → false */
const isActiveThisQuarter = (project: Project, quarterNum: number): boolean => {
  const isActive = project.is_active as unknown
  if (isActive && typeof isActive === 'object') {
    const key = `q${quarterNum}` as 'q1' | 'q2' | 'q3' | 'q4'
    return !!(isActive as Record<string, boolean>)[key]
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

/**
 * DB 등급(1=매우우수 … 5=불이행) → 표시 점수(5=매우우수 … 1=불이행)
 * 변환. 점수 = 6 - 등급
 */
const gradeToScore = (grade: Exclude<FiveKeyGrade, 'N/A'>): number => 6 - Number(grade)

/** 카테고리 등급을 5점 체계(5=매우우수) 산술평균. N/A·미입력 제외, 없으면 null */
const averageCategoryScore = (grades: CategoryGrade[]): number | null => {
  const numeric = grades.filter(
    (grade): grade is Exclude<FiveKeyGrade, 'N/A'> =>
      grade !== null && grade !== 'N/A'
  )
  if (numeric.length === 0) return null
  return numeric.reduce((sum, grade) => sum + gradeToScore(grade), 0) / numeric.length
}

/** 점검 실시 프로젝트의 카테고리 등급을 모아 5점 체계 평균 점수 산출 */
const computeAverageScore = (rows: ProjectStatusRow[]): number | null => {
  const grades: CategoryGrade[] = []
  for (const { inspection, categoryGrades } of rows) {
    if (!inspection) continue
    grades.push(...categoryGrades)
  }
  return averageCategoryScore(grades)
}

const categoryGradesFromInspection = (
  inspection: HeadquartersInspectionRow
): CategoryGrade[] => {
  const items = readFiveKeyItems(inspection.five_key_items)
  return CATEGORY_COLUMNS.map(({ prefix }) => getCategoryGrade(items, prefix))
}

/**
 * 점수 목록 순위 (높을수록 상위). 동점이면 동일 순위·다음 순위 건너뜀 (1·2·2·4).
 * 점수 없으면 null.
 */
const rankByScores = (scores: Array<number | null>): Array<number | null> =>
  scores.map((score) => {
    if (score === null) return null
    const betterCount = scores.filter(
      (other) => other !== null && (other as number) > score
    ).length
    return betterCount + 1
  })

/** 순위 산정에서 제외 (○○본부·지하수지질부). 목록에는 남기고 순위만 미표시 */
const isExcludedFromRank = (branchName: string): boolean =>
  branchName === '지하수지질부' || branchName.endsWith('본부')

/** 프로젝트 연간 점수. 해당 연도 분기별 대표 점검 점수의 산술평균 */
const buildYearScoresByProject = (
  projects: Project[],
  inspections: HeadquartersInspectionRow[],
  year: number
): Map<string, number | null> => {
  const byProject = new Map<string, HeadquartersInspectionRow[]>()
  for (const inspection of inspections) {
    if (!hasEnteredGrade(inspection)) continue
    const list = byProject.get(inspection.project_id)
    if (list) list.push(inspection)
    else byProject.set(inspection.project_id, [inspection])
  }

  const result = new Map<string, number | null>()
  for (const project of projects) {
    const projectInspections = byProject.get(project.id) || []
    const quarterScores: number[] = []
    for (let quarter = 1; quarter <= 4; quarter++) {
      const { start, end } = getQuarterRange(`${year}Q${quarter}`)
      let latest: HeadquartersInspectionRow | null = null
      for (const inspection of projectInspections) {
        const timestamp = getInspectionTimestamp(inspection.inspection_date)
        if (timestamp < start || timestamp > end) continue
        if (
          !latest ||
          timestamp > getInspectionTimestamp(latest.inspection_date)
        ) {
          latest = inspection
        }
      }
      if (!latest) continue
      const score = averageCategoryScore(categoryGradesFromInspection(latest))
      if (score !== null) quarterScores.push(score)
    }
    result.set(
      project.id,
      quarterScores.length === 0
        ? null
        : quarterScores.reduce((sum, score) => sum + score, 0) / quarterScores.length
    )
  }
  return result
}

/** 프로젝트 집합의 연간 평균 점수 (연간 점수 있는 프로젝트만 평균) */
const averageYearScoreForProjects = (
  projects: Project[],
  yearScoresByProject: Map<string, number | null>
): number | null => {
  const scores: number[] = []
  for (const project of projects) {
    const score = yearScoresByProject.get(project.id)
    if (score !== null && score !== undefined) scores.push(score)
  }
  if (scores.length === 0) return null
  return scores.reduce((sum, score) => sum + score, 0) / scores.length
}

const RankCell = ({ rank }: { rank: number | null }) => (
  <td className="whitespace-nowrap px-3 py-2.5 text-center text-sm font-semibold tabular-nums text-gray-800">
    {rank === null ? (
      <span className="font-normal text-gray-400">-</span>
    ) : (
      `${rank}위`
    )}
  </td>
)

/** 건수 표시. 0이면 "-" */
const formatCount = (count: number): string => (count === 0 ? '-' : `${count}개`)

/** 평균 점수(5=매우우수 … 1=불이행) 표시. 반올림 구간 색상 적용. 0·null은 "-" */
const ScoreBadge = ({ score }: { score: number | null }) => {
  if (score === null || score === 0) {
    return <span className="text-sm text-gray-400">-</span>
  }
  // 색상 밴드용 DB 등급으로 역변환 (5점→1, 1점→5)
  const band = String(Math.min(5, Math.max(1, Math.round(6 - score)))) as Exclude<
    FiveKeyGrade,
    'N/A'
  >
  return (
    <span
      className={`inline-flex min-w-[58px] justify-center rounded-full px-2 py-1 text-xs font-semibold tabular-nums ring-1 ring-inset ${GRADE_BADGE_CLASSES[band]}`}
      title={`5 매우우수 · 4 우수 · 3 보통 · 2 미흡 · 1 불이행`}
    >
      {score.toFixed(1)}점
    </span>
  )
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

  const yearScoresByProject = useMemo(
    () => buildYearScoresByProject(projects, inspections, selectedYear),
    [projects, inspections, selectedYear]
  )

  const aggregateRows = (rows: ProjectStatusRow[]): LevelAgg => {
    const agg = emptyAgg()
    agg.projectCount = rows.length
    agg.inspectedCount = rows.filter(({ inspection }) => inspection !== null).length
    agg.concernCount = rows.filter(({ categoryGrades }) => isConcernRow(categoryGrades)).length
    agg.averageScore = computeAverageScore(rows)
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

    const items = ordered.map((hq) => {
      const rows = byHq.get(hq) || []
      return {
        hq,
        stats: aggregateRows(rows),
        yearScore: averageYearScoreForProjects(
          rows.map((row) => row.project),
          yearScoresByProject
        ),
      }
    })
    const ranks = rankByScores(items.map((item) => item.stats.averageScore))
    const yearRanks = rankByScores(items.map((item) => item.yearScore))
    return items.map((item, index) => ({
      ...item,
      rank: ranks[index],
      yearRank: yearRanks[index],
    }))
  }, [projectRows, yearScoresByProject])

  const branchStats = useMemo(() => {
    if (!selectedHq) {
      return [] as {
        branch: string
        stats: LevelAgg
        rank: number | null
        yearRank: number | null
        yearScore: number | null
      }[]
    }
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

    const items = ordered.map((branch) => {
      const rows = byBranch.get(branch) || []
      const excluded = isExcludedFromRank(branch)
      return {
        branch,
        stats: aggregateRows(rows),
        yearScore: averageYearScoreForProjects(
          rows.map((row) => row.project),
          yearScoresByProject
        ),
        excluded,
      }
    })
    // 제외 대상은 순위 비교 점수에서 빼서 다른 지사 순위에 영향 없음
    const ranks = rankByScores(
      items.map((item) => (item.excluded ? null : item.stats.averageScore))
    )
    const yearRanks = rankByScores(
      items.map((item) => (item.excluded ? null : item.yearScore))
    )
    return items.map((item, index) => ({
      ...item,
      rank: ranks[index],
      yearRank: yearRanks[index],
    }))
  }, [projectRows, selectedHq, yearScoresByProject])

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

  /** 프로젝트 테이블 헤더 바로 아래 평균행용 — 카테고리별 5점 체계 평균 */
  const projectAverageScores = useMemo(
    () =>
      CATEGORY_COLUMNS.map((_, index) =>
        averageCategoryScore(projectList.map((row) => row.categoryGrades[index] ?? null))
      ),
    [projectList]
  )

  /** 평균행 집계. 해당분기 공사중 건수 · 점검 실시 건수 */
  const projectSummaryCounts = useMemo(() => {
    let underConstructionCount = 0
    let inspectedCount = 0
    for (const { project, inspection } of projectList) {
      if (isActiveThisQuarter(project, selectedQuarterNumber)) underConstructionCount += 1
      if (inspection) inspectedCount += 1
    }
    return { underConstructionCount, inspectedCount }
  }, [projectList, selectedQuarterNumber])

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
    <div className="w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
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
          <div className="flex flex-col gap-1 text-xs font-medium text-gray-600">
            연도
            <div className="flex items-center gap-1 rounded-md border border-gray-300 bg-white py-0.5 pl-2 pr-1">
              <span className="min-w-[52px] text-center text-sm tabular-nums text-gray-900">
                {selectedYear}년
              </span>
              <div className="flex flex-col">
                <button
                  type="button"
                  onClick={() =>
                    setSelectedQuarter(`${selectedYear + 1}Q${selectedQuarterNumber}`)
                  }
                  disabled={selectedYear >= CURRENT_YEAR}
                  aria-label="다음 연도"
                  className="text-gray-400 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedQuarter(`${selectedYear - 1}Q${selectedQuarterNumber}`)
                  }
                  disabled={selectedYear <= MIN_YEAR}
                  aria-label="이전 연도"
                  className="text-gray-400 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
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
              <table className="min-w-[780px] w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="whitespace-nowrap px-3 py-2.5 text-center text-xs font-medium text-gray-500">
                      본부
                    </th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-center text-xs font-medium text-gray-500">
                      해당년도 순위
                    </th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-center text-xs font-medium text-gray-500">
                      해당년도 평균 점수
                    </th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-center text-xs font-medium text-gray-500">
                      해당분기 순위
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
                    <th className="whitespace-nowrap px-3 py-2.5 text-center text-xs font-medium text-gray-500">
                      평균 등급
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {hqStats.map(({ hq, stats, rank, yearRank, yearScore }) => (
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
                      <RankCell rank={yearRank} />
                      <td className="whitespace-nowrap px-3 py-2.5 text-center">
                        <ScoreBadge score={yearScore} />
                      </td>
                      <RankCell rank={rank} />
                      <td className="whitespace-nowrap px-3 py-2.5 text-center text-sm text-gray-700">
                        {formatCount(stats.projectCount)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-center text-sm text-gray-700">
                        {formatCount(stats.inspectedCount)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-center text-sm text-gray-700">
                        {formatCount(stats.concernCount)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-center">
                        <ScoreBadge score={stats.averageScore} />
                      </td>
                    </tr>
                  ))}
                  {hqStats.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-500">
                        등록된 프로젝트가 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {viewLevel === 'branch' && selectedHq && (
              <table className="min-w-[780px] w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="whitespace-nowrap px-3 py-2.5 text-center text-xs font-medium text-gray-500">
                      지사
                    </th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-center text-xs font-medium text-gray-500">
                      해당년도 순위
                    </th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-center text-xs font-medium text-gray-500">
                      해당년도 평균 점수
                    </th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-center text-xs font-medium text-gray-500">
                      해당분기 순위
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
                    <th className="whitespace-nowrap px-3 py-2.5 text-center text-xs font-medium text-gray-500">
                      평균 등급
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {branchStats.map(({ branch, stats, rank, yearRank, yearScore }) => (
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
                      <RankCell rank={yearRank} />
                      <td className="whitespace-nowrap px-3 py-2.5 text-center">
                        <ScoreBadge score={yearScore} />
                      </td>
                      <RankCell rank={rank} />
                      <td className="whitespace-nowrap px-3 py-2.5 text-center text-sm text-gray-700">
                        {formatCount(stats.projectCount)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-center text-sm text-gray-700">
                        {formatCount(stats.inspectedCount)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-center text-sm text-gray-700">
                        {formatCount(stats.concernCount)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-center">
                        <ScoreBadge score={stats.averageScore} />
                      </td>
                    </tr>
                  ))}
                  {branchStats.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-500">
                        해당 본부에 등록된 프로젝트가 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {viewLevel === 'project' && selectedBranch && (
              <table className="min-w-[940px] w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="min-w-[260px] px-3 py-2.5 text-left text-xs font-medium text-gray-500">
                      프로젝트명
                    </th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-center text-xs font-medium text-gray-500">
                      해당분기 공사중
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
                  {projectList.length > 0 && (
                    <tr className="border-b-2 border-gray-300 bg-gray-100 font-semibold">
                      <td className="px-3 py-2.5 text-sm text-gray-900">평균</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-center text-sm text-gray-700">
                        {formatCount(projectSummaryCounts.underConstructionCount)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-center text-sm text-gray-700">
                        {formatCount(projectSummaryCounts.inspectedCount)}
                      </td>
                      {projectAverageScores.map((score, index) => (
                        <td
                          key={CATEGORY_COLUMNS[index].prefix}
                          className="px-3 py-2.5 text-center"
                        >
                          <ScoreBadge score={score} />
                        </td>
                      ))}
                    </tr>
                  )}
                  {projectList.map(({ project, inspection, categoryGrades }) => {
                    const underConstruction = isActiveThisQuarter(
                      project,
                      selectedQuarterNumber
                    )
                    return (
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
                        <td className="whitespace-nowrap px-3 py-2.5 text-center text-sm">
                          {underConstruction ? (
                            <span className="inline-flex min-w-[28px] justify-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">
                              O
                            </span>
                          ) : (
                            <span className="inline-flex min-w-[28px] justify-center text-xs font-medium text-gray-400">
                              X
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-center text-sm text-gray-600">
                          {formatInspectionDate(inspection?.inspection_date || null)}
                        </td>
                        {categoryGrades.map((grade, index) => (
                          <td
                            key={CATEGORY_COLUMNS[index].prefix}
                            className="px-3 py-2.5 text-center"
                          >
                            <GradeBadge grade={grade} />
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                  {projectList.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-500">
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
