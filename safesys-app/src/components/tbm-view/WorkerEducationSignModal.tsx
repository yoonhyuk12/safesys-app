'use client'
// 근로자가 TBM 교육 확인 항목 체크·성명 입력 후 서명을 제출하는 모달

import { useState } from 'react'
import { X, PenTool } from 'lucide-react'
import WorkerSignaturePad from '@/components/ui/WorkerSignaturePad'

interface WorkerEducationSignModalProps {
  tbmId: string
  t: (key: string, fallback: string) => string
  onClose: () => void
  onSubmitted: () => void
}

const checkItems = [
  { id: 'tbm_confirmed', tKey: 'checkTbm', fallback: 'TBM·위험성평가 교육 내용을 확인했습니다' },
  { id: 'no_alcohol', tKey: 'checkAlcohol', fallback: '음주를 하지 않았습니다' },
  { id: 'blood_pressure_ok', tKey: 'checkBp', fallback: '혈압이 정상입니다 (수축기 150 미만)' },
  { id: 'ppe_worn', tKey: 'checkPpe', fallback: '보호구를 착용했습니다' },
  { id: 'cctv_consent', tKey: 'checkCctv', fallback: '안전관리 CCTV 촬영에 동의합니다' },
  { id: 'body_ok', tKey: 'checkBody', fallback: '몸(부상)에 이상이 없습니다' },
]

const initialChecks: Record<string, boolean> = checkItems.reduce(
  (acc, item) => ({ ...acc, [item.id]: false }),
  {}
)

export default function WorkerEducationSignModal({ tbmId, t, onClose, onSubmitted }: WorkerEducationSignModalProps) {
  const [checks, setChecks] = useState<Record<string, boolean>>(initialChecks)
  const [name, setName] = useState('')
  const [showPad, setShowPad] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const toggleCheck = (id: string) => {
    setChecks(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const allChecked = checkItems.every(item => checks[item.id])
  const canSubmit = allChecked && name.trim().length > 0

  const handleSave = async (signature: string) => {
    setIsSaving(true)
    try {
      const res = await fetch('/api/tbm-view/' + tbmId + '/signatures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worker_name: name.trim(), ...checks, signature }),
      })
      const json = await res.json()
      if (res.ok && json.success) {
        alert(t('signSuccess', '교육 확인 서명이 제출되었습니다.'))
        onSubmitted()
        onClose()
      } else {
        alert(json.error || '서명 제출 중 오류가 발생했습니다.')
        setShowPad(false)
      }
    } catch (err) {
      console.error('서명 제출 실패:', err)
      alert('서명 제출 중 오류가 발생했습니다.')
      setShowPad(false)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
          {/* 헤더 */}
          <div className="sticky top-0 flex items-center justify-between px-4 py-3 bg-blue-50 border-b border-blue-100">
            <h2 className="text-base font-semibold text-blue-700">
              ✍️ {t('signSection', '근로자 교육 확인 서명')}
            </h2>
            <button
              onClick={onClose}
              className="p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="px-4 py-4 space-y-4">
            {/* 체크 항목 */}
            <div className="rounded-xl border border-gray-200 overflow-hidden divide-y divide-gray-100">
              {checkItems.map(item => {
                const checked = checks[item.id]
                return (
                  <label
                    key={item.id}
                    className={`flex items-start gap-3 px-3 py-3 cursor-pointer transition-colors ${checked ? 'bg-blue-50' : 'bg-white hover:bg-gray-50'}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleCheck(item.id)}
                      className="mt-0.5 h-5 w-5 flex-shrink-0 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className={`text-sm leading-snug ${checked ? 'font-medium text-blue-800' : 'text-gray-800'}`}>
                      {t(item.tKey, item.fallback)}
                    </span>
                  </label>
                )
              })}
            </div>

            {/* 성명 입력 */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t('signNameLabel', '성명')}</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                maxLength={50}
                placeholder={t('signNamePlaceholder', '본인 이름을 입력하세요')}
                className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* 안내 주석 */}
            <div className="space-y-1">
              <p className="text-xs text-gray-500 leading-relaxed">
                {t('signBpNote', '※ 작업가능 혈압: 수축기 150미만, 단 의사 소견서 첨부 시 작업 가능(심혈관질환자 포함)')}
              </p>
              <p className="text-xs text-gray-500 leading-relaxed">
                {t('signCctvNote', '※ CCTV 촬영: 근로자 재해예방 목적의 안전관리 모니터링 CCTV 촬영(개인정보 보호법 제15조 1항)')}
              </p>
            </div>

            {/* 하단 버튼 */}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                {t('signCancel', '취소')}
              </button>
              <button
                type="button"
                onClick={() => setShowPad(true)}
                disabled={!canSubmit}
                className="flex-[2] px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                <PenTool className="h-4 w-4" />
                {t('signButton', '서명하기')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {showPad && (
        <WorkerSignaturePad
          onSave={handleSave}
          onCancel={() => setShowPad(false)}
          isSaving={isSaving}
        />
      )}
    </>
  )
}
