'use client'

import React, { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { ArrowLeft, Plus, Calendar, ChevronLeft, ChevronRight, Edit2, Trash2, X, FileText } from 'lucide-react'
import { Project } from '@/lib/projects'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import TBMSafetyInspectionModal from '@/components/project/TBMSafetyInspectionModal'
import { generateTBMSafetyInspectionReport } from '@/lib/reports/tbm-safety-inspection-report'

export default function TBMSafetyInspectionPage() {
  const { user, userProfile, loading: authLoading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const projectId = params.id as string

  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [inspections, setInspections] = useState<any[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedDateInspections, setSelectedDateInspections] = useState<any[]>([])
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingInspection, setEditingInspection] = useState<any | null>(null)
  const [showTemplateInfoModal, setShowTemplateInfoModal] = useState(false)

  useEffect(() => {
    if (user && projectId) {
      loadProject()
      loadInspections()
    }
  }, [user, projectId])

  useEffect(() => {
    if (project) {
      loadInspections()
    }
  }, [project, currentMonth])

  const loadProject = async () => {
    try {
      setLoading(true)
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

  const loadInspections = async () => {
    try {
      if (!projectId) return

      // 현재 월의 시작과 끝 날짜 계산
      const year = currentMonth.getFullYear()
      const month = currentMonth.getMonth()
      const startOfMonthStr = `${year}-${String(month + 1).padStart(2, '0')}-01`
      const lastDay = new Date(year, month + 1, 0).getDate()
      const endOfMonthStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

      const { data, error } = await supabase
        .from('tbm_safety_inspections')
        .select('*')
        .eq('project_id', projectId)
        .gte('tbm_date', startOfMonthStr)
        .lte('tbm_date', endOfMonthStr)
        .order('tbm_date', { ascending: false })

      if (error) {
        console.error('점검 기록 조회 오류:', error)
        setInspections([])
        return
      }

      setInspections(data || [])
    } catch (error) {
      console.error('점검 기록 조회 오류:', error)
      setInspections([])
    }
  }

  const handleBack = () => {
    // 프로젝트 메인으로 이동할 때 플래그 설정 (뒤로 가기 시 대시보드로 이동하도록)
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(`project_${projectId}_from_subpage`, 'true')
    }
    router.push(`/project/${projectId}`)
  }

  const handlePrevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))
  }

  const handleNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))
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

  const handleDateClick = (day: number) => {
    const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    setSelectedDate(dateStr)

    // 해당 날짜의 점검 목록 필터링
    const dateInspections = inspections.filter(inspection =>
      inspection.tbm_date?.startsWith(dateStr)
    )
    setSelectedDateInspections(dateInspections)
  }

  const getInspectionCountForDate = (day: number) => {
    const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return inspections.filter(check => check.tbm_date?.startsWith(dateStr)).length
  }

  const handleModalClose = () => {
    setIsModalOpen(false)
    setEditingInspection(null)
    // 모달이 닫힐 때 점검 목록 새로고침
    loadInspections()
  }

  const handleEdit = (inspection: any) => {
    setEditingInspection(inspection)
    setIsModalOpen(true)
  }

  const handleDelete = async (inspectionId: string) => {
    if (!confirm('정말 이 점검 기록을 삭제하시겠습니까?')) {
      return
    }

    try {
      const { error } = await supabase
        .from('tbm_safety_inspections')
        .delete()
        .eq('id', inspectionId)

      if (error) {
        console.error('삭제 오류:', error)
        alert('점검 기록 삭제에 실패했습니다.')
        return
      }

      alert('점검 기록이 삭제되었습니다.')
      loadInspections()

      // 선택된 날짜의 점검 목록도 업데이트
      if (selectedDate) {
        const updatedInspections = selectedDateInspections.filter(
          inspection => inspection.id !== inspectionId
        )
        setSelectedDateInspections(updatedInspections)
      }
    } catch (err) {
      console.error('삭제 중 오류 발생:', err)
      alert('점검 기록 삭제 중 오류가 발생했습니다.')
    }
  }

  const handleGenerateReport = async (inspection: any) => {
    if (!project) {
      alert('프로젝트 정보를 불러올 수 없습니다.')
      return
    }

    try {
      await generateTBMSafetyInspectionReport({
        inspection,
        project
      })
    } catch (error) {
      console.error('보고서 생성 오류:', error)
      alert('보고서 생성 중 오류가 발생했습니다.')
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
                <h1 className="text-xl font-bold text-gray-900">TBM안전활동 점검표(감독)</h1>
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
                <button
                  onClick={handleNextMonth}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
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

                  const inspectionCount = getInspectionCountForDate(day)
                  const isToday =
                    new Date().getDate() === day &&
                    new Date().getMonth() === currentMonth.getMonth() &&
                    new Date().getFullYear() === currentMonth.getFullYear()

                  return (
                    <button
                      key={day}
                      onClick={() => handleDateClick(day)}
                      className={`
                        aspect-square p-2 rounded-lg border transition-all
                        ${isToday ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}
                        ${inspectionCount > 0 ? 'bg-green-50' : 'hover:bg-gray-50'}
                      `}
                    >
                      <div className="text-sm font-medium">{day}</div>
                      {inspectionCount > 0 && (
                        <div className="text-xs text-green-600 mt-1">
                          {inspectionCount}건
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* 우측: + 버튼 및 점검 목록 영역 */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold mb-4">점검 등록</h3>
              <button
                onClick={async () => {
                  // 이전 점검 기록이 있는지 확인 (가장 최근 기록)
                  try {
                    const { data: inspections, error } = await supabase
                      .from('tbm_safety_inspections')
                      .select('*')
                      .eq('project_id', projectId)
                      .order('tbm_date', { ascending: false })
                      .order('created_at', { ascending: false })
                      .limit(1)

                    if (error) {
                      console.error('이전 점검 기록 조회 오류:', error)
                    }

                    const latestInspection = inspections && inspections.length > 0 ? inspections[0] : null

                    if (latestInspection) {
                      // 이전 기록이 있으면 날짜만 오늘로 변경하고 서명만 제외한 나머지 필드 채우기
                      // 로컬 시간 기준 오늘 날짜 구하기 (YYYY-MM-DD 형식)
                      const now = new Date()
                      const year = now.getFullYear()
                      const month = String(now.getMonth() + 1).padStart(2, '0')
                      const day = String(now.getDate()).padStart(2, '0')
                      const today = `${year}-${month}-${day}`
                      const templateInspection = {
                        ...latestInspection,
                        id: undefined, // 새로 생성할 것이므로 id 제거
                        tbm_date: today, // 날짜만 오늘로 변경
                        signature: null, // 서명 제외
                        created_at: undefined,
                        updated_at: undefined
                      }
                      setEditingInspection(templateInspection)
                      // 팝업 표시
                      setShowTemplateInfoModal(true)
                    } else {
                      // 이전 기록이 없으면 새로 생성
                      setEditingInspection(null)
                      setIsModalOpen(true)
                    }
                  } catch (err) {
                    console.error('이전 점검 기록 조회 중 오류:', err)
                    setEditingInspection(null)
                    setIsModalOpen(true)
                  }
                }}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-lg transition-colors"
              >
                <Plus className="h-5 w-5" />
                새 점검 등록
              </button>

              {selectedDate && (
                <div className="mt-6">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium text-gray-700">
                      선택한 날짜
                    </h4>
                    <button
                      onClick={() => {
                        setSelectedDate(null)
                        setSelectedDateInspections([])
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

                  {/* 점검 목록 */}
                  {selectedDateInspections.length > 0 ? (
                    <div className="space-y-3">
                      <h4 className="text-sm font-medium text-gray-700">
                        점검 기록 ({selectedDateInspections.length}건)
                      </h4>
                      {selectedDateInspections.map((inspection) => {
                        // 제출 시간 포맷팅 함수 (시:분만 표시)
                        const formatCreatedAt = (createdAt: string | null | undefined) => {
                          if (!createdAt) return ''
                          try {
                            const date = new Date(createdAt)
                            const hours = String(date.getHours()).padStart(2, '0')
                            const minutes = String(date.getMinutes()).padStart(2, '0')
                            return `${hours}:${minutes}`
                          } catch {
                            return ''
                          }
                        }

                        return (
                          <div
                            key={inspection.id}
                            className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1">
                                <div className="text-xs text-gray-500 mt-1">
                                  입회자: {inspection.attendee || '미입력'}
                                </div>
                              </div>
                              {inspection.created_at && (
                                <div className="text-xs text-gray-400 ml-2 whitespace-nowrap">
                                  {formatCreatedAt(inspection.created_at)}
                                </div>
                              )}
                            </div>

                          {/* 수정/삭제/보고서 버튼 */}
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleEdit(inspection)}
                              className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition-colors text-sm"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                              수정
                            </button>
                            <button
                              onClick={() => handleDelete(inspection.id)}
                              className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg transition-colors text-sm"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              삭제
                            </button>
                            <button
                              onClick={() => handleGenerateReport(inspection)}
                              disabled
                              className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-gray-100 text-gray-400 rounded-lg transition-colors text-sm cursor-not-allowed"
                            >
                              <FileText className="h-3.5 w-3.5" />
                              보고서
                            </button>
                          </div>
                        </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500 text-center py-4 bg-gray-50 rounded-lg">
                      해당 날짜에 점검 기록이 없습니다.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* 템플릿 정보 팝업 */}
      {showTemplateInfoModal && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowTemplateInfoModal(false)}
        >
          <div 
            className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 relative"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 닫기 버튼 */}
            <button
              onClick={() => setShowTemplateInfoModal(false)}
              className="absolute top-4 right-4 p-1 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="h-5 w-5 text-gray-500" />
            </button>
            
            {/* 내용 */}
            <div className="pr-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                안내
              </h3>
              <p className="text-gray-700 mb-6">
                최근 입력정보 바탕으로 미리 작성했습니다(직접 작성 가능합니다)
              </p>
              
              {/* 확인 버튼 */}
              <div className="flex justify-end">
                <button
                  onClick={() => {
                    setShowTemplateInfoModal(false)
                    setIsModalOpen(true)
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  확인함
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TBM 안전활동 점검표 모달 */}
      {project && (
        <TBMSafetyInspectionModal
          isOpen={isModalOpen}
          onClose={handleModalClose}
          projectId={projectId}
          projectName={project.project_name}
          supervisor={project.supervisor_name}
          supervisorTitle={project.supervisor_position}
          selectedDate={selectedDate || undefined}
          projectBranch={project.managing_branch}
          projectHq={project.managing_hq}
          editingInspection={editingInspection}
        />
      )}
    </div>
  )
}
