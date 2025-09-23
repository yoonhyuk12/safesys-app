'use client'

import React from 'react'
import { Thermometer, Calendar, ArrowLeft } from 'lucide-react'
import { type HeatWaveCheck, type Project } from '@/lib/projects'
import { type UserProfile } from '@/lib/supabase'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

interface HeatWaveStatusProps {
  userProfile: UserProfile
  selectedDate: string
  setSelectedDate: (date: string) => void
  selectedHq: string
  selectedBranch: string
  heatWaveChecks: HeatWaveCheck[]
  loading: boolean
  onHeatWaveCheckClick: (check: HeatWaveCheck) => void
  onBackClick: () => void
}

const HeatWaveStatus: React.FC<HeatWaveStatusProps> = ({
  userProfile,
  selectedDate,
  setSelectedDate,
  selectedHq,
  selectedBranch,
  heatWaveChecks,
  loading,
  onHeatWaveCheckClick,
  onBackClick
}) => {
  return (
    <div className="bg-white rounded-lg shadow-lg border border-gray-200">
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <button 
              onClick={onBackClick}
              className="flex items-center text-blue-600 hover:text-blue-800 transition-colors mr-4"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              안전현황으로 돌아가기
            </button>
            <h3 className="text-lg font-semibold text-gray-900 flex items-center">
              <Thermometer className="h-5 w-5 text-red-600 mr-2" />
              폭염대비 점검 현황
            </h3>
          </div>
          <div className="flex items-center space-x-2">
            <Calendar className="h-4 w-4 text-gray-500" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-1 text-sm focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      <div className="p-6">
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <LoadingSpinner />
          </div>
        ) : heatWaveChecks.length === 0 ? (
          <div className="text-center py-12">
            <Thermometer className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h4 className="text-lg font-medium text-gray-900 mb-2">
              폭염점검 결과가 없습니다
            </h4>
            <p className="text-gray-600">
              {selectedHq || selectedBranch 
                ? `선택한 ${selectedHq ? selectedHq + ' ' : ''}${selectedBranch ? selectedBranch + ' ' : ''}지역의 선택한 날짜(${selectedDate})에 등록된 폭염점검 결과가 없습니다.`
                : `선택한 날짜(${selectedDate})에 등록된 폭염점검 결과가 없습니다.`
              }
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">프로젝트명</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">본부</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">지사</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">체감온도</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">점검시간</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">점검자</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">종합</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {heatWaveChecks.map((check: HeatWaveCheck, index: number) => {
                  const passedItems = [
                    check.water_supply,
                    check.ventilation,
                    check.rest_time,
                    check.cooling_equipment,
                    check.emergency_care,
                    check.work_time_adjustment
                  ].filter(Boolean).length

                  const totalItems = 6
                  const passRate = (passedItems / totalItems * 100).toFixed(0)

                  return (
                    <tr 
                      key={check.id || index}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => onHeatWaveCheckClick(check)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {check.project_name}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{check.managing_hq}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{check.managing_branch}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className={`text-sm font-semibold ${
                          check.feels_like_temp >= 35 ? 'text-red-600' :
                          check.feels_like_temp >= 31 ? 'text-orange-600' :
                          'text-green-600'
                        }`}>
                          {check.feels_like_temp}°C
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {new Date(check.check_time).toLocaleString('ko-KR')}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">-</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          passedItems === totalItems
                            ? 'bg-green-100 text-green-800'
                            : passedItems >= totalItems * 0.7
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {passRate}% ({passedItems}/{totalItems})
                        </span>
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

export default HeatWaveStatus