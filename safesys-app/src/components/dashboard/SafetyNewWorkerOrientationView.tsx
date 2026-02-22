'use client'

import React, { useState, useMemo } from 'react'
import { ArrowLeft, Users, Building } from 'lucide-react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import type { Project } from '@/lib/projects'
import { HEADQUARTERS_OPTIONS, BRANCH_OPTIONS } from '@/lib/constants'

interface OrientationStats {
    project_id: string
    project_name: string
    orientation_count: number
    worker_count: number
}

interface SafetyNewWorkerOrientationViewProps {
    loading: boolean
    projects: Project[]
    orientationStats: OrientationStats[]
    selectedSafetyHq: string | null
    selectedSafetyBranch: string | null
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
    orientationCount: number
    workerCount: number
}

const emptyStats = (): AggStats => ({ projectCount: 0, orientationCount: 0, workerCount: 0 })

const SafetyNewWorkerOrientationView: React.FC<SafetyNewWorkerOrientationViewProps> = ({
    loading,
    projects,
    orientationStats,
    selectedSafetyHq,
    selectedSafetyBranch,
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

    const statsMap = useMemo(() => {
        const map = new Map<string, { orientation_count: number; worker_count: number }>()
        orientationStats.forEach(os => map.set(os.project_id, {
            orientation_count: os.orientation_count,
            worker_count: os.worker_count,
        }))
        return map
    }, [orientationStats])

    const totalStats = useMemo(() => {
        const s = emptyStats()
        orientationStats.forEach(os => {
            s.orientationCount += os.orientation_count
            s.workerCount += os.worker_count
        })
        return s
    }, [orientationStats])

    const hqStats = useMemo(() => {
        const stats = new Map<string, AggStats>()
        HEADQUARTERS_OPTIONS.forEach(hq => stats.set(hq, emptyStats()))
        activeProjects.forEach(p => {
            const hq = p.managing_hq || '미지정'
            const existing = stats.get(hq) || emptyStats()
            const os = statsMap.get(p.id)
            existing.projectCount += 1
            existing.orientationCount += os?.orientation_count || 0
            existing.workerCount += os?.worker_count || 0
            stats.set(hq, existing)
        })
        return stats
    }, [activeProjects, statsMap])

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
                const os = statsMap.get(p.id)
                existing.projectCount += 1
                existing.orientationCount += os?.orientation_count || 0
                existing.workerCount += os?.worker_count || 0
                stats.set(branch, existing)
            })
        return stats
    }, [activeProjects, statsMap, selectedHqForDetail])

    const projectList = useMemo(() => {
        if (!selectedBranchForDetail) return []
        return activeProjects
            .filter(p => p.managing_branch === selectedBranchForDetail)
            .map(p => {
                const os = statsMap.get(p.id)
                return {
                    project_id: p.id,
                    project_name: p.project_name,
                    orientation_count: os?.orientation_count || 0,
                    worker_count: os?.worker_count || 0,
                }
            })
            .sort((a, b) => b.orientation_count - a.orientation_count)
    }, [activeProjects, statsMap, selectedBranchForDetail])

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
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">현장안내<br />건수</th>
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">현장안내<br />근로자수</th>
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">비고</th>
            </tr>
        </thead>
    )

    const renderSubtotalRow = (subtotal: AggStats, showProjectCount = true) => (
        <tr className="bg-emerald-50/70 font-semibold border-b-2 border-emerald-200">
            <td className="px-3 py-2 text-sm text-center text-emerald-800">소계</td>
            {showProjectCount && (
                <td className="px-3 py-2 text-sm text-center text-emerald-800">{subtotal.projectCount}개</td>
            )}
            <td className="px-3 py-2 text-sm text-center text-emerald-800">{subtotal.orientationCount > 0 ? `${subtotal.orientationCount.toLocaleString()}건` : '-'}</td>
            <td className="px-3 py-2 text-sm text-center text-emerald-800">{subtotal.workerCount > 0 ? `${subtotal.workerCount.toLocaleString()}명` : '-'}</td>
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
                {stats.orientationCount > 0 ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                        {stats.orientationCount.toLocaleString()}건
                    </span>
                ) : (
                    <span className="text-gray-400">-</span>
                )}
            </td>
            <td className="px-3 py-3 text-sm text-center">
                {stats.workerCount > 0 ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-800">
                        {stats.workerCount.toLocaleString()}명
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
                    <Users className="h-5 w-5 text-emerald-600" />
                    <h2 className="text-lg font-semibold text-gray-900">
                        신규근로자 현장안내
                        {viewLevel === 'branch' && selectedHqForDetail && (
                            <span className="text-sm font-normal text-gray-500 ml-2">- {selectedHqForDetail}</span>
                        )}
                        {viewLevel === 'project' && selectedBranchForDetail && (
                            <span className="text-sm font-normal text-gray-500 ml-2">- {selectedBranchForDetail}</span>
                        )}
                    </h2>
                </div>
                <div className="ml-auto text-sm text-gray-500">
                    총 {totalStats.orientationCount.toLocaleString()}건 / {totalStats.workerCount.toLocaleString()}명
                </div>
            </div>

            {/* 본부별 테이블 */}
            {viewLevel === 'hq' && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                    <div className="bg-emerald-50 px-4 py-3 border-b border-gray-200">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Building className="h-4 w-4 text-emerald-600" />
                                <span className="text-sm font-medium text-emerald-800">본부별 신규근로자 현장안내 현황</span>
                            </div>
                            <span className="text-sm text-emerald-600 font-semibold">총 {totalStats.orientationCount.toLocaleString()}건</span>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            {renderTableHeader('본부명')}
                            <tbody className="divide-y divide-gray-200">
                                {renderSubtotalRow((() => {
                                    const s = emptyStats()
                                    Array.from(hqStats.values()).forEach(v => { s.projectCount += v.projectCount; s.orientationCount += v.orientationCount; s.workerCount += v.workerCount })
                                    return s
                                })())}
                                {Array.from(hqStats.entries())
                                    .filter(([, stats]) => stats.projectCount > 0)
                                    .map(([hq, stats]) => (
                                        <tr key={hq} onClick={() => handleHqClick(hq)} className="hover:bg-emerald-50/50 cursor-pointer transition-colors">
                                            <td className="px-3 py-3 text-sm font-medium text-gray-900 text-center">{hq}</td>
                                            {renderStatsCells(stats)}
                                        </tr>
                                    ))}
                                {Array.from(hqStats.values()).every(s => s.projectCount === 0) && (
                                    <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">등록된 프로젝트가 없습니다.</td></tr>
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
                                <span className="text-sm font-medium text-emerald-800">{selectedHqForDetail} - 지사별 현장안내 현황</span>
                            </div>
                            <span className="text-sm text-emerald-600 font-semibold">총 {Array.from(branchStats.values()).reduce((s, v) => s + v.orientationCount, 0).toLocaleString()}건</span>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            {renderTableHeader('지사명')}
                            <tbody className="divide-y divide-gray-200">
                                {renderSubtotalRow(Array.from(branchStats.values()).reduce((acc, curr) => ({
                                    projectCount: acc.projectCount + curr.projectCount,
                                    orientationCount: acc.orientationCount + curr.orientationCount,
                                    workerCount: acc.workerCount + curr.workerCount,
                                }), emptyStats()))}
                                {Array.from(branchStats.entries()).map(([branch, stats]) => (
                                    <tr key={branch} onClick={() => handleBranchClick(branch)} className="hover:bg-emerald-50/50 cursor-pointer transition-colors">
                                        <td className="px-3 py-3 text-sm font-medium text-gray-900 text-center">{branch}</td>
                                        {renderStatsCells(stats)}
                                    </tr>
                                ))}
                                {branchStats.size === 0 && (
                                    <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">해당 본부에 지사 데이터가 없습니다.</td></tr>
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
                                <Users className="h-4 w-4 text-emerald-600" />
                                <span className="text-sm font-medium text-emerald-800">{selectedBranchForDetail} - 프로젝트별 현장안내 현황</span>
                            </div>
                            <span className="text-sm text-emerald-600 font-semibold">총 {projectList.reduce((s, p) => s + p.orientation_count, 0).toLocaleString()}건</span>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            {renderTableHeader('프로젝트명', false)}
                            <tbody className="divide-y divide-gray-200">
                                {renderSubtotalRow(projectList.reduce((acc, curr) => ({
                                    projectCount: 0,
                                    orientationCount: acc.orientationCount + curr.orientation_count,
                                    workerCount: acc.workerCount + curr.worker_count,
                                }), emptyStats()), false)}
                                {projectList.map(p => (
                                    <tr key={p.project_id} onClick={() => onRowClickProject(p.project_id)} className="hover:bg-emerald-50/50 cursor-pointer transition-colors">
                                        <td className="px-3 py-3 text-sm font-medium text-gray-900 text-center">
                                            <span className="sm:hidden" title={p.project_name}>
                                                {p.project_name.length > 3 ? `${p.project_name.slice(0, 3)}...` : p.project_name}
                                            </span>
                                            <span className="hidden sm:inline">{p.project_name}</span>
                                        </td>
                                        {renderStatsCells({
                                            projectCount: 0,
                                            orientationCount: p.orientation_count,
                                            workerCount: p.worker_count,
                                        }, false)}
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

export default SafetyNewWorkerOrientationView
