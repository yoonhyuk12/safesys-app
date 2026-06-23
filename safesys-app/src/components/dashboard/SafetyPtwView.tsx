'use client'

// 작업허가제(PTW) 안전현황 뷰 — 본부뷰(지사목록) → 지사뷰(프로젝트목록), 컬럼: 제출건수·사인완료 여부·비고
import React, { useState, useMemo } from 'react'
import { ArrowLeft, ChevronRight, ClipboardCheck, Building, Users } from 'lucide-react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import type { Project, PtwPermitSummary } from '@/lib/projects'
import { BRANCH_OPTIONS } from '@/lib/constants'

interface SafetyPtwViewProps {
  loading: boolean
  projects: Project[]
  permits: PtwPermitSummary[]
  selectedSafetyHq: string | null
  selectedSafetyBranch: string | null
  selectedHq: string
  selectedYear: number
  onBack: () => void
  onSelectBranch: (branch: string) => void
  onRowClickProject: (projectId: string) => void
  onYearChange: (year: number) => void
}

const SafetyPtwView: React.FC<SafetyPtwViewProps> = ({
  loading,
  projects,
  permits,
  selectedSafetyHq,
  selectedSafetyBranch,
  selectedHq,
  selectedYear,
  onBack,
  onSelectBranch,
  onRowClickProject,
  onYearChange,
}) => {
  // 현재 뷰 레벨: 'branch'(지사별 테이블) 또는 'project'(프로젝트별 테이블)
  // 초기값을 selectedSafetybranch(URL) 기준으로 결정 — 프로젝트 PTW에서 돌아와도 프로젝트 테이블 복원
  const [viewLevel, setViewLevel] = useState<'branch' | 'project'>(() => (selectedSafetyBranch ? 'project' : 'branch'))
  const [selectedBranchForDetail, setSelectedBranchForDetail] = useState<string | null>(selectedSafetyBranch)
  const [showYearModal, setShowYearModal] = useState(false)
  const [tempYear, setTempYear] = useState(selectedYear)

  // 지사별 제출건수·사인완료 집계
  const branchStats = useMemo(() => {
    const stats = new Map<string, { total: number; signed: number }>()

    // 본부별로 지사 목록을 초기화
    const targetHq = selectedHq || selectedSafetyHq
    if (targetHq && BRANCH_OPTIONS[targetHq]) {
      BRANCH_OPTIONS[targetHq].forEach((branch) => {
        stats.set(branch, { total: 0, signed: 0 })
      })
    }

    permits.forEach((permit) => {
      const branch = permit.managing_branch || '미지정'
      const existing = stats.get(branch) || { total: 0, signed: 0 }
      existing.total += 1
      if (permit.is_signed) existing.signed += 1
      stats.set(branch, existing)
    })

    return stats
  }, [permits, selectedHq, selectedSafetyHq])

  // 소계행: 전체 집계
  const overallStats = useMemo(() => {
    const total = permits.length
    const signed = permits.filter((p) => p.is_signed).length
    return { total, signed }
  }, [permits])

  // 선택된 지사의 프로젝트별 제출건수·사인완료
  const projectStats = useMemo(() => {
    if (!selectedBranchForDetail) return []

    const branchProjects = projects.filter((p) => p.managing_branch === selectedBranchForDetail)

    return branchProjects.map((project) => {
      const projectPermits = permits.filter((p) => p.project_id === project.id)
      const total = projectPermits.length
      const signed = projectPermits.filter((p) => p.is_signed).length
      return { project, total, signed }
    })
  }, [selectedBranchForDetail, projects, permits])

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

  // 사인완료 셀 렌더 (완료 N / 전체 M)
  const renderSignedCell = (signed: number, total: number) => {
    if (total === 0) return <span className="text-gray-400">-</span>
    const allSigned = signed === total
    return (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
          allSigned ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
        }`}
      >
        {signed} / {total}
      </span>
    )
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
          <ClipboardCheck className="h-5 w-5 text-rose-600" />
          <h2 className="text-lg font-semibold text-gray-900">작업허가제(PTW) 현황</h2>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {/* 연도 선택 버튼 */}
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
        </div>
      </div>

      {/* 지사별 테이블 */}
      {viewLevel === 'branch' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-rose-50 px-4 py-3 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building className="h-4 w-4 text-rose-600" />
                <span className="text-sm font-medium text-rose-800">지사별 작업허가제 현황</span>
              </div>
              <div className="flex gap-4 text-sm">
                <span className="text-blue-600 font-semibold">총 {overallStats.total}건 제출</span>
                <span className="text-green-600 font-semibold">사인완료 {overallStats.signed}건</span>
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
                    제출건수
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    사인완료 여부
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    비고
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    상세
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {/* 소계행 */}
                <tr className="bg-gray-100 font-semibold border-b-2 border-gray-300">
                  <td className="px-4 py-3 text-sm text-center text-gray-900">소계</td>
                  <td className="px-4 py-3 text-sm text-center">
                    {overallStats.total > 0 ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {overallStats.total}건
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-center">
                    {renderSignedCell(overallStats.signed, overallStats.total)}
                  </td>
                  <td className="px-4 py-3"></td>
                  <td className="px-4 py-3"></td>
                </tr>
                {Array.from(branchStats.entries()).map(([branch, stats]) => (
                  <tr
                    key={branch}
                    onClick={() => handleBranchClick(branch)}
                    className="hover:bg-rose-50/50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 text-center">{branch}</td>
                    <td className="px-4 py-3 text-sm text-center">
                      {stats.total > 0 ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {stats.total}건
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-center">
                      {renderSignedCell(stats.signed, stats.total)}
                    </td>
                    <td className="px-4 py-3"></td>
                    <td className="px-4 py-3 text-center">
                      <ChevronRight className="h-4 w-4 text-gray-400 inline-block" />
                    </td>
                  </tr>
                ))}
                {branchStats.size === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">
                      해당 연도의 작업허가제 데이터가 없습니다.
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
          <div className="bg-rose-50 px-4 py-3 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-rose-600" />
                <span className="text-sm font-medium text-rose-800">{selectedBranchForDetail}</span>
              </div>
              <div className="flex gap-4 text-sm">
                <span className="text-blue-600 font-semibold">
                  총 {projectStats.reduce((sum, p) => sum + p.total, 0)}건 제출
                </span>
                <span className="text-green-600 font-semibold">
                  사인완료 {projectStats.reduce((sum, p) => sum + p.signed, 0)}건
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
                    제출건수
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    사인완료 여부
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    비고
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    상세
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {projectStats.map(({ project, total, signed }) => (
                  <tr
                    key={project.id}
                    onClick={() => onRowClickProject(project.id)}
                    className="hover:bg-rose-50/50 cursor-pointer transition-colors"
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
                      {total > 0 ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {total}건
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-center">{renderSignedCell(signed, total)}</td>
                    <td className="px-4 py-3"></td>
                    <td className="px-4 py-3 text-center">
                      <ChevronRight className="h-4 w-4 text-gray-400 inline-block" />
                    </td>
                  </tr>
                ))}
                {projectStats.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">
                      해당 지사에 프로젝트가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 연도 선택 팝업 모달 */}
      {showYearModal && (
        <div
          className="fixed inset-0 flex items-center justify-center z-[100]"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
          onClick={() => setShowYearModal(false)}
        >
          <div className="bg-white rounded-lg shadow-xl p-6 w-64" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-col items-center space-y-4">
              <button
                type="button"
                onClick={() => setTempYear((prev) => Math.min(prev + 1, 2100))}
                className="w-16 h-16 rounded-full bg-rose-600 text-white text-3xl font-bold hover:bg-rose-700 transition-colors flex items-center justify-center"
              >
                +
              </button>
              <div className="text-4xl font-bold text-gray-900 py-2">{tempYear}</div>
              <button
                type="button"
                onClick={() => setTempYear((prev) => Math.max(prev - 1, 2000))}
                className="w-16 h-16 rounded-full bg-rose-600 text-white text-3xl font-bold hover:bg-rose-700 transition-colors flex items-center justify-center"
              >
                −
              </button>
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
                    onYearChange(tempYear)
                    setShowYearModal(false)
                  }}
                  className="flex-1 px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors font-medium"
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

export default SafetyPtwView
