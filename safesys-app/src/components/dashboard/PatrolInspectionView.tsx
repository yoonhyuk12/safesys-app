'use client'
// KRC 패트롤 점검(패트롤카를 이용한 본부불시점검)을 본부→지사→프로젝트 점검행 3단으로 조회하고 AI 엑셀을 내려받는 현황 뷰

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Car, ChevronDown, ChevronUp, Download, Loader2, RefreshCw } from 'lucide-react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useAuth } from '@/contexts/AuthContext'
import { BRANCH_OPTIONS, HEADQUARTERS_OPTIONS } from '@/lib/constants'
import { headquartersFindingTypeLabel } from '@/lib/inspection/headquarters-finding-type'
import {
  getPatrolActionState,
  getPatrolInspections,
  seoulToday,
  type PatrolActionState,
  type PatrolInspection,
} from '@/lib/patrol-inspections'
import { downloadPatrolInspectionExcel } from '@/lib/excel/patrol-inspection-export'
import { isOrganizationInUserScope } from '@/lib/organization-scope'
import { getProjectsByUserBranch, type Project } from '@/lib/projects'

interface PatrolInspectionViewProps {
  initialHq: string | null
  initialBranch: string | null
  onBack: () => void
}

type ViewLevel = 'hq' | 'branch' | 'project'

interface PatrolRow {
  inspection: PatrolInspection
  project: Project
  action: PatrolActionState
}

interface LevelAgg {
  projectCount: number
  inspectionCount: number
  completedCount: number
  pendingCount: number
  overdueCount: number
}

const MIN_YEAR = 2024
// 조치 지연 판정이 서울 기준이므로 기본 분기·연도도 같은 기준으로 맞춘다
const CURRENT_YEAR = Number(seoulToday().slice(0, 4))

const getCurrentQuarter = (): string => {
  const [yearText, monthText] = seoulToday().split('-')
  return `${yearText}Q${Math.floor((Number(monthText) - 1) / 3) + 1}`
}

const hqDisplay = (hq: string): string =>
  hq !== '본사' && hq !== '기타' && !hq.endsWith('본부') ? `${hq}본부` : hq

/** 관할 프로젝트에서 해당 지사가 속한 본부를 모은다. 같은 지사명이 여러 본부에 있으면 2개 이상이 나온다. */
const hqsOfBranch = (projects: Project[], branch: string): string[] => {
  const set = new Set<string>()
  for (const project of projects) {
    if (project.managing_branch !== branch) continue
    const hq = String(project.managing_hq ?? '').trim()
    if (hq) set.add(hq)
  }
  return Array.from(set)
}

const formatDate = (value: string | null | undefined): string => {
  const text = String(value ?? '').trim()
  if (!text) return '-'
  return text.slice(0, 10).replace(/-/g, '.')
}

const getInspectionTimestamp = (value: string | null | undefined): number => {
  if (!value) return Number.NEGATIVE_INFINITY
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp
}

/** 지적내용1·2를 한 셀에 담는다. 둘 다 있으면 번호와 줄바꿈으로 구분한다. */
const formatIssueContent = (inspection: PatrolInspection): string => {
  const contents = [inspection.issue_content1, inspection.issue_content2]
    .map((value) => String(value ?? '').trim())
    .filter((value) => value.length > 0)
  if (contents.length === 0) return '-'
  if (contents.length === 1) return contents[0]
  return contents.map((content, index) => `${index + 1}. ${content}`).join('\n')
}

const formatSupervisor = (project: Project): string => {
  const text = [project.supervisor_position, project.supervisor_name]
    .map((value) => String(value ?? '').trim())
    .filter((value) => value.length > 0)
    .join(' ')
  return text || '-'
}

const emptyAgg = (): LevelAgg => ({
  projectCount: 0,
  inspectionCount: 0,
  completedCount: 0,
  pendingCount: 0,
  overdueCount: 0,
})

const aggregateRows = (rows: PatrolRow[]): LevelAgg => {
  const agg = emptyAgg()
  const projectIds = new Set<string>()
  for (const { project, action } of rows) {
    projectIds.add(project.id)
    agg.inspectionCount += 1
    if (action.notApplicable) continue
    if (action.completed) agg.completedCount += 1
    else agg.pendingCount += 1
    if (action.overdue) agg.overdueCount += 1
  }
  agg.projectCount = projectIds.size
  return agg
}

/** 건수 표시. 0이면 "-" */
const formatCount = (count: number): string => (count === 0 ? '-' : `${count}건`)

const CountCell = ({ count, tone }: { count: number; tone?: 'green' | 'amber' | 'red' }) => {
  const toneClass =
    count === 0
      ? 'text-gray-400'
      : tone === 'green'
        ? 'text-green-700'
        : tone === 'amber'
          ? 'text-amber-700'
          : tone === 'red'
            ? 'text-red-700'
            : 'text-gray-700'
  return (
    <td className={`whitespace-nowrap px-3 py-2.5 text-center text-sm tabular-nums ${toneClass}`}>
      {formatCount(count)}
    </td>
  )
}

const FindingTypeBadge = ({ inspection }: { inspection: PatrolInspection }) => {
  const findingType = inspection.finding_type
  const label = headquartersFindingTypeLabel(findingType)
  if (!label) return <span className="text-sm text-gray-400">-</span>
  const badgeClass =
    findingType === 'work_stop'
      ? 'bg-red-100 text-red-800'
      : findingType === 'not_applicable'
        ? 'bg-gray-100 text-gray-800'
        : 'bg-amber-100 text-amber-800'
  return (
    <span
      className={`inline-flex min-w-[58px] justify-center rounded-full px-2 py-1 text-xs font-medium ${badgeClass}`}
    >
      {label}
    </span>
  )
}

const ActionStateBadge = ({ action }: { action: PatrolActionState }) => {
  if (action.notApplicable) {
    return (
      <span className="inline-flex min-w-[58px] justify-center rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-800">
        해당없음
      </span>
    )
  }
  if (action.completed) {
    return (
      <span className="inline-flex flex-col items-center gap-0.5">
        <span className="inline-flex min-w-[58px] justify-center rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
          조치완료
        </span>
        <span className="text-xs tabular-nums text-gray-600">
          {action.completedDate ? formatDate(action.completedDate) : '일자 미기록'}
        </span>
      </span>
    )
  }
  return (
    <span
      className={`inline-flex min-w-[58px] justify-center rounded-full px-2 py-1 text-xs font-medium ${
        action.overdue ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
      }`}
    >
      미조치
    </span>
  )
}

const PatrolInspectionView = ({ initialHq, initialBranch, onBack }: PatrolInspectionViewProps) => {
  const router = useRouter()
  const { userProfile } = useAuth()

  // 지사명만으로 본부를 추정하지 않는다. 같은 지사명이 여러 본부에 있으면 다른 본부 실적이 잘린다.
  const hq0 = initialHq || null
  const branch0 = initialBranch || null
  const [viewLevel, setViewLevel] = useState<ViewLevel>(
    branch0 ? 'project' : hq0 ? 'branch' : 'hq'
  )
  const [selectedHq, setSelectedHq] = useState<string | null>(hq0)
  const [selectedBranch, setSelectedBranch] = useState<string | null>(branch0)
  const [selectedQuarter, setSelectedQuarter] = useState(getCurrentQuarter)
  const [projects, setProjects] = useState<Project[]>([])
  const [inspections, setInspections] = useState<PatrolInspection[]>([])
  const [projectsLoading, setProjectsLoading] = useState(true)
  const [inspectionsLoading, setInspectionsLoading] = useState(false)
  const [error, setError] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<{ current: number; total: number } | null>(null)
  const [downloadError, setDownloadError] = useState('')
  const [reloadToken, setReloadToken] = useState(0)
  const scopeAppliedRef = useRef(false)
  const loadedScopeRef = useRef<string | null>(null)

  // 조회 범위는 프로필의 소속 정보로만 결정된다. 객체 동일성이 흔들려도 아래 값이 그대로면 다시 부르지 않는다.
  const profileId = userProfile?.id ?? ''
  const profileRole = userProfile?.role ?? ''
  const profileHq = userProfile?.hq_division ?? ''
  const profileBranch = userProfile?.branch_division ?? ''

  // 조회 시점의 최신 프로필을 읽기 위한 참조. 아래 로딩 effect보다 먼저 선언해 순서를 보장한다.
  const userProfileRef = useRef(userProfile)
  useEffect(() => {
    userProfileRef.current = userProfile
  }, [userProfile])

  const isClientRole = profileRole === '발주청'

  useEffect(() => {
    const profile = userProfileRef.current
    if (!profileId || !profile) return
    if (!isClientRole) {
      setProjects([])
      setInspections([])
      setProjectsLoading(false)
      return
    }

    // 소속이 실제로 바뀌었으면 이전 계정 기준으로 좁혀둔 선택과 목록을 먼저 비운다
    const scopeKey = `${profileId}|${profileRole}|${profileHq}|${profileBranch}`
    if (loadedScopeRef.current !== null && loadedScopeRef.current !== scopeKey) {
      scopeAppliedRef.current = false
      setProjects([])
      setInspections([])
      setSelectedHq(hq0)
      setSelectedBranch(branch0)
      setViewLevel(branch0 ? 'project' : hq0 ? 'branch' : 'hq')
    }
    loadedScopeRef.current = scopeKey

    let cancelled = false
    setProjectsLoading(true)
    setError('')

    const load = async () => {
      try {
        // 제출용 실적이라 1000행 상한에 잘리면 안 된다 — 관할 전체를 나눠 받는다
        const projectResult = await getProjectsByUserBranch(profile, { fetchAll: true })
        if (cancelled) return
        if (!projectResult.success || !projectResult.projects) {
          setProjects([])
          setError('관할 프로젝트 목록을 불러오지 못했습니다.')
          return
        }
        // 과거 분기 실적을 숨기지 않는다 — 준공 프로젝트도 관할이면 그대로 포함한다.
        // 조회 결과는 다시 한 번 소속 기준으로 거른다. 동명 지사가 다른 본부에 섞여 들어오지 않게 하는 방어선이다.
        setProjects(
          projectResult.projects.filter((project) =>
            isOrganizationInUserScope(profile, {
              managing_hq: project.managing_hq,
              managing_branch: project.managing_branch,
            })
          )
        )
      } catch {
        if (!cancelled) {
          setProjects([])
          setError('데이터를 불러오는 중 오류가 발생했습니다.')
        }
      } finally {
        if (!cancelled) setProjectsLoading(false)
      }
    }

    load()
    // 소속이 바뀌면 이전 계정 응답이 뒤늦게 도착해도 버린다
    return () => {
      cancelled = true
    }
    // hq0·branch0은 마운트 시 props에서 정해진 상수라 의존성에 넣지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, profileRole, profileHq, profileBranch, isClientRole, reloadToken])

  /** 관할에 본부·지사가 하나뿐이면 그 단계를 건너뛴다. 사용자 관할 밖으로는 올라가지 않는다. */
  const scopeHqs = useMemo(() => {
    const set = new Set<string>()
    for (const project of projects) {
      const hq = String(project.managing_hq ?? '').trim()
      if (hq) set.add(hq)
    }
    return Array.from(set)
  }, [projects])

  const scopeBranches = useMemo(() => {
    const set = new Set<string>()
    for (const project of projects) {
      const branch = String(project.managing_branch ?? '').trim()
      if (branch) set.add(branch)
    }
    return Array.from(set)
  }, [projects])

  const rootLevel: ViewLevel = useMemo(() => {
    if (scopeHqs.length === 1 && scopeBranches.length === 1) return 'project'
    if (scopeHqs.length === 1) return 'branch'
    return 'hq'
  }, [scopeHqs, scopeBranches])

  useEffect(() => {
    if (projectsLoading || scopeAppliedRef.current || projects.length === 0) return
    scopeAppliedRef.current = true

    // 지사로 바로 들어온 경우: 관할 프로젝트에서 본부를 역산해 단일일 때만 지정한다.
    // 여러 본부에 같은 지사명이 있으면 본부 필터 없이 지사명으로 전부 보여준다.
    if (branch0) {
      if (!hq0) {
        const candidates = hqsOfBranch(projects, branch0)
        if (candidates.length === 1) setSelectedHq(candidates[0])
      }
      return
    }

    if (rootLevel === 'hq') return

    setSelectedHq((current) => current || scopeHqs[0] || null)
    if (rootLevel === 'project') {
      setSelectedBranch((current) => current || scopeBranches[0] || null)
    }
    setViewLevel((current) => {
      if (current === 'project') return current
      if (rootLevel === 'project') return 'project'
      return current === 'hq' ? 'branch' : current
    })
    // hq0·branch0은 마운트 시 props에서 정해진 상수라 의존성에 넣지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectsLoading, projects, rootLevel, scopeHqs, scopeBranches])

  const projectIds = useMemo(() => projects.map((project) => project.id), [projects])
  const projectIdsKey = useMemo(() => projectIds.join(','), [projectIds])

  useEffect(() => {
    if (projectsLoading) return
    if (projectIds.length === 0) {
      setInspections([])
      return
    }

    let cancelled = false
    // 이전 분기 실적이 새 분기 수치로 읽히지 않게 먼저 비운다
    setInspections([])
    setInspectionsLoading(true)
    setError('')

    const load = async () => {
      try {
        const rows = await getPatrolInspections(projectIds, selectedQuarter)
        if (!cancelled) setInspections(rows)
      } catch {
        if (!cancelled) {
          setInspections([])
          setError('패트롤 점검 데이터를 불러오지 못했습니다.')
        }
      } finally {
        if (!cancelled) setInspectionsLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
    // projectIdsKey로 배열 동일성 변화를 흡수하고, reloadToken으로 재시도를 받는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectIdsKey, selectedQuarter, projectsLoading, reloadToken])

  // 분기·본부·지사가 바뀌면 무관해진 다운로드 실패 배너를 지운다
  useEffect(() => {
    setDownloadError('')
  }, [selectedQuarter, selectedHq, selectedBranch])

  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects]
  )

  /** 관할 프로젝트에 속한 패트롤 점검만 행으로 만든다 (관할 밖 데이터는 버린다) */
  const rows = useMemo<PatrolRow[]>(() => {
    const result: PatrolRow[] = []
    for (const inspection of inspections) {
      const project = projectById.get(inspection.project_id)
      if (!project) continue
      result.push({ inspection, project, action: getPatrolActionState(inspection) })
    }
    return result
  }, [inspections, projectById])

  const hqStats = useMemo(() => {
    const byHq = new Map<string, PatrolRow[]>()
    for (const row of rows) {
      const hq = String(row.project.managing_hq ?? '').trim()
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
    return ordered.map((hq) => ({ hq, stats: aggregateRows(byHq.get(hq) || []) }))
  }, [rows])

  const branchStats = useMemo(() => {
    if (!selectedHq) return [] as { branch: string; stats: LevelAgg }[]
    const byBranch = new Map<string, PatrolRow[]>()
    for (const row of rows) {
      if (row.project.managing_hq !== selectedHq) continue
      const branch = String(row.project.managing_branch ?? '').trim()
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
    return ordered.map((branch) => ({ branch, stats: aggregateRows(byBranch.get(branch) || []) }))
  }, [rows, selectedHq])

  /** 현재 선택 범위(본부·지사)에 해당하는 점검행. 엑셀 다운로드 대상과 동일하다. */
  const scopeRows = useMemo(() => {
    const filtered = rows.filter(({ project }) => {
      if (selectedHq && project.managing_hq !== selectedHq) return false
      if (selectedBranch && project.managing_branch !== selectedBranch) return false
      return true
    })
    return filtered.sort((a, b) => {
      const diff =
        getInspectionTimestamp(b.inspection.inspection_date) -
        getInspectionTimestamp(a.inspection.inspection_date)
      if (diff !== 0) return diff
      return (a.project.project_name || '').localeCompare(b.project.project_name || '', 'ko')
    })
  }, [rows, selectedHq, selectedBranch])

  const scopeProjects = useMemo(
    () =>
      projects.filter((project) => {
        if (selectedHq && project.managing_hq !== selectedHq) return false
        if (selectedBranch && project.managing_branch !== selectedBranch) return false
        return true
      }),
    [projects, selectedHq, selectedBranch]
  )

  const summary = useMemo(() => aggregateRows(scopeRows), [scopeRows])

  const [selectedYear, selectedQuarterNumber] = selectedQuarter.split('Q').map(Number)

  const loading = projectsLoading || inspectionsLoading

  const handleBack = () => {
    if (viewLevel === rootLevel) {
      onBack()
      return
    }
    if (viewLevel === 'project') {
      setSelectedBranch(null)
      setViewLevel(rootLevel === 'branch' ? 'branch' : selectedHq ? 'branch' : 'hq')
      return
    }
    setSelectedHq(null)
    setViewLevel('hq')
  }

  const selectHq = (hq: string) => {
    setSelectedHq(hq)
    setViewLevel('branch')
  }

  const selectBranch = (branch: string) => {
    setSelectedBranch(branch)
    setViewLevel('project')
  }

  const navigateToProject = (projectId: string) => {
    router.push(
      `/project/${encodeURIComponent(projectId)}/headquarters-inspection?fromBranch=${encodeURIComponent(selectedBranch || '')}`
    )
  }

  const handleDownloadExcel = async () => {
    if (downloading || scopeRows.length === 0) return
    setDownloading(true)
    setDownloadError('')
    setDownloadProgress(null)
    try {
      await downloadPatrolInspectionExcel(
        scopeProjects,
        scopeRows.map((row) => row.inspection),
        selectedQuarter,
        (current: number, total: number) => setDownloadProgress({ current, total })
      )
    } catch (downloadException) {
      setDownloadError(
        downloadException instanceof Error
          ? downloadException.message
          : '엑셀 다운로드 중 오류가 발생했습니다.'
      )
    } finally {
      setDownloading(false)
      setDownloadProgress(null)
    }
  }

  const title =
    viewLevel === 'project'
      ? `${selectedBranch ?? '관할'} - 프로젝트별 KRC 패트롤 점검`
      : viewLevel === 'branch'
        ? `${selectedHq ? hqDisplay(selectedHq) : ''} - 지사별 KRC 패트롤 점검`
        : '본부별 KRC 패트롤 점검'

  // 본부를 고르지 않은 지사 진입에서는 뒤로가기가 본부 표로 가므로 문구도 맞춘다
  const backLabel =
    viewLevel === rootLevel
      ? '안전현황으로 돌아가기'
      : viewLevel === 'project' && (rootLevel === 'branch' || selectedHq)
        ? '지사로 돌아가기'
        : '본부로 돌아가기'

  if (userProfile && !isClientRole) {
    return (
      <div className="w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
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
            <Car className="h-4 w-4 text-blue-600" />
            <h2 className="text-base font-semibold text-gray-900 sm:text-lg">KRC 패트롤 점검</h2>
          </div>
        </div>
        <div className="px-4 py-16 text-center">
          <p className="text-sm text-gray-600">발주청 사용자만 조회할 수 있는 화면입니다.</p>
        </div>
      </div>
    )
  }

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
          <Car className="h-4 w-4 text-blue-600" />
          <h2 className="text-base font-semibold text-gray-900 sm:text-lg">{title}</h2>
        </div>
      </div>

      <div className="space-y-3 p-3 sm:p-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
            <p className="text-xs text-gray-500">점검 건수</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-gray-900">
              {loading ? '—' : `${summary.inspectionCount}건`}
            </p>
          </div>
          <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2">
            <p className="text-xs text-green-700">조치완료</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-green-900">
              {loading ? '—' : `${summary.completedCount}건`}
            </p>
          </div>
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="text-xs text-amber-700">미조치</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-amber-900">
              {loading ? '—' : `${summary.pendingCount}건`}
            </p>
          </div>
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2">
            <p className="text-xs text-red-700">7일 초과 지연</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-red-900">
              {loading ? '—' : `${summary.overdueCount}건`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-2">
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
                onChange={(event) => setSelectedQuarter(`${selectedYear}Q${event.target.value}`)}
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

          <div className="flex flex-col items-end gap-1">
            <button
              type="button"
              onClick={handleDownloadExcel}
              disabled={downloading || loading || scopeRows.length === 0}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {downloading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {downloadProgress
                    ? `AI 작성 중 ${downloadProgress.current}/${downloadProgress.total}`
                    : '엑셀 생성 중...'}
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  AI 엑셀 다운로드
                </>
              )}
            </button>
            <p className="text-xs text-gray-500">
              {loading
                ? '불러오는 중...'
                : scopeRows.length === 0
                  ? '다운로드할 점검이 없습니다.'
                  : `현재 범위 ${scopeRows.length}건`}
            </p>
          </div>
        </div>

        {downloadError && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {downloadError}
          </div>
        )}

        {loading ? (
          <div className="flex min-h-[240px] items-center justify-center">
            <LoadingSpinner />
          </div>
        ) : error ? (
          <div className="flex min-h-[180px] flex-col items-center justify-center gap-3 py-16 text-center">
            <p className="text-sm text-red-600">{error}</p>
            <button
              type="button"
              onClick={() => setReloadToken((token) => token + 1)}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50"
            >
              <RefreshCw className="h-4 w-4" />
              다시 시도
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border border-gray-200">
            {viewLevel === 'hq' && (
              <table className="w-full min-w-[720px] divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="whitespace-nowrap px-3 py-2.5 text-center text-xs font-medium text-gray-500">
                      본부
                    </th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-center text-xs font-medium text-gray-500">
                      점검 프로젝트 수
                    </th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-center text-xs font-medium text-gray-500">
                      점검 건수
                    </th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-center text-xs font-medium text-gray-500">
                      조치완료
                    </th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-center text-xs font-medium text-gray-500">
                      미조치
                    </th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-center text-xs font-medium text-gray-500">
                      7일 초과 지연
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {hqStats.map(({ hq, stats }) => (
                    <tr
                      key={hq}
                      onClick={() => selectHq(hq)}
                      className="cursor-pointer transition-colors hover:bg-blue-50/50"
                    >
                      <td className="whitespace-nowrap px-3 py-2.5 text-center">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            selectHq(hq)
                          }}
                          className="rounded text-sm font-medium text-blue-700 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          {hqDisplay(hq)}
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-center text-sm tabular-nums text-gray-700">
                        {stats.projectCount === 0 ? '-' : `${stats.projectCount}개`}
                      </td>
                      <CountCell count={stats.inspectionCount} />
                      <CountCell count={stats.completedCount} tone="green" />
                      <CountCell count={stats.pendingCount} tone="amber" />
                      <CountCell count={stats.overdueCount} tone="red" />
                    </tr>
                  ))}
                  {hqStats.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">
                        해당 분기에 패트롤 점검 기록이 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {viewLevel === 'branch' && selectedHq && (
              <table className="w-full min-w-[720px] divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="whitespace-nowrap px-3 py-2.5 text-center text-xs font-medium text-gray-500">
                      지사
                    </th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-center text-xs font-medium text-gray-500">
                      점검 프로젝트 수
                    </th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-center text-xs font-medium text-gray-500">
                      점검 건수
                    </th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-center text-xs font-medium text-gray-500">
                      조치완료
                    </th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-center text-xs font-medium text-gray-500">
                      미조치
                    </th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-center text-xs font-medium text-gray-500">
                      7일 초과 지연
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {branchStats.map(({ branch, stats }) => (
                    <tr
                      key={branch}
                      onClick={() => selectBranch(branch)}
                      className="cursor-pointer transition-colors hover:bg-blue-50/50"
                    >
                      <td className="whitespace-nowrap px-3 py-2.5 text-center">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            selectBranch(branch)
                          }}
                          className="rounded text-sm font-medium text-blue-700 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          {branch}
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-center text-sm tabular-nums text-gray-700">
                        {stats.projectCount === 0 ? '-' : `${stats.projectCount}개`}
                      </td>
                      <CountCell count={stats.inspectionCount} />
                      <CountCell count={stats.completedCount} tone="green" />
                      <CountCell count={stats.pendingCount} tone="amber" />
                      <CountCell count={stats.overdueCount} tone="red" />
                    </tr>
                  ))}
                  {branchStats.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">
                        해당 본부에 패트롤 점검 기록이 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {viewLevel === 'project' && (
              <table className="w-full min-w-[980px] divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="min-w-[220px] px-3 py-2.5 text-left text-xs font-medium text-gray-500">
                      사업명
                    </th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-center text-xs font-medium text-gray-500">
                      점검일
                    </th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-center text-xs font-medium text-gray-500">
                      지적유형
                    </th>
                    <th className="min-w-[280px] px-3 py-2.5 text-left text-xs font-medium text-gray-500">
                      지적내용
                    </th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-center text-xs font-medium text-gray-500">
                      조치상태
                    </th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-center text-xs font-medium text-gray-500">
                      공사감독
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {scopeRows.map(({ inspection, project, action }) => (
                    <tr
                      key={inspection.id}
                      role="link"
                      tabIndex={0}
                      onClick={() => navigateToProject(project.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          navigateToProject(project.id)
                        }
                      }}
                      className={`cursor-pointer transition-colors hover:bg-blue-50/50 focus:bg-blue-50/50 focus:outline-none ${
                        action.overdue ? 'bg-red-50/60' : ''
                      }`}
                    >
                      <td className="px-3 py-2.5 text-sm font-medium text-blue-700">
                        {project.project_name || '-'}
                        {/* 본부를 고르지 않은 지사 진입(동명 지사)에서는 어느 본부 사업인지 함께 보여준다 */}
                        {!selectedHq && project.managing_hq && (
                          <span className="mt-0.5 block text-xs font-normal text-gray-500">
                            {hqDisplay(project.managing_hq)}
                          </span>
                        )}
                      </td>
                      <td
                        className={`whitespace-nowrap px-3 py-2.5 text-center text-sm tabular-nums ${
                          action.overdue ? 'font-semibold text-red-700' : 'text-gray-600'
                        }`}
                      >
                        {formatDate(inspection.inspection_date)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-center">
                        <FindingTypeBadge inspection={inspection} />
                      </td>
                      <td className="whitespace-pre-line px-3 py-2.5 text-xs text-gray-700">
                        {formatIssueContent(inspection)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-center">
                        <ActionStateBadge action={action} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-center text-sm text-gray-700">
                        {formatSupervisor(project)}
                      </td>
                    </tr>
                  ))}
                  {scopeRows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">
                        해당 분기에 패트롤 점검 기록이 없습니다.
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

export default PatrolInspectionView
