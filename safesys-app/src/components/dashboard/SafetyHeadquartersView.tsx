'use client'

import React from 'react'
import { ChevronLeft, Calendar, Download, AlertTriangle, ArrowLeft, ClipboardX, FileDown, X, Phone } from 'lucide-react'
import UninspectedProjectsTable from '@/components/dashboard/UninspectedProjectsTable'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import type { Project, HeadquartersInspection } from '@/lib/projects'
import { HEADQUARTERS_OPTIONS, BRANCH_OPTIONS } from '@/lib/constants'
import { downloadHeadquartersInspectionExcel } from '@/lib/excel/headquarters-inspection-export'

interface SafetyHeadquartersViewProps {
  loading: boolean
  projects: Project[]
  headquartersInspections: HeadquartersInspection[]
  selectedSafetyHq: string | null
  selectedSafetyBranch: string | null
  selectedHq: string
  selectedBranch: string
  selectedQuarter: string
  isHqDownloadMode: boolean
  selectedBranchesForReport: string[]
  selectedProjectIdsForReport: string[]
  isGeneratingReport: boolean
  reportProgress?: { current: number; total: number } | null
  onBack: () => void
  onBackToHqLevel: () => void
  onBackToAllBranches: () => void
  onQuarterChange: (q: string) => void
  onToggleDownloadMode: (on: boolean) => void
  onGenerateReport: (groups: { projectName: string; inspections: any[]; branchName?: string }[]) => Promise<void>
  onCancelReport: () => void
  onProjectToggleForReport: (projectId: string) => void
  onBranchToggleForReport: (branch: string) => void
  onRowClickProject: (projectId: string) => void
  onSelectSafetyHq: (hq: string) => void
  onSelectSafetyBranch: (branch: string) => void
}

const SafetyHeadquartersView: React.FC<SafetyHeadquartersViewProps> = ({
  loading,
  projects,
  headquartersInspections,
  selectedSafetyHq,
  selectedSafetyBranch,
  selectedHq,
  selectedBranch,
  selectedQuarter,
  isHqDownloadMode,
  selectedBranchesForReport,
  selectedProjectIdsForReport,
  isGeneratingReport,
  reportProgress,
  onBack,
  onBackToHqLevel,
  onBackToAllBranches,
  onQuarterChange,
  onToggleDownloadMode,
  onGenerateReport,
  onCancelReport,
  onProjectToggleForReport,
  onBranchToggleForReport,
  onRowClickProject,
  onSelectSafetyHq,
  onSelectSafetyBranch
}) => {
  const [showUninspected, setShowUninspected] = React.useState(false)
  const [showByDate, setShowByDate] = React.useState(false)
  const [showPendingModal, setShowPendingModal] = React.useState(false)
  const [pendingModalData, setPendingModalData] = React.useState<{ name: string; phone: string; companyName?: string } | null>(null)
  const [showPhoneModal, setShowPhoneModal] = React.useState(false)
  const [showYearModal, setShowYearModal] = React.useState(false)
  const [tempYear, setTempYear] = React.useState(new Date().getFullYear())
  const selectedQuarterNum = React.useMemo(() => {
    const parts = (selectedQuarter || '').split('Q')
    const q = parseInt(parts[1] || '0', 10)
    return Number.isNaN(q) ? Math.ceil((new Date().getMonth() + 1) / 3) : q
  }, [selectedQuarter])

  // 년도와 분기 파싱 (예: "2026Q1" -> year: 2026, quarter: 1)
  const parseQuarter = (q: string) => {
    const match = q.match(/^(\d{4})Q([1-4])$/)
    if (match) {
      return { year: parseInt(match[1], 10), quarter: parseInt(match[2], 10) }
    }
    const now = new Date()
    const currentMonth = now.getMonth() + 1
    let currentQuarter = 1
    if (currentMonth >= 4 && currentMonth <= 6) currentQuarter = 2
    else if (currentMonth >= 7 && currentMonth <= 9) currentQuarter = 3
    else if (currentMonth >= 10) currentQuarter = 4
    return { year: now.getFullYear(), quarter: currentQuarter }
  }

  const { year: selectedYear, quarter: selectedQ } = parseQuarter(selectedQuarter)

  // 년도 변경 핸들러
  const handleYearChange = (newYear: number) => {
    if (newYear < 2000 || newYear > 2100 || isNaN(newYear)) return
    onQuarterChange(`${newYear}Q${selectedQ}`)
  }

  // 분기 변경 핸들러
  const handleQuarterDropdownChange = (newQ: number) => {
    onQuarterChange(`${selectedYear}Q${newQ}`)
  }

  // 디버깅: 데이터 확인 (개발 환경에서만)
  React.useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('=== SafetyHeadquartersView 데이터 확인 ===')
      console.log('Projects:', projects.length)
      console.log('HeadquartersInspections:', headquartersInspections.length)
      console.log('첫 번째 점검 데이터:', headquartersInspections[0])
      console.log('=====================================')
    }
  }, [projects, headquartersInspections])
  // groups 계산은 상위에서 주입해도 되지만, 여기서 간략 처리
  const buildGroups = (): { projectName: string; inspections: any[]; branchName?: string }[] => {
    const groups: { projectName: string; inspections: any[]; branchName?: string }[] = []
    if (selectedSafetyBranch) {
      const branchProjects = projects.filter((p: any) => (!selectedHq || p.managing_hq === selectedHq) && p.managing_branch === selectedSafetyBranch)
      const targetProjects = selectedProjectIdsForReport.length > 0 ? branchProjects.filter((p: any) => selectedProjectIdsForReport.includes(p.id)) : branchProjects
      targetProjects.forEach((p: any) => {
        const ins = headquartersInspections.filter((i: any) => i.project_id === p.id)
        if (ins.length > 0) groups.push({ projectName: p.project_name || 'project', inspections: ins, branchName: p.managing_branch })
      })
    } else {
      const filteredProjects = projects.filter((p: any) => {
        if (selectedHq && p.managing_hq !== selectedHq) return false
        if (selectedBranch && p.managing_branch !== selectedBranch) return false
        // 선택된 지사 목록이 없으면 모든 지사를 포함
        return selectedBranchesForReport.length === 0 || selectedBranchesForReport.includes(p.managing_branch)
      })
      filteredProjects.forEach((p: any) => {
        const ins = headquartersInspections.filter((i: any) => i.project_id === p.id)
        if (ins.length > 0) groups.push({ projectName: p.project_name || 'project', inspections: ins, branchName: p.managing_branch })
      })
    }
    return groups
  }

  return (
    <>
      {/* 보고서 생성 진행 상황 모달 */}
      {isGeneratingReport && reportProgress && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">보고서 제작중</h3>
            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">
                {reportProgress.total}건 중 {reportProgress.current}건 작성중...
              </p>
              <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                <div
                  className="bg-blue-600 h-full transition-all duration-300 ease-out rounded-full"
                  style={{ width: `${(reportProgress.current / reportProgress.total) * 100}%` }}
                >
                  <div className="h-full w-full bg-gradient-to-r from-blue-500 to-blue-600"></div>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2 text-right">
                {Math.round((reportProgress.current / reportProgress.total) * 100)}%
              </p>
            </div>
            <div className="flex justify-end">
              <button
                onClick={onCancelReport}
                className="px-4 py-2 bg-gray-500 text-white text-sm font-medium rounded-lg hover:bg-gray-600 transition-colors"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-2 py-2 sm:px-6 sm:py-4 border-b border-gray-200">
          <button onClick={onBack} className="flex items-center text-sm text-gray-600 hover:text-gray-900 transition-colors">
            <ChevronLeft className="h-4 w-4 mr-1" />
            안전현황으로 돌아가기
          </button>
        </div>
        <div className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center">
              <AlertTriangle className="h-5 w-5 text-orange-600 mr-2" />
              (본부) 불시 점검 현황
            </h3>
            <div className="flex items-center justify-end space-x-2">
              {/* 엑셀 다운로드 버튼 */}
              <button
                type="button"
                onClick={() => {
                  // 현재 필터 조건에 맞는 프로젝트만 다운로드
                  const filteredProjects = projects.filter((p: any) => {
                    if (selectedSafetyBranch) {
                      return p.managing_branch === selectedSafetyBranch
                    } else {
                      if (selectedHq && p.managing_hq !== selectedHq) return false
                      if (selectedBranch && p.managing_branch !== selectedBranch) return false
                      return true
                    }
                  })
                  downloadHeadquartersInspectionExcel(filteredProjects, headquartersInspections, selectedQuarter)
                }}
                className="flex items-center px-2 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                title="엑셀 다운로드"
              >
                <FileDown className="h-4 w-4 mr-1" />
                <span className="hidden sm:inline">엑셀</span>
              </button>
              <button
                type="button"
                onClick={() => setShowUninspected(v => !v)}
                aria-pressed={showUninspected}
                aria-label="미점검 토글"
                title="미점검 보기"
                className={`flex items-center px-2 py-1 rounded-lg border transition-colors text-sm ${showUninspected ? 'bg-red-50 border-red-200 text-red-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
              >
                <ClipboardX className="h-4 w-4 mr-1" />
                <span className="hidden sm:inline">미점검</span>
              </button>
              <button
                type="button"
                onClick={() => { setShowByDate(v => !v); if (!showByDate) setShowUninspected(false) }}
                aria-pressed={showByDate}
                aria-label="일자별 토글"
                title="일자별 보기"
                className={`flex items-center px-2 py-1 rounded-lg border transition-colors text-sm ${showByDate ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
              >
                <Calendar className="h-4 w-4 mr-1" />
                <span className="hidden sm:inline">일자별</span>
              </button>
              {!isHqDownloadMode ? (
                <button type="button" onClick={() => onToggleDownloadMode(true)} className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" aria-label="보고서 선택 모드" title="보고서 선택 모드">
                  <Download className="h-5 w-5" />
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={async () => { const groups = buildGroups(); if (groups.length === 0) { alert('선택한 조건에 해당하는 점검 결과가 없습니다.'); return } await onGenerateReport(groups) }}
                    className="px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 inline-flex items-center gap-2"
                    disabled={isGeneratingReport}
                    aria-busy={isGeneratingReport}
                    aria-label="보고서 생성"
                    title="보고서 생성"
                  >
                    {isGeneratingReport ? (
                      <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                      </svg>
                    ) : (
                      <span>프린터</span>
                    )}
                  </button>
                  <button type="button" onClick={onCancelReport} className="px-3 py-2 bg-gray-500 text-white text-sm font-medium rounded-lg hover:bg-gray-600 transition-colors">취소</button>
                </>
              )}
              {/* 년도 선택 버튼 */}
              <button
                type="button"
                onClick={() => {
                  setTempYear(selectedYear)
                  setShowYearModal(true)
                }}
                className="border border-gray-300 rounded-md px-3 py-1 text-sm bg-white hover:bg-gray-50 transition-colors"
              >
                {String(selectedYear).slice(-2)}년
              </button>
              {/* 분기 선택 */}
              <select
                value={selectedQ}
                onChange={(e) => handleQuarterDropdownChange(parseInt(e.target.value, 10))}
                className="border border-gray-300 rounded-md px-2 py-1 text-sm focus:ring-blue-500 focus:border-blue-500 bg-white"
              >
                <option value={1}>1분기</option>
                <option value={2}>2분기</option>
                <option value={3}>3분기</option>
                <option value={4}>4분기</option>
              </select>
            </div>
          </div>

          {showByDate ? (
            (() => {
              // 선택한 범위(본부/지사/분기)에 해당하는 본부 불시점검을 일자 내림차순으로 표시
              const [yearStr, qStr] = (selectedQuarter || '').split('Q')
              const year = parseInt(yearStr || '0', 10)
              const q = parseInt(qStr || '0', 10)
              const startMonth = (q - 1) * 3 // 0-indexed
              const start = new Date(year, startMonth, 1)
              const end = new Date(year, startMonth + 3, 0, 23, 59, 59, 999)

              const filtered = headquartersInspections
                .filter((ins: HeadquartersInspection) => {
                  // 분기 필터
                  const d = ins.inspection_date ? new Date(ins.inspection_date) : null
                  if (!d || Number.isNaN(d.getTime())) return false
                  if (year && q && (d < start || d > end)) return false
                  // 조직 필터
                  if (selectedSafetyBranch) {
                    if (ins.managing_branch !== selectedSafetyBranch) return false
                  } else {
                    if (selectedHq && ins.managing_hq !== selectedHq) return false
                    if (selectedBranch && ins.managing_branch !== selectedBranch) return false
                  }
                  return true
                })
                .sort((a: HeadquartersInspection, b: HeadquartersInspection) => {
                  const da = a.inspection_date ? new Date(a.inspection_date).getTime() : 0
                  const db = b.inspection_date ? new Date(b.inspection_date).getTime() : 0
                  return db - da // 내림차순
                })

              return (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-2 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 w-auto whitespace-nowrap">점검일자</th>
                        <th className="px-2 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 w-auto whitespace-nowrap">지사명</th>
                        <th className="px-2 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 w-auto whitespace-nowrap">프로젝트명</th>
                        <th className="px-2 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 w-auto whitespace-nowrap">점검자</th>
                        <th className="px-2 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-auto whitespace-nowrap">비고</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filtered.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-2 py-6 sm:px-6 sm:py-8 text-center text-xs sm:text-sm text-gray-500">해당 조건의 점검 데이터가 없습니다.</td>
                        </tr>
                      ) : (
                        <>
                          <tr className="bg-blue-50 font-semibold border-b-2 border-blue-200">
                            <td className="px-2 py-3 sm:px-6 sm:py-4 text-xs sm:text-sm font-bold text-blue-900 border-r border-blue-200 text-center whitespace-nowrap">소계</td>
                            <td className="px-2 py-3 sm:px-6 sm:py-4 text-xs sm:text-sm font-bold text-blue-900 border-r border-blue-200 text-center whitespace-nowrap">-</td>
                            <td className="px-2 py-3 sm:px-6 sm:py-4 text-xs sm:text-sm font-bold text-blue-900 border-r border-blue-200 text-center whitespace-nowrap">{filtered.length}건</td>
                            <td className="px-2 py-3 sm:px-6 sm:py-4 text-xs sm:text-sm font-bold text-blue-900 border-r border-blue-200 text-center whitespace-nowrap">-</td>
                            <td className="px-2 py-3 sm:px-6 sm:py-4 text-xs sm:text-sm font-bold text-blue-900 text-center whitespace-nowrap">-</td>
                          </tr>
                          {filtered.map((ins: HeadquartersInspection, idx: number) => {
                            const formatDate = (dateStr: string) => {
                              const d = new Date(dateStr)
                              const year = String(d.getFullYear()).slice(-2)
                              const month = String(d.getMonth() + 1).padStart(2, '0')
                              const day = String(d.getDate()).padStart(2, '0')
                              const weekday = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()]
                              return `${year}.${month}.${day}(${weekday})`
                            }
                            return (
                              <tr key={ins.id || idx} className="hover:bg-gray-50 cursor-pointer" onClick={() => onRowClickProject(ins.project_id)}>
                                <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-700 border-r border-gray-200 text-center">{ins.inspection_date ? formatDate(ins.inspection_date) : '-'}</td>
                                <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-700 border-r border-gray-200 text-center">{ins.managing_branch || '-'}</td>
                                <td className="px-2 py-2 sm:px-6 sm:py-4 text-xs sm:text-sm text-blue-600 border-r border-gray-200 text-center">
                                  <span className="sm:hidden whitespace-nowrap">{(ins.project_name || '').length > 5 ? `${(ins.project_name || '').substring(0, 5)}...` : ins.project_name || '-'}</span>
                                  <span className="hidden sm:inline break-words">{ins.project_name || '-'}</span>
                                </td>
                                <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-700 border-r border-gray-200 text-center">{ins.inspector_name || '-'}</td>
                                <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-400 text-center">-</td>
                              </tr>
                            )
                          })}
                        </>
                      )}
                    </tbody>
                  </table>
                </div>
              )
            })()
          ) : showUninspected ? (
            <UninspectedProjectsTable
              loading={loading}
              projects={projects}
              headquartersInspections={headquartersInspections}
              selectedQuarter={selectedQuarter}
              selectedHq={selectedHq}
              selectedBranch={selectedBranch}
              selectedSafetyBranch={selectedSafetyBranch}
              onRowClickProject={onRowClickProject}
            />
          ) : loading ? (
            <div className="flex justify-center items-center py-12">
              <LoadingSpinner />
            </div>
          ) : selectedSafetyBranch ? (
            <div>
              <div className="flex items-center mb-4">
                <button
                  onClick={() => onBackToHqLevel()}
                  className="inline-flex items-center justify-center p-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 shadow-sm"
                  title={selectedSafetyHq ? `${selectedSafetyHq} 지사로 돌아가기` : '전체 지사로 돌아가기'}
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full divide-y divide-gray-200" style={{ minWidth: '550px' }}>
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-2 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap sticky left-0 z-10 bg-gray-50 sm:static" style={{ width: '120px' }}>프로젝트명</th>
                      <th className="px-2 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap" style={{ width: '70px' }}>점검 대상</th>
                      <th className="px-2 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap" style={{ width: '70px' }}>점검 횟수</th>
                      <th className="px-2 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap" style={{ width: '70px' }}>실적인정</th>
                      <th className="px-2 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap" style={{ width: '140px' }}>최근점검자</th>
                      <th className="px-2 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap" style={{ width: '70px' }}>조치대기</th>
                      <th className="px-2 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap" style={{ width: '50px' }}>비고</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {(() => {
                      // 선택 지사의 프로젝트 및 점검 집계
                      const branchProjects = projects.filter((p: any) => (!selectedHq || p.managing_hq === selectedHq) && p.managing_branch === selectedSafetyBranch)
                      const branchProjectIds = new Set<string>(branchProjects.map((p: any) => p.id as string))
                      const branchInspections = headquartersInspections.filter((i: any) => branchProjectIds.has(i.project_id as string))

                      // 분기 범위 계산
                      const [yearStr, qStr] = (selectedQuarter || '').split('Q')
                      const year = parseInt(yearStr || '0', 10)
                      const q = parseInt(qStr || '0', 10)
                      const startMonth = (q - 1) * 3 // 0-indexed
                      const start = new Date(year, startMonth, 1)
                      const end = new Date(year, startMonth + 3, 0, 23, 59, 59, 999)

                      // 대상 프로젝트 수 (분기별 is_active 기준)
                      const targetCount = branchProjects.reduce((acc: number, project: any) => {
                        const ia: any = project.is_active
                        if (ia && typeof ia === 'object') {
                          const key = `q${selectedQuarterNum}` as 'q1' | 'q2' | 'q3' | 'q4'
                          if (ia[key]) return acc + 1
                        }
                        return acc
                      }, 0)

                      // 조치대기 건수 계산 (issue1/2 종합 상태 기반 - pending과 in_progress 모두 포함)
                      const totalPendingCount = branchInspections.reduce((count: number, inspection: any) => {
                        // 지적사항2가 실제로 존재하는 경우에만 issue2_status 확인
                        const hasIssue2 = inspection.issue_content2 && inspection.issue_content2.trim() !== ''
                        const overallStatus = hasIssue2
                          ? ((inspection.issue1_status === 'completed' && inspection.issue2_status === 'completed') ? 'completed' : ((inspection.issue1_status === 'pending' && inspection.issue2_status === 'pending') ? 'pending' : 'in_progress'))
                          : inspection.issue1_status
                        return overallStatus !== 'completed' ? count + 1 : count
                      }, 0)

                      const totalInspectionCount = branchInspections.length

                      // 선택 분기 점검 대상이고 점검 횟수가 있는 프로젝트 수 계산
                      const quarterInspectedProjects = new Set<string>()
                      branchProjects.forEach((project: any) => {
                        const ia: any = project.is_active
                        const qKey = `q${selectedQuarterNum}` as 'q1' | 'q2' | 'q3' | 'q4'
                        const isTarget = ia && typeof ia === 'object' ? !!ia[qKey] : false

                        if (isTarget) {
                          const projectInspections = branchInspections.filter((i: any) => i.project_id === project.id)
                          if (projectInspections.length > 0) {
                            quarterInspectedProjects.add(project.id)
                          }
                        }
                      })
                      const quarterInspectionCount = quarterInspectedProjects.size

                      return (
                        <tr className="bg-blue-50 font-semibold border-b-2 border-blue-200">
                          <td className="px-2 py-3 sm:px-6 sm:py-4 text-sm font-bold text-blue-900 border-r border-blue-200 text-center whitespace-nowrap sticky left-0 z-10 bg-blue-50 sm:static">소계</td>
                          <td className="px-2 py-3 sm:px-6 sm:py-4 text-sm font-bold text-blue-900 border-r border-blue-200 text-center whitespace-nowrap">{targetCount > 0 ? `${targetCount}개` : '-'}</td>
                          <td className="px-2 py-3 sm:px-6 sm:py-4 text-sm font-bold text-blue-900 border-r border-blue-200 text-center whitespace-nowrap">{totalInspectionCount > 0 ? `${totalInspectionCount}건` : '-'}</td>
                          <td className="px-2 py-3 sm:px-6 sm:py-4 text-sm font-bold text-blue-900 border-r border-blue-200 text-center whitespace-nowrap">{quarterInspectionCount > 0 ? `${quarterInspectionCount}` : '-'}</td>
                          <td className="px-2 py-3 sm:px-6 sm:py-4 text-sm font-bold text-blue-900 border-r border-blue-200 text-center whitespace-nowrap">-</td>
                          <td className="px-2 py-3 sm:px-6 sm:py-4 text-sm font-bold text-blue-900 border-r border-blue-200 text-center whitespace-nowrap">{totalPendingCount > 0 ? `${totalPendingCount}건` : '-'}</td>
                          <td className="px-2 py-3 sm:px-6 sm:py-4 text-sm font-bold text-blue-900 text-center whitespace-nowrap">-</td>
                        </tr>
                      )
                    })()}
                    {projects
                      .filter(p => (!selectedHq || p.managing_hq === selectedHq) && p.managing_branch === selectedSafetyBranch)
                      .sort((a, b) => {
                        // display_order로 정렬 (지사 내에서만)
                        const aOrder = typeof a.display_order === 'number' ? a.display_order : Number.POSITIVE_INFINITY
                        const bOrder = typeof b.display_order === 'number' ? b.display_order : Number.POSITIVE_INFINITY

                        if (aOrder !== bOrder) {
                          return aOrder - bOrder
                        }

                        // display_order가 같거나 둘 다 없는 경우 프로젝트명으로 정렬
                        return (a.project_name || '').localeCompare(b.project_name || '', 'ko-KR')
                      })
                      .map((project) => {
                        const projectInspections = headquartersInspections.filter((i) => i.project_id === project.id)
                        const latestInspection = projectInspections.sort((a, b) => new Date(b.inspection_date).getTime() - new Date(a.inspection_date).getTime())[0]
                        const pendingCount = projectInspections.reduce((count: number, inspection: any) => {
                          // 지적사항2가 실제로 존재하는 경우에만 issue2_status 확인
                          const hasIssue2 = inspection.issue_content2 && inspection.issue_content2.trim() !== ''
                          const overallStatus = hasIssue2
                            ? ((inspection.issue1_status === 'completed' && inspection.issue2_status === 'completed') ? 'completed' : ((inspection.issue1_status === 'pending' && inspection.issue2_status === 'pending') ? 'pending' : 'in_progress'))
                            : inspection.issue1_status
                          return overallStatus !== 'completed' ? count + 1 : count
                        }, 0)
                        const inspectionCount = projectInspections.length

                        // 분기 범위 계산
                        const [yearStr, qStr] = (selectedQuarter || '').split('Q')
                        const year = parseInt(yearStr || '0', 10)
                        const q = parseInt(qStr || '0', 10)
                        const startMonth = (q - 1) * 3 // 0-indexed
                        const start = new Date(year, startMonth, 1)
                        const end = new Date(year, startMonth + 3, 0, 23, 59, 59, 999)

                        // 해당 분기 대상 여부 계산
                        const ia: any = (project as any).is_active
                        let isTarget = false
                        if (ia && typeof ia === 'object') {
                          const key = `q${selectedQuarterNum}` as 'q1' | 'q2' | 'q3' | 'q4'
                          isTarget = !!ia[key]
                        } else {
                          isTarget = false
                        }

                        // 선택 분기 점검 대상이고 점검 횟수가 있는 경우 O 표시
                        const showO = isTarget && inspectionCount > 0
                        return (
                          <tr key={project.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => onRowClickProject(project.id)}>
                            <td className="px-2 py-2 sm:px-6 sm:py-4 text-sm font-medium text-blue-600 hover:text-blue-800 border-r border-gray-200 text-center sticky left-0 z-10 bg-white hover:bg-gray-50 sm:static">
                              <div className="sm:hidden whitespace-nowrap">
                                {(project.project_name || '미지정').length > 4
                                  ? `${(project.project_name || '미지정').substring(0, 4)}...`
                                  : (project.project_name || '미지정')}
                              </div>
                              <div className="hidden sm:block whitespace-nowrap">{project.project_name || '미지정'}</div>
                            </td>
                            <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm text-center border-r border-gray-200">
                              {isTarget ? (
                                <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">대상</span>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm border-r border-gray-200 text-center">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${inspectionCount > 0 ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>{inspectionCount > 0 ? `${inspectionCount}건` : '-'}</span>
                            </td>
                            <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm border-r border-gray-200 text-center">
                              {showO ? (
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold bg-green-100 text-green-800">O</span>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm text-gray-700 border-r border-gray-200 text-center">
                              {latestInspection ? (
                                <span>{latestInspection.inspector_name || '-'} <span className="text-gray-500">({new Date(latestInspection.inspection_date).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })})</span></span>
                              ) : '-'}
                            </td>
                            <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm border-r border-gray-200 text-center">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${pendingCount > 0 ? 'bg-red-100 text-red-800' : inspectionCount > 0 ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>{pendingCount > 0 ? `${pendingCount}건` : '-'}</span>
                            </td>
                            <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-center text-sm">
                              {isHqDownloadMode ? (
                                <input
                                  type="checkbox"
                                  className="w-4 h-4 text-blue-600 border-gray-300 rounded"
                                  onClick={(e) => { e.stopPropagation(); onProjectToggleForReport(project.id) }}
                                  checked={selectedProjectIdsForReport.includes(project.id)}
                                  readOnly
                                />
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : selectedSafetyHq ? (
            (() => {
              // 특정 본부 선택 시: 해당 본부의 지사별 점검 통계
              const branchStats = new Map<string, { projectCount: number; targetCount: number; inspectionCount: number; targetInspectionCount: number; actualCount: number; targetActualCount: number; approvedCount: number; pendingCount: number; lastInspector: string; lastInspectionDate: Date | null }>()
              const quarterNum = (() => {
                const parts = (selectedQuarter || '').split('Q')
                const q = parseInt(parts[1] || '0')
                return isNaN(q) ? Math.ceil((new Date().getMonth() + 1) / 3) : q
              })()

              // 관할 프로젝트 수 계산 및 대상 프로젝트 집합 구성
              const targetProjectIds = new Set<string>()
              projects.forEach((project: Project) => {
                // 선택된 본부의 프로젝트만 필터링
                if (project.managing_hq !== selectedSafetyHq) return

                const ia: any = (project as any).is_active
                if (ia && typeof ia === 'object' && ia.completed) return

                const branch = project.managing_branch
                if (!branchStats.has(branch)) {
                  branchStats.set(branch, { projectCount: 0, targetCount: 0, inspectionCount: 0, targetInspectionCount: 0, actualCount: 0, targetActualCount: 0, approvedCount: 0, pendingCount: 0, lastInspector: '-', lastInspectionDate: null })
                }
                const entry = branchStats.get(branch)!
                entry.projectCount++

                // 해당 분기 공사중 여부 계산 (is_active JSONB 또는 boolean 하위호환)
                let isActiveThisQuarter = false
                if (ia && typeof ia === 'object') {
                  const key = `q${quarterNum}` as 'q1' | 'q2' | 'q3' | 'q4'
                  isActiveThisQuarter = !!ia[key]
                } else {
                  // 구형 boolean 값은 분기판별 불가 → 대상에서 제외
                  isActiveThisQuarter = false
                }
                if (isActiveThisQuarter) {
                  entry.targetCount++
                  targetProjectIds.add(project.id)
                }
              })

              // 분기 범위 계산
              const [yearStr, qStr] = (selectedQuarter || '').split('Q')
              const year = parseInt(yearStr || '0', 10)
              const q = parseInt(qStr || '0', 10)
              const startMonth = (q - 1) * 3 // 0-indexed
              const start = new Date(year, startMonth, 1)
              const end = new Date(year, startMonth + 3, 0, 23, 59, 59, 999)

              // 점검 횟수 계산 (해당 분기 내 점검만 카운트)
              // 실적 계산을 위한 프로젝트별 점검 횟수 집계
              const branchProjectInspectionCounts = new Map<string, Map<string, number>>() // branch -> projectId -> count

              headquartersInspections.forEach((inspection: HeadquartersInspection) => {
                // 선택된 본부의 점검만 필터링
                if (inspection.managing_hq !== selectedSafetyHq) return

                const branch = inspection.managing_branch as string | undefined
                if (!branch) return

                // 해당 분기 내 점검인지 확인
                if (!inspection.inspection_date) return
                const inspectionDate = new Date(inspection.inspection_date)
                if (inspectionDate < start || inspectionDate > end) return

                if (branchStats.has(branch)) {
                  const entry = branchStats.get(branch)!

                  // 해당 분기 내 점검 횟수만 카운트
                  entry.inspectionCount++
                  if (inspection.project_id && targetProjectIds.has(inspection.project_id)) {
                    entry.targetInspectionCount++
                  }

                  // 프로젝트별 점검 횟수 집계 (실적 계산용)
                  if (inspection.project_id) {
                    if (!branchProjectInspectionCounts.has(branch)) {
                      branchProjectInspectionCounts.set(branch, new Map())
                    }
                    const projectCounts = branchProjectInspectionCounts.get(branch)!
                    projectCounts.set(inspection.project_id, (projectCounts.get(inspection.project_id) || 0) + 1)
                  }

                  // 조치대기 건수 계산 (pending과 in_progress 모두 포함)
                  const overallStatus: 'completed' | 'pending' | 'in_progress' = (() => {
                    // 지적사항2가 실제로 존재하는 경우에만 issue2_status 확인
                    const hasIssue2 = inspection.issue_content2 && inspection.issue_content2.trim() !== ''
                    if (hasIssue2) {
                      if (inspection.issue1_status === 'completed' && inspection.issue2_status === 'completed') return 'completed'
                      if (inspection.issue1_status === 'pending' && inspection.issue2_status === 'pending') return 'pending'
                      return 'in_progress'
                    }
                    return inspection.issue1_status as 'completed' | 'pending'
                  })()
                  if (overallStatus !== 'completed') {
                    entry.pendingCount++
                  }

                  // 최근 점검자 업데이트
                  const insDate = new Date(inspection.inspection_date)
                  if (!entry.lastInspectionDate || insDate > entry.lastInspectionDate) {
                    entry.lastInspectionDate = insDate
                    entry.lastInspector = inspection.inspector_name || '-'
                  }
                }
              })

              // 실적 계산: 각 지사별로 프로젝트별 점검 횟수를 집계하여 2회 이상이면 1건으로 계산
              branchProjectInspectionCounts.forEach((projectCounts, branch) => {
                if (branchStats.has(branch)) {
                  const entry = branchStats.get(branch)!
                  let actualCount = 0
                  let targetActualCount = 0

                  projectCounts.forEach((count, projectId) => {
                    // 2회 이상이면 1건, 1회면 1건으로 계산
                    actualCount += 1
                    if (targetProjectIds.has(projectId)) {
                      targetActualCount += 1
                    }
                  })

                  entry.actualCount = actualCount
                  entry.targetActualCount = targetActualCount
                }
              })

              // 실적인정 계산: 각 지사별로 선택 분기 점검 대상이면서 점검 횟수가 있는 프로젝트 수 집계

              projects.forEach((project: Project) => {
                if (project.managing_hq !== selectedSafetyHq) return

                const ia: any = (project as any).is_active
                if (ia && typeof ia === 'object' && ia.completed) return

                const branch = project.managing_branch
                if (!branchStats.has(branch)) return

                // 선택 분기 점검 대상인지 확인
                const qKey = `q${selectedQuarterNum}` as 'q1' | 'q2' | 'q3' | 'q4'
                const isTarget = ia && typeof ia === 'object' ? !!ia[qKey] : false

                if (isTarget) {
                  const projectInspections = headquartersInspections.filter((i: any) => i.project_id === project.id)
                  if (projectInspections.length > 0) {
                    const entry = branchStats.get(branch)!
                    entry.approvedCount++
                  }
                }
              })

              return branchStats.size === 0 ? (
                <div className="text-center py-12">
                  <AlertTriangle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h4 className="text-lg font-medium text-gray-900 mb-2">점검 데이터가 없습니다</h4>
                  <p className="text-gray-600">선택한 분기에 등록된 본부 불시점검 결과가 없습니다.</p>
                </div>
              ) : (
                <div>
                  <div className="flex items-center mb-4">
                    <button
                      onClick={() => onBackToAllBranches()}
                      className="inline-flex items-center justify-center p-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 shadow-sm"
                      title="전체 본부로 돌아가기"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-2 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 w-auto sm:w-auto sticky left-0 z-10 bg-gray-50 sm:static">지사명</th>
                          <th className="px-2 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 w-auto sm:w-auto whitespace-nowrap">지구</th>
                          <th className="px-2 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 w-auto sm:w-auto whitespace-nowrap">대상</th>
                          <th className="px-2 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 w-auto sm:w-auto whitespace-nowrap">점검</th>
                          <th className="px-2 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 w-auto sm:w-auto whitespace-nowrap">실적인정</th>
                          <th className="px-2 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 w-auto sm:w-auto whitespace-nowrap">최근점검자</th>
                          <th
                            className="px-2 py-2 sm:px-4 sm:py-3 text-center text-xs font-medium uppercase tracking-wider border-r border-gray-200 w-auto sm:w-auto whitespace-nowrap"
                          >
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setShowPendingModal(true)
                              }}
                              title="클릭하면 대기 목록 보기"
                              className="px-3 py-1.5 bg-gradient-to-b from-amber-400 to-amber-500 text-white font-semibold rounded-lg shadow-md hover:from-amber-500 hover:to-amber-600 hover:shadow-lg active:shadow-sm active:translate-y-0.5 transition-all border border-amber-600"
                            >
                              📋 대기 건수
                            </button>
                          </th>
                          <th className="px-2 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 w-auto sm:w-auto whitespace-nowrap">점검률(대상)</th>
                          <th className="px-2 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-auto sm:w-auto">비고</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {(() => {
                          // 선택된 본부의 지사 순서대로 정렬
                          const orderedBranches: string[] = BRANCH_OPTIONS[selectedSafetyHq] || []
                          const filteredBranches = orderedBranches.filter(branch => branchStats.has(branch))

                          // 소계 계산
                          const subtotal = filteredBranches.reduce(
                            (acc, branch) => {
                              const s = branchStats.get(branch)!
                              acc.projectCount += s.projectCount
                              acc.targetCount += s.targetCount
                              acc.inspectionCount += s.inspectionCount
                              acc.targetInspectionCount += s.targetInspectionCount
                              acc.actualCount += s.actualCount
                              acc.targetActualCount += s.targetActualCount
                              acc.approvedCount += s.approvedCount
                              acc.pendingCount += s.pendingCount
                              return acc
                            },
                            { projectCount: 0, targetCount: 0, inspectionCount: 0, targetInspectionCount: 0, actualCount: 0, targetActualCount: 0, approvedCount: 0, pendingCount: 0 }
                          )
                          const subtotalRate = subtotal.targetCount > 0 ? Math.round((subtotal.targetInspectionCount / subtotal.targetCount) * 100) : 0

                          return (
                            <>
                              <tr key="subtotal" className="bg-blue-50 font-semibold border-b-2 border-blue-200">
                                <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap border-r border-blue-200 text-center sticky left-0 z-10 bg-blue-50 sm:static">
                                  <div className="text-xs sm:text-sm font-bold text-blue-900">소계 ({filteredBranches.length}개 지사)</div>
                                </td>
                                <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap border-r border-blue-200 text-blue-900 text-center text-xs sm:text-sm">{subtotal.projectCount === 0 ? '-' : subtotal.projectCount}</td>
                                <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap border-r border-blue-200 text-blue-900 text-center text-xs sm:text-sm">{subtotal.targetCount === 0 ? '-' : subtotal.targetCount}</td>
                                <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap border-r border-blue-200 text-blue-900 text-center text-xs sm:text-sm">
                                  {subtotal.inspectionCount === 0 ? '-' : subtotal.inspectionCount}
                                </td>
                                <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap border-r border-blue-200 text-blue-900 text-center text-xs sm:text-sm">
                                  {subtotal.approvedCount === 0 ? '-' : subtotal.approvedCount}
                                </td>
                                <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap border-r border-blue-200 text-blue-900 text-center text-xs sm:text-sm">-</td>
                                <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap border-r border-blue-200 text-blue-900 text-center text-xs sm:text-sm">{subtotal.pendingCount === 0 ? '-' : subtotal.pendingCount}</td>
                                <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap border-r border-blue-200 text-center">
                                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${subtotalRate >= 80 ? 'bg-green-100 text-green-800' : subtotalRate >= 60 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>{subtotalRate}%</span>
                                </td>
                                <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-center text-xs sm:text-sm">-</td>
                              </tr>

                              {filteredBranches.map(branch => {
                                const stats = branchStats.get(branch)!
                                const rate = stats.targetCount > 0 ? Math.round((stats.targetInspectionCount / stats.targetCount) * 100) : 0
                                return (
                                  <tr
                                    key={branch}
                                    className="hover:bg-gray-50 cursor-pointer divide-x divide-gray-200"
                                    onClick={() => onSelectSafetyBranch(branch)}
                                  >
                                    <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap border-r border-gray-200 text-center sticky left-0 z-10 bg-white hover:bg-gray-50 sm:static">
                                      <div className="text-xs sm:text-sm font-medium text-blue-600 hover:text-blue-800">{branch}</div>
                                    </td>
                                    <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap border-r border-gray-200 text-center">
                                      <div className="text-xs sm:text-sm text-gray-900">{stats.projectCount === 0 ? '-' : stats.projectCount}</div>
                                    </td>
                                    <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap border-r border-gray-200 text-center">
                                      <div className="text-xs sm:text-sm text-gray-900">{stats.targetCount === 0 ? '-' : stats.targetCount}</div>
                                    </td>
                                    <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap border-r border-gray-200 text-center">
                                      <div className="text-xs sm:text-sm font-semibold text-blue-600">{stats.inspectionCount === 0 ? '-' : stats.inspectionCount}</div>
                                    </td>
                                    <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap border-r border-gray-200 text-center">
                                      <div className="text-xs sm:text-sm font-semibold text-green-600">{stats.approvedCount === 0 ? '-' : stats.approvedCount}</div>
                                    </td>
                                    <td className="px-2 py-2 sm:px-6 sm:py-4 border-r border-gray-200 text-center">
                                      <div className="text-xs sm:text-sm text-gray-700">
                                        {stats.lastInspector !== '-' ? (
                                          <>
                                            <span className="sm:hidden flex flex-col">
                                              <span>{stats.lastInspector}</span>
                                              <span className="text-gray-500">({stats.lastInspectionDate ? new Date(stats.lastInspectionDate).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }) : '-'})</span>
                                            </span>
                                            <span className="hidden sm:inline">{stats.lastInspector} <span className="text-gray-500">({stats.lastInspectionDate ? new Date(stats.lastInspectionDate).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }) : '-'})</span></span>
                                          </>
                                        ) : '-'}
                                      </div>
                                    </td>
                                    <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap border-r border-gray-200 text-center">
                                      <div className="text-xs sm:text-sm font-semibold text-orange-600">{stats.pendingCount === 0 ? '-' : stats.pendingCount}</div>
                                    </td>
                                    <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap border-r border-gray-200 text-center">
                                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${rate >= 80 ? 'bg-green-100 text-green-800' : rate >= 60 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>{rate}%</span>
                                    </td>
                                    <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-center">
                                      {isHqDownloadMode ? (
                                        <input
                                          type="checkbox"
                                          className="w-4 h-4 text-blue-600 border-gray-300 rounded"
                                          onClick={(e) => { e.stopPropagation(); onBranchToggleForReport(branch) }}
                                          checked={selectedBranchesForReport.includes(branch)}
                                          readOnly
                                        />
                                      ) : (
                                        <span className="text-xs sm:text-sm text-gray-400">-</span>
                                      )}
                                    </td>
                                  </tr>
                                )
                              })}
                            </>
                          )
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })()
          ) : (
            (() => {
              // 본부별 점검 통계 (전체 본부 테이블)
              const hqStats = new Map<string, { projectCount: number; targetCount: number; inspectionCount: number; targetInspectionCount: number; actualCount: number; targetActualCount: number; pendingCount: number; lastInspector: string; lastInspectionDate: Date | null }>()
              const quarterNum = (() => {
                const parts = (selectedQuarter || '').split('Q')
                const q = parseInt(parts[1] || '0')
                return isNaN(q) ? Math.ceil((new Date().getMonth() + 1) / 3) : q
              })()

              // 관할 프로젝트 수 계산 및 대상 프로젝트 집합 구성
              const targetProjectIds = new Set<string>()
              projects.forEach((project: Project) => {
                if (selectedHq && project.managing_hq !== selectedHq) return
                if (selectedBranch && project.managing_branch !== selectedBranch) return

                const ia: any = (project as any).is_active
                if (ia && typeof ia === 'object' && ia.completed) return

                const hq = project.managing_hq || '미지정'
                if (!hqStats.has(hq)) {
                  hqStats.set(hq, { projectCount: 0, targetCount: 0, inspectionCount: 0, targetInspectionCount: 0, actualCount: 0, targetActualCount: 0, pendingCount: 0, lastInspector: '-', lastInspectionDate: null })
                }
                const entry = hqStats.get(hq)!
                entry.projectCount++

                // 해당 분기 공사중 여부 계산 (is_active JSONB 또는 boolean 하위호환)
                let isActiveThisQuarter = false
                if (ia && typeof ia === 'object') {
                  const key = `q${quarterNum}` as 'q1' | 'q2' | 'q3' | 'q4'
                  isActiveThisQuarter = !!ia[key]
                } else {
                  // 구형 boolean 값은 분기판별 불가 → 대상에서 제외
                  isActiveThisQuarter = false
                }
                if (isActiveThisQuarter) {
                  entry.targetCount++
                  targetProjectIds.add(project.id)
                }
              })

              // 분기 범위 계산
              const [yearStr2, qStr2] = (selectedQuarter || '').split('Q')
              const year2 = parseInt(yearStr2 || '0', 10)
              const q2 = parseInt(qStr2 || '0', 10)
              const startMonth2 = (q2 - 1) * 3 // 0-indexed
              const start2 = new Date(year2, startMonth2, 1)
              const end2 = new Date(year2, startMonth2 + 3, 0, 23, 59, 59, 999)

              // 점검 횟수 계산 (해당 분기 내 점검만 카운트)
              // 실적 계산을 위한 프로젝트별 점검 횟수 집계
              const hqProjectInspectionCounts = new Map<string, Map<string, number>>() // hq -> projectId -> count

              headquartersInspections.forEach((inspection: HeadquartersInspection) => {
                if (selectedHq && inspection.managing_hq !== selectedHq) return
                if (selectedBranch && inspection.managing_branch !== selectedBranch) return

                // 해당 분기 내 점검인지 확인
                if (!inspection.inspection_date) return
                const inspectionDate = new Date(inspection.inspection_date)
                if (inspectionDate < start2 || inspectionDate > end2) return

                const hq = inspection.managing_hq || '미지정'
                if (!hqStats.has(hq)) {
                  hqStats.set(hq, { projectCount: 0, targetCount: 0, inspectionCount: 0, targetInspectionCount: 0, actualCount: 0, targetActualCount: 0, pendingCount: 0, lastInspector: '-', lastInspectionDate: null })
                }

                const entry = hqStats.get(hq)!

                // 해당 분기 내 점검 횟수만 카운트
                entry.inspectionCount++
                if (inspection.project_id && targetProjectIds.has(inspection.project_id)) {
                  entry.targetInspectionCount++
                }

                // 프로젝트별 점검 횟수 집계 (실적 계산용)
                if (inspection.project_id) {
                  if (!hqProjectInspectionCounts.has(hq)) {
                    hqProjectInspectionCounts.set(hq, new Map())
                  }
                  const projectCounts = hqProjectInspectionCounts.get(hq)!
                  projectCounts.set(inspection.project_id, (projectCounts.get(inspection.project_id) || 0) + 1)
                }

                // 조치대기 건수 계산 (pending과 in_progress 모두 포함)
                const overallStatus: 'completed' | 'pending' | 'in_progress' = (() => {
                  // 지적사항2가 실제로 존재하는 경우에만 issue2_status 확인
                  const hasIssue2 = inspection.issue_content2 && inspection.issue_content2.trim() !== ''
                  if (hasIssue2) {
                    if (inspection.issue1_status === 'completed' && inspection.issue2_status === 'completed') return 'completed'
                    if (inspection.issue1_status === 'pending' && inspection.issue2_status === 'pending') return 'pending'
                    return 'in_progress'
                  }
                  return inspection.issue1_status as 'completed' | 'pending'
                })()
                if (overallStatus !== 'completed') {
                  entry.pendingCount++
                }

                // 최근 점검자 업데이트
                const insDate = new Date(inspection.inspection_date)
                if (!entry.lastInspectionDate || insDate > entry.lastInspectionDate) {
                  entry.lastInspectionDate = insDate
                  entry.lastInspector = inspection.inspector_name || '-'
                }
              })

              // 실적 계산: 각 본부별로 프로젝트별 점검 횟수를 집계하여 2회 이상이면 1건으로 계산
              hqProjectInspectionCounts.forEach((projectCounts, hq) => {
                if (hqStats.has(hq)) {
                  const entry = hqStats.get(hq)!
                  let actualCount = 0
                  let targetActualCount = 0

                  projectCounts.forEach((count, projectId) => {
                    // 2회 이상이면 1건, 1회면 1건으로 계산
                    actualCount += 1
                    if (targetProjectIds.has(projectId)) {
                      targetActualCount += 1
                    }
                  })

                  entry.actualCount = actualCount
                  entry.targetActualCount = targetActualCount
                }
              })

              return hqStats.size === 0 ? (
                <div className="text-center py-12">
                  <AlertTriangle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h4 className="text-lg font-medium text-gray-900 mb-2">점검 데이터가 없습니다</h4>
                  <p className="text-gray-600">선택한 분기에 등록된 본부 불시점검 결과가 없습니다.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-2 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 w-auto sm:w-auto">본부명</th>
                        <th className="px-2 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 w-auto sm:w-auto whitespace-nowrap">총 프로젝트 수</th>
                        <th className="px-2 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 w-auto sm:w-auto whitespace-nowrap">점검대상 수</th>
                        <th className="px-2 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 w-auto sm:w-auto whitespace-nowrap">점검횟수(대상)</th>
                        <th className="px-2 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 w-auto sm:w-auto whitespace-nowrap">실적</th>
                        <th className="px-2 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 w-auto sm:w-auto whitespace-nowrap">최근점검자</th>
                        <th
                          className="px-2 py-2 sm:px-4 sm:py-3 text-center text-xs font-medium uppercase tracking-wider border-r border-gray-200 w-auto sm:w-auto whitespace-nowrap"
                        >
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setShowPendingModal(true)
                            }}
                            title="클릭하면 대기 목록 보기"
                            className="px-3 py-1.5 bg-gradient-to-b from-amber-400 to-amber-500 text-white font-semibold rounded-lg shadow-md hover:from-amber-500 hover:to-amber-600 hover:shadow-lg active:shadow-sm active:translate-y-0.5 transition-all border border-amber-600"
                          >
                            📋 대기 건수
                          </button>
                        </th>
                        <th className="px-2 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 w-auto sm:w-auto whitespace-nowrap">점검률(대상)</th>
                        <th className="px-2 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-auto sm:w-auto">비고</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {(() => {
                        // HEADQUARTERS_OPTIONS의 모든 본부를 표시 (데이터가 없어도)
                        const orderedHqs: string[] = [...HEADQUARTERS_OPTIONS]
                        // 미지정 본부가 있다면 맨 뒤에 추가
                        if (hqStats.has('미지정')) {
                          orderedHqs.push('미지정')
                        }

                        // 소계 계산 (데이터가 있는 본부만)
                        const subtotal = orderedHqs.reduce(
                          (acc, hq) => {
                            const s = hqStats.get(hq)
                            if (s) {
                              acc.projectCount += s.projectCount
                              acc.targetCount += s.targetCount
                              acc.inspectionCount += s.inspectionCount
                              acc.targetInspectionCount += s.targetInspectionCount
                              acc.actualCount += s.actualCount
                              acc.targetActualCount += s.targetActualCount
                              acc.pendingCount += s.pendingCount
                            }
                            return acc
                          },
                          { projectCount: 0, targetCount: 0, inspectionCount: 0, targetInspectionCount: 0, actualCount: 0, targetActualCount: 0, pendingCount: 0 }
                        )
                        const subtotalRate = subtotal.targetCount > 0 ? Math.round((subtotal.targetInspectionCount / subtotal.targetCount) * 100) : 0

                        return (
                          <>
                            <tr key="subtotal" className="bg-blue-50 font-semibold border-b-2 border-blue-200">
                              <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap border-r border-blue-200 text-center">
                                <div className="text-xs sm:text-sm font-bold text-blue-900">소계 ({orderedHqs.length}개 본부)</div>
                              </td>
                              <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap border-r border-blue-200 text-blue-900 text-center text-xs sm:text-sm">{subtotal.projectCount === 0 ? '-' : subtotal.projectCount}</td>
                              <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap border-r border-blue-200 text-blue-900 text-center text-xs sm:text-sm">{subtotal.targetCount === 0 ? '-' : subtotal.targetCount}</td>
                              <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap border-r border-blue-200 text-blue-900 text-center text-xs sm:text-sm">
                                {subtotal.inspectionCount === 0 ? '-' : subtotal.inspectionCount}
                              </td>
                              <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap border-r border-blue-200 text-blue-900 text-center text-xs sm:text-sm">
                                {subtotal.actualCount === 0 ? '-' : (<><span>{subtotal.actualCount}</span> <span className="text-gray-500 font-normal">({subtotal.targetActualCount})</span></>)}
                              </td>
                              <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap border-r border-blue-200 text-blue-900 text-center text-xs sm:text-sm">-</td>
                              <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap border-r border-blue-200 text-blue-900 text-center text-xs sm:text-sm">{subtotal.pendingCount === 0 ? '-' : subtotal.pendingCount}</td>
                              <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap border-r border-blue-200 text-center">
                                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${subtotalRate >= 80 ? 'bg-green-100 text-green-800' : subtotalRate >= 60 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>{subtotalRate}%</span>
                              </td>
                              <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-center text-xs sm:text-sm">-</td>
                            </tr>

                            {orderedHqs.map(hq => {
                              const stats = hqStats.get(hq) || { projectCount: 0, targetCount: 0, inspectionCount: 0, targetInspectionCount: 0, actualCount: 0, targetActualCount: 0, pendingCount: 0, lastInspector: '-', lastInspectionDate: null }
                              const rate = stats.targetCount > 0 ? Math.round((stats.targetInspectionCount / stats.targetCount) * 100) : 0
                              return (
                                <tr
                                  key={hq}
                                  className="hover:bg-gray-50 cursor-pointer divide-x divide-gray-200"
                                  onClick={() => onSelectSafetyHq(hq)}
                                >
                                  <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap border-r border-gray-200 text-center">
                                    <div className="text-xs sm:text-sm font-medium text-blue-600 hover:text-blue-800">{hq}</div>
                                  </td>
                                  <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap border-r border-gray-200 text-center">
                                    <div className="text-xs sm:text-sm text-gray-900">{stats.projectCount === 0 ? '-' : stats.projectCount}</div>
                                  </td>
                                  <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap border-r border-gray-200 text-center">
                                    <div className="text-xs sm:text-sm text-gray-900">{stats.targetCount === 0 ? '-' : stats.targetCount}</div>
                                  </td>
                                  <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap border-r border-gray-200 text-center">
                                    <div className="text-xs sm:text-sm font-semibold text-blue-600">{stats.inspectionCount === 0 ? '-' : stats.inspectionCount}</div>
                                  </td>
                                  <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap border-r border-gray-200 text-center">
                                    <div className="text-xs sm:text-sm font-semibold text-green-600">{stats.actualCount === 0 ? '-' : (<><span>{stats.actualCount}</span> <span className="text-gray-500 font-normal">({stats.targetActualCount})</span></>)}</div>
                                  </td>
                                  <td className="px-2 py-2 sm:px-6 sm:py-4 border-r border-gray-200 text-center">
                                    <div className="text-xs sm:text-sm text-gray-700">
                                      {stats.lastInspector !== '-' ? (
                                        <>
                                          <span className="sm:hidden flex flex-col">
                                            <span>{stats.lastInspector}</span>
                                            <span className="text-gray-500">({stats.lastInspectionDate ? new Date(stats.lastInspectionDate).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }) : '-'})</span>
                                          </span>
                                          <span className="hidden sm:inline">{stats.lastInspector} <span className="text-gray-500">({stats.lastInspectionDate ? new Date(stats.lastInspectionDate).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }) : '-'})</span></span>
                                        </>
                                      ) : '-'}
                                    </div>
                                  </td>
                                  <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap border-r border-gray-200 text-center">
                                    <div className="text-xs sm:text-sm font-semibold text-orange-600">{stats.pendingCount === 0 ? '-' : stats.pendingCount}</div>
                                  </td>
                                  <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap border-r border-gray-200 text-center">
                                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${rate >= 80 ? 'bg-green-100 text-green-800' : rate >= 60 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>{rate}%</span>
                                  </td>
                                  <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-center">
                                    <span className="text-xs sm:text-sm text-gray-400">-</span>
                                  </td>
                                </tr>
                              )
                            })}
                          </>
                        )
                      })()}
                    </tbody>
                  </table>
                </div>
              )
            })()
          )}
        </div>

        {/* 대기 건수 상세 모달 */}
        {showPendingModal && (() => {
          // 대기 건수가 있는 프로젝트들 필터링
          const pendingProjects: Array<{
            branch: string
            projectName: string
            inspector: string
            inspectionDate: string
            pendingCount: number
            projectId: string
            phoneNumber?: string
            creatorName?: string
            creatorCompany?: string
          }> = []

          const filteredProjects = selectedSafetyHq
            ? projects.filter((p: any) => p.managing_hq === selectedSafetyHq)
            : projects

          filteredProjects.forEach((project: any) => {
            const projectInspections = headquartersInspections.filter((i: any) => i.project_id === project.id)

            projectInspections.forEach((inspection: any) => {
              const hasIssue2 = inspection.issue_content2 && inspection.issue_content2.trim() !== ''
              const overallStatus = hasIssue2
                ? ((inspection.issue1_status === 'completed' && inspection.issue2_status === 'completed') ? 'completed' : ((inspection.issue1_status === 'pending' && inspection.issue2_status === 'pending') ? 'pending' : 'in_progress'))
                : inspection.issue1_status

              if (overallStatus !== 'completed') {
                // 프로젝트 등록자(created_by)의 연락처 사용
                const creatorPhone = project.user_profiles?.phone_number
                const creatorName = project.user_profiles?.full_name || '프로젝트 등록자'
                const creatorCompany = project.user_profiles?.company_name

                pendingProjects.push({
                  branch: project.managing_branch || '미지정',
                  projectName: project.project_name || '프로젝트명 없음',
                  inspector: inspection.inspector_name || '-',
                  inspectionDate: inspection.inspection_date || '-',
                  pendingCount: 1,
                  projectId: project.id,
                  phoneNumber: creatorPhone,
                  creatorName: creatorName,
                  creatorCompany: creatorCompany
                })
              }
            })
          })

          // 점검일자 순으로 정렬 (최신순)
          pendingProjects.sort((a, b) => {
            const dateA = a.inspectionDate !== '-' ? new Date(a.inspectionDate).getTime() : 0
            const dateB = b.inspectionDate !== '-' ? new Date(b.inspectionDate).getTime() : 0
            return dateB - dateA // 최신순 (내림차순)
          })

          // 소계 계산
          const totalPendingCount = pendingProjects.reduce((sum, item) => sum + item.pendingCount, 0)

          return (
            <div
              className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
              onClick={() => setShowPendingModal(false)}
            >
              <div
                className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between p-4 border-b">
                  <h3 className="text-lg font-semibold text-gray-900">대기 건수 상세 목록</h3>
                  <button
                    onClick={() => setShowPendingModal(false)}
                    className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    title="닫기"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                  {pendingProjects.length === 0 ? (
                    <div className="text-center py-12">
                      <AlertTriangle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-600">대기 건수가 없습니다.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">지사</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">프로젝트명</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">점검자(점검일자)</th>
                            <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">대기건수</th>
                            <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">전화</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {/* 소계 행 */}
                          <tr className="bg-blue-50 font-semibold border-b-2 border-blue-200">
                            <td className="px-3 py-2 whitespace-nowrap text-sm font-bold text-blue-900" colSpan={2}>
                              소계 ({pendingProjects.length}건)
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap text-sm text-blue-900">-</td>
                            <td className="px-3 py-2 whitespace-nowrap text-sm text-center font-bold text-blue-900">{totalPendingCount}</td>
                            <td className="px-3 py-2 whitespace-nowrap text-sm text-center text-blue-900">-</td>
                          </tr>
                          {pendingProjects.map((item, index) => (
                            <tr key={`${item.projectId}-${index}`} className="hover:bg-gray-50">
                              <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">{item.branch}</td>
                              <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">{item.projectName}</td>
                              <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">
                                {item.inspector} ({item.inspectionDate ? new Date(item.inspectionDate).toLocaleDateString('ko-KR') : '-'})
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap text-sm text-center font-semibold text-orange-600">{item.pendingCount}</td>
                              <td className="px-3 py-2 whitespace-nowrap text-sm text-center">
                                {item.phoneNumber ? (
                                  <button
                                    onClick={() => {
                                      setPendingModalData({
                                        name: item.creatorName || '프로젝트 등록자',
                                        phone: item.phoneNumber!,
                                        companyName: item.creatorCompany
                                      })
                                      setShowPhoneModal(true)
                                    }}
                                    className="p-2 rounded-lg transition-colors bg-blue-100 text-blue-700 hover:bg-blue-200"
                                    title={`${item.creatorName || '프로젝트 등록자'}에게 전화하기`}
                                  >
                                    <Phone className="h-4 w-4" />
                                  </button>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })()}

        {/* 전화 모달 */}
        {showPhoneModal && pendingModalData && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
            onClick={() => {
              setShowPhoneModal(false)
              setShowPendingModal(true)
            }}
          >
            <div
              className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">전화하기</h3>
                <button
                  onClick={() => {
                    setShowPhoneModal(false)
                    setShowPendingModal(true)
                  }}
                  className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  title="닫기"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4">
                {pendingModalData.companyName && (
                  <div>
                    <p className="text-sm text-gray-600 mb-1">회사명</p>
                    <p className="text-lg font-medium text-gray-900">{pendingModalData.companyName}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm text-gray-600 mb-1">이름</p>
                  <p className="text-lg font-medium text-gray-900">{pendingModalData.name}</p>
                </div>

                <div>
                  <p className="text-sm text-gray-600 mb-1">전화번호</p>
                  <a
                    href={`tel:${pendingModalData.phone}`}
                    className="text-lg font-medium text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-2"
                  >
                    <Phone className="h-5 w-5" />
                    {pendingModalData.phone}
                  </a>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-2">
                <button
                  onClick={() => {
                    setShowPhoneModal(false)
                    setShowPendingModal(true)
                  }}
                  className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  취소
                </button>
                <a
                  href={`tel:${pendingModalData.phone}`}
                  className="px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-2"
                >
                  <Phone className="h-4 w-4" />
                  전화 걸기
                </a>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 년도 선택 팝업 모달 */}
      {showYearModal && (
        <div
          className="fixed inset-0 flex items-center justify-center z-[100]"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
          onClick={() => setShowYearModal(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl p-6 w-64"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center space-y-4">
              {/* + 버튼 */}
              <button
                type="button"
                onClick={() => setTempYear(prev => Math.min(prev + 1, 2100))}
                className="w-16 h-16 rounded-full bg-blue-600 text-white text-3xl font-bold hover:bg-blue-700 transition-colors flex items-center justify-center"
              >
                +
              </button>

              {/* 년도 표시 */}
              <div className="text-4xl font-bold text-gray-900 py-2">
                {tempYear}
              </div>

              {/* - 버튼 */}
              <button
                type="button"
                onClick={() => setTempYear(prev => Math.max(prev - 1, 2000))}
                className="w-16 h-16 rounded-full bg-blue-600 text-white text-3xl font-bold hover:bg-blue-700 transition-colors flex items-center justify-center"
              >
                −
              </button>

              {/* 취소 / 확인 버튼 */}
              <div className="flex space-x-3 w-full mt-4">
                <button
                  type="button"
                  onClick={() => setShowYearModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleYearChange(tempYear)
                    setShowYearModal(false)
                  }}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  확인
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default SafetyHeadquartersView


