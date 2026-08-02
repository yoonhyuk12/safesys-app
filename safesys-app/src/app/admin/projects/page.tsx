'use client'
// 관리자가 프로젝트 등록 현황을 조회하고 필터링·삭제하는 화면

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

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

export default function AdminProjectsPage() {
  const [projects, setProjects] = useState<AdminProject[]>([])
  const [stats, setStats] = useState<ProjectStats>(EMPTY_STATS)
  const [selectedHq, setSelectedHq] = useState('')
  const [selectedBranch, setSelectedBranch] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [activeOnly, setActiveOnly] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
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
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadProjects()
  }, [loadProjects])

  useEffect(() => {
    setCurrentPage(1)
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

  const totalPages = Math.max(1, Math.ceil(filteredProjects.length / PAGE_SIZE))
  const visiblePage = Math.min(currentPage, totalPages)
  const pageProjects = filteredProjects.slice(
    (visiblePage - 1) * PAGE_SIZE,
    visiblePage * PAGE_SIZE
  )
  const firstVisible = filteredProjects.length === 0 ? 0 : (visiblePage - 1) * PAGE_SIZE + 1
  const lastVisible = Math.min(visiblePage * PAGE_SIZE, filteredProjects.length)

  const hqSummary = useMemo(
    () => Object.entries(stats.byHq).sort(([nameA, countA], [nameB, countB]) => (
      countB - countA || nameA.localeCompare(nameB, 'ko')
    )),
    [stats.byHq]
  )

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

  const statCards = [
    { label: '전체', value: stats.total },
    { label: '활성', value: stats.active },
    { label: '비활성', value: stats.inactive },
    { label: '최근 30일 등록', value: stats.recent30d },
  ]

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">프로젝트 등록 전체 현황</h2>
          <p className="mt-1 text-sm text-gray-500">전체 프로젝트의 등록 정보와 활성 상태를 관리합니다.</p>
        </div>
        <button
          type="button"
          onClick={() => void loadProjects()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          새로고침
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {statCards.map((card) => (
          <div key={card.label} className="rounded-md border border-gray-200 bg-white px-4 py-3">
            <p className="text-xs font-medium text-gray-500">{card.label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">{card.value.toLocaleString('ko-KR')}</p>
          </div>
        ))}
      </div>

      <div className="rounded-md border border-gray-200 bg-white px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-800">본부별 등록 현황</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {hqSummary.length > 0 ? hqSummary.map(([hq, count]) => (
            <button
              key={hq}
              type="button"
              onClick={() => {
                setSelectedHq(selectedHq === hq ? '' : hq)
                setSelectedBranch('')
              }}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                selectedHq === hq
                  ? 'border-gray-900 bg-gray-900 text-white'
                  : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100'
              }`}
            >
              {hq} {count.toLocaleString('ko-KR')}
            </button>
          )) : (
            <span className="text-xs text-gray-400">등록된 본부 정보가 없습니다.</span>
          )}
        </div>
      </div>

      <div className="rounded-md border border-gray-200 bg-white p-3">
        <div className="grid gap-2 md:grid-cols-[180px_180px_minmax(240px,1fr)_auto]">
          <select
            value={selectedHq}
            onChange={(event) => {
              setSelectedHq(event.target.value)
              setSelectedBranch('')
            }}
            aria-label="본부 필터"
            className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-800 outline-none focus:border-gray-500"
          >
            <option value="">전체 본부</option>
            {hqOptions.map((hq) => <option key={hq} value={hq}>{hq}</option>)}
          </select>

          <select
            value={selectedBranch}
            onChange={(event) => setSelectedBranch(event.target.value)}
            aria-label="지사 필터"
            className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-800 outline-none focus:border-gray-500"
          >
            <option value="">전체 지사</option>
            {branchOptions.map((branch) => <option key={branch} value={branch}>{branch}</option>)}
          </select>

          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" aria-hidden="true" />
            <span className="sr-only">프로젝트명 또는 등록자명 검색</span>
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="프로젝트명 또는 등록자명 검색"
              className="h-9 w-full rounded-md border border-gray-300 bg-white pl-9 pr-3 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:border-gray-500"
            />
          </label>

          <label className="flex h-9 items-center gap-2 whitespace-nowrap rounded-md border border-gray-300 px-3 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={activeOnly}
              onChange={(event) => setActiveOnly(event.target.checked)}
              className="h-4 w-4 accent-gray-900"
            />
            활성만
          </label>
        </div>
      </div>

      {error && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => void loadProjects()} className="shrink-0 font-semibold hover:underline">
            다시 시도
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2.5 text-xs text-gray-500">
          <span>검색 결과 {filteredProjects.length.toLocaleString('ko-KR')}건</span>
          <span>{firstVisible.toLocaleString('ko-KR')}–{lastVisible.toLocaleString('ko-KR')}건 표시</span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[900px] w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-600">
              <tr>
                <th className="px-4 py-2.5">프로젝트명</th>
                <th className="px-3 py-2.5">본부</th>
                <th className="px-3 py-2.5">지사</th>
                <th className="px-3 py-2.5">등록자</th>
                <th className="px-3 py-2.5">등록일</th>
                <th className="px-3 py-2.5 text-center">상태</th>
                <th className="px-4 py-2.5 text-right">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      프로젝트 현황을 불러오는 중입니다.
                    </span>
                  </td>
                </tr>
              ) : pageProjects.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                    조건에 맞는 프로젝트가 없습니다.
                  </td>
                </tr>
              ) : pageProjects.map((project) => (
                <tr key={project.id} className="text-gray-700 hover:bg-gray-50">
                  <td className="max-w-[320px] px-4 py-2.5">
                    <Link
                      href={`/project/${project.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex max-w-full items-center gap-1 font-medium text-gray-900 hover:underline"
                    >
                      <span className="truncate">{project.project_name}</span>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden="true" />
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">{project.managing_hq}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">{project.managing_branch}</td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-gray-800">{project.creator?.fullName || '등록자 정보 없음'}</div>
                    <div className="text-xs text-gray-500">{project.creator?.companyName || '-'}</div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-gray-600">{formatDate(project.created_at)}</td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                      project.isActive
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {project.isActive ? '활성' : '비활성'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => void handleDelete(project)}
                      disabled={deletingId !== null}
                      className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {deletingId === project.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        : <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}
                      {deletingId === project.id ? '삭제 중' : '삭제'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3 text-sm text-gray-600">
          <span>{visiblePage.toLocaleString('ko-KR')} / {totalPages.toLocaleString('ko-KR')} 페이지</span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setCurrentPage(Math.max(1, visiblePage - 1))}
              disabled={visiblePage <= 1 || loading}
              aria-label="이전 페이지"
              className="rounded-md border border-gray-300 p-1.5 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setCurrentPage(Math.min(totalPages, visiblePage + 1))}
              disabled={visiblePage >= totalPages || loading}
              aria-label="다음 페이지"
              className="rounded-md border border-gray-300 p-1.5 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
