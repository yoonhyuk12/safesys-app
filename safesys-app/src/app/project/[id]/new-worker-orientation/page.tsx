'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { ArrowLeft, Plus, Trash2, Download, X, PenTool, Users } from 'lucide-react'
import { Project } from '@/lib/projects'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import SignatureModal from '@/components/project/SignatureModal'
import { downloadNewWorkerOrientationExcel } from '@/lib/excel/new-worker-orientation-export'

interface WorkerEntry {
  job_type: string
  name: string
  signature?: string
}

interface MentorEntry {
  affiliation: string
  position: string
  name: string
}

interface MentorSignature {
  name: string
  signature: string
}

interface OrientationRecord {
  id: string
  project_id: string
  created_by: string
  orientation_date: string
  start_time: string
  end_time: string
  location: string
  workers: WorkerEntry[]
  mentors: MentorEntry[]
  main_work_types: string[]
  risk_factors: string[]
  mentor_signatures: MentorSignature[]
  manager_name: string
  manager_signature: string
  remarks: string
  created_at: string
  updated_at: string
}

const emptyFormData = (opts?: { location?: string; mentorDefaults?: MentorEntry }) => ({
  orientation_date: new Date().toISOString().split('T')[0],
  start_time: '07:00',
  end_time: '07:20',
  location: opts?.location || '',
  workers: Array.from({ length: 8 }, () => ({ job_type: '', name: '', signature: '' })) as WorkerEntry[],
  mentors: [
    opts?.mentorDefaults || { affiliation: '', position: '', name: '' },
  ] as MentorEntry[],
  main_work_types: ['', '', '', '', ''] as string[],
  risk_factors: ['', '', '', '', ''] as string[],
  mentor_signatures: [
    { name: opts?.mentorDefaults?.name || '', signature: '' },
  ] as MentorSignature[],
  manager_name: opts?.mentorDefaults?.name || '',
  manager_signature: '',
  remarks: '',
})

export default function NewWorkerOrientationPage() {
  const { user, userProfile, loading: authLoading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const projectId = params.id as string

  const [project, setProject] = useState<Project | null>(null)
  const [projectOwner, setProjectOwner] = useState<{ company_name?: string; position?: string; full_name?: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [records, setRecords] = useState<OrientationRecord[]>([])
  const [showAddForm, setShowAddForm] = useState(false)
  const getFormDefaults = () => ({
    location: project
      ? (project.site_address_detail
        ? `${project.site_address} ${project.site_address_detail}`
        : project.site_address || '')
      : '',
    mentorDefaults: {
      affiliation: projectOwner?.company_name || '',
      position: projectOwner?.position || '',
      name: projectOwner?.full_name || '',
    } as MentorEntry,
  })
  const [formData, setFormData] = useState(emptyFormData())
  const [saving, setSaving] = useState(false)
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null)

  // 서명 모달 상태
  const [showSignatureModal, setShowSignatureModal] = useState(false)
  const [signatureTarget, setSignatureTarget] = useState<
    { type: 'mentor'; index: number } | { type: 'manager' } | { type: 'worker'; index: number } | null
  >(null)

  const handleBack = () => {
    router.push(`/project/${projectId}`)
  }

  // 프로젝트 및 소유자 정보 로드
  useEffect(() => {
    if (!user || !projectId) return
    const loadProject = async () => {
      const { data } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single()
      if (data) {
        setProject(data as any)
        // 프로젝트 소유자 프로필 조회
        if ((data as any).created_by) {
          const { data: ownerProfile } = await supabase
            .from('user_profiles')
            .select('company_name, position, full_name')
            .eq('id', (data as any).created_by)
            .single()
          if (ownerProfile) setProjectOwner(ownerProfile)
        }
      }
    }
    loadProject()
  }, [user, projectId])

  // 기록 로드
  const loadRecords = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    const { data, error } = await (supabase as any)
      .from('new_worker_orientations')
      .select('*')
      .eq('project_id', projectId)
      .order('orientation_date', { ascending: false })
    if (!error && data) {
      setRecords(data as OrientationRecord[])
    }
    setLoading(false)
  }, [projectId])

  useEffect(() => {
    if (user && projectId) loadRecords()
  }, [user, projectId, loadRecords])

  // 폼 초기화
  const resetForm = () => {
    setFormData(emptyFormData(getFormDefaults()))
    setEditingRecordId(null)
    setShowAddForm(false)
  }

  // 기록 수정 모드
  const handleEdit = (record: OrientationRecord) => {
    const workers = [...(record.workers || [])]
    while (workers.length < 8) workers.push({ job_type: '', name: '', signature: '' })
    const mentors = [...(record.mentors || [])]
    if (mentors.length === 0) mentors.push({ affiliation: '', position: '', name: '' })
    const mainWorkTypes = [...(record.main_work_types || [])]
    while (mainWorkTypes.length < 5) mainWorkTypes.push('')
    const riskFactors = [...(record.risk_factors || [])]
    while (riskFactors.length < 5) riskFactors.push('')
    const mentorSigs = [...(record.mentor_signatures || [])]
    if (mentorSigs.length === 0) mentorSigs.push({ name: '', signature: '' })

    setFormData({
      orientation_date: record.orientation_date || new Date().toISOString().split('T')[0],
      start_time: record.start_time || '',
      end_time: record.end_time || '',
      location: record.location || '',
      workers,
      mentors,
      main_work_types: mainWorkTypes,
      risk_factors: riskFactors,
      mentor_signatures: mentorSigs,
      manager_name: record.manager_name || '',
      manager_signature: record.manager_signature || '',
      remarks: record.remarks || '',
    })
    setEditingRecordId(record.id)
    setShowAddForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // 저장
  const handleSave = async () => {
    if (!user) return

    // 최소한 날짜는 필수
    if (!formData.orientation_date) {
      alert('날짜를 입력해주세요.')
      return
    }

    setSaving(true)
    try {
      // 빈 항목 필터링하지 않고 그대로 저장 (8칸/5칸 유지)
      const dataToSave = {
        project_id: projectId,
        created_by: user.id,
        orientation_date: formData.orientation_date,
        start_time: formData.start_time,
        end_time: formData.end_time,
        location: formData.location,
        workers: formData.workers,
        mentors: formData.mentors,
        main_work_types: formData.main_work_types,
        risk_factors: formData.risk_factors,
        mentor_signatures: formData.mentor_signatures,
        manager_name: formData.manager_name,
        manager_signature: formData.manager_signature,
        remarks: formData.remarks,
        updated_at: new Date().toISOString(),
      }

      if (editingRecordId) {
        const { error } = await (supabase as any)
          .from('new_worker_orientations')
          .update(dataToSave)
          .eq('id', editingRecordId)
        if (error) throw error
      } else {
        const { error } = await (supabase as any)
          .from('new_worker_orientations')
          .insert([dataToSave])
        if (error) throw error

        // 텔레그램 알림 발송 (발주청) - 신규 등록 시에만
        try {
          const { data: projectTgData } = await supabase
            .from('projects')
            .select('client_telegram_id, client_app_code')
            .eq('id', projectId)
            .single()

          if (projectTgData?.client_telegram_id || projectTgData?.client_app_code) {
            const workerCount = formData.workers.filter((w) => w.name?.trim()).length
            const telegramMessage =
              `👷 <b>신규근로자 둘러보기 등록 알림</b>\n\n` +
              `🏗️ <b>현장:</b> ${project?.project_name || ''}\n` +
              `📅 <b>일자:</b> ${formData.orientation_date}\n` +
              `⏰ <b>시간:</b> ${formData.start_time || '-'} ~ ${formData.end_time || '-'}\n` +
              `📍 <b>장소:</b> ${formData.location || '(미입력)'}\n` +
              `👥 <b>인원:</b> ${workerCount}명\n` +
              `👤 <b>확인자:</b> ${formData.manager_name || '(미입력)'}` +
              `\n\n🔗 <a href="https://safesys.vercel.app/">안전관리시스템 바로가기</a>`

            await fetch('/api/telegram', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'direct',
                chatId: projectTgData.client_telegram_id || undefined,
                projectId,
                recipients: { client: true, contractor: false },
                message: telegramMessage,
              }),
            })
          }
        } catch (telegramError) {
          console.error('텔레그램 발송 오류:', telegramError)
        }
      }

      alert(editingRecordId ? '수정되었습니다.' : '저장되었습니다.')
      resetForm()
      loadRecords()
    } catch (err: any) {
      alert('저장 실패: ' + (err.message || '알 수 없는 오류'))
    } finally {
      setSaving(false)
    }
  }

  // 삭제
  const handleDelete = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return
    const { error } = await (supabase as any)
      .from('new_worker_orientations')
      .delete()
      .eq('id', id)
    if (!error) {
      loadRecords()
    } else {
      alert('삭제 실패: ' + error.message)
    }
  }

  // 엑셀 다운로드
  const handleExcelDownload = (record: OrientationRecord) => {
    downloadNewWorkerOrientationExcel(record, project?.project_name || '')
  }

  // 서명 모달 열기
  const openSignatureModal = (target: { type: 'mentor'; index: number } | { type: 'manager' } | { type: 'worker'; index: number }) => {
    setSignatureTarget(target)
    setShowSignatureModal(true)
  }

  // 서명 저장
  const handleSignatureSave = (signatureData: string) => {
    if (!signatureTarget) return
    if (signatureTarget.type === 'worker') {
      const newWorkers = [...formData.workers]
      newWorkers[signatureTarget.index] = {
        ...newWorkers[signatureTarget.index],
        signature: signatureData,
      }
      setFormData({ ...formData, workers: newWorkers })
    } else if (signatureTarget.type === 'mentor') {
      const newSigs = [...formData.mentor_signatures]
      newSigs[signatureTarget.index] = {
        ...newSigs[signatureTarget.index],
        signature: signatureData,
      }
      setFormData({ ...formData, mentor_signatures: newSigs })
    } else {
      setFormData({ ...formData, manager_signature: signatureData })
    }
    setShowSignatureModal(false)
    setSignatureTarget(null)
  }

  // 요일 구하기
  const getDayOfWeek = (dateStr: string) => {
    const days = ['일', '월', '화', '수', '목', '금', '토']
    const d = new Date(dateStr)
    return days[d.getDay()]
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
              className="mr-4 p-2 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="text-base sm:text-xl font-bold text-gray-900 truncate">
              {project?.project_name || '신규근로자 둘러보기'}
            </h1>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto py-4 px-2 sm:px-4">
        {/* 새로 작성 버튼 */}
        {!showAddForm && (
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <h2 className="text-lg font-bold text-white truncate">신규근로자 둘러보기 일지</h2>
              <a
                href="https://drive.google.com/uc?export=download&id=1TR7vjr7Km1BEBK3HFWpAOyBK40iR9rjK"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 px-2.5 py-1.5 bg-white/90 text-blue-700 rounded-lg hover:bg-white text-xs sm:text-sm shadow-sm shrink-0"
                title="현장안내 일지 양식(hwpx) 다운로드"
              >
                <Download className="h-4 w-4" />
                <span className="whitespace-nowrap">양식(hwpx)</span>
              </a>
            </div>
            <button
              onClick={() => {
                setFormData(emptyFormData(getFormDefaults()))
                setEditingRecordId(null)
                setShowAddForm(true)
              }}
              className="flex items-center gap-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
            >
              <Plus className="h-4 w-4" />
              새로 작성
            </button>
          </div>
        )}

        {/* 작성 폼 */}
        {showAddForm && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-4 overflow-hidden">
            <div className="bg-blue-600 text-white px-4 py-3 flex items-center justify-between">
              <h2 className="font-semibold text-base sm:text-lg">
                {editingRecordId ? '둘러보기 일지 수정' : '신규근로자 둘러보기(1시간) 일지'}
              </h2>
              <button onClick={resetForm} className="text-white hover:text-blue-200">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-3 sm:p-4 space-y-4">
              {/* 기본 정보 */}
              <div className="border border-gray-300 rounded-lg overflow-hidden">
                {/* 날짜 */}
                <div className="flex items-center border-b border-gray-300">
                  <div className="bg-gray-100 px-3 py-2 font-semibold text-sm min-w-[80px] border-r border-gray-300">
                    날 짜
                  </div>
                  <div className="flex-1 px-3 py-2">
                    <input
                      type="date"
                      value={formData.orientation_date}
                      onChange={(e) => setFormData({ ...formData, orientation_date: e.target.value })}
                      className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                    />
                  </div>
                </div>

                {/* 사업명 */}
                <div className="flex items-center border-b border-gray-300">
                  <div className="bg-gray-100 px-3 py-2 font-semibold text-sm min-w-[80px] border-r border-gray-300">
                    사업명
                  </div>
                  <div className="flex-1 px-3 py-2 text-sm text-gray-700">
                    {project?.project_name || '로딩 중...'}
                  </div>
                </div>

                {/* 시간 + 장소 */}
                <div className="flex flex-col sm:flex-row border-b border-gray-300">
                  <div className="flex items-center border-b sm:border-b-0 border-gray-300">
                    <div className="bg-gray-100 px-3 py-2 font-semibold text-sm min-w-[80px] border-r border-gray-300">
                      시 간
                    </div>
                    <div className="flex items-center gap-1 px-3 py-2 flex-1 sm:border-r border-gray-300">
                      <input
                        type="time"
                        value={formData.start_time}
                        onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                        className="border border-gray-300 rounded px-2 py-1 text-sm w-[110px]"
                      />
                      <span className="text-gray-500">~</span>
                      <input
                        type="time"
                        value={formData.end_time}
                        onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                        className="border border-gray-300 rounded px-2 py-1 text-sm w-[110px]"
                      />
                    </div>
                  </div>
                  <div className="flex items-center">
                    <div className="bg-gray-100 px-3 py-2 font-semibold text-sm min-w-[80px] sm:min-w-[60px] border-r border-gray-300">
                      장 소
                    </div>
                    <div className="flex-1 px-3 py-2">
                      <input
                        type="text"
                        value={formData.location}
                        onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                        placeholder="현장안내 장소"
                        className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* 신규근로자(멘티) */}
              <div className="border border-gray-300 rounded-lg overflow-hidden">
                <div className="bg-gray-100 px-3 py-2 font-semibold text-sm border-b border-gray-300 flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  신규근로자(멘티)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-0">
                  {formData.workers.map((worker, index) => (
                    <div
                      key={index}
                      className={`flex items-center border-b border-gray-300 ${index % 2 === 0 ? 'sm:border-r border-gray-300' : ''}`}
                    >
                      <input
                        type="text"
                        value={worker.job_type}
                        onChange={(e) => {
                          const newWorkers = [...formData.workers]
                          newWorkers[index] = { ...newWorkers[index], job_type: e.target.value }
                          setFormData({ ...formData, workers: newWorkers })
                        }}
                        placeholder={`직종 ${index + 1}`}
                        className="w-[30%] px-2 py-2 text-sm border-r border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                      <input
                        type="text"
                        value={worker.name}
                        onChange={(e) => {
                          const newWorkers = [...formData.workers]
                          newWorkers[index] = { ...newWorkers[index], name: e.target.value }
                          setFormData({ ...formData, workers: newWorkers })
                        }}
                        placeholder={`성명 ${index + 1}`}
                        className="flex-1 min-w-0 px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                      {worker.name.trim() ? (
                        worker.signature ? (
                          <button
                            type="button"
                            onClick={() => openSignatureModal({ type: 'worker', index })}
                            className="flex items-center gap-1 px-2 py-1 mx-1 text-xs text-green-700 bg-green-50 border border-green-300 rounded shrink-0"
                          >
                            <img src={worker.signature} alt="서명" className="h-5" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openSignatureModal({ type: 'worker', index })}
                            className="flex items-center gap-0.5 px-2 py-1 mx-1 text-xs text-gray-500 hover:text-blue-600 hover:bg-blue-50 border border-gray-300 rounded shrink-0"
                          >
                            <PenTool className="h-3 w-3" />
                            서명
                          </button>
                        )
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>

              {/* 현장안내자(멘토) */}
              <div className="border border-gray-300 rounded-lg overflow-hidden">
                <div className="bg-gray-100 px-3 py-2 font-semibold text-sm border-b border-gray-300">
                  현장안내자(멘토)
                </div>
                {formData.mentors.map((mentor, index) => (
                  <div key={index} className="flex flex-col sm:flex-row border-b border-gray-300">
                    <div className="flex-1 flex items-center border-b sm:border-b-0 border-gray-200">
                      <span className="text-sm text-gray-500 px-2 min-w-[40px]">소속:</span>
                      <input
                        type="text"
                        value={mentor.affiliation}
                        onChange={(e) => {
                          const newMentors = [...formData.mentors]
                          newMentors[index] = { ...newMentors[index], affiliation: e.target.value }
                          setFormData({ ...formData, mentors: newMentors })
                        }}
                        className="flex-1 px-2 py-2 text-sm border-r border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    </div>
                    <div className="flex-1 flex items-center border-b sm:border-b-0 border-gray-200">
                      <span className="text-sm text-gray-500 px-2 min-w-[40px]">직책:</span>
                      <input
                        type="text"
                        value={mentor.position}
                        onChange={(e) => {
                          const newMentors = [...formData.mentors]
                          newMentors[index] = { ...newMentors[index], position: e.target.value }
                          setFormData({ ...formData, mentors: newMentors })
                        }}
                        className="flex-1 px-2 py-2 text-sm border-r border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    </div>
                    <div className="flex-1 flex items-center">
                      <span className="text-sm text-gray-500 px-2 min-w-[40px]">성명:</span>
                      <input
                        type="text"
                        value={mentor.name}
                        onChange={(e) => {
                          const newMentors = [...formData.mentors]
                          newMentors[index] = { ...newMentors[index], name: e.target.value }
                          // 서명란 이름도 동기화
                          const newSigs = [...formData.mentor_signatures]
                          if (newSigs[index]) {
                            newSigs[index] = { ...newSigs[index], name: e.target.value }
                          }
                          setFormData({ ...formData, mentors: newMentors, mentor_signatures: newSigs })
                        }}
                        className="flex-1 px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    </div>
                    {formData.mentors.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const newMentors = formData.mentors.filter((_, i) => i !== index)
                          const newSigs = formData.mentor_signatures.filter((_, i) => i !== index)
                          setFormData({ ...formData, mentors: newMentors, mentor_signatures: newSigs })
                        }}
                        className="p-1 mx-1 text-red-400 hover:text-red-600"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
                <div className="flex justify-center py-2 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => {
                      setFormData({
                        ...formData,
                        mentors: [...formData.mentors, { affiliation: projectOwner?.company_name || '', position: '', name: '' }],
                        mentor_signatures: [...formData.mentor_signatures, { name: '', signature: '' }],
                      })
                    }}
                    className="flex items-center gap-1 px-3 py-1 text-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded"
                  >
                    <Plus className="h-4 w-4" />
                    현장안내자 추가
                  </button>
                </div>
              </div>

              {/* 주요공종 */}
              <div className="border border-gray-300 rounded-lg overflow-hidden">
                <div className="bg-gray-100 px-3 py-2 font-semibold text-sm border-b border-gray-300">
                  주요공종
                </div>
                {formData.main_work_types.map((item, index) => (
                  <div key={index} className="flex items-center border-b border-gray-300 last:border-b-0">
                    <span className="text-sm text-gray-400 px-3 min-w-[24px]">·</span>
                    <input
                      type="text"
                      value={item}
                      onChange={(e) => {
                        const newItems = [...formData.main_work_types]
                        newItems[index] = e.target.value
                        setFormData({ ...formData, main_work_types: newItems })
                      }}
                      placeholder={`주요공종 ${index + 1}`}
                      className="flex-1 px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                  </div>
                ))}
              </div>

              {/* 현장 내 위험요소 */}
              <div className="border border-gray-300 rounded-lg overflow-hidden">
                <div className="bg-gray-100 px-3 py-2 font-semibold text-sm border-b border-gray-300">
                  현장 내 위험요소
                </div>
                {formData.risk_factors.map((item, index) => (
                  <div key={index} className="flex items-center border-b border-gray-300 last:border-b-0">
                    <span className="text-sm text-gray-500 px-3 min-w-[30px] font-medium">
                      {'①②③④⑤'[index]}
                    </span>
                    <input
                      type="text"
                      value={item}
                      onChange={(e) => {
                        const newItems = [...formData.risk_factors]
                        newItems[index] = e.target.value
                        setFormData({ ...formData, risk_factors: newItems })
                      }}
                      placeholder={`위험요소 ${index + 1}`}
                      className="flex-1 px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                  </div>
                ))}
              </div>

              {/* 서명 영역 */}
              <div className="border border-gray-300 rounded-lg overflow-hidden">
                <div className="bg-gray-100 px-3 py-2 font-semibold text-sm border-b border-gray-300 flex items-center gap-2">
                  <PenTool className="h-4 w-4" />
                  확인 서명
                </div>
                <div className="p-4 space-y-3">
                  <p className="text-xs text-gray-500 mb-2">
                    신규근로자를 대상으로 위 내용과 같이 현장안내를 실시 하였음을 확인합니다.
                  </p>
                  {/* 현장안내자 서명 */}
                  {formData.mentor_signatures.map((sig, index) => (
                    <div key={index} className="flex items-center gap-3">
                      <span className="text-sm font-medium min-w-[80px]">
                        현장안내자 {index + 1}
                      </span>
                      <input
                        type="text"
                        value={sig.name}
                        onChange={(e) => {
                          const newSigs = [...formData.mentor_signatures]
                          newSigs[index] = { ...newSigs[index], name: e.target.value }
                          setFormData({ ...formData, mentor_signatures: newSigs })
                        }}
                        placeholder="성명"
                        className="border border-gray-300 rounded px-2 py-1 text-sm w-24"
                      />
                      {sig.signature ? (
                        <button type="button" onClick={() => openSignatureModal({ type: 'mentor', index })}>
                          <img src={sig.signature} alt="서명" className="h-8 border rounded cursor-pointer hover:opacity-80" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => openSignatureModal({ type: 'mentor', index })}
                          className="px-3 py-1 text-sm rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
                        >
                          서명
                        </button>
                      )}
                    </div>
                  ))}

                  {/* 확인자(관리자) 서명 */}
                  <div className="flex items-center gap-3 pt-2 border-t border-gray-200">
                    <span className="text-sm font-medium min-w-[80px]">확인자(관리자)</span>
                    <input
                      type="text"
                      value={formData.manager_name}
                      onChange={(e) => setFormData({ ...formData, manager_name: e.target.value })}
                      placeholder="성명"
                      className="border border-gray-300 rounded px-2 py-1 text-sm w-24"
                    />
                    {formData.manager_signature ? (
                      <button type="button" onClick={() => openSignatureModal({ type: 'manager' })}>
                        <img src={formData.manager_signature} alt="서명" className="h-8 border rounded cursor-pointer hover:opacity-80" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openSignatureModal({ type: 'manager' })}
                        className="px-3 py-1 text-sm rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
                      >
                        서명
                      </button>
                    )}
                  </div>
                </div>
              </div>


              {/* 저장/취소 버튼 */}
              <div className="flex justify-end gap-2 pt-2">
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
            </div>
          </div>
        )}

        {/* 기록 목록 */}
        {loading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : records.length === 0 && !showAddForm ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
            <Users className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <button
              onClick={() => {
                setFormData(emptyFormData(getFormDefaults()))
                setEditingRecordId(null)
                setShowAddForm(true)
              }}
              className="flex items-center gap-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm mx-auto mb-3"
            >
              <Plus className="h-4 w-4" />
              새로 작성
            </button>
            <p className="text-gray-500 mb-1">작성된 기록이 없습니다.</p>
          </div>
        ) : (
          <div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 text-sm">
              <div className="overflow-x-auto">
                <table className="min-w-[700px] w-full divide-y divide-gray-200 text-center">
                  <thead className="bg-[#EBF1F5] text-gray-800 border-b border-gray-200">
                    <tr>
                      <th className="px-2 py-3 font-semibold whitespace-nowrap">일자/시간</th>
                      <th className="px-2 py-3 font-semibold whitespace-nowrap">장소</th>
                      <th className="px-2 py-3 font-semibold whitespace-nowrap">근로자</th>
                      <th className="px-2 py-3 font-semibold whitespace-nowrap">안내자</th>
                      <th className="px-2 py-3 font-semibold whitespace-nowrap w-16">삭제</th>
                      <th className="px-2 py-3 font-semibold whitespace-nowrap w-16">출력</th>
                      <th className="px-2 py-3 font-semibold whitespace-nowrap">비고</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {records.map((record) => {
                      const filledWorkers = (record.workers || []).filter(
                        (w: WorkerEntry) => w.name && w.name.trim() !== ''
                      )
                      const filledMentors = (record.mentors || []).filter((m: MentorEntry) => m.name)
                      return (
                        <tr
                          key={record.id}
                          className="cursor-pointer hover:bg-gray-50 transition-colors"
                          onClick={() => handleEdit(record)}
                        >
                          <td className="px-2 py-2 whitespace-nowrap text-gray-900 border-r border-gray-100">
                            <div className="font-medium">
                              {record.orientation_date} ({getDayOfWeek(record.orientation_date)})
                            </div>
                            {record.start_time && record.end_time && (
                              <div className="text-gray-500 text-xs mt-0.5">
                                {record.start_time} ~ {record.end_time}
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-2 text-gray-700 border-r border-gray-100">{record.location || '-'}</td>
                          <td className="px-2 py-2 whitespace-nowrap text-gray-700 border-r border-gray-100">
                            {filledWorkers.length}명
                          </td>
                          <td className="px-2 py-2 text-gray-700 border-r border-gray-100">
                            {filledMentors.length > 0 ? filledMentors.map(m => m.name).join(', ') : '-'}
                          </td>
                          <td className="px-2 py-2 whitespace-nowrap border-r border-gray-100" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => handleDelete(record.id)}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded-md mx-auto flex"
                              title="삭제"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                          <td className="px-2 py-2 whitespace-nowrap border-r border-gray-100" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => handleExcelDownload(record)}
                              className="p-1.5 text-green-600 hover:bg-green-50 rounded-md mx-auto flex"
                              title="엑셀 다운로드"
                            >
                              <Download className="h-4 w-4" />
                            </button>
                          </td>
                          <td className="px-2 py-2 text-gray-600 max-w-[150px] truncate" title={record.remarks || ''}>
                            {record.remarks || '-'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* 서명 모달 */}
      <SignatureModal
        isOpen={showSignatureModal}
        onClose={() => {
          setShowSignatureModal(false)
          setSignatureTarget(null)
        }}
        onSave={handleSignatureSave}
      />
    </div>
  )
}
