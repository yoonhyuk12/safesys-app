'use client'

// 공사감독일지 — TBM 제출일을 표시하는 캘린더와 '감독일지 작성'(엑셀 생성) 진입점, 서버 저장 없음

import React, { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { ArrowLeft, ChevronLeft, ChevronRight, FileText } from 'lucide-react'
import { Project } from '@/lib/projects'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import CopyrightNotice from '@/components/common/CopyrightNotice'
import SupervisorDiaryGenerator from '@/components/project/SupervisorDiaryGenerator'

const toDateStr = (year: number, month: number, day: number) =>
  `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`

const todayStr = () => {
  const now = new Date()
  return toDateStr(now.getFullYear(), now.getMonth(), now.getDate())
}

export default function SupervisorDiaryPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const projectId = params.id as string

  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tbmDates, setTbmDates] = useState<string[]>([])
  const [selectedDate, setSelectedDate] = useState<string>(todayStr())
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [generatorOpen, setGeneratorOpen] = useState(false)

  const loadProject = useCallback(async () => {
    try {
      setError('')
      const { data, error: projectError } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single()

      if (projectError) throw new Error(projectError.message)
      setProject(data as Project)
    } catch (err: unknown) {
      console.error('프로젝트 로드 실패:', err)
      setError(err instanceof Error ? err.message : '프로젝트를 불러오는데 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  // 해당 월의 TBM 제출일 조회 (캘린더 * 마크 표시용)
  const loadTbmDates = useCallback(async () => {
    if (!project) return
    try {
      const year = currentMonth.getFullYear()
      const month = currentMonth.getMonth()
      const startOfMonth = toDateStr(year, month, 1)
      const endOfMonth = toDateStr(year, month, new Date(year, month + 1, 0).getDate())

      const [{ data: byId }, { data: byName }] = await Promise.all([
        supabase
          .from('tbm_submissions')
          .select('meeting_date')
          .eq('project_id', projectId)
          .gte('meeting_date', startOfMonth)
          .lte('meeting_date', `${endOfMonth}T23:59:59`),
        supabase
          .from('tbm_submissions')
          .select('meeting_date')
          .eq('project_name', project.project_name)
          .eq('headquarters', project.managing_hq)
          .eq('branch', project.managing_branch)
          .gte('meeting_date', startOfMonth)
          .lte('meeting_date', `${endOfMonth}T23:59:59`),
      ])

      const dates = new Set(
        [...(byId || []), ...(byName || [])]
          .map(row => (row as { meeting_date: string }).meeting_date?.slice(0, 10))
          .filter(Boolean) as string[]
      )
      setTbmDates(Array.from(dates))
    } catch (err) {
      console.error('TBM 날짜 조회 오류:', err)
      setTbmDates([])
    }
  }, [projectId, project, currentMonth])

  useEffect(() => {
    if (user && projectId) loadProject()
  }, [user, projectId, loadProject])

  useEffect(() => {
    if (user && project) loadTbmDates()
  }, [user, project, loadTbmDates])

  const handleBack = () => {
    router.push(`/project/${projectId}`)
  }

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear()
    const month = date.getMonth()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const startingDayOfWeek = new Date(year, month, 1).getDay()

    const days: (number | null)[] = []
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null)
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i)
    }
    return days
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
    <div className="min-h-screen relative bg-gradient-to-b from-blue-950 via-blue-900 to-slate-900 flex flex-col">
      {/* 헤더 */}
      <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={handleBack}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900">AI 공사감독 일지</h1>
              <p className="text-sm text-gray-500 mt-1">{project.project_name}</p>
            </div>
          </div>
        </div>
      </header>

      {/* 메인 콘텐츠 */}
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="max-w-md mx-auto">
          <div className="bg-white rounded-lg shadow p-4">
            {/* 상단: 월 + 작성 버튼(우측 상단) */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">
                {currentMonth.getFullYear()}년 {currentMonth.getMonth() + 1}월
              </h2>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
                <button
                  onClick={() => setGeneratorOpen(true)}
                  className="ml-1 inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:from-emerald-600 hover:to-teal-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 shadow-md hover:shadow-lg transition-all text-xs font-semibold"
                >
                  <FileText className="h-4 w-4" />
                  감독일지 작성
                </button>
              </div>
            </div>

            {/* 캘린더 그리드 */}
            <div className="grid grid-cols-7 gap-1">
              {['일', '월', '화', '수', '목', '금', '토'].map((day, index) => (
                <div
                  key={day}
                  className={`text-center text-sm font-semibold py-1 ${
                    index === 0 ? 'text-red-500' : index === 6 ? 'text-blue-500' : 'text-gray-700'
                  }`}
                >
                  {day}
                </div>
              ))}

              {days.map((day, index) => {
                if (day === null) {
                  return <div key={`empty-${index}`} className="aspect-square" />
                }

                const dateStr = toDateStr(currentMonth.getFullYear(), currentMonth.getMonth(), day)
                const hasTbm = tbmDates.includes(dateStr)
                const isSelected = selectedDate === dateStr
                const isToday = dateStr === todayStr()

                return (
                  <button
                    key={day}
                    onClick={() => setSelectedDate(dateStr)}
                    className={`
                      relative aspect-square p-1 rounded-lg border text-sm transition-all
                      ${isSelected ? 'border-blue-600 bg-blue-100 ring-2 ring-blue-500 font-bold text-blue-900' : ''}
                      ${!isSelected && isToday ? 'border-blue-500 bg-blue-50' : ''}
                      ${!isSelected && !isToday ? 'border-gray-200 hover:border-gray-300 hover:bg-gray-50' : ''}
                    `}
                  >
                    {hasTbm && (
                      <span className="absolute top-0 right-1 text-purple-600 font-bold leading-none" title="TBM 제출됨">*</span>
                    )}
                    <div className="font-medium">{day}</div>
                  </button>
                )
              })}
            </div>

            {/* 범례 */}
            <div className="flex items-center gap-3 mt-3 text-xs text-gray-500">
              <span className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded bg-blue-50 border border-blue-500" /> 오늘
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="text-purple-600 font-bold">*</span> TBM 제출
              </span>
            </div>
          </div>

          <p className="mt-3 text-center text-xs text-blue-100/70">
            달력에서 TBM 제출일을 확인하고, &lsquo;감독일지 작성&rsquo;으로 기간을 선택해 엑셀을 생성합니다. 별도 저장은 하지 않습니다.
          </p>
        </div>
      </main>

      <footer className="w-full px-4 py-6 [&_p]:!text-blue-200/70 [&_p:first-child]:!text-blue-100">
        <CopyrightNotice withDivider={false} />
      </footer>

      {/* 공사감독일지 생성 모달 플로우 */}
      <SupervisorDiaryGenerator
        isOpen={generatorOpen}
        onClose={() => setGeneratorOpen(false)}
        projectId={projectId}
        projectName={project.project_name}
        managingHq={project.managing_hq}
        managingBranch={project.managing_branch}
        defaultEndDate={selectedDate}
      />
    </div>
  )
}
