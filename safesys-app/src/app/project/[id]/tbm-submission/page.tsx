'use client'

import React, { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { ArrowLeft, Plus, Calendar, ChevronLeft, ChevronRight, ExternalLink, X, Download, Trash2, Printer, QrCode, BookOpen } from 'lucide-react'
import { Project } from '@/lib/projects'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import TBMSubmissionModal from '@/components/project/TBMSubmissionModal'
import { QRCodeSVG } from 'qrcode.react'
import { generateTBMSubmissionReport, generateTBMSubmissionBulkReport, TBMSubmissionFormData } from '@/lib/reports/tbm-submission-report'
import { downloadTBMSubmissionExcel, downloadTBMSubmissionBulkExcel } from '@/lib/excel/tbm-submission-export'
import CopyrightNotice from '@/components/common/CopyrightNotice'

interface TBMSubmission {
  id: string
  project_id?: string
  project_name: string
  headquarters: string
  branch: string
  meeting_date: string
  education_start_time?: string
  education_end_time?: string
  reporter_name?: string
  reporter_contact?: string
  submitted_at?: string
  status?: 'draft' | 'submitted'   // 임시저장 상태 구분
  [key: string]: any
}

export default function TBMSubmissionPage() {
  const { user, userProfile, loading: authLoading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const projectId = params.id as string

  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submissions, setSubmissions] = useState<TBMSubmission[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedDateSubmissions, setSelectedDateSubmissions] = useState<TBMSubmission[]>([])
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [downloadMenuId, setDownloadMenuId] = useState<string | null>(null)
  const [isPrintMode, setIsPrintMode] = useState(false)
  const [selectedPrintDates, setSelectedPrintDates] = useState<string[]>([])
  const [bulkDownloadingFormat, setBulkDownloadingFormat] = useState<'pdf' | 'excel' | null>(null)
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number } | null>(null)
  const [editingSubmission, setEditingSubmission] = useState<TBMSubmission | null>(null)
  const [qrSubmission, setQrSubmission] = useState<TBMSubmission | null>(null)
  const [showUpdateNotice, setShowUpdateNotice] = useState(true)

  const handleCloseUpdateNotice = () => {
    setShowUpdateNotice(false)
  }

  useEffect(() => {
    // 모달이 열려 있을 때는 데이터 새로고침 방지 (입력 내용 유지)
    if (user && projectId && !isModalOpen) {
      loadProject()
      loadSubmissions()
    }
  }, [user, projectId])

  useEffect(() => {
    if (project) {
      loadSubmissions()
    }
  }, [project, currentMonth])

  const loadProject = async () => {
    try {
      // 모달이 열려 있거나 이미 프로젝트가 로드된 경우 로딩 상태 변경 안함
      if (!isModalOpen && !project) {
        setLoading(true)
      }
      setError('')

      const { data, error: projectError } = await supabase
        .from('projects')
        .select(`
          *,
          user_profiles!projects_created_by_fkey (
            company_name
          )
        `)
        .eq('id', projectId)
        .single()

      if (projectError) {
        throw new Error(projectError.message)
      }

      setProject(data)
    } catch (err: any) {
      console.error('프로젝트 로드 실패:', err)
      setError(err.message || '프로젝트를 불러오는데 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const loadSubmissions = async () => {
    try {
      if (!projectId || !project) return

      // 현재 월의 시작과 끝 날짜 계산
      const year = currentMonth.getFullYear()
      const month = currentMonth.getMonth()
      const startOfMonthStr = `${year}-${String(month + 1).padStart(2, '0')}-01`
      const lastDay = new Date(year, month + 1, 0).getDate()
      const endOfMonthStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

      // 1. project_id로 조회
      const { data: dataById, error: errorById } = await supabase
        .from('tbm_submissions')
        .select('*')
        .eq('project_id', projectId)
        .gte('meeting_date', startOfMonthStr)
        .lte('meeting_date', endOfMonthStr)

      // 2. 프로젝트명+본부+지사로 조회
      const { data: dataByName, error: errorByName } = await supabase
        .from('tbm_submissions')
        .select('*')
        .eq('project_name', project.project_name)
        .eq('headquarters', project.managing_hq)
        .eq('branch', project.managing_branch)
        .gte('meeting_date', startOfMonthStr)
        .lte('meeting_date', endOfMonthStr)

      if (errorById || errorByName) {
        console.error('TBM 제출 기록 조회 오류:', errorById || errorByName)
        setSubmissions([])
        return
      }

      // 중복 제거 후 합치기
      const combinedData = [...(dataById || []), ...(dataByName || [])]
      const uniqueData = combinedData.filter((item, index, self) =>
        index === self.findIndex(t => t.id === item.id)
      )

      // 정렬: meeting_date 내림차순, submitted_at 내림차순
      uniqueData.sort((a, b) => {
        const dateCompare = (b.meeting_date || '').localeCompare(a.meeting_date || '')
        if (dateCompare !== 0) return dateCompare
        return (b.submitted_at || '').localeCompare(a.submitted_at || '')
      })

      setSubmissions(uniqueData)
    } catch (error) {
      console.error('TBM 제출 기록 조회 오류:', error)
      setSubmissions([])
    }
  }

  const handleBack = () => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(`project_${projectId}_from_subpage`, 'true')
    }
    router.push(`/project/${projectId}`)
  }

  const handlePrevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))
    setSelectedPrintDates([])
  }

  const handleNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))
    setSelectedPrintDates([])
  }

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear()
    const month = date.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const daysInMonth = lastDay.getDate()
    const startingDayOfWeek = firstDay.getDay()

    const days = []

    // 이전 달의 빈 칸
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null)
    }

    // 현재 달의 날짜
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i)
    }

    return days
  }

  const getSubmissionInfoForDate = (day: number) => {
    const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const dateSubs = submissions.filter(sub => sub.meeting_date?.startsWith(dateStr))
    const draftCount = dateSubs.filter(sub => sub.status === 'draft').length
    const submittedCount = dateSubs.filter(sub => sub.status !== 'draft').length
    return { draftCount, submittedCount, total: dateSubs.length }
  }

  const sanitizeFileNamePart = (value: string) => value.replace(/[\\/:*?"<>|]/g, '_').trim()

  const getSubmissionsForDates = (dates: string[]) => {
    return submissions
      .filter(submission =>
        dates.some(date => submission.meeting_date?.startsWith(date)) &&
        submission.status !== 'draft'  // 임시저장 제외
      )
      .sort((a, b) => {
        const dateCompare = (a.meeting_date || '').localeCompare(b.meeting_date || '')
        if (dateCompare !== 0) return dateCompare
        return (a.submitted_at || '').localeCompare(b.submitted_at || '')
      })
  }

  const togglePrintMode = () => {
    setIsPrintMode(prev => {
      const next = !prev
      if (!next) {
        setSelectedPrintDates([])
        setBulkDownloadingFormat(null)
      }
      return next
    })
    setDownloadMenuId(null)
  }

  const handleDateClick = (day: number) => {
    const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`

    if (isPrintMode) {
      const totalCount = submissions.filter(submission => submission.meeting_date?.startsWith(dateStr)).length
      if (totalCount === 0) return

      setSelectedPrintDates(prev =>
        prev.includes(dateStr)
          ? prev.filter(date => date !== dateStr)
          : [...prev, dateStr].sort((a, b) => a.localeCompare(b))
      )
      return
    }

    setSelectedDate(dateStr)

    // 해당 날짜의 제출 목록 필터링
    const dateSubmissions = submissions.filter(submission =>
      submission.meeting_date?.startsWith(dateStr)
    )
    setSelectedDateSubmissions(dateSubmissions)
  }

  const handleNewSubmission = () => {
    setEditingSubmission(null)
    setIsModalOpen(true)
  }

  const handleEditSubmission = (submission: TBMSubmission) => {
    setEditingSubmission(submission)
    setIsModalOpen(true)
  }

  const handleModalClose = () => {
    setIsModalOpen(false)
    setEditingSubmission(null)
    // 모달이 닫힐 때 제출 목록 새로고침
    loadSubmissions()
  }

  const handleSubmissionSuccess = () => {
    loadSubmissions()
    // 선택된 날짜가 있으면 해당 날짜의 제출 목록도 새로고침
    if (selectedDate) {
      const dateSubmissions = submissions.filter(submission =>
        submission.meeting_date?.startsWith(selectedDate)
      )
      setSelectedDateSubmissions(dateSubmissions)
    }
  }

  const buildFormData = (submission: TBMSubmission): TBMSubmissionFormData => {
    return {
      educationDate: submission.meeting_date || '',
      educationStartTime: submission.education_start_time || '',
      educationEndTime: submission.education_end_time || '',
      projectName: submission.project_name || project!.project_name,
      address: (submission as any).address || '',
      headquarters: submission.headquarters || project!.managing_hq,
      branch: submission.branch || project!.managing_branch,
      todayWork: (submission as any).today_work || '',
      personnelInput: (submission as any).personnel_count || '',
      newWorkerCount: (submission as any).new_worker_count?.toString() || '',
      equipmentInput: (submission as any).equipment_input || '',
      cctvUsage: (submission as any).cctv_usage || '',
      otherRemarks: (submission as any).other_remarks || '',
      potentialRisk1: (submission as any).potential_risk_1 || '',
      solution1: (submission as any).solution_1 || '',
      potentialRisk2: (submission as any).potential_risk_2 || '',
      solution2: (submission as any).solution_2 || '',
      potentialRisk3: (submission as any).potential_risk_3 || '',
      solution3: (submission as any).solution_3 || '',
      mainRiskSelection: (submission as any).main_risk_selection || '',
      mainRiskSolution: (submission as any).main_risk_solution || '',
      riskFactor1: (submission as any).risk_factor_1 || '',
      riskFactor2: (submission as any).risk_factor_2 || '',
      riskFactor3: (submission as any).risk_factor_3 || '',
      name: submission.reporter_name || '',
      signature: (submission as any).signature_url || '',
      constructionCompany: (submission as any).construction_company || '',
      photo: (submission as any).education_photo_url || ''
    }
  }

  const handleDownloadReport = async (submission: TBMSubmission, format: 'pdf' | 'excel') => {
    if (!project) return

    try {
      setDownloadingId(submission.id)
      setDownloadMenuId(null)

      const formData = buildFormData(submission)
      const dateStr = submission.meeting_date || new Date().toISOString().split('T')[0]
      const projectName = submission.project_name || project.project_name || '사업명'

      if (format === 'pdf') {
        const filename = `${projectName}_TBM_${dateStr}.pdf`
        await generateTBMSubmissionReport(formData, filename)
      } else {
        const filename = `${projectName}_TBM_${dateStr}.xlsx`
        await downloadTBMSubmissionExcel(formData, filename)
      }
    } catch (error: any) {
      console.error(`${format === 'pdf' ? 'PDF' : '엑셀'} 생성 오류:`, error)
      alert(`보고서 생성 중 오류가 발생했습니다: ${error.message || '알 수 없는 오류'}`)
    } finally {
      setDownloadingId(null)
    }
  }

  const handleBulkDownloadReport = async (format: 'pdf' | 'excel') => {
    if (!project) return

    const targetSubmissions = getSubmissionsForDates(selectedPrintDates)
    if (targetSubmissions.length === 0) {
      alert('출력할 날짜를 먼저 선택해주세요.')
      return
    }

    const confirmMessage = `선택한 날짜 ${selectedPrintDates.length}일, 총 ${targetSubmissions.length}건을 ${format.toUpperCase()}로 다운로드하시겠습니까?`
    if (!confirm(confirmMessage)) return

    try {
      setBulkDownloadingFormat(format)
      setDownloadMenuId(null)
      setBulkProgress({ current: 0, total: targetSubmissions.length })

      const projectName = sanitizeFileNamePart(targetSubmissions[0]?.project_name || project.project_name || '사업명')
      const startDate = targetSubmissions[0]?.meeting_date || new Date().toISOString().split('T')[0]
      const endDate = targetSubmissions[targetSubmissions.length - 1]?.meeting_date || startDate
      const dateLabel = startDate === endDate ? startDate : `${startDate}_${endDate}`

      if (format === 'pdf') {
        const formDataList = targetSubmissions.map(submission => buildFormData(submission))
        const filename = `${projectName}_TBM_${dateLabel}_일괄.pdf`
        await generateTBMSubmissionBulkReport(formDataList, filename, {
          onProgress: (current, total) => setBulkProgress({ current, total })
        })
      } else {
        const items = targetSubmissions.map((submission, index) => ({
          formData: buildFormData(submission),
          sheetName: `${submission.meeting_date || '날짜없음'}_${submission.reporter_name || '미입력'}_${String(index + 1).padStart(2, '0')}`
        }))
        const filename = `${projectName}_TBM_${dateLabel}_일괄.xlsx`
        await downloadTBMSubmissionBulkExcel(items, filename, {
          onProgress: (current, total) => setBulkProgress({ current, total })
        })
      }
    } catch (error: any) {
      console.error(`${format === 'pdf' ? 'PDF' : 'Excel'} 벌크 다운로드 오류:`, error)
      alert(`벌크 다운로드 중 오류가 발생했습니다: ${error.message || '알 수 없는 오류'}`)
    } finally {
      setBulkDownloadingFormat(null)
      setBulkProgress(null)
    }
  }

  const handleDeleteSubmission = async (submission: TBMSubmission) => {
    if (!confirm(`"${submission.reporter_name || '미입력'}" 님의 ${submission.meeting_date} 제출 기록을 삭제하시겠습니까?`)) {
      return
    }

    try {
      setDeletingId(submission.id)

      // Storage에서 사진 및 서명 파일 삭제
      const photoUrl = submission.education_photo_url as string | undefined
      const signatureUrl = submission.signature_url as string | undefined
      const marker = '/object/public/tbm-photos/'
      const filePaths: string[] = []

      for (const url of [photoUrl, signatureUrl]) {
        if (url) {
          const idx = url.indexOf(marker)
          if (idx !== -1) {
            filePaths.push(url.substring(idx + marker.length))
          }
        }
      }

      if (filePaths.length > 0) {
        const { error: storageError } = await supabase.storage
          .from('tbm-photos')
          .remove(filePaths)
        if (storageError) {
          console.error('파일 삭제 오류:', storageError)
        }
      }

      const { error } = await supabase
        .from('tbm_submissions')
        .delete()
        .eq('id', submission.id)

      if (error) {
        throw new Error(error.message)
      }

      // 제출 목록 새로고침
      await loadSubmissions()

      // 선택된 날짜의 제출 목록도 업데이트
      if (selectedDate) {
        setSelectedDateSubmissions(prev => prev.filter(s => s.id !== submission.id))
      }

      alert('삭제되었습니다.')
    } catch (error: any) {
      console.error('삭제 오류:', error)
      alert(`삭제 중 오류가 발생했습니다: ${error.message || '알 수 없는 오류'}`)
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

  if (!user) {
    router.push('/login')
    return null
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-red-600">{error}</div>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-600">프로젝트를 찾을 수 없습니다.</div>
      </div>
    )
  }

  const days = getDaysInMonth(currentMonth)
  const selectedPrintSubmissions = getSubmissionsForDates(selectedPrintDates)
  const bulkProgressCurrent = bulkProgress?.current ?? 0
  const bulkProgressTotal = bulkProgress?.total ?? 0
  const bulkProgressPercent = bulkProgressTotal > 0
    ? Math.min(100, Math.round((bulkProgressCurrent / bulkProgressTotal) * 100))
    : 0

  return (
    <div className="min-h-screen relative bg-gradient-to-b from-blue-950 via-blue-900 to-slate-900 flex flex-col">
      {/* 헤더 */}
      <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={handleBack}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div>
                <h1 className="text-xl font-bold text-gray-900">일일안전교육(AI TBM일지)</h1>
                <p className="text-sm text-gray-500 mt-1">{project.project_name}</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* 메인 컨텐츠 */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 좌측: 캘린더 */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow p-6">
              {/* 월 네비게이션 */}
              <div className="flex items-center justify-between mb-6">
                <button
                  onClick={handlePrevMonth}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <h2 className="text-lg font-semibold">
                  {currentMonth.getFullYear()}년 {currentMonth.getMonth() + 1}월
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleNextMonth}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                  <a
                    href="https://drive.google.com/file/d/1kfxEvhRvn2CO1nPQnaatiBgVe_ggwHgr/view?usp=drive_link"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-lg transition-colors hover:bg-gray-100 text-gray-700 inline-flex items-center"
                    title="TBM 이행가이드 보기"
                  >
                    <BookOpen className="h-5 w-5" />
                  </a>
                  <button
                    onClick={togglePrintMode}
                    className={`p-2 rounded-lg transition-colors ${isPrintMode
                      ? 'bg-amber-500 hover:bg-amber-600 text-white'
                      : 'hover:bg-gray-100 text-gray-700'
                      }`}
                    title={isPrintMode ? '프린터 모드 종료' : '프린터 모드'}
                  >
                    <Printer className="h-5 w-5" />
                  </button>
                  <button
                    onClick={handleNewSubmission}
                    disabled={isPrintMode}
                    className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="새 제출 등록"
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* 캘린더 그리드 */}
              <div className="grid grid-cols-7 gap-2">
                {/* 요일 헤더 */}
                {['일', '월', '화', '수', '목', '금', '토'].map((day, index) => (
                  <div
                    key={day}
                    className={`text-center font-semibold py-2 ${index === 0 ? 'text-red-500' : index === 6 ? 'text-blue-500' : 'text-gray-700'
                      }`}
                  >
                    {day}
                  </div>
                ))}

                {/* 날짜 */}
                {days.map((day, index) => {
                  if (day === null) {
                    return <div key={`empty-${index}`} className="aspect-square" />
                  }

                  const { draftCount, submittedCount, total } = getSubmissionInfoForDate(day)
                  const isToday =
                    new Date().getDate() === day &&
                    new Date().getMonth() === currentMonth.getMonth() &&
                    new Date().getFullYear() === currentMonth.getFullYear()

                  // 선택된 날짜 확인
                  const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                  const isSelected = !isPrintMode && selectedDate === dateStr
                  const isPrintSelected = isPrintMode && selectedPrintDates.includes(dateStr)

                  return (
                    <button
                      key={day}
                      onClick={() => handleDateClick(day)}
                      disabled={isPrintMode && total === 0}
                      className={`
                        aspect-square p-2 rounded-lg border transition-all disabled:cursor-not-allowed disabled:opacity-45
                        ${isPrintSelected ? 'border-amber-600 bg-amber-100 ring-2 ring-amber-500' : ''}
                        ${!isPrintSelected && isSelected ? 'border-blue-600 bg-blue-100 ring-2 ring-blue-500' : ''}
                        ${!isPrintSelected && !isSelected && isToday ? 'border-blue-500 bg-blue-50' : ''}
                        ${!isPrintSelected && !isSelected && !isToday ? 'border-gray-200 hover:border-gray-300' : ''}
                        ${!isPrintSelected && !isSelected && submittedCount > 0 ? 'bg-green-50' : ''}
                        ${!isPrintSelected && !isSelected && submittedCount === 0 && draftCount > 0 ? 'bg-purple-50/60' : ''}
                        ${!isPrintSelected && !isSelected && total === 0 ? 'hover:bg-gray-50' : ''}
                      `}
                    >
                      <div className={`text-sm font-medium ${isPrintSelected ? 'text-amber-900 font-bold' : isSelected ? 'text-blue-900 font-bold' : ''}`}>{day}</div>
                      {submittedCount > 0 && (
                        <div className={`text-xs mt-1 ${isPrintSelected ? 'text-amber-700 font-semibold' : isSelected ? 'text-blue-700 font-semibold' : 'text-green-600'}`}>
                          {submittedCount}건
                        </div>
                      )}
                      {draftCount > 0 && (
                        <div className="text-xs text-purple-600">
                          {draftCount}건(임시)
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* 우측: 제출 목록 영역 */}
          <div className="lg:col-span-1">
            {isPrintMode ? (
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-base font-semibold text-gray-900">프린터 모드</h4>
                  <button
                    onClick={() => setSelectedPrintDates([])}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    선택 초기화
                  </button>
                </div>
                <p className="text-sm text-gray-600 mb-4">
                  캘린더에서 출력할 날짜를 선택하세요. 선택한 날짜의 제출 기록을 벌크 다운로드할 수 있습니다.
                </p>
                <div className="text-sm text-gray-700 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                  선택 날짜 {selectedPrintDates.length}일 · 출력 대상 {selectedPrintSubmissions.length}건
                </div>
                {selectedPrintDates.length > 0 ? (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {selectedPrintDates.map(date => (
                      <button
                        key={date}
                        onClick={() => setSelectedPrintDates(prev => prev.filter(item => item !== date))}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs border border-amber-300 bg-amber-100 text-amber-800 hover:bg-amber-200"
                      >
                        {date}
                        <X className="h-3 w-3" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-gray-500 text-center py-4 bg-gray-50 rounded-lg mb-4">
                    선택된 날짜가 없습니다.
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleBulkDownloadReport('pdf')}
                    disabled={selectedPrintSubmissions.length === 0 || bulkDownloadingFormat !== null}
                    className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {bulkDownloadingFormat === 'pdf' ? (
                      <div className="h-4 w-4 mx-auto animate-spin rounded-full border-2 border-white border-t-transparent" />
                    ) : (
                      'PDF 벌크'
                    )}
                  </button>
                  <button
                    onClick={() => handleBulkDownloadReport('excel')}
                    disabled={selectedPrintSubmissions.length === 0 || bulkDownloadingFormat !== null}
                    className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {bulkDownloadingFormat === 'excel' ? (
                      <div className="h-4 w-4 mx-auto animate-spin rounded-full border-2 border-white border-t-transparent" />
                    ) : (
                      'Excel 벌크'
                    )}
                  </button>
                </div>
              </div>
            ) : selectedDate ? (
              <div className="bg-white rounded-lg shadow p-6">
                {selectedDate && (
                  <div className="mt-6">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-medium text-gray-700">
                        선택한 날짜
                      </h4>
                      <button
                        onClick={() => {
                          setSelectedDate(null)
                          setSelectedDateSubmissions([])
                        }}
                        className="p-1 hover:bg-gray-100 rounded transition-colors"
                      >
                        <X className="h-4 w-4 text-gray-500" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 p-3 rounded-lg mb-4">
                      <Calendar className="h-4 w-4" />
                      {selectedDate}
                    </div>

                    {/* 제출 목록 */}
                    {selectedDateSubmissions.length > 0 ? (
                      <div className="space-y-3">
                        <h4 className="text-sm font-medium text-gray-700">
                          제출 기록 ({selectedDateSubmissions.length}건)
                        </h4>
                        {selectedDateSubmissions.map((submission) => {
                          // 제출 시간 포맷팅 함수 (시:분만 표시)
                          const formatSubmittedAt = (submittedAt: string | null | undefined) => {
                            if (!submittedAt) return ''
                            try {
                              const date = new Date(submittedAt)
                              const hours = String(date.getHours()).padStart(2, '0')
                              const minutes = String(date.getMinutes()).padStart(2, '0')
                              return `${hours}:${minutes}`
                            } catch {
                              return ''
                            }
                          }

                          return (
                            <div
                              key={submission.id}
                              className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors cursor-pointer"
                              onClick={() => handleEditSubmission(submission)}
                            >
                              <div className="flex items-start gap-3">
                                {/* 교육 사진 썸네일 */}
                                {(submission as any).education_photo_url ? (
                                  <a
                                    href={(submission as any).education_photo_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex-shrink-0"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <img
                                      src={(submission as any).education_photo_url}
                                      alt="교육 사진"
                                      className="w-16 h-16 object-cover rounded-lg border border-gray-200"
                                    />
                                  </a>
                                ) : (
                                  <div className="w-16 h-16 flex-shrink-0 bg-gray-100 rounded-lg border border-gray-200 flex items-center justify-center">
                                    <span className="text-[10px] text-gray-400">사진없음</span>
                                  </div>
                                )}
                                {/* 정보 및 버튼 */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-gray-900">
                                          {submission.reporter_name || '미입력'}
                                        </span>
                                        {submission.status === 'draft' && (
                                          <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full font-medium">임시</span>
                                        )}
                                      </div>
                                      {submission.submitted_at && (
                                        <div className="text-xs text-gray-500 mt-1">
                                          제출: {formatSubmittedAt(submission.submitted_at)}
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {submission.status !== 'draft' && (
                                        <button
                                          onClick={(e) => { e.stopPropagation(); setQrSubmission(submission) }}
                                          className="p-2.5 hover:bg-purple-100 rounded-lg transition-colors border border-purple-200 bg-purple-50"
                                          title="QR 코드"
                                        >
                                          <QrCode className="h-5 w-5 text-purple-600" />
                                        </button>
                                      )}
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleDeleteSubmission(submission)
                                        }}
                                        disabled={deletingId === submission.id}
                                        className="p-2.5 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-red-200 bg-red-50"
                                        title="삭제"
                                      >
                                        {deletingId === submission.id ? (
                                          <div className="h-5 w-5 animate-spin rounded-full border-2 border-red-600 border-t-transparent" />
                                        ) : (
                                          <Trash2 className="h-5 w-5 text-red-600" />
                                        )}
                                      </button>
                                      {submission.status !== 'draft' && (
                                      <div className="relative">
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            setDownloadMenuId(downloadMenuId === submission.id ? null : submission.id)
                                          }}
                                          disabled={downloadingId === submission.id}
                                          className="p-2.5 hover:bg-blue-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-blue-200 bg-blue-50"
                                          title="보고서 다운로드"
                                        >
                                          {downloadingId === submission.id ? (
                                            <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                                          ) : (
                                            <Download className="h-5 w-5 text-blue-600" />
                                          )}
                                        </button>
                                        {downloadMenuId === submission.id && (
                                          <>
                                            <div className="fixed inset-0 z-10" onClick={() => setDownloadMenuId(null)} />
                                            <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 min-w-[140px]">
                                              <button
                                                onClick={(e) => { e.stopPropagation(); handleDownloadReport(submission, 'pdf') }}
                                                className="w-full px-4 py-2.5 text-sm text-left hover:bg-gray-50 rounded-t-lg flex items-center gap-2 text-gray-700"
                                              >
                                                <span className="text-red-500 font-bold text-xs">PDF</span>
                                                PDF 다운로드
                                              </button>
                                              <button
                                                onClick={(e) => { e.stopPropagation(); handleDownloadReport(submission, 'excel') }}
                                                className="w-full px-4 py-2.5 text-sm text-left hover:bg-gray-50 rounded-b-lg flex items-center gap-2 text-gray-700 border-t border-gray-100"
                                              >
                                                <span className="text-green-600 font-bold text-xs">XLS</span>
                                                엑셀 다운로드
                                              </button>
                                            </div>
                                          </>
                                        )}
                                      </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="text-sm text-gray-500 text-center py-4 bg-gray-50 rounded-lg">
                        해당 날짜에 제출 기록이 없습니다.
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow p-6 flex items-center justify-center min-h-[200px]">
                <p className="text-sm text-gray-500 text-center">
                  날짜를 선택하면<br />해당 날짜의 제출 기록을<br />확인할 수 있습니다.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="w-full px-4 py-6 [&_p]:!text-blue-200/70 [&_p:first-child]:!text-blue-100">
        <CopyrightNotice withDivider={false} />
      </footer>

      {bulkDownloadingFormat && (
        <div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[1px] flex items-center justify-center px-4">
          <div className="w-full max-w-sm bg-white rounded-xl shadow-2xl border border-gray-200 p-6 text-center">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
            <h3 className="text-base font-semibold text-gray-900">
              {bulkDownloadingFormat === 'pdf' ? 'PDF' : 'Excel'} 일괄 보고서 생성 중
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              파일을 준비하고 있습니다. 완료될 때까지 잠시만 기다려 주세요.
            </p>
            <p className="mt-3 text-xs font-medium text-gray-700">
              {bulkProgressCurrent}/{bulkProgressTotal} ({bulkProgressPercent}%)
            </p>
            <div className="mt-2 h-2.5 w-full rounded-full bg-gray-200 overflow-hidden">
              <div
                className="h-full bg-blue-600 transition-all duration-200"
                style={{ width: `${bulkProgressPercent}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* QR 코드 모달 */}
      {qrSubmission && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={() => setQrSubmission(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 relative"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 닫기 버튼 */}
            <button
              onClick={() => setQrSubmission(null)}
              className="absolute top-3 right-3 p-1.5 hover:bg-gray-100 rounded-full"
            >
              <X className="h-5 w-5 text-gray-500" />
            </button>

            {/* QR 코드 */}
            <div className="flex flex-col items-center gap-4">
              <h3 className="text-lg font-bold text-gray-900">AI TBM QR 코드</h3>
              <a
                href={`/tbm-view/${qrSubmission.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-white p-4 rounded-xl border-2 border-gray-100 hover:border-purple-400 hover:shadow-md transition-all cursor-pointer group"
                title="클릭하여 내용 보기"
              >
                <QRCodeSVG
                  value={`${window.location.origin}/tbm-view/${qrSubmission.id}`}
                  size={280}
                  level="M"
                />
                <p className="text-xs text-purple-500 text-center mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  클릭하여 내용 보기
                </p>
              </a>
              <div className="text-center space-y-1">
                <p className="text-sm font-medium text-gray-900">{qrSubmission.project_name}</p>
                <p className="text-xs text-gray-500">
                  {qrSubmission.meeting_date} | {qrSubmission.reporter_name || '미입력'}
                </p>
              </div>
              <p className="text-xs text-gray-400 text-center">
                QR을 스캔하거나 클릭하면 작업내용을 확인할 수 있습니다
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 5대 핵심 안전수칙 모달 */}
      {showUpdateNotice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={handleCloseUpdateNotice}>
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 flex flex-col items-center gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100">
              <span className="text-2xl">⚠️</span>
            </div>
            <div className="text-center">
              <p className="text-xs font-semibold text-red-600 uppercase tracking-widest mb-1">안전 공지</p>
              <p className="text-base font-bold text-gray-900 leading-snug">
                5대 핵심 안전수칙
              </p>
            </div>
            <ol className="w-full text-sm font-bold text-gray-900 leading-relaxed space-y-1.5 pl-1">
              <li><span className="text-red-600">1.</span> TBM 실시 철저</li>
              <li><span className="text-red-600">2.</span> 신규근로자 작업전 현장 둘러보기</li>
              <li><span className="text-red-600">3.</span> 건설기계 주변 접근금지, 신호수 배치</li>
              <li><span className="text-red-600">4.</span> 개인보호구 착용 철저</li>
              <li><span className="text-red-600">5.</span> 안전보건표지 설치</li>
            </ol>
            <p className="text-xs text-gray-600 text-center leading-relaxed border-t border-gray-200 pt-3 w-full">
              특수계약 조건에 따라 위 내용 불이행시<br />
              <span className="font-semibold text-red-600">작업중지</span> 될 수 있습니다.
            </p>
            <button
              onClick={handleCloseUpdateNotice}
              className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              확인
            </button>
          </div>
        </div>
      )}

      {/* TBM 제출 모달 */}
      {project && userProfile && (
        <TBMSubmissionModal
          isOpen={isModalOpen}
          onClose={handleModalClose}
          projectId={projectId}
          projectName={project.project_name}
          managingHq={project.managing_hq}
          managingBranch={project.managing_branch}
          projectCategory={project.project_category}
          userEmail={userProfile.email}
          selectedDate={selectedDate || undefined}
          onSuccess={handleSubmissionSuccess}
          editingSubmission={editingSubmission}
          onDraftSave={handleSubmissionSuccess}
        />
      )}
    </div>
  )
}
