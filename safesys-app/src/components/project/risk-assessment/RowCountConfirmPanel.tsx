'use client'

// AI 판정 직후 공종별 행수를 확인·조정하는 패널 (15초 뒤 기본 행수로 자동 생성)

import { ChevronDown, ChevronUp, ListChecks, Sliders, Timer } from 'lucide-react'

export interface RowCountGroup {
  key: string
  label: string
  /** 그 조합에서 로드된 위험요인 수 (행수 상한) */
  total: number
  /** AI가 선별한 수 (기본 행수) */
  selectedCount: number
}

interface RowCountConfirmPanelProps {
  groups: RowCountGroup[]
  counts: Record<string, number>
  adjusting: boolean
  countdown: number
  onAdjust: () => void
  onCountChange: (key: string, value: number) => void
  onImmediate: () => void
  onGenerate: () => void
}

export default function RowCountConfirmPanel({
  groups,
  counts,
  adjusting,
  countdown,
  onAdjust,
  onCountChange,
  onImmediate,
  onGenerate,
}: RowCountConfirmPanelProps) {
  const totalRows = groups.reduce((sum, group) => sum + (counts[group.key] ?? 0), 0)

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-blue-900">
          <ListChecks className="h-4 w-4" />
          AI 판정 완료 — 공종별 행수 확인
        </p>
        {!adjusting && (
          <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-blue-700">
            <Timer className="h-3.5 w-3.5" />{countdown}초 후 자동 생성
          </span>
        )}
      </div>

      <ul className="mt-2 space-y-1">
        {groups.map((group) => {
          const count = counts[group.key] ?? 0
          return (
            <li key={group.key} className="flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-1.5 text-sm">
              <span className="min-w-0 flex-1 truncate text-gray-800">{group.label}</span>
              {adjusting ? (
                <span className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onCountChange(group.key, count - 1)}
                    disabled={count <= 0}
                    className="rounded border border-gray-300 p-1 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                    aria-label={`${group.label} 행수 줄이기`}
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-12 text-center text-sm font-semibold text-gray-900">{count}행</span>
                  <button
                    type="button"
                    onClick={() => onCountChange(group.key, count + 1)}
                    disabled={count >= group.total}
                    className="rounded border border-gray-300 p-1 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                    aria-label={`${group.label} 행수 늘리기`}
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-16 text-right text-xs text-gray-500">/ {group.total}건</span>
                </span>
              ) : (
                <span className="shrink-0 text-sm font-semibold text-blue-800">
                  {count}행
                  <span className="ml-1 text-xs font-normal text-gray-500">/ 로드 {group.total}건</span>
                </span>
              )}
            </li>
          )
        })}
      </ul>

      <p className="mt-2 text-sm text-blue-900">
        {adjusting
          ? <>공종별 행수를 조정한 뒤 생성을 눌러주세요. 합계 <span className="font-semibold">{totalRows}행</span></>
          : <>행수가 적정합니까? 합계 <span className="font-semibold">{totalRows}행</span></>}
      </p>

      <div className="mt-2 flex flex-wrap gap-2">
        {adjusting ? (
          <button
            type="button"
            onClick={onGenerate}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            생성
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={onAdjust}
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300 bg-white px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
            >
              <Sliders className="h-4 w-4" />행수조정
            </button>
            <button
              type="button"
              onClick={onImmediate}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              바로생성
            </button>
          </>
        )}
      </div>
    </div>
  )
}
