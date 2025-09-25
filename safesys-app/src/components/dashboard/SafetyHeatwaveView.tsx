'use client'

import React from 'react'
import { Thermometer, ChevronLeft, Calendar } from 'lucide-react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import type { HeatWaveCheck } from '@/lib/projects'

interface SafetyHeatwaveViewProps {
  loading: boolean
  selectedDate: string
  selectedHq: string
  selectedBranch: string
  selectedSafetyBranch: string | null
  heatWaveChecks: HeatWaveCheck[]
  onBack: () => void
  onDateChange: (date: string) => void
  onRowClick: (check: HeatWaveCheck) => void
}

const SafetyHeatwaveView: React.FC<SafetyHeatwaveViewProps> = ({
  loading,
  selectedDate,
  selectedHq,
  selectedBranch,
  selectedSafetyBranch,
  heatWaveChecks,
  onBack,
  onDateChange,
  onRowClick
}) => {
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
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <LoadingSpinner />
          </div>
        ) : (() => {
          const filteredHeatWaveChecks = heatWaveChecks
          return filteredHeatWaveChecks.length === 0 ? (
            <div className="text-center py-12">
              <Thermometer className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h4 className="text-lg font-medium text-gray-900 mb-2">
                점검 데이터가 없습니다
              </h4>
              <p className="text-gray-600">
                {selectedHq || selectedBranch 
                  ? `선택한 ${selectedHq ? selectedHq + ' ' : ''}${selectedBranch ? selectedBranch + ' ' : ''}지역의 선택한 날짜(${selectedDate})에 등록된 폭염점검 결과가 없습니다.`
                  : `선택한 날짜(${selectedDate})에 등록된 폭염점검 결과가 없습니다.`}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-2 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <div className="sm:hidden" style={{width: '80px', minWidth: '80px'}}>프로젝트</div>
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
                  {filteredHeatWaveChecks.map((check: HeatWaveCheck) => (
                    <tr 
                      key={check.id} 
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => onRowClick(check)}
                    >
                      <td className="px-2 py-2 sm:px-6 sm:py-4 text-sm font-medium text-blue-600 hover:text-blue-800">
                        <div className="sm:hidden flex flex-col" style={{width: '80px', minWidth: '80px'}}>
                          <span className="font-medium">
                            {(check.project_name || '').length > 4 ? `${(check.project_name || '').substring(0, 4)}...` : (check.project_name || '미지정')}
                          </span>
                          <span className="text-xs text-gray-500">({check.managing_branch})</span>
                        </div>
                        <div className="hidden sm:flex flex-col">
                          <span className="font-medium break-words">{check.project_name || '미지정'}</span>
                          <span className="text-xs text-gray-500">({check.managing_branch})</span>
                        </div>
                      </td>
                      <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(check.check_time).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}
                      </td>
                      <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm text-gray-900">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          check.feels_like_temp >= 35 ? 'bg-red-100 text-red-800' :
                          check.feels_like_temp >= 30 ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'
                        }`}>
                          {check.feels_like_temp}℃
                        </span>
                      </td>
                      {['water_supply','ventilation','rest_time','cooling_equipment','emergency_care','work_time_adjustment'].map((k) => (
                        <td key={k} className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm text-center">
                          <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium ${
                            (check as any)[k] ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {(check as any)[k] ? 'O' : 'X'}
                          </span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        })()}
      </div>
    </div>
  )
}

export default SafetyHeatwaveView


