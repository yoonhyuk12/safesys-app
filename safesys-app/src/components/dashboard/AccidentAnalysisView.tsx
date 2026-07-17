'use client'
// 사고 이력과 3종 안전점검의 통계적 연관성을 조회하고 본부급 사용자에게 사고 관리를 제공하는 화면.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  CalendarDays,
  Edit,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import AccidentEntryModal from '@/components/dashboard/AccidentEntryModal'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import type { Project } from '@/lib/projects'
import type { UserProfile } from '@/lib/supabase'
import {
  ACCIDENT_SEVERITY_OPTIONS,
  ACCIDENT_TYPE_OPTIONS,
  calculateAccidentAnalysis,
  createProjectAccident,
  deleteProjectAccident,
  getAccidentAnalysisData,
  updateProjectAccident,
  type AccidentFormInput,
  type NormalizedSafetyInspection,
  type ProjectAccident,
} from '@/lib/accident-analysis'

interface AccidentAnalysisViewProps {
  projects: Project[]
  userProfile: UserProfile | null
  canManageAccidents: boolean
  initialBranch: string | null
  onBack: () => void
}

const selectClassName = 'w-full rounded-md border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200'
const filterLabelClassName = 'mb-1 block text-xs font-medium text-gray-600'

const severityOptions = ACCIDENT_SEVERITY_OPTIONS
const accidentTypeOptions = ACCIDENT_TYPE_OPTIONS
const SHOW_PROJECT_SUMMARY = false

const formatInputDate = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const defaultDateRange = (): { startDate: string; endDate: string } => {
  const end = new Date()
  const start = new Date(end.getFullYear(), end.getMonth() - 11, 1)
  return { startDate: formatInputDate(start), endDate: formatInputDate(end) }
}

const formatDate = (value?: string | null): string =>
  value ? new Date(value).toLocaleDateString('ko-KR') : '-'

const formatDateTime = (value?: string | null): string =>
  value ? new Date(value).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }) : '-'

const formatRate = (value: number): string => `${value.toFixed(1)}%`

const severityBadgeClass = (severity: string): string => {
  if (severity === 'fatal') return 'bg-gray-900 text-white'
  if (severity === 'serious') return 'bg-red-100 text-red-800'
  if (severity === 'lost_time') return 'bg-orange-100 text-orange-800'
  return 'bg-yellow-100 text-yellow-800'
}

const severityLabel = (severity: string): string =>
  severityOptions.find((option) => option.value === severity)?.label ?? severity

export default function AccidentAnalysisView({
  projects,
  userProfile,
  canManageAccidents,
  initialBranch,
  onBack,
}: AccidentAnalysisViewProps) {
  const initialRange = useMemo(defaultDateRange, [])
  const initialHq = useMemo(
    () => projects.find((project) => project.managing_branch === initialBranch)?.managing_hq ?? '',
    [initialBranch, projects],
  )
  const [startDate, setStartDate] = useState(initialRange.startDate)
  const [endDate, setEndDate] = useState(initialRange.endDate)
  const [selectedHq, setSelectedHq] = useState(initialHq)
  const [selectedBranch, setSelectedBranch] = useState(initialBranch ?? '')
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [selectedAccidentType, setSelectedAccidentType] = useState('')
  const [selectedSeverity, setSelectedSeverity] = useState('')
  const [accidents, setAccidents] = useState<ProjectAccident[]>([])
  const [inspections, setInspections] = useState<NormalizedSafetyInspection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingAccident, setEditingAccident] = useState<ProjectAccident | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const requestSequence = useRef(0)

  const projectIds = useMemo(() => projects.map((project) => project.id), [projects])

  const loadData = useCallback(async () => {
    const requestId = ++requestSequence.current
    if (projectIds.length === 0) {
      setAccidents([])
      setInspections([])
      setLoading(false)
      setError('')
      return
    }
    if (!startDate || !endDate || startDate > endDate) {
      setLoading(false)
      setError('조회 시작일은 종료일보다 늦을 수 없습니다.')
      return
    }

    setLoading(true)
    setError('')
    const result = await getAccidentAnalysisData(projectIds, startDate, endDate)
    if (requestSequence.current !== requestId) return

    if (!result.success) {
      setAccidents([])
      setInspections([])
      setError(result.error || '사고 통계 분석 데이터를 불러오지 못했습니다.')
    } else {
      setAccidents(result.accidents ?? [])
      setInspections(result.inspections ?? [])
    }
    setLoading(false)
  }, [endDate, projectIds, startDate])

  useEffect(() => {
    void loadData()
    return () => {
      requestSequence.current += 1
    }
  }, [loadData])

  useEffect(() => {
    if (!initialBranch) return
    const hq = projects.find((project) => project.managing_branch === initialBranch)?.managing_hq ?? ''
    setSelectedHq(hq)
    setSelectedBranch(initialBranch)
    setSelectedProjectId('')
  }, [initialBranch, projects])

  const hqOptions = useMemo(
    () => Array.from(new Set(projects.map((project) => project.managing_hq).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ko')),
    [projects],
  )

  const branchOptions = useMemo(
    () => Array.from(new Set(
      projects
        .filter((project) => !selectedHq || project.managing_hq === selectedHq)
        .map((project) => project.managing_branch)
        .filter(Boolean),
    )).sort((a, b) => a.localeCompare(b, 'ko')),
    [projects, selectedHq],
  )

  const organizationProjects = useMemo(
    () => projects.filter((project) =>
      (!selectedHq || project.managing_hq === selectedHq) &&
      (!selectedBranch || project.managing_branch === selectedBranch)
    ),
    [projects, selectedBranch, selectedHq],
  )

  const filteredProjects = useMemo(
    () => organizationProjects.filter((project) => !selectedProjectId || project.id === selectedProjectId),
    [organizationProjects, selectedProjectId],
  )

  const filteredProjectIds = useMemo(() => new Set(filteredProjects.map((project) => project.id)), [filteredProjects])

  const filteredAccidents = useMemo(
    () => accidents.filter((accident) =>
      filteredProjectIds.has(accident.project_id) &&
      (!selectedAccidentType || accident.accident_type === selectedAccidentType) &&
      (!selectedSeverity || accident.severity === selectedSeverity)
    ),
    [accidents, filteredProjectIds, selectedAccidentType, selectedSeverity],
  )

  const filteredInspections = useMemo(
    () => inspections.filter((inspection) => filteredProjectIds.has(inspection.project_id)),
    [filteredProjectIds, inspections],
  )

  const analysis = useMemo(
    () => calculateAccidentAnalysis(filteredProjects, filteredAccidents, filteredInspections, startDate, endDate),
    [endDate, filteredAccidents, filteredInspections, filteredProjects, startDate],
  )

  const projectMap = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  )

  const managementProjects = useMemo(
    () => organizationProjects.filter((project) => !selectedProjectId || project.id === selectedProjectId),
    [organizationProjects, selectedProjectId],
  )

  const maxMonthlyInspection = Math.max(1, ...analysis.monthlyTrend.map((item) => item.inspectionCount))
  const maxMonthlyAccident = Math.max(1, ...analysis.monthlyTrend.map((item) => item.accidentCount))

  const openCreateModal = () => {
    setEditingAccident(null)
    setActionError('')
    setIsModalOpen(true)
  }

  const openEditModal = (accident: ProjectAccident) => {
    setEditingAccident(accident)
    setActionError('')
    setIsModalOpen(true)
  }

  const closeModal = () => {
    if (submitting) return
    setIsModalOpen(false)
    setEditingAccident(null)
    setActionError('')
  }

  const handleSubmit = async (input: AccidentFormInput) => {
    if (!userProfile || !canManageAccidents) {
      setActionError('사고 이력을 관리할 권한이 없습니다.')
      return
    }
    setSubmitting(true)
    setActionError('')
    try {
      const result = editingAccident
        ? await updateProjectAccident(editingAccident.id, input)
        : await createProjectAccident(input, userProfile.id)
      if (!result.success) {
        setActionError(result.error || '사고 이력을 저장하지 못했습니다.')
        return
      }
      setIsModalOpen(false)
      setEditingAccident(null)
      await loadData()
    } catch (caught) {
      console.error('사고 이력 저장 실패', caught)
      setActionError('사고 이력을 저장하는 중 오류가 발생했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (accident: ProjectAccident) => {
    if (!canManageAccidents || deletingId) return
    const projectName = projectMap.get(accident.project_id)?.project_name ?? '선택한 프로젝트'
    if (!window.confirm(`${projectName}의 ${formatDate(accident.accident_at)} 사고 이력을 삭제하시겠습니까?`)) return

    setDeletingId(accident.id)
    setActionError('')
    try {
      const result = await deleteProjectAccident(accident.id)
      if (!result.success) {
        setActionError(result.error || '사고 이력을 삭제하지 못했습니다.')
        return
      }
      await loadData()
    } catch (caught) {
      console.error('사고 이력 삭제 실패', caught)
      setActionError('사고 이력을 삭제하는 중 오류가 발생했습니다.')
    } finally {
      setDeletingId(null)
    }
  }

  const resetFilters = () => {
    const range = defaultDateRange()
    setStartDate(range.startDate)
    setEndDate(range.endDate)
    setSelectedHq(initialHq)
    setSelectedBranch(initialBranch ?? '')
    setSelectedProjectId('')
    setSelectedAccidentType('')
    setSelectedSeverity('')
  }

  const renderRelation = (sectionId: string, title: string, rows: typeof analysis.relation30Days) => {
    const maxRate = Math.max(1, ...rows.map((row) => row.accidentOccurrenceRate))
    return (
      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm" aria-labelledby={sectionId}>
        <h3 id={sectionId} className="text-sm font-semibold text-gray-900">{title}</h3>
        <p className="mt-1 text-xs leading-5 text-gray-500">
          점검 건수 구간별 사고발생 프로젝트-월 비율입니다. 막대 길이는 구간 중 가장 높은 사고발생률을 기준으로 한 상대 길이입니다.
        </p>
        <div className="mt-4 space-y-3">
          {rows.map((row) => (
            <div key={row.key}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="font-medium text-gray-700">{row.label}</span>
                <span className="tabular-nums text-gray-600">{formatRate(row.accidentOccurrenceRate)}</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-indigo-50" aria-label={`${row.label} 사고발생률 ${formatRate(row.accidentOccurrenceRate)}`}>
                <div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.max(0, row.accidentOccurrenceRate / maxRate * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="px-2 py-2 text-left font-medium">점검 건수</th>
                <th className="px-2 py-2 text-right font-medium">프로젝트-월</th>
                <th className="px-2 py-2 text-right font-medium">사고발생 월</th>
                <th className="px-2 py-2 text-right font-medium">사고 건수</th>
                <th className="px-2 py-2 text-right font-medium">발생률</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => (
                <tr key={row.key}>
                  <td className="px-2 py-2 font-medium text-gray-700">{row.label}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-gray-600">{row.projectMonthCount.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-gray-600">{row.accidentProjectMonthCount.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-gray-600">{row.accidentCount.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right font-medium tabular-nums text-indigo-700">{formatRate(row.accidentOccurrenceRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    )
  }

  const kpiItems = [
    { key: 'projects', label: '관측 프로젝트', value: `${analysis.kpis.observedProjectCount.toLocaleString()}개` },
    { key: 'accidents', label: '사고', value: `${analysis.kpis.accidentCount.toLocaleString()}건` },
    { key: 'injured', label: '부상자', value: `${analysis.kpis.injuredCount.toLocaleString()}명` },
    { key: 'fatal', label: '사망자', value: `${analysis.kpis.fatalCount.toLocaleString()}명` },
    { key: 'inspections', label: '안전점검', value: `${analysis.kpis.inspectionCount.toLocaleString()}건` },
    { key: 'latest', label: '마지막 사고일', value: formatDate(analysis.kpis.latestAccidentAt) },
  ]

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <button type="button" onClick={onBack} aria-label="안전현황으로 돌아가기" className="rounded-md bg-indigo-600 p-2 text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
                <BarChart3 className="h-5 w-5 text-indigo-600" />
                사고 통계 분석
              </h2>
              <p className="mt-1 text-sm text-gray-500">정기·관리자·본부불시점검과 실제 사고 이력의 통계적 관계를 확인합니다.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end lg:self-auto">
            <button type="button" onClick={() => void loadData()} disabled={loading} className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              새로고침
            </button>
            {canManageAccidents && (
              <button type="button" onClick={openCreateModal} disabled={managementProjects.length === 0} className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">
                <Plus className="h-4 w-4" />
                사고 입력
              </button>
            )}
          </div>
        </div>
      </div>

      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm" aria-labelledby="accident-filter-title">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 id="accident-filter-title" className="text-sm font-semibold text-gray-900">분석 필터</h3>
          <button type="button" onClick={resetFilters} className="text-xs font-medium text-indigo-600 hover:text-indigo-800">최근 12개월로 초기화</button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <div>
            <label htmlFor="analysis-start-date" className={filterLabelClassName}>시작일</label>
            <input id="analysis-start-date" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className={selectClassName} />
          </div>
          <div>
            <label htmlFor="analysis-end-date" className={filterLabelClassName}>종료일</label>
            <input id="analysis-end-date" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className={selectClassName} />
          </div>
          <div>
            <label htmlFor="analysis-hq" className={filterLabelClassName}>본부</label>
            <select id="analysis-hq" value={selectedHq} onChange={(event) => { setSelectedHq(event.target.value); setSelectedBranch(''); setSelectedProjectId('') }} className={selectClassName}>
              <option value="">전체 본부</option>
              {hqOptions.map((hq) => <option key={hq} value={hq}>{hq}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="analysis-branch" className={filterLabelClassName}>지사</label>
            <select id="analysis-branch" value={selectedBranch} onChange={(event) => { setSelectedBranch(event.target.value); setSelectedProjectId('') }} className={selectClassName}>
              <option value="">전체 지사</option>
              {branchOptions.map((branch) => <option key={branch} value={branch}>{branch}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="analysis-project" className={filterLabelClassName}>프로젝트</label>
            <select id="analysis-project" value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)} className={selectClassName}>
              <option value="">전체 프로젝트</option>
              {organizationProjects.map((project) => <option key={project.id} value={project.id}>{project.project_name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="analysis-accident-type" className={filterLabelClassName}>사고 유형</label>
            <select id="analysis-accident-type" value={selectedAccidentType} onChange={(event) => setSelectedAccidentType(event.target.value)} className={selectClassName}>
              <option value="">전체 유형</option>
              {accidentTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="analysis-severity" className={filterLabelClassName}>중대도</label>
            <select id="analysis-severity" value={selectedSeverity} onChange={(event) => setSelectedSeverity(event.target.value)} className={selectClassName}>
              <option value="">전체 중대도</option>
              {severityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
        </div>
      </section>

      <div className="grid gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 sm:grid-cols-[auto_1fr]" role="note">
        <TriangleAlert className="mt-0.5 h-5 w-5" />
        <div>
          <p className="font-semibold">해석 시 주의사항</p>
          <p className="mt-1 text-xs leading-5">이 화면은 관찰자료의 연관성을 보여주며 인과관계를 증명하지 않습니다. 사고 미등록 월은 0건으로 계산하므로 신고 누락이 있으면 결과가 달라질 수 있습니다.</p>
        </div>
      </div>

      {actionError && !isModalOpen && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {loading ? (
        <div className="flex min-h-72 items-center justify-center rounded-lg border border-gray-200 bg-white"><LoadingSpinner /></div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-8 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-red-500" />
          <p className="mt-3 text-sm font-medium text-red-700">{error}</p>
          <button type="button" onClick={() => void loadData()} className="mt-4 rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50">다시 시도</button>
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">선택한 조건에 해당하는 프로젝트가 없습니다.</div>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-6" aria-label="사고 분석 핵심 지표">
            {kpiItems.map((item) => (
              <div key={item.key} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-medium text-gray-500">{item.label}</p>
                <p className="mt-2 text-lg font-semibold tabular-nums text-gray-900">{item.value}</p>
              </div>
            ))}
          </section>

          <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
            총 {analysis.kpis.projectMonthCount.toLocaleString()} 프로젝트-월을 관측했고, 100 프로젝트-월당 사고는 <strong>{analysis.kpis.accidentsPer100ProjectMonths.toFixed(2)}건</strong>입니다.
          </div>

          {analysis.sampleSize.isInsufficient && (
            <div className="flex items-start gap-2 rounded-lg border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800" role="status">
              <TriangleAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span><strong>표본 부족.</strong> {analysis.sampleSize.message}</span>
            </div>
          )}

          <div className="grid gap-4 xl:grid-cols-2">
            {renderRelation('accident-relation-30-title', '사고 전 30일 점검과 사고발생', analysis.relation30Days)}
            {renderRelation('accident-relation-90-title', '사고 전 90일 점검과 사고발생', analysis.relation90Days)}
          </div>

          <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm" aria-labelledby="monthly-trend-title">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 id="monthly-trend-title" className="text-sm font-semibold text-gray-900">월별 점검·사고 추이</h3>
                <p className="mt-1 text-xs text-gray-500">막대 길이는 각 항목의 기간 내 최댓값을 기준으로 표시합니다.</p>
              </div>
              <div className="flex gap-3 text-xs text-gray-500">
                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-teal-500" />점검</span>
                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-red-500" />사고</span>
              </div>
            </div>
            <div className="mt-4 overflow-x-auto">
              <div className="min-w-[680px] space-y-2">
                {analysis.monthlyTrend.map((item) => (
                  <div key={item.month} className="grid grid-cols-[72px_1fr_50px_1fr_50px] items-center gap-2 text-xs">
                    <span className="font-medium text-gray-600">{item.month}</span>
                    <div className="h-3 overflow-hidden rounded-full bg-teal-50"><div className="h-full rounded-full bg-teal-500" style={{ width: `${item.inspectionCount / maxMonthlyInspection * 100}%` }} /></div>
                    <span className="text-right tabular-nums text-gray-600">{item.inspectionCount}건</span>
                    <div className="h-3 overflow-hidden rounded-full bg-red-50"><div className="h-full rounded-full bg-red-500" style={{ width: `${item.accidentCount / maxMonthlyAccident * 100}%` }} /></div>
                    <span className="text-right tabular-nums text-gray-600">{item.accidentCount}건</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {SHOW_PROJECT_SUMMARY && (
            <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm" aria-labelledby="project-summary-title">
              <div className="border-b border-gray-200 px-4 py-3">
                <h3 id="project-summary-title" className="text-sm font-semibold text-gray-900">프로젝트별 요약</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[940px] text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500">
                    <tr>
                      <th className="px-3 py-3 text-left font-medium">프로젝트</th>
                      <th className="px-3 py-3 text-center font-medium">본부·지사</th>
                      <th className="px-3 py-3 text-right font-medium">점검</th>
                      <th className="px-3 py-3 text-right font-medium">서명 완료율</th>
                      <th className="px-3 py-3 text-right font-medium">지적</th>
                      <th className="px-3 py-3 text-right font-medium">미조치</th>
                      <th className="px-3 py-3 text-right font-medium">사고</th>
                      <th className="px-3 py-3 text-right font-medium">부상·사망</th>
                      <th className="px-3 py-3 text-center font-medium">최근 사고일</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {analysis.projectSummaries.map((summary) => (
                      <tr key={summary.projectId}>
                        <td className="px-3 py-3 font-medium text-gray-900">{summary.projectName}</td>
                        <td className="px-3 py-3 text-center text-gray-600">{summary.managingHq} · {summary.managingBranch}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{summary.inspectionCount.toLocaleString()}건</td>
                        <td className="px-3 py-3 text-right tabular-nums">{formatRate(summary.signatureCompletionRate)}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{summary.findingCount.toLocaleString()}건</td>
                        <td className="px-3 py-3 text-right tabular-nums text-red-600">{summary.unresolvedCount.toLocaleString()}건</td>
                        <td className="px-3 py-3 text-right font-medium tabular-nums text-indigo-700">{summary.accidentCount.toLocaleString()}건</td>
                        <td className="px-3 py-3 text-right tabular-nums">{summary.injuredCount.toLocaleString()}명 · {summary.fatalCount.toLocaleString()}명</td>
                        <td className="px-3 py-3 text-center text-gray-600">{formatDate(summary.latestAccidentAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm" aria-labelledby="accident-history-title">
            <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
              <div>
                <h3 id="accident-history-title" className="text-sm font-semibold text-gray-900">사고 이력</h3>
                <p className="mt-1 text-xs text-gray-500">사고 전 점검 횟수와 가장 최근 점검 내용을 함께 표시합니다.</p>
              </div>
              <span className="text-xs text-gray-500">{analysis.accidentDetails.length.toLocaleString()}건</span>
            </div>
            {analysis.accidentDetails.length === 0 ? (
              <div className="p-10 text-center">
                <CalendarDays className="mx-auto h-8 w-8 text-gray-300" />
                <p className="mt-3 text-sm text-gray-500">선택한 조건에 등록된 사고 이력이 없습니다.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1180px] text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500">
                    <tr>
                      <th className="px-3 py-3 text-left font-medium">프로젝트</th>
                      <th className="px-3 py-3 text-center font-medium">사고 일시</th>
                      <th className="px-3 py-3 text-center font-medium">중대도·유형</th>
                      <th className="px-3 py-3 text-left font-medium">사고 개요</th>
                      <th className="px-3 py-3 text-right font-medium">30일 점검</th>
                      <th className="px-3 py-3 text-right font-medium">90일 점검</th>
                      <th className="px-3 py-3 text-left font-medium">최근 점검</th>
                      {canManageAccidents && <th className="px-3 py-3 text-center font-medium">관리</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {analysis.accidentDetails.map((detail) => {
                      const accident = detail.accident
                      const project = projectMap.get(accident.project_id)
                      return (
                        <tr key={accident.id} className="align-top">
                          <td className="px-3 py-3">
                            <p className="font-medium text-gray-900">{project?.project_name ?? '프로젝트 미상'}</p>
                            <p className="mt-1 text-xs text-gray-500">{project?.managing_hq} · {project?.managing_branch}</p>
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-center text-gray-600">{formatDateTime(accident.accident_at)}</td>
                          <td className="px-3 py-3 text-center">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${severityBadgeClass(accident.severity)}`}>{severityLabel(accident.severity)}</span>
                            <p className="mt-1 text-xs text-gray-600">{accident.accident_type}</p>
                          </td>
                          <td className="max-w-sm px-3 py-3 text-gray-700">
                            <p className="line-clamp-3 whitespace-pre-line">{accident.description}</p>
                            <details className="mt-2 rounded-md bg-gray-50 px-2.5 py-2 text-xs">
                              <summary className="cursor-pointer font-medium text-indigo-700">장소·작업·원인·재발방지 대책 보기</summary>
                              <dl className="mt-2 space-y-2 text-gray-600">
                                <div>
                                  <dt className="font-medium text-gray-700">사고 장소</dt>
                                  <dd className="mt-0.5 whitespace-pre-wrap break-words">{accident.location}</dd>
                                </div>
                                <div>
                                  <dt className="font-medium text-gray-700">사고 당시 작업</dt>
                                  <dd className="mt-0.5 whitespace-pre-wrap break-words">{accident.work_description}</dd>
                                </div>
                                <div>
                                  <dt className="font-medium text-gray-700">사고 원인</dt>
                                  <dd className="mt-0.5 whitespace-pre-wrap break-words">{accident.cause}</dd>
                                </div>
                                <div>
                                  <dt className="font-medium text-gray-700">재발방지 대책</dt>
                                  <dd className="mt-0.5 whitespace-pre-wrap break-words">{accident.prevention_action}</dd>
                                </div>
                              </dl>
                            </details>
                            {(accident.injured_count > 0 || accident.fatal_count > 0 || accident.lost_workdays > 0) && (
                              <p className="mt-1 text-xs text-gray-500">부상 {accident.injured_count}명 · 사망 {accident.fatal_count}명 · 휴업 {accident.lost_workdays}일</p>
                            )}
                          </td>
                          <td className="px-3 py-3 text-right font-medium tabular-nums text-indigo-700">{detail.prior30Count}건</td>
                          <td className="px-3 py-3 text-right font-medium tabular-nums text-indigo-700">{detail.prior90Count}건</td>
                          <td className="max-w-sm px-3 py-3 text-gray-600">
                            {detail.latestInspection ? (
                              <>
                                <p className="font-medium text-gray-700">{detail.latestInspection.source_label} · {formatDate(detail.latestInspection.inspected_at)}</p>
                                <p className="mt-1 line-clamp-2 text-xs">{detail.latestInspection.summary || '기록된 점검 내용 없음'}</p>
                              </>
                            ) : <span className="text-xs text-gray-400">사고 전 점검 이력 없음</span>}
                          </td>
                          {canManageAccidents && (
                            <td className="px-3 py-3 text-center">
                              <div className="inline-flex gap-1">
                                <button type="button" onClick={() => openEditModal(accident)} aria-label={`${project?.project_name ?? ''} 사고 이력 수정`} className="rounded-md p-2 text-indigo-600 hover:bg-indigo-50">
                                  <Edit className="h-4 w-4" />
                                </button>
                                <button type="button" onClick={() => void handleDelete(accident)} disabled={deletingId === accident.id} aria-label={`${project?.project_name ?? ''} 사고 이력 삭제`} className="rounded-md p-2 text-red-600 hover:bg-red-50 disabled:opacity-50">
                                  {deletingId === accident.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      <AccidentEntryModal
        isOpen={isModalOpen}
        projects={managementProjects}
        accident={editingAccident}
        submitting={submitting}
        submitError={actionError}
        onClose={closeModal}
        onSubmit={handleSubmit}
      />
    </div>
  )
}
