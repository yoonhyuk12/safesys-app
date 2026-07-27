'use client'

// 프로젝트별 (AI) 수시 위험성평가서 목록 조회·다운로드·삭제와 작성 마법사 진입을 제공하는 페이지

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Download, FileText, Loader2, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import RiskAssessmentWizard from '@/components/project/risk-assessment/RiskAssessmentWizard'
import { formatManagePeriod, toExportData, type RiskAssessmentRecord } from '@/components/project/risk-assessment/record'
import { exportRiskAssessmentExcel } from '@/lib/excel/risk-assessment-export'
import { supabase } from '@/lib/supabase'

interface RiskAssessmentProject {
  id: string
  project_name: string
  managing_hq: string | null
  managing_branch: string | null
  risk_business_type: string | null
}

const formatDate = (value: string | null) => {
  if (!value) return '-'
  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

export default function RiskAssessmentPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const params = useParams()
  const projectId = params.id as string

  const [project, setProject] = useState<RiskAssessmentProject | null>(null)
  const [authorName, setAuthorName] = useState('')
  const [records, setRecords] = useState<RiskAssessmentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showWizard, setShowWizard] = useState(false)
  const [editingRecord, setEditingRecord] = useState<RiskAssessmentRecord | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const userId = user?.id

  const loadData = useCallback(async () => {
    if (!projectId || !userId) return
    setLoading(true)
    setError('')
    try {
      const [projectResult, recordResult, profileResult] = await Promise.all([
        supabase
          .from('projects')
          .select('id, project_name, managing_hq, managing_branch, risk_business_type')
          .eq('id', projectId)
          .single(),
        supabase
          .from('risk_assessments')
          .select('*')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false }),
        supabase
          .from('user_profiles')
          .select('full_name')
          .eq('id', userId)
          .maybeSingle(),
      ])

      if (projectResult.error) throw new Error(projectResult.error.message)
      if (recordResult.error) throw new Error(recordResult.error.message)
      if (profileResult.error) console.error('작성자 기본값 조회 실패:', profileResult.error)

      setProject(projectResult.data as RiskAssessmentProject)
      setRecords((recordResult.data || []) as RiskAssessmentRecord[])
      setAuthorName(profileResult.data?.full_name || '')
    } catch (loadError: unknown) {
      console.error('수시 위험성평가 데이터 조회 실패:', loadError)
      const message = loadError instanceof Error ? loadError.message : '데이터를 불러오지 못했습니다.'
      setError(message.includes('risk_assessments') || message.includes('risk_business_type')
        ? '위험성평가 테이블이 준비되지 않았습니다. 데이터베이스 마이그레이션을 먼저 실행해주세요.'
        : message)
    } finally {
      setLoading(false)
    }
  }, [projectId, userId])

  useEffect(() => {
    if (userId && projectId) loadData()
  }, [userId, projectId, loadData])

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

  const openEditWizard = (record: RiskAssessmentRecord) => {
    setEditingRecord(record)
    setShowWizard(true)
  }

  const closeWizard = () => {
    setEditingRecord(null)
    setShowWizard(false)
  }

  const handleSaved = (record: RiskAssessmentRecord) => {
    setRecords((current) => current.some((item) => item.id === record.id)
      ? current.map((item) => item.id === record.id ? record : item)
      : [record, ...current])
    if (project) setProject({ ...project, risk_business_type: record.business_type })
  }

  const handleDownload = async (record: RiskAssessmentRecord) => {
    if (downloadingId || !project) return
    setDownloadingId(record.id)
    setDownloadError('')
    try {
      await exportRiskAssessmentExcel(toExportData(record, project.project_name))
    } catch (exportError: unknown) {
      console.error('위험성평가 엑셀 다운로드 실패.', { recordId: record.id, exportError })
      const message = exportError instanceof Error ? exportError.message : '엑셀 파일을 만들지 못했습니다.'
      setDownloadError(`「${record.title}」 다운로드에 실패했습니다. ${message}`)
    } finally {
      setDownloadingId(null)
    }
  }

  const handleDelete = async (record: RiskAssessmentRecord) => {
    if (!confirm(`「${record.title}」 위험성평가서를 삭제하시겠습니까?`)) return
    setDeletingId(record.id)
    try {
      const { error: deleteError } = await supabase.from('risk_assessments').delete().eq('id', record.id)
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
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="min-h-screen relative bg-gradient-to-b from-blue-950 via-blue-900 to-slate-900">
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl lg:max-w-none mx-auto px-4 sm:px-6 lg:px-4">
          <div className="flex items-center h-16">
            <button
              onClick={handleBack}
              className="mr-4 p-2 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100"
              aria-label="프로젝트로 돌아가기"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-bold text-gray-900">(AI) 수시 위험성 평가</h1>
              {project && <p className="truncate text-xs text-gray-500">{project.project_name}</p>}
            </div>
            {!showWizard && project && (
              <button
                onClick={openNewWizard}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 sm:px-4"
              >
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">새 평가서 작성</span>
                <span className="sm:hidden">새 작성</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl lg:max-w-none mx-auto py-6 px-3 sm:px-6 lg:px-4">
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
          <RiskAssessmentWizard
            projectId={project.id}
            projectName={project.project_name}
            managingHq={project.managing_hq}
            managingBranch={project.managing_branch}
            savedBusinessType={project.risk_business_type}
            defaultAuthorName={authorName}
            userId={user.id}
            initialRecord={editingRecord}
            onSaved={handleSaved}
            onClose={closeWizard}
          />
        ) : (
          <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-4 sm:px-6">
              <div>
                <h2 className="font-bold text-gray-900">작성된 위험성평가서</h2>
                <p className="text-xs text-gray-500">총 {records.length}건</p>
              </div>
            </div>

            {records.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-16 text-center">
                <FileText className="h-14 w-14 text-gray-300" />
                <p className="mt-4 font-medium text-gray-700">아직 작성된 위험성평가서가 없습니다.</p>
                <p className="mt-1 text-sm text-gray-500">유해·위험요인 DB와 AI 판정으로 수시평가표를 빠르게 작성할 수 있습니다.</p>
                {project && (
                  <button
                    onClick={openNewWizard}
                    className="mt-5 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    <Plus className="h-4 w-4" />첫 평가서 작성
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-600">
                    <tr>
                      <th className="px-4 py-3 text-center font-semibold sm:px-6">제목</th>
                      <th className="px-4 py-3 text-center font-semibold">수시평가 사유</th>
                      <th className="px-4 py-3 text-center font-semibold">관리기간</th>
                      <th className="px-4 py-3 text-center font-semibold">작성일</th>
                      <th className="px-4 py-3 text-center font-semibold">엑셀</th>
                      <th className="px-4 py-3 text-center font-semibold">관리</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {records.map((record) => (
                      <tr
                        key={record.id}
                        onClick={() => openEditWizard(record)}
                        title="클릭하면 수정 모드로 들어갑니다"
                        className="cursor-pointer hover:bg-blue-50/50"
                      >
                        <td className="max-w-xs px-4 py-3 font-medium text-gray-900 sm:px-6">
                          <span className="line-clamp-2">{record.title}</span>
                          <span className="mt-1 flex flex-wrap gap-1">
                            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">{record.rows.length}행</span>
                            {record.business_type && (
                              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">{record.business_type}</span>
                            )}
                          </span>
                        </td>
                        <td className="max-w-sm px-4 py-3 text-gray-600"><span className="line-clamp-2">{record.trigger || '-'}</span></td>
                        <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                          {formatManagePeriod(record.manage_period_start, record.manage_period_end) || '-'}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-gray-600">{formatDate(record.created_at)}</td>
                        <td className="px-4 py-3 text-center">
                          <button
                            type="button"
                            disabled={downloadingId !== null}
                            onClick={(event) => { event.stopPropagation(); handleDownload(record) }}
                            className="inline-flex items-center gap-1 rounded border border-blue-200 bg-white px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                            aria-label={`${record.title} 엑셀 다운로드`}
                          >
                            {downloadingId === record.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                            {downloadingId === record.id ? '생성 중' : '다운로드'}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            type="button"
                            disabled={deletingId === record.id}
                            onClick={(event) => { event.stopPropagation(); handleDelete(record) }}
                            className="rounded-lg p-2 text-red-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
                            aria-label={`${record.title} 삭제`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
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
