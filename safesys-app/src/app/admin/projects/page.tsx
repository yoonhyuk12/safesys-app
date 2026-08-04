'use client'
// 관리자가 프로젝트 등록 현황을 조회하고 필터링·삭제하는 화면

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CirclePause,
  ExternalLink,
  FolderKanban,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { nextSortState, sortRows, type SortState } from '@/lib/admin-sort'
import {
  ADMIN_PROJECT_SORT_OPTIONS,
  getAdminProjectSortValue,
  type AdminProjectSortKey,
} from '@/lib/admin-list-sort'
import { AdminMobileDisclosure } from '@/components/admin/AdminMobileDisclosure'
import { MobileSortControls, SortableHeader } from '@/components/admin/AdminSortControls'
import { MonthlyProjectChart } from '@/components/admin/MonthlyProjectChart'

const PAGE_SIZE = 50

interface AdminProject {
  id: string
  project_name: string
  managing_hq: string
  managing_branch: string
  created_by: string
  created_at: string
  isActive: boolean
  creator: {
    fullName: string
    companyName: string
  } | null
}

interface ProjectStats {
  total: number
  active: number
  inactive: number
  recent30d: number
  byHq: Record<string, number>
  byBranch: Record<string, number>
}

type ProjectsApiResponse =
  | { success: true; projects: AdminProject[]; stats: ProjectStats }
  | { success: false; error?: string }

type DeleteApiResponse =
  | { success: true; deletedFiles: number }
  | { success: false; error?: string }

const EMPTY_STATS: ProjectStats = {
  total: 0,
  active: 0,
  inactive: 0,
  recent30d: 0,
  byHq: {},
  byBranch: {},
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('ko-KR').format(date)
}

interface ProjectSummaryCard {
  label: string
  value: number
  hint: string
  icon: LucideIcon
  tone: string
}

function buildProjectSummaries(stats: ProjectStats): ProjectSummaryCard[] {
  return [
    { label: '전체', value: stats.total, hint: '등록된 프로젝트', icon: FolderKanban, tone: 'bg-blue-50 text-blue-600' },
    { label: '활성', value: stats.active, hint: '활성 항목 보유', icon: CircleCheck, tone: 'bg-emerald-50 text-emerald-600' },
    { label: '비활성', value: stats.inactive, hint: '활성 항목 없음', icon: CirclePause, tone: 'bg-slate-100 text-slate-500' },
    { label: '최근 30일 등록', value: stats.recent30d, hint: '최근 30일 신규', icon: CalendarPlus, tone: 'bg-amber-50 text-amber-600' },
  ]
}

function ProjectSummaryCards({ stats }: { stats: ProjectStats }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 md:grid md:grid-cols-4 md:gap-3 md:overflow-visible md:pb-0">
      {buildProjectSummaries(stats).map((card) => {
        const Icon = card.icon
        return (
          <div
            key={card.label}
            className="min-w-[132px] shrink-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:min-w-0 md:shrink md:p-4"
          >
            <div className="flex items-center gap-2">
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ${card.tone}`}>
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <p className="truncate text-xs font-semibold text-slate-500">{card.label}</p>
            </div>
            <p className="mt-2 text-xl font-bold tabular-nums text-slate-950">
              {card.value.toLocaleString('ko-KR')}
              <span className="ml-0.5 text-sm font-semibold text-slate-500">건</span>
            </p>
            <p className="mt-0.5 truncate text-[11px] text-slate-400">{card.hint}</p>
          </div>
        )
      })}
    </div>
  )
}

function HqSummaryPills({
  summary,
  selectedHq,
  onSelect,
}: {
  summary: [string, number][]
  selectedHq: string
  onSelect: (hq: string) => void
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:p-4">
      <h3 className="text-xs font-semibold text-slate-500">본부별 등록 현황</h3>
      {summary.length === 0 ? (
        <p className="mt-2 text-xs text-slate-400">등록된 본부 정보가 없습니다.</p>
      ) : (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {summary.map(([hq, count]) => {
            const active = selectedHq === hq
            return (
              <button
                key={hq}
                type="button"
                onClick={() => onSelect(hq)}
                aria-pressed={active}
                className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  active
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-950'
                }`}
              >
                <span className="whitespace-nowrap">{hq}</span>
                <span className={`tabular-nums ${active ? 'text-blue-100' : 'text-slate-400'}`}>
                  {count.toLocaleString('ko-KR')}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ProjectFilterPanel({
  hqOptions,
  branchOptions,
  selectedHq,
  selectedBranch,
  searchTerm,
  activeOnly,
  onHqChange,
  onBranchChange,
  onSearchChange,
  onActiveOnlyChange,
}: {
  hqOptions: string[]
  branchOptions: string[]
  selectedHq: string
  selectedBranch: string
  searchTerm: string
  activeOnly: boolean
  onHqChange: (value: string) => void
  onBranchChange: (value: string) => void
  onSearchChange: (value: string) => void
  onActiveOnlyChange: (value: boolean) => void
}) {
  const selectClass = 'h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100'

  return (
    <div className="grid gap-2.5 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:grid-cols-[180px_180px_minmax(240px,1fr)_auto] md:items-center md:gap-3 md:p-4">
      <select
        value={selectedHq}
        onChange={(event) => onHqChange(event.target.value)}
        aria-label="본부 필터"
        className={selectClass}
      >
        <option value="">전체 본부</option>
        {hqOptions.map((hq) => <option key={hq} value={hq}>{hq}</option>)}
      </select>

      <select
        value={selectedBranch}
        onChange={(event) => onBranchChange(event.target.value)}
        aria-label="지사 필터"
        className={selectClass}
      >
        <option value="">전체 지사</option>
        {branchOptions.map((branch) => <option key={branch} value={branch}>{branch}</option>)}
      </select>

      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <span className="sr-only">프로젝트명 또는 등록자명 검색</span>
        <input
          type="search"
          value={searchTerm}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="프로젝트명 또는 등록자명 검색"
          className="h-11 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        />
      </label>

      <label className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-700 md:whitespace-nowrap">
        <input
          type="checkbox"
          checked={activeOnly}
          onChange={(event) => onActiveOnlyChange(event.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-200"
        />
        활성만
      </label>
    </div>
  )
}

function ProjectStatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
        isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
      }`}
    >
      {isActive
        ? <CircleCheck className="h-3.5 w-3.5" aria-hidden="true" />
        : <CirclePause className="h-3.5 w-3.5" aria-hidden="true" />}
      {isActive ? '활성' : '비활성'}
    </span>
  )
}

function ProjectTableRow({
  project,
  deletingId,
  onDelete,
}: {
  project: AdminProject
  deletingId: string | null
  onDelete: (project: AdminProject) => void
}) {
  return (
    <tr className="transition hover:bg-slate-50">
      <td className="max-w-[320px] px-4 py-2.5">
        <Link
          href={`/project/${project.id}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex max-w-full items-center gap-1 rounded font-semibold text-slate-950 outline-none transition hover:underline focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <span className="truncate">{project.project_name}</span>
          <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
        </Link>
      </td>
      <td className="whitespace-nowrap px-3 py-2.5">{project.managing_hq}</td>
      <td className="whitespace-nowrap px-3 py-2.5">{project.managing_branch}</td>
      <td className="px-3 py-2.5">
        <div className="font-medium text-slate-800">{project.creator?.fullName || '등록자 정보 없음'}</div>
        <div className="text-xs text-slate-500">{project.creator?.companyName || '-'}</div>
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-600">{formatDate(project.created_at)}</td>
      <td className="px-3 py-2.5 text-center">
        <ProjectStatusBadge isActive={project.isActive} />
      </td>
      <td className="px-4 py-2.5 text-right">
        <button
          type="button"
          onClick={() => onDelete(project)}
          disabled={deletingId !== null}
          className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-700 outline-none transition hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {deletingId === project.id
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            : <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}
          {deletingId === project.id ? '삭제 중' : '삭제'}
        </button>
      </td>
    </tr>
  )
}

function ProjectsTable({
  projects,
  loading,
  sortState,
  onSort,
  deletingId,
  onDelete,
}: {
  projects: AdminProject[]
  loading: boolean
  sortState: SortState<AdminProjectSortKey>
  onSort: (key: AdminProjectSortKey) => void
  deletingId: string | null
  onDelete: (project: AdminProject) => void
}) {
  return (
    <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:block">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs">
            <tr>
              <SortableHeader label="프로젝트명" sortKey="name" sortState={sortState} onSort={onSort} />
              <SortableHeader label="본부" sortKey="hq" sortState={sortState} onSort={onSort} />
              <SortableHeader label="지사" sortKey="branch" sortState={sortState} onSort={onSort} />
              <SortableHeader label="등록자" sortKey="creator" sortState={sortState} onSort={onSort} />
              <SortableHeader label="등록일" sortKey="createdAt" sortState={sortState} onSort={onSort} />
              <SortableHeader label="상태" sortKey="status" sortState={sortState} onSort={onSort} />
              <th scope="col" className="px-4 py-2 text-right font-semibold text-slate-600">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-16 text-center text-sm text-slate-500">
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    프로젝트 현황을 불러오는 중입니다.
                  </span>
                </td>
              </tr>
            ) : projects.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-16 text-center text-sm text-slate-500">
                  조건에 맞는 프로젝트가 없습니다.
                  <span className="mt-1 block text-xs text-slate-400">검색어나 필터를 해제하면 더 많은 프로젝트를 볼 수 있습니다.</span>
                </td>
              </tr>
            ) : projects.map((project) => (
              <ProjectTableRow
                key={project.id}
                project={project}
                deletingId={deletingId}
                onDelete={onDelete}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ProjectMobileSummary({ project }: { project: AdminProject }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700">
        <FolderKanban className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-slate-950">{project.project_name}</span>
        <span className="mt-0.5 block truncate text-xs text-slate-500">
          {project.managing_hq} · {project.managing_branch}
        </span>
      </span>
      <span
        className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${
          project.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
        }`}
      >
        {project.isActive ? '활성' : '비활성'}
      </span>
    </div>
  )
}

function ProjectMobileDetails({
  project,
  deletingId,
  onDelete,
}: {
  project: AdminProject
  deletingId: string | null
  onDelete: (project: AdminProject) => void
}) {
  return (
    <>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div>
          <dt className="text-xs text-slate-400">등록자</dt>
          <dd className="mt-1 truncate font-medium text-slate-700">{project.creator?.fullName || '등록자 정보 없음'}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400">회사</dt>
          <dd className="mt-1 truncate font-medium text-slate-700">{project.creator?.companyName || '-'}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-xs text-slate-400">등록일</dt>
          <dd className="mt-1 font-medium tabular-nums text-slate-700">{formatDate(project.created_at)}</dd>
        </div>
      </dl>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Link
          href={`/project/${project.id}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-[#15396f] px-3 text-sm font-semibold text-white outline-none transition hover:bg-[#1c4886] focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          프로젝트 열기
        </Link>
        <button
          type="button"
          onClick={() => onDelete(project)}
          disabled={deletingId !== null}
          className="min-h-11 rounded-xl border border-red-200 bg-red-50 px-3 text-sm font-semibold text-red-700 outline-none transition hover:bg-red-100 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {deletingId === project.id ? '삭제 중' : '삭제'}
        </button>
      </div>
    </>
  )
}

function ProjectsMobileList({
  projects,
  loading,
  expandedProjectId,
  onToggle,
  deletingId,
  onDelete,
}: {
  projects: AdminProject[]
  loading: boolean
  expandedProjectId: string | null
  onToggle: (id: string) => void
  deletingId: string | null
  onDelete: (project: AdminProject) => void
}) {
  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white py-12 text-sm text-slate-500 shadow-sm md:hidden">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" aria-hidden="true" />
        프로젝트 현황을 불러오는 중입니다.
      </div>
    )
  }

  if (projects.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-12 text-center text-sm text-slate-500 shadow-sm md:hidden">
        조건에 맞는 프로젝트가 없습니다.
        <span className="mt-1 block text-xs text-slate-400">검색어나 필터를 해제하면 더 많은 프로젝트를 볼 수 있습니다.</span>
      </div>
    )
  }

  return (
    <div className="grid gap-2 md:hidden">
      {projects.map((project) => (
        <AdminMobileDisclosure
          key={project.id}
          id={project.id}
          expanded={expandedProjectId === project.id}
          onToggle={() => onToggle(project.id)}
          summary={<ProjectMobileSummary project={project} />}
        >
          <ProjectMobileDetails project={project} deletingId={deletingId} onDelete={onDelete} />
        </AdminMobileDisclosure>
      ))}
    </div>
  )
}

function PaginationBar({
  visiblePage,
  totalPages,
  loading,
  onPrev,
  onNext,
}: {
  visiblePage: number
  totalPages: number
  loading: boolean
  onPrev: () => void
  onNext: () => void
}) {
  const navClass = 'grid h-11 w-11 place-items-center rounded-xl border border-slate-200 text-slate-600 outline-none transition hover:border-slate-300 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-40'

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-600 shadow-sm md:px-4">
      <span className="tabular-nums">
        {visiblePage.toLocaleString('ko-KR')} / {totalPages.toLocaleString('ko-KR')} 페이지 · 페이지당 {PAGE_SIZE}건
      </span>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onPrev} disabled={visiblePage <= 1 || loading} aria-label="이전 페이지" className={navClass}>
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" onClick={onNext} disabled={visiblePage >= totalPages || loading} aria-label="다음 페이지" className={navClass}>
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

export default function AdminProjectsPage() {
  const [projects, setProjects] = useState<AdminProject[]>([])
  const [stats, setStats] = useState<ProjectStats>(EMPTY_STATS)
  const [selectedHq, setSelectedHq] = useState('')
  const [selectedBranch, setSelectedBranch] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [activeOnly, setActiveOnly] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [sortState, setSortState] = useState<SortState<AdminProjectSortKey>>({ key: null, direction: null })
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadProjects = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('로그인이 필요합니다.')

      const response = await fetch('/api/admin/projects', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const result = (await response.json()) as ProjectsApiResponse

      if (!response.ok || !result.success) {
        throw new Error(!result.success ? result.error || '프로젝트 현황을 불러오지 못했습니다.' : '프로젝트 현황을 불러오지 못했습니다.')
      }

      setProjects(result.projects)
      setStats(result.stats)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '프로젝트 현황을 불러오지 못했습니다.')
    } finally {
      setExpandedProjectId(null)
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadProjects()
  }, [loadProjects])

  useEffect(() => {
    setCurrentPage(1)
    setExpandedProjectId(null)
  }, [selectedHq, selectedBranch, searchTerm, activeOnly])

  const hqOptions = useMemo(
    () => Array.from(new Set(projects.map((project) => project.managing_hq))).sort((a, b) => a.localeCompare(b, 'ko')),
    [projects]
  )

  const branchOptions = useMemo(() => {
    const relevantProjects = selectedHq
      ? projects.filter((project) => project.managing_hq === selectedHq)
      : projects

    return Array.from(new Set(relevantProjects.map((project) => project.managing_branch)))
      .sort((a, b) => a.localeCompare(b, 'ko'))
  }, [projects, selectedHq])

  const filteredProjects = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLocaleLowerCase('ko-KR')

    return projects.filter((project) => {
      if (selectedHq && project.managing_hq !== selectedHq) return false
      if (selectedBranch && project.managing_branch !== selectedBranch) return false
      if (activeOnly && !project.isActive) return false
      if (!normalizedSearch) return true

      return (
        project.project_name.toLocaleLowerCase('ko-KR').includes(normalizedSearch) ||
        (project.creator?.fullName.toLocaleLowerCase('ko-KR').includes(normalizedSearch) ?? false)
      )
    })
  }, [activeOnly, projects, searchTerm, selectedBranch, selectedHq])

  const sortedProjects = useMemo(
    () => sortRows(filteredProjects, sortState, getAdminProjectSortValue),
    [filteredProjects, sortState]
  )

  const totalPages = Math.max(1, Math.ceil(sortedProjects.length / PAGE_SIZE))
  const visiblePage = Math.min(currentPage, totalPages)
  const pageProjects = sortedProjects.slice(
    (visiblePage - 1) * PAGE_SIZE,
    visiblePage * PAGE_SIZE
  )
  const firstVisible = sortedProjects.length === 0 ? 0 : (visiblePage - 1) * PAGE_SIZE + 1
  const lastVisible = Math.min(visiblePage * PAGE_SIZE, sortedProjects.length)

  const projectCreatedAts = useMemo(() => projects.map((project) => project.created_at), [projects])

  const hqSummary = useMemo(
    () => Object.entries(stats.byHq).sort(([nameA, countA], [nameB, countB]) => (
      countB - countA || nameA.localeCompare(nameB, 'ko')
    )),
    [stats.byHq]
  )

  const resetListPosition = () => {
    setCurrentPage(1)
    setExpandedProjectId(null)
  }

  const handleSort = (key: AdminProjectSortKey) => {
    setSortState((current) => nextSortState(current, key))
    resetListPosition()
  }

  const handleMobileSortChange = (state: SortState<AdminProjectSortKey>) => {
    setSortState(state)
    resetListPosition()
  }

  const goToPage = (page: number) => {
    setCurrentPage(page)
    setExpandedProjectId(null)
  }

  const handleDelete = async (project: AdminProject) => {
    const confirmed = window.confirm(`“${project.project_name}” 프로젝트를 삭제하시겠습니까?\n관련 등록 자료와 사진도 함께 삭제됩니다.`)
    if (!confirmed) return

    setDeletingId(project.id)
    setError(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('로그인이 필요합니다.')

      const response = await fetch(`/api/projects/${project.id}/delete`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const result = (await response.json()) as DeleteApiResponse

      if (!response.ok || !result.success) {
        throw new Error(!result.success ? result.error || '프로젝트를 삭제하지 못했습니다.' : '프로젝트를 삭제하지 못했습니다.')
      }

      await loadProjects()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '프로젝트를 삭제하지 못했습니다.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold tracking-[0.18em] text-blue-600">PROJECT CONTROL</p>
          <h2 className="mt-1 text-xl font-bold text-slate-950 md:text-2xl">프로젝트 등록 현황</h2>
          <p className="mt-1 text-sm text-slate-500">전체 프로젝트의 등록 정보와 활성 상태를 관리합니다.</p>
        </div>
        <button
          type="button"
          onClick={() => void loadProjects()}
          disabled={loading}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 outline-none transition hover:border-slate-300 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          새로고침
        </button>
      </div>

      <ProjectSummaryCards stats={stats} />

      <MonthlyProjectChart createdAts={projectCreatedAts} loading={loading} />

      <HqSummaryPills
        summary={hqSummary}
        selectedHq={selectedHq}
        onSelect={(hq) => {
          setSelectedHq(selectedHq === hq ? '' : hq)
          setSelectedBranch('')
        }}
      />

      <ProjectFilterPanel
        hqOptions={hqOptions}
        branchOptions={branchOptions}
        selectedHq={selectedHq}
        selectedBranch={selectedBranch}
        searchTerm={searchTerm}
        activeOnly={activeOnly}
        onHqChange={(value) => {
          setSelectedHq(value)
          setSelectedBranch('')
        }}
        onBranchChange={setSelectedBranch}
        onSearchChange={setSearchTerm}
        onActiveOnlyChange={setActiveOnly}
      />

      <MobileSortControls
        options={ADMIN_PROJECT_SORT_OPTIONS}
        sortState={sortState}
        onChange={handleMobileSortChange}
      />

      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" role="alert">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void loadProjects()}
            className="shrink-0 rounded-lg px-1 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-red-400"
          >
            다시 시도
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-600 shadow-sm md:px-4">
        <span className="tabular-nums">검색 결과 {sortedProjects.length.toLocaleString('ko-KR')}건</span>
        <span className="tabular-nums">
          {firstVisible.toLocaleString('ko-KR')}–{lastVisible.toLocaleString('ko-KR')}건 표시
        </span>
      </div>

      <ProjectsMobileList
        projects={pageProjects}
        loading={loading}
        expandedProjectId={expandedProjectId}
        onToggle={(id) => setExpandedProjectId((current) => (current === id ? null : id))}
        deletingId={deletingId}
        onDelete={(project) => void handleDelete(project)}
      />

      <ProjectsTable
        projects={pageProjects}
        loading={loading}
        sortState={sortState}
        onSort={handleSort}
        deletingId={deletingId}
        onDelete={(project) => void handleDelete(project)}
      />

      <PaginationBar
        visiblePage={visiblePage}
        totalPages={totalPages}
        loading={loading}
        onPrev={() => goToPage(Math.max(1, visiblePage - 1))}
        onNext={() => goToPage(Math.min(totalPages, visiblePage + 1))}
      />
    </section>
  )
}
