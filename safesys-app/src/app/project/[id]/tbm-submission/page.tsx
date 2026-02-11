'use client'

import React, { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { ArrowLeft, Plus, Calendar, ChevronLeft, ChevronRight, ExternalLink, X, Download, Trash2, Printer } from 'lucide-react'
import { Project } from '@/lib/projects'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import TBMSubmissionModal from '@/components/project/TBMSubmissionModal'
import { generateTBMSubmissionReport, generateTBMSubmissionBulkReport, TBMSubmissionFormData } from '@/lib/reports/tbm-submission-report'
import { downloadTBMSubmissionExcel, downloadTBMSubmissionBulkExcel } from '@/lib/excel/tbm-submission-export'

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

  const getSubmissionCountForDate = (day: number) => {
    const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return submissions.filter(sub => sub.meeting_date?.startsWith(dateStr)).length
  }

  const sanitizeFileNamePart = (value: string) => value.replace(/[\\/:*?"<>|]/g, '_').trim()

  const getSubmissionsForDates = (dates: string[]) => {
    return submissions
      .filter(submission => dates.some(date => submission.meeting_date?.startsWith(date)))
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
      const submissionCount = submissions.filter(submission => submission.meeting_date?.startsWith(dateStr)).length
      if (submissionCount === 0) return

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
    setIsModalOpen(true)
  }

  const handleModalClose = () => {
    setIsModalOpen(false)
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
    <div className="min-h-screen relative bg-gradient-to-b from-blue-950 via-blue-900 to-slate-900">
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
                <h1 className="text-xl font-bold text-gray-900">일일안전교육(TBM일지)</h1>
                <p className="text-sm text-gray-500 mt-1">{project.project_name}</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* 메인 컨텐츠 */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
                  <button
                    onClick={togglePrintMode}
                    className={`p-2 rounded-lg transition-colors ${
                      isPrintMode
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
                    className={`text-center font-semibold py-2 ${
                      index === 0 ? 'text-red-500' : index === 6 ? 'text-blue-500' : 'text-gray-700'
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

                  const submissionCount = getSubmissionCountForDate(day)
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
                      disabled={isPrintMode && submissionCount === 0}
                      className={`
                        aspect-square p-2 rounded-lg border transition-all disabled:cursor-not-allowed disabled:opacity-45
                        ${isPrintSelected ? 'border-amber-600 bg-amber-100 ring-2 ring-amber-500' : ''}
                        ${!isPrintSelected && isSelected ? 'border-blue-600 bg-blue-100 ring-2 ring-blue-500' : ''}
                        ${!isPrintSelected && !isSelected && isToday ? 'border-blue-500 bg-blue-50' : ''}
                        ${!isPrintSelected && !isSelected && !isToday ? 'border-gray-200 hover:border-gray-300' : ''}
                        ${!isPrintSelected && !isSelected && submissionCount > 0 ? 'bg-green-50' : ''}
                        ${!isPrintSelected && !isSelected && submissionCount === 0 ? 'hover:bg-gray-50' : ''}
                      `}
                    >
                      <div className={`text-sm font-medium ${isPrintSelected ? 'text-amber-900 font-bold' : isSelected ? 'text-blue-900 font-bold' : ''}`}>{day}</div>
                      {submissionCount > 0 && (
                        <div className={`text-xs mt-1 ${isPrintSelected ? 'text-amber-700 font-semibold' : isSelected ? 'text-blue-700 font-semibold' : 'text-green-600'}`}>
                          {submissionCount}건
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
                            className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                          >
                            <div className="flex items-start gap-3">
                              {/* 교육 사진 썸네일 */}
                              {(submission as any).education_photo_url ? (
                                <a
                                  href={(submission as any).education_photo_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex-shrink-0"
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
                                    <div className="text-sm font-medium text-gray-900">
                                      {submission.reporter_name || '미입력'}
                                    </div>
                                    {submission.submitted_at && (
                                      <div className="text-xs text-gray-500 mt-1">
                                        제출: {formatSubmittedAt(submission.submitted_at)}
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => handleDeleteSubmission(submission)}
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
                                    <div className="relative">
                                      <button
                                        onClick={() => setDownloadMenuId(downloadMenuId === submission.id ? null : submission.id)}
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
                                              onClick={() => handleDownloadReport(submission, 'pdf')}
                                              className="w-full px-4 py-2.5 text-sm text-left hover:bg-gray-50 rounded-t-lg flex items-center gap-2 text-gray-700"
                                            >
                                              <span className="text-red-500 font-bold text-xs">PDF</span>
                                              PDF 다운로드
                                            </button>
                                            <button
                                              onClick={() => handleDownloadReport(submission, 'excel')}
                                              className="w-full px-4 py-2.5 text-sm text-left hover:bg-gray-50 rounded-b-lg flex items-center gap-2 text-gray-700 border-t border-gray-100"
                                            >
                                              <span className="text-green-600 font-bold text-xs">XLS</span>
                                              엑셀 다운로드
                                            </button>
                                          </div>
                                        </>
                                      )}
                                    </div>
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
        />
      )}
    </div>
  )
}
