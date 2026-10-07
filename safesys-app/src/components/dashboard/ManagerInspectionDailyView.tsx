// 관리자 점검 현황을 점검일자별로 묶어 지사·프로젝트·점검자를 보여주는 표 컴포넌트
'use client'

import React from 'react'
import { CalendarDays } from 'lucide-react'
import type { Project, ManagerInspection } from '@/lib/projects'

interface ManagerInspectionDailyViewProps {
  inspections: ManagerInspection[]
  projects: Project[]
  onRowClick: (projectId: string) => void
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

// 'YYYY-MM-DD'(또는 ISO) 앞 10자리를 날짜 키로 쓴다(시간대 변환으로 하루 밀리지 않게).
const toDateKey = (date: string): string => (date || '').slice(0, 10)

const formatDateLabel = (key: string): string => {
  const [y, m, d] = key.split('-').map((v) => parseInt(v, 10))
  if (!y || !m || !d) return key || '-'
  const weekday = WEEKDAYS[new Date(y, m - 1, d).getDay()]
  return `${y}. ${m}. ${d}. (${weekday})`
}

function ManagerInspectionDailyView({ inspections, projects, onRowClick }: ManagerInspectionDailyViewProps) {
  const projectMap = new Map(projects.map((p) => [p.id, p]))

  const groups = inspections.reduce<Map<string, ManagerInspection[]>>((acc, ins) => {
    const key = toDateKey(ins.inspection_date)
    return new Map(acc).set(key, [...(acc.get(key) || []), ins])
  }, new Map())

  const sortedKeys = [...groups.keys()].sort((a, b) => b.localeCompare(a))

  if (sortedKeys.length === 0) {
    return (
      <div className="text-center py-12">
        <CalendarDays className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h4 className="text-lg font-medium text-gray-900 mb-2">점검 데이터가 없습니다</h4>
        <p className="text-gray-600">선택한 분기에 등록된 관리자 점검 결과가 없습니다.</p>
      </div>
    )
  }

  const thClass = 'px-3 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap'
  const tdClass = 'px-3 py-2 sm:px-6 sm:py-3 whitespace-nowrap text-sm text-gray-700 border-r border-gray-200 text-center'

  return (
    <div className="overflow-x-auto -mx-6 sm:mx-0">
      <div className="overflow-y-auto" style={{ maxHeight: '70vh' }}>
        <table className="divide-y divide-gray-200 sm:w-full" style={{ minWidth: '550px' }}>
          <thead className="bg-gray-50 sticky top-0 z-30">
            <tr>
              <th className={thClass}>점검일자</th>
              <th className={thClass}>건수</th>
              <th className={thClass}>지사</th>
              <th className={thClass}>프로젝트명</th>
              <th className="px-3 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">점검자</th>
            </tr>
            <tr className="bg-blue-50 font-semibold border-b-2 border-blue-200">
              <th className="px-3 py-3 sm:px-6 sm:py-4 text-sm font-bold text-blue-900 border-r border-blue-200 text-center whitespace-nowrap">소계 ({sortedKeys.length}일)</th>
              <th className="px-3 py-3 sm:px-6 sm:py-4 text-sm font-bold text-blue-900 border-r border-blue-200 text-center whitespace-nowrap">{inspections.length}건</th>
              <th className="px-3 py-3 sm:px-6 sm:py-4 text-sm font-bold text-blue-900 border-r border-blue-200 text-center whitespace-nowrap">-</th>
              <th className="px-3 py-3 sm:px-6 sm:py-4 text-sm font-bold text-blue-900 border-r border-blue-200 text-center whitespace-nowrap">-</th>
              <th className="px-3 py-3 sm:px-6 sm:py-4 text-sm font-bold text-blue-900 text-center whitespace-nowrap">-</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedKeys.map((key) => {
              const dayInspections = [...(groups.get(key) || [])].sort((a, b) =>
                (a.managing_branch || '').localeCompare(b.managing_branch || '', 'ko-KR')
              )
              return dayInspections.map((ins, idx) => {
                const project = projectMap.get(ins.project_id)
                const projectName = project?.project_name || ins.project_name || '미지정'
                return (
                  <tr key={ins.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => onRowClick(ins.project_id)}>
                    {idx === 0 && (
                      <>
                        <td rowSpan={dayInspections.length} className={`${tdClass} font-medium text-gray-900 bg-white align-middle`}>
                          {formatDateLabel(key)}
                        </td>
                        <td rowSpan={dayInspections.length} className={`${tdClass} bg-white align-middle`}>
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">{dayInspections.length}건</span>
                        </td>
                      </>
                    )}
                    <td className={tdClass}>{ins.managing_branch || project?.managing_branch || '-'}</td>
                    <td className={`${tdClass} font-medium text-blue-600`}>{projectName}</td>
                    <td className="px-3 py-2 sm:px-6 sm:py-3 whitespace-nowrap text-sm text-gray-700 text-center">{ins.inspector_name || '-'}</td>
                  </tr>
                )
              })
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default ManagerInspectionDailyView
