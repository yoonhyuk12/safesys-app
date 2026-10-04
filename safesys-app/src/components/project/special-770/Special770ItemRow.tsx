// 굴삭기 점검표 항목 한 줄 — 판정 선택, 기타 위험요인 및 안전핀 증빙사진 입력
'use client'

import React from 'react'
import {
  SPECIAL_770_PIN_ITEM_CODE,
  type Special770Judgement,
  type Special770ItemResult,
} from '@/lib/special-inspection-770/types'
import Special770PhotoSlot from './Special770PhotoSlot'

const JUDGEMENTS: { value: Special770Judgement; active: string }[] = [
  { value: '적정', active: 'bg-green-100 text-green-800 border-green-300' },
  { value: '부적정', active: 'bg-red-100 text-red-800 border-red-300' },
  { value: '해당없음', active: 'bg-gray-100 text-gray-800 border-gray-300' },
]

const INPUT = 'block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm bg-white'

interface Special770ItemRowProps {
  projectId: string
  code: string
  text: string
  notes?: readonly string[]
  result: Special770ItemResult
  onItemChange: (patch: Partial<Special770ItemResult>) => void
  /** 기타 항목일 때 현장이 직접 적는 위험요인 */
  etcText?: { value: string; onChange: (value: string) => void }
  /** 안전핀 항목(3-1)일 때 굴착기 단위 증빙사진 */
  pinPhoto?: { url: string | null | undefined; onChange: (url: string | null) => void }
  readOnly?: boolean
}

export default function Special770ItemRow({
  projectId, code, text, notes, result, onItemChange, etcText, pinPhoto, readOnly,
}: Special770ItemRowProps) {
  return (
    <div className="py-3 space-y-3">
      <div className="flex flex-col md:flex-row md:items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-900">
            <span className="font-medium text-gray-500 mr-1">{code}</span>
            {text}
          </p>
          {notes && notes.length > 0 && (
            <div className="mt-1 text-xs text-gray-500 whitespace-pre-wrap">{notes.join('\n')}</div>
          )}
          {etcText && (
            <input
              type="text"
              value={etcText.value}
              onChange={e => etcText.onChange(e.target.value)}
              disabled={readOnly}
              placeholder="기타 위험요인을 입력하세요."
              className={`${INPUT} mt-2`}
            />
          )}
        </div>
        <div className="grid grid-cols-3 gap-1.5 md:w-64 shrink-0">
          {JUDGEMENTS.map(j => {
            const selected = result.judgement === j.value
            return (
              <button
                key={j.value}
                type="button"
                disabled={readOnly}
                onClick={() => onItemChange({ judgement: selected ? null : j.value })}
                className={`min-h-[44px] px-2 py-2 text-xs font-medium rounded-lg border transition-colors disabled:cursor-not-allowed ${selected ? j.active : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
              >
                {j.value}
              </button>
            )
          })}
        </div>
      </div>

      {code === SPECIAL_770_PIN_ITEM_CODE && pinPhoto && (
        <div className="max-w-xs">
          <Special770PhotoSlot
            projectId={projectId}
            url={pinPhoto.url}
            label="안전핀 증빙사진"
            tag="pin"
            onChange={pinPhoto.onChange}
            readOnly={readOnly}
          />
        </div>
      )}
    </div>
  )
}
