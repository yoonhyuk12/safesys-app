import React from 'react'
import { Heart } from 'lucide-react'
import type { HealthQuestionnaireData } from './types'
import { DISEASE_OPTIONS, SYMPTOM_OPTIONS } from './types'

interface HealthQuestionnaireProps {
  workerName: string
  workerBirthDate: string
  healthData: HealthQuestionnaireData
  setHealthData: (data: HealthQuestionnaireData) => void
}

export default function HealthQuestionnaire({
  workerName,
  workerBirthDate,
  healthData,
  setHealthData,
}: HealthQuestionnaireProps) {
  const update = (partial: Partial<HealthQuestionnaireData>) => {
    setHealthData({ ...healthData, ...partial })
  }

  const toggleArrayItem = (field: 'diseases' | 'recent_symptoms', item: string) => {
    const current = healthData[field]
    if (item === '없음') {
      update({ [field]: current.includes('없음') ? [] : ['없음'] })
    } else {
      const without = current.filter(v => v !== '없음')
      if (without.includes(item)) {
        update({ [field]: without.filter(v => v !== item) })
      } else {
        update({ [field]: [...without, item] })
      }
    }
  }

  // 전화번호 자동 포맷
  const formatPhone = (value: string) => {
    const nums = value.replace(/[^\d]/g, '').slice(0, 11)
    if (nums.length <= 3) return nums
    if (nums.length <= 7) return `${nums.slice(0, 3)}-${nums.slice(3)}`
    return `${nums.slice(0, 3)}-${nums.slice(3, 7)}-${nums.slice(7)}`
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
        <Heart className="h-8 w-8 text-green-600 flex-shrink-0" />
        <div>
          <p className="font-medium text-gray-900">건강 · 안전 문진표</p>
          <p className="text-sm text-gray-600">건강상태를 정확히 기입해주세요</p>
        </div>
      </div>

      {/* 성명/생년월일 (읽기전용) */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">성명</label>
          <div className="px-3 py-2 bg-gray-100 rounded-lg text-sm text-gray-700">{workerName || '-'}</div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">생년월일</label>
          <div className="px-3 py-2 bg-gray-100 rounded-lg text-sm text-gray-700">{workerBirthDate || '-'}</div>
        </div>
      </div>

      {/* 주소 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">주소</label>
        <input type="text" value={healthData.address} onChange={e => update({ address: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="거주지 주소" />
      </div>

      {/* 연락처 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">연락처</label>
        <input type="tel" value={healthData.phone} onChange={e => update({ phone: formatPhone(e.target.value) })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="010-1234-5678" />
      </div>

      {/* 혈액형 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">혈액형</label>
        <div className="flex gap-2">
          <div className="flex border border-gray-300 rounded-lg overflow-hidden flex-1">
            {['A', 'B', 'O', 'AB'].map(t => (
              <button key={t} type="button" onClick={() => update({ blood_type: t })}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${healthData.blood_type === t ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>
                {t}
              </button>
            ))}
          </div>
          <div className="flex border border-gray-300 rounded-lg overflow-hidden">
            {['+', '-'].map(r => (
              <button key={r} type="button" onClick={() => update({ blood_rh: r })}
                className={`px-4 py-2 text-sm font-medium transition-colors ${healthData.blood_rh === r ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>
                RH{r}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 비상연락처 */}
      <div className="border border-gray-200 rounded-lg p-3 space-y-2">
        <p className="text-sm font-medium text-gray-700">비상연락처</p>
        <div className="grid grid-cols-3 gap-2">
          <input type="text" value={healthData.emergency_contact_name} onChange={e => update({ emergency_contact_name: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="성명" />
          <input type="text" value={healthData.emergency_contact_relation} onChange={e => update({ emergency_contact_relation: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="관계" />
          <input type="tel" value={healthData.emergency_contact_phone} onChange={e => update({ emergency_contact_phone: formatPhone(e.target.value) })}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="연락처" />
        </div>
      </div>

      {/* 질환이력 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">질환이력</label>
        <div className="flex flex-wrap gap-2">
          {DISEASE_OPTIONS.map(d => (
            <button key={d} type="button" onClick={() => toggleArrayItem('diseases', d)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                healthData.diseases.includes(d) ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}>
              {d}
            </button>
          ))}
        </div>
        {healthData.diseases.includes('기타') && (
          <input type="text" value={healthData.disease_other} onChange={e => update({ disease_other: e.target.value })}
            className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="기타 질환 입력" />
        )}
      </div>

      {/* 수술/입원 이력 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">수술 · 입원 이력</label>
        <div className="flex gap-2">
          {['없음', '있음'].map(v => (
            <button key={v} type="button" onClick={() => update({ surgery_history: v })}
              className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${
                healthData.surgery_history === v ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}>
              {v}
            </button>
          ))}
        </div>
        {healthData.surgery_history === '있음' && (
          <input type="text" value={healthData.surgery_detail} onChange={e => update({ surgery_detail: e.target.value })}
            className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="상세 내용 입력" />
        )}
      </div>

      {/* 최근 증상 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">최근 이상 증상</label>
        <div className="flex flex-wrap gap-2">
          {SYMPTOM_OPTIONS.map(s => (
            <button key={s} type="button" onClick={() => toggleArrayItem('recent_symptoms', s)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                healthData.recent_symptoms.includes(s) ? 'bg-orange-100 text-orange-700 border-orange-300' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* AED 동의 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">심정지 시 AED(자동심장충격기) 사용 동의</label>
        <div className="flex gap-2">
          {['동의', '미동의'].map(v => (
            <button key={v} type="button" onClick={() => update({ aed_consent: v })}
              className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${
                healthData.aed_consent === v ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}>
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* 산업재해 경험 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">산업재해 경험</label>
        <div className="flex gap-2">
          {['없음', '있음'].map(v => (
            <button key={v} type="button" onClick={() => update({ accident_history: v })}
              className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${
                healthData.accident_history === v ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}>
              {v}
            </button>
          ))}
        </div>
        {healthData.accident_history === '있음' && (
          <div className="grid grid-cols-2 gap-2 mt-2">
            <input type="text" value={healthData.accident_body_part} onChange={e => update({ accident_body_part: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="부위" />
            <input type="text" value={healthData.accident_date} onChange={e => update({ accident_date: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="시기 (예: 2024년)" />
          </div>
        )}
      </div>

      {/* 흡연 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">흡연량 (1일)</label>
        <div className="flex flex-wrap gap-2">
          {['없음', '반갑미만', '반갑~한갑', '한갑이상'].map(v => (
            <button key={v} type="button" onClick={() => update({ smoking: v })}
              className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                healthData.smoking === v ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}>
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* 음주 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">음주 횟수</label>
        <div className="flex flex-wrap gap-2">
          {['없음', '월1~3회', '주4~6회', '매일'].map(v => (
            <button key={v} type="button" onClick={() => update({ drinking_frequency: v })}
              className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                healthData.drinking_frequency === v ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}>
              {v}
            </button>
          ))}
        </div>
        {healthData.drinking_frequency !== '없음' && (
          <input type="text" value={healthData.drinking_amount} onChange={e => update({ drinking_amount: e.target.value })}
            className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="1일 음주량 (예: 소주 1병)" />
        )}
      </div>
    </div>
  )
}
