import React from 'react'
import { ShieldCheck } from 'lucide-react'
import type { SafetyEquipmentData } from './types'
import { SAFETY_EQUIPMENT_OPTIONS } from './types'

interface SafetyPledgeProps {
  siteName: string
  safetyEquipment: SafetyEquipmentData
  setSafetyEquipment: (data: SafetyEquipmentData) => void
  agreeSafetyPledge: boolean
  setAgreeSafetyPledge: (v: boolean) => void
}

export default function SafetyPledge({
  siteName,
  safetyEquipment,
  setSafetyEquipment,
  agreeSafetyPledge,
  setAgreeSafetyPledge,
}: SafetyPledgeProps) {
  const toggleEquipment = (item: string) => {
    const current = safetyEquipment.items
    if (current.includes(item)) {
      setSafetyEquipment({ ...safetyEquipment, items: current.filter(v => v !== item) })
    } else {
      setSafetyEquipment({ ...safetyEquipment, items: [...current, item] })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 p-3 bg-orange-50 rounded-lg">
        <ShieldCheck className="h-8 w-8 text-orange-600 flex-shrink-0" />
        <div>
          <p className="font-medium text-gray-900">안전서약서 · 안전보호구 수령</p>
          <p className="text-sm text-gray-600">안전규정 서약 및 보호구 수령을 확인합니다</p>
        </div>
      </div>

      {/* 안전보건관리규정 서약 */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
          <p className="font-medium text-gray-900 text-sm">안전보건관리규정 서약</p>
        </div>
        <div className="p-3 text-xs text-gray-600 max-h-56 overflow-y-auto space-y-2 leading-relaxed">
          <p>본인은 <strong>{siteName || '(현장명)'}</strong> 건설현장에서 근무함에 있어 다음 사항을 준수할 것을 서약합니다.</p>

          <p className="font-semibold text-gray-800 mt-3">[금지 항목]</p>
          <ul className="list-disc pl-4 space-y-1">
            <li>안전모, 안전화 등 개인보호구 미착용 상태에서의 작업 금지</li>
            <li>작업 중 음주, 흡연 행위 금지 (지정 흡연구역 제외)</li>
            <li>안전시설물 및 방호장치 임의 해체, 변경 금지</li>
            <li>지정된 통로 외 통행 금지 및 위험구역 무단 출입 금지</li>
            <li>작업계획서에 명시되지 않은 위험작업 임의 실시 금지</li>
          </ul>

          <p className="font-semibold text-gray-800 mt-3">[성실 이행 사항]</p>
          <ul className="list-disc pl-4 space-y-1">
            <li>작업 전 안전점검(TBM) 참여 및 안전수칙 준수</li>
            <li>안전관리자의 지시 및 안전교육에 성실히 참여</li>
            <li>위험요인 발견 시 즉시 보고 및 작업 중지</li>
            <li>응급상황 발생 시 정해진 비상대피 절차 준수</li>
            <li>현장 출입 시 신분확인 절차 이행</li>
          </ul>

          <p className="font-semibold text-gray-800 mt-3">[책임과 의무]</p>
          <ul className="list-disc pl-4 space-y-1">
            <li>산업안전보건법 등 관계 법령 준수</li>
            <li>안전보건관리규정 위반 시 현장 퇴거 등 조치에 이의를 제기하지 않음</li>
            <li>위반행위로 인한 산업재해 발생 시 관련 법률에 따른 책임을 질 것을 서약합니다</li>
          </ul>
        </div>
      </div>

      {/* 안전보호구 수령 */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
          <p className="font-medium text-gray-900 text-sm">안전보호구 수령 확인</p>
        </div>
        <div className="p-3">
          <p className="text-xs text-gray-500 mb-3">지급받은 안전보호구를 모두 선택해주세요</p>
          <div className="flex flex-wrap gap-2">
            {SAFETY_EQUIPMENT_OPTIONS.map(item => (
              <button key={item} type="button" onClick={() => toggleEquipment(item)}
                className={`px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                  safetyEquipment.items.includes(item)
                    ? 'bg-orange-100 text-orange-700 border-orange-300'
                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}>
                {item}
              </button>
            ))}
          </div>
          {safetyEquipment.items.includes('기타') && (
            <input type="text" value={safetyEquipment.other}
              onChange={e => setSafetyEquipment({ ...safetyEquipment, other: e.target.value })}
              className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="기타 보호구 입력" />
          )}
        </div>
      </div>

      {/* 서약 동의 */}
      <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" checked={agreeSafetyPledge} onChange={(e) => setAgreeSafetyPledge(e.target.checked)}
            className="w-5 h-5 mt-0.5 text-orange-600 border-gray-300 rounded focus:ring-orange-500" />
          <span className="text-sm font-medium text-gray-900 leading-relaxed">
            위 안전보건관리규정을 준수하고, 안전보호구를 수령하였음을 확인하며, 서약에 동의합니다.
          </span>
        </label>
      </div>
    </div>
  )
}
