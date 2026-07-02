'use client'

// 단속·점검방문 일지 페이지 — 별지 제9호 서식 (건설기술 진흥법 시행규칙 제48조) 목록 + 작성/수정

import React, { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { ArrowLeft, Plus, Download, X, FileText } from 'lucide-react'
import { Project } from '@/lib/projects'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import InspectionVisitLogList from '@/components/project/inspection/InspectionVisitLogList'
import InspectionVisitLogForm from '@/components/project/inspection/InspectionVisitLogForm'
import { downloadInspectionVisitLogExcel } from '@/lib/excel/inspection-visit-log-export'
import {
  InspectionVisitLogFormData,
  InspectionVisitLogRecord,
  createEmptyInspectionVisitLog,
  normalizeVisitors,
} from '@/lib/inspection/inspection-visit-log-types'

export default function InspectionVisitLogPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const projectId = params.id as string

  const [project, setProject] = useState<Project | null>(null)
  const [records, setRecords] = useState<InspectionVisitLogRecord[]>([])
  const [loading, setLoading] = useState(true)

  // 작성/수정 상태
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState<InspectionVisitLogFormData | null>(null)
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const handleBack = () => {
    // 진입 경로를 returnUrl 쿼리로 받은 경우 그 위치(지사 프로젝트 목록 등)로 정확히 복귀.
    const returnUrl = searchParams.get('returnUrl')
    if (returnUrl) {
      router.push(returnUrl)
      return
    }
    // returnUrl이 없으면 히스토리 기반 복귀, 직접 진입 시 프로젝트 상세로 fallback.
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
      return
    }
    router.push(`/project/${projectId}`)
  }

  // 프로젝트 로드
  useEffect(() => {
    if (!user || !projectId) return
    const loadProject = async () => {
      const { data } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single()
      if (data) setProject(data as Project)
    }
    loadProject()
  }, [user, projectId])

  // 일지 목록 로드
  const loadRecords = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    const { data, error } = await (supabase as any)
      .from('inspection_visit_logs')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
    if (!error && data) {
      setRecords(data as InspectionVisitLogRecord[])
    }
    setLoading(false)
  }, [projectId])

  useEffect(() => {
    if (user && projectId) loadRecords()
  }, [user, projectId, loadRecords])

  // 폼 초기화
  const resetForm = () => {
    setShowForm(false)
    setFormData(null)
    setEditingRecordId(null)
  }

  // 추가 시작 — ① 공사 정보는 프로젝트에서 프리필, ⑦ 확인자는 공사감독 기본값
  const handleAddClick = () => {
    setEditingRecordId(null)
    const siteLocation = [project?.site_address, project?.site_address_detail]
      .filter(Boolean)
      .join(' ')
    setFormData(
      createEmptyInspectionVisitLog({
        construction_name: project?.project_name || '',
        site_location: siteLocation,
        confirmer_affiliation: '한국농어촌공사',
        confirmer_position: '공사감독',
        confirmer_name: project?.supervisor_name || '',
      })
    )
    setShowForm(true)
  }

  // 목록 항목 클릭 → 수정 모드
  const handleSelectRecord = (record: InspectionVisitLogRecord) => {
    const { id, project_id, created_by, created_at, updated_at, ...fields } = record
    void id; void project_id; void created_by; void created_at; void updated_at
    setFormData({
      ...createEmptyInspectionVisitLog(),
      ...fields,
      visitors: normalizeVisitors(fields.visitors),
    })
    setEditingRecordId(record.id)
    setShowForm(true)
  }

  // 저장/수정
  const handleSave = async () => {
    if (!user || !formData) return

    // RLS상 수정은 작성자 본인만 가능 — 사전에 명확히 안내
    if (editingRecordId) {
      const editingRecord = records.find((r) => r.id === editingRecordId)
      if (editingRecord && editingRecord.created_by !== user.id) {
        alert('작성자 본인만 수정할 수 있습니다.')
        return
      }
    }

    if (!formData.visit_basis_purpose.trim()) {
      alert('방문 근거 및 목적을 입력해주세요.')
      return
    }

    setSaving(true)
    try {
      const dataToSave = {
        ...formData,
        project_id: projectId,
        created_by: user.id,
        updated_at: new Date().toISOString(),
      }

      if (editingRecordId) {
        const { error } = await (supabase as any)
          .from('inspection_visit_logs')
          .update(dataToSave)
          .eq('id', editingRecordId)
        if (error) throw error
      } else {
        const { error } = await (supabase as any)
          .from('inspection_visit_logs')
          .insert([dataToSave])
        if (error) throw error
      }

      alert(editingRecordId ? '수정되었습니다.' : '단속·점검방문 일지가 등록되었습니다.')
      resetForm()
      loadRecords()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류'
      alert('저장 실패: ' + message)
    } finally {
      setSaving(false)
    }
  }

  // 삭제
  const handleDelete = async (record: InspectionVisitLogRecord) => {
    if (!confirm('정말 삭제하시겠습니까?')) return
    const { error } = await (supabase as any)
      .from('inspection_visit_logs')
      .delete()
      .eq('id', record.id)
    if (!error) {
      if (editingRecordId === record.id) resetForm()
      loadRecords()
    } else {
      alert('삭제 실패: ' + error.message)
    }
  }

  // 별지 제9호 서식 엑셀 다운로드
  const handleDownload = async (record: InspectionVisitLogRecord) => {
    setDownloadingId(record.id)
    try {
      await downloadInspectionVisitLogExcel(record)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류'
      alert('엑셀 생성 실패: ' + message)
    } finally {
      setDownloadingId(null)
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    )
  }

  if (!user) {
    router.push('/login')
    return null
  }

  return (
    <div className="min-h-screen relative bg-gradient-to-b from-blue-950 via-blue-900 to-slate-900">
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl lg:max-w-none mx-auto px-4 sm:px-6 lg:px-4">
          <div className="flex items-center h-16">
            <button
              onClick={handleBack}
              className="mr-3 p-2 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="text-base sm:text-xl font-bold text-gray-900 truncate flex-1">
              단속·점검방문 일지
            </h1>
          </div>
        </div>
      </header>

      <main className="max-w-none mx-auto py-4 px-2 sm:px-4">
        {loading ? (
          <div className="flex justify-center py-20">
            <LoadingSpinner />
          </div>
        ) : records.length === 0 && !showForm ? (
          /* 등록된 일지가 없으면 가운데 추가 버튼만 표시 */
          <div className="flex justify-center py-20">
            <button
              onClick={handleAddClick}
              className="flex items-center gap-2 px-8 py-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 text-base font-semibold shadow-lg"
            >
              <Plus className="h-5 w-5" />
              방문일지 등록
            </button>
          </div>
        ) : (
        <div className="flex flex-col lg:flex-row gap-4 lg:items-start">
          {/* 목록 (데스크톱: 좌측 / 모바일: 상단) — 등록 건이 있을 때만 표시 */}
          {records.length > 0 && (
          <div className="w-full lg:flex-1 lg:min-w-0 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="bg-blue-600 text-white px-4 py-3 flex items-center justify-between gap-2">
              <h2 className="font-semibold text-sm sm:text-base truncate">단속·점검방문 일지</h2>
              <button
                onClick={handleAddClick}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-white text-blue-700 rounded-lg hover:bg-blue-50 text-xs sm:text-sm font-medium shrink-0"
              >
                <Plus className="h-4 w-4" />
                추가
              </button>
            </div>
            <InspectionVisitLogList
              records={records}
              selectedId={editingRecordId}
              currentUserId={user.id}
              onSelect={handleSelectRecord}
              onDelete={handleDelete}
              onDownload={handleDownload}
              downloadingId={downloadingId}
            />
          </div>
          )}

          {/* 작성/수정 영역 (데스크톱: 우측 / 모바일: 하단) — 목록이 없으면 가운데 단독 표시 */}
          <div className={records.length > 0 ? 'w-full lg:flex-1 lg:min-w-0' : 'w-full max-w-3xl mx-auto'}>
            {!showForm || !formData ? (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
                <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 mb-4">
                  목록에서 일지를 선택하면 수정할 수 있고,
                  <br />
                  추가 버튼으로 새 방문일지를 등록합니다.
                </p>
                <button
                  onClick={handleAddClick}
                  className="flex items-center gap-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm mx-auto"
                >
                  <Plus className="h-4 w-4" />
                  방문일지 등록
                </button>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div className="bg-blue-600 text-white px-4 py-3 flex items-center justify-between">
                  <h2 className="font-semibold text-sm sm:text-base truncate">
                    방문일지 {editingRecordId ? '수정' : '등록'}
                  </h2>
                  <button onClick={resetForm} className="text-white hover:text-blue-200 shrink-0">
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="p-3 sm:p-4 space-y-4">
                  <InspectionVisitLogForm formData={formData} onChange={setFormData} />

                  {/* 버튼 */}
                  <div className="flex justify-end gap-2 pt-1">
                    {editingRecordId && (
                      <button
                        onClick={() => {
                          const record = records.find((r) => r.id === editingRecordId)
                          if (record) handleDownload(record)
                        }}
                        disabled={downloadingId === editingRecordId}
                        className="flex items-center gap-1 px-3 py-2 text-sm text-green-700 bg-green-50 border border-green-300 rounded-lg hover:bg-green-100 disabled:opacity-50"
                        title="단속·점검방문 일지(별지 제9호 서식) 엑셀 다운로드"
                      >
                        <Download className="h-4 w-4" />
                        엑셀
                      </button>
                    )}
                    <button
                      onClick={resetForm}
                      className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      취소
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="px-6 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      {saving ? '저장 중...' : editingRecordId ? '수정' : '저장'}
                    </button>
                  </div>
                  {editingRecordId && (
                    <p className="text-xs text-gray-400 text-right">
                      ※ 엑셀은 마지막 저장된 내용으로 생성됩니다. 변경 후에는 저장을 먼저 해주세요.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        )}
      </main>
    </div>
  )
}
