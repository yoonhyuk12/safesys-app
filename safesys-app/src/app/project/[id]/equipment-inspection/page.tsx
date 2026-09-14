'use client'

// (AI) 장비 일일점검 대장 페이지 — 장비 선택·점검·서명 제출과 제출 목록/상세/HWPX 다운로드

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Plus, X } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import EquipmentPicker from '@/components/project/equipment-inspection/EquipmentPicker'
import EquipmentInspectionForm from '@/components/project/equipment-inspection/EquipmentInspectionForm'
import EquipmentInspectionList from '@/components/project/equipment-inspection/EquipmentInspectionList'
import EquipmentInspectionDetail from '@/components/project/equipment-inspection/EquipmentInspectionDetail'
import { EQUIPMENT_CHECKLISTS } from '@/lib/equipment-inspection-catalog'
import { downloadEquipmentInspectionHwpx } from '@/lib/hwpx/equipment-inspection-hwpx-export'
import type { EquipmentChecklist, EquipmentInspection } from '@/lib/equipment-inspection-types'
import {
  createEquipmentInspection,
  createEquipmentInspectionDraft,
  deleteEquipmentInspection,
  getEquipmentInspections,
  selectEquipmentChecklist,
  type EquipmentInspectionDraft,
} from '@/lib/equipment-inspections'
import type { Project } from '@/lib/projects'

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export default function EquipmentInspectionPage() {
  // 프로필은 작성자 기본값 채우기에만 쓴다. 인증 판정은 아래 세션 가드가 직접 한다.
  const { userProfile } = useAuth()
  const router = useRouter()
  const params = useParams()
  const projectId = params.id as string

  const [project, setProject] = useState<Project | null>(null)
  const [projectError, setProjectError] = useState<string | null>(null)
  const [records, setRecords] = useState<EquipmentInspection[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [draft, setDraft] = useState<EquipmentInspectionDraft | null>(null)
  const [checklist, setChecklist] = useState<EquipmentChecklist | null>(null)
  const [selectedRecord, setSelectedRecord] = useState<EquipmentInspection | null>(null)
  const [saving, setSaving] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

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

  const projectName = project?.project_name?.trim() ?? ''

  // 점검 상세에서는 제출 목록으로, 목록에서는 프로젝트로 돌아간다.
  const handleBack = () => {
    if (selectedRecord) {
      setSelectedRecord(null)
      window.scrollTo({ top: 0 })
      return
    }
    router.push(`/project/${projectId}`)
  }

  // 현장 정보를 못 읽으면 이름 없는 HWPX가 만들어진다. 실패를 삼키지 않고 화면에 드러낸다.
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

  // 조회 실패와 "아직 아무도 제출하지 않음"을 구분해 화면에 다르게 알린다.
  const loadRecords = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    try {
      setRecords(await getEquipmentInspections(projectId))
      setLoadError(null)
    } catch (error: unknown) {
      setRecords([])
      setLoadError(errorMessage(error, '장비 일일점검 대장을 불러오지 못했습니다.'))
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    if (sessionUserId && projectId) loadRecords()
  }, [sessionUserId, projectId, loadRecords])

  const startInspection = () => {
    if (saving) return
    setSelectedRecord(null)
    setChecklist(null)
    setDraft(
      createEquipmentInspectionDraft({
        inspectorName: userProfile?.full_name ?? '',
        companyName: userProfile?.company_name ?? '',
      })
    )
  }

  const closeForm = () => {
    setDraft(null)
    setChecklist(null)
  }

  /** 저장 중에는 초안이 사라지거나 바뀌면 안 된다 — 늦게 도착한 성공 응답이 새 초안을 닫아버린다. */
  const closeFormByUser = () => {
    if (saving) return
    closeForm()
  }

  const handleSelectEquipment = (next: EquipmentChecklist) => {
    if (!draft || saving) return
    setDraft(selectEquipmentChecklist(draft, next))
    setChecklist(next)
  }

  const handleSubmit = async () => {
    if (!draft || saving) return
    setSaving(true)
    try {
      await createEquipmentInspection(projectId, draft, checklist, sessionUserId ?? '')
      closeForm()
      setSelectedRecord(null)
      await loadRecords()
    } catch (error: unknown) {
      alert(errorMessage(error, '장비 일일점검 제출에 실패했습니다.'))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (record: EquipmentInspection) => {
    if (saving) return
    if (!confirm(`${record.inspection_date} ${record.equipment_name} 점검을 삭제하시겠습니까?`)) return
    try {
      await deleteEquipmentInspection(record.id)
      if (selectedRecord?.id === record.id) setSelectedRecord(null)
      await loadRecords()
    } catch (error: unknown) {
      alert(errorMessage(error, '삭제에 실패했습니다.'))
    }
  }

  const handleDownload = async (record: EquipmentInspection) => {
    // 현장명이 비면 파일명도 문서 머리도 비어 나간다. 이름을 확인하기 전에는 만들지 않는다.
    if (!projectName) {
      alert('현장 정보를 불러온 뒤에 내려받을 수 있습니다.')
      return
    }
    setDownloadingId(record.id)
    try {
      await downloadEquipmentInspectionHwpx(record, projectName)
    } catch (error: unknown) {
      alert(errorMessage(error, 'HWPX 생성에 실패했습니다.'))
    } finally {
      setDownloadingId(null)
    }
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
    <div className="min-h-screen relative bg-gradient-to-b from-blue-950 via-blue-900 to-slate-900">
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl lg:max-w-none mx-auto px-4 sm:px-6 lg:px-4">
          <div className="flex items-center h-16">
            <button
              onClick={handleBack}
              aria-label="뒤로 가기"
              className="mr-3 p-2 min-h-[44px] inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 rounded-md hover:bg-gray-100 shrink-0"
            >
              <ArrowLeft className="h-5 w-5" />
              {selectedRecord && <span>뒤로 가기</span>}
            </button>
            <h1 className="text-base sm:text-xl font-bold text-gray-900 truncate flex-1">(AI) 장비 일일점검 대장</h1>
          </div>
        </div>
      </header>

      <main className="max-w-none mx-auto py-4 px-2 sm:px-4">
        {projectError && (
          <div className="mb-3 bg-white rounded-lg shadow-sm border border-gray-200 p-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-red-700">{projectError}</p>
            <button
              onClick={loadProject}
              className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              현장 정보 다시 불러오기
            </button>
          </div>
        )}
        <div className="flex flex-col lg:flex-row gap-4 lg:items-start">
          {/* 작성 또는 상세 확인 중에는 제출 목록을 숨긴다. */}
          {!draft && !selectedRecord && (
          <div className="w-full lg:flex-1 lg:min-w-0 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="bg-blue-600 text-white px-4 py-3 flex items-center justify-between gap-2">
              <h2 className="font-semibold text-sm sm:text-base truncate">제출 목록</h2>
              {/* 기록이 있을 때만 헤더에 둔다. 빈 목록의 진입점은 표 가운데 버튼 하나뿐이다. */}
              {records.length > 0 && (
                <button
                  onClick={startInspection}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-white text-blue-700 rounded-lg hover:bg-blue-50 text-xs sm:text-sm font-medium shrink-0"
                >
                  <Plus className="h-4 w-4" />
                  점검하기
                </button>
              )}
            </div>
            {loading ? (
              <div className="flex justify-center py-12">
                <LoadingSpinner />
              </div>
            ) : loadError ? (
              <div className="m-4 border border-dashed border-red-300 rounded-md p-6 text-center text-sm text-red-700">
                <p>{loadError}</p>
                <button
                  onClick={loadRecords}
                  className="mt-3 px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  다시 시도
                </button>
              </div>
            ) : (
              <EquipmentInspectionList
                records={records}
                selectedId={null}
                currentUserId={sessionUserId}
                downloadingId={downloadingId}
                downloadDisabled={!projectName}
                onStartInspection={startInspection}
                onSelect={(record) => {
                  if (saving) return
                  closeForm()
                  setSelectedRecord(record)
                  window.scrollTo({ top: 0 })
                }}
                onDownload={handleDownload}
                onDelete={handleDelete}
              />
            )}
          </div>

          )}

          {/* 기록 선택 시 점검표 하나만 화면 가운데에 표시한다. */}
          {(draft || selectedRecord) && (
            <div className={draft ? 'w-full lg:flex-1 lg:min-w-0' : 'w-full max-w-4xl mx-auto min-w-0'}>
              {draft ? (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                  {/* 스크롤 중에도 저장할 수 있도록 제목 바를 고정한다. 상위 카드에는 overflow를 두지 않는다. */}
                  <div className="sticky top-0 z-20 bg-blue-600 text-white rounded-t-lg px-4 py-3 flex items-center justify-between gap-3">
                    <h2 className="font-semibold text-sm sm:text-base truncate min-w-0 flex-1">
                      장비 일일점검{checklist ? ` — ${checklist.name}` : ''}
                    </h2>
                    {checklist && (
                      <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={saving}
                        className="min-h-[44px] px-4 py-2 bg-white text-blue-700 text-sm font-medium rounded-lg hover:bg-blue-50 inline-flex items-center gap-2 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                        {saving ? '저장 중...' : '저장'}
                      </button>
                    )}
                    <button
                      onClick={closeFormByUser}
                      disabled={saving}
                      aria-label="작성 닫기"
                      className="text-white hover:text-blue-200 shrink-0 disabled:opacity-50"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <div className="p-3 sm:p-4 space-y-4">
                    {/* 장비를 고르면 선택 그리드를 감추고 그 점검표만 남긴다. 닫았다가 다시 시작하면 장비 선택부터다. */}
                    {checklist ? (
                      <EquipmentInspectionForm
                        draft={draft}
                        checklist={checklist}
                        saving={saving}
                        onChange={setDraft}
                      />
                    ) : (
                      <EquipmentPicker
                        checklists={EQUIPMENT_CHECKLISTS}
                        selectedId={draft.checklistId}
                        onSelect={handleSelectEquipment}
                      />
                    )}
                  </div>
                </div>
              ) : selectedRecord ? (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                  <div className="bg-blue-600 text-white px-4 py-3 flex items-center justify-between">
                    <h2 className="font-semibold text-sm sm:text-base truncate">
                      {selectedRecord.inspection_date} {selectedRecord.equipment_name}
                    </h2>
                  </div>
                  <div className="p-3 sm:p-4">
                    <EquipmentInspectionDetail
                      record={selectedRecord}
                      downloading={downloadingId === selectedRecord.id}
                      downloadDisabled={!projectName}
                      onDownload={() => handleDownload(selectedRecord)}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
