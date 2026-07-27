'use client'

// 프로젝트별 AI 작업계획서 목록 조회·수정·삭제와 작성 마법사 진입을 제공하는 페이지

import { Fragment, useCallback, useEffect, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Download, FileText, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import WorkPlanWizard from '@/components/work-plan/WorkPlanWizard'
import { supabase } from '@/lib/supabase'
import { downloadLoadingWorkPlanPdf } from '@/lib/reports/work-plan/work-plan-loading-pdf'
import { downloadConstructionWorkPlanPdf } from '@/lib/reports/work-plan/work-plan-construction-pdf'
import { downloadElectricWorkPlanPdf } from '@/lib/reports/work-plan/work-plan-electric-pdf'
import { downloadExcavationWorkPlanPdf } from '@/lib/reports/work-plan/work-plan-excavation-pdf'
import { downloadHeavyWorkPlanPdf } from '@/lib/reports/work-plan/work-plan-heavy-pdf'
import { downloadLoadingWorkPlanHwpx } from '@/lib/hwpx/work-plan/work-plan-loading-hwpx'
import { PLAN_TYPE_OPTIONS } from '@/lib/work-plan/constants'
import type { PlanType, WorkPlanProject, WorkPlanRecord, WorkPlanWorker } from '@/lib/work-plan/types'

const workPlanPdfDownloaders: Record<PlanType, (record: WorkPlanRecord) => Promise<void>> = {
  loading: downloadLoadingWorkPlanPdf,
  construction: downloadConstructionWorkPlanPdf,
  electric: downloadElectricWorkPlanPdf,
  heavy: downloadHeavyWorkPlanPdf,
  excavation: downloadExcavationWorkPlanPdf,
}

// 종류별 HWPX(한글) 다운로드 — 구현된 종류만 담고, 맵에 있는 종류만 버튼을 노출한다
const workPlanHwpxDownloaders: Partial<Record<PlanType, (record: WorkPlanRecord) => Promise<void>>> = {
  loading: downloadLoadingWorkPlanHwpx,
}

type WorkPlanDownloadFormat = 'pdf' | 'hwpx'

const planTypeName = (type: PlanType) =>
  PLAN_TYPE_OPTIONS.find((option) => option.value === type)?.shortTitle || type

const formatDate = (value: string | null) => {
  if (!value) return '-'
  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

const hasEnteredValue = (values: unknown[]) => values.some((value) => {
  if (typeof value === 'string') return value.trim().length > 0
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.length > 0
  return value != null
})

const hasRiggingValue = (review: NonNullable<WorkPlanRecord['form_data']['loading']>['riggingReview']) =>
  hasEnteredValue([
    review.tools,
    review.otherTool,
    review.diameterMm,
    review.lengthM,
    review.quantity,
    review.safeLoadPerToolTon,
    review.slingMethod,
    review.hookTool,
    review.hookDiameterInch,
    review.hookQuantity,
    review.hookSafeLoadTon,
    review.breakingLoadTon,
  ])

const hasDelayedInputPending = (record: WorkPlanRecord) => record.plan_types.some((type) => {
  if (type === 'loading') {
    const form = record.form_data.loading
    if (!form) return true
    return !hasEnteredValue(Object.values(form.equipment))
      || !hasEnteredValue([form.liftingReview.totalLoadTon, form.liftingReview.maxCapacityTon])
      || !hasRiggingValue(form.riggingReview)
  }

  if (type === 'construction') {
    const form = record.form_data.construction
    if (!form) return true
    return !hasEnteredValue(Object.values(form.equipment)) || !hasEnteredValue([form.operatorLicense])
  }

  if (type === 'electric') {
    const form = record.form_data.electric
    if (!form) return true
    return !form.workers.some((worker) => hasEnteredValue([worker.qualification]))
  }

  const form = record.form_data.heavy
  if (!form) return true
  return !hasEnteredValue(Object.values(form.machine))
    || !hasEnteredValue([form.load.dimensions, form.load.weightKg, form.load.transportWeightKg])
    || !hasEnteredValue([form.liftingReview.totalLoadTon, form.liftingReview.maxCapacityTon])
    || !hasRiggingValue(form.riggingReview)
})

export default function WorkPlanPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const params = useParams()
  const projectId = params.id as string

  const [project, setProject] = useState<WorkPlanProject | null>(null)
  const [workers, setWorkers] = useState<WorkPlanWorker[]>([])
  const [records, setRecords] = useState<WorkPlanRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showWizard, setShowWizard] = useState(false)
  const [editingRecord, setEditingRecord] = useState<WorkPlanRecord | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState('')

  const loadData = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    setError('')
    try {
      const [projectResult, workerResult, recordResult] = await Promise.all([
        supabase
          .from('projects')
          .select('id, project_name, actual_work_address, site_address, managing_hq, managing_branch, supervisor_position, supervisor_name, supervisor_phone, g2b_corp_nm, construction_start_date, construction_end_date, construction_schedule, latitude, longitude, created_by')
          .eq('id', projectId)
          .single(),
        supabase
          .from('workers')
          .select('id, name, phone')
          .eq('project_id', projectId)
          .order('name', { ascending: true }),
        supabase
          .from('work_plans')
          .select('*')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false }),
      ])

      if (projectResult.error) throw new Error(projectResult.error.message)
      if (workerResult.error) console.error('작업계획서 근로자 후보 조회 실패:', workerResult.error)
      if (recordResult.error) throw new Error(recordResult.error.message)

      // 프로젝트 소유자(created_by) 성명·연락처·회사를 기본값으로 인입
      const projectData = projectResult.data as WorkPlanProject & { created_by?: string | null }
      let ownerName: string | null = null
      let ownerPhone: string | null = null
      let ownerCompany: string | null = null
      if (projectData.created_by) {
        const { data: ownerProfile, error: ownerError } = await supabase
          .from('user_profiles')
          .select('full_name, phone_number, company_name')
          .eq('id', projectData.created_by)
          .maybeSingle()
        if (ownerError) console.error('작업계획서 프로젝트 소유자 조회 실패:', ownerError)
        else if (ownerProfile) {
          ownerName = ownerProfile.full_name || null
          ownerPhone = ownerProfile.phone_number || null
          ownerCompany = ownerProfile.company_name || null
        }
      }

      setProject({
        ...projectData,
        owner_name: ownerName,
        owner_phone: ownerPhone,
        owner_company: ownerCompany,
      })
      setWorkers((workerResult.data || []) as WorkPlanWorker[])
      setRecords((recordResult.data || []) as WorkPlanRecord[])
    } catch (loadError: unknown) {
      console.error('작업계획서 데이터 조회 실패:', loadError)
      const message = loadError instanceof Error ? loadError.message : '데이터를 불러오지 못했습니다.'
      setError(message.includes('work_plans') ? '작업계획서 테이블이 준비되지 않았습니다. 데이터베이스 마이그레이션을 먼저 실행해주세요.' : message)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    if (user && projectId) loadData()
  }, [user, projectId, loadData])

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login')
  }, [authLoading, user, router])

  const handleBack = () => {
    const returnUrl = searchParams.get('returnUrl')
    if (returnUrl) {
      router.push(returnUrl)
      return
    }
    if (typeof window !== 'undefined') sessionStorage.setItem(`project_${projectId}_from_subpage`, 'true')
    router.push(`/project/${projectId}`)
  }

  const openNewWizard = () => {
    setEditingRecord(null)
    setShowWizard(true)
  }

  const openEditWizard = (record: WorkPlanRecord) => {
    setEditingRecord(record)
    setShowWizard(true)
  }

  const closeWizard = () => {
    setEditingRecord(null)
    setShowWizard(false)
  }

  const handleSaved = (savedRecord: WorkPlanRecord) => {
    setRecords((current) => current.some((record) => record.id === savedRecord.id)
      ? current.map((record) => record.id === savedRecord.id ? savedRecord : record)
      : [savedRecord, ...current])
  }

  const handleDownload = async (record: WorkPlanRecord, type: PlanType, format: WorkPlanDownloadFormat = 'pdf') => {
    if (downloadingKey) return

    const downloader = format === 'hwpx' ? workPlanHwpxDownloaders[type] : workPlanPdfDownloaders[type]
    if (!downloader) return

    const formatLabel = format === 'hwpx' ? 'HWPX' : 'PDF'
    const downloadKey = `${record.id}:${type}:${format}`
    setDownloadingKey(downloadKey)
    setDownloadError('')
    try {
      await downloader(record)
    } catch (downloadFailure: unknown) {
      console.error(`작업계획서 ${formatLabel} 다운로드 실패.`, { recordId: record.id, type, downloadFailure })
      const message = downloadFailure instanceof Error ? downloadFailure.message : `${formatLabel} 파일을 만들지 못했습니다.`
      setDownloadError(`${planTypeName(type)} ${formatLabel} 다운로드에 실패했습니다. ${message}`)
    } finally {
      setDownloadingKey(null)
    }
  }

  const handleDelete = async (record: WorkPlanRecord) => {
    if (!confirm(`「${record.title}」 작업계획서를 삭제하시겠습니까?`)) return
    setDeletingId(record.id)
    try {
      const { error: deleteError } = await supabase.from('work_plans').delete().eq('id', record.id)
      if (deleteError) throw new Error(deleteError.message)
      setRecords((current) => current.filter((item) => item.id !== record.id))
    } catch (deleteError: unknown) {
      const message = deleteError instanceof Error ? deleteError.message : '알 수 없는 오류'
      alert(`삭제 실패. ${message}`)
    } finally {
      setDeletingId(null)
    }
  }

  if (authLoading || loading) {
    return <div className="flex min-h-screen items-center justify-center"><LoadingSpinner /></div>
  }

  if (!user) return null

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-950 via-blue-900 to-slate-900">
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center px-4 sm:px-6 lg:px-8">
          <button onClick={handleBack} className="mr-3 rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="프로젝트로 돌아가기">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold text-gray-900 sm:text-xl">(AI) 작업계획서</h1>
            {project && <p className="truncate text-xs text-gray-500 sm:text-sm">{project.project_name}</p>}
          </div>
          {!showWizard && project && (
            <button onClick={openNewWizard} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 sm:px-4">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">새 작업계획서</span>
              <span className="sm:hidden">새 작성</span>
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-3 py-5 sm:px-6 lg:px-8">
        {error && (
          <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <p>{error}</p>
            <button type="button" onClick={loadData} className="mt-2 font-semibold text-amber-800 underline">다시 조회</button>
          </div>
        )}

        {downloadError && (
          <div role="alert" className="mb-4 flex items-start justify-between gap-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <p>{downloadError}</p>
            <button type="button" onClick={() => setDownloadError('')} className="shrink-0 font-semibold underline">닫기</button>
          </div>
        )}

        {showWizard && project ? (
          <WorkPlanWizard
            project={project}
            workers={workers}
            userId={user.id}
            initialRecord={editingRecord}
            onSaved={handleSaved}
            onClose={closeWizard}
          />
        ) : (
          <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-4 sm:px-6">
              <div>
                <h2 className="font-bold text-gray-900">작성된 작업계획서</h2>
                <p className="text-xs text-gray-500">총 {records.length}건</p>
              </div>
            </div>

            {records.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-16 text-center">
                <FileText className="h-14 w-14 text-gray-300" />
                <p className="mt-4 font-medium text-gray-700">아직 작성된 작업계획서가 없습니다.</p>
                <p className="mt-1 text-sm text-gray-500">프로젝트 정보와 등록 근로자를 불러와 빠르게 작성할 수 있습니다.</p>
                {project && (
                  <button onClick={openNewWizard} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
                    <Plus className="h-4 w-4" />첫 작업계획서 작성
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-600">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold sm:px-6">작업명(장소)</th>
                      <th className="px-4 py-3 text-left font-semibold">서류 종류</th>
                      <th className="px-4 py-3 text-left font-semibold">작업기간</th>
                      <th className="px-4 py-3 text-left font-semibold">작성일</th>
                      <th className="px-4 py-3 text-center font-semibold">PDF</th>
                      <th className="px-4 py-3 text-center font-semibold">관리</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {records.map((record) => (
                      <tr key={record.id} className="hover:bg-blue-50/50">
                        <td className="max-w-sm px-4 py-3 font-medium text-gray-900 sm:px-6">
                          <span className="line-clamp-2">{record.title}</span>
                          {hasDelayedInputPending(record) && <span className="mt-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">입력 대기</span>}
                        </td>
                        <td className="px-4 py-3"><div className="flex flex-wrap gap-1">{record.plan_types.map((type) => <span key={type} className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">{planTypeName(type)}</span>)}</div></td>
                        <td className="whitespace-nowrap px-4 py-3 text-gray-600">{formatDate(record.work_start_date)} ~ {formatDate(record.work_end_date)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-gray-600">{formatDate(record.created_at)}</td>
                        <td className="px-4 py-3 text-center">
                          <div className="inline-flex flex-wrap justify-center gap-1">
                            {record.plan_types.map((type) => {
                              const pdfKey = `${record.id}:${type}:pdf`
                              const isDownloading = downloadingKey === pdfKey
                              const hwpxKey = `${record.id}:${type}:hwpx`
                              const isHwpxDownloading = downloadingKey === hwpxKey
                              return (
                                <Fragment key={type}>
                                  <button
                                    type="button"
                                    disabled={downloadingKey !== null}
                                    onClick={() => handleDownload(record, type)}
                                    className="inline-flex items-center gap-1 rounded border border-blue-200 bg-white px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                                    aria-label={`${record.title} ${planTypeName(type)} PDF 다운로드`}
                                  >
                                    {isDownloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                                    {isDownloading ? '생성 중' : planTypeName(type)}
                                  </button>
                                  {workPlanHwpxDownloaders[type] && (
                                    <button
                                      type="button"
                                      disabled={downloadingKey !== null}
                                      onClick={() => handleDownload(record, type, 'hwpx')}
                                      className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-white px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                                      aria-label={`${record.title} ${planTypeName(type)} HWPX 다운로드`}
                                    >
                                      {isHwpxDownloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                                      {isHwpxDownloading ? '생성 중' : `${planTypeName(type)} 한글`}
                                    </button>
                                  )}
                                </Fragment>
                              )
                            })}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="inline-flex items-center gap-1">
                            <button type="button" onClick={() => openEditWizard(record)} className="rounded-lg p-2 text-blue-600 hover:bg-blue-50 hover:text-blue-800" aria-label={`${record.title} 수정`}><Pencil className="h-4 w-4" /></button>
                            <button type="button" disabled={deletingId === record.id} onClick={() => handleDelete(record)} className="rounded-lg p-2 text-red-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-40" aria-label={`${record.title} 삭제`}><Trash2 className="h-4 w-4" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  )
}
