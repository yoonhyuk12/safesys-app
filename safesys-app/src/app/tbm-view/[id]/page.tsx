'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  Shield, AlertTriangle, Wrench, FileText,
  Clock, Users, Truck, AlertOctagon
} from 'lucide-react'

interface TBMViewData {
  id: string
  project_name: string
  meeting_date: string
  education_start_time?: string
  education_end_time?: string
  today_work?: string
  potential_risk_1?: string
  solution_1?: string
  potential_risk_2?: string
  solution_2?: string
  potential_risk_3?: string
  solution_3?: string
  main_risk_selection?: string
  main_risk_solution?: string
  risk_factor_1?: string
  risk_factor_2?: string
  risk_factor_3?: string
  other_remarks?: string
  personnel_count?: string
  equipment_input?: string
  risk_work_type?: string
}

export default function TBMViewPage() {
  const params = useParams()
  const id = params.id as string
  const [data, setData] = useState<TBMViewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/tbm-view/${id}`)
        if (!res.ok) {
          setError('데이터를 찾을 수 없습니다.')
          return
        }
        const json = await res.json()
        setData(json)
      } catch {
        setError('데이터를 불러오는 중 오류가 발생했습니다.')
      } finally {
        setLoading(false)
      }
    }
    if (id) fetchData()
  }, [id])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
          <p className="text-sm text-gray-500">교육 내용을 불러오는 중...</p>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <AlertTriangle className="h-8 w-8 text-red-500" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">데이터를 찾을 수 없습니다</h2>
          <p className="mt-2 text-sm text-gray-500">{error || 'QR 코드가 유효하지 않거나 만료되었습니다.'}</p>
        </div>
      </div>
    )
  }

  const hasRisks = data.potential_risk_1 || data.potential_risk_2 || data.potential_risk_3
  const hasRiskFactors = data.risk_factor_1 || data.risk_factor_2 || data.risk_factor_3

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <div className="bg-blue-600 text-white px-4 py-5">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <Shield className="h-7 w-7 flex-shrink-0" />
          <div>
            <p className="text-xs font-medium text-blue-200 uppercase tracking-wide">SafeSys</p>
            <h1 className="text-lg font-bold leading-tight">TBM 안전교육 내용</h1>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">

        {/* 기본정보 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 bg-blue-50 border-b border-blue-100">
            <FileText className="h-4 w-4 text-blue-600" />
            <h2 className="text-sm font-semibold text-blue-700">기본정보</h2>
          </div>
          <div className="px-4 py-4 space-y-3">
            <div>
              <p className="text-xs text-gray-500 mb-0.5">현장명</p>
              <p className="text-sm font-semibold text-gray-900">{data.project_name}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-gray-500 mb-0.5">교육일자</p>
                <p className="text-sm font-medium text-gray-900">{data.meeting_date}</p>
              </div>
              {(data.education_start_time || data.education_end_time) && (
                <div>
                  <div className="flex items-center gap-1 mb-0.5">
                    <Clock className="h-3 w-3 text-gray-400" />
                    <p className="text-xs text-gray-500">교육시간</p>
                  </div>
                  <p className="text-sm font-medium text-gray-900">
                    {data.education_start_time || '--'} ~ {data.education_end_time || '--'}
                  </p>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {data.personnel_count && (
                <div>
                  <div className="flex items-center gap-1 mb-0.5">
                    <Users className="h-3 w-3 text-gray-400" />
                    <p className="text-xs text-gray-500">투입 인원</p>
                  </div>
                  <p className="text-sm font-medium text-gray-900">{data.personnel_count}</p>
                </div>
              )}
              {data.equipment_input && (
                <div>
                  <div className="flex items-center gap-1 mb-0.5">
                    <Truck className="h-3 w-3 text-gray-400" />
                    <p className="text-xs text-gray-500">투입 장비</p>
                  </div>
                  <p className="text-sm font-medium text-gray-900">{data.equipment_input}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 금일 작업내용 */}
        {data.today_work && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-100">
              <Wrench className="h-4 w-4 text-gray-600" />
              <h2 className="text-sm font-semibold text-gray-700">금일 작업내용</h2>
            </div>
            <div className="px-4 py-4">
              <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{data.today_work}</p>
            </div>
          </div>
        )}

        {/* 잠재위험요인 */}
        {hasRisks && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 bg-orange-50 border-b border-orange-100">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              <h2 className="text-sm font-semibold text-orange-700">잠재위험요인 및 대책</h2>
            </div>
            <div className="px-4 py-4 space-y-3">
              {[
                { risk: data.potential_risk_1, solution: data.solution_1, num: 1 },
                { risk: data.potential_risk_2, solution: data.solution_2, num: 2 },
                { risk: data.potential_risk_3, solution: data.solution_3, num: 3 },
              ].filter(item => item.risk).map(item => (
                <div key={item.num} className="bg-orange-50 rounded-lg p-3">
                  <div className="flex items-start gap-2 mb-1.5">
                    <span className="flex-shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 text-white text-xs font-bold">
                      {item.num}
                    </span>
                    <p className="text-sm font-medium text-gray-900">{item.risk}</p>
                  </div>
                  {item.solution && (
                    <p className="text-sm text-orange-700 pl-7">→ {item.solution}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 중점위험요인 */}
        {(data.main_risk_selection || data.main_risk_solution) && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border-b border-red-100">
              <AlertOctagon className="h-4 w-4 text-red-500" />
              <h2 className="text-sm font-semibold text-red-700">중점위험요인</h2>
            </div>
            <div className="px-4 py-4 space-y-2">
              {data.main_risk_selection && (
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">위험요인</p>
                  <p className="text-sm font-medium text-gray-900">{data.main_risk_selection}</p>
                </div>
              )}
              {data.main_risk_solution && (
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">대책</p>
                  <p className="text-sm text-gray-800">{data.main_risk_solution}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 유해위험요소 */}
        {hasRiskFactors && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 bg-purple-50 border-b border-purple-100">
              <Shield className="h-4 w-4 text-purple-500" />
              <h2 className="text-sm font-semibold text-purple-700">유해위험요소</h2>
            </div>
            <div className="px-4 py-4 space-y-2">
              {[data.risk_factor_1, data.risk_factor_2, data.risk_factor_3]
                .filter(Boolean)
                .map((factor, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <span className="flex-shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-purple-100 text-purple-700 text-xs font-bold">
                      {idx + 1}
                    </span>
                    <p className="text-sm text-gray-800">{factor}</p>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* 기타 주의사항 */}
        {data.other_remarks && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 bg-green-50 border-b border-green-100">
              <FileText className="h-4 w-4 text-green-600" />
              <h2 className="text-sm font-semibold text-green-700">기타 주의사항</h2>
            </div>
            <div className="px-4 py-4">
              <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{data.other_remarks}</p>
            </div>
          </div>
        )}

        {/* 푸터 */}
        <div className="bg-green-600 rounded-xl px-4 py-5 text-center text-white">
          <p className="text-base font-bold">안전한 하루 되세요!</p>
          <p className="mt-1 text-xs text-green-200">SafeSys 안전관리시스템</p>
        </div>
      </div>
    </div>
  )
}
