/** @jsxImportSource react */
'use client'

// 관리자 목록의 데스크톱·모바일 정렬 조작 UI를 제공한다
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import type { SortDirection, SortState } from '@/lib/admin-sort'

type SortOption<K extends string> = { key: K; label: string }

export function SortableHeader<K extends string>({
  label, sortKey, sortState, onSort, className = '',
}: {
  label: string; sortKey: K; sortState: SortState<K>; onSort: (key: K) => void; className?: string
}) {
  const active = sortState.key === sortKey
  const ariaSort = !active ? 'none' : sortState.direction === 'asc' ? 'ascending' : 'descending'
  const directionLabel = !active ? '정렬 안 됨' : sortState.direction === 'asc' ? '오름차순 정렬 중' : '내림차순 정렬 중'
  const Icon = !active ? ArrowUpDown : sortState.direction === 'asc' ? ArrowUp : ArrowDown

  return (
    <th scope="col" aria-sort={ariaSort} className={className}>
      <button type="button" onClick={() => onSort(sortKey)} aria-label={`${label} ${directionLabel}`}
        className="group inline-flex min-h-10 w-full items-center gap-1.5 rounded-lg px-3 py-2 text-left font-semibold text-slate-600 outline-none transition hover:bg-slate-100 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-blue-500">
        <span>{label}</span><Icon className={`h-3.5 w-3.5 ${active ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600'}`} />
      </button>
    </th>
  )
}

export function MobileSortControls<K extends string>({
  options, sortState, onChange,
}: {
  options: readonly SortOption<K>[]; sortState: SortState<K>; onChange: (state: SortState<K>) => void
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_132px] gap-2 md:hidden">
      <label className="grid gap-1 text-xs font-semibold text-slate-600">
        <span>정렬 기준</span>
        <select value={sortState.key ?? ''} onChange={(event) => {
          const key = event.target.value as K
          onChange(key ? { key, direction: sortState.key === key && sortState.direction ? sortState.direction : 'asc' } : { key: null, direction: null })
        }} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100">
          <option value="">기본 순서</option>
          {options.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-xs font-semibold text-slate-600">
        <span>정렬 방향</span>
        <select value={sortState.direction ?? 'asc'} disabled={!sortState.key}
          onChange={(event) => onChange({ key: sortState.key, direction: event.target.value as SortDirection })}
          className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none disabled:bg-slate-100 disabled:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100">
          <option value="asc">오름차순</option><option value="desc">내림차순</option>
        </select>
      </label>
    </div>
  )
}
