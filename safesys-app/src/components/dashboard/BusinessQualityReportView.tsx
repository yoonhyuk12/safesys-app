// 사업현황 품질시험 월례보고서 카드의 본부별→지사별→프로젝트별 제출 현황 드릴다운 뷰
'use client'

import React, { useState, useMemo } from 'react'
import { ArrowLeft, FlaskConical, Building, ChevronDown, ChevronUp } from 'lucide-react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import type { QualityReportStatusByProject } from '@/lib/projects'
import { HEADQUARTERS_OPTIONS, BRANCH_OPTIONS } from '@/lib/constants'

interface BusinessQualityReportViewProps {
  loading: boolean
  reportStatuses: QualityReportStatusByProject[]
  initialBranch?: string | null
  onBack: () => void
  onRowClickProject: (projectId: string, branch: string | null) => void
}

interface AggStats {
  projectCount: number
  monthlySubmittedCounts: number[]
}

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1)

const emptyStats = (): AggStats => ({ projectCount: 0, monthlySubmittedCounts: MONTHS.map(() => 0) })

const hasMonthlySubmission = (status: QualityReportStatusByProject, year: number, month: number) => (
  status.submitted_year_months.includes(`${year}-${String(month).padStart(2, '0')}`)
)

// 지사명으로 소속 본부를 역추적 (수불부/보고서에서 복귀 시 지사 → 본부 복원용)
const findHqOfBranch = (branch: string): string | null => {
  for (const [hq, branches] of Object.entries(BRANCH_OPTIONS)) {
    if (branches.includes(branch)) return hq
  }
  return null
}

const BusinessQualityReportView: React.FC<BusinessQualityReportViewProps> = ({
  loading,
  reportStatuses,
  initialBranch = null,
  onBack,
  onRowClickProject,
}) => {
  // initialBranch가 있으면(보고서 페이지에서 복귀) 해당 지사의 프로젝트 목록부터 복원
  const [viewLevel, setViewLevel] = useState<'hq' | 'branch' | 'project'>(initialBranch ? 'project' : 'hq')
  const [selectedHqForDetail, setSelectedHqForDetail] = useState<string | null>(
    initialBranch ? findHqOfBranch(initialBranch) : null
  )
  const [selectedBranchForDetail, setSelectedBranchForDetail] = useState<string | null>(initialBranch)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const today = new Date()
  const currentYear = today.getFullYear()
  const currentMonth = today.getMonth() + 1

  const isCurrentMonthColumn = (month: number) => (
    selectedYear === currentYear && month === currentMonth
  )

  const totalStats = useMemo(() => {
    return reportStatuses.reduce((acc, status) => {
      acc.projectCount += 1
      MONTHS.forEach(month => {
        if (hasMonthlySubmission(status, selectedYear, month)) {
          acc.monthlySubmittedCounts[month - 1] += 1
        }
      })
      return acc
    }, emptyStats())
  }, [reportStatuses, selectedYear])

  // 본부별 통계 — HEADQUARTERS_OPTIONS 순서 유지, 없는 본부는 뒤에
  const hqStats = useMemo(() => {
    const stats = new Map<string, AggStats>()
    HEADQUARTERS_OPTIONS.forEach(hq => stats.set(hq, emptyStats()))
    reportStatuses.forEach(s => {
      const hq = s.managing_hq || '미지정'
      const existing = stats.get(hq) || emptyStats()
      existing.projectCount += 1
      MONTHS.forEach(month => {
        if (hasMonthlySubmission(s, selectedYear, month)) {
          existing.monthlySubmittedCounts[month - 1] += 1
        }
      })
      stats.set(hq, existing)
    })
    return stats
  }, [reportStatuses, selectedYear])

  // 지사별 통계 (본부 선택 시)
  const branchStats = useMemo(() => {
    if (!selectedHqForDetail) return new Map<string, AggStats>()
    const stats = new Map<string, AggStats>()
    ;(BRANCH_OPTIONS[selectedHqForDetail] || []).forEach(b => stats.set(b, emptyStats()))
    reportStatuses
      .filter(s => (s.managing_hq || '미지정') === selectedHqForDetail)
      .forEach(s => {
        const branch = s.managing_branch || '미지정'
        const existing = stats.get(branch) || emptyStats()
        existing.projectCount += 1
        MONTHS.forEach(month => {
          if (hasMonthlySubmission(s, selectedYear, month)) {
            existing.monthlySubmittedCounts[month - 1] += 1
          }
        })
        stats.set(branch, existing)
      })
    return stats
  }, [reportStatuses, selectedHqForDetail, selectedYear])

  // 프로젝트 목록 (지사 선택 시) — 선택 연도 제출월이 적은 순, 그다음 이름순
  const projectList = useMemo(() => {
    if (!selectedBranchForDetail) return []
    return reportStatuses
      .filter(s => s.managing_branch === selectedBranchForDetail)
      .sort((a, b) => {
        const aSubmittedCount = MONTHS.filter(month => hasMonthlySubmission(a, selectedYear, month)).length
        const bSubmittedCount = MONTHS.filter(month => hasMonthlySubmission(b, selectedYear, month)).length
        if (aSubmittedCount !== bSubmittedCount) {
          return aSubmittedCount - bSubmittedCount
        }
        return a.project_name.localeCompare(b.project_name, 'ko-KR')
      })
  }, [reportStatuses, selectedBranchForDetail, selectedYear])

  const handleBack = () => {
    if (viewLevel === 'project') {
      setSelectedBranchForDetail(null)
      // 복귀 진입 등으로 본부를 모르면 본부 단계로
      setViewLevel(selectedHqForDetail ? 'branch' : 'hq')
    } else if (viewLevel === 'branch') {
      setViewLevel('hq')
      setSelectedHqForDetail(null)
    } else {
      onBack()
    }
  }

  const handleHqClick = (hq: string) => {
    setSelectedHqForDetail(hq)
    setViewLevel('branch')
  }

  const handleBranchClick = (branch: string) => {
    setSelectedBranchForDetail(branch)
    setViewLevel('project')
  }

  // 소계/행 공용 셀 — 월별 제출 프로젝트 수
  const renderMonthlyCells = (stats: AggStats, highlightCurrentMonth = false) => (
    <>
      {stats.monthlySubmittedCounts.map((count, index) => {
        const month = MONTHS[index]
        const isHighlighted = highlightCurrentMonth && isCurrentMonthColumn(month)
        return (
          <td key={month} className={`px-3 py-3 text-sm text-center ${isHighlighted ? 'bg-amber-50' : ''}`}>
            {count > 0 ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                {count}개
              </span>
            ) : (
              <span className="text-gray-400">-</span>
            )}
          </td>
        )
      })}
    </>
  )

  const renderYearSelector = () => (
    <div className="flex items-center gap-2" aria-label="조회 연도 선택">
      <span className="min-w-14 text-center text-sm font-semibold text-emerald-700">{selectedYear}년</span>
      <div className="flex flex-col overflow-hidden rounded border border-emerald-200 bg-white">
        <button
          type="button"
          onClick={() => setSelectedYear(year => year + 1)}
          className="px-1.5 py-0.5 text-emerald-600 hover:bg-emerald-100 transition-colors"
          aria-label={`${selectedYear + 1}년 보기`}
          title="다음 연도"
        >
          <ChevronUp className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={() => setSelectedYear(year => year - 1)}
          className="border-t border-emerald-200 px-1.5 py-0.5 text-emerald-600 hover:bg-emerald-100 transition-colors"
          aria-label={`${selectedYear - 1}년 보기`}
          title="이전 연도"
        >
          <ChevronDown className="h-3 w-3" />
        </button>
      </div>
    </div>
  )

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[300px]">
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={handleBack}
          className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          aria-label="뒤로가기"
        >
          <ArrowLeft className="h-5 w-5 text-gray-300" />
        </button>
        <div className="flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-emerald-400" />
          <h2 className="text-lg font-semibold text-white">
            품질시험 월례보고서 제출현황
            {viewLevel === 'branch' && selectedHqForDetail && (
              <span className="text-sm font-normal text-gray-300 ml-2">- {selectedHqForDetail}</span>
            )}
            {viewLevel === 'project' && selectedBranchForDetail && (
              <span className="text-sm font-normal text-gray-300 ml-2">- {selectedBranchForDetail}</span>
            )}
          </h2>
        </div>
        <div className="ml-auto text-sm text-gray-300">
          {selectedYear}년 월별 제출현황
        </div>
      </div>

      {/* 본부별 테이블 */}
      {viewLevel === 'hq' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-emerald-50 px-4 py-3 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building className="h-4 w-4 text-emerald-600" />
                <span className="text-sm font-medium text-emerald-800">본부별 제출현황</span>
              </div>
              {renderYearSelector()}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">본부명</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">프로젝트수</th>
                  {MONTHS.map(month => (
                    <th key={month} className="min-w-16 px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">{month}월</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {/* 소계 */}
                <tr className="bg-emerald-50/70 font-semibold border-b-2 border-emerald-200">
                  <td className="px-3 py-2 text-sm text-center text-emerald-800">소계</td>
                  <td className="px-3 py-2 text-sm text-center text-emerald-800">{totalStats.projectCount}개</td>
                  {renderMonthlyCells(totalStats)}
                </tr>
                {Array.from(hqStats.entries())
                  .filter(([, stats]) => stats.projectCount > 0)
                  .map(([hq, stats]) => (
                    <tr key={hq} onClick={() => handleHqClick(hq)} className="hover:bg-emerald-50/50 cursor-pointer transition-colors">
                      <td className="px-3 py-3 text-sm font-medium text-gray-900 text-center">{hq}</td>
                      <td className="px-3 py-3 text-sm text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          {stats.projectCount}개
                        </span>
                      </td>
                      {renderMonthlyCells(stats)}
                    </tr>
                  ))}
                {Array.from(hqStats.values()).every(s => s.projectCount === 0) && (
                  <tr><td colSpan={14} className="px-4 py-8 text-center text-sm text-gray-500">등록된 프로젝트가 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 지사별 테이블 */}
      {viewLevel === 'branch' && selectedHqForDetail && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-emerald-50 px-4 py-3 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building className="h-4 w-4 text-emerald-600" />
                <span className="text-sm font-medium text-emerald-800">{selectedHqForDetail} - 지사별 제출현황</span>
              </div>
              {renderYearSelector()}
            </div>
          </div>
          <div
            className="overflow-x-auto overscroll-x-contain"
            role="region"
            aria-label="지사별 월례보고 제출현황"
            tabIndex={0}
          >
            <table className="w-max min-w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="sticky left-0 z-20 w-20 min-w-20 max-w-20 bg-gray-50 px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider sm:static sm:w-auto sm:min-w-0 sm:max-w-none sm:px-3">지사명</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">프로젝트수</th>
                  {MONTHS.map(month => (
                    <th
                      key={month}
                      className={`min-w-16 px-3 py-3 text-center text-xs font-medium uppercase tracking-wider ${isCurrentMonthColumn(month) ? 'bg-amber-100 text-amber-800' : 'text-gray-500'}`}
                    >
                      {month}월
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {/* 소계 */}
                {(() => {
                  const subtotal = Array.from(branchStats.values()).reduce((acc, curr) => ({
                    projectCount: acc.projectCount + curr.projectCount,
                    monthlySubmittedCounts: acc.monthlySubmittedCounts.map((count, index) => (
                      count + curr.monthlySubmittedCounts[index]
                    )),
                  }), emptyStats())
                  return (
                    <tr className="bg-emerald-50/70 font-semibold border-b-2 border-emerald-200">
                      <td className="sticky left-0 z-10 w-20 min-w-20 max-w-20 bg-emerald-50 px-2 py-2 text-sm text-center text-emerald-800 sm:static sm:w-auto sm:min-w-0 sm:max-w-none sm:px-3">소계</td>
                      <td className="px-3 py-2 text-sm text-center text-emerald-800">{subtotal.projectCount}개</td>
                      {renderMonthlyCells(subtotal, true)}
                    </tr>
                  )
                })()}
                {Array.from(branchStats.entries())
                  .filter(([, stats]) => stats.projectCount > 0)
                  .map(([branch, stats]) => (
                    <tr key={branch} onClick={() => handleBranchClick(branch)} className="group hover:bg-emerald-50/50 cursor-pointer transition-colors">
                      <td className="sticky left-0 z-10 w-20 min-w-20 max-w-20 bg-white px-2 py-3 text-center text-sm font-medium text-gray-900 transition-colors group-hover:bg-emerald-50 sm:static sm:w-auto sm:min-w-0 sm:max-w-none sm:px-3">
                        <span className="sm:hidden" title={branch}>
                          {branch.length > 3 ? `${branch.slice(0, 3)}...` : branch}
                        </span>
                        <span className="hidden sm:inline">{branch}</span>
                      </td>
                      <td className="px-3 py-3 text-sm text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          {stats.projectCount}개
                        </span>
                      </td>
                      {renderMonthlyCells(stats, true)}
                    </tr>
                  ))}
                {Array.from(branchStats.values()).every(s => s.projectCount === 0) && (
                  <tr><td colSpan={14} className="px-4 py-8 text-center text-sm text-gray-500">해당 본부에 프로젝트가 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 프로젝트별 테이블 */}
      {viewLevel === 'project' && selectedBranchForDetail && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-emerald-50 px-4 py-3 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FlaskConical className="h-4 w-4 text-emerald-600" />
                <span className="text-sm font-medium text-emerald-800">{selectedBranchForDetail} - 프로젝트별 제출현황</span>
              </div>
              {renderYearSelector()}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">프로젝트명</th>
                  {MONTHS.map(month => (
                    <th key={month} className="min-w-16 px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">{month}월</th>
                  ))}
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">최근 제출월</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">누적</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {projectList.map(p => (
                  <tr key={p.project_id} onClick={() => onRowClickProject(p.project_id, selectedBranchForDetail)} className="hover:bg-emerald-50/50 cursor-pointer transition-colors">
                    <td className="px-3 py-3 text-sm font-medium text-gray-900 text-center">
                      <span className="sm:hidden" title={p.project_name}>
                        {p.project_name.length > 3 ? `${p.project_name.slice(0, 3)}...` : p.project_name}
                      </span>
                      <span className="hidden sm:inline">{p.project_name}</span>
                    </td>
                    {MONTHS.map(month => (
                      <td key={month} className="px-3 py-3 text-sm text-center">
                        {hasMonthlySubmission(p, selectedYear, month) ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                            제출
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                    ))}
                    <td className="px-3 py-3 text-sm text-center text-gray-600">
                      {p.latest_report_label || <span className="text-gray-400">-</span>}
                    </td>
                    <td className="px-3 py-3 text-sm text-center text-gray-600">
                      {p.report_count > 0 ? `${p.report_count}건` : <span className="text-gray-400">-</span>}
                    </td>
                  </tr>
                ))}
                {projectList.length === 0 && (
                  <tr><td colSpan={15} className="px-4 py-8 text-center text-sm text-gray-500">해당 지사에 프로젝트가 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default BusinessQualityReportView
