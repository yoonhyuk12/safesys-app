'use client'

import React from 'react'
import { ChevronLeft, Calendar, Download, AlertTriangle, ArrowLeft, ClipboardX } from 'lucide-react'
import UninspectedProjectsTable from '@/components/dashboard/UninspectedProjectsTable'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import type { Project, HeadquartersInspection } from '@/lib/projects'
import { HEADQUARTERS_OPTIONS, BRANCH_OPTIONS } from '@/lib/constants'

interface SafetyHeadquartersViewProps {
  loading: boolean
  projects: Project[]
  headquartersInspections: HeadquartersInspection[]
  selectedSafetyBranch: string | null
  selectedHq: string
  selectedBranch: string
  selectedQuarter: string
  isHqDownloadMode: boolean
  selectedBranchesForReport: string[]
  selectedProjectIdsForReport: string[]
  isGeneratingReport: boolean
  onBack: () => void
  onBackToAllBranches: () => void
  onQuarterChange: (q: string) => void
  onToggleDownloadMode: (on: boolean) => void
  onGenerateReport: (groups: { projectName: string; inspections: any[]; branchName?: string }[]) => Promise<void>
  onCancelReport: () => void
  onProjectToggleForReport: (projectId: string) => void
  onBranchToggleForReport: (branch: string) => void
  onRowClickProject: (projectId: string) => void
  onSelectSafetyBranch: (branch: string) => void
}

const SafetyHeadquartersView: React.FC<SafetyHeadquartersViewProps> = ({
  loading,
  projects,
  headquartersInspections,
  selectedSafetyBranch,
  selectedHq,
  selectedBranch,
  selectedQuarter,
  isHqDownloadMode,
  selectedBranchesForReport,
  selectedProjectIdsForReport,
  isGeneratingReport,
  onBack,
  onBackToAllBranches,
  onQuarterChange,
  onToggleDownloadMode,
  onGenerateReport,
  onCancelReport,
  onProjectToggleForReport,
  onBranchToggleForReport,
  onRowClickProject,
  onSelectSafetyBranch
}) => {
  const [showUninspected, setShowUninspected] = React.useState(false)
  const selectedQuarterNum = React.useMemo(() => {
    const parts = (selectedQuarter || '').split('Q')
    const q = parseInt(parts[1] || '0', 10)
    return Number.isNaN(q) ? Math.ceil((new Date().getMonth() + 1) / 3) : q
  }, [selectedQuarter])
  // groups 계산은 상위에서 주입해도 되지만, 여기서 간략 처리
  const buildGroups = (): { projectName: string; inspections: any[]; branchName?: string }[] => {
    const groups: { projectName: string; inspections: any[]; branchName?: string }[] = []
    if (selectedSafetyBranch) {
      const branchProjects = projects.filter((p: any) => (!selectedHq || p.managing_hq === selectedHq) && p.managing_branch === selectedSafetyBranch)
      const targetProjects = selectedProjectIdsForReport.length > 0 ? branchProjects.filter((p: any) => selectedProjectIdsForReport.includes(p.id)) : []
      targetProjects.forEach((p: any) => {
        const ins = headquartersInspections.filter((i: any) => i.project_id === p.id)
        if (ins.length > 0) groups.push({ projectName: p.project_name || 'project', inspections: ins, branchName: p.managing_branch })
      })
    } else {
      const filteredProjects = projects.filter((p: any) => {
        if (selectedHq && p.managing_hq !== selectedHq) return false
        if (selectedBranch && p.managing_branch !== selectedBranch) return false
        return selectedBranchesForReport.includes(p.managing_branch)
      })
      filteredProjects.forEach((p: any) => {
        const ins = headquartersInspections.filter((i: any) => i.project_id === p.id)
        if (ins.length > 0) groups.push({ projectName: p.project_name || 'project', inspections: ins, branchName: p.managing_branch })
      })
    }
    return groups
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="px-2 py-2 sm:px-6 sm:py-4 border-b border-gray-200">
        <button onClick={onBack} className="flex items-center text-sm text-gray-600 hover:text-gray-900 transition-colors">
          <ChevronLeft className="h-4 w-4 mr-1" />
          안전현황으로 돌아가기
        </button>
      </div>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-2">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center">
              <AlertTriangle className="h-5 w-5 text-orange-600 mr-2" />
              (본부) 불시 점검 현황
            </h3>
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
          </div>
          <div className="flex items-center space-x-2">
            {!isHqDownloadMode ? (
              <button type="button" onClick={() => onToggleDownloadMode(true)} className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" aria-label="보고서 선택 모드" title="보고서 선택 모드">
                <Download className="h-5 w-5" />
              </button>
            ) : (
              <>
                <button type="button" onClick={async () => { const groups = buildGroups(); if (groups.length === 0) { alert('선택한 조건에 해당하는 점검 결과가 없습니다.'); return } await onGenerateReport(groups) }} className="px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50" disabled={isGeneratingReport}>
                  {isGeneratingReport ? '생성중...' : '프린터'}
                </button>
                <button type="button" onClick={onCancelReport} className="px-3 py-2 bg-gray-500 text-white text-sm font-medium rounded-lg hover:bg-gray-600 transition-colors">취소</button>
              </>
            )}
            <select value={selectedQuarter} onChange={(e) => onQuarterChange(e.target.value)} className="border border-gray-300 rounded-md px-3 py-1 text-sm focus:ring-blue-500 focus:border-blue-500">
              <option value="2025Q4">25년 4분기</option>
              <option value="2025Q3">25년 3분기</option>
              <option value="2025Q2">25년 2분기</option>
              <option value="2025Q1">25년 1분기</option>
              <option value="2024Q4">24년 4분기</option>
              <option value="2024Q3">24년 3분기</option>
              <option value="2024Q2">24년 2분기</option>
              <option value="2024Q1">24년 1분기</option>
            </select>
          </div>
        </div>

        {showUninspected ? (
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
              <button onClick={() => onBackToAllBranches()} className="flex items-center px-3 py-1 text-sm text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200">
                <ArrowLeft className="h-3 w-3 mr-1" />
                전체 지사로 돌아가기
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-2 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">프로젝트명</th>
                    <th className="px-2 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">점검 대상</th>
                    <th className="px-2 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">점검 횟수</th>
                    <th className="px-2 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">조치대기</th>
                    <th className="px-2 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">최근 점검일</th>
                    <th className="px-2 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">최근 점검자</th>
                    <th className="px-2 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">비고</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {(() => {
                    // 선택 지사의 프로젝트 및 점검 집계
                    const branchProjects = projects.filter((p: any) => (!selectedHq || p.managing_hq === selectedHq) && p.managing_branch === selectedSafetyBranch)
                    const branchProjectIds = new Set<string>(branchProjects.map((p: any) => p.id as string))
                    const branchInspections = headquartersInspections.filter((i: any) => branchProjectIds.has(i.project_id as string))

                    // 대상 프로젝트 수 (분기별 is_active 기준)
                    const targetCount = branchProjects.reduce((acc: number, project: any) => {
                      const ia: any = project.is_active
                      if (ia && typeof ia === 'object') {
                        const key = `q${selectedQuarterNum}` as 'q1' | 'q2' | 'q3' | 'q4'
                        if (ia[key]) return acc + 1
                      }
                      return acc
                    }, 0)

                    // 조치대기 건수 계산 (issue1/2 종합 상태 기반)
                    const totalPendingCount = branchInspections.reduce((count: number, inspection: any) => {
                      const overallStatus = inspection.issue2_status 
                        ? ((inspection.issue1_status === 'completed' && inspection.issue2_status === 'completed') ? 'completed' : ((inspection.issue1_status === 'pending' && inspection.issue2_status === 'pending') ? 'pending' : 'in_progress'))
                        : inspection.issue1_status
                      return overallStatus === 'pending' ? count + 1 : count
                    }, 0)

                    const totalInspectionCount = branchInspections.length

                    return (
                      <tr className="bg-blue-50 font-semibold border-b-2 border-blue-200">
                        <td className="px-2 py-3 sm:px-6 sm:py-4 text-sm font-bold text-blue-900 border-r border-blue-200 text-center">소계 ({branchProjects.length}개 프로젝트)</td>
                        <td className="px-2 py-3 sm:px-6 sm:py-4 text-sm font-bold text-blue-900 border-r border-blue-200 text-center">{targetCount > 0 ? `${targetCount}개` : '-'}</td>
                        <td className="px-2 py-3 sm:px-6 sm:py-4 text-sm font-bold text-blue-900 border-r border-blue-200 text-center">{totalInspectionCount > 0 ? `${totalInspectionCount}건` : '-'}</td>
                        <td className="px-2 py-3 sm:px-6 sm:py-4 text-sm font-bold text-blue-900 border-r border-blue-200 text-center">{totalPendingCount > 0 ? `${totalPendingCount}건` : '-'}</td>
                        <td className="px-2 py-3 sm:px-6 sm:py-4 text-sm font-bold text-blue-900 border-r border-blue-200 text-center">-</td>
                        <td className="px-2 py-3 sm:px-6 sm:py-4 text-sm font-bold text-blue-900 border-r border-blue-200 text-center">-</td>
                        <td className="px-2 py-3 sm:px-6 sm:py-4 text-center text-sm font-bold text-blue-900 text-center">-</td>
                      </tr>
                    )
                  })()}
                  {projects
                    .filter(p => (!selectedHq || p.managing_hq === selectedHq) && p.managing_branch === selectedSafetyBranch)
                    .map((project) => {
                    const projectInspections = headquartersInspections.filter((i) => i.project_id === project.id)
                    const latestInspection = projectInspections.sort((a, b) => new Date(b.inspection_date).getTime() - new Date(a.inspection_date).getTime())[0]
                    const pendingCount = projectInspections.reduce((count: number, inspection: any) => {
                      const overallStatus = inspection.issue2_status 
                        ? ((inspection.issue1_status === 'completed' && inspection.issue2_status === 'completed') ? 'completed' : ((inspection.issue1_status === 'pending' && inspection.issue2_status === 'pending') ? 'pending' : 'in_progress'))
                        : inspection.issue1_status
                      return overallStatus === 'pending' ? count + 1 : count
                    }, 0)
                    const inspectionCount = projectInspections.length
                    // 해당 분기 대상 여부 계산
                    const ia: any = (project as any).is_active
                    let isTarget = false
                    if (ia && typeof ia === 'object') {
                      const key = `q${selectedQuarterNum}` as 'q1' | 'q2' | 'q3' | 'q4'
                      isTarget = !!ia[key]
                    } else {
                      isTarget = false
                    }
                    return (
                      <tr key={project.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => onRowClickProject(project.id)}>
                        <td className="px-2 py-2 sm:px-6 sm:py-4 text-sm font-medium text-blue-600 hover:text-blue-800 border-r border-gray-200 text-center max-w-[120px] sm:max-w-none">
                          <div className="sm:hidden">{(project.project_name || '').length > 4 ? `${(project.project_name || '').substring(0, 4)}...` : (project.project_name || '미지정')}</div>
                          <div className="hidden sm:block break-words">{project.project_name || '미지정'}</div>
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
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${pendingCount > 0 ? 'bg-red-100 text-red-800' : inspectionCount > 0 ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>{pendingCount > 0 ? `${pendingCount}건` : '-'}</span>
                        </td>
                        <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm text-gray-500 border-r border-gray-200 text-center">{latestInspection ? new Date(latestInspection.inspection_date).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }) : '-'}</td>
                        <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm text-gray-500 border-r border-gray-200 text-center">{latestInspection?.inspector_name || '-'}</td>
                        <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-center text-sm">
                          {isHqDownloadMode ? (
                            <input type="checkbox" className="w-4 h-4 text-blue-600 border-gray-300 rounded" onClick={(e) => { e.stopPropagation(); onProjectToggleForReport(project.id) }} checked={selectedProjectIdsForReport.includes(project.id)} readOnly />
                          ) : null}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          (() => {
            // 본부 단위에서는 지사별 점검 통계
            const branchStats = new Map<string, { projectCount: number; targetCount: number; inspectionCount: number; targetInspectionCount: number; pendingCount: number }>()
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

              const branch = project.managing_branch
              if (!branchStats.has(branch)) {
                branchStats.set(branch, { projectCount: 0, targetCount: 0, inspectionCount: 0, targetInspectionCount: 0, pendingCount: 0 })
              }
              const entry = branchStats.get(branch)!
              entry.projectCount++

              // 해당 분기 공사중 여부 계산 (is_active JSONB 또는 boolean 하위호환)
              const ia: any = (project as any).is_active
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

            // 점검 횟수 계산 (전체/대상 분리)
            headquartersInspections.forEach((inspection: HeadquartersInspection) => {
              if (selectedHq && inspection.managing_hq !== selectedHq) return
              if (selectedBranch && inspection.managing_branch !== selectedBranch) return

              const branch = inspection.managing_branch as string | undefined
              if (!branch) return

              if (branchStats.has(branch)) {
                const entry = branchStats.get(branch)!
                const overallStatus: 'completed' | 'pending' | 'in_progress' = (() => {
                  if (inspection.issue2_status) {
                    if (inspection.issue1_status === 'completed' && inspection.issue2_status === 'completed') return 'completed'
                    if (inspection.issue1_status === 'pending' && inspection.issue2_status === 'pending') return 'pending'
                    return 'in_progress'
                  }
                  return inspection.issue1_status as 'completed' | 'pending'
                })()
                if (overallStatus === 'completed') {
                  entry.inspectionCount++
                  if (inspection.project_id && targetProjectIds.has(inspection.project_id)) {
                    entry.targetInspectionCount++
                  }
                } else if (overallStatus === 'pending') {
                  entry.pendingCount++
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
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">지사명</th>
                      <th className="px-3 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">총 프로젝트 수</th>
                      <th className="px-3 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">점검대상 수</th>
                      <th className="px-3 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">점검횟수(대상)</th>
                      <th className="px-3 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">대기 건수</th>
                      <th className="px-3 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">점검률(대상)</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {(() => {
                      // 정의된 지사 순서대로 정렬
                      const orderedBranches: string[] = []
                      if (selectedHq) {
                        orderedBranches.push(...(BRANCH_OPTIONS[selectedHq] || []))
                      } else {
                        Object.keys(HEADQUARTERS_OPTIONS).forEach(hq => {
                          if (BRANCH_OPTIONS[hq]) orderedBranches.push(...BRANCH_OPTIONS[hq])
                        })
                      }

                      const filteredBranches = orderedBranches.filter(branch => branchStats.has(branch))

                      // 소계 계산
                      const subtotal = filteredBranches.reduce(
                        (acc, branch) => {
                          const s = branchStats.get(branch)!
                          acc.projectCount += s.projectCount
                          acc.targetCount += s.targetCount
                          acc.inspectionCount += s.inspectionCount
                          acc.targetInspectionCount += s.targetInspectionCount
                          acc.pendingCount += s.pendingCount
                          return acc
                        },
                        { projectCount: 0, targetCount: 0, inspectionCount: 0, targetInspectionCount: 0, pendingCount: 0 }
                      )
                      const subtotalRate = subtotal.targetCount > 0 ? Math.round((subtotal.targetInspectionCount / subtotal.targetCount) * 100) : 0

                      return (
                        <>
                          <tr key="subtotal" className="bg-blue-50 font-semibold border-b-2 border-blue-200">
                            <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap border-r border-blue-200 text-center">
                              <div className="text-xs sm:text-sm font-bold text-blue-900">소계 ({filteredBranches.length}개 지사)</div>
                            </td>
                            <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap border-r border-blue-200 text-blue-900 text-center">{subtotal.projectCount === 0 ? '-' : subtotal.projectCount}</td>
                            <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap border-r border-blue-200 text-blue-900 text-center">{subtotal.targetCount === 0 ? '-' : subtotal.targetCount}</td>
                            <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap border-r border-blue-200 text-blue-900 text-center">
                              {subtotal.inspectionCount === 0 ? '-' : (<><span>{subtotal.inspectionCount}</span> <span className="text-gray-500 font-normal">({subtotal.targetInspectionCount})</span></>)}
                            </td>
                            <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap border-r border-blue-200 text-blue-900 text-center">{subtotal.pendingCount === 0 ? '-' : subtotal.pendingCount}</td>
                            <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-center">
                              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${subtotalRate >= 80 ? 'bg-green-100 text-green-800' : subtotalRate >= 60 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>{subtotalRate}%</span>
                            </td>
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
                                <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap border-r border-gray-200 text-center">
                                  <div className="text-xs sm:text-sm font-medium text-blue-600 hover:text-blue-800">{branch}</div>
                                </td>
                                <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap border-r border-gray-200 text-center">
                                  <div className="text-xs sm:text-sm text-gray-900">{stats.projectCount === 0 ? '-' : stats.projectCount}</div>
                                </td>
                                <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap border-r border-gray-200 text-center">
                                  <div className="text-xs sm:text-sm text-gray-900">{stats.targetCount === 0 ? '-' : stats.targetCount}</div>
                                </td>
                                <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap border-r border-gray-200 text-center">
                                  <div className="text-xs sm:text-sm font-semibold text-blue-600">{stats.inspectionCount === 0 ? '-' : (<><span>{stats.inspectionCount}</span> <span className="text-gray-500 font-normal">({stats.targetInspectionCount})</span></>)}</div>
                                </td>
                                <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap border-r border-gray-200 text-center">
                                  <div className="text-xs sm:text-sm font-semibold text-orange-600">{stats.pendingCount === 0 ? '-' : stats.pendingCount}</div>
                                </td>
                                <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-center">
                                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${rate >= 80 ? 'bg-green-100 text-green-800' : rate >= 60 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>{rate}%</span>
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
    </div>
  )
}

export default SafetyHeadquartersView


