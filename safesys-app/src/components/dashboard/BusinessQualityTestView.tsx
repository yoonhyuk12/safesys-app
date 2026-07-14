// 사업현황 품질시험 카드의 본부별→지사별→프로젝트별 3종 서류 등록 건수 드릴다운 뷰
'use client'

import React, { useState, useMemo } from 'react'
import { ArrowLeft, TestTubes, Building } from 'lucide-react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import type { QualityTestCountByProject } from '@/lib/projects'

interface BusinessQualityTestViewProps {
  loading: boolean
  testCounts: QualityTestCountByProject[]
  initialBranch?: string | null
  onBack: () => void
  onRowClickProject: (projectId: string, branch: string | null) => void
}

interface AggStats {
  projectCount: number
  testCount: number
  verificationCount: number
  summaryCount: number
  hqUnsignedCount: number
}

const emptyStats = (): AggStats => ({
  projectCount: 0,
  testCount: 0,
  verificationCount: 0,
  summaryCount: 0,
  hqUnsignedCount: 0,
})

type ViewLevel = 'hq' | 'branch' | 'project'

const BusinessQualityTestView: React.FC<BusinessQualityTestViewProps> = ({
  loading,
  testCounts,
  initialBranch = null,
  onBack,
  onRowClickProject,
}) => {
  // initialBranch가 있으면(관리대장에서 복귀) 해당 지사의 프로젝트 목록부터 복원
  const initialHq = useMemo(() => {
    if (!initialBranch) return null
    const hit = testCounts.find(tc => tc.managing_branch === initialBranch)
    return hit?.managing_hq || null
  }, [initialBranch, testCounts])

  const [viewLevel, setViewLevel] = useState<ViewLevel>(initialBranch ? 'project' : 'hq')
  const [selectedHqForDetail, setSelectedHqForDetail] = useState<string | null>(initialHq)
  const [selectedBranchForDetail, setSelectedBranchForDetail] = useState<string | null>(initialBranch)

  const totalTestCount = useMemo(
    () => testCounts.reduce((s, tc) => s + tc.test_count, 0),
    [testCounts]
  )

  // 본부별 통계
  const hqStats = useMemo(() => {
    const stats = new Map<string, AggStats>()
    testCounts.forEach(tc => {
      const hq = tc.managing_hq || '미지정'
      const existing = stats.get(hq) || emptyStats()
      existing.projectCount += 1
      existing.testCount += tc.test_count
      existing.verificationCount += tc.verification_count
      existing.summaryCount += tc.summary_count
      existing.hqUnsignedCount += tc.hq_unsigned_count
      stats.set(hq, existing)
    })
    return stats
  }, [testCounts])

  // 지사별 통계 (본부 선택 시)
  const branchStats = useMemo(() => {
    const stats = new Map<string, AggStats>()
    if (!selectedHqForDetail) return stats
    testCounts
      .filter(tc => (tc.managing_hq || '미지정') === selectedHqForDetail)
      .forEach(tc => {
        const branch = tc.managing_branch || '미지정'
        const existing = stats.get(branch) || emptyStats()
        existing.projectCount += 1
        existing.testCount += tc.test_count
        existing.verificationCount += tc.verification_count
        existing.summaryCount += tc.summary_count
        existing.hqUnsignedCount += tc.hq_unsigned_count
        stats.set(branch, existing)
      })
    return stats
  }, [testCounts, selectedHqForDetail])

  // 프로젝트 목록 (지사 선택 시)
  const projectList = useMemo(() => {
    if (!selectedBranchForDetail) return []
    return testCounts
      .filter(tc => (tc.managing_branch || '미지정') === selectedBranchForDetail)
      .sort((a, b) => b.test_count - a.test_count)
  }, [testCounts, selectedBranchForDetail])

  const handleBack = () => {
    if (viewLevel === 'project') {
      setViewLevel('branch')
      setSelectedBranchForDetail(null)
      // 복귀 진입으로 본부가 비어 있으면 본부 단계로 건너뛰지 않고 채워 넣는다
      if (!selectedHqForDetail) {
        setViewLevel('hq')
      }
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

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[300px]">
        <LoadingSpinner />
      </div>
    )
  }

  const subtotalOf = (stats: Map<string, AggStats>): AggStats =>
    Array.from(stats.values()).reduce(
      (acc, curr) => ({
        projectCount: acc.projectCount + curr.projectCount,
        testCount: acc.testCount + curr.testCount,
        verificationCount: acc.verificationCount + curr.verificationCount,
        summaryCount: acc.summaryCount + curr.summaryCount,
        hqUnsignedCount: acc.hqUnsignedCount + curr.hqUnsignedCount,
      }),
      emptyStats()
    )

  const countBadge = (count: number) =>
    count > 0 ? (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-sky-100 text-sky-800">
        {count.toLocaleString()}건
      </span>
    ) : (
      <span className="text-gray-400">-</span>
    )

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
          <TestTubes className="h-5 w-5 text-sky-400" />
          <h2 className="text-lg font-semibold text-white">
            품질시험 대장 제출현황
            {viewLevel === 'branch' && selectedHqForDetail && (
              <span className="text-sm font-normal text-gray-300 ml-2">- {selectedHqForDetail}</span>
            )}
            {viewLevel === 'project' && selectedBranchForDetail && (
              <span className="text-sm font-normal text-gray-300 ml-2">- {selectedBranchForDetail}</span>
            )}
          </h2>
        </div>
        <div className="ml-auto text-sm text-gray-300">
          총 {totalTestCount.toLocaleString()}건 등록
        </div>
      </div>

      {/* 본부별 테이블 */}
      {viewLevel === 'hq' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-sky-50 px-4 py-3 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building className="h-4 w-4 text-sky-600" />
                <span className="text-sm font-medium text-sky-800">본부별 품질시험 대장 제출현황</span>
              </div>
              <span className="text-sm text-sky-600 font-semibold">총 {totalTestCount.toLocaleString()}건</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">본부명</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">프로젝트수</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">등록 건수</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">확인시험 건수</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">총괄표 건수</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">본부 미서명 건수</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {(() => {
                  const subtotal = subtotalOf(hqStats)
                  return (
                    <tr className="bg-sky-50/70 font-semibold border-b-2 border-sky-200">
                      <td className="px-3 py-2 text-sm text-center text-sky-800">소계</td>
                      <td className="px-3 py-2 text-sm text-center text-sky-800">{subtotal.projectCount}개</td>
                      <td className="px-3 py-2 text-sm text-center text-sky-800">
                        {subtotal.testCount > 0 ? `${subtotal.testCount.toLocaleString()}건` : '-'}
                      </td>
                      <td className="px-3 py-2 text-sm text-center text-sky-800">
                        {subtotal.verificationCount > 0 ? `${subtotal.verificationCount.toLocaleString()}건` : '-'}
                      </td>
                      <td className="px-3 py-2 text-sm text-center text-sky-800">
                        {subtotal.summaryCount > 0 ? `${subtotal.summaryCount.toLocaleString()}건` : '-'}
                      </td>
                      <td className="px-3 py-2 text-sm text-center text-sky-800">
                        {subtotal.hqUnsignedCount > 0 ? `${subtotal.hqUnsignedCount.toLocaleString()}건` : '-'}
                      </td>
                    </tr>
                  )
                })()}
                {Array.from(hqStats.entries())
                  .sort((a, b) => b[1].testCount - a[1].testCount)
                  .map(([hq, stats]) => (
                    <tr key={hq} onClick={() => handleHqClick(hq)} className="hover:bg-sky-50/50 cursor-pointer transition-colors">
                      <td className="px-3 py-3 text-sm font-medium text-gray-900 text-center">{hq}</td>
                      <td className="px-3 py-3 text-sm text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          {stats.projectCount}개
                        </span>
                      </td>
                      <td className="px-3 py-3 text-sm text-center">{countBadge(stats.testCount)}</td>
                      <td className="px-3 py-3 text-sm text-center">{countBadge(stats.verificationCount)}</td>
                      <td className="px-3 py-3 text-sm text-center">{countBadge(stats.summaryCount)}</td>
                      <td className="px-3 py-3 text-sm text-center">{countBadge(stats.hqUnsignedCount)}</td>
                    </tr>
                  ))}
                {hqStats.size === 0 && (
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
          <div className="bg-sky-50 px-4 py-3 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building className="h-4 w-4 text-sky-600" />
                <span className="text-sm font-medium text-sky-800">{selectedHqForDetail} - 지사별 품질시험 대장 제출현황</span>
              </div>
              <span className="text-sm text-sky-600 font-semibold">
                총 {subtotalOf(branchStats).testCount.toLocaleString()}건
              </span>
            </div>
          </div>
          <div
            className="overflow-x-auto overscroll-x-contain"
            role="region"
            aria-label="지사별 품질시험 대장 제출현황"
            tabIndex={0}
          >
            <table className="w-max min-w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="sticky left-0 z-20 w-20 min-w-20 max-w-20 bg-gray-50 px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider sm:static sm:w-auto sm:min-w-0 sm:max-w-none sm:px-3">지사명</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">프로젝트수</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">등록 건수</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">확인시험 건수</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">총괄표 건수</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">본부 미서명 건수</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {(() => {
                  const subtotal = subtotalOf(branchStats)
                  return (
                    <tr className="bg-sky-50/70 font-semibold border-b-2 border-sky-200">
                      <td className="sticky left-0 z-10 w-20 min-w-20 max-w-20 bg-sky-50 px-2 py-2 text-sm text-center text-sky-800 sm:static sm:w-auto sm:min-w-0 sm:max-w-none sm:px-3">소계</td>
                      <td className="px-3 py-2 text-sm text-center text-sky-800">{subtotal.projectCount}개</td>
                      <td className="px-3 py-2 text-sm text-center text-sky-800">
                        {subtotal.testCount > 0 ? `${subtotal.testCount.toLocaleString()}건` : '-'}
                      </td>
                      <td className="px-3 py-2 text-sm text-center text-sky-800">
                        {subtotal.verificationCount > 0 ? `${subtotal.verificationCount.toLocaleString()}건` : '-'}
                      </td>
                      <td className="px-3 py-2 text-sm text-center text-sky-800">
                        {subtotal.summaryCount > 0 ? `${subtotal.summaryCount.toLocaleString()}건` : '-'}
                      </td>
                      <td className="px-3 py-2 text-sm text-center text-sky-800">
                        {subtotal.hqUnsignedCount > 0 ? `${subtotal.hqUnsignedCount.toLocaleString()}건` : '-'}
                      </td>
                    </tr>
                  )
                })()}
                {Array.from(branchStats.entries())
                  .sort((a, b) => b[1].testCount - a[1].testCount)
                  .map(([branch, stats]) => (
                    <tr key={branch} onClick={() => handleBranchClick(branch)} className="group hover:bg-sky-50/50 cursor-pointer transition-colors">
                      <td className="sticky left-0 z-10 w-20 min-w-20 max-w-20 bg-white px-2 py-3 text-center text-sm font-medium text-gray-900 transition-colors group-hover:bg-sky-50 sm:static sm:w-auto sm:min-w-0 sm:max-w-none sm:px-3">
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
                      <td className="px-3 py-3 text-sm text-center">{countBadge(stats.testCount)}</td>
                      <td className="px-3 py-3 text-sm text-center">{countBadge(stats.verificationCount)}</td>
                      <td className="px-3 py-3 text-sm text-center">{countBadge(stats.summaryCount)}</td>
                      <td className="px-3 py-3 text-sm text-center">{countBadge(stats.hqUnsignedCount)}</td>
                    </tr>
                  ))}
                {branchStats.size === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">해당 본부에 프로젝트가 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 프로젝트별 테이블 */}
      {viewLevel === 'project' && selectedBranchForDetail && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-sky-50 px-4 py-3 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TestTubes className="h-4 w-4 text-sky-600" />
                <span className="text-sm font-medium text-sky-800">{selectedBranchForDetail} - 프로젝트별 품질시험 대장 제출현황</span>
              </div>
              <span className="text-sm text-sky-600 font-semibold">
                총 {projectList.reduce((s, p) => s + p.test_count, 0).toLocaleString()}건
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">프로젝트명</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">등록 건수</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">확인시험 건수</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">총괄표 건수</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">본부 미서명 건수</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                <tr className="bg-sky-50/70 font-semibold border-b-2 border-sky-200">
                  <td className="px-3 py-2 text-sm text-center text-sky-800">소계</td>
                  <td className="px-3 py-2 text-sm text-center text-sky-800">
                    {projectList.reduce((s, p) => s + p.test_count, 0) > 0
                      ? `${projectList.reduce((s, p) => s + p.test_count, 0).toLocaleString()}건`
                      : '-'}
                  </td>
                  <td className="px-3 py-2 text-sm text-center text-sky-800">
                    {projectList.reduce((s, p) => s + p.verification_count, 0) > 0
                      ? `${projectList.reduce((s, p) => s + p.verification_count, 0).toLocaleString()}건`
                      : '-'}
                  </td>
                  <td className="px-3 py-2 text-sm text-center text-sky-800">
                    {projectList.reduce((s, p) => s + p.summary_count, 0) > 0
                      ? `${projectList.reduce((s, p) => s + p.summary_count, 0).toLocaleString()}건`
                      : '-'}
                  </td>
                  <td className="px-3 py-2 text-sm text-center text-sky-800">
                    {projectList.reduce((s, p) => s + p.hq_unsigned_count, 0) > 0
                      ? `${projectList.reduce((s, p) => s + p.hq_unsigned_count, 0).toLocaleString()}건`
                      : '-'}
                  </td>
                </tr>
                {projectList.map(p => (
                  <tr
                    key={p.project_id}
                    onClick={() => onRowClickProject(p.project_id, selectedBranchForDetail)}
                    className="hover:bg-sky-50/50 cursor-pointer transition-colors"
                  >
                    <td className="px-3 py-3 text-sm font-medium text-gray-900 text-center">
                      <span className="sm:hidden" title={p.project_name}>
                        {p.project_name.length > 3 ? `${p.project_name.slice(0, 3)}...` : p.project_name}
                      </span>
                      <span className="hidden sm:inline">{p.project_name}</span>
                    </td>
                    <td className="px-3 py-3 text-sm text-center">{countBadge(p.test_count)}</td>
                    <td className="px-3 py-3 text-sm text-center">{countBadge(p.verification_count)}</td>
                    <td className="px-3 py-3 text-sm text-center">{countBadge(p.summary_count)}</td>
                    <td className="px-3 py-3 text-sm text-center">{countBadge(p.hq_unsigned_count)}</td>
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

export default BusinessQualityTestView
