'use client'
// 안전활동 기본사항 섹션 — 발주자 대장·검토·조정자 항목별 여/부 (엑셀 T~AK열)

import type { LegalComplianceFormData, YN } from '../lib/constants'
import { OWNER_BASIC_ITEMS, TOOLTIPS } from '../lib/constants'
import YNToggle from './YNToggle'
import InfoTooltip from './InfoTooltip'

type OwnerBasic = LegalComplianceFormData['ownerBasic']

// '제공(공문)' 필드는 직전 대장의 해당여부에 종속된다 (앞 단계 대장이 없으면 제공할 문서가 없음)
const PROVIDED_DEPENDS_ON: Partial<Record<keyof OwnerBasic, keyof OwnerBasic>> = {
  designLedger: 'basicLedger',
  constructionLedger: 'designLedger',
}
const NEXT_LEDGER: Partial<Record<keyof OwnerBasic, keyof OwnerBasic>> = {
  basicLedger: 'designLedger',
  designLedger: 'constructionLedger',
}

export default function OwnerBasicSection({
  value,
  onChange,
}: {
  value: OwnerBasic
  onChange: (next: OwnerBasic) => void
}) {
  // 필드 비활성화 판정 — 자기 항목 해당여부가 '부'이거나, '제공'은 직전 대장 해당여부가 '부'이면 잠금
  const isFieldLocked = (itemKey: keyof OwnerBasic, fieldKey: string): boolean => {
    if (fieldKey === 'applicable') return false
    if ((value[itemKey] as Record<string, YN>).applicable === '부') return true
    if (fieldKey === 'provided') {
      const dep = PROVIDED_DEPENDS_ON[itemKey]
      if (dep && (value[dep] as Record<string, YN>).applicable === '부') return true
    }
    return false
  }

  const setField = (itemKey: keyof OwnerBasic, fieldKey: string, v: YN) => {
    const group = value[itemKey] as Record<string, YN>
    const patch: Record<string, Record<string, YN>> = {}
    // 해당여부가 '부'면 종속 항목(이행·적정성·지정·통보 등)은 의미가 없어 비우고 비활성화한다
    if (fieldKey === 'applicable' && v === '부') {
      patch[itemKey] = Object.fromEntries(
        Object.keys(group).map((k): [string, YN] => [k, k === 'applicable' ? '부' : ''])
      )
      // 다음 대장의 '제공(공문)'도 근거가 사라지므로 초기화
      const next = NEXT_LEDGER[itemKey]
      if (next) patch[next] = { ...(value[next] as Record<string, YN>), provided: '' }
    } else {
      patch[itemKey] = { ...group, [fieldKey]: v }
    }
    onChange({ ...value, ...patch } as OwnerBasic)
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
              {item.fields.map((f) => {
                const locked = isFieldLocked(item.key, f.key)
                return (
                  <div key={f.key} className={`flex items-center gap-2 ${locked ? 'opacity-40' : ''}`}>
                    <span className="text-xs text-gray-600">{f.label}</span>
                    <YNToggle
                      value={group[f.key] ?? ''}
                      onChange={(v) => setField(item.key, f.key, v)}
                      disabled={locked}
                    />
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
