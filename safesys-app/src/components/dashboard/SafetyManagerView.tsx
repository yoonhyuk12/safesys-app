'use client'

import React from 'react'
import { ChevronLeft, Download, CheckCircle, ArrowLeft } from 'lucide-react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import type { Project, ManagerInspection } from '@/lib/projects'
import { HEADQUARTERS_OPTIONS, BRANCH_OPTIONS } from '@/lib/constants'

interface SafetyManagerViewProps {
  loading: boolean
  projects: Project[]
  managerInspections: ManagerInspection[]
  selectedSafetyBranch: string | null
  selectedHq: string
  selectedBranch: string
  selectedQuarter: string
  isHqDownloadMode: boolean
  selectedBranchesForReport: string[]
  selectedProjectIdsForReport: string[]
  isGeneratingReport: boolean
  onBack: () => void
  onQuarterChange: (q: string) => void
  onToggleDownloadMode: (on: boolean) => void
  onGenerateReport: () => Promise<void>
  onCancelReport: () => void
  onProjectToggleForReport: (projectId: string) => void
  onBranchToggleForReport: (branch: string) => void
  onSelectSafetyBranch: (branch: string) => void
  onRowClick: (projectId: string) => void
  onBackToAllBranches?: () => void
}

const SafetyManagerView: React.FC<SafetyManagerViewProps> = ({
  loading,
  projects,
  managerInspections,
  selectedSafetyBranch,
  selectedHq,
  selectedBranch,
  selectedQuarter,
  isHqDownloadMode,
  selectedBranchesForReport,
  selectedProjectIdsForReport,
  isGeneratingReport,
  onBack,
  onQuarterChange,
  onToggleDownloadMode,
  onGenerateReport,
  onCancelReport,
  onProjectToggleForReport,
  onBranchToggleForReport,
  onSelectSafetyBranch,
  onRowClick,
  onBackToAllBranches
}) => {
  const getQuarterNumber = (q: string) => {
    const parts = (q || '').split('Q')
    const num = parseInt(parts[1] || '0', 10)
    if (Number.isNaN(num) || num < 1 || num > 4) {
      const m = new Date().getMonth() + 1
      return Math.ceil(m / 3)
    }
    return num
  }

  const quarterNum = getQuarterNumber(selectedQuarter)

  if (selectedSafetyBranch) {
    const branchProjects = projects.filter((p) => (!selectedHq || p.managing_hq === selectedHq) && p.managing_branch === selectedSafetyBranch)
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-2 py-2 sm:px-6 sm:py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <button
              onClick={onBack}
              className="flex items-center text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              안전현황으로 돌아가기
            </button>
            <div className="flex items-center space-x-2">
              {!isHqDownloadMode ? (
                <button
                  type="button"
                  onClick={() => onToggleDownloadMode(true)}
                  className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  aria-label="보고서 선택 모드"
                  title="보고서 선택 모드"
                >
                  <Download className="h-5 w-5" />
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={onGenerateReport}
                    className="px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                    disabled={isGeneratingReport}
                  >
                    {isGeneratingReport ? '생성중...' : '프린터'}
                  </button>
                  <button
                    type="button"
                    onClick={onCancelReport}
                    className="px-3 py-2 bg-gray-500 text-white text-sm font-medium rounded-lg hover:bg-gray-600 transition-colors"
                  >
                    취소
                  </button>
                </>
              )}
              <select
                value={selectedQuarter}
                onChange={(e) => onQuarterChange(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-1 text-sm focus:ring-blue-500 focus:border-blue-500"
              >
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
        </div>
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center">
              <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
              (지사) 관리자 점검 현황
            </h3>
          </div>
          <div className="flex items-center mb-4">
            <button onClick={() => onBackToAllBranches && onBackToAllBranches()} className="flex items-center px-3 py-1 text-sm text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200">
              <ArrowLeft className="h-3 w-3 mr-1" />
              전체 지사로 돌아가기
            </button>
          </div>
          <div className="bg-blue-50 rounded-lg p-4 mb-6">
            <h4 className="text-lg font-semibold text-blue-900 mb-2">
              {selectedSafetyBranch} - 프로젝트별 관리자 점검 현황
            </h4>
            <p className="text-blue-700 text-sm">
              총 {branchProjects.length}개 프로젝트, {managerInspections.filter((i) => i.managing_branch === selectedSafetyBranch).length}건 점검완료
            </p>
          </div>
          {branchProjects.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h4 className="text-lg font-medium text-gray-900 mb-2">프로젝트가 없습니다</h4>
              <p className="text-gray-600">선택한 지사에 등록된 프로젝트가 없습니다.</p>
            </div>
          ) : (
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
                  {branchProjects.map((project) => {
                    const projectInspections = managerInspections.filter((i) => i.project_id === project.id)
                    const latestInspection = projectInspections.sort((a, b) => new Date(b.inspection_date).getTime() - new Date(a.inspection_date).getTime())[0]
                    const pendingCount = 0
                    const inspectionCount = projectInspections.length
                    const ia: any = (project as any).is_active
                    const isTarget = ia && typeof ia === 'object' ? !!ia[`q${quarterNum}` as 'q1' | 'q2' | 'q3' | 'q4'] : false
                    const hasInspections = inspectionCount > 0
                    return (
                      <tr
                        key={project.id}
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => {
                          if (!hasInspections) {
                            alert('해당 프로젝트는 점검 내역이 없습니다.')
                            return
                          }
                          onRowClick(project.id)
                        }}
                      >
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
                            <input
                              type="checkbox"
                              className={`w-4 h-4 text-blue-600 border-gray-300 rounded ${!hasInspections ? 'opacity-40 cursor-not-allowed' : ''}`}
                              disabled={!hasInspections}
                              title={!hasInspections ? '점검 내역이 없습니다' : undefined}
                              onClick={(e) => {
                                if (!hasInspections) {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  alert('해당 프로젝트는 점검 내역이 없습니다.')
                                  return
                                }
                                e.stopPropagation()
                                onProjectToggleForReport(project.id)
                              }}
                              checked={selectedProjectIdsForReport.includes(project.id)}
                              readOnly
                            />
                          ) : null}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    )
  }

  // 본부 단위 또는 전체: 지사별 집계 또는 지사 선택 시 프로젝트 리스트
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="px-2 py-2 sm:px-6 sm:py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <button onClick={onBack} className="flex items-center text-sm text-gray-600 hover:text-gray-900 transition-colors">
            <ChevronLeft className="h-4 w-4 mr-1" />
            안전현황으로 돌아가기
          </button>
          <div className="flex items-center space-x-2">
            {!isHqDownloadMode ? (
              <button type="button" onClick={() => onToggleDownloadMode(true)} className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" aria-label="보고서 선택 모드" title="보고서 선택 모드">
                <Download className="h-5 w-5" />
              </button>
            ) : (
              <>
                <button type="button" onClick={onGenerateReport} className="px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50" disabled={isGeneratingReport}>
                  {isGeneratingReport ? '생성중...' : '프린터'}
                </button>
                <button type="button" onClick={onCancelReport} className="px-3 py-2 bg-gray-500 text-white text-sm font-medium rounded-lg hover:bg-gray-600 transition-colors">
                  취소
                </button>
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
      </div>

      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center">
            <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
            (지사) 관리자 점검 현황
          </h3>
        </div>
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <LoadingSpinner />
          </div>
        ) : (
          // 본부 단위에서 지사별 집계
          (() => {
            const branchStats = new Map<string, { projectCount: number; targetCount: number; inspectionCount: number; targetInspectionCount: number; pendingCount: number }>()

            const filteredProjects = projects.filter((p) => (!selectedHq || p.managing_hq === selectedHq) && (!selectedBranch || p.managing_branch === selectedBranch))

            const targetProjectIds = new Set<string>()
            filteredProjects.forEach((p) => {
              const branch = p.managing_branch
              if (!branchStats.has(branch)) {
                branchStats.set(branch, { projectCount: 0, targetCount: 0, inspectionCount: 0, targetInspectionCount: 0, pendingCount: 0 })
              }
              const entry = branchStats.get(branch)!
              entry.projectCount++
              const ia: any = (p as any).is_active
              if (ia && typeof ia === 'object') {
                const key = `q${quarterNum}` as 'q1' | 'q2' | 'q3' | 'q4'
                const activeThisQuarter = !!ia[key] && !ia.completed
                if (activeThisQuarter) {
                  entry.targetCount++
                  targetProjectIds.add(p.id)
                }
              }
            })

            managerInspections.forEach((ins) => {
              const branch = ins.managing_branch || '미지정'
              if (branchStats.has(branch)) {
                const entry = branchStats.get(branch)!
                entry.inspectionCount++
                if (ins.project_id && targetProjectIds.has(ins.project_id)) {
                  entry.targetInspectionCount++
                }
              }
            })

            const orderedBranches: string[] = selectedHq ? (BRANCH_OPTIONS[selectedHq] || []) : Object.keys(HEADQUARTERS_OPTIONS).flatMap((hq) => BRANCH_OPTIONS[hq] || [])
            const filteredBranches = orderedBranches.filter((b) => branchStats.has(b))
            const total = filteredBranches.reduce(
              (acc, b) => {
                const s = branchStats.get(b)!
                acc.projectCount += s.projectCount
                acc.targetCount += s.targetCount
                acc.inspectionCount += s.inspectionCount
                acc.targetInspectionCount += s.targetInspectionCount
                acc.pendingCount += s.pendingCount
                return acc
              },
              { projectCount: 0, targetCount: 0, inspectionCount: 0, targetInspectionCount: 0, pendingCount: 0 }
            )
            const totalRate = total.targetCount > 0 ? (total.targetInspectionCount / total.targetCount) * 100 : 0

            return (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-2 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">지사명</th>
                      <th className="px-2 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">총 프로젝트 수</th>
                      <th className="px-2 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">점검대상 수</th>
                      <th className="px-2 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">점검횟수(대상)</th>
                      <th className="px-2 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">조치대기</th>
                      <th className="px-2 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">점검률(대상)</th>
                      <th className="px-2 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">비고</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    <tr className="bg-blue-50 font-semibold border-b-2 border-blue-200">
                      <td className="px-2 py-3 sm:px-6 sm:py-4 text-sm font-bold text-blue-900 border-r border-blue-200 text-center">소계 ({filteredBranches.length}개 지사)</td>
                      <td className="px-2 py-3 sm:px-6 sm:py-4 text-sm font-bold text-blue-900 border-r border-blue-200 text-center">{total.projectCount}개</td>
                      <td className="px-2 py-3 sm:px-6 sm:py-4 text-sm font-bold text-blue-900 border-r border-blue-200 text-center">{total.targetCount}개</td>
                      <td className="px-2 py-3 sm:px-6 sm:py-4 text-sm font-bold text-blue-900 border-r border-blue-200 text-center">{total.inspectionCount}건 ({total.targetInspectionCount})</td>
                      <td className="px-2 py-3 sm:px-6 sm:py-4 text-sm font-bold text-blue-900 border-r border-blue-200 text-center">{total.pendingCount}건</td>
                      <td className="px-2 py-3 sm:px-6 sm:py-4 text-sm font-bold text-blue-900 border-r border-blue-200 text-center">{totalRate.toFixed(1)}%</td>
                      <td className="px-2 py-3 sm:px-6 sm:py-4 text-center text-sm font-bold text-blue-900 text-center">-</td>
                    </tr>
                    {filteredBranches.map((branch) => {
                      const s = branchStats.get(branch)!
                      const rate = s.targetCount > 0 ? (s.targetInspectionCount / s.targetCount) * 100 : 0
                      return (
                        <tr key={branch} className="hover:bg-gray-50 cursor-pointer" onClick={() => onSelectSafetyBranch(branch)}>
                          <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm font-medium text-blue-600 hover:text-blue-800 border-r border-gray-200 text-center">{branch}</td>
                          <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm text-gray-500 border-r border-gray-200 text-center">{s.projectCount > 0 ? s.projectCount : '-'}</td>
                          <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm text-blue-600 font-medium border-r border-gray-200 text-center">{s.targetCount > 0 ? s.targetCount : '-'}</td>
                          <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm text-gray-900 border-r border-gray-200 text-center">{s.inspectionCount > 0 ? s.inspectionCount : '-'} <span className="text-gray-500">({s.targetInspectionCount || 0})</span></td>
                          <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm border-r border-gray-200 text-center">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${s.pendingCount > 0 ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>{s.pendingCount > 0 ? `${s.pendingCount}건` : '-'}</span>
                          </td>
                          <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm border-r border-gray-200 text-center">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${rate >= 80 ? 'bg-green-100 text-green-800' : rate >= 50 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>{rate.toFixed(1)}%</span>
                          </td>
                          <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-center text-sm">
                            {isHqDownloadMode ? (
                              <input type="checkbox" className="w-4 h-4 text-blue-600 border-gray-300 rounded" onClick={(e) => { e.stopPropagation(); onBranchToggleForReport(branch) }} checked={selectedBranchesForReport.includes(branch)} readOnly />
                            ) : null}
                          </td>
                        </tr>
                      )
                    })}
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

export default SafetyManagerView


