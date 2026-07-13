'use client'
// 안전활동 기본사항 섹션 — 발주자 대장·검토·조정자 항목별 여/부 (엑셀 T~AK열)

import type { LegalComplianceFormData, YN } from '../lib/constants'
import { OWNER_BASIC_ITEMS, TOOLTIPS } from '../lib/constants'
import YNToggle from './YNToggle'
import InfoTooltip from './InfoTooltip'

type OwnerBasic = LegalComplianceFormData['ownerBasic']

export default function OwnerBasicSection({
  value,
  onChange,
}: {
  value: OwnerBasic
  onChange: (next: OwnerBasic) => void
}) {
  const setField = (itemKey: keyof OwnerBasic, fieldKey: string, v: YN) => {
    const group = value[itemKey] as Record<string, YN>
    onChange({ ...value, [itemKey]: { ...group, [fieldKey]: v } })
  }

  return (
    <div className="space-y-2.5">
      {OWNER_BASIC_ITEMS.map((item) => {
        const group = value[item.key] as Record<string, YN>
        return (
          <div key={item.key} className="rounded-md border border-gray-200 p-2.5">
            <div className="mb-1.5 flex items-center gap-1">
              <span className="text-sm font-medium text-gray-800">{item.label}</span>
              {item.note && <span className="text-[10px] text-gray-400">{item.note}</span>}
              <InfoTooltip text={TOOLTIPS[item.tooltip]} />
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {item.fields.map((f) => (
                <div key={f.key} className="flex items-center gap-2">
                  <span className="text-xs text-gray-600">{f.label}</span>
                  <YNToggle value={group[f.key] ?? ''} onChange={(v) => setField(item.key, f.key, v)} />
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
