'use client'
// 관리자 프로젝트의 월별 등록 건수를 막대 차트로 보여주는 컴포넌트

import { useMemo, useState } from 'react'
import {
  buildMonthlyProjectCounts,
  sortMonthlyCounts,
  type MonthlySortMode,
} from '@/lib/admin-project-monthly'

interface MonthlyProjectChartProps {
  createdAts: readonly string[]
  loading: boolean
}

const SORT_OPTIONS: readonly { mode: MonthlySortMode; label: string }[] = [
  { mode: 'month', label: '월순' },
  { mode: 'count', label: '건수순' },
]

/** 'YYYY-MM' 값을 '2026년 1월' 형태로 바꾼다 */
function describeMonth(month: string): string {
  const [year, monthPart] = month.split('-')
  return `${Number(year)}년 ${Number(monthPart)}월`
}

/** 가로 스크롤 영역 밖으로 툴팁이 잘리지 않도록 양끝 막대에서는 안쪽으로 붙인다 */
function tooltipAlignClass(index: number, total: number): string {
  if (index <= 2) return 'left-0'
  if (index >= total - 3) return 'right-0'
  return 'left-1/2 -translate-x-1/2'
}

export function MonthlyProjectChart({ createdAts, loading }: MonthlyProjectChartProps) {
  const monthlyCounts = useMemo(() => buildMonthlyProjectCounts(createdAts), [createdAts])
  const [sortMode, setSortMode] = useState<MonthlySortMode>('month')
  const sortedCounts = useMemo(() => sortMonthlyCounts(monthlyCounts, sortMode), [monthlyCounts, sortMode])

  const totalCount = monthlyCounts.reduce((sum, row) => sum + row.count, 0)
  const maxCount = monthlyCounts.reduce((max, row) => Math.max(max, row.count), 0)

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-slate-500">월별 등록 현황</h3>
        <div className="inline-flex rounded-xl border border-slate-200 p-0.5">
          {SORT_OPTIONS.map((option) => {
            const active = sortMode === option.mode
            return (
              <button
                key={option.mode}
                type="button"
                onClick={() => setSortMode(option.mode)}
                aria-pressed={active}
                className={`min-h-9 rounded-lg px-3 text-xs font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  active ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-slate-950'
                }`}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      </div>

      {loading ? (
        <div className="mt-3 h-40 animate-pulse rounded-xl bg-slate-100" />
      ) : sortedCounts.length === 0 ? (
        <p className="mt-2 text-xs text-slate-400">등록 이력이 없습니다.</p>
      ) : (
        <div className="mt-3 overflow-x-auto pb-1 pt-10">
          <div className="min-w-[560px]">
            <div className="flex h-32 items-end gap-1.5">
              {sortedCounts.map((row, index) => {
                const share = totalCount === 0 ? '0.0' : ((row.count / totalCount) * 100).toFixed(1)
                const barHeight = row.count === 0 || maxCount === 0 ? '2px' : `${(row.count / maxCount) * 100}%`
                return (
                  <div key={row.month} className="group relative flex h-full flex-1 flex-col items-center justify-end">
                    <span
                      className={`pointer-events-none absolute bottom-full z-10 mb-3 hidden whitespace-nowrap rounded-lg bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white shadow-lg group-hover:block ${tooltipAlignClass(index, sortedCounts.length)}`}
                    >
                      {describeMonth(row.month)} · {row.count.toLocaleString('ko-KR')}건 ({share}%)
                    </span>
                    <span className="sr-only">{describeMonth(row.month)} {row.count.toLocaleString('ko-KR')}건</span>
                    <span aria-hidden="true" className="mb-1 text-[10px] font-semibold tabular-nums text-slate-400 group-hover:text-slate-700">
                      {row.count.toLocaleString('ko-KR')}
                    </span>
                    <div className="w-full rounded-t-[4px] bg-blue-500 group-hover:bg-blue-600" style={{ height: barHeight }} />
                  </div>
                )
              })}
            </div>
            <div className="border-t border-slate-100" />
            <div aria-hidden="true" className="mt-1.5 flex gap-1.5 text-[10px] tabular-nums text-slate-400">
              {sortedCounts.map((row) => (
                <span key={row.month} className="flex-1 whitespace-nowrap text-center">{row.label}</span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
