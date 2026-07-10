// 사업현황 검사/검측 카드의 지사별·프로젝트별 검측요청서 등록 건수 드릴다운 뷰
'use client'

import React, { useState, useMemo } from 'react'
import { ArrowLeft, ClipboardCheck, Building } from 'lucide-react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import type { Project, InspectionRequestCountByProject } from '@/lib/projects'
import { BRANCH_OPTIONS } from '@/lib/constants'

interface BusinessInspectionViewProps {
  loading: boolean
  projects: Project[]
  inspectionCounts: InspectionRequestCountByProject[]
  selectedHq: string
  selectedBranch: string
  initialBranch?: string | null
  onBack: () => void
  onRowClickProject: (projectId: string, branch: string | null) => void
}

const isCompleted = (project: Project): boolean => {
  if (project.is_active === undefined || project.is_active === null) return false
  if (typeof project.is_active === 'boolean') return !project.is_active
  if (typeof project.is_active === 'object') return project.is_active.completed === true
  return false
}

interface AggStats {
  projectCount: number
  inspectionCount: number
}

const emptyStats = (): AggStats => ({ projectCount: 0, inspectionCount: 0 })

const BusinessInspectionView: React.FC<BusinessInspectionViewProps> = ({
  loading,
  projects,
  inspectionCounts,
  selectedHq,
  selectedBranch,
  initialBranch = null,
  onBack,
  onRowClickProject,
}) => {
  // initialBranch가 있으면(검측대장에서 복귀) 해당 지사의 프로젝트 목록부터 복원
  const [viewLevel, setViewLevel] = useState<'branch' | 'project'>(initialBranch ? 'project' : 'branch')
  const [selectedBranchForDetail, setSelectedBranchForDetail] = useState<string | null>(initialBranch)

  const activeProjects = useMemo(() => projects.filter(p => !isCompleted(p)), [projects])

  const inspectionStatsMap = useMemo(() => {
    const map = new Map<string, number>()
    inspectionCounts.forEach(ic => map.set(ic.project_id, ic.inspection_count))
    return map
  }, [inspectionCounts])

  const totalInspectionCount = useMemo(() => {
    return inspectionCounts.reduce((s, ic) => s + ic.inspection_count, 0)
  }, [inspectionCounts])

  // 지사별 통계
  const branchStats = useMemo(() => {
    const stats = new Map<string, AggStats>()
    // 모든 본부의 지사 목록을 가져옴
    const allBranches = new Set<string>()
    Object.values(BRANCH_OPTIONS).forEach(branches => {
      branches.forEach(b => allBranches.add(b))
    })
    allBranches.forEach(branch => stats.set(branch, emptyStats()))

    activeProjects.forEach(p => {
      const branch = p.managing_branch || '미지정'
      const existing = stats.get(branch) || emptyStats()
      const ic = inspectionStatsMap.get(p.id) || 0
      existing.projectCount += 1
      existing.inspectionCount += ic
      stats.set(branch, existing)
    })
    return stats
  }, [activeProjects, inspectionStatsMap])

  // 프로젝트 목록 (지사 선택 시)
  const projectList = useMemo(() => {
    if (!selectedBranchForDetail) return []
    return activeProjects
      .filter(p => p.managing_branch === selectedBranchForDetail)
      .map(p => ({
        project_id: p.id,
        project_name: p.project_name,
        inspection_count: inspectionStatsMap.get(p.id) || 0,
      }))
      .sort((a, b) => b.inspection_count - a.inspection_count)
  }, [activeProjects, inspectionStatsMap, selectedBranchForDetail])

  const handleBack = () => {
    if (viewLevel === 'project') {
      setViewLevel('branch')
      setSelectedBranchForDetail(null)
    } else {
      onBack()
    }
  }

  const handleBranchClick = (branch: string) => {
    setSelectedBranchForDetail(branch)
    setViewLevel('project')
  }

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
          <ClipboardCheck className="h-5 w-5 text-indigo-400" />
          <h2 className="text-lg font-semibold text-white">
            검사/검측 등록현황
            {viewLevel === 'project' && selectedBranchForDetail && (
              <span className="text-sm font-normal text-gray-300 ml-2">- {selectedBranchForDetail}</span>
            )}
          </h2>
        </div>
        <div className="ml-auto text-sm text-gray-300">
          총 {totalInspectionCount.toLocaleString()}건 등록
        </div>
      </div>

      {/* 지사별 테이블 */}
      {viewLevel === 'branch' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-indigo-50 px-4 py-3 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building className="h-4 w-4 text-indigo-600" />
                <span className="text-sm font-medium text-indigo-800">지사별 검사/검측 등록현황</span>
              </div>
              <span className="text-sm text-indigo-600 font-semibold">총 {totalInspectionCount.toLocaleString()}건</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">지사명</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">프로젝트수</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">검측 건수</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">비고</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {/* 소계 */}
                {(() => {
                  const subtotal = Array.from(branchStats.values()).reduce((acc, curr) => ({
                    projectCount: acc.projectCount + curr.projectCount,
                    inspectionCount: acc.inspectionCount + curr.inspectionCount,
                  }), emptyStats())
                  return (
                    <tr className="bg-indigo-50/70 font-semibold border-b-2 border-indigo-200">
                      <td className="px-3 py-2 text-sm text-center text-indigo-800">소계</td>
                      <td className="px-3 py-2 text-sm text-center text-indigo-800">{subtotal.projectCount}개</td>
                      <td className="px-3 py-2 text-sm text-center text-indigo-800">{subtotal.inspectionCount > 0 ? `${subtotal.inspectionCount.toLocaleString()}건` : '-'}</td>
                      <td className="px-3 py-2 text-sm text-center text-gray-400">-</td>
                    </tr>
                  )
                })()}
                {Array.from(branchStats.entries())
                  .filter(([, stats]) => stats.projectCount > 0)
                  .sort((a, b) => b[1].inspectionCount - a[1].inspectionCount)
                  .map(([branch, stats]) => (
                    <tr key={branch} onClick={() => handleBranchClick(branch)} className="hover:bg-indigo-50/50 cursor-pointer transition-colors">
                      <td className="px-3 py-3 text-sm font-medium text-gray-900 text-center">{branch}</td>
                      <td className="px-3 py-3 text-sm text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          {stats.projectCount}개
                        </span>
                      </td>
                      <td className="px-3 py-3 text-sm text-center">
                        {stats.inspectionCount > 0 ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                            {stats.inspectionCount.toLocaleString()}건
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-sm text-center text-gray-400">-</td>
                    </tr>
                  ))}
                {Array.from(branchStats.values()).every(s => s.projectCount === 0) && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-500">등록된 프로젝트가 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 프로젝트별 테이블 */}
      {viewLevel === 'project' && selectedBranchForDetail && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-indigo-50 px-4 py-3 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-indigo-600" />
                <span className="text-sm font-medium text-indigo-800">{selectedBranchForDetail} - 프로젝트별 검사/검측 등록현황</span>
              </div>
              <span className="text-sm text-indigo-600 font-semibold">총 {projectList.reduce((s, p) => s + p.inspection_count, 0).toLocaleString()}건</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">프로젝트명</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">검측 건수</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">비고</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {/* 소계 */}
                <tr className="bg-indigo-50/70 font-semibold border-b-2 border-indigo-200">
                  <td className="px-3 py-2 text-sm text-center text-indigo-800">소계</td>
                  <td className="px-3 py-2 text-sm text-center text-indigo-800">{projectList.reduce((s, p) => s + p.inspection_count, 0) > 0 ? `${projectList.reduce((s, p) => s + p.inspection_count, 0).toLocaleString()}건` : '-'}</td>
                  <td className="px-3 py-2 text-sm text-center text-gray-400">-</td>
                </tr>
                {projectList.map(p => (
                  <tr key={p.project_id} onClick={() => onRowClickProject(p.project_id, selectedBranchForDetail)} className="hover:bg-indigo-50/50 cursor-pointer transition-colors">
                    <td className="px-3 py-3 text-sm font-medium text-gray-900 text-center">
                      <span className="sm:hidden" title={p.project_name}>
                        {p.project_name.length > 3 ? `${p.project_name.slice(0, 3)}...` : p.project_name}
                      </span>
                      <span className="hidden sm:inline">{p.project_name}</span>
                    </td>
                    <td className="px-3 py-3 text-sm text-center">
                      {p.inspection_count > 0 ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                          {p.inspection_count.toLocaleString()}건
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-sm text-center text-gray-400">-</td>
                  </tr>
                ))}
                {projectList.length === 0 && (
                  <tr><td colSpan={3} className="px-4 py-8 text-center text-sm text-gray-500">해당 지사에 프로젝트가 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default BusinessInspectionView
