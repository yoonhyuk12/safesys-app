'use client'
// 안전활동 세부사항 섹션 — 위험공종 작업허가제·조정자 활동·위험성평가·스마트 안전장비 등 (엑셀 AL~BQ열)

import type { ReactNode } from 'react'
import type { LegalComplianceFormData, YN } from '../lib/constants'
import {
  COORDINATOR_ACTIVITY_FIELDS,
  OWNER_DETAIL_SIMPLE,
  RISK_ASSESSMENT_FIELDS,
  RISK_WORK_TYPES,
  TOOLTIPS,
  formatThousands,
  stripNonDigits,
} from '../lib/constants'
import YNToggle, { YNRow } from './YNToggle'
import InfoTooltip from './InfoTooltip'

type Detail = LegalComplianceFormData['ownerDetail']

function SubCard({ title, tooltip, children }: { title: string; tooltip?: string; children: ReactNode }) {
  return (
    <div className="rounded-md border border-gray-200 p-2.5">
      <div className="mb-1.5 flex items-center gap-1">
        <span className="text-sm font-medium text-gray-800">{title}</span>
        {tooltip && <InfoTooltip text={tooltip} />}
      </div>
      {children}
    </div>
  )
}

const numInput =
  'w-28 rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none'

export default function OwnerDetailSection({
  value,
  onChange,
}: {
  value: Detail
  onChange: (next: Detail) => void
}) {
  const setSimple = (k: string, v: YN) => onChange({ ...value, [k]: v } as Detail)
  const setRisk = (fieldKey: string, v: YN) =>
    onChange({ ...value, riskAssessment: { ...value.riskAssessment, [fieldKey]: v } })
  // 조정자 활동 — 복합공종 시행여부가 '부'면 회의·합동점검은 의미가 없어 비운다
  const setCoordinator = (fieldKey: string, v: YN) => {
    const next: Detail['coordinatorActivity'] =
      fieldKey === 'multiDiscipline' && v === '부'
        ? { multiDiscipline: '부', meeting: '', jointInspection: '' }
        : { ...value.coordinatorActivity, [fieldKey]: v }
    onChange({ ...value, coordinatorActivity: next })
  }
  // 이행점검회의 — 해당여부가 '부'면 이행여부는 의미가 없어 비운다
  const setImplMeeting = (fieldKey: 'applicable' | 'implemented', v: YN) => {
    const next =
      fieldKey === 'applicable' && v === '부'
        ? { applicable: '부' as YN, implemented: '' as YN }
        : { ...value.implMeeting, [fieldKey]: v }
    onChange({ ...value, implMeeting: next })
  }
  const setPermit = (patch: Partial<Detail['riskWorkPermit']>) =>
    onChange({ ...value, riskWorkPermit: { ...value.riskWorkPermit, ...patch } })
  const toggleWork = (w: string) => {
    const cur = value.riskWorkPermit.targetWorks
    setPermit({ targetWorks: cur.includes(w) ? cur.filter((x) => x !== w) : [...cur, w] })
  }
  const setSmart = (patch: Partial<Detail['smartEquipment']>) =>
    onChange({ ...value, smartEquipment: { ...value.smartEquipment, ...patch } })

  // 해당여부·도입여부가 '부'면 종속 항목 비활성화
  const permitLocked = value.riskWorkPermit.applicable === '부'
  const smartLocked = value.smartEquipment.adopted === '부'
  const lockedInput = smartLocked ? 'cursor-not-allowed bg-gray-50 text-gray-400' : ''

  return (
    <div className="space-y-2.5">
      {/* 단일 여/부 항목 */}
      <div className="rounded-md border border-gray-200 p-2.5">
        {OWNER_DETAIL_SIMPLE.map((item) => (
          <YNRow
            key={item.key}
            label={item.label}
            period={item.period}
            tooltip={TOOLTIPS[item.tooltip]}
            value={value[item.key] as YN}
            onChange={(v) => setSimple(item.key, v)}
          />
        ))}
      </div>

      {/* 위험공종 작업허가제 */}
      <SubCard title="위험공종 작업허가제" tooltip={TOOLTIPS.riskWorkPermit}>
        <YNRow
          label="해당여부"
          value={value.riskWorkPermit.applicable}
          onChange={(v) =>
            setPermit(v === '부' ? { applicable: v, targetWorks: [], planConfirmed: '' } : { applicable: v })
          }
        />
        <div className={`py-2 ${permitLocked ? 'opacity-40' : ''}`}>
          <div className="mb-1 text-xs text-gray-600">해당공종 (다중 선택)</div>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {RISK_WORK_TYPES.map((w) => (
              <label key={w.value} className={`flex items-center gap-2 text-xs text-gray-700 ${permitLocked ? 'cursor-not-allowed' : ''}`}>
                <input
                  type="checkbox"
                  disabled={permitLocked}
                  checked={value.riskWorkPermit.targetWorks.includes(w.value)}
                  onChange={() => toggleWork(w.value)}
                  className="h-3.5 w-3.5 rounded border-gray-300"
                />
                <span>
                  {w.value} {w.label}
                </span>
              </label>
            ))}
          </div>
        </div>
        <YNRow
          label="작업계획서 작성·확인여부"
          value={value.riskWorkPermit.planConfirmed}
          onChange={(v) => setPermit({ planConfirmed: v })}
          disabled={permitLocked}
        />
      </SubCard>

      {/* 안전보건조정자 활동 */}
      <SubCard title="안전보건조정자 활동" tooltip={TOOLTIPS.coordinatorActivity}>
        {COORDINATOR_ACTIVITY_FIELDS.map((f) => (
          <YNRow
            key={f.key}
            label={f.label}
            period={f.period}
            value={(value.coordinatorActivity as Record<string, YN>)[f.key] ?? ''}
            onChange={(v) => setCoordinator(f.key, v)}
            disabled={f.key !== 'multiDiscipline' && value.coordinatorActivity.multiDiscipline === '부'}
          />
        ))}
      </SubCard>

      {/* 안전관리실태 이행점검회의 */}
      <SubCard title="안전관리실태 이행점검회의" tooltip={TOOLTIPS.implMeeting}>
        <YNRow label="해당여부" value={value.implMeeting.applicable} onChange={(v) => setImplMeeting('applicable', v)} />
        <YNRow
          label="이행여부"
          value={value.implMeeting.implemented}
          onChange={(v) => setImplMeeting('implemented', v)}
          disabled={value.implMeeting.applicable === '부'}
        />
      </SubCard>

      {/* 위험성평가 이행 점검 */}
      <SubCard title="위험성평가 이행 점검" tooltip={TOOLTIPS.riskAssessment}>
        {RISK_ASSESSMENT_FIELDS.map((f) => (
          <YNRow
            key={f.key}
            label={f.label}
            value={(value.riskAssessment as Record<string, YN>)[f.key] ?? ''}
            onChange={(v) => setRisk(f.key, v)}
          />
        ))}
      </SubCard>

      {/* 스마트 안전장비의 운영 */}
      <SubCard title="스마트 안전장비의 운영" tooltip={TOOLTIPS.smartEquipment}>
        <div className="flex items-center justify-between gap-2 border-b border-gray-100 py-1.5">
          <span className="text-xs text-gray-700">도입 여부</span>
          <YNToggle
            value={value.smartEquipment.adopted}
            onChange={(v) =>
              setSmart(
                v === '부'
                  ? { adopted: v, costTotal: '', costIndustrial: '', costSafety: '', adoptedAt: '' }
                  : { adopted: v }
              )
            }
          />
        </div>
        <div className={`grid grid-cols-2 gap-x-3 gap-y-2 pt-2 sm:grid-cols-4 ${smartLocked ? 'opacity-40' : ''}`}>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-gray-500">정산액 합계(천원)</span>
            <input type="text" inputMode="numeric" disabled={smartLocked} value={formatThousands(value.smartEquipment.costTotal)} onChange={(e) => setSmart({ costTotal: stripNonDigits(e.target.value) })} className={`${numInput} ${lockedInput}`} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-gray-500">산업안전보건관리비(천원)</span>
            <input type="text" inputMode="numeric" disabled={smartLocked} value={formatThousands(value.smartEquipment.costIndustrial)} onChange={(e) => setSmart({ costIndustrial: stripNonDigits(e.target.value) })} className={`${numInput} ${lockedInput}`} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-gray-500">안전관리비(천원)</span>
            <input type="text" inputMode="numeric" disabled={smartLocked} value={formatThousands(value.smartEquipment.costSafety)} onChange={(e) => setSmart({ costSafety: stripNonDigits(e.target.value) })} className={`${numInput} ${lockedInput}`} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-gray-500">도입시기(연월)</span>
            <input type="month" disabled={smartLocked} value={value.smartEquipment.adoptedAt} onChange={(e) => setSmart({ adoptedAt: e.target.value })} className={`${numInput} ${lockedInput}`} />
          </label>
        </div>
      </SubCard>
    </div>
  )
}
