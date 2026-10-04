// 굴삭기 특별점검 점검개요의 점검반·점검공종 입력 칸
'use client'

import React from 'react'
import type { Special770InspectionData } from '@/lib/special-inspection-770/types'
import type { Special770Setter } from './state'

const INPUT = 'block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm bg-white'

interface Special770OverviewProps {
  data: Special770InspectionData
  setData: Special770Setter
  readOnly?: boolean
}

export default function Special770Overview({ data, setData, readOnly }: Special770OverviewProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">점검반</label>
        <input
          type="text"
          value={data.inspection_team}
          onChange={e => {
            const value = e.target.value
            setData(prev => ({ ...prev, inspection_team: value }))
          }}
          disabled={readOnly}
          placeholder="예: 3급 홍길동, 4급 김철수"
          className={INPUT}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">점검공종</label>
        <input
          type="text"
          value={data.inspected_work ?? ''}
          onChange={e => {
            const value = e.target.value
            setData(prev => ({ ...prev, inspected_work: value }))
          }}
          disabled={readOnly}
          placeholder="예: 토공(터파기), 관로 부설"
          className={INPUT}
        />
      </div>
    </div>
  )
}
