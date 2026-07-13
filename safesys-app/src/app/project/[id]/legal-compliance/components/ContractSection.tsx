'use client'
// 도급사업 안전관리 의무사항 섹션 — 도급사업 해당='여'일 때만 렌더 (엑셀 시트2 T~AB열)

import type { LegalComplianceFormData, YN } from '../lib/constants'
import { CONTRACT_CHECK_ITEMS, TOOLTIPS } from '../lib/constants'
import { YNRow } from './YNToggle'

type ContractChecks = LegalComplianceFormData['contractChecks']

export default function ContractSection({
  value,
  onChange,
}: {
  value: ContractChecks
  onChange: (next: ContractChecks) => void
}) {
  const set = (k: keyof ContractChecks, v: YN) => onChange({ ...value, [k]: v })

  return (
    <div className="rounded-md border border-gray-200 p-2.5">
      {CONTRACT_CHECK_ITEMS.map((item) => (
        <YNRow
          key={item.key}
          label={item.label}
          period={item.period}
          tooltip={TOOLTIPS[item.tooltip]}
          value={value[item.key]}
          onChange={(v) => set(item.key, v)}
        />
      ))}
    </div>
  )
}
