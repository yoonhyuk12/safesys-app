'use client'
// 여/부 2값 세그먼트 토글(여=파랑, 부=빨강, 미선택=회색 테두리)과 라벨 행 헬퍼

import type { YN } from '../lib/constants'
import InfoTooltip from './InfoTooltip'

export default function YNToggle({ value, onChange }: { value: YN; onChange: (v: YN) => void }) {
  const base = 'px-3 py-1 text-xs font-medium border transition-colors'
  return (
    <span className="inline-flex shrink-0">
      {/* 같은 값을 다시 누르면 미기재('')로 되돌린다 */}
      <button
        type="button"
        onClick={() => onChange(value === '여' ? '' : '여')}
        className={`${base} rounded-l-md ${value === '여' ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 bg-white text-gray-500'}`}
      >
        여
      </button>
      <button
        type="button"
        onClick={() => onChange(value === '부' ? '' : '부')}
        className={`${base} -ml-px rounded-r-md ${value === '부' ? 'border-red-500 bg-red-500 text-white' : 'border-gray-300 bg-white text-gray-500'}`}
      >
        부
      </button>
    </span>
  )
}

// 라벨 + (주기) + 근거법령 툴팁 + 여/부 토글로 이루어진 한 줄 행
export function YNRow({
  label,
  period,
  tooltip,
  value,
  onChange,
}: {
  label: string
  period?: string
  tooltip?: string
  value: YN
  onChange: (v: YN) => void
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-gray-100 py-1.5 last:border-0">
      <div className="flex min-w-0 items-center gap-1">
        <span className="text-xs text-gray-700">{label}</span>
        {period && <span className="text-[10px] text-gray-400">({period})</span>}
        {tooltip && <InfoTooltip text={tooltip} />}
      </div>
      <YNToggle value={value} onChange={onChange} />
    </div>
  )
}
