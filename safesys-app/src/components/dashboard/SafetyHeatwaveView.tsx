'use client'

import React from 'react'
import { Thermometer, ChevronLeft, Calendar, ArrowLeft } from 'lucide-react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import type { HeatWaveCheck, Project, TBMSafetyInspection } from '@/lib/projects'
import { BRANCH_OPTIONS, HEADQUARTERS_OPTIONS } from '@/lib/constants'

const HEAT_WAVE_ITEM_KEYS = [
  'water_supply',
  'ventilation',
  'rest_time',
  'cooling_equipment',
  'emergency_care',
  'work_time_adjustment'
] as const

// 폭염 특보 단계 판정 — 체감온도 기준 주의보 33℃·경보 35℃·중대경보 38℃, 축약은 weather-warnings의 2글자 규칙(폭주·폭경·폭중)을 따름
const getHeatWaveAlert = (feelsLikeTemp: number): { label: string; className: string } | null => {
  if (feelsLikeTemp >= 38) return { label: '폭중', className: 'bg-red-100 text-red-800' }
  if (feelsLikeTemp >= 35) return { label: '폭경', className: 'bg-orange-100 text-orange-800' }
  if (feelsLikeTemp >= 33) return { label: '폭주', className: 'bg-yellow-100 text-yellow-800' }
  return null
}

const HeatWaveAlertBadge: React.FC<{ feelsLikeTemp: number }> = ({ feelsLikeTemp }) => {
  const alert = getHeatWaveAlert(feelsLikeTemp)
  if (!alert) return null
  return (
    <span className={`ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold ${alert.className}`}>
      {alert.label}
    </span>
  )
}

// 준공 프로젝트 판별 — is_active가 과거 boolean 또는 JSONB({completed}) 두 형태를 모두 지원 (다른 대시보드 뷰와 동일 패턴)
const isCompleted = (project: Project): boolean => {
  const isActive = project.is_active as unknown
  if (isActive === undefined || isActive === null) return false
  if (typeof isActive === 'boolean') return !isActive
  if (typeof isActive === 'object') {
    return (isActive as { completed?: boolean }).completed === true
  }
  return false
}

interface HeatWaveAggregate {
  name: string
  targetProjectCount: number
  checkCount: number
  latestCheckTime: string | null
  maxFeelsLikeTemp: number | null
  completedItemCount: number
  totalItemCount: number
  tbmCount: number
}

interface HeatWaveProjectRow {
  project: Project
  check: HeatWaveCheck | null
}

const summarizeHeatWaveData = (
  projects: Project[],
  checks: HeatWaveCheck[],
  tbmInspections: TBMSafetyInspection[]
): Omit<HeatWaveAggregate, 'name'> => {
  const projectIds = new Set(projects.map(project => project.id))
  const projectChecks = checks.filter(check => projectIds.has(check.project_id))
  const latestCheckTime = projectChecks.reduce<string | null>((latest, check) => {
    if (!latest || new Date(check.check_time).getTime() > new Date(latest).getTime()) {
      return check.check_time
    }
    return latest
  }, null)

  return {
    targetProjectCount: projectIds.size,
    checkCount: projectChecks.length,
    latestCheckTime,
    maxFeelsLikeTemp: projectChecks.length > 0
      ? Math.max(...projectChecks.map(check => check.feels_like_temp))
      : null,
    completedItemCount: projectChecks.reduce(
      (total, check) => total + HEAT_WAVE_ITEM_KEYS.filter(key => check[key]).length,
      0
    ),
    totalItemCount: projectChecks.length * HEAT_WAVE_ITEM_KEYS.length,
    tbmCount: tbmInspections.filter(inspection => projectIds.has(inspection.project_id)).length
  }
}

const groupHeatWaveData = (
  projects: Project[],
  checks: HeatWaveCheck[],
  tbmInspections: TBMSafetyInspection[],
  groupBy: 'managing_hq' | 'managing_branch'
): HeatWaveAggregate[] => {
  const groups = new Map<string, Project[]>()

  projects.forEach(project => {
    const name = project[groupBy]
    if (!name) return
    groups.set(name, [...(groups.get(name) || []), project])
  })

  return Array.from(groups.entries()).map(([name, groupProjects]) => ({
    name,
    ...summarizeHeatWaveData(groupProjects, checks, tbmInspections)
  }))
}

const summarizeHeatWaveAggregates = (
  stats: HeatWaveAggregate[]
): Omit<HeatWaveAggregate, 'name'> | null => {
  if (stats.length === 0) return null

  return stats.reduce<Omit<HeatWaveAggregate, 'name'>>((summary, stat) => ({
    targetProjectCount: summary.targetProjectCount + stat.targetProjectCount,
    checkCount: summary.checkCount + stat.checkCount,
    latestCheckTime: stat.latestCheckTime === null
      ? summary.latestCheckTime
      : !summary.latestCheckTime || new Date(stat.latestCheckTime).getTime() > new Date(summary.latestCheckTime).getTime()
        ? stat.latestCheckTime
        : summary.latestCheckTime,
    maxFeelsLikeTemp: stat.maxFeelsLikeTemp === null
      ? summary.maxFeelsLikeTemp
      : Math.max(summary.maxFeelsLikeTemp ?? stat.maxFeelsLikeTemp, stat.maxFeelsLikeTemp),
    completedItemCount: summary.completedItemCount + stat.completedItemCount,
    totalItemCount: summary.totalItemCount + stat.totalItemCount,
    tbmCount: summary.tbmCount + stat.tbmCount
  }), {
    targetProjectCount: 0,
    checkCount: 0,
    latestCheckTime: null,
    maxFeelsLikeTemp: null,
    completedItemCount: 0,
    totalItemCount: 0,
    tbmCount: 0
  })
}

const formatCheckTime = (checkTime: string): string => (
  new Date(checkTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
)

interface HeatWaveAggregateTableProps {
  groupLabel: '본부' | '지사'
  stats: HeatWaveAggregate[]
  summary: Omit<HeatWaveAggregate, 'name'> | null
  onSelect: (name: string) => void
}

const HeatWaveAggregateTable: React.FC<HeatWaveAggregateTableProps> = ({
  groupLabel,
  stats,
  summary,
  onSelect
}) => (
  <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
    <table className="w-full divide-y divide-gray-200" style={{ minWidth: '880px' }}>
      <thead className="bg-gray-50">
        <tr>
          <th className="sticky left-0 z-20 bg-gray-50 px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 lg:w-[12%]">
            {groupLabel}
          </th>
          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider lg:w-[13%]">대상 프로젝트 수</th>
          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider lg:w-[13%]">금일 TBM</th>
          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider lg:w-[12%]">점검 건수</th>
          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider lg:w-[15%]">최근 점검시간</th>
          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider lg:w-[15%]">최고 체감온도</th>
          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider lg:w-[16%]">항목 이행 현황</th>
        </tr>
      </thead>
      <tbody className="bg-white divide-y divide-gray-200">
        {stats.length === 0 ? (
          <tr>
            <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
              데이터가 없습니다.
            </td>
          </tr>
        ) : (
          <>
            {summary && (
              <tr className="bg-blue-50 font-semibold border-b-2 border-blue-200">
                <td className="sticky left-0 z-10 bg-blue-50 px-4 py-3 whitespace-nowrap text-sm text-center font-bold text-blue-900 border-r border-blue-200 lg:w-[12%]">
                  소계({stats.length}{groupLabel})
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-center font-bold text-blue-900 lg:w-[13%]">
                  {summary.targetProjectCount}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-center font-bold text-blue-900 lg:w-[13%]">
                  {summary.tbmCount === 0 ? '-' : summary.tbmCount}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-center font-bold text-blue-900 lg:w-[12%]">
                  {summary.checkCount === 0 ? '-' : summary.checkCount}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-center font-bold text-blue-900 lg:w-[15%]">
                  {summary.latestCheckTime === null ? '-' : formatCheckTime(summary.latestCheckTime)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-center font-bold text-blue-900 lg:w-[15%]">
                  {summary.maxFeelsLikeTemp === null ? '-' : (
                    <>
                      {summary.maxFeelsLikeTemp}℃
                      <HeatWaveAlertBadge feelsLikeTemp={summary.maxFeelsLikeTemp} />
                    </>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-center font-bold text-blue-900 lg:w-[16%]">
                  {summary.totalItemCount === 0 ? '-' : `${summary.completedItemCount} / ${summary.totalItemCount}`}
                </td>
              </tr>
            )}
            {stats.map(stat => (
              <tr
                key={stat.name}
                onClick={() => onSelect(stat.name)}
                className="group hover:bg-gray-50 cursor-pointer"
              >
                <td className="sticky left-0 z-10 bg-white group-hover:bg-gray-50 px-4 py-3 whitespace-nowrap text-sm text-center font-medium text-gray-900 border-r border-gray-200 lg:w-[12%]">
                  {stat.name}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-center text-gray-900 lg:w-[13%]">
                  {stat.targetProjectCount}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-center text-gray-900 lg:w-[13%]">
                  {stat.tbmCount === 0 ? '-' : stat.tbmCount}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-center text-gray-900 lg:w-[12%]">
                  {stat.checkCount === 0 ? '-' : stat.checkCount}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-center text-gray-900 lg:w-[15%]">
                  {stat.latestCheckTime === null ? '-' : formatCheckTime(stat.latestCheckTime)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-center text-gray-900 lg:w-[15%]">
                  {stat.maxFeelsLikeTemp === null ? '-' : (
                    <>
                      {stat.maxFeelsLikeTemp}℃
                      <HeatWaveAlertBadge feelsLikeTemp={stat.maxFeelsLikeTemp} />
                    </>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-center text-gray-900 lg:w-[16%]">
                  {stat.totalItemCount === 0 ? '-' : `${stat.completedItemCount} / ${stat.totalItemCount}`}
                </td>
              </tr>
            ))}
          </>
        )}
      </tbody>
    </table>
  </div>
)

interface SafetyHeatwaveViewProps {
  loading: boolean
  projects: Project[]
  selectedDate: string
  selectedHq: string
  selectedBranch: string
  selectedSafetyHq: string | null
  selectedSafetyBranch: string | null
  heatWaveChecks: HeatWaveCheck[]
  tbmInspections: TBMSafetyInspection[]
  onBack: () => void
  onBackToHqLevel: () => void
  onBackToAllBranches: () => void
  onDateChange: (date: string) => void
  onSelectSafetyHq: (hq: string) => void
  onSelectSafetyBranch: (branch: string) => void
  onRowClick: (check: HeatWaveCheck) => void
  onRowClickProject: (projectId: string) => void
}

const SafetyHeatwaveView: React.FC<SafetyHeatwaveViewProps> = ({
  loading,
  projects,
  selectedDate,
  selectedHq,
  selectedBranch,
  selectedSafetyHq,
  selectedSafetyBranch,
  heatWaveChecks,
  tbmInspections,
  onBack,
  onBackToHqLevel,
  onBackToAllBranches,
  onDateChange,
  onSelectSafetyHq,
  onSelectSafetyBranch,
  onRowClick,
  onRowClickProject
}) => {
  const targetHq = selectedSafetyHq || selectedHq

  const activeProjects = React.useMemo(
    () => projects.filter(project => !isCompleted(project)),
    [projects]
  )

  const filteredTbmInspections = React.useMemo(() => {
    if (!selectedDate) return tbmInspections
    return tbmInspections.filter((inspection: TBMSafetyInspection) => {
      if (!inspection.tbm_date) return false
      const inspectionDate = new Date(inspection.tbm_date).toISOString().split('T')[0]
      return inspectionDate === selectedDate
    })
  }, [tbmInspections, selectedDate])

  const hqLevelProjects = React.useMemo(
    () => activeProjects.filter(project => {
      if (selectedSafetyHq && project.managing_hq !== selectedSafetyHq) return false
      if (selectedHq && project.managing_hq !== selectedHq) return false
      if (selectedBranch && project.managing_branch !== selectedBranch) return false
      return true
    }),
    [activeProjects, selectedSafetyHq, selectedHq, selectedBranch]
  )

  const branchStats = React.useMemo(() => {
    const stats = groupHeatWaveData(hqLevelProjects, heatWaveChecks, filteredTbmInspections, 'managing_branch')

    if (targetHq && BRANCH_OPTIONS[targetHq]) {
      const branchOrder = BRANCH_OPTIONS[targetHq]
      stats.sort((a, b) => {
        const aIndex = branchOrder.indexOf(a.name)
        const bIndex = branchOrder.indexOf(b.name)
        if (aIndex === -1 && bIndex === -1) return a.name.localeCompare(b.name, 'ko-KR')
        if (aIndex === -1) return 1
        if (bIndex === -1) return -1
        return aIndex - bIndex
      })
    }

    return stats
  }, [hqLevelProjects, heatWaveChecks, filteredTbmInspections, targetHq])

  const hqSummary = React.useMemo(
    () => summarizeHeatWaveAggregates(branchStats),
    [branchStats]
  )

  const allHqProjects = React.useMemo(
    () => activeProjects.filter(project => {
      if (selectedHq && project.managing_hq !== selectedHq) return false
      if (selectedBranch && project.managing_branch !== selectedBranch) return false
      return true
    }),
    [activeProjects, selectedHq, selectedBranch]
  )

  const hqStats = React.useMemo(() => {
    const stats = groupHeatWaveData(allHqProjects, heatWaveChecks, filteredTbmInspections, 'managing_hq')
    stats.sort((a, b) => {
      const aIndex = HEADQUARTERS_OPTIONS.indexOf(a.name as (typeof HEADQUARTERS_OPTIONS)[number])
      const bIndex = HEADQUARTERS_OPTIONS.indexOf(b.name as (typeof HEADQUARTERS_OPTIONS)[number])
      if (aIndex === -1 && bIndex === -1) return a.name.localeCompare(b.name, 'ko-KR')
      if (aIndex === -1) return 1
      if (bIndex === -1) return -1
      return aIndex - bIndex
    })
    return stats
  }, [allHqProjects, heatWaveChecks, filteredTbmInspections])

  const allHqSummary = React.useMemo(
    () => summarizeHeatWaveAggregates(hqStats),
    [hqStats]
  )

  const selectedBranchProjects = React.useMemo(() => {
    if (!selectedSafetyBranch) return []

    return activeProjects
      .filter(project => {
        if (selectedSafetyHq && project.managing_hq !== selectedSafetyHq) return false
        return project.managing_branch === selectedSafetyBranch
      })
      .sort((a, b) => {
        const aOrder = typeof a.display_order === 'number' ? a.display_order : Number.POSITIVE_INFINITY
        const bOrder = typeof b.display_order === 'number' ? b.display_order : Number.POSITIVE_INFINITY
        if (aOrder !== bOrder) return aOrder - bOrder
        return (a.project_name || '').localeCompare(b.project_name || '', 'ko-KR')
      })
  }, [activeProjects, selectedSafetyBranch, selectedSafetyHq])

  const projectHeatWaveRows = React.useMemo(
    () => selectedBranchProjects.flatMap<HeatWaveProjectRow>(project => {
      const projectChecks = heatWaveChecks.filter(check => check.project_id === project.id)
      if (projectChecks.length === 0) {
        return [{ project, check: null }]
      }
      return projectChecks.map(check => ({ project, check }))
    }),
    [selectedBranchProjects, heatWaveChecks]
  )

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="px-2 py-2 sm:px-6 sm:py-4 border-b border-gray-200 flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          안전현황으로 돌아가기
        </button>
        <div className="flex items-center space-x-2">
          <Calendar className="h-4 w-4 text-gray-500" />
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => onDateChange(e.target.value)}
            className="border border-gray-300 rounded-md px-2 py-1 text-sm focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      <div className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center mb-6">
          <Thermometer className="h-5 w-5 text-red-600 mr-2" />
          폭염 점검 현황
        </h3>

        {loading ? (
          <div className="flex justify-center items-center py-12">
            <LoadingSpinner />
          </div>
        ) : selectedSafetyBranch ? (
          <>
            <div className="mb-4 flex items-center justify-between">
              <button
                onClick={onBackToHqLevel}
                className="inline-flex items-center justify-center p-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 shadow-sm"
                title={`${selectedSafetyBranch} 지사로 돌아가기`}
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            </div>
            {selectedBranchProjects.length === 0 ? (
              <div className="text-center py-12">
                <Thermometer className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h4 className="text-lg font-medium text-gray-900 mb-2">
                  점검 데이터가 없습니다
                </h4>
                <p className="text-gray-600">
                  선택한 {selectedSafetyBranch} 지역의 선택한 날짜({selectedDate})에 등록된 폭염점검 결과가 없습니다.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-2 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <div className="sm:hidden" style={{ width: '80px', minWidth: '80px' }}>프로젝트</div>
                        <div className="hidden sm:block">프로젝트명</div>
                      </th>
                      <th className="px-2 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">측정시간</th>
                      <th className="px-2 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">체감온도</th>
                      <th className="px-2 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">물</th>
                      <th className="px-2 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">바람그늘</th>
                      <th className="px-2 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">휴식</th>
                      <th className="px-2 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">보냉장구</th>
                      <th className="px-2 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">응급조치</th>
                      <th className="px-2 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">작업시간조정</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {projectHeatWaveRows.map(({ project, check }) => (
                      <tr
                        key={`${project.id}-${check?.id || 'no-check'}`}
                        className="hover:bg-gray-50 cursor-pointer transition-colors"
                        onClick={() => check ? onRowClick(check) : onRowClickProject(project.id)}
                      >
                        <td className="px-2 py-2 sm:px-6 sm:py-4 text-sm font-medium text-blue-600 hover:text-blue-800">
                          <div className="sm:hidden flex flex-col" style={{ width: '80px', minWidth: '80px' }}>
                            <span className="font-medium">
                              {(project.project_name || '').length > 4 ? `${(project.project_name || '').substring(0, 4)}...` : (project.project_name || '미지정')}
                            </span>
                            <span className="text-xs text-gray-500">({project.managing_branch})</span>
                          </div>
                          <div className="hidden sm:flex flex-col">
                            <span className="font-medium break-words">{project.project_name || '미지정'}</span>
                            <span className="text-xs text-gray-500">({project.managing_branch})</span>
                          </div>
                        </td>
                        <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm text-gray-500">
                          {check
                            ? new Date(check.check_time).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
                            : '-'}
                        </td>
                        <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm text-gray-900">
                          {check ? (
                            <>
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                check.feels_like_temp >= 35 ? 'bg-red-100 text-red-800' :
                                check.feels_like_temp >= 30 ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'
                              }`}>
                                {check.feels_like_temp}℃
                              </span>
                              <HeatWaveAlertBadge feelsLikeTemp={check.feels_like_temp} />
                            </>
                          ) : '-'}
                        </td>
                        {HEAT_WAVE_ITEM_KEYS.map(key => (
                          <td key={key} className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm text-center">
                            {check ? (
                              <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium ${
                                check[key] ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                              }`}>
                                {check[key] ? 'O' : 'X'}
                              </span>
                            ) : '-'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : targetHq ? (
          <>
            <div className="mb-4 flex items-center justify-between">
              <button
                onClick={onBackToAllBranches}
                className="inline-flex items-center justify-center p-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 shadow-sm"
                title="전체 본부로 돌아가기"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            </div>
            <HeatWaveAggregateTable
              groupLabel="지사"
              stats={branchStats}
              summary={hqSummary}
              onSelect={onSelectSafetyBranch}
            />
          </>
        ) : (
          <HeatWaveAggregateTable
            groupLabel="본부"
            stats={hqStats}
            summary={allHqSummary}
            onSelect={onSelectSafetyHq}
          />
        )}
      </div>
    </div>
  )
}

export default SafetyHeatwaveView

