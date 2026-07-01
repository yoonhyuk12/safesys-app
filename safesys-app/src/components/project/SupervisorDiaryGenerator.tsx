'use client'

// 공사감독일지 생성 모달 플로우(TBM 제출일 로드 → 기간 선택 → 옵션 → 엑셀 다운로드) — /tbm AI공감일지 기능 포팅, 서버 저장 없음

import React, { useState, useEffect, useRef } from 'react'
import { X, ChevronRight, Download } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { generateSupervisorDiaryExcel } from '@/lib/excel/supervisor-diary-export'

interface SupervisorDiaryGeneratorProps {
  isOpen: boolean
  onClose: () => void
  projectId: string
  projectName: string
  managingHq: string
  managingBranch: string
  defaultEndDate: string // 기본 종료일 (페이지에서 선택된 날짜)
  projectLatitude?: number // 프로젝트 등록 좌표 (TBM 제출에 좌표가 없을 때 날씨 조회 폴백용)
  projectLongitude?: number
}

export default function SupervisorDiaryGenerator({
  isOpen,
  onClose,
  projectId,
  projectName,
  managingHq,
  managingBranch,
  defaultEndDate,
  projectLatitude,
  projectLongitude,
}: SupervisorDiaryGeneratorProps) {
  const [step, setStep] = useState<'date' | 'options' | null>(null)
  const [loadingDates, setLoadingDates] = useState(false)
  const [tbmSubmissionDates, setTbmSubmissionDates] = useState<string[]>([])
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date())
  const [reportStartDate, setReportStartDate] = useState('')
  const [reportEndDate, setReportEndDate] = useState('')
  const [useAI, setUseAI] = useState(true)
  const [supervisorName, setSupervisorName] = useState('')
  const [supervisorSignature, setSupervisorSignature] = useState('')
  const [isDownloadingReport, setIsDownloadingReport] = useState(false)
  const [reportProgress, setReportProgress] = useState({ current: 0, total: 0 })
  const [reportStatus, setReportStatus] = useState('')
  const [reportSubStatus, setReportSubStatus] = useState('')
  const cancelReportRef = useRef(false)

  // 모달이 열리면 해당 사업의 TBM 제출 일자를 로드한 뒤 기간 선택 단계로 진입
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    const loadDates = async () => {
      setLoadingDates(true)
      try {
        // 1. project_id로 조회
        let dataById: { meeting_date: string }[] = []
        if (projectId) {
          const result = await supabase
            .from('tbm_submissions')
            .select('meeting_date')
            .eq('project_id', projectId)
            .order('meeting_date', { ascending: true })
          dataById = result.data || []
        }
        // 2. 프로젝트명 + 본부 + 지사로 조회
        const { data: dataByName } = await supabase
          .from('tbm_submissions')
          .select('meeting_date')
          .eq('project_name', projectName)
          .eq('headquarters', managingHq)
          .eq('branch', managingBranch)
          .order('meeting_date', { ascending: true })

        if (cancelled) return

        const combined: { meeting_date: string }[] = [...dataById, ...(dataByName || [])]
        if (combined.length === 0) {
          alert('해당 사업의 TBM 제출 내역이 없습니다.')
          onClose()
          return
        }

        const dates = [...new Set(combined.map((s) => s.meeting_date))].sort() as string[]
        setTbmSubmissionDates(dates)
        setCalendarMonth(new Date(dates[dates.length - 1]))
        setReportEndDate(defaultEndDate)
        setReportStartDate(dates[dates.length - 1])
        setStep('date')
      } catch (error) {
        if (cancelled) return
        console.error('TBM 제출 일자 조회 오류:', error)
        alert('데이터 조회 중 오류가 발생했습니다.')
        onClose()
      } finally {
        if (!cancelled) setLoadingDates(false)
      }
    }
    loadDates()
    return () => {
      cancelled = true
    }
    // isOpen 변화 시에만 재실행
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  // 모달 닫기 + 입력 상태 초기화
  const resetAndClose = () => {
    setStep(null)
    setReportStartDate('')
    setReportEndDate('')
    setSupervisorName('')
    setSupervisorSignature('')
    setUseAI(true)
    onClose()
  }

  if (!isOpen) return null

  return (
    <>
      {/* TBM 제출 일자 로딩 */}
      {loadingDates && step === null && !isDownloadingReport && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-8 flex flex-col items-center gap-3">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
            <p className="text-sm text-gray-600">TBM 제출 내역을 불러오는 중...</p>
          </div>
        </div>
      )}

      {/* 달력 기반 기간 선택 모달 */}
      {step === 'date' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">기간 선택</h3>
                <button
                  onClick={resetAndClose}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                <p className="text-sm font-medium text-blue-800">{projectName}</p>
                <p className="text-xs text-blue-600">{managingHq} / {managingBranch}</p>
              </div>

              {/* 달력 네비게이션 */}
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={() => {
                    const newMonth = new Date(calendarMonth)
                    newMonth.setMonth(newMonth.getMonth() - 1)
                    setCalendarMonth(newMonth)
                  }}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <ChevronRight className="h-5 w-5 transform rotate-180" />
                </button>
                <span className="font-medium text-gray-900">
                  {calendarMonth.getFullYear()}년 {calendarMonth.getMonth() + 1}월
                </span>
                <button
                  onClick={() => {
                    const newMonth = new Date(calendarMonth)
                    newMonth.setMonth(newMonth.getMonth() + 1)
                    setCalendarMonth(newMonth)
                  }}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>

              {/* 안내 메시지 */}
              <div className="mb-3 p-2 bg-yellow-50 border border-yellow-200 rounded-lg text-center">
                <p className="text-sm font-medium text-yellow-800">
                  {!reportStartDate || (reportStartDate && reportEndDate)
                    ? '📅 시작일을 선택하세요'
                    : '📅 마지막 일자를 선택하세요'}
                </p>
              </div>

              {/* 달력 */}
              <div className="mb-4">
                <div className="grid grid-cols-7 mb-2">
                  {['일', '월', '화', '수', '목', '금', '토'].map((day, idx) => (
                    <div key={day} className={`text-center text-xs font-medium py-1 ${idx === 0 ? 'text-red-500' : idx === 6 ? 'text-blue-500' : 'text-gray-500'}`}>
                      {day}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7">
                  {(() => {
                    const year = calendarMonth.getFullYear()
                    const month = calendarMonth.getMonth()
                    const firstDay = new Date(year, month, 1).getDay()
                    const lastDate = new Date(year, month + 1, 0).getDate()
                    const days: (number | null)[] = []

                    for (let i = 0; i < firstDay; i++) {
                      days.push(null)
                    }
                    for (let i = 1; i <= lastDate; i++) {
                      days.push(i)
                    }

                    return days.map((day, idx) => {
                      if (day === null) {
                        return <div key={idx} className="h-9" />
                      }

                      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                      const hasSubmission = tbmSubmissionDates.includes(dateStr)
                      const isStart = reportStartDate === dateStr
                      const isEnd = reportEndDate === dateStr
                      const isInRange = reportStartDate && reportEndDate && dateStr >= reportStartDate && dateStr <= reportEndDate
                      const isSingleDay = isStart && isEnd

                      let bgStyle = ''
                      if (isSingleDay) {
                        bgStyle = 'bg-blue-600 rounded-full'
                      } else if (isStart) {
                        bgStyle = 'bg-blue-600 rounded-l-full'
                      } else if (isEnd) {
                        bgStyle = 'bg-blue-600 rounded-r-full'
                      } else if (isInRange) {
                        bgStyle = 'bg-blue-200'
                      }

                      const textColor = (isStart || isEnd)
                        ? 'text-white font-bold'
                        : isInRange
                          ? 'text-blue-800'
                          : idx % 7 === 0
                            ? 'text-red-500'
                            : idx % 7 === 6
                              ? 'text-blue-500'
                              : 'text-gray-700'

                      return (
                        <button
                          key={idx}
                          onClick={() => {
                            if (!reportStartDate || (reportStartDate && reportEndDate)) {
                              setReportStartDate(dateStr)
                              setReportEndDate('')
                            } else {
                              if (dateStr < reportStartDate) {
                                setReportEndDate(reportStartDate)
                                setReportStartDate(dateStr)
                              } else {
                                setReportEndDate(dateStr)
                              }
                            }
                          }}
                          className={`h-9 w-full text-sm relative transition-colors hover:opacity-80 ${bgStyle} ${textColor}`}
                        >
                          {day}
                          {hasSubmission && (
                            <span className={`absolute bottom-1 left-1/2 transform -translate-x-1/2 w-1.5 h-1.5 rounded-full ${isStart || isEnd ? 'bg-white' : 'bg-green-500'}`} />
                          )}
                        </button>
                      )
                    })
                  })()}
                </div>

                {/* 범례 */}
                <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                  <div className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-green-500" />
                    <span>TBM 제출일</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-6 h-3 bg-blue-600 rounded-full" />
                    <span>선택 범위</span>
                  </div>
                </div>
              </div>

              {/* 선택된 기간 표시 */}
              <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between text-sm">
                  <div>
                    <span className="text-gray-500">시작일:</span>
                    <span className="ml-2 font-medium text-gray-900">{reportStartDate || '-'}</span>
                  </div>
                  <span className="text-gray-400">~</span>
                  <div>
                    <span className="text-gray-500">종료일:</span>
                    <span className="ml-2 font-medium text-gray-900">{reportEndDate || '-'}</span>
                  </div>
                </div>
              </div>

              {/* 빠른 선택 버튼 */}
              <div className="flex gap-2 mb-4">
                {[
                  { label: '1일', days: 1 },
                  { label: '7일', days: 7 },
                  { label: '한달', days: 30 },
                  { label: '2달', days: 60 },
                ].map(({ label, days }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      const endDate = new Date(defaultEndDate)
                      const startDate = new Date(endDate)
                      startDate.setDate(endDate.getDate() - days + 1)
                      setReportStartDate(startDate.toISOString().split('T')[0])
                      setReportEndDate(defaultEndDate)
                    }}
                    className="flex-1 px-2 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 transition-colors"
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={resetAndClose}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={() => {
                    if (!reportStartDate || !reportEndDate) {
                      alert('시작일과 종료일을 모두 선택해주세요.')
                      return
                    }
                    setStep('options')
                  }}
                  disabled={!reportStartDate || !reportEndDate}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  확인
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 옵션 선택 모달 (공사감독 이름 + AI 사용 여부 + 서명) */}
      {step === 'options' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900">공사감독일지 옵션</h2>
                <button
                  onClick={resetAndClose}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              {/* 사업 정보 */}
              <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                <p className="text-sm font-medium text-blue-800">{projectName}</p>
                <p className="text-xs text-blue-600">{reportStartDate} ~ {reportEndDate}</p>
              </div>

              <div className="space-y-6">
                {/* 공사감독 이름 입력 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    공사감독 이름
                  </label>
                  <input
                    type="text"
                    value={supervisorName}
                    onChange={(e) => setSupervisorName(e.target.value)}
                    placeholder="이름을 입력하세요"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* AI 사용 여부 선택 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    작성 방식 선택
                  </label>
                  <div className="space-y-3">
                    <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                      <input
                        type="radio"
                        name="supervisorDiaryUseAI"
                        checked={useAI}
                        onChange={() => setUseAI(true)}
                        className="mt-1"
                      />
                      <div>
                        <p className="font-medium text-gray-900">AI작성 (시간 걸림, 서명별도)</p>
                        <p className="text-sm text-gray-500">AI가 공사기록과 기록사항을 작성합니다. 서명란은 공란입니다.</p>
                      </div>
                    </label>
                    <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                      <input
                        type="radio"
                        name="supervisorDiaryUseAI"
                        checked={!useAI}
                        onChange={() => setUseAI(false)}
                        className="mt-1"
                      />
                      <div>
                        <p className="font-medium text-gray-900">DB만 입력 (빠름, 서명포함)</p>
                        <p className="text-sm text-gray-500">
                          AI 없이 TBM 데이터 값만 입력합니다.<br />
                          - 공사추진내용: 금일작업<br />
                          - 공사기록: 공란<br />
                          - 기록사항: 투입인원, 투입장비<br />
                          - 기타: 기타사항
                        </p>
                      </div>
                    </label>
                  </div>
                </div>

                {/* 서명 (DB만 입력 방식일 때만 표시) */}
                {!useAI && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-gray-700">
                        서명
                      </label>
                      <button
                        onClick={() => {
                          const canvas = document.getElementById('supervisor-diary-signature-canvas') as HTMLCanvasElement
                          const ctx = canvas?.getContext('2d')
                          if (ctx) {
                            ctx.clearRect(0, 0, canvas.width, canvas.height)
                            setSupervisorSignature('')
                          }
                        }}
                        className="p-2 bg-white border-2 border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-colors shadow-sm"
                        title="다시 작성"
                      >
                        <svg
                          className="w-5 h-5 text-gray-700"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </div>
                    <div className="border-2 border-gray-300 rounded-lg bg-gray-50">
                      <canvas
                        id="supervisor-diary-signature-canvas"
                        ref={(canvas) => {
                          if (canvas && !canvas.dataset.initialized) {
                            canvas.dataset.initialized = 'true'
                            const ctx = canvas.getContext('2d')
                            if (ctx) {
                              ctx.clearRect(0, 0, canvas.width, canvas.height)
                            }
                          }
                        }}
                        width={600}
                        height={300}
                        className="w-full bg-white rounded-lg cursor-crosshair touch-none"
                        style={{ touchAction: 'none' }}
                        onMouseDown={(e) => {
                          const canvas = e.currentTarget
                          const ctx = canvas.getContext('2d')
                          if (!ctx) return
                          const rect = canvas.getBoundingClientRect()
                          const x = (e.clientX - rect.left) * (canvas.width / rect.width)
                          const y = (e.clientY - rect.top) * (canvas.height / rect.height)
                          ctx.beginPath()
                          ctx.moveTo(x, y)
                          canvas.dataset.drawing = 'true'
                        }}
                        onMouseMove={(e) => {
                          const canvas = e.currentTarget
                          if (canvas.dataset.drawing !== 'true') return
                          const ctx = canvas.getContext('2d')
                          if (!ctx) return
                          const rect = canvas.getBoundingClientRect()
                          const x = (e.clientX - rect.left) * (canvas.width / rect.width)
                          const y = (e.clientY - rect.top) * (canvas.height / rect.height)
                          ctx.lineWidth = 3
                          ctx.lineCap = 'round'
                          ctx.strokeStyle = '#000000'
                          ctx.lineTo(x, y)
                          ctx.stroke()
                        }}
                        onMouseUp={(e) => {
                          const canvas = e.currentTarget
                          canvas.dataset.drawing = 'false'
                          setSupervisorSignature(canvas.toDataURL())
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.dataset.drawing = 'false'
                        }}
                        onTouchStart={(e) => {
                          e.preventDefault()
                          const canvas = e.currentTarget
                          const ctx = canvas.getContext('2d')
                          if (!ctx) return
                          const touch = e.touches[0]
                          const rect = canvas.getBoundingClientRect()
                          const x = (touch.clientX - rect.left) * (canvas.width / rect.width)
                          const y = (touch.clientY - rect.top) * (canvas.height / rect.height)
                          ctx.beginPath()
                          ctx.moveTo(x, y)
                          canvas.dataset.drawing = 'true'
                        }}
                        onTouchMove={(e) => {
                          e.preventDefault()
                          const canvas = e.currentTarget
                          if (canvas.dataset.drawing !== 'true') return
                          const ctx = canvas.getContext('2d')
                          if (!ctx) return
                          const touch = e.touches[0]
                          const rect = canvas.getBoundingClientRect()
                          const x = (touch.clientX - rect.left) * (canvas.width / rect.width)
                          const y = (touch.clientY - rect.top) * (canvas.height / rect.height)
                          ctx.lineWidth = 3
                          ctx.lineCap = 'round'
                          ctx.strokeStyle = '#000000'
                          ctx.lineTo(x, y)
                          ctx.stroke()
                        }}
                        onTouchEnd={(e) => {
                          const canvas = e.currentTarget
                          canvas.dataset.drawing = 'false'
                          setSupervisorSignature(canvas.toDataURL())
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* 버튼 */}
                <div className="flex gap-3">
                  <button
                    onClick={resetAndClose}
                    className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    취소
                  </button>
                  <button
                    onClick={async () => {
                      if (!supervisorName.trim()) {
                        alert('공사감독 이름을 입력해주세요.')
                        return
                      }
                      if (!useAI && !supervisorSignature) {
                        alert('서명을 해주세요.')
                        return
                      }

                      // TBM 데이터 조회
                      const { data: tbmSubmissions, error } = await supabase
                        .from('tbm_submissions')
                        .select('*')
                        .eq('project_name', projectName)
                        .eq('headquarters', managingHq)
                        .eq('branch', managingBranch)
                        .gte('meeting_date', reportStartDate)
                        .lte('meeting_date', reportEndDate)
                        .order('meeting_date', { ascending: true })

                      if (error) {
                        console.error('TBM 데이터 조회 오류:', error)
                        alert('데이터 조회 중 오류가 발생했습니다.')
                        return
                      }

                      if (!tbmSubmissions || tbmSubmissions.length === 0) {
                        alert('선택한 기간에 TBM 제출 내역이 없습니다.')
                        return
                      }

                      // 위경도 가져오기 (첫날부터 순차적으로 확인)
                      let latitude: number | undefined
                      let longitude: number | undefined
                      for (const submission of tbmSubmissions) {
                        if (submission.latitude && submission.longitude) {
                          latitude = submission.latitude
                          longitude = submission.longitude
                          break
                        }
                      }
                      // TBM 제출에 좌표가 없으면 프로젝트 등록 좌표로 폴백 (날씨 조회 누락 방지)
                      if (latitude == null || longitude == null) {
                        latitude = projectLatitude ?? undefined
                        longitude = projectLongitude ?? undefined
                      }

                      setStep(null)
                      setIsDownloadingReport(true)
                      cancelReportRef.current = false

                      try {
                        await generateSupervisorDiaryExcel(
                          projectName,
                          reportStartDate,
                          reportEndDate,
                          tbmSubmissions,
                          (current, total, status, subStatus) => {
                            if (cancelReportRef.current) {
                              throw new Error('사용자가 보고서 생성을 취소했습니다.')
                            }
                            setReportProgress({ current, total })
                            setReportStatus(status || '')
                            setReportSubStatus(subStatus || '')
                          },
                          supervisorName,
                          useAI ? '' : supervisorSignature, // AI 모드면 서명 없음
                          latitude,
                          longitude,
                          useAI // AI 사용 여부 전달
                        )
                      } catch (error) {
                        console.error('다운로드 오류:', error)
                        if (!cancelReportRef.current) {
                          alert('다운로드 중 오류가 발생했습니다: ' + (error instanceof Error ? error.message : '알 수 없는 오류'))
                        }
                      } finally {
                        setIsDownloadingReport(false)
                        setReportProgress({ current: 0, total: 0 })
                        setReportStatus('')
                        setReportSubStatus('')
                        cancelReportRef.current = false
                        setSupervisorName('')
                        setSupervisorSignature('')
                        setUseAI(true)
                        setReportStartDate('')
                        setReportEndDate('')
                        onClose()
                      }
                    }}
                    disabled={!supervisorName.trim() || (!useAI && !supervisorSignature)}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    다운로드
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 보고서 생성 진행률 모달 */}
      {isDownloadingReport && reportProgress.total > 0 && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4">
            <div className="text-center">
              <div className="mb-4">
                <Download className="h-16 w-16 text-blue-600 mx-auto animate-bounce" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">
                {useAI ? 'AI가 공사감독일지를 쓰고 있어요' : '공사감독일지를 작성하고 있어요'}
              </h3>
              <p className="text-gray-600 mb-2">
                잠시만 기다려 주세요
              </p>
              <p className="text-gray-500 text-sm mb-6">
                {reportProgress.current} / {reportProgress.total} 페이지
              </p>

              <div className="w-full bg-gray-200 rounded-full h-4 mb-4 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-blue-500 to-blue-600 h-4 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${(reportProgress.current / reportProgress.total) * 100}%` }}
                />
              </div>

              <p className="text-3xl font-bold text-blue-600 mb-2">
                {Math.round((reportProgress.current / reportProgress.total) * 100)}%
              </p>

              {reportStatus ? (
                <div className="text-center">
                  <p className="text-sm text-gray-600 animate-pulse">
                    {reportStatus}
                  </p>
                  {reportSubStatus && (
                    <p className="text-xs text-blue-500 mt-1">
                      {reportSubStatus}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-500">
                  잠시만 기다려주세요...
                </p>
              )}

              <button
                onClick={() => {
                  if (confirm('보고서 생성을 취소하시겠습니까?')) {
                    cancelReportRef.current = true
                  }
                }}
                className="mt-6 px-6 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
