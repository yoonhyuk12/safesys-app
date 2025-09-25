'use client'

import React from 'react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import type { Project, HeadquartersInspection } from '@/lib/projects'
import { ClipboardX } from 'lucide-react'
import { HEADQUARTERS_OPTIONS, BRANCH_OPTIONS } from '@/lib/constants'

export interface UninspectedProjectsTableProps {
  loading?: boolean
  projects: Project[]
  headquartersInspections: HeadquartersInspection[]
  selectedQuarter: string
  selectedHq?: string
  selectedBranch?: string
  selectedSafetyBranch?: string | null
  onRowClickProject?: (projectId: string) => void
  className?: string
}

const UninspectedProjectsTable: React.FC<UninspectedProjectsTableProps> = ({
  loading = false,
  projects,
  headquartersInspections,
  selectedQuarter,
  selectedHq,
  selectedBranch,
  selectedSafetyBranch,
  onRowClickProject,
  className,
}) => {
  const quarterNum = React.useMemo(() => {
    const parts = (selectedQuarter || '').split('Q')
    const q = parseInt(parts[1] || '0', 10)
    return Number.isNaN(q) ? Math.ceil((new Date().getMonth() + 1) / 3) : q
  }, [selectedQuarter])

  const quarterRange = React.useMemo(() => {
    const [yearStr, qStr] = (selectedQuarter || '').split('Q')
    const year = parseInt(yearStr || '0', 10)
    const q = parseInt(qStr || '0', 10)
    if (!year || !q) return null
    const startMonth = (q - 1) * 3 // 0-indexed month
    const start = new Date(Date.UTC(year, startMonth, 1, 0, 0, 0))
    const end = new Date(Date.UTC(year, startMonth + 3, 0, 23, 59, 59))
    return { start, end }
  }, [selectedQuarter])

  const inspectedProjectIds = React.useMemo(() => {
    const ids = new Set<string>()
    headquartersInspections.forEach((inspection) => {
      if (selectedHq && inspection.managing_hq !== selectedHq) return
      if (selectedBranch && inspection.managing_branch !== selectedBranch) return
      if (selectedSafetyBranch && inspection.managing_branch !== selectedSafetyBranch) return
      if (!inspection.project_id) return
      if (quarterRange) {
        const d = new Date(inspection.inspection_date)
        if (d < quarterRange.start || d > quarterRange.end) return
      }
      ids.add(inspection.project_id)
    })
    return ids
  }, [headquartersInspections, selectedHq, selectedBranch, selectedSafetyBranch, quarterRange])

  const uninspectedProjects = React.useMemo(() => {
    const filtered = projects.filter((project) => {
      if (selectedHq && project.managing_hq !== selectedHq) return false
      if (selectedBranch && project.managing_branch !== selectedBranch) return false
      if (selectedSafetyBranch && project.managing_branch !== selectedSafetyBranch) return false

      const isActive = (() => {
        const ia: any = (project as any).is_active
        if (ia && typeof ia === 'object') {
          const key = `q${quarterNum}` as 'q1' | 'q2' | 'q3' | 'q4'
          return !!ia[key]
        }
        return false
      })()

      const hasInspection = inspectedProjectIds.has(project.id)
      return isActive && !hasInspection
    })

    // 기존 지사 순서를 유지하여 정렬
    const orderedBranches: string[] = []
    if (selectedHq) {
      if (BRANCH_OPTIONS[selectedHq]) orderedBranches.push(...BRANCH_OPTIONS[selectedHq])
    } else {
      Object.keys(HEADQUARTERS_OPTIONS).forEach((hq) => {
        if (BRANCH_OPTIONS[hq]) orderedBranches.push(...BRANCH_OPTIONS[hq])
      })
    }

    return filtered.sort((a, b) => {
      const aIdxRaw = orderedBranches.indexOf(a.managing_branch as string)
      const bIdxRaw = orderedBranches.indexOf(b.managing_branch as string)
      const aIdx = aIdxRaw === -1 ? Number.MAX_SAFE_INTEGER : aIdxRaw
      const bIdx = bIdxRaw === -1 ? Number.MAX_SAFE_INTEGER : bIdxRaw
      if (aIdx !== bIdx) return aIdx - bIdx
      return (a.project_name || '').localeCompare(b.project_name || '')
    })
  }, [projects, inspectedProjectIds, selectedHq, selectedBranch, selectedSafetyBranch, quarterNum])

  return (
    <div className={['bg-white rounded-lg shadow-sm border border-gray-200', className].filter(Boolean).join(' ')}>
      <div className="px-2 py-2 sm:px-6 sm:py-4 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center">
          <ClipboardX className="h-5 w-5 text-red-600 mr-2" />
          미점검 프로젝트
        </h3>
        <div className="text-sm text-gray-600">{uninspectedProjects.length}건</div>
      </div>

      <div className="p-4 sm:p-6">
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <LoadingSpinner />
          </div>
        ) : uninspectedProjects.length === 0 ? (
          <div className="text-center py-12">
            <ClipboardX className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h4 className="text-base sm:text-lg font-medium text-gray-900 mb-1">해당 분기 미점검 프로젝트가 없습니다</h4>
            <p className="text-gray-600 text-sm">필터 조건을 변경해 다시 확인해보세요.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-2 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">지사명</th>
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
                {/* 소계 행 */}
                {(() => {
                  const totalProjects = uninspectedProjects.length
                  const targetCount = totalProjects
                  const inspectionCount = 0
                  const pendingCount = 0
                  return (
                    <tr className="bg-blue-50 font-semibold border-b-2 border-blue-200">
                      <td className="px-2 py-3 sm:px-6 sm:py-4 text-sm font-bold text-blue-900 border-r border-blue-200 text-center">
                        소계 ({totalProjects}개 프로젝트)
                      </td>
                      <td className="px-2 py-3 sm:px-6 sm:py-4 text-sm font-bold text-blue-900 border-r border-blue-200 text-center">-</td>
                      <td className="px-2 py-3 sm:px-6 sm:py-4 text-sm font-bold text-blue-900 border-r border-blue-200 text-center">{targetCount > 0 ? `${targetCount}개` : '-'}</td>
                      <td className="px-2 py-3 sm:px-6 sm:py-4 text-sm font-bold text-blue-900 border-r border-blue-200 text-center">{inspectionCount > 0 ? `${inspectionCount}건` : '-'}</td>
                      <td className="px-2 py-3 sm:px-6 sm:py-4 text-sm font-bold text-blue-900 border-r border-blue-200 text-center">{pendingCount > 0 ? `${pendingCount}건` : '-'}</td>
                      <td className="px-2 py-3 sm:px-6 sm:py-4 text-sm font-bold text-blue-900 border-r border-blue-200 text-center">-</td>
                      <td className="px-2 py-3 sm:px-6 sm:py-4 text-sm font-bold text-blue-900 border-r border-blue-200 text-center">-</td>
                      <td className="px-2 py-3 sm:px-6 sm:py-4 text-center text-sm font-bold text-blue-900 text-center">-</td>
                    </tr>
                  )
                })()}
                {uninspectedProjects.map((project) => {
                  const projectInspections = headquartersInspections.filter((i) => {
                    if (selectedHq && i.managing_hq !== selectedHq) return false
                    if (selectedBranch && i.managing_branch !== selectedBranch) return false
                    if (selectedSafetyBranch && i.managing_branch !== selectedSafetyBranch) return false
                    if (i.project_id !== project.id) return false
                    if (quarterRange) {
                      const d = new Date(i.inspection_date)
                      if (d < quarterRange.start || d > quarterRange.end) return false
                    }
                    return true
                  })

                  const latestInspection = projectInspections.sort((a, b) => new Date(b.inspection_date).getTime() - new Date(a.inspection_date).getTime())[0]
                  const pendingCount = 0
                  const inspectionCount = projectInspections.length
                  const isActive = (() => {
                    const ia: any = (project as any).is_active
                    if (ia && typeof ia === 'object') {
                      const key = `q${quarterNum}` as 'q1' | 'q2' | 'q3' | 'q4'
                      return !!ia[key]
                    }
                    return false
                  })()

                  return (
                    <tr
                      key={project.id}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={(e) => {
                        e.preventDefault()
                        alert('해당 프로젝트는 점검 내역이 없습니다.')
                      }}
                    >
                      <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm text-center border-r border-gray-200">
                        <span className="text-gray-900">{project.managing_branch || '-'}</span>
                      </td>
                      <td className="px-2 py-2 sm:px-6 sm:py-4 text-sm font-medium text-blue-600 hover:text-blue-800 border-r border-gray-200 text-center max-w-[120px] sm:max-w-none">
                        <div className="sm:hidden">{(project.project_name || '').length > 6 ? `${(project.project_name || '').substring(0, 6)}...` : project.project_name || '미지정'}</div>
                        <div className="hidden sm:block break-words">{project.project_name || '미지정'}</div>
                      </td>
                      <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm text-center border-r border-gray-200">
                        {isActive ? (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800">대상(미점검)</span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm border-r border-gray-200 text-center">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">-</span>
                      </td>
                      <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm border-r border-gray-200 text-center">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">-</span>
                      </td>
                      <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm text-gray-500 border-r border-gray-200 text-center">-</td>
                      <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm text-gray-500 border-r border-gray-200 text-center">-</td>
                      <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-center text-sm">-</td>
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

export default UninspectedProjectsTable


