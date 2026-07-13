'use client'
// 사업개요 섹션 — projects 자동 채움 값 + 수동 입력 필드(모두 수정 가능)

import type { ReactNode } from 'react'
import type { LegalComplianceFormData } from '../lib/constants'
import {
  DISCIPLINE_OPTIONS,
  PHASE_OPTIONS,
  SAFETY_PLAN_TARGETS,
  TOOLTIPS,
  formatThousands,
  stripNonDigits,
  sumConstructionCost,
} from '../lib/constants'
import InfoTooltip from './InfoTooltip'

type Overview = LegalComplianceFormData['overview']

export default function OverviewSection({
  value,
  onChange,
}: {
  value: Overview
  onChange: (next: Overview) => void
}) {
  const set = <K extends keyof Overview>(k: K, v: Overview[K]) => {
    const next = { ...value, [k]: v }
    // 순공사비·자재대가 바뀌면 총공사비 합계를 자동 계산 (둘 다 비면 기존 예산 자동채움값 유지)
    if (k === 'costNet' || k === 'costMaterial') {
      const total = sumConstructionCost(next.costNet, next.costMaterial)
      if (total !== null) next.costTotal = total
    }
    onChange(next)
  }

  // 컴포넌트가 아닌 함수 호출로 렌더한다 — 매 렌더마다 새 컴포넌트로 인식돼 입력 포커스가 풀리는 문제 방지
  // kind: 'date'=캘린더 선택, 'number'=천단위 콤마 표시(저장값은 숫자만)
  const field = (
    label: string,
    k: keyof Overview,
    opts?: { kind?: 'date' | 'number'; tooltip?: string; readOnly?: boolean }
  ): ReactNode => (
    <label key={k} className="flex flex-col gap-1">
      <span className="flex items-center gap-1 text-xs font-medium text-gray-600">
        {label}
        {opts?.tooltip && <InfoTooltip text={opts.tooltip} />}
      </span>
      <input
        type={opts?.kind === 'date' ? 'date' : 'text'}
        inputMode={opts?.kind === 'number' ? 'numeric' : undefined}
        readOnly={opts?.readOnly}
        value={opts?.kind === 'number' ? formatThousands(value[k] as string) : (value[k] as string)}
        onChange={(e) =>
          set(k, (opts?.kind === 'number' ? stripNonDigits(e.target.value) : e.target.value) as Overview[typeof k])
        }
        className={`rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none ${opts?.readOnly ? 'cursor-not-allowed bg-gray-50 text-gray-600' : ''}`}
      />
    </label>
  )

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 sm:grid-cols-3">
      {field('본부/사업단', 'hq')}
      {field('사업시행자', 'implementer')}
      {field('사업분야', 'sector')}
      {field('세부사업명', 'subProject')}
      {field('지구명', 'districtName')}

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-gray-600">구분</span>
        <select
          value={value.phase}
          onChange={(e) => set('phase', e.target.value as Overview['phase'])}
          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
        >
          {PHASE_OPTIONS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-gray-600">공종</span>
        <select
          value={value.discipline}
          onChange={(e) => set('discipline', e.target.value)}
          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
        >
          {DISCIPLINE_OPTIONS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </label>

      {field('기본조사 실시', 'dateBasicSurvey', { kind: 'date' })}
      {field('설계입찰 공고', 'dateDesignBid', { kind: 'date' })}
      {field('착공(계약서)', 'dateContract', { kind: 'date' })}
      {field('착공(실착공)', 'dateActualStart', { kind: 'date' })}
      {field('준공(예정)', 'dateCompletion', { kind: 'date' })}

      {field('총공사비 합계(백만원, 자동)', 'costTotal', { kind: 'number', readOnly: true })}
      {field('순공사비(백만원)', 'costNet', { kind: 'number' })}
      {field('자재대(백만원)', 'costMaterial', { kind: 'number' })}
      {field('산업안전보건관리비(천원)', 'budgetIndustrial', { kind: 'number', tooltip: TOOLTIPS.budgetIndustrial })}
      {field('건진법 안전관리비(천원)', 'budgetSafety', { kind: 'number', tooltip: TOOLTIPS.budgetSafety })}

      <label className="flex flex-col gap-1">
        <span className="flex items-center gap-1 text-xs font-medium text-gray-600">
          안전관리계획서 대상공종
          <InfoTooltip text={TOOLTIPS.safetyPlanTarget} />
        </span>
        <select
          value={value.safetyPlanTarget}
          onChange={(e) => set('safetyPlanTarget', e.target.value)}
          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
        >
          <option value="">선택</option>
          {SAFETY_PLAN_TARGETS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.value} {t.label}
            </option>
          ))}
          <option value="해당없음">해당없음</option>
        </select>
      </label>
    </div>
  )
}
