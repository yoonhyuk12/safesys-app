'use client'

import React, { useState, useMemo } from 'react'
import { ArrowLeft, Users, Building } from 'lucide-react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import type { Project, WorkerCountByProject } from '@/lib/projects'
import { HEADQUARTERS_OPTIONS, BRANCH_OPTIONS } from '@/lib/constants'

interface SafetyWorkerViewProps {
  loading: boolean
  projects: Project[]
  workerCounts: WorkerCountByProject[]
  selectedSafetyHq: string | null
  selectedSafetyBranch: string | null
  selectedHq: string
  selectedBranch: string
  onBack: () => void
  onSelectSafetyHq: (hq: string) => void
  onSelectSafetyBranch: (branch: string) => void
  onRowClickProject: (projectId: string) => void
}

const isCompleted = (project: Project): boolean => {
  if (project.is_active === undefined || project.is_active === null) return false
  if (typeof project.is_active === 'boolean') return !project.is_active
  if (typeof project.is_active === 'object') return project.is_active.completed === true
  return false
}

interface AggStats {
  projectCount: number
  workerCount: number
  elderlyCount: number
  foreignerCount: number
}

const emptyStats = (): AggStats => ({ projectCount: 0, workerCount: 0, elderlyCount: 0, foreignerCount: 0 })

const SafetyWorkerView: React.FC<SafetyWorkerViewProps> = ({
  loading,
  projects,
  workerCounts,
  selectedSafetyHq,
  selectedSafetyBranch,
  selectedHq,
  selectedBranch,
  onBack,
  onSelectSafetyHq,
  onSelectSafetyBranch,
  onRowClickProject,
}) => {
  const [viewLevel, setViewLevel] = useState<'hq' | 'branch' | 'project'>(() => {
    if (selectedSafetyBranch) return 'project'
    if (selectedSafetyHq) return 'branch'
    return 'hq'
  })
  const [selectedHqForDetail, setSelectedHqForDetail] = useState<string | null>(selectedSafetyHq)
  const [selectedBranchForDetail, setSelectedBranchForDetail] = useState<string | null>(selectedSafetyBranch)

  const activeProjects = useMemo(() => projects.filter(p => !isCompleted(p)), [projects])

  const workerStatsMap = useMemo(() => {
    const map = new Map<string, { worker_count: number; elderly_count: number; foreigner_count: number }>()
    workerCounts.forEach(wc => map.set(wc.project_id, {
      worker_count: wc.worker_count,
      elderly_count: wc.elderly_count,
      foreigner_count: wc.foreigner_count,
    }))
    return map
  }, [workerCounts])

  const totalStats = useMemo(() => {
    const s = emptyStats()
    workerCounts.forEach(wc => {
      s.workerCount += wc.worker_count
      s.elderlyCount += wc.elderly_count
      s.foreignerCount += wc.foreigner_count
    })
    return s
  }, [workerCounts])

  const hqStats = useMemo(() => {
    const stats = new Map<string, AggStats>()
    HEADQUARTERS_OPTIONS.forEach(hq => stats.set(hq, emptyStats()))
    activeProjects.forEach(p => {
      const hq = p.managing_hq || '미지정'
      const existing = stats.get(hq) || emptyStats()
      const ws = workerStatsMap.get(p.id)
      existing.projectCount += 1
      existing.workerCount += ws?.worker_count || 0
      existing.elderlyCount += ws?.elderly_count || 0
      existing.foreignerCount += ws?.foreigner_count || 0
      stats.set(hq, existing)
    })
    return stats
  }, [activeProjects, workerStatsMap])

  const branchStats = useMemo(() => {
    if (!selectedHqForDetail) return new Map<string, AggStats>()
    const stats = new Map<string, AggStats>()
    const branches = BRANCH_OPTIONS[selectedHqForDetail] || []
    branches.forEach(branch => stats.set(branch, emptyStats()))
    activeProjects
      .filter(p => p.managing_hq === selectedHqForDetail)
      .forEach(p => {
        const branch = p.managing_branch || '미지정'
        const existing = stats.get(branch) || emptyStats()
        const ws = workerStatsMap.get(p.id)
        existing.projectCount += 1
        existing.workerCount += ws?.worker_count || 0
        existing.elderlyCount += ws?.elderly_count || 0
        existing.foreignerCount += ws?.foreigner_count || 0
        stats.set(branch, existing)
      })
    return stats
  }, [activeProjects, workerStatsMap, selectedHqForDetail])

  const projectList = useMemo(() => {
    if (!selectedBranchForDetail) return []
    return activeProjects
      .filter(p => p.managing_branch === selectedBranchForDetail)
      .map(p => {
        const ws = workerStatsMap.get(p.id)
        return {
          project_id: p.id,
          project_name: p.project_name,
          worker_count: ws?.worker_count || 0,
          elderly_count: ws?.elderly_count || 0,
          foreigner_count: ws?.foreigner_count || 0,
        }
      })
      .sort((a, b) => b.worker_count - a.worker_count)
  }, [activeProjects, workerStatsMap, selectedBranchForDetail])

  const handleBack = () => {
    if (viewLevel === 'project') {
      setViewLevel('branch')
      setSelectedBranchForDetail(null)
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
    onSelectSafetyHq(hq)
  }

  const handleBranchClick = (branch: string) => {
    setSelectedBranchForDetail(branch)
    setViewLevel('project')
    onSelectSafetyBranch(branch)
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[300px]">
        <LoadingSpinner />
      </div>
    )
  }

  const renderTableHeader = (firstColName: string, showProjectCount = true) => (
    <thead className="bg-gray-50 border-b border-gray-200">
      <tr>
        <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">{firstColName}</th>
        {showProjectCount && (
          <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">프로젝트수</th>
        )}
        <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">등록근로자수</th>
        <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">고령자<br /><span className="text-[10px] text-gray-400">(만65세이상)</span></th>
        <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">외국인</th>
        <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">비고</th>
      </tr>
    </thead>
  )

  const renderSubtotalRow = (subtotal: AggStats, showProjectCount = true) => (
    <tr className="bg-cyan-50/70 font-semibold border-b-2 border-cyan-200">
      <td className="px-3 py-2 text-sm text-center text-cyan-800">소계</td>
      {showProjectCount && (
        <td className="px-3 py-2 text-sm text-center text-cyan-800">{subtotal.projectCount}개</td>
      )}
      <td className="px-3 py-2 text-sm text-center text-cyan-800">{subtotal.workerCount > 0 ? `${subtotal.workerCount.toLocaleString()}명` : '-'}</td>
      <td className="px-3 py-2 text-sm text-center text-cyan-800">{subtotal.elderlyCount > 0 ? `${subtotal.elderlyCount.toLocaleString()}명` : '-'}</td>
      <td className="px-3 py-2 text-sm text-center text-cyan-800">{subtotal.foreignerCount > 0 ? `${subtotal.foreignerCount.toLocaleString()}명` : '-'}</td>
      <td className="px-3 py-2 text-sm text-center text-gray-400">-</td>
    </tr>
  )

  const renderStatsCells = (stats: AggStats, showProjectCount = true) => (
    <>
      {showProjectCount && (
        <td className="px-3 py-3 text-sm text-center">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            {stats.projectCount}개
          </span>
        </td>
      )}
      <td className="px-3 py-3 text-sm text-center">
        {stats.workerCount > 0 ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-cyan-100 text-cyan-800">
            {stats.workerCount.toLocaleString()}명
          </span>
        ) : (
          <span className="text-gray-400">-</span>
        )}
      </td>
      <td className="px-3 py-3 text-sm text-center">
        {stats.elderlyCount > 0 ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
            {stats.elderlyCount.toLocaleString()}명
          </span>
        ) : (
          <span className="text-gray-400">-</span>
        )}
      </td>
      <td className="px-3 py-3 text-sm text-center">
        {stats.foreignerCount > 0 ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            {stats.foreignerCount.toLocaleString()}명
          </span>
        ) : (
          <span className="text-gray-400">-</span>
        )}
      </td>
      <td className="px-3 py-3 text-sm text-center text-gray-400">-</td>
    </>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={handleBack}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          aria-label="뒤로가기"
        >
          <ArrowLeft className="h-5 w-5 text-gray-600" />
        </button>
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-cyan-600" />
          <h2 className="text-lg font-semibold text-gray-900">
            근로자 등록현황
            {viewLevel === 'branch' && selectedHqForDetail && (
              <span className="text-sm font-normal text-gray-500 ml-2">- {selectedHqForDetail}</span>
            )}
            {viewLevel === 'project' && selectedBranchForDetail && (
              <span className="text-sm font-normal text-gray-500 ml-2">- {selectedBranchForDetail}</span>
            )}
          </h2>
        </div>
        <div className="ml-auto text-sm text-gray-500">
          총 {totalStats.workerCount.toLocaleString()}명 등록
        </div>
      </div>

      {/* 본부별 테이블 */}
      {viewLevel === 'hq' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-cyan-50 px-4 py-3 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building className="h-4 w-4 text-cyan-600" />
                <span className="text-sm font-medium text-cyan-800">본부별 근로자 등록현황</span>
              </div>
              <span className="text-sm text-cyan-600 font-semibold">총 {totalStats.workerCount.toLocaleString()}명</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              {renderTableHeader('본부명')}
              <tbody className="divide-y divide-gray-200">
                {renderSubtotalRow((() => {
                  const s = emptyStats()
                  Array.from(hqStats.values()).forEach(v => { s.projectCount += v.projectCount; s.workerCount += v.workerCount; s.elderlyCount += v.elderlyCount; s.foreignerCount += v.foreignerCount })
                  return s
                })())}
                {Array.from(hqStats.entries())
                  .filter(([, stats]) => stats.projectCount > 0)
                  .map(([hq, stats]) => (
                    <tr key={hq} onClick={() => handleHqClick(hq)} className="hover:bg-cyan-50/50 cursor-pointer transition-colors">
                      <td className="px-3 py-3 text-sm font-medium text-gray-900 text-center">{hq}</td>
                      {renderStatsCells(stats)}
                    </tr>
                  ))}
                {Array.from(hqStats.values()).every(s => s.projectCount === 0) && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">등록된 프로젝트가 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 지사별 테이블 */}
      {viewLevel === 'branch' && selectedHqForDetail && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-cyan-50 px-4 py-3 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building className="h-4 w-4 text-cyan-600" />
                <span className="text-sm font-medium text-cyan-800">{selectedHqForDetail} - 지사별 근로자 등록현황</span>
              </div>
              <span className="text-sm text-cyan-600 font-semibold">총 {Array.from(branchStats.values()).reduce((s, v) => s + v.workerCount, 0).toLocaleString()}명</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              {renderTableHeader('지사명')}
              <tbody className="divide-y divide-gray-200">
                {renderSubtotalRow(Array.from(branchStats.values()).reduce((acc, curr) => ({
                  projectCount: acc.projectCount + curr.projectCount,
                  workerCount: acc.workerCount + curr.workerCount,
                  elderlyCount: acc.elderlyCount + curr.elderlyCount,
                  foreignerCount: acc.foreignerCount + curr.foreignerCount
                }), emptyStats()))}
                {Array.from(branchStats.entries()).map(([branch, stats]) => (
                  <tr key={branch} onClick={() => handleBranchClick(branch)} className="hover:bg-cyan-50/50 cursor-pointer transition-colors">
                    <td className="px-3 py-3 text-sm font-medium text-gray-900 text-center">{branch}</td>
                    {renderStatsCells(stats)}
                  </tr>
                ))}
                {branchStats.size === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">해당 본부에 지사 데이터가 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 프로젝트별 테이블 */}
      {viewLevel === 'project' && selectedBranchForDetail && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-cyan-50 px-4 py-3 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-cyan-600" />
                <span className="text-sm font-medium text-cyan-800">{selectedBranchForDetail} - 프로젝트별 근로자 등록현황</span>
              </div>
              <span className="text-sm text-cyan-600 font-semibold">총 {projectList.reduce((s, p) => s + p.worker_count, 0).toLocaleString()}명</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              {renderTableHeader('프로젝트명', false)}
              <tbody className="divide-y divide-gray-200">
                {renderSubtotalRow(projectList.reduce((acc, curr) => ({
                  projectCount: 0,
                  workerCount: acc.workerCount + curr.worker_count,
                  elderlyCount: acc.elderlyCount + curr.elderly_count,
                  foreignerCount: acc.foreignerCount + curr.foreigner_count
                }), emptyStats()), false)}
                {projectList.map(p => (
                  <tr key={p.project_id} onClick={() => onRowClickProject(p.project_id)} className="hover:bg-cyan-50/50 cursor-pointer transition-colors">
                    <td className="px-3 py-3 text-sm font-medium text-gray-900 text-center">
                      <span className="sm:hidden" title={p.project_name}>
                        {p.project_name.length > 3 ? `${p.project_name.slice(0, 3)}...` : p.project_name}
                      </span>
                      <span className="hidden sm:inline">{p.project_name}</span>
                    </td>
                    {renderStatsCells({
                      projectCount: 0,
                      workerCount: p.worker_count,
                      elderlyCount: p.elderly_count,
                      foreignerCount: p.foreigner_count,
                    }, false)}
                  </tr>
                ))}
                {projectList.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">해당 지사에 프로젝트가 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default SafetyWorkerView
