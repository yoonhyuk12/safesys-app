'use client'

// 작업일보 (공사작업일지, 별지 제60호 서식) — 좌측 캘린더 / 우측 입력 폼

import React, { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { ArrowLeft, CalendarRange, ChevronLeft, ChevronRight, FileText, Plus, Printer, Save } from 'lucide-react'
import { Project } from '@/lib/projects'
import { supabase } from '@/lib/supabase'
import { downloadMonthlyWorkDailyReportsExcel } from '@/lib/excel/work-daily-report-export'
import { computeProgressRate, type WorkDailyReport } from '@/lib/work-daily-report/work-daily-report-types'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import WorkDailyReportForm from '@/components/project/WorkDailyReportForm'
import TBMClassificationPanel from '@/components/project/TBMClassificationPanel'
import CopyrightNotice from '@/components/common/CopyrightNotice'

const toDateStr = (year: number, month: number, day: number) =>
  `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`

const todayStr = () => {
  const now = new Date()
  return toDateStr(now.getFullYear(), now.getMonth(), now.getDate())
}

export default function WorkDailyReportPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const projectId = params.id as string

  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reportDates, setReportDates] = useState<string[]>([])
  const [tbmDates, setTbmDates] = useState<string[]>([])
  const [selectedDate, setSelectedDate] = useState<string>(todayStr())
  const [formOpen, setFormOpen] = useState(false)
  // 1단계: 공사기간 & AI 초안 작성 / 2단계: 일보 조정 입력 & 출력
  const [activeTab, setActiveTab] = useState<1 | 2>(1)
  const [currentMonth, setCurrentMonth] = useState(new Date())
  // 공사기간 (착공일/준공일) — 공정률 자동 계산 기준
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [savingPeriod, setSavingPeriod] = useState(false)
  const [bulkDownloading, setBulkDownloading] = useState(false)

  const loadProject = useCallback(async () => {
    try {
      setError('')
      const { data, error: projectError } = await supabase
        .from('projects')
        .select(`
          *,
          user_profiles!projects_created_by_fkey (
            full_name
          )
        `)
        .eq('id', projectId)
        .single()

      if (projectError) throw new Error(projectError.message)
      setProject(data)
      setPeriodStart(data?.construction_start_date || '')
      setPeriodEnd(data?.construction_end_date || '')
      // 공사기간이 이미 설정된 프로젝트는 2단계부터 시작
      setActiveTab(data?.construction_start_date && data?.construction_end_date ? 2 : 1)
    } catch (err: unknown) {
      console.error('프로젝트 로드 실패:', err)
      setError(err instanceof Error ? err.message : '프로젝트를 불러오는데 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  const loadReportDates = useCallback(async () => {
    try {
      const year = currentMonth.getFullYear()
      const month = currentMonth.getMonth()
      const startOfMonth = toDateStr(year, month, 1)
      const endOfMonth = toDateStr(year, month, new Date(year, month + 1, 0).getDate())

      const { data, error: datesError } = await supabase
        .from('work_daily_reports')
        .select('report_date')
        .eq('project_id', projectId)
        .gte('report_date', startOfMonth)
        .lte('report_date', endOfMonth)

      if (datesError) {
        console.error('작업일보 날짜 조회 오류:', datesError)
        setReportDates([])
        return
      }

      setReportDates((data || []).map(row => row.report_date))
    } catch (err) {
      console.error('작업일보 날짜 조회 오류:', err)
      setReportDates([])
    }
  }, [projectId, currentMonth])

  // 해당 월의 TBM 입력 날짜 조회 (캘린더 * 마크 표시용)
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
          .map(row => row.meeting_date?.slice(0, 10))
          .filter(Boolean) as string[]
      )
      setTbmDates(Array.from(dates))
    } catch (err) {
      console.error('TBM 날짜 조회 오류:', err)
      setTbmDates([])
    }
  }, [projectId, project, currentMonth])

  useEffect(() => {
    if (user && project) {
      loadTbmDates()
    }
  }, [user, project, loadTbmDates])

  // 날짜 선택 시: 작업일보가 있으면 바로 펼쳐서 보기/수정, 없으면 추가 화면 표시
  useEffect(() => {
    setFormOpen(reportDates.includes(selectedDate))
  }, [selectedDate, reportDates])

  useEffect(() => {
    if (user && projectId) {
      loadProject()
    }
  }, [user, projectId, loadProject])

  useEffect(() => {
    if (user && projectId) {
      loadReportDates()
    }
  }, [user, projectId, loadReportDates])

  const handleBack = () => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(`project_${projectId}_from_subpage`, 'true')
    }
    router.push(`/project/${projectId}`)
  }

  // 착공일/준공일 저장 (projects 테이블 — 프로젝트 수정 페이지와 연동)
  const handleSavePeriod = async () => {
    if (periodStart && periodEnd && periodStart > periodEnd) {
      alert('착공일이 준공일보다 늦을 수 없습니다.')
      return
    }

    try {
      setSavingPeriod(true)
      const { error: updateError } = await supabase
        .from('projects')
        .update({
          construction_start_date: periodStart || null,
          construction_end_date: periodEnd || null,
        })
        .eq('id', projectId)

      if (updateError) throw new Error(updateError.message)

      setProject(prev => prev
        ? { ...prev, construction_start_date: periodStart || null, construction_end_date: periodEnd || null }
        : prev)
      alert('공사기간이 저장되었습니다.')
    } catch (err: unknown) {
      console.error('공사기간 저장 오류:', err)
      const message = err instanceof Error ? err.message : '알 수 없는 오류'
      if (message.includes('construction_start_date') || message.includes('column')) {
        alert('공사기간 컬럼이 아직 DB에 없습니다.\nSupabase에서 database/add_project_construction_period.sql을 먼저 실행해주세요.')
      } else {
        alert(`공사기간 저장 중 오류가 발생했습니다: ${message}`)
      }
    } finally {
      setSavingPeriod(false)
    }
  }

  // 해당 월 작업일보 일괄 엑셀 다운로드 (일자별 시트)
  const handleBulkDownload = async () => {
    if (!project || bulkDownloading) return
    try {
      setBulkDownloading(true)
      const year = currentMonth.getFullYear()
      const month = currentMonth.getMonth()
      const startOfMonth = toDateStr(year, month, 1)
      const endOfMonth = toDateStr(year, month, new Date(year, month + 1, 0).getDate())

      const { data, error: reportsError } = await supabase
        .from('work_daily_reports')
        .select('*')
        .eq('project_id', projectId)
        .gte('report_date', startOfMonth)
        .lte('report_date', endOfMonth)
        .order('report_date', { ascending: true })

      if (reportsError) throw new Error(reportsError.message)

      const reports = (data || []) as WorkDailyReport[]
      if (!reports.length) {
        alert(`${year}년 ${month + 1}월에 등록된 작업일보가 없습니다.`)
        return
      }

      // 공정률 보강 — 수동 입력값은 그대로, 비어 있으면 공사기간+수동 기준점 기반 자동 계산
      const { data: anchorData } = await supabase
        .from('work_daily_reports')
        .select('report_date, progress_rate')
        .eq('project_id', projectId)
        .eq('progress_rate_manual', true)
      const anchors = (anchorData || [])
        .map(row => ({ date: row.report_date as string, rate: parseFloat(row.progress_rate) }))
        .filter(a => a.date && !isNaN(a.rate))

      const reportsWithRate = reports.map(report => {
        if (report.progress_rate_manual && report.progress_rate) return report
        const computed = computeProgressRate(
          project.construction_start_date,
          project.construction_end_date,
          report.report_date,
          anchors.filter(a => a.date !== report.report_date)
        )
        return computed ? { ...report, progress_rate: computed } : report
      })

      await downloadMonthlyWorkDailyReportsExcel(reportsWithRate, project.project_name, year, month + 1)
    } catch (err: unknown) {
      console.error('작업일보 일괄 다운로드 오류:', err)
      alert(`일괄 다운로드 중 오류가 발생했습니다: ${err instanceof Error ? err.message : '알 수 없는 오류'}`)
    } finally {
      setBulkDownloading(false)
    }
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={handleBack}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900">작업일보(공사작업일지)</h1>
              <p className="text-sm text-gray-500 mt-1">{project.project_name}</p>
            </div>
          </div>
        </div>
      </header>

      {/* 메인 컨텐츠 */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* 단계 탭 */}
        <div className="flex gap-1.5 mb-5">
          <button
            onClick={() => setActiveTab(1)}
            className={`px-4 py-2 rounded-t-lg text-sm font-semibold transition-colors ${
              activeTab === 1 ? 'bg-white text-blue-900 shadow' : 'bg-white/15 text-blue-100 hover:bg-white/25'
            }`}
          >
            1단계 · 공사기간 & AI 초안 작성
          </button>
          <button
            onClick={() => setActiveTab(2)}
            className={`px-4 py-2 rounded-t-lg text-sm font-semibold transition-colors ${
              activeTab === 2 ? 'bg-white text-blue-900 shadow' : 'bg-white/15 text-blue-100 hover:bg-white/25'
            }`}
          >
            2단계 · 일보 조정 입력 & 출력
          </button>
        </div>

        {/* 1단계: 공사기간 입력 + AI 전체 장비·인력 구분 초안 작성 */}
        {activeTab === 1 && (
          <div className="max-w-2xl mx-auto space-y-4">
            {/* ① 공사기간 (공정률 산정 기준) */}
            <div className={`bg-white rounded-lg shadow p-4 ${!periodStart || !periodEnd ? 'ring-2 ring-amber-400' : ''}`}>
              <div className="flex items-center gap-2 mb-2">
                <CalendarRange className="h-4 w-4 text-blue-600" />
                <h3 className="text-sm font-bold text-gray-900">① 공사기간 (공정률 산정)</h3>
              </div>
              {(!periodStart || !periodEnd) && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 mb-2">
                  착공일·준공일을 입력하면 공정률이 자동 계산됩니다.
                  <br />(착공일 0% → 준공일 100%)
                </p>
              )}
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">착공일 (0%)</label>
                  <input
                    type="date"
                    value={periodStart}
                    onChange={e => setPeriodStart(e.target.value)}
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">준공일 (100%)</label>
                  <input
                    type="date"
                    value={periodEnd}
                    onChange={e => setPeriodEnd(e.target.value)}
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
              <button
                onClick={handleSavePeriod}
                disabled={savingPeriod}
                className="w-full inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors disabled:opacity-50"
              >
                {savingPeriod ? (
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                공사기간 저장
              </button>
            </div>

            {/* ② AI 전체 장비·인력 구분 → 일보 초안 일괄 생성 */}
            <TBMClassificationPanel
              projectId={projectId}
              projectName={project.project_name}
              managingHq={project.managing_hq}
              managingBranch={project.managing_branch}
              userId={user.id}
              ownerName={project.user_profiles?.full_name || ''}
              latitude={project.latitude}
              longitude={project.longitude}
              onRecalculated={() => { loadReportDates(); setActiveTab(2) }}
            />

            <div className="flex justify-end">
              <button
                onClick={() => setActiveTab(2)}
                className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-white text-blue-900 text-sm font-semibold hover:bg-blue-50 transition-colors"
              >
                2단계로 이동 →
              </button>
            </div>
          </div>
        )}

        {/* 2단계: 캘린더 + 일보 세부 조정/출력 */}
        {activeTab === 2 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 좌측: 캘린더 */}
          <div className="lg:col-span-1">
            <div className="space-y-4 lg:sticky lg:top-24">
            <div className="bg-white rounded-lg shadow p-4">
              {/* 월 네비게이션 */}
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <h2 className="text-base font-semibold">
                  {currentMonth.getFullYear()}년 {currentMonth.getMonth() + 1}월
                </h2>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                  <button
                    onClick={handleBulkDownload}
                    disabled={bulkDownloading}
                    className="p-2 hover:bg-blue-50 rounded-lg transition-colors text-blue-700 disabled:opacity-50"
                    title={`${currentMonth.getFullYear()}년 ${currentMonth.getMonth() + 1}월 작업일보 일괄 엑셀 다운로드 (일자별 시트)`}
                  >
                    {bulkDownloading ? (
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-700 border-t-transparent" />
                    ) : (
                      <Printer className="h-5 w-5" />
                    )}
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
                  const hasReport = reportDates.includes(dateStr)
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
                        ${!isSelected && !isToday ? 'border-gray-200 hover:border-gray-300' : ''}
                        ${!isSelected && hasReport ? 'bg-green-200' : ''}
                        ${!isSelected && !hasReport && !isToday ? 'hover:bg-gray-50' : ''}
                      `}
                    >
                      {hasTbm && (
                        <span className="absolute top-0 right-1 text-purple-600 font-bold leading-none" title="TBM 입력됨">*</span>
                      )}
                      <div className="font-medium">{day}</div>
                      {hasReport && (
                        <div className={`mx-auto h-1.5 w-1.5 rounded-full ${isSelected ? 'bg-blue-600' : 'bg-green-600'}`} />
                      )}
                    </button>
                  )
                })}
              </div>

              <div className="flex items-center gap-3 mt-3 text-xs text-gray-500">
                <span className="inline-flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded bg-green-200 border border-green-400" /> 등록됨
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded bg-blue-50 border border-blue-500" /> 오늘
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="text-purple-600 font-bold">*</span> TBM 입력
                </span>
              </div>
            </div>
            </div>
          </div>

          {/* 우측: 일지 추가/보기 + 장비·인력 구분 패널 */}
          <div className="lg:col-span-2 space-y-4">
            {formOpen ? (
              <WorkDailyReportForm
                projectId={projectId}
                projectName={project.project_name}
                reportDate={selectedDate}
                userId={user.id}
                managingHq={project.managing_hq}
                managingBranch={project.managing_branch}
                latitude={project.latitude}
                longitude={project.longitude}
                constructionStart={project.construction_start_date}
                constructionEnd={project.construction_end_date}
                ownerName={project.user_profiles?.full_name || ''}
                onSaved={loadReportDates}
                onDeleted={loadReportDates}
                onClose={() => setFormOpen(false)}
              />
            ) : (
              <div className="bg-white rounded-lg shadow p-4 sm:p-6">
                {reportDates.includes(selectedDate) ? (
                  <button
                    onClick={() => setFormOpen(true)}
                    className="w-full flex items-center justify-between p-4 rounded-lg border border-green-300 bg-green-50 hover:bg-green-100 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="h-6 w-6 text-green-700" />
                      <div className="text-left">
                        <div className="text-sm font-bold text-gray-900">{selectedDate} 작업일보</div>
                        <div className="text-xs text-gray-500">등록됨 · 클릭하여 보기/수정</div>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-green-700" />
                  </button>
                ) : (
                  <button
                    onClick={() => setFormOpen(true)}
                    className="w-full flex flex-col items-center justify-center gap-2 py-10 rounded-lg border-2 border-dashed border-gray-300 text-gray-400 hover:border-blue-400 hover:bg-blue-50/40 hover:text-blue-600 transition-colors"
                  >
                    <Plus className="h-8 w-8" />
                    <span className="text-sm font-medium">{selectedDate} 작업일보 추가하기</span>
                  </button>
                )}
              </div>
            )}

          </div>
        </div>
        )}
      </main>

      <footer className="w-full px-4 py-6 [&_p]:!text-blue-200/70 [&_p:first-child]:!text-blue-100">
        <CopyrightNotice withDivider={false} />
      </footer>
    </div>
  )
}
