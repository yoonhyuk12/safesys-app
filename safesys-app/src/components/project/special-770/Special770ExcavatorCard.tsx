// 굴착기 한 대의 점검표 카드 — 차량번호와 대분류별 15항목 + 기타 판정 입력
'use client'

import React from 'react'
import {
  SPECIAL_770_CATEGORIES,
  SPECIAL_770_CHECKLIST,
  SPECIAL_770_ETC_CODE,
  type Special770Excavator,
} from '@/lib/special-inspection-770/types'
import { excavatorStats } from '@/lib/special-inspection-770/summary'
import Special770ItemRow from './Special770ItemRow'
import { updateExcavator, updateItem, type Special770Setter } from './state'

interface Special770ExcavatorCardProps {
  projectId: string
  index: number
  excavator: Special770Excavator
  setData: Special770Setter
  readOnly?: boolean
}

export default function Special770ExcavatorCard({ projectId, index, excavator, setData, readOnly }: Special770ExcavatorCardProps) {
  const stats = excavatorStats(excavator)
  const resultOf = (code: string) => excavator.items?.[code] ?? { judgement: null }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 mb-1">굴착기 {index + 1} · 차량번호</label>
          <input
            type="text"
            value={excavator.vehicle_no}
            onChange={e => {
              const value = e.target.value
              setData(prev => updateExcavator(prev, excavator.id, { vehicle_no: value }))
            }}
            disabled={readOnly}
            placeholder="건설기계 등록번호 (예: 경기04가1234)"
            className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm bg-white"
          />
        </div>
        <div className="flex items-center gap-2">
          {stats.findings > 0 ? (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">지적 {stats.findings}건</span>
          ) : (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">지적 없음</span>
          )}
        </div>
      </div>

      <div className="px-4 py-2">
        {SPECIAL_770_CATEGORIES.map(category => {
          const items = SPECIAL_770_CHECKLIST.filter(item => item.category === category.no)
          return (
            <div key={category.no} className="py-2">
              <h4 className="text-sm font-semibold text-gray-900 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                {category.no}. {category.title}
              </h4>
              <div className="divide-y divide-gray-100">
                {items.map(item => (
                  <Special770ItemRow
                    key={item.code}
                    projectId={projectId}
                    code={item.code}
                    text={item.text}
                    notes={item.notes}
                    result={resultOf(item.code)}
                    onItemChange={patch => setData(prev => updateItem(prev, excavator.id, item.code, patch))}
                    pinPhoto={{
                      url: excavator.pin_photo_url,
                      onChange: url => setData(prev => updateExcavator(prev, excavator.id, { pin_photo_url: url })),
                    }}
                    readOnly={readOnly}
                  />
                ))}
                {category.no === 4 && (
                  <Special770ItemRow
                    projectId={projectId}
                    code={SPECIAL_770_ETC_CODE}
                    text="기타 점검 사항"
                    result={resultOf(SPECIAL_770_ETC_CODE)}
                    onItemChange={patch => setData(prev => updateItem(prev, excavator.id, SPECIAL_770_ETC_CODE, patch))}
                    etcText={{
                      value: excavator.etc_text ?? '',
                      onChange: value => setData(prev => updateExcavator(prev, excavator.id, { etc_text: value })),
                    }}
                    readOnly={readOnly}
                  />
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
