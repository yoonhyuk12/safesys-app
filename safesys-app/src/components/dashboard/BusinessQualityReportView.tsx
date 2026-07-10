// 사업현황 품질시험 월례보고서 카드의 본부별→지사별→프로젝트별 제출 현황 드릴다운 뷰
'use client'

import React, { useState, useMemo } from 'react'
import { ArrowLeft, FlaskConical, Building } from 'lucide-react'
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
  submittedCount: number
}

const emptyStats = (): AggStats => ({ projectCount: 0, submittedCount: 0 })

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

  const currentMonthLabel = `${new Date().getMonth() + 1}월`

  const totalStats = useMemo(() => {
    return reportStatuses.reduce((acc, s) => ({
      projectCount: acc.projectCount + 1,
      submittedCount: acc.submittedCount + (s.current_month_submitted ? 1 : 0),
    }), emptyStats())
  }, [reportStatuses])

  // 본부별 통계 — HEADQUARTERS_OPTIONS 순서 유지, 없는 본부는 뒤에
  const hqStats = useMemo(() => {
    const stats = new Map<string, AggStats>()
    HEADQUARTERS_OPTIONS.forEach(hq => stats.set(hq, emptyStats()))
    reportStatuses.forEach(s => {
      const hq = s.managing_hq || '미지정'
      const existing = stats.get(hq) || emptyStats()
      existing.projectCount += 1
      if (s.current_month_submitted) existing.submittedCount += 1
      stats.set(hq, existing)
    })
    return stats
  }, [reportStatuses])

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
        if (s.current_month_submitted) existing.submittedCount += 1
        stats.set(branch, existing)
      })
    return stats
  }, [reportStatuses, selectedHqForDetail])

  // 프로젝트 목록 (지사 선택 시) — 미제출 먼저, 그다음 이름순
  const projectList = useMemo(() => {
    if (!selectedBranchForDetail) return []
    return reportStatuses
      .filter(s => s.managing_branch === selectedBranchForDetail)
      .sort((a, b) => {
        if (a.current_month_submitted !== b.current_month_submitted) {
          return a.current_month_submitted ? 1 : -1
        }
        return a.project_name.localeCompare(b.project_name, 'ko-KR')
      })
  }, [reportStatuses, selectedBranchForDetail])

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

  // 소계/행 공용 셀 — 제출·미제출 뱃지
  const renderSubmitCells = (stats: AggStats) => (
    <>
      <td className="px-3 py-3 text-sm text-center">
        {stats.submittedCount > 0 ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
            {stats.submittedCount}개
          </span>
        ) : (
          <span className="text-gray-400">-</span>
        )}
      </td>
      <td className="px-3 py-3 text-sm text-center">
        {stats.projectCount - stats.submittedCount > 0 ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
            {stats.projectCount - stats.submittedCount}개
          </span>
        ) : (
          <span className="text-gray-400">-</span>
        )}
      </td>
    </>
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
          {currentMonthLabel} 제출 {totalStats.submittedCount}/{totalStats.projectCount}개
        </div>
      </div>

      {/* 본부별 테이블 */}
      {viewLevel === 'hq' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-emerald-50 px-4 py-3 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building className="h-4 w-4 text-emerald-600" />
                <span className="text-sm font-medium text-emerald-800">본부별 {currentMonthLabel} 제출현황</span>
              </div>
              <span className="text-sm text-emerald-600 font-semibold">제출 {totalStats.submittedCount}/{totalStats.projectCount}개</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">본부명</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">프로젝트수</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">{currentMonthLabel} 제출</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">미제출</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {/* 소계 */}
                <tr className="bg-emerald-50/70 font-semibold border-b-2 border-emerald-200">
                  <td className="px-3 py-2 text-sm text-center text-emerald-800">소계</td>
                  <td className="px-3 py-2 text-sm text-center text-emerald-800">{totalStats.projectCount}개</td>
                  {renderSubmitCells(totalStats)}
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
                      {renderSubmitCells(stats)}
                    </tr>
                  ))}
                {Array.from(hqStats.values()).every(s => s.projectCount === 0) && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-500">등록된 프로젝트가 없습니다.</td></tr>
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
                <span className="text-sm font-medium text-emerald-800">{selectedHqForDetail} - 지사별 {currentMonthLabel} 제출현황</span>
              </div>
              {(() => {
                const subtotal = Array.from(branchStats.values()).reduce((acc, curr) => ({
                  projectCount: acc.projectCount + curr.projectCount,
                  submittedCount: acc.submittedCount + curr.submittedCount,
                }), emptyStats())
                return (
                  <span className="text-sm text-emerald-600 font-semibold">제출 {subtotal.submittedCount}/{subtotal.projectCount}개</span>
                )
              })()}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">지사명</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">프로젝트수</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">{currentMonthLabel} 제출</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">미제출</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {/* 소계 */}
                {(() => {
                  const subtotal = Array.from(branchStats.values()).reduce((acc, curr) => ({
                    projectCount: acc.projectCount + curr.projectCount,
                    submittedCount: acc.submittedCount + curr.submittedCount,
                  }), emptyStats())
                  return (
                    <tr className="bg-emerald-50/70 font-semibold border-b-2 border-emerald-200">
                      <td className="px-3 py-2 text-sm text-center text-emerald-800">소계</td>
                      <td className="px-3 py-2 text-sm text-center text-emerald-800">{subtotal.projectCount}개</td>
                      {renderSubmitCells(subtotal)}
                    </tr>
                  )
                })()}
                {Array.from(branchStats.entries())
                  .filter(([, stats]) => stats.projectCount > 0)
                  .map(([branch, stats]) => (
                    <tr key={branch} onClick={() => handleBranchClick(branch)} className="hover:bg-emerald-50/50 cursor-pointer transition-colors">
                      <td className="px-3 py-3 text-sm font-medium text-gray-900 text-center">{branch}</td>
                      <td className="px-3 py-3 text-sm text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          {stats.projectCount}개
                        </span>
                      </td>
                      {renderSubmitCells(stats)}
                    </tr>
                  ))}
                {Array.from(branchStats.values()).every(s => s.projectCount === 0) && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-500">해당 본부에 프로젝트가 없습니다.</td></tr>
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
              <span className="text-sm text-emerald-600 font-semibold">
                제출 {projectList.filter(p => p.current_month_submitted).length}/{projectList.length}개
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">프로젝트명</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">{currentMonthLabel} 제출</th>
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
                    <td className="px-3 py-3 text-sm text-center">
                      {p.current_month_submitted ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                          제출
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                          미제출
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-sm text-center text-gray-600">
                      {p.latest_report_label || <span className="text-gray-400">-</span>}
                    </td>
                    <td className="px-3 py-3 text-sm text-center text-gray-600">
                      {p.report_count > 0 ? `${p.report_count}건` : <span className="text-gray-400">-</span>}
                    </td>
                  </tr>
                ))}
                {projectList.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-500">해당 지사에 프로젝트가 없습니다.</td></tr>
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
