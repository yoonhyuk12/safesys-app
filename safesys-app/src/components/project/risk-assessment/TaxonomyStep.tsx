'use client'

// 수시 위험성평가 2단계 — 공사→단위작업→세부단위작업 캐스케이드 선택

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { fetchTaxonomy } from './api'
import { BUSINESS_TYPE_ALL } from './record'

export interface TaxonomySelection {
  construction: string
  unitWork: string
  detailWork: string
}

interface TaxonomyStepProps {
  businessType: string
  selection: TaxonomySelection
  onChange: (selection: TaxonomySelection) => void
}

interface LevelSelectProps {
  label: string
  value: string
  options: string[]
  loading: boolean
  disabled: boolean
  hint: string
  onChange: (value: string) => void
}

function LevelSelect({ label, value, options, loading, disabled, hint, onChange }: LevelSelectProps) {
  return (
    <label className="block">
      <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-800">
        {label}
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />}
      </span>
      <select
        value={value}
        disabled={disabled || loading}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-100 disabled:text-gray-400"
      >
        <option value="">{disabled ? hint : `${label} 선택`}</option>
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
      {!disabled && !loading && options.length === 0 && (
        <span className="mt-1 block text-xs text-amber-700">선택 가능한 {label}이(가) 없습니다.</span>
      )}
    </label>
  )
}

export default function TaxonomyStep({ businessType, selection, onChange }: TaxonomyStepProps) {
  const [constructions, setConstructions] = useState<string[]>([])
  const [unitWorks, setUnitWorks] = useState<string[]>([])
  const [detailWorks, setDetailWorks] = useState<string[]>([])
  const [loadingLevel, setLoadingLevel] = useState<'construction' | 'unitWork' | 'detailWork' | null>(null)
  const [error, setError] = useState('')

  const filterBusinessType = businessType === BUSINESS_TYPE_ALL ? undefined : businessType

  useEffect(() => {
    let cancelled = false
    setLoadingLevel('construction')
    setError('')
    fetchTaxonomy({ businessType: filterBusinessType })
      .then((data) => { if (!cancelled) setConstructions(data) })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : '공사 목록을 불러오지 못했습니다.')
      })
      .finally(() => { if (!cancelled) setLoadingLevel(null) })
    return () => { cancelled = true }
  }, [filterBusinessType])

  useEffect(() => {
    if (!selection.construction) {
      setUnitWorks([])
      return
    }
    let cancelled = false
    setLoadingLevel('unitWork')
    setError('')
    fetchTaxonomy({ businessType: filterBusinessType, construction: selection.construction })
      .then((data) => { if (!cancelled) setUnitWorks(data) })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : '단위작업 목록을 불러오지 못했습니다.')
      })
      .finally(() => { if (!cancelled) setLoadingLevel(null) })
    return () => { cancelled = true }
  }, [filterBusinessType, selection.construction])

  useEffect(() => {
    if (!selection.construction || !selection.unitWork) {
      setDetailWorks([])
      return
    }
    let cancelled = false
    setLoadingLevel('detailWork')
    setError('')
    fetchTaxonomy({
      businessType: filterBusinessType,
      construction: selection.construction,
      unitWork: selection.unitWork,
    })
      .then((data) => { if (!cancelled) setDetailWorks(data) })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : '세부단위작업 목록을 불러오지 못했습니다.')
      })
      .finally(() => { if (!cancelled) setLoadingLevel(null) })
    return () => { cancelled = true }
  }, [filterBusinessType, selection.construction, selection.unitWork])

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        평가 대상 작업을 고르면 해당 세부단위작업의 유해·위험요인을 DB에서 불러옵니다.
        {filterBusinessType
          ? <span className="ml-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">{filterBusinessType}</span>
          : <span className="ml-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">사업 무관(전체)</span>}
      </p>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <LevelSelect
          label="공사"
          value={selection.construction}
          options={constructions}
          loading={loadingLevel === 'construction'}
          disabled={false}
          hint=""
          onChange={(value) => onChange({ construction: value, unitWork: '', detailWork: '' })}
        />
        <LevelSelect
          label="단위작업"
          value={selection.unitWork}
          options={unitWorks}
          loading={loadingLevel === 'unitWork'}
          disabled={!selection.construction}
          hint="공사를 먼저 선택"
          onChange={(value) => onChange({ construction: selection.construction, unitWork: value, detailWork: '' })}
        />
        <LevelSelect
          label="세부단위작업"
          value={selection.detailWork}
          options={detailWorks}
          loading={loadingLevel === 'detailWork'}
          disabled={!selection.unitWork}
          hint="단위작업을 먼저 선택"
          onChange={(value) => onChange({ ...selection, detailWork: value })}
        />
      </div>
    </div>
  )
}
