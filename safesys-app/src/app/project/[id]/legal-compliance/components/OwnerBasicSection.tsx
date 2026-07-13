'use client'
// 안전활동 기본사항 섹션 — 발주자 대장·검토·조정자 항목별 여/부 (엑셀 T~AK열)

import { useState } from 'react'
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
  budgetBelowThreshold = false,
}: {
  value: OwnerBasic
  onChange: (next: OwnerBasic) => void
  budgetBelowThreshold?: boolean
}) {
  const [showLockModal, setShowLockModal] = useState(false)
  // 총공사비 50억 미만이면 대장(기본·설계·공사) 의무 비대상 → 해당여부 '부' 고정·전체 잠금
  const LEDGER_KEYS: ReadonlyArray<keyof OwnerBasic> = ['basicLedger', 'designLedger', 'constructionLedger']
  const isLedgerForcedNo = (itemKey: keyof OwnerBasic): boolean =>
    budgetBelowThreshold && LEDGER_KEYS.includes(itemKey)

  // 필드 비활성화 판정 — 50억 미만 대장 전체, 자기 항목 해당여부가 '부', '제공'은 직전 대장 해당여부가 '부'이면 잠금
  const isFieldLocked = (itemKey: keyof OwnerBasic, fieldKey: string): boolean => {
    if (isLedgerForcedNo(itemKey)) return true
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
        const forcedNo = isLedgerForcedNo(item.key)
        return (
          <div key={item.key} className="rounded-md border border-gray-200 p-2.5">
            <div className="mb-1.5 flex items-center gap-1">
              <span className="text-sm font-medium text-gray-800">{item.label}</span>
              {item.note && <span className="text-[10px] text-gray-400">{item.note}</span>}
              <InfoTooltip text={TOOLTIPS[item.tooltip]} />
            </div>
            <div className="relative flex flex-wrap gap-x-5 gap-y-2">
              {/* 50억 미만 잠금 시 토글 클릭을 가로채 안내 모달을 띄운다 */}
              {forcedNo && (
                <div
                  className="absolute inset-0 z-10 cursor-not-allowed"
                  onClick={() => setShowLockModal(true)}
                  aria-hidden
                />
              )}
              {item.fields.map((f) => {
                const locked = isFieldLocked(item.key, f.key)
                // 50억 미만 대장은 해당여부 '부'로, 나머지 필드는 빈 값으로 표시(저장값은 page 레벨에서 동기화)
                const shown: YN = forcedNo ? (f.key === 'applicable' ? '부' : '') : group[f.key] ?? ''
                return (
                  <div key={f.key} className={`flex items-center gap-2 ${locked ? 'opacity-40' : ''}`}>
                    <span className="text-xs text-gray-600">{f.label}</span>
                    <YNToggle
                      value={shown}
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

      {showLockModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setShowLockModal(false)}
        >
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-2 text-sm font-bold text-gray-900">안전보건대장 비활성화</h3>
            <p className="text-sm leading-relaxed text-gray-600">
              총공사금액이 50억원 이하로 비활성화되었습니다. 필요 시 공사금액(순공사비·자재대)을 50억원 이상으로 조정해주세요.
            </p>
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setShowLockModal(false)}
                className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
