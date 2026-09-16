'use client'

// 프로젝트 사고보고 서류철 — 이 현장의 사고만 조회하고 등록·수정·삭제한다

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  getProjectAccidentDetail,
  getProjectAccidents,
  updateProjectAccident,
  type AccidentFormInput,
  type ProjectAccident,
} from '@/lib/accident-analysis'
import { downloadAccidentReportHwpx } from '@/lib/hwpx/accident-report-hwpx-export'
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

  /** report_details까지 읽은 사고. 목록 조회는 이 컬럼을 읽지 않으므로 상세·수정·다운로드 직전에 채운다. */
  const [detailsById, setDetailsById] = useState<Record<string, ProjectAccident>>({})
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null)
  const [detailError, setDetailError] = useState('')
  const [editOpenError, setEditOpenError] = useState('')
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState('')
  /** 늦게 도착한 이전 상세 응답을 버리는 요청 번호 */
  const detailSeqRef = useRef(0)
  /** 마지막으로 시작한 상세 읽기의 번호. 목록 재조회로 추월당해도 자기 로딩 표시는 자기가 끈다. */
  const detailLoadSeqRef = useRef(0)

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

  // 보고서 항목을 읽은 사고가 있으면 그것을, 아직이면 목록의 사고를 보여준다.
  const selectedAccident = useMemo(
    () => (selectedId ? detailsById[selectedId] ?? accidents.find((accident) => accident.id === selectedId) ?? null : null),
    [accidents, detailsById, selectedId],
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
    // 목록을 다시 읽으면 보고서 항목 캐시도 버려 저장 직후의 옛 값을 보여주지 않는다.
    detailSeqRef.current += 1
    setDetailsById({})
    setDetailError('')
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

  /**
   * 보고서 항목까지 읽어 캐시에 넣는다.
   * 실패(detail null·superseded 거짓)와 추월당한 응답(superseded 참)을 구분해 돌려준다 —
   * 추월은 오류가 아니므로 호출자가 안내 문구를 내지 않는다.
   */
  const loadDetail = useCallback(async (id: string): Promise<{ detail: ProjectAccident | null; superseded: boolean }> => {
    const seq = detailSeqRef.current + 1
    detailSeqRef.current = seq
    detailLoadSeqRef.current = seq
    setDetailLoadingId(id)
    setDetailError('')
    try {
      const detail = await getProjectAccidentDetail(id)
      if (detailSeqRef.current !== seq) return { detail: null, superseded: true }
      setDetailsById((current) => ({ ...current, [detail.id]: detail }))
      return { detail, superseded: false }
    } catch (error: unknown) {
      if (detailSeqRef.current !== seq) return { detail: null, superseded: true }
      setDetailError(errorMessage(error, '보고서 항목을 불러오지 못했습니다.'))
      return { detail: null, superseded: false }
    } finally {
      // 목록 재조회가 번호를 올려도 더 새로운 상세 읽기가 없으면 로딩 표시는 여기서 끈다.
      if (detailLoadSeqRef.current === seq) setDetailLoadingId(null)
    }
  }, [])

  // 상세를 열면 그 사고의 보고서 항목을 읽는다. 이미 읽었으면 다시 읽지 않는다.
  useEffect(() => {
    if (!selectedId || detailsById[selectedId]) return
    void loadDetail(selectedId)
  }, [selectedId, detailsById, loadDetail])

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
    setEditOpenError('')
    setModalOpen(true)
  }

  /**
   * 보고서 항목을 읽은 뒤에만 수정을 연다 — 비어 있는 채로 저장해 기존 report_details를 지우지 않으려는 것이다.
   */
  const openEditModal = async (accident: ProjectAccident) => {
    if (!project || !canEdit(accident)) return
    setEditOpenError('')
    const cached = detailsById[accident.id]
    const loaded = cached ? { detail: cached, superseded: false } : await loadDetail(accident.id)
    if (!loaded.detail) {
      // 목록이 다시 읽히는 사이 추월당했으면 오류가 아니다. 사용자가 다시 누르면 된다.
      if (!loaded.superseded) setEditOpenError('보고서 항목을 불러오지 못해 수정을 열 수 없습니다. 다시 시도해 주세요.')
      return
    }
    setEditingAccident(loaded.detail)
    setSubmitError('')
    setModalOpen(true)
  }

  const handleDownloadHwpx = async (accident: ProjectAccident) => {
    setDownloadError('')
    setDownloadingId(accident.id)
    try {
      const cached = detailsById[accident.id]
      const loaded = cached ? { detail: cached, superseded: false } : await loadDetail(accident.id)
      if (!loaded.detail) {
        if (!loaded.superseded) setDownloadError('보고서 항목을 불러오지 못해 한글 문서를 만들 수 없습니다. 다시 시도해 주세요.')
        return
      }
      await downloadAccidentReportHwpx(loaded.detail, project?.project_name ?? '')
    } catch (error: unknown) {
      setDownloadError(errorMessage(error, '한글 문서를 만들지 못했습니다.'))
    } finally {
      setDownloadingId(null)
    }
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
      const saved = result.accident
      if (saved) setSelectedId(saved.id)
      // 목록 재조회가 캐시를 비우므로 저장 결과는 그 뒤에 넣는다.
      await loadAccidents()
      if (saved && saved.report_details !== undefined) setDetailsById({ [saved.id]: saved })
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

        {editOpenError && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3" role="alert">
            <p className="text-sm text-red-700">{editOpenError}</p>
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
                onDownloadHwpx={() => handleDownloadHwpx(selectedAccident)}
                downloading={downloadingId === selectedAccident.id}
                downloadError={downloadError}
                detailLoading={detailLoadingId === selectedAccident.id}
                detailError={detailError}
                onRetryDetail={() => void loadDetail(selectedAccident.id)}
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
        reportMode
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
