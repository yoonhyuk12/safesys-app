'use client'

// 수시 위험성평가 1단계 — 프로젝트명으로 유추한 사업별을 기본 선택으로 보여주고 확인·수정한다

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { fetchTaxonomy } from './api'
import { BUSINESS_TYPE_ALL } from './record'

interface BusinessTypeStepProps {
  projectName: string
  inferred: string | null
  value: string
  onChange: (value: string) => void
}

export default function BusinessTypeStep({ projectName, inferred, value, onChange }: BusinessTypeStepProps) {
  const [options, setOptions] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadOptions = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setOptions(await fetchTaxonomy({}))
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : '사업별 목록을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadOptions()
  }, [loadOptions])

  // 유추값이 16종 목록 밖이면 선택이 비어 보이므로 전체 모드로 되돌린다.
  useEffect(() => {
    if (loading || options.length === 0) return
    if (value !== BUSINESS_TYPE_ALL && !options.includes(value)) onChange(BUSINESS_TYPE_ALL)
  }, [loading, options, value, onChange])

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
        <p className="font-semibold">{projectName}</p>
        <p className="mt-1 text-xs">
          {inferred
            ? <>프로젝트명으로 <span className="font-semibold">{inferred}</span> 사업으로 유추했습니다. 다르면 아래에서 고쳐주세요.</>
            : '프로젝트명으로 사업별을 유추하지 못했습니다. 해당 사업을 고르거나 사업 무관(전체)으로 진행해주세요.'}
        </p>
      </div>

      {error && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <p>{error}</p>
          <button type="button" onClick={loadOptions} className="shrink-0 font-semibold underline">다시 조회</button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />사업별 목록을 불러오는 중입니다.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          <button
            type="button"
            onClick={() => onChange(BUSINESS_TYPE_ALL)}
            className={`rounded-lg border px-3 py-2 text-left text-sm font-medium ${
              value === BUSINESS_TYPE_ALL
                ? 'border-blue-500 bg-blue-50 text-blue-800'
                : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300'
            }`}
          >
            사업 무관(전체)
          </button>
          {options.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onChange(option)}
              className={`flex items-center justify-between gap-1 rounded-lg border px-3 py-2 text-left text-sm font-medium ${
                value === option
                  ? 'border-blue-500 bg-blue-50 text-blue-800'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300'
              }`}
            >
              <span className="min-w-0 truncate">{option}</span>
              {option === inferred && <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
            </button>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-500">
        확정한 사업별은 프로젝트에 기억되어 다음 평가서에서 기본값으로 쓰입니다.
      </p>
    </div>
  )
}
