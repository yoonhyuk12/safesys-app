'use client'

import React from 'react'
import { CheckCircle, Calendar, ArrowLeft } from 'lucide-react'
import { type ManagerInspection, type Project } from '@/lib/projects'
import { type UserProfile } from '@/lib/supabase'
import { HEADQUARTERS_OPTIONS, BRANCH_OPTIONS } from '@/lib/constants'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

interface ManagerInspectionStatusProps {
  userProfile: UserProfile
  projects: Project[]
  selectedQuarter: string
  setSelectedQuarter: (quarter: string) => void
  selectedHq: string
  selectedBranch: string
  selectedSafetyBranch: string | null
  setSelectedSafetyBranch: (branch: string | null) => void
  managerInspections: ManagerInspection[]
  inspectionDataLoading: boolean
  onManagerInspectionClick: (inspection: ManagerInspection) => void
  onBackClick: () => void
}

const ManagerInspectionStatus: React.FC<ManagerInspectionStatusProps> = ({
  userProfile,
  projects,
  selectedQuarter,
  setSelectedQuarter,
  selectedHq,
  selectedBranch,
  selectedSafetyBranch,
  setSelectedSafetyBranch,
  managerInspections,
  inspectionDataLoading,
  onManagerInspectionClick,
  onBackClick
}) => {
  return (
    <div className="bg-white rounded-lg shadow-lg border border-gray-200">
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center">
            <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
            (지사) 관리자 점검 현황
          </h3>
          <div className="flex items-center space-x-2">
            <Calendar className="h-4 w-4 text-gray-500" />
            {(() => {
              const [, qStr] = (selectedQuarter || '').split('Q')
              const currentYear = 2025
              const currentQ = qStr && !isNaN(parseInt(qStr)) ? String(parseInt(qStr, 10)) : String(Math.ceil((new Date().getMonth() + 1) / 3))
              return (
                <select
                  value={currentQ}
                  onChange={(e) => setSelectedQuarter(`${currentYear}Q${e.target.value}`)}
                  className="border border-gray-300 rounded-md px-3 py-1 text-sm focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="1">1분기</option>
                  <option value="2">2분기</option>
                  <option value="3">3분기</option>
                  <option value="4">4분기</option>
                </select>
              )
            })()}
          </div>
        </div>
      </div>

      <div className="p-6">
        {inspectionDataLoading ? (
          <div className="flex justify-center items-center py-12">
            <LoadingSpinner />
          </div>
        ) : (() => {
          // 특정 지사가 선택된 경우 해당 지사의 프로젝트별 점검 현황
          if (selectedSafetyBranch) {
            // 선택된 지사의 프로젝트들 필터링
            const branchProjects = projects.filter((project: Project) => {
              if (selectedHq && project.managing_hq !== selectedHq) return false
              if (project.managing_branch !== selectedSafetyBranch) return false
              return true
            })

            // 각 프로젝트별 점검 횟수 계산
            const quarterNum = (() => {
              const parts = (selectedQuarter || '').split('Q')
              const q = parseInt(parts[1] || '0')
              return isNaN(q) ? Math.ceil((new Date().getMonth() + 1) / 3) : q
            })()

            const projectInspectionCounts = branchProjects.map(project => {
              const projectInspections = managerInspections.filter(
                inspection => inspection.project_id === project.id
              )
              // 해당 분기 공사중 여부
              const ia: any = (project as any).is_active
              let isTarget = false
              if (ia && typeof ia === 'object') {
                const key = `q${quarterNum}` as 'q1' | 'q2' | 'q3' | 'q4'
                // 선택 분기 값만 기준: true면 대상
                isTarget = !!ia[key]
              } else {
                // 구형 boolean은 분기판별 불가 → 대상 아님
                isTarget = false
              }
              return {
                ...project,
                inspectionCount: projectInspections.length,
                isTarget
              }
            })

            return (
              <div>
                <div className="flex items-center mb-4">
                  <button 
                    onClick={() => setSelectedSafetyBranch(null)}
                    className="flex items-center text-blue-600 hover:text-blue-800 transition-colors"
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    지사별 통계로 돌아가기
                  </button>
                </div>

                {/* 선택된 지사 정보 */}
                <div className="bg-blue-50 rounded-lg p-4 mb-6">
                  <h4 className="text-lg font-semibold text-blue-900 mb-2">
                    {selectedSafetyBranch} - 프로젝트별 관리자 점검 현황
                  </h4>
                  <p className="text-blue-700">총 프로젝트 수: {branchProjects.length}개</p>
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
                          <th className="px-3 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">프로젝트명</th>
                          <th className="px-3 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">현장 주소</th>
                          <th className="px-3 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">점검 대상</th>
                          <th className="px-3 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">점검 횟수</th>
                          <th className="px-3 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">상태</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {projectInspectionCounts.map((project, index) => (
                          <tr key={project.id || index} className="hover:bg-gray-50 divide-x divide-gray-200">
                            <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap border-r border-gray-200">
                              <div className="text-xs sm:text-sm font-medium text-gray-900">
                                {project.project_name}
                              </div>
                            </td>
                            <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap border-r border-gray-200">
                              <div className="text-xs sm:text-sm text-gray-900">
                                {project.site_address}
                              </div>
                            </td>
                            <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap border-r border-gray-200 text-center">
                              {project.isTarget ? (
                                <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">대상</span>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap border-r border-gray-200">
                              <div className="text-xs sm:text-sm font-semibold text-blue-600">
                                {project.inspectionCount}회
                              </div>
                            </td>
                            <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap">
                              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                project.inspectionCount > 0
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-gray-100 text-gray-800'
                              }`}>
                                {project.inspectionCount > 0 ? '점검완료' : '점검대기'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          }
          // 본부 단위에서는 지사별 점검 통계
          else if (userProfile?.branch_division?.endsWith('본부') || !selectedBranch) {
            // 지사별로 점검 횟수 및 해당 분기 공사중 대상 수 집계
            const branchStats = new Map<string, { projectCount: number; targetCount: number; inspectionCount: number; targetInspectionCount: number }>()
            const quarterNum = (() => {
              const parts = (selectedQuarter || '').split('Q')
              const q = parseInt(parts[1] || '0')
              return isNaN(q) ? Math.ceil((new Date().getMonth() + 1) / 3) : q
            })()
            
            // 관할 프로젝트 수 계산 및 대상 프로젝트 집합 구성
            const targetProjectIds = new Set<string>()
            projects.forEach((project: Project) => {
              if (selectedHq && project.managing_hq !== selectedHq) return
              
              const branch = project.managing_branch
              if (!branchStats.has(branch)) {
                branchStats.set(branch, { projectCount: 0, targetCount: 0, inspectionCount: 0, targetInspectionCount: 0 })
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
                // 구형 boolean 값은 분기판별 불가 → 대상에서 제외 (명시적 JSON 토글된 항목만 카운트)
                isActiveThisQuarter = false
              }
              if (isActiveThisQuarter) {
                entry.targetCount++
                targetProjectIds.add(project.id)
              }
            })

            // 점검 횟수 계산 (전체/대상 분리 집계)
            managerInspections.forEach((inspection: ManagerInspection) => {
              if (selectedHq && inspection.managing_hq !== selectedHq) return
              
              const branch = inspection.managing_branch
              if (!branch) return
              if (branchStats.has(branch)) {
                const entry = branchStats.get(branch)!
                entry.inspectionCount++
                if (inspection.project_id && targetProjectIds.has(inspection.project_id)) {
                  entry.targetInspectionCount++
                }
              }
            })

            return branchStats.size === 0 ? (
              <div className="text-center py-12">
                <CheckCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h4 className="text-lg font-medium text-gray-900 mb-2">점검 데이터가 없습니다</h4>
                <p className="text-gray-600">선택한 분기에 등록된 관리자 점검 결과가 없습니다.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">지사명</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">총 프로젝트 수</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">점검대상 수</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">점검횟수(대상)</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">점검률(대상)</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {(() => {
                      // 정의된 지사 순서대로 정렬
                      const orderedBranches: string[] = []
                      
                      if (selectedHq) {
                        // 특정 본부가 선택된 경우 해당 본부의 지사 순서 사용
                        orderedBranches.push(...(BRANCH_OPTIONS[selectedHq] || []))
                      } else {
                        // 전체 본부인 경우 모든 본부의 지사를 순서대로 추가
                        Object.keys(HEADQUARTERS_OPTIONS).forEach(hq => {
                          if (BRANCH_OPTIONS[hq]) {
                            orderedBranches.push(...BRANCH_OPTIONS[hq])
                          }
                        })
                      }
                      
                      // 실제 데이터가 있는 지사들만 정의된 순서대로 표시
                      return orderedBranches
                        .filter(branch => branchStats.has(branch))
                        .map(branch => {
                          const stats = branchStats.get(branch)!
                          const rate = stats.targetCount > 0 ? 
                            Math.round((stats.targetInspectionCount / stats.targetCount) * 100) : 0

                          return (
                            <tr 
                              key={branch} 
                              className="hover:bg-gray-50 cursor-pointer divide-x divide-gray-200"
                              onClick={() => setSelectedSafetyBranch(branch)}
                            >
                              <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap border-r border-gray-200">
                                <div className="text-xs sm:text-sm font-medium text-blue-600 hover:text-blue-800">
                                  {branch}
                                </div>
                              </td>
                              <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap border-r border-gray-200">
                                <div className="text-xs sm:text-sm text-gray-900">{stats.projectCount}</div>
                              </td>
                              <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap border-r border-gray-200">
                                <div className="text-xs sm:text-sm text-gray-900">{stats.targetCount}</div>
                              </td>
                              <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap border-r border-gray-200">
                                <div className="text-xs sm:text-sm font-semibold text-blue-600">
                                  {stats.inspectionCount} <span className="text-gray-500 font-normal">({stats.targetInspectionCount})</span>
                                </div>
                              </td>
                              <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap">
                                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                  rate >= 80 ? 'bg-green-100 text-green-800' :
                                  rate >= 60 ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-red-100 text-red-800'
                                }`}>
                                  {rate}%
                                </span>
                              </td>
                            </tr>
                          )
                        })
                    })()}
                  </tbody>
                </table>
              </div>
            )
          } else {
            // 지사에서는 프로젝트별 점검 현황 (본부 사용자가 지사 선택했거나, 지사 소속 사용자)
            return managerInspections.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h4 className="text-lg font-medium text-gray-900 mb-2">점검 데이터가 없습니다</h4>
                <p className="text-gray-600">선택한 분기에 등록된 관리자 점검 결과가 없습니다.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">프로젝트명</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">점검일</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">점검자</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">종합평가</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">상태</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {managerInspections.map((inspection: ManagerInspection, index: number) => (
                      <tr 
                        key={inspection.id || index}
                        className="hover:bg-gray-50 cursor-pointer transition-colors divide-x divide-gray-200"
                        onClick={() => onManagerInspectionClick(inspection)}
                      >
                        <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap border-r border-gray-200">
                          <div className="text-xs sm:text-sm font-medium text-gray-900">
                            {inspection.project_name}
                          </div>
                        </td>
                        <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap border-r border-gray-200">
                          <div className="text-xs sm:text-sm text-gray-900">
                            {new Date(inspection.inspection_date).toLocaleDateString('ko-KR')}
                          </div>
                        </td>
                        <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap border-r border-gray-200">
                          <div className="text-xs sm:text-sm text-gray-900">{inspection.inspector_name}</div>
                        </td>
                        <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap border-r border-gray-200">
                          <div className="text-xs sm:text-sm font-semibold text-gray-900">
                            -
                          </div>
                        </td>
                        <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800`}>
                            완료
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
        })()}
      </div>
    </div>
  )
}

export default ManagerInspectionStatus