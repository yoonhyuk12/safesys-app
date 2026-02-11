'use client'

import React, { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { ArrowLeft, Plus, Calendar, ChevronLeft, ChevronRight, History } from 'lucide-react'
import { Project } from '@/lib/projects'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import DailyInspectionModal from '@/components/project/DailyInspectionModal'
import DailyInspectionSignatureModal from '@/components/project/DailyInspectionSignatureModal'

interface DailyInspection {
  id: string
  project_id: string
  inspection_date: string
  inspector_name: string
  inspection_items: string
  created_at: string
  created_by: string
}

interface InspectionItem {
  category: string
  item: string
  status: 'good' | 'caution' | 'danger' | ''
  memo: string
}

interface Signature {
  role: '공사감독' | '도급사' | '하도급사'
  name: string
  signatureData: string
}

export default function DailyInspectionPage() {
  const { user, userProfile, loading: authLoading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const projectId = params.id as string

  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isInspectionModalOpen, setIsInspectionModalOpen] = useState(false)
  const [inspections, setInspections] = useState<DailyInspection[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [isGeneratingAI, setIsGeneratingAI] = useState(false)
  const [inspectionItems, setInspectionItems] = useState<InspectionItem[]>([])
  const [workDescription, setWorkDescription] = useState('')
  const [leftPanelWidth, setLeftPanelWidth] = useState(50) // 퍼센트
  const [isDragging, setIsDragging] = useState(false)
  const [signatures, setSignatures] = useState<Signature[]>([])
  const [isSignatureModalOpen, setIsSignatureModalOpen] = useState(false)

  useEffect(() => {
    if (user && projectId) {
      loadProject()
      loadInspections()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, projectId])

  useEffect(() => {
    if (project) {
      loadInspections()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, currentMonth])

  const loadProject = async () => {
    try {
      setLoading(true)
      setError('')

      const { data, error: projectError } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single()

      if (projectError) throw new Error(projectError.message)
      if (!data) throw new Error('프로젝트를 찾을 수 없습니다.')

      setProject(data)
    } catch (err) {
      console.error('프로젝트 로드 실패:', err)
      setError((err as Error).message || '프로젝트를 불러오는데 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const loadInspections = async () => {
    try {
      const startDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1)
      const endDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0)

      const { data, error: inspectionError } = await supabase
        .from('daily_inspections')
        .select('*')
        .eq('project_id', projectId)
        .gte('inspection_date', startDate.toISOString().split('T')[0])
        .lte('inspection_date', endDate.toISOString().split('T')[0])
        .order('inspection_date', { ascending: false })

      if (inspectionError) throw inspectionError

      setInspections(data || [])
    } catch (err) {
      console.error('점검 데이터 로드 실패:', err)
    }
  }

  const handleBack = () => {
    // 프로젝트 메인으로 이동할 때 플래그 설정 (뒤로 가기 시 대시보드로 이동하도록)
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(`project_${projectId}_from_subpage`, 'true')
    }
    router.push(`/project/${projectId}`)
  }

  const handleGenerateAIInspection = async () => {
    if (!workDescription.trim()) {
      alert('오늘의 작업 내용을 먼저 입력해주세요.')
      return
    }

    setIsGeneratingAI(true)
    try {
      const prompt = `
당신은 건설현장 안전관리 전문가입니다.
나는 공사현장의 일일점검일지를 작성하려 합니다.

오늘의 작업 내용: "${workDescription}"

위 작업 내용에 대해 다음과 같이 점검 항목을 생성해주세요:

1) 산업안전보건기준에 따른 근로자 개인보호 및 기본 안전관리 항목 8개
   - 첫 번째 항목: "개인보호구(안전모, 안전화, 안전대 등) 착용 여부" (반드시 한 항목으로 통합)
   - 나머지 7개: 작업 전 안전교육, 안전난간 설치, 추락방지망, 정리정돈, 안전통로 확보 등

2) 건설기술진흥법 및 관련 고시 기준에 따른 해당 공종의 안전조치 항목 15개
   - "${workDescription}" 작업에 특화된 안전점검 항목
   - 해당 공종의 법적 안전기준 및 조치사항
   - 장비, 공법, 작업환경 등에 따른 구체적 점검사항

모든 항목은 "점검표 형식(여부 체크 가능)"으로 작성하고, 각 항목은 명확하고 구체적으로 표현해주세요.

응답 형식 (총 23개):
기본안전|안전모 착용 여부
기본안전|안전화 착용 여부
기본안전|안전대 착용 및 체결 여부
...
공종안전|[구체적 점검항목]
공종안전|[구체적 점검항목]
...

카테고리는 "기본안전" 8개, "공종안전" 15개로 구분해주세요.
`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: '건설현장 안전관리 전문가로서 일일 안전점검 체크리스트를 작성해주세요.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.7
        })
      })

      const data = await response.json()

      if (data.choices && data.choices[0]) {
        const content = data.choices[0].message.content
        const lines = content.split('\n').filter((line: string) => line.includes('|'))

        const items: InspectionItem[] = lines.map((line: string) => {
          const [category, item] = line.split('|').map((s: string) => s.trim())
          return {
            category: category || '기타',
            item: item || '',
            status: '' as const,
            memo: ''
          }
        })

        setInspectionItems(items)
        alert('AI가 점검 리스트를 생성했습니다. 각 항목의 상태를 체크해주세요.')
      }
    } catch (error) {
      console.error('AI 생성 오류:', error)
      alert('AI 점검 리스트 생성 중 오류가 발생했습니다.')
    } finally {
      setIsGeneratingAI(false)
    }
  }

  const handleItemStatusChange = (index: number, status: 'good' | 'caution' | 'danger') => {
    const newItems = [...inspectionItems]
    newItems[index].status = status
    setInspectionItems(newItems)
  }

  const handleBulkStatusChange = (status: 'good' | 'caution' | 'danger') => {
    const newItems = inspectionItems.map(item => ({
      ...item,
      status: status
    }))
    setInspectionItems(newItems)
  }

  const handleItemMemoChange = (index: number, memo: string) => {
    const newItems = [...inspectionItems]
    newItems[index].memo = memo
    setInspectionItems(newItems)
  }

  const handleItemTextChange = (index: number, newText: string) => {
    const newItems = [...inspectionItems]
    newItems[index].item = newText
    setInspectionItems(newItems)
  }

  const handleOpenSignatureModal = () => {
    if (!user || inspectionItems.length === 0) {
      alert('점검 항목을 먼저 생성해주세요.')
      return
    }

    const uncompletedItems = inspectionItems.filter(item => !item.status)
    if (uncompletedItems.length > 0) {
      const confirm = window.confirm(`${uncompletedItems.length}개 항목이 체크되지 않았습니다. 계속하시겠습니까?`)
      if (!confirm) return
    }

    setIsSignatureModalOpen(true)
  }

  const handleSaveWithSignatures = async (sigs: Signature[]) => {
    if (!user) return

    try {
      const { error } = await supabase
        .from('daily_inspections')
        .insert({
          project_id: projectId,
          inspection_date: new Date().toISOString().split('T')[0],
          inspector_name: userProfile?.full_name || '',
          inspection_items: JSON.stringify({
            work_description: workDescription,
            items: inspectionItems,
            signatures: sigs
          }),
          created_by: user.id
        })

      if (error) throw error

      alert('일일안전점검이 저장되었습니다.')
      setInspectionItems([])
      setWorkDescription('')
      setSignatures([])
      loadInspections()
    } catch (err) {
      console.error('저장 오류:', err)
      alert('점검 저장 중 오류가 발생했습니다.')
    }
  }

  const handleLoadPreviousInspection = async () => {
    try {
      // 가장 최근 점검표 가져오기
      const { data, error } = await supabase
        .from('daily_inspections')
        .select('*')
        .eq('project_id', projectId)
        .order('inspection_date', { ascending: false })
        .limit(1)
        .single()

      if (error) {
        if (error.code === 'PGRST116') {
          alert('이전 점검표가 없습니다.')
        } else {
          throw error
        }
        return
      }

      if (data && data.inspection_items) {
        const parsedData = JSON.parse(data.inspection_items)
        setWorkDescription(parsedData.work_description || '')
        setInspectionItems(parsedData.items || [])
        alert('이전 점검표를 불러왔습니다.')
      }
    } catch (err) {
      console.error('이전 점검표 로드 실패:', err)
      alert('이전 점검표를 불러오는데 실패했습니다.')
    }
  }

  const handleCloseModal = () => {
    setIsInspectionModalOpen(false)
    loadInspections()
  }

  const handlePrevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))
  }

  const handleNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))
  }

  const handleDateClick = (dateStr: string, e: React.MouseEvent) => {
    e.stopPropagation() // 부모 div의 onClick 이벤트 전파 방지
    setSelectedDate(dateStr === selectedDate ? null : dateStr)
  }

  const handleInspectionFormFocus = () => {
    // 점검표 작성 시 우측 패널 80% 확장 (좌측 20%)
    setLeftPanelWidth(20)
  }

  const handleMouseDown = () => {
    setIsDragging(true)
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging) {
      const container = e.currentTarget
      const rect = container.getBoundingClientRect()
      const newWidth = ((e.clientX - rect.left) / rect.width) * 100
      // 최소 20%, 최대 80%
      setLeftPanelWidth(Math.min(Math.max(newWidth, 20), 80))
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  useEffect(() => {
    if (isDragging) {
      const handleGlobalMouseUp = () => setIsDragging(false)
      window.addEventListener('mouseup', handleGlobalMouseUp)
      return () => window.removeEventListener('mouseup', handleGlobalMouseUp)
    }
  }, [isDragging])

  const getDaysInMonth = () => {
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const daysInMonth = lastDay.getDate()
    const startingDayOfWeek = firstDay.getDay()

    const days = []
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null)
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i)
    }
    return days
  }

  const hasInspectionOnDate = (day: number) => {
    const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return inspections.some(inspection => inspection.inspection_date === dateStr)
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
      <div className="min-h-screen bg-gradient-to-b from-blue-950 via-blue-900 to-slate-900">
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center h-16">
              <button onClick={handleBack} className="mr-4 p-2 text-gray-400 hover:text-gray-600">
                <ArrowLeft className="h-5 w-5" />
              </button>
              <h1 className="text-xl font-bold text-gray-900">일일안전점검</h1>
            </div>
          </div>
        </header>
        <main className="max-w-7xl mx-auto py-6 px-4">
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <div className="text-sm text-red-700">{error}</div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div
      className="min-h-screen relative bg-gradient-to-b from-blue-950 via-blue-900 to-slate-900"
      onClick={() => setLeftPanelWidth(50)}
    >
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl lg:max-w-none mx-auto px-4 sm:px-6 lg:px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center flex-1 min-w-0">
              <button onClick={handleBack} className="mr-2 lg:mr-4 p-2 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 flex-shrink-0">
                <ArrowLeft className="h-5 w-5" />
              </button>
              <h1 className="text-sm lg:text-xl font-bold text-gray-900 truncate">
                {project?.project_name} - 일일안전점검
              </h1>
            </div>
            <div className="text-xs lg:text-sm text-gray-700 flex-shrink-0 ml-2">
              <span className="font-medium hidden sm:inline">{userProfile?.full_name}</span>
              <span className="text-gray-500">({userProfile?.role === '시공사' ? '시' : userProfile?.role === '발주청' ? '발' : userProfile?.role === '감리단' ? '감' : userProfile?.role})</span>
            </div>
          </div>
        </div>
      </header>

      {/* 메인 콘텐츠 - 펼쳐진 파일철 */}
      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {/* 파일철 외곽 */}
        <div
          className="bg-yellow-200 p-2 lg:p-6 rounded-lg shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 파일철 내부 */}
          <div
            className="bg-white rounded-lg shadow-inner min-h-[600px] relative"
            onClick={(e) => e.stopPropagation()}
          >

            {/* 콘텐츠 영역 */}
            <div
              className="flex flex-col lg:flex-row relative"
              style={{ minHeight: '600px' }}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
            >
              {/* 상단/좌측 - 캘린더 */}
              <div
                className="p-2 lg:p-8 lg:pl-16 relative"
                style={{
                  width: window.innerWidth >= 1024 ? `${leftPanelWidth}%` : '100%',
                  minHeight: window.innerWidth >= 1024 ? 'auto' : '400px',
                  cursor: isDragging ? 'col-resize' : 'default'
                }}
                onClick={(e) => {
                  // 드래그 중이 아닐 때만 확장
                  if (!isDragging) {
                    setLeftPanelWidth(80)
                  }
                }}
              >
                {/* 모바일용 가로 구분선 - 캘린더 하단 */}
                <div className="absolute bottom-0 left-0 right-0 h-px bg-yellow-400 lg:hidden"></div>
                <div className="h-full flex flex-col">
                  <div className="flex items-center mb-6">
                    <Calendar className="h-6 w-6 text-blue-600 mr-3" />
                    <h2 className="text-xl font-semibold text-gray-900">점검 캘린더</h2>
                  </div>

                  <div className="flex items-center justify-between mb-4">
                    <button onClick={handlePrevMonth} className="p-2 hover:bg-gray-100 rounded-md">
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <h2 className="text-lg font-semibold">
                      {currentMonth.getFullYear()}년 {currentMonth.getMonth() + 1}월
                    </h2>
                    <button onClick={handleNextMonth} className="p-2 hover:bg-gray-100 rounded-md">
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-7 gap-2">
                    {['일', '월', '화', '수', '목', '금', '토'].map(day => (
                      <div key={day} className="text-center text-sm font-medium text-gray-500 py-2">
                        {day}
                      </div>
                    ))}
                    {getDaysInMonth().map((day, index) => {
                      if (day === null) {
                        return <div key={`empty-${index}`} className="aspect-square" />
                      }
                      const hasInspection = hasInspectionOnDate(day)
                      const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                      const isSelected = selectedDate === dateStr

                      return (
                        <button
                          key={day}
                          onClick={(e) => handleDateClick(dateStr, e)}
                          className={`
                            aspect-square flex items-center justify-center rounded-md text-sm
                            ${hasInspection ? 'bg-blue-100 text-blue-700 font-semibold' : 'text-gray-700'}
                            ${isSelected ? 'ring-2 ring-blue-500' : ''}
                            hover:bg-gray-100 transition-colors
                          `}
                        >
                          {day}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* 중앙 구분선 및 드래그 핸들 - 데스크톱만 */}
              <div
                className="hidden lg:block absolute w-1 bg-yellow-400 hover:bg-yellow-500 cursor-col-resize z-10 group"
                style={{
                  left: `${leftPanelWidth}%`,
                  top: 0,
                  bottom: 0,
                  height: '100%'
                }}
                onMouseDown={handleMouseDown}
              >
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-yellow-500 group-hover:bg-yellow-600 rounded-full p-2 shadow-md">
                  <div className="flex flex-col space-y-0.5">
                    <div className="w-1 h-1 bg-white rounded-full"></div>
                    <div className="w-1 h-1 bg-white rounded-full"></div>
                    <div className="w-1 h-1 bg-white rounded-full"></div>
                  </div>
                </div>
              </div>

              {/* 하단/우측 - 점검 작성 영역 */}
              <div
                className="p-2 lg:p-8 lg:pr-16 relative flex flex-col"
                style={{
                  width: window.innerWidth >= 1024 ? `${100 - leftPanelWidth}%` : '100%',
                  cursor: isDragging ? 'col-resize' : 'default'
                }}
                onClick={handleInspectionFormFocus}
              >
                <h2 className="text-lg font-semibold mb-4">일일 안전점검 작성</h2>

                {inspectionItems.length === 0 ? (
                  /* 점검 리스트가 없을 때 - AI 생성 UI */
                  <div className="flex-1 flex flex-col items-center justify-center space-y-4">
                    <div className="w-full max-w-md">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        오늘의 작업 내용
                      </label>
                      <textarea
                        value={workDescription}
                        onChange={(e) => setWorkDescription(e.target.value)}
                        placeholder="예: 철근 배근 작업, 콘크리트 타설 작업 등"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                        rows={3}
                        disabled={isGeneratingAI}
                      />
                    </div>
                    <div className="flex flex-wrap gap-4 items-start">
                      {/* AI 점검 리스트 생성 버튼 */}
                      <div className="relative">
                        <button
                          onClick={handleGenerateAIInspection}
                          disabled={!workDescription.trim() || isGeneratingAI}
                          className="relative flex flex-col items-center justify-center p-8 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors border-2 border-dashed border-blue-300 hover:border-blue-400 disabled:opacity-50 disabled:cursor-not-allowed w-[220px] h-[160px]"
                        >
                          {!isGeneratingAI ? (
                            <>
                              <Plus className="h-12 w-12 text-blue-600 mb-2" />
                              <span className="text-lg font-semibold text-blue-700">
                                AI로 점검 리스트 생성
                              </span>
                            </>
                          ) : (
                            <div className="flex flex-col items-center justify-center">
                              <LoadingSpinner />
                              <p className="text-sm font-semibold text-blue-700 mt-2">AI 생성 중...</p>
                            </div>
                          )}
                        </button>
                      </div>

                      {/* 이전 점검표 가져오기 버튼 */}
                      <button
                        onClick={handleLoadPreviousInspection}
                        disabled={isGeneratingAI}
                        className="flex flex-col items-center justify-center p-8 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors border-2 border-dashed border-gray-300 hover:border-gray-400 disabled:opacity-50 disabled:cursor-not-allowed w-[220px] h-[160px]"
                      >
                        <History className="h-12 w-12 text-gray-600 mb-2" />
                        <span className="text-lg font-semibold text-gray-700">
                          이전 점검표 가져오기
                        </span>
                      </button>
                    </div>
                  </div>
                ) : (
                  /* 점검 리스트가 있을 때 - 체크리스트 UI */
                  <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mb-4">
                      <div className="text-sm text-blue-900">
                        <strong>작업 내용:</strong> {workDescription}
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto pr-2">
                      <table className="w-full text-sm border-collapse">
                        <thead className="sticky top-0 bg-white border-b-2 border-gray-300 z-[5]">
                          <tr>
                            <th className="text-left py-2 px-2 font-semibold text-gray-700 w-24">구분</th>
                            <th className="text-left py-2 px-2 font-semibold text-gray-700">점검항목</th>
                            <th className="text-center py-2 px-2 font-semibold text-gray-700 w-32">상태</th>
                            <th className="text-left py-2 px-2 font-semibold text-gray-700 w-48">코멘트</th>
                          </tr>
                          {/* 일괄 체크 버튼 행 */}
                          <tr className="bg-gray-50">
                            <td className="py-1 px-2"></td>
                            <td className="py-1 px-2"></td>
                            <td className="py-1 px-2">
                              <div className="flex justify-center space-x-1">
                                <button
                                  onClick={() => handleBulkStatusChange('good')}
                                  className="px-2 py-0.5 rounded text-xs bg-green-500 text-white hover:bg-green-600 transition-colors"
                                  title="모두 양호로 체크"
                                >
                                  ○
                                </button>
                                <button
                                  onClick={() => handleBulkStatusChange('caution')}
                                  className="px-2 py-0.5 rounded text-xs bg-yellow-500 text-white hover:bg-yellow-600 transition-colors"
                                  title="모두 주의로 체크"
                                >
                                  △
                                </button>
                                <button
                                  onClick={() => handleBulkStatusChange('danger')}
                                  className="px-2 py-0.5 rounded text-xs bg-red-500 text-white hover:bg-red-600 transition-colors"
                                  title="모두 위험으로 체크"
                                >
                                  ✕
                                </button>
                              </div>
                            </td>
                            <td className="py-1 px-2"></td>
                          </tr>
                        </thead>
                        <tbody>
                          {inspectionItems.map((item, index) => (
                            <tr key={index} className="border-b border-gray-200 hover:bg-gray-50">
                              <td className="py-2 px-2 text-xs text-gray-600">{item.category}</td>
                              <td className="py-2 px-2">
                                <input
                                  type="text"
                                  value={item.item}
                                  onChange={(e) => handleItemTextChange(index, e.target.value)}
                                  className="w-full px-2 py-1 text-sm border border-transparent hover:border-gray-300 focus:border-blue-500 rounded focus:outline-none bg-transparent hover:bg-white focus:bg-white transition-colors"
                                />
                              </td>
                              <td className="py-2 px-2">
                                <div className="flex justify-center space-x-1">
                                  <button
                                    onClick={() => handleItemStatusChange(index, 'good')}
                                    className={`px-2 py-1 rounded text-xs transition-colors ${
                                      item.status === 'good'
                                        ? 'bg-green-500 text-white'
                                        : 'bg-gray-100 text-gray-600 hover:bg-green-100'
                                    }`}
                                  >
                                    ○
                                  </button>
                                  <button
                                    onClick={() => handleItemStatusChange(index, 'caution')}
                                    className={`px-2 py-1 rounded text-xs transition-colors ${
                                      item.status === 'caution'
                                        ? 'bg-yellow-500 text-white'
                                        : 'bg-gray-100 text-gray-600 hover:bg-yellow-100'
                                    }`}
                                  >
                                    △
                                  </button>
                                  <button
                                    onClick={() => handleItemStatusChange(index, 'danger')}
                                    className={`px-2 py-1 rounded text-xs transition-colors ${
                                      item.status === 'danger'
                                        ? 'bg-red-500 text-white'
                                        : 'bg-gray-100 text-gray-600 hover:bg-red-100'
                                    }`}
                                  >
                                    ✕
                                  </button>
                                </div>
                              </td>
                              <td className="py-2 px-2">
                                <input
                                  type="text"
                                  value={item.memo}
                                  onChange={(e) => handleItemMemoChange(index, e.target.value)}
                                  placeholder="코멘트 입력"
                                  className="w-full px-2 py-1 text-sm border border-gray-300 hover:border-gray-400 focus:border-blue-500 rounded focus:outline-none bg-white transition-colors"
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex space-x-2 mt-4 pt-4 border-t border-gray-200">
                      <button
                        onClick={() => {
                          if (confirm('작성 중인 내용을 삭제하시겠습니까?')) {
                            setInspectionItems([])
                            setWorkDescription('')
                            setSignatures([])
                          }
                        }}
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        취소
                      </button>
                      <button
                        onClick={handleOpenSignatureModal}
                        className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                      >
                        서명
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* 점검 추가 모달 */}
      {project && (
        <DailyInspectionModal
          isOpen={isInspectionModalOpen}
          onClose={handleCloseModal}
          project={project}
        />
      )}

      {/* 서명 모달 */}
      <DailyInspectionSignatureModal
        isOpen={isSignatureModalOpen}
        onClose={() => setIsSignatureModalOpen(false)}
        onSave={handleSaveWithSignatures}
        currentUserName={userProfile?.full_name || ''}
        initialSignatures={signatures}
      />
    </div>
  )
}
