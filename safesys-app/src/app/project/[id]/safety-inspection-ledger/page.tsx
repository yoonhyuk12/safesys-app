'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { ArrowLeft, Plus, Trash2, Eye, FileText, FileSpreadsheet, Upload, Image as ImageIcon, Edit2, MoreVertical, Crop, Ban } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import type { Project } from '@/lib/projects'
import SafetyInspectionForm from '../../../../components/project/SafetyInspectionForm'
import SafetyInspectionDetail from '../../../../components/project/SafetyInspectionDetail'
import ImageEditor from '../../../../components/ui/ImageEditor'
import { generateSafetyInspectionReportPdf } from '../../../../lib/reports/safety-inspection-report-pdf'

export interface SafetyInspection {
  id: string
  project_id: string
  inspection_type: string
  inspection_date: string
  inspection_team: string | null
  management_entity: string | null
  district_name: string | null
  location_province: string | null
  location_city: string | null
  total_budget: number | null
  construction_start: string | null
  construction_end_planned: string | null
  progress_rate: number | null
  major_work_type: string | null
  contractor: string | null
  supervisor_name: string | null
  inspector_opinion: string | null
  created_by: string
  created_at: string
  updated_at: string
  results?: SafetyInspectionResult[]
  site_before_photo?: string | null
}

export interface SafetyInspectionResult {
  id: string
  inspection_id: string
  field_item: string
  findings: string | null
  action_items: string | null
  sort_order: number
  photo_url?: string | null
  after_photo_url?: string | null
}

export interface SafetyInspectionPhoto {
  id: string
  inspection_id: string
  photo_type: 'site_before' | 'finding_before' | 'good_example'
  photo_url: string
  description: string | null
  supervisor_name: string | null
  photo_date: string | null
  sort_order: number
}

const INSPECTION_TYPES = ['해빙기', '우기', '종합', '특별'] as const

export default function SafetyInspectionLedgerPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const projectId = params.id as string

  const [project, setProject] = useState<Project | null>(null)
  const [inspections, setInspections] = useState<SafetyInspection[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<string>('해빙기')
  const [showForm, setShowForm] = useState(false)
  const [showDetail, setShowDetail] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [uploadingResultId, setUploadingResultId] = useState<string | null>(null)
  const [pdfExporting, setPdfExporting] = useState(false)
  const [editingActionId, setEditingActionId] = useState<string | null>(null)
  const [tempActionText, setTempActionText] = useState('')
  const [photoMenuOpen, setPhotoMenuOpen] = useState<string | null>(null)
  const [editingImage, setEditingImage] = useState<{ url: string; resultId: string } | null>(null)

  const loadProject = useCallback(async () => {
    const { data } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single()
    if (data) setProject(data as any)
  }, [projectId])

  const loadInspections = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('safety_inspections')
      .select('*, safety_inspection_results(*), safety_inspection_photos(*)')
      .eq('project_id', projectId)
      .order('inspection_date', { ascending: false })

    if (data) {
      // Sort the nested results by sort_order
      const sortedData = data.map((d: any) => ({
        ...d,
        results: d.safety_inspection_results?.sort((a: any, b: any) => a.sort_order - b.sort_order) || [],
        site_before_photo: d.safety_inspection_photos?.find((p: any) => p.photo_type === 'site_before')?.photo_url || null
      }))
      setInspections(sortedData as any)
    }
    setLoading(false)
  }, [projectId])

  useEffect(() => {
    if (user && projectId) {
      loadProject()
      loadInspections()
    }
  }, [user, projectId, loadProject, loadInspections])

  const handleBack = () => {
    const returnUrl = searchParams.get('returnUrl')
    if (returnUrl) {
      router.push(returnUrl)
    } else {
      router.push(`/project/${projectId}`)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from('safety_inspections').delete().eq('id', id)
      if (error) throw error
      setDeleteConfirmId(null)
      loadInspections()
    } catch (err: any) {
      console.error('Delete inspection failed:', err)
      alert('점검 기록 삭제에 실패했습니다: ' + (err.message || '알 수 없는 오류'))
    }
  }

  const handlePdfExport = async (inspectionId: string) => {
    if (pdfExporting) return
    setPdfExporting(true)
    try {
      const { data: inspection } = await supabase
        .from('safety_inspections')
        .select('*')
        .eq('id', inspectionId)
        .single()
      if (!inspection) return

      const { data: results } = await supabase
        .from('safety_inspection_results')
        .select('*')
        .eq('inspection_id', inspectionId)
        .order('sort_order')

      const { data: photos } = await supabase
        .from('safety_inspection_photos')
        .select('*')
        .eq('inspection_id', inspectionId)
        .order('sort_order')

      await generateSafetyInspectionReportPdf({
        inspection: inspection as any,
        results: (results || []) as any,
        photos: (photos || []) as any,
        project
      })
    } catch (err) {
      console.error('Report download failed:', err)
      alert('보고서 다운로드에 실패했습니다.')
    } finally {
      setPdfExporting(false)
    }
  }

  const handleAfterPhotoUpload = async (resultId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingResultId(resultId)
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
      const fileName = `${projectId}/${Date.now()}_after_${resultId}_${encodeURIComponent(safeName)}`
      const { data, error } = await supabase.storage.from('safety-inspection-photos').upload(fileName, file)

      if (!error && data) {
        const { data: urlData } = supabase.storage.from('safety-inspection-photos').getPublicUrl(data.path)

        await (supabase.from('safety_inspection_results') as any)
          .update({ after_photo_url: urlData.publicUrl })
          .eq('id', resultId)

        await loadInspections() // 목록 갱신
      }
    } catch (err) {
      console.error(err)
      alert('업로드 중 오류가 발생했습니다.')
    }
    setUploadingResultId(null)
    e.target.value = ''
  }

  const toggleNotApplicable = async (resultId: string, currentValue: string | null | undefined) => {
    try {
      setUploadingResultId(resultId)
      const newValue = currentValue === 'N/A' ? null : 'N/A'
      await (supabase.from('safety_inspection_results') as any)
        .update({ after_photo_url: newValue })
        .eq('id', resultId)
      await loadInspections()
    } catch (err) {
      console.error(err)
      alert('저장 중 오류가 발생했습니다.')
    } finally {
      setUploadingResultId(null)
    }
  }

  const handleSaveActionItem = async (resultId: string) => {
    try {
      setUploadingResultId(resultId)
      await (supabase.from('safety_inspection_results') as any)
        .update({ action_items: tempActionText })
        .eq('id', resultId)

      await loadInspections() // 목록 갱신
      setEditingActionId(null)
    } catch (err) {
      console.error(err)
      alert('저장 중 오류가 발생했습니다.')
    } finally {
      setUploadingResultId(null)
    }
  }

  const removeAfterPhoto = async (resultId: string, photoUrl: string) => {
    setUploadingResultId(resultId)
    try {
      const path = photoUrl.split('/safety-inspection-photos/')[1]
      if (path) {
        const { error: storageError } = await supabase.storage.from('safety-inspection-photos').remove([path])
        if (storageError) console.warn('Storage delete warning:', storageError)
      }

      const { data: dbData, error: dbError } = await (supabase.from('safety_inspection_results') as any)
        .update({ after_photo_url: null })
        .eq('id', resultId)
        .select()

      if (dbError) throw dbError
      if (!dbData || dbData.length === 0) {
        throw new Error('권한이 없거나 수정할 대상을 찾지 못했습니다. (DB 적용 안됨)')
      }

      await loadInspections()
    } catch (err: any) {
      console.error('Delete photo failed:', err)
      alert('사진 삭제에 실패했습니다: ' + (err.message || '알 수 없는 오류'))
    }
    setUploadingResultId(null)
  }

  // 사진 메뉴 외부 클릭 시 닫기
  useEffect(() => {
    if (!photoMenuOpen) return
    const handler = () => setPhotoMenuOpen(null)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [photoMenuOpen])

  const handleSaveEditedAfterPhoto = async (blob: Blob) => {
    if (!editingImage) return
    setUploadingResultId(editingImage.resultId)
    try {
      const fileName = `${projectId}/${Date.now()}_edited_${Math.random().toString(36).slice(2, 8)}.jpg`
      const { data, error } = await supabase.storage
        .from('safety-inspection-photos')
        .upload(fileName, blob, { contentType: 'image/jpeg' })

      if (!error && data) {
        // 기존 사진 스토리지에서 삭제
        const oldPath = editingImage.url.split('/safety-inspection-photos/')[1]
        if (oldPath) await supabase.storage.from('safety-inspection-photos').remove([oldPath])

        const { data: urlData } = supabase.storage
          .from('safety-inspection-photos')
          .getPublicUrl(data.path)

        await (supabase.from('safety_inspection_results') as any)
          .update({ after_photo_url: urlData.publicUrl })
          .eq('id', editingImage.resultId)

        await loadInspections()
      }
    } catch (err) {
      console.error('편집된 이미지 저장 실패:', err)
      alert('이미지 저장에 실패했습니다.')
    }
    setUploadingResultId(null)
    setEditingImage(null)
  }

  const filteredInspections = inspections.filter(i => i.inspection_type === activeTab)

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center"><LoadingSpinner /></div>
  }
  if (!user) { router.push('/login'); return null }

  return (
    <div className="min-h-screen relative bg-gradient-to-b from-blue-950 via-blue-900 to-slate-900">
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl lg:max-w-none mx-auto px-4 sm:px-6 lg:px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <button onClick={handleBack} className="mr-4 p-2 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100">
                <ArrowLeft className="h-5 w-5" />
              </button>
              <h1 className="text-xl font-bold text-gray-900">안전점검 관리대장</h1>
              {project && <span className="ml-3 text-sm text-gray-500">({project.project_name})</span>}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl lg:max-w-none mx-auto py-6 px-4 sm:px-6 lg:px-4">
        {/* 탭 & 버튼 */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex gap-2">
            {INSPECTION_TYPES.map(type => (
              <button
                key={type}
                onClick={() => setActiveTab(type)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === type
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-white/10 text-white/70 hover:bg-white/20'
                  }`}
              >
                {type}
                <span className="ml-1.5 text-xs opacity-75">
                  ({inspections.filter(i => i.inspection_type === type).length})
                </span>
              </button>
            ))}
          </div>
          <button
            onClick={() => { setEditingId(null); setShowForm(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm whitespace-nowrap shadow-sm hover:shadow"
          >
            <Plus className="h-4 w-4" />
            새 점검 등록
          </button>
        </div>

        {/* 목록 */}
        {loading ? (
          <div className="flex justify-center py-12"><LoadingSpinner /></div>
        ) : filteredInspections.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-16 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
              <FileSpreadsheet className="h-8 w-8 text-gray-300" />
            </div>
            <p className="text-gray-600 text-lg font-medium mb-1">등록된 {activeTab} 점검이 없습니다.</p>
            <p className="text-gray-400 text-sm mb-6">버튼을 눌러 첫 점검을 등록해보세요.</p>
            <button
              onClick={() => { setEditingId(null); setShowForm(true) }}
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm hover:shadow"
            >
              <Plus className="h-5 w-5" />
              새 점검 등록
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="px-2 py-3 text-center font-semibold text-gray-700 whitespace-nowrap w-16">구분</th>
                    <th className="px-2 py-3 text-center font-semibold text-gray-700 whitespace-nowrap w-[15%]">점검개요</th>
                    <th className="px-3 py-3 text-center font-semibold text-gray-700 min-w-[200px] border-l border-gray-100 w-[30%]">지적사항 및 조치 전 사진</th>
                    <th className="px-3 py-3 text-center font-semibold text-gray-700 min-w-[200px] border-l border-gray-100 w-[30%]">조치결과 및 조치 후 사진</th>
                    <th className="px-2 py-3 text-center font-semibold text-gray-700 w-24 whitespace-nowrap">비고</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredInspections.map(ins => {
                    const rowCount = Math.max(1, ins.results?.length || 1)

                    return (
                      <React.Fragment key={ins.id}>
                        {ins.results && ins.results.length > 0 ? (
                          ins.results.map((r, i) => (
                            <tr key={r.id} className="hover:bg-gray-50 bg-white group">
                              {i === 0 && (
                                <>
                                  <td rowSpan={rowCount} className="px-2 py-3 text-center align-middle border-r border-gray-100">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-blue-100 text-blue-800">
                                      {ins.inspection_type}
                                    </span>
                                  </td>
                                  <td rowSpan={rowCount} className="px-2 py-3 text-center align-middle border-r border-gray-100">
                                    <div className="flex flex-col items-center gap-2">
                                      {ins.site_before_photo ? (
                                        <img src={ins.site_before_photo} alt="전경사진" className="w-24 h-16 object-cover rounded border cursor-pointer" onClick={() => window.open(ins.site_before_photo!, '_blank')} />
                                      ) : (
                                        <div className="w-24 h-16 bg-gray-50 border border-dashed border-gray-200 rounded flex items-center justify-center text-gray-400 text-[10px]">사진 없음</div>
                                      )}
                                      <div className="text-gray-900 font-medium text-xs whitespace-nowrap">
                                        {ins.inspection_date ? ins.inspection_date.substring(2) : ''}
                                      </div>
                                      <div className="text-xs text-gray-600 line-clamp-2 leading-snug" title={ins.inspection_team || ''}>
                                        {ins.inspection_team || '-'}
                                      </div>
                                    </div>
                                  </td>
                                </>
                              )}

                              <td className="px-3 py-3 text-xs border-l border-gray-100 align-top w-[30%]">
                                <div className="flex flex-col gap-2">
                                  {r.photo_url ? (
                                    <div className="w-full flex justify-center">
                                      <div className="relative w-32 h-24 group/before">
                                        <img src={r.photo_url} alt="조치 전" className="w-full h-full object-cover rounded border cursor-pointer" onClick={() => window.open(r.photo_url!, '_blank')} />
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="w-full flex justify-center">
                                      <div className="w-32 h-24 bg-gray-50 border border-dashed border-gray-200 rounded flex items-center justify-center text-gray-400 text-xs">사진 없음</div>
                                    </div>
                                  )}
                                  <div className="text-left bg-gray-50 p-2 rounded">
                                    <strong className="text-red-600 break-keep mr-1">[지적]</strong>
                                    <span className="text-gray-700 break-words leading-relaxed">{r.findings || '-'}</span>
                                  </div>
                                </div>
                              </td>

                              <td className="px-3 py-3 text-xs border-l border-gray-100 relative group/photo align-top w-[30%]">
                                <div className="flex flex-col gap-2">
                                  {r.after_photo_url === 'N/A' ? (
                                    <div className="w-full flex justify-center">
                                      <div className="flex flex-col items-center gap-2">
                                        <div className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 border border-gray-300 rounded text-xs text-gray-500">
                                          <Ban className="h-3.5 w-3.5" />
                                          <span className="font-medium">해당 없음</span>
                                        </div>
                                        <button
                                          onClick={() => toggleNotApplicable(r.id, r.after_photo_url)}
                                          disabled={uploadingResultId === r.id}
                                          className="text-[10px] text-blue-500 hover:text-blue-700 hover:underline transition-colors disabled:opacity-50"
                                        >
                                          취소
                                        </button>
                                      </div>
                                    </div>
                                  ) : r.after_photo_url ? (
                                    <div className="w-full flex justify-center">
                                      <div className="relative w-32 h-24">
                                        <img src={r.after_photo_url} alt="조치 후" className="w-full h-full object-cover rounded border cursor-pointer" onClick={() => window.open(r.after_photo_url!, '_blank')} />
                                        {/* 점점점 메뉴 버튼 */}
                                        <div className="absolute -top-2 -right-2 z-10">
                                          <button
                                            onClick={(e) => { e.stopPropagation(); setPhotoMenuOpen(photoMenuOpen === `after-${r.id}` ? null : `after-${r.id}`) }}
                                            className="p-1.5 bg-black/50 hover:bg-black/70 text-white rounded-full opacity-0 group-hover/photo:opacity-100 transition-opacity scale-90 shadow-md"
                                          >
                                            <MoreVertical className="h-3.5 w-3.5" />
                                          </button>
                                          {photoMenuOpen === `after-${r.id}` && (
                                            <div className="absolute right-0 mt-1 bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[110px] z-20">
                                              <button onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setEditingImage({ url: r.after_photo_url!, resultId: r.id }); setPhotoMenuOpen(null) }}
                                                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-100 transition-colors">
                                                <Crop className="h-3.5 w-3.5" /> 크롭/회전
                                              </button>
                                              <button onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); removeAfterPhoto(r.id, r.after_photo_url!); setPhotoMenuOpen(null) }}
                                                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50 transition-colors">
                                                <Trash2 className="h-3.5 w-3.5" /> 삭제
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="w-full flex justify-center">
                                      <div className="flex gap-1.5">
                                        <label className="flex flex-col items-center justify-center border border-gray-300 rounded px-3 py-2 hover:bg-green-50 hover:border-green-400 cursor-pointer text-xs text-gray-600 transition-colors">
                                          {uploadingResultId === r.id ? (
                                            <LoadingSpinner />
                                          ) : (
                                            <>
                                              <Plus className="h-4 w-4 mb-0.5 text-green-500" />
                                              <span className="font-medium text-[10px]">추가</span>
                                            </>
                                          )}
                                          <input type="file" accept="image/*" onChange={e => handleAfterPhotoUpload(r.id, e)} className="hidden" disabled={uploadingResultId === r.id} />
                                        </label>
                                        <button
                                          onClick={() => toggleNotApplicable(r.id, r.after_photo_url)}
                                          disabled={uploadingResultId === r.id}
                                          className="flex flex-col items-center justify-center border border-gray-300 rounded px-3 py-2 hover:bg-gray-100 hover:border-gray-400 text-xs text-gray-600 transition-colors disabled:opacity-50"
                                        >
                                          <Ban className="h-4 w-4 mb-0.5 text-gray-400" />
                                          <span className="font-medium text-[10px]">해당없음</span>
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                  {editingActionId === r.id ? (
                                    <div className="bg-blue-50 p-2 rounded flex flex-col gap-2 relative">
                                      <textarea
                                        autoFocus
                                        className="w-full text-xs p-2 border border-blue-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none bg-white"
                                        rows={3}
                                        value={tempActionText}
                                        onChange={(e) => setTempActionText(e.target.value)}
                                        placeholder="조치 내용을 입력하세요."
                                        disabled={uploadingResultId === r.id}
                                      />
                                      <div className="flex justify-end gap-1.5 mt-1">
                                        <button disabled={uploadingResultId === r.id} onClick={() => setEditingActionId(null)} className="px-2.5 py-1 text-[10px] bg-white border border-gray-300 text-gray-600 rounded hover:bg-gray-50 transition-colors">취소</button>
                                        <button disabled={uploadingResultId === r.id} onClick={() => handleSaveActionItem(r.id)} className="px-2.5 py-1 text-[10px] bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">저장</button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div
                                      className="text-left bg-blue-50 p-2 rounded relative group/action cursor-pointer hover:bg-blue-100 transition-colors min-h-[38px] border border-transparent hover:border-blue-200"
                                      onClick={() => { setEditingActionId(r.id); setTempActionText(r.action_items || '') }}
                                    >
                                      <strong className="text-blue-600 break-keep mr-1">[조치]</strong>
                                      <span className="text-gray-700 break-words leading-relaxed">
                                        {r.action_items || <span className="text-blue-400/80 text-[11px]">클릭하여 내용을 입력하세요.</span>}
                                      </span>
                                      <div className="absolute top-1.5 right-1.5 opacity-0 group-hover/action:opacity-100 text-blue-500 bg-white p-1 rounded-full shadow-sm border border-blue-100">
                                        <Edit2 className="h-3 w-3" />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </td>

                              {i === 0 && (
                                <td rowSpan={rowCount} className="px-2 py-3 text-center align-middle border-l border-gray-100">
                                  <div className="flex flex-row gap-1 items-center justify-center">
                                    <button onClick={() => setShowDetail(ins.id)} title="상세보기" className="p-1.5 text-blue-600 hover:bg-blue-50 rounded border border-transparent hover:border-blue-100 transition-colors">
                                      <Eye className="h-4 w-4" />
                                    </button>
                                    <button onClick={() => handlePdfExport(ins.id)} disabled={pdfExporting} title="PDF 보고서" className="p-1.5 text-blue-500 hover:bg-blue-50 rounded border border-transparent hover:border-blue-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                                      <FileText className="h-4 w-4" />
                                    </button>
                                    <button onClick={() => { setEditingId(ins.id); setShowForm(true) }} title="수정" className="p-1.5 text-orange-600 hover:bg-orange-50 rounded border border-transparent hover:border-orange-100 transition-colors">
                                      <Edit2 className="h-4 w-4" />
                                    </button>
                                    {deleteConfirmId === ins.id ? (
                                      <div className="flex items-center gap-1">
                                        <button onClick={() => handleDelete(ins.id)} className="px-1.5 py-1 text-[10px] bg-red-600 hover:bg-red-700 text-white rounded">확인</button>
                                        <button onClick={() => setDeleteConfirmId(null)} className="px-1.5 py-1 text-[10px] bg-gray-200 hover:bg-gray-300 text-gray-700 rounded">취소</button>
                                      </div>
                                    ) : (
                                      <button onClick={() => setDeleteConfirmId(ins.id)} title="삭제" className="p-1.5 text-red-500 hover:bg-red-50 rounded border border-transparent hover:border-red-100 transition-colors">
                                        <Trash2 className="h-4 w-4" />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              )}
                            </tr>
                          ))
                        ) : (
                          <tr className="hover:bg-gray-50 bg-white">
                            <td className="px-2 py-3 text-center align-middle border-r border-gray-100">
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-blue-100 text-blue-800">
                                {ins.inspection_type}
                              </span>
                            </td>
                            <td className="px-2 py-3 text-center align-middle border-r border-gray-100">
                              <div className="flex flex-col items-center gap-2">
                                {ins.site_before_photo ? (
                                  <img src={ins.site_before_photo} alt="전경사진" className="w-24 h-16 object-cover rounded border cursor-pointer" onClick={() => window.open(ins.site_before_photo!, '_blank')} />
                                ) : (
                                  <div className="w-24 h-16 bg-gray-50 border border-dashed border-gray-200 rounded flex items-center justify-center text-gray-400 text-[10px]">사진 없음</div>
                                )}
                                <div className="text-gray-900 font-medium text-xs whitespace-nowrap">
                                  {ins.inspection_date ? ins.inspection_date.substring(2) : ''}
                                </div>
                                <div className="text-xs text-gray-600 line-clamp-2 leading-snug" title={ins.inspection_team || ''}>
                                  {ins.inspection_team || '-'}
                                </div>
                              </div>
                            </td>

                            <td className="px-3 py-3 text-center align-middle text-xs text-gray-400 border-l border-gray-100">지적사항 없음</td>
                            <td className="px-3 py-3 text-center align-middle text-gray-300 border-l border-gray-100">-</td>

                            <td className="px-2 py-3 text-center align-middle border-l border-gray-100">
                              <div className="flex flex-row gap-1 items-center justify-center">
                                <button onClick={() => setShowDetail(ins.id)} title="상세보기" className="p-1.5 text-blue-600 hover:bg-blue-50 rounded border border-transparent hover:border-blue-100 transition-colors">
                                  <Eye className="h-4 w-4" />
                                </button>
                                <button onClick={() => handlePdfExport(ins.id)} title="PDF 보고서" className="p-1.5 text-blue-500 hover:bg-blue-50 rounded border border-transparent hover:border-blue-100 transition-colors">
                                  <FileText className="h-4 w-4" />
                                </button>
                                <button onClick={() => { setEditingId(ins.id); setShowForm(true) }} title="수정" className="p-1.5 text-orange-600 hover:bg-orange-50 rounded border border-transparent hover:border-orange-100 transition-colors">
                                  <Edit2 className="h-4 w-4" />
                                </button>
                                {deleteConfirmId === ins.id ? (
                                  <div className="flex items-center gap-1">
                                    <button onClick={() => handleDelete(ins.id)} className="px-1.5 py-1 text-[10px] bg-red-600 hover:bg-red-700 text-white rounded">확인</button>
                                    <button onClick={() => setDeleteConfirmId(null)} className="px-1.5 py-1 text-[10px] bg-gray-200 hover:bg-gray-300 text-gray-700 rounded">취소</button>
                                  </div>
                                ) : (
                                  <button onClick={() => setDeleteConfirmId(ins.id)} title="삭제" className="p-1.5 text-red-500 hover:bg-red-50 rounded border border-transparent hover:border-red-100 transition-colors">
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* 등록/수정 모달 */}
      {showForm && (
        <SafetyInspectionForm
          projectId={projectId}
          project={project}
          editingId={editingId}
          onClose={() => { setShowForm(false); setEditingId(null) }}
          onSaved={() => { setShowForm(false); setEditingId(null); loadInspections() }}
        />
      )}

      {/* 상세보기 모달 */}
      {showDetail && (
        <SafetyInspectionDetail
          inspectionId={showDetail}
          project={project}
          onClose={() => setShowDetail(null)}
          onEdit={(id: string) => { setShowDetail(null); setEditingId(id); setShowForm(true) }}
          onExport={handlePdfExport}
        />
      )}

      {/* 삭제 확인 모달용 오버레이 (리스트 내에서 처리하므로 별도 불필요) */}

      {/* 사진 편집 모달 (ImageEditor) */}
      {editingImage && (
        <ImageEditor
          imageUrl={editingImage.url}
          onSave={handleSaveEditedAfterPhoto}
          onClose={() => setEditingImage(null)}
        />
      )}

      {/* PDF 생성 로딩 오버레이 */}
      {pdfExporting && (
        <div className="fixed inset-0 bg-black/40 z-[9999] flex items-center justify-center">
          <div className="bg-white rounded-xl px-8 py-6 flex flex-col items-center gap-3 shadow-xl">
            <div className="h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-700 font-medium">보고서 생성 중...</p>
          </div>
        </div>
      )}
    </div>
  )
}
