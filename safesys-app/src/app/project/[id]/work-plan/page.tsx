'use client'

// 프로젝트별 AI 작업계획서 목록 조회·삭제와 새 작성 마법사 진입을 제공하는 페이지

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Download, FileText, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import WorkPlanWizard from '@/components/work-plan/WorkPlanWizard'
import { supabase } from '@/lib/supabase'
import { PLAN_TYPE_OPTIONS } from '@/lib/work-plan/constants'
import type { PlanType, WorkPlanProject, WorkPlanRecord, WorkPlanWorker } from '@/lib/work-plan/types'

const planTypeName = (type: PlanType) =>
  PLAN_TYPE_OPTIONS.find((option) => option.value === type)?.shortTitle || type

const formatDate = (value: string | null) => {
  if (!value) return '-'
  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

export default function WorkPlanPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const projectId = params.id as string

  const [project, setProject] = useState<WorkPlanProject | null>(null)
  const [workers, setWorkers] = useState<WorkPlanWorker[]>([])
  const [records, setRecords] = useState<WorkPlanRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showWizard, setShowWizard] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    setError('')
    try {
      const [projectResult, workerResult, recordResult] = await Promise.all([
        supabase
          .from('projects')
          .select('id, project_name, actual_work_address, site_address, managing_hq, managing_branch, supervisor_position, supervisor_name, supervisor_phone, g2b_corp_nm, construction_start_date, construction_end_date, construction_schedule, latitude, longitude')
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

      setProject(projectResult.data as WorkPlanProject)
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
    if (typeof window !== 'undefined') sessionStorage.setItem(`project_${projectId}_from_subpage`, 'true')
    router.push(`/project/${projectId}`)
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
            <h1 className="truncate text-lg font-bold text-gray-900 sm:text-xl">︵AI︶ 작업계획서</h1>
            {project && <p className="truncate text-xs text-gray-500 sm:text-sm">{project.project_name}</p>}
          </div>
          {!showWizard && project && (
            <button onClick={() => setShowWizard(true)} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 sm:px-4">
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

        {showWizard && project ? (
          <WorkPlanWizard project={project} workers={workers} onClose={() => setShowWizard(false)} />
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
                  <button onClick={() => setShowWizard(true)} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
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
                      <th className="px-4 py-3 text-center font-semibold">삭제</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {records.map((record) => (
                      <tr key={record.id} className="hover:bg-blue-50/50">
                        <td className="max-w-sm px-4 py-3 font-medium text-gray-900 sm:px-6"><span className="line-clamp-2">{record.title}</span></td>
                        <td className="px-4 py-3"><div className="flex flex-wrap gap-1">{record.plan_types.map((type) => <span key={type} className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">{planTypeName(type)}</span>)}</div></td>
                        <td className="whitespace-nowrap px-4 py-3 text-gray-600">{formatDate(record.work_start_date)} ~ {formatDate(record.work_end_date)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-gray-600">{formatDate(record.created_at)}</td>
                        <td className="px-4 py-3 text-center"><button type="button" disabled title="PDF 출력은 Phase 4에서 제공됩니다." className="inline-flex items-center gap-1 rounded border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-400"><Download className="h-3.5 w-3.5" />PDF</button></td>
                        <td className="px-4 py-3 text-center"><button type="button" disabled={deletingId === record.id} onClick={() => handleDelete(record)} className="rounded-lg p-2 text-red-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-40" aria-label={`${record.title} 삭제`}><Trash2 className="h-4 w-4" /></button></td>
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
