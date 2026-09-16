'use client'

// 프로젝트 사고보고 서류철 — 이 현장의 사고만 조회하고 등록·수정·삭제한다

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { AlertCircle, ArrowLeft, Loader2, Plus } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import AccidentEntryModal from '@/components/dashboard/AccidentEntryModal'
import AccidentReportDetail from '@/components/project/accident-report/AccidentReportDetail'
import AccidentReportList from '@/components/project/accident-report/AccidentReportList'
import { canManageProjectAccidents } from '@/lib/accident-permissions'
import { formatAccidentDate } from '@/lib/accident-report-format'
import {
  createProjectAccident,
  deleteProjectAccident,
  getProjectAccidents,
  updateProjectAccident,
  type AccidentFormInput,
  type ProjectAccident,
} from '@/lib/accident-analysis'
import type { Project } from '@/lib/projects'

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export default function AccidentReportPage() {
  // 프로필은 작성 권한 판정에만 쓴다. 인증 판정은 아래 세션 가드가 직접 한다.
  const { userProfile } = useAuth()
  const router = useRouter()
  const params = useParams()
  const projectId = params.id as string

  const [project, setProject] = useState<Project | null>(null)
  const [projectError, setProjectError] = useState<string | null>(null)
  const [accidents, setAccidents] = useState<ProjectAccident[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isModalOpen, setModalOpen] = useState(false)
  const [editingAccident, setEditingAccident] = useState<ProjectAccident | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<ProjectAccident | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState('')

  /**
   * 전역 AuthContext의 loading은 SupabaseProvider가 getSession을 끝내기 전에 이미 false가 된다.
   * 그 순간 user는 아직 null이라 새로고침하면 로그인 화면으로 튕긴다.
   * 이 화면은 세션 확인이 끝났는지를 스스로 판단한다. 전역 컨텍스트는 건드리지 않는다.
   */
  const [sessionChecked, setSessionChecked] = useState(false)
  const [sessionUserId, setSessionUserId] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    const apply = (userId: string | null) => {
      if (!active) return
      setSessionUserId(userId)
      setSessionChecked(true)
    }

    // 저장된 세션 복원. 실패해도 "확인 끝"으로 두어 화면이 무한 로딩에 갇히지 않게 한다.
    supabase.auth
      .getSession()
      .then(({ data }) => apply(data.session?.user?.id ?? null))
      .catch(() => apply(null))

    // 최초 세션 전달과 로그아웃·토큰 갱신·다른 탭 로그인을 같은 자리에서 받는다.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => apply(session?.user?.id ?? null))

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  // 렌더 도중 라우팅하지 않는다. 세션 확인이 끝나고 정말 비로그인일 때만 옮긴다.
  useEffect(() => {
    if (!sessionChecked || sessionUserId) return
    router.replace('/login')
  }, [sessionChecked, sessionUserId, router])

  /**
   * 등록은 이 현장을 열 수 있는 사용자면 누구나 한다 — 현장 시공사·감리단의 사고보고가 목적이고,
   * 어느 현장을 열 수 있는지는 projects의 SELECT RLS가 판정하므로 여기서 직급을 다시 따지지 않는다.
   * 수정도 등록과 같은 기준으로 이 현장을 열 수 있는 사용자면 누구나 한다 (작성자는 바뀌지 않는다).
   * 다만 그 사고가 지금 읽은 현장의 것일 때만 연다 — 다른 현장으로 옮겨 가는 사이 남은 목록을 고치지 않게 한다.
   * 삭제만 본인이 올린 보고이거나 이 현장을 관할하는 본부급 이상일 때 연다 (DB 정책과 같은 갈래다).
   */
  const managesThisProject = canManageProjectAccidents(userProfile, project)
  const canCreate = Boolean(sessionUserId && project)
  const canEdit = useCallback(
    (accident: ProjectAccident): boolean =>
      Boolean(sessionUserId && project) && accident.project_id === project?.id,
    [sessionUserId, project],
  )
  const canDelete = useCallback(
    (accident: ProjectAccident): boolean =>
      Boolean(sessionUserId) && (accident.created_by === sessionUserId || managesThisProject),
    [sessionUserId, managesThisProject],
  )

  const selectedAccident = useMemo(
    () => accidents.find((accident) => accident.id === selectedId) ?? null,
    [accidents, selectedId],
  )

  // 참조가 매 렌더 바뀌면 모달이 초안을 다시 만들어, 저장 실패 후 입력이 날아간다.
  const modalProjects = useMemo(() => (project ? [project] : []), [project])

  // 현장 정보를 못 읽으면 어느 현장의 사고인지 화면에 못 쓴다. 실패를 삼키지 않고 드러낸다.
  const loadProject = useCallback(async () => {
    if (!projectId) return
    const { data, error } = await supabase.from('projects').select('*').eq('id', projectId).single()
    if (error || !data) {
      setProject(null)
      setProjectError('현장 정보를 불러오지 못했습니다. 다시 시도해주세요.')
      return
    }
    setProject(data as Project)
    setProjectError(null)
  }, [projectId])

  useEffect(() => {
    if (!sessionUserId || !projectId) return
    loadProject()
  }, [sessionUserId, projectId, loadProject])

  // 조회 실패와 "사고 없음"을 구분해 화면에 다르게 알린다.
  const loadAccidents = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    try {
      setAccidents(await getProjectAccidents(projectId))
      setLoadError(null)
    } catch (error: unknown) {
      setAccidents([])
      setLoadError(errorMessage(error, '사고 이력을 불러오지 못했습니다.'))
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    if (sessionUserId && projectId) loadAccidents()
  }, [sessionUserId, projectId, loadAccidents])

  // 상세를 보고 있으면 목록으로, 목록에서는 프로젝트로 돌아간다.
  const handleBack = () => {
    if (selectedId) {
      setSelectedId(null)
      window.scrollTo({ top: 0 })
      return
    }
    router.push(`/project/${projectId}`)
  }

  const openCreateModal = () => {
    if (!canCreate) return
    setEditingAccident(null)
    setSubmitError('')
    setModalOpen(true)
  }

  const openEditModal = (accident: ProjectAccident) => {
    if (!project || !canEdit(accident)) return
    setEditingAccident(accident)
    setSubmitError('')
    setModalOpen(true)
  }

  const closeModal = () => {
    if (submitting) return
    setModalOpen(false)
    setEditingAccident(null)
    setSubmitError('')
  }

  const handleSubmit = async (input: AccidentFormInput) => {
    const allowed = editingAccident ? canEdit(editingAccident) : canCreate
    if (!allowed || !sessionUserId) {
      setSubmitError('사고보고를 저장할 권한이 없습니다.')
      return
    }
    setSubmitting(true)
    setSubmitError('')
    try {
      const result = editingAccident
        ? await updateProjectAccident(editingAccident.id, input)
        : await createProjectAccident(input, sessionUserId)
      if (!result.success) {
        setSubmitError(result.error ?? '사고 이력을 저장하지 못했습니다.')
        return
      }
      setModalOpen(false)
      setEditingAccident(null)
      if (result.accident) setSelectedId(result.accident.id)
      await loadAccidents()
    } catch (error: unknown) {
      setSubmitError(errorMessage(error, '사고 이력을 저장하는 중 오류가 발생했습니다.'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    const target = deleteTarget
    if (!target || !canDelete(target)) return
    setDeletingId(target.id)
    setDeleteError('')
    try {
      const result = await deleteProjectAccident(target.id)
      if (!result.success) {
        // 확인 모달이 오류 문구를 가리므로 모달 안에 그대로 남긴다.
        setDeleteError(result.error ?? '사고 이력을 삭제하지 못했습니다.')
        return
      }
      setDeleteTarget(null)
      if (selectedId === target.id) setSelectedId(null)
      await loadAccidents()
    } catch (error: unknown) {
      setDeleteError(errorMessage(error, '사고 이력을 삭제하는 중 오류가 발생했습니다.'))
    } finally {
      setDeletingId(null)
    }
  }

  const askDelete = (accident: ProjectAccident) => {
    if (!canDelete(accident)) return
    setDeleteError('')
    setDeleteTarget(accident)
  }

  // 세션 확인 중이거나 비로그인(리다이렉트 진행 중)일 때는 같은 대기 화면을 보여준다.
  if (!sessionChecked || !sessionUserId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="flex items-center h-16 gap-3">
            <button
              onClick={handleBack}
              aria-label="뒤로 가기"
              className="p-2 min-h-[44px] inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 rounded-md hover:bg-gray-100 shrink-0"
            >
              <ArrowLeft className="h-5 w-5" />
              {selectedId && <span>목록</span>}
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="text-base sm:text-xl font-bold text-gray-900 truncate">사고보고</h1>
              {project && <p className="text-xs text-gray-500 truncate">{project.project_name}</p>}
            </div>
            {/* 빈 목록일 때만 표 가운데 버튼에 진입점을 넘긴다. 조회가 실패했거나 아직 로딩 중이면 그 버튼이 없으므로 여기 남겨 둔다. */}
            {canCreate && !selectedId && (loading || loadError || accidents.length > 0) && (
              <button
                type="button"
                onClick={openCreateModal}
                className="min-h-[44px] inline-flex items-center gap-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shrink-0"
              >
                <Plus className="h-4 w-4" />
                사고 등록
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto py-4 px-3 sm:px-6 space-y-3">
        {projectError && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-red-700">{projectError}</p>
            <button
              onClick={loadProject}
              className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              현장 정보 다시 불러오기
            </button>
          </div>
        )}

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-blue-600 text-white px-4 py-3 flex items-center justify-between gap-2">
            <h2 className="font-semibold text-sm sm:text-base truncate">
              {selectedAccident ? `${formatAccidentDate(selectedAccident.accident_at)} 사고 상세` : '사고 목록'}
            </h2>
            {!selectedAccident && !loading && !loadError && (
              <span className="text-xs shrink-0">{accidents.length.toLocaleString('ko-KR')}건</span>
            )}
          </div>

          {selectedAccident ? (
            <div className="p-3 sm:p-4">
              <AccidentReportDetail
                accident={selectedAccident}
                projectName={project?.project_name ?? ''}
                canEdit={canEdit(selectedAccident)}
                canDelete={canDelete(selectedAccident)}
                deleting={deletingId === selectedAccident.id}
                onEdit={() => openEditModal(selectedAccident)}
                onDelete={() => askDelete(selectedAccident)}
              />
            </div>
          ) : loading ? (
            <div className="flex justify-center py-12">
              <LoadingSpinner />
            </div>
          ) : (
            <AccidentReportList
              accidents={accidents}
              loadError={loadError}
              canCreate={canCreate}
              canEdit={canEdit}
              canDelete={canDelete}
              deletingId={deletingId}
              onRetry={loadAccidents}
              onSelect={(accident) => {
                setSelectedId(accident.id)
                window.scrollTo({ top: 0 })
              }}
              onCreate={openCreateModal}
              onEdit={openEditModal}
              onDelete={askDelete}
            />
          )}
        </div>
      </main>

      <AccidentEntryModal
        isOpen={isModalOpen}
        projects={modalProjects}
        fixedProject={project}
        accident={editingAccident}
        submitting={submitting}
        submitError={submitError}
        onClose={closeModal}
        onSubmit={handleSubmit}
      />

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="presentation">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6" role="dialog" aria-modal="true" aria-labelledby="accident-delete-title">
            <h2 id="accident-delete-title" className="text-lg font-semibold text-gray-900">사고 이력 삭제</h2>
            <p className="mt-2 text-sm text-gray-600">
              {formatAccidentDate(deleteTarget.accident_at)} {deleteTarget.accident_type} 사고를 삭제합니다. 삭제한 기록은 되돌릴 수 없습니다.
            </p>
            {deleteError && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>{deleteError}</span>
              </div>
            )}
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deletingId !== null}
                className="flex-1 min-h-[44px] px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deletingId !== null}
                className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deletingId !== null && <Loader2 className="h-4 w-4 animate-spin" />}
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
