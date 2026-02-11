'use client'

import React, { useState, useMemo } from 'react'
import { ArrowLeft, ChevronRight, FileText, Building, Users } from 'lucide-react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import type { Project, SafeDocumentInspection } from '@/lib/projects'
import { BRANCH_OPTIONS } from '@/lib/constants'

interface SafeDocumentViewProps {
  loading: boolean
  projects: Project[]
  inspections: SafeDocumentInspection[]
  selectedSafetyHq: string | null
  selectedSafetyBranch: string | null
  selectedHq: string
  selectedBranch: string
  selectedQuarter: string
  onBack: () => void
  onSelectBranch: (branch: string) => void
  onRowClickProject: (projectId: string) => void
  onQuarterChange?: (quarter: string) => void
}

const SafeDocumentView: React.FC<SafeDocumentViewProps> = ({
  loading,
  projects,
  inspections,
  selectedSafetyHq,
  selectedSafetyBranch,
  selectedHq,
  selectedBranch,
  selectedQuarter,
  onBack,
  onSelectBranch,
  onRowClickProject,
  onQuarterChange,
}) => {
  // 현재 뷰 레벨: 'branch' (지사별 테이블) 또는 'project' (프로젝트별 테이블)
  const [viewLevel, setViewLevel] = useState<'branch' | 'project'>('branch')
  const [selectedBranchForDetail, setSelectedBranchForDetail] = useState<string | null>(null)
  const [showYearModal, setShowYearModal] = useState(false)
  const [tempYear, setTempYear] = useState(new Date().getFullYear())

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

  // 분기 변경 핸들러
  const handleYearChange = (newYear: number) => {
    // 유효한 년도 범위 체크 (2000년 ~ 2100년)
    if (newYear < 2000 || newYear > 2100 || isNaN(newYear)) return
    const newQuarter = `${newYear}Q${selectedQ}`
    if (onQuarterChange) {
      onQuarterChange(newQuarter)
    }
  }

  const handleQuarterChange = (newQ: number) => {
    const newQuarter = `${selectedYear}Q${newQ}`
    if (onQuarterChange) {
      onQuarterChange(newQuarter)
    }
  }

  // 지사별 점검 건수 집계
  const branchStats = useMemo(() => {
    const stats = new Map<string, { total: number; nonCompliant: number; branches: string[] }>()

    // 본부별로 지사 목록을 초기화
    const targetHq = selectedHq || selectedSafetyHq
    if (targetHq && BRANCH_OPTIONS[targetHq]) {
      BRANCH_OPTIONS[targetHq].forEach(branch => {
        stats.set(branch, { total: 0, nonCompliant: 0, branches: [] })
      })
    }

    // 점검 데이터 집계
    inspections.forEach(inspection => {
      const branch = inspection.managing_branch || '미지정'
      const existing = stats.get(branch) || { total: 0, nonCompliant: 0, branches: [] }
      existing.total += 1
      existing.nonCompliant += inspection.non_compliant_items || 0
      stats.set(branch, existing)
    })

    return stats
  }, [inspections, selectedHq, selectedSafetyHq])

  // 선택된 지사의 프로젝트별 점검 현황
  const projectStats = useMemo(() => {
    if (!selectedBranchForDetail) return []

    // 해당 지사의 프로젝트 목록
    const branchProjects = projects.filter(p => p.managing_branch === selectedBranchForDetail)

    // 프로젝트별 점검 데이터 매핑
    return branchProjects.map(project => {
      const projectInspections = inspections.filter(i => i.project_id === project.id)
      const totalNonCompliant = projectInspections.reduce((sum, i) => sum + (i.non_compliant_items || 0), 0)
      const latestInspection = projectInspections.length > 0
        ? projectInspections.reduce((latest, current) =>
          new Date(current.inspection_date) > new Date(latest.inspection_date) ? current : latest
        )
        : null

      return {
        project,
        inspectionCount: projectInspections.length,
        nonCompliantCount: totalNonCompliant,
        latestDate: latestInspection?.inspection_date,
        latestInspector: latestInspection?.inspector_name,
      }
    })
  }, [selectedBranchForDetail, projects, inspections])

  // 뒤로가기 핸들러
  const handleBack = () => {
    if (viewLevel === 'project') {
      setViewLevel('branch')
      setSelectedBranchForDetail(null)
    } else {
      onBack()
    }
  }

  // 지사 행 클릭 핸들러
  const handleBranchClick = (branch: string) => {
    setSelectedBranchForDetail(branch)
    setViewLevel('project')
    onSelectBranch(branch)
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
      {/* 헤더 */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={handleBack}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          aria-label="뒤로가기"
        >
          <ArrowLeft className="h-5 w-5 text-gray-600" />
        </button>
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-purple-600" />
          <h2 className="text-lg font-semibold text-gray-900">
            안전서류 점검 현황
          </h2>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {/* 년도 입력 (숫자 입력 + 업/다운) */}
          {/* 년도 선택 버튼 */}
          <button
            type="button"
            onClick={() => {
              setTempYear(selectedYear)
              setShowYearModal(true)
            }}
            className="border border-gray-300 rounded-md px-3 py-1 text-sm bg-white hover:bg-gray-50 transition-colors"
          >
            {selectedYear}년
          </button>
          {/* 분기 선택 */}
          <select
            value={selectedQ}
            onChange={(e) => handleQuarterChange(parseInt(e.target.value, 10))}
            className="border border-gray-300 rounded-md px-2 py-1 text-sm focus:ring-purple-500 focus:border-purple-500 bg-white"
          >
            <option value={1}>1분기</option>
            <option value={2}>2분기</option>
            <option value={3}>3분기</option>
            <option value={4}>4분기</option>
          </select>
        </div>
      </div>

      {/* 지사별 테이블 */}
      {viewLevel === 'branch' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-purple-50 px-4 py-3 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building className="h-4 w-4 text-purple-600" />
                <span className="text-sm font-medium text-purple-800">
                  지사별 점검 현황
                </span>
              </div>
              <div className="flex gap-4 text-sm">
                <span className="text-blue-600 font-semibold">
                  총 {inspections.length}건 점검
                </span>
                <span className="text-red-600 font-semibold">
                  불이행 {inspections.reduce((sum, i) => sum + (i.non_compliant_items || 0), 0)}건
                </span>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    지사명
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    점검 건수
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    불이행 건수
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    상세
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {Array.from(branchStats.entries()).map(([branch, stats]) => (
                  <tr
                    key={branch}
                    onClick={() => handleBranchClick(branch)}
                    className="hover:bg-purple-50/50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 text-center">
                      {branch}
                    </td>
                    <td className="px-4 py-3 text-sm text-center">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {stats.total}건
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-center">
                      {stats.nonCompliant > 0 ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          {stats.nonCompliant}건
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <ChevronRight className="h-4 w-4 text-gray-400 inline-block" />
                    </td>
                  </tr>
                ))}
                {branchStats.size === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-500">
                      해당 분기의 점검 데이터가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 프로젝트별 테이블 */}
      {viewLevel === 'project' && selectedBranchForDetail && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-purple-50 px-4 py-3 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-purple-600" />
                <span className="text-sm font-medium text-purple-800">
                  {selectedBranchForDetail}
                </span>
              </div>
              <div className="flex gap-4 text-sm">
                <span className="text-blue-600 font-semibold">
                  총 {projectStats.reduce((sum, p) => sum + p.inspectionCount, 0)}건 점검
                </span>
                <span className="text-red-600 font-semibold">
                  불이행 {projectStats.reduce((sum, p) => sum + p.nonCompliantCount, 0)}건
                </span>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    프로젝트명
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    점검 건수
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    불이행 건수
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    최근 점검일
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    점검자
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    상세
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {projectStats.map(({ project, inspectionCount, nonCompliantCount, latestDate, latestInspector }) => (
                  <tr
                    key={project.id}
                    onClick={() => onRowClickProject(project.id)}
                    className="hover:bg-purple-50/50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 text-center">
                      <span className="sm:hidden" title={project.project_name}>
                        {project.project_name.length > 3
                          ? `${project.project_name.slice(0, 3)}...`
                          : project.project_name}
                      </span>
                      <span className="hidden sm:inline">{project.project_name}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-center">
                      {inspectionCount > 0 ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {inspectionCount}건
                        </span>
                      ) : (
                        <span className="text-gray-400">미점검</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-center">
                      {nonCompliantCount > 0 ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          {nonCompliantCount}건
                        </span>
                      ) : inspectionCount > 0 ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          0건
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-center text-gray-600">
                      {latestDate || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-center text-gray-600">
                      {latestInspector || '-'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <ChevronRight className="h-4 w-4 text-gray-400 inline-block" />
                    </td>
                  </tr>
                ))}
                {projectStats.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">
                      해당 지사에 프로젝트가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
                className="w-16 h-16 rounded-full bg-purple-600 text-white text-3xl font-bold hover:bg-purple-700 transition-colors flex items-center justify-center"
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
                className="w-16 h-16 rounded-full bg-purple-600 text-white text-3xl font-bold hover:bg-purple-700 transition-colors flex items-center justify-center"
              >
                −
              </button>

              {/* 취소 / 확인 버튼 */}
              <div className="flex space-x-3 w-full mt-4">
                <button
                  type="button"
                  onClick={() => setShowYearModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleYearChange(tempYear)
                    setShowYearModal(false)
                  }}
                  className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
                >
                  확인
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default SafeDocumentView

